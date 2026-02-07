import type { PoolClient } from 'pg';

export type LintSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface PolicyLintData {
  schema: string;
  table: string;
  policy_name: string;
  command: string;
  using_expression: string | null;
  with_check_expression: string | null;
  roles: string[];
}

export interface LintIssue {
  severity: LintSeverity;
  check_id: string;
  policy: string;
  issue: string;
  expression?: string;
  fix: string;
}

export interface LintResults {
  issues: LintIssue[];
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
}

const LINT_CHECKS = [
  {
    id: 'ALWAYS_TRUE_USING',
    severity: 'CRITICAL' as LintSeverity,
    check: (policy: PolicyLintData): LintIssue | null => {
      const expr = policy.using_expression?.trim();
      if (expr === 'true' || expr === '(true)') {
        return {
          severity: 'CRITICAL',
          check_id: 'ALWAYS_TRUE_USING',
          policy: `${policy.schema}.${policy.table}.${policy.policy_name}`,
          issue: "USING expression is literally 'true' - allows unrestricted access",
          expression: policy.using_expression || undefined,
          fix: 'Add proper row filtering, e.g., USING (auth.uid() = user_id)'
        };
      }
      return null;
    }
  },
  {
    id: 'ALWAYS_TRUE_WITH_CHECK',
    severity: 'CRITICAL' as LintSeverity,
    check: (policy: PolicyLintData): LintIssue | null => {
      const expr = policy.with_check_expression?.trim();
      if (expr === 'true' || expr === '(true)') {
        return {
          severity: 'CRITICAL',
          check_id: 'ALWAYS_TRUE_WITH_CHECK',
          policy: `${policy.schema}.${policy.table}.${policy.policy_name}`,
          issue: "WITH CHECK expression is literally 'true' - allows unrestricted modifications",
          expression: policy.with_check_expression || undefined,
          fix: 'Add proper row filtering, e.g., WITH CHECK (auth.uid() = user_id)'
        };
      }
      return null;
    }
  },
  {
    id: 'NO_AUTH_UID_CHECK',
    severity: 'HIGH' as LintSeverity,
    check: (policy: PolicyLintData): LintIssue | null => {
      if (policy.command !== 'SELECT') return null;
      const expr = policy.using_expression || '';
      if (!expr.includes('auth.uid()') && expr !== 'true' && expr !== '(true)') {
        return {
          severity: 'HIGH',
          check_id: 'NO_AUTH_UID_CHECK',
          policy: `${policy.schema}.${policy.table}.${policy.policy_name}`,
          issue: "SELECT policy doesn't verify user identity",
          expression: policy.using_expression || undefined,
          fix: 'Consider adding auth.uid() check if this table contains user data'
        };
      }
      return null;
    }
  },
  {
    id: 'PERMISSIVE_FOR_ALL',
    severity: 'MEDIUM' as LintSeverity,
    check: (policy: PolicyLintData): LintIssue | null => {
      if (policy.roles.includes('{0}') || policy.roles.includes('0')) {
        return {
          severity: 'MEDIUM',
          check_id: 'PERMISSIVE_FOR_ALL',
          policy: `${policy.schema}.${policy.table}.${policy.policy_name}`,
          issue: 'Policy applies to all roles (polroles = {0})',
          fix: 'Consider restricting to specific roles like anon, authenticated'
        };
      }
      return null;
    }
  },
  {
    id: 'MISSING_WITH_CHECK',
    severity: 'MEDIUM' as LintSeverity,
    check: (policy: PolicyLintData): LintIssue | null => {
      const hasUsing = policy.using_expression != null;
      const hasWithCheck = policy.with_check_expression != null;
      const isInsertOrUpdate = policy.command === 'INSERT' || policy.command === 'UPDATE';

      if (isInsertOrUpdate && hasUsing && !hasWithCheck) {
        return {
          severity: 'MEDIUM',
          check_id: 'MISSING_WITH_CHECK',
          policy: `${policy.schema}.${policy.table}.${policy.policy_name}`,
          issue: 'INSERT/UPDATE policy has USING but no WITH CHECK',
          fix: 'Add WITH CHECK expression to validate modifications'
        };
      }
      return null;
    }
  }
] as const;

export async function lintPolicies(
  client: PoolClient,
  includeSystemSchemas: boolean
): Promise<LintResults> {
  const policies = await fetchPoliciesForLinting(client, includeSystemSchemas);
  const issues: LintIssue[] = [];

  for (const policy of policies) {
    for (const lintCheck of LINT_CHECKS) {
      const issue = lintCheck.check(policy);
      if (issue) {
        issues.push(issue);
      }
    }
  }

  return categorizeIssues(issues);
}

async function fetchPoliciesForLinting(
  client: PoolClient,
  includeSystemSchemas: boolean
): Promise<PolicyLintData[]> {
  const schemaCondition = includeSystemSchemas
    ? "nsp.nspname NOT IN ('pg_catalog', 'information_schema')"
    : "nsp.nspname = 'public'";

  const { rows } = await client.query<PolicyLintData>(`
    SELECT
      nsp.nspname as schema,
      cls.relname as table,
      pol.polname as policy_name,
      CASE pol.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
      END as command,
      pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
      pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expression,
      ARRAY(
        SELECT CASE WHEN r.oid = 0 THEN 'PUBLIC' ELSE r.rolname END
        FROM unnest(pol.polroles) AS pr(oid)
        LEFT JOIN pg_roles r ON r.oid = pr.oid
      ) as roles
    FROM pg_policy pol
    JOIN pg_class cls ON pol.polrelid = cls.oid
    JOIN pg_namespace nsp ON cls.relnamespace = nsp.oid
    WHERE ${schemaCondition}
    ORDER BY nsp.nspname, cls.relname, pol.polname;
  `);

  return rows;
}

function categorizeIssues(issues: LintIssue[]): LintResults {
  const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
  const highCount = issues.filter(i => i.severity === 'HIGH').length;
  const mediumCount = issues.filter(i => i.severity === 'MEDIUM').length;

  return {
    issues,
    totalIssues: issues.length,
    criticalCount,
    highCount,
    mediumCount
  };
}
