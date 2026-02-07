import { Command } from 'commander';
import type { Pool, PoolClient } from 'pg';
import { withDatabaseConnection } from '../shared/command-utils.js';

export const auditCommand = new Command('audit')
  .description('Audit database for common RLS security vulnerabilities')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--all-schemas', 'Include system tables (auth, storage, etc.)')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    await withDatabaseConnection(options, async ({ pool, logger }) => {
      logger.start('Running security audit...');
      const issues = await runSecurityAudit(pool, options.allSchemas || false);
      logger.succeed('Security audit complete.');

      displayAuditResults(issues);
      
      if (issues.totalIssues > 0) {
        process.exit(1);
      }
    });
  });

interface SecurityIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  table: string;
  description: string;
  remediation: string;
}

interface AuditResults {
  rlsDisabled: SecurityIssue[];
  noPolices: SecurityIssue[];
  publicTables: SecurityIssue[];
  unsafeDefaultGrants: SecurityIssue[];
  sensitiveColumnGrants: SecurityIssue[];
  totalIssues: number;
}

async function runSecurityAudit(pool: Pool, includeSystemSchemas: boolean): Promise<AuditResults> {
  const issues: AuditResults = {
    rlsDisabled: [],
    noPolices: [],
    publicTables: [],
    unsafeDefaultGrants: [],
    sensitiveColumnGrants: [],
    totalIssues: 0,
  };

  const client = await pool.connect();

  try {
    const tables = await fetchAllTables(client, includeSystemSchemas);

    await checkForDisabledRls(client, tables, issues);
    await checkForMissingPolicies(client, tables, issues);
    await checkForUnsafeGrants(client, tables, issues);
    await checkSensitiveColumnGrants(client, issues);
    await checkStorageBucketSecurity(client, tables, issues);

    issues.totalIssues = calculateTotalIssues(issues);

  } finally {
    client.release();
  }

  return issues;
}

async function fetchAllTables(client: PoolClient, includeSystemSchemas: boolean)
{
  const schemaCondition = includeSystemSchemas 
    ? "nsp.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')"
    : "nsp.nspname = 'public'";

  const { rows } = await client.query(`
    SELECT 
      nsp.nspname as schema,
      cls.relname as table_name,
      cls.relrowsecurity as rls_enabled,
      cls.relforcerowsecurity as rls_forced
    FROM pg_class cls
    JOIN pg_namespace nsp ON cls.relnamespace = nsp.oid
    WHERE cls.relkind = 'r'
      AND ${schemaCondition}
    ORDER BY nsp.nspname, cls.relname;
  `);

  return rows;
}

async function checkForDisabledRls(
  client: PoolClient, 
  tables: Array<{schema: string, table_name: string, rls_enabled: boolean}>, 
  issues: AuditResults
) {
  for (const table of tables) {
    if (!table.rls_enabled) {
      const fullTableName = `${table.schema}.${table.table_name}`;
      issues.rlsDisabled.push({
        severity: 'CRITICAL',
        category: 'RLS_DISABLED',
        table: fullTableName,
        description: 'Row Level Security is DISABLED - ALL data is exposed to anon/authenticated roles',
        remediation: `ALTER TABLE ${fullTableName} ENABLE ROW LEVEL SECURITY;`
      });
    }
  }
}

async function checkForMissingPolicies(
  client: PoolClient, 
  tables: Array<{schema: string, table_name: string, rls_enabled: boolean, rls_forced?: boolean}>, 
  issues: AuditResults
) {
  for (const table of tables) {
    if (!table.rls_enabled) continue;

    const fullTableName = `${table.schema}.${table.table_name}`;
    const { rows: [{ policy_count }] } = await client.query(`
      SELECT COUNT(*) as policy_count
      FROM pg_policy pol
      JOIN pg_class cls ON pol.polrelid = cls.oid
      JOIN pg_namespace nsp ON cls.relnamespace = nsp.oid
      WHERE nsp.nspname = $1 AND cls.relname = $2;
    `, [table.schema, table.table_name]);

    if (policy_count === '0' && !table.rls_forced) {
      issues.noPolices.push({
        severity: 'CRITICAL',
        category: 'NO_POLICIES',
        table: fullTableName,
        description: 'RLS enabled but NO POLICIES defined - table is inaccessible or implicitly denies all',
        remediation: `Create policies for ${fullTableName} or use FORCE ROW LEVEL SECURITY to block superuser bypass`
      });
    }
  }
}

async function checkForUnsafeGrants(
  client: PoolClient, 
  tables: Array<{schema: string, table_name: string, rls_enabled: boolean}>, 
  issues: AuditResults
) {
  const { rows: grants } = await client.query(`
    SELECT DISTINCT
      p.table_schema as schema,
      p.table_name,
      p.grantee,
      p.privilege_type
    FROM information_schema.role_table_grants p
    WHERE p.grantee IN ('anon', 'authenticated', 'public')
      AND p.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      AND p.table_schema = 'public'
    ORDER BY p.table_schema, p.table_name;
  `);

  for (const grant of grants) {
    const tableWithoutRls = tables.find(t => 
      t.schema === grant.schema && t.table_name === grant.table_name && !t.rls_enabled
    );

    if (tableWithoutRls) {
      const fullTableName = `${grant.schema}.${grant.table_name}`;
      issues.unsafeDefaultGrants.push({
        severity: 'CRITICAL',
        category: 'UNSAFE_GRANT',
        table: fullTableName,
        description: `Role '${grant.grantee}' has ${grant.privilege_type} grant WITHOUT RLS protection`,
        remediation: `REVOKE ${grant.privilege_type} ON ${fullTableName} FROM ${grant.grantee}; -- Then enable RLS and create policies`
      });
    }
  }
}

async function checkSensitiveColumnGrants(
  client: PoolClient,
  issues: AuditResults
) {
  const { SENSITIVE_COLUMN_PATTERNS } = await import('../shared/constants.js');

  const { rows: columnGrants } = await client.query(`
    SELECT
      table_schema,
      table_name,
      column_name,
      grantee,
      privilege_type
    FROM information_schema.column_privileges
    WHERE grantee IN ('anon', 'authenticated', 'public')
      AND table_schema = 'public'
    ORDER BY table_schema, table_name, column_name;
  `);

  for (const grant of columnGrants) {
    const matchedPattern = findMatchingSensitivePattern(
      grant.column_name,
      SENSITIVE_COLUMN_PATTERNS
    );

    if (matchedPattern) {
      const fullColumnName = `${grant.table_schema}.${grant.table_name}.${grant.column_name}`;
      issues.sensitiveColumnGrants.push({
        severity: 'HIGH',
        category: 'SENSITIVE_COLUMN_EXPOSED',
        table: fullColumnName,
        description: `Column matching sensitive pattern '${matchedPattern}' is accessible to '${grant.grantee}'`,
        remediation: `REVOKE ${grant.privilege_type} (${grant.column_name}) ON ${grant.table_schema}.${grant.table_name} FROM ${grant.grantee};`
      });
    }
  }
}

function findMatchingSensitivePattern(
  columnName: string,
  patterns: readonly RegExp[]
): string | null {
  for (const pattern of patterns) {
    if (pattern.test(columnName)) {
      return pattern.source.replace(/\//gi, '').replace(/\\i/gi, '');
    }
  }
  return null;
}

async function checkStorageBucketSecurity(
  client: PoolClient,
  tables: Array<{schema: string, table_name: string, rls_enabled: boolean}>,
  issues: AuditResults
) {
  try {
    const { rows: buckets } = await client.query(`
      SELECT id, name, public FROM storage.buckets;
    `);
    
    for (const bucket of buckets) {
      if (bucket.public) {
        issues.publicTables.push({
          severity: 'HIGH',
          category: 'PUBLIC_BUCKET',
          table: `storage.buckets.${bucket.name}`,
          description: `Storage bucket '${bucket.name}' is PUBLIC - files accessible without authentication`,
          remediation: `UPDATE storage.buckets SET public = false WHERE name = '${bucket.name}'; -- Then add RLS policies to storage.objects`
        });
      }
    }

    const storageObjectsRls = tables.find(t => 
      t.schema === 'storage' && t.table_name === 'objects'
    );
    
    if (storageObjectsRls && !storageObjectsRls.rls_enabled) {
      issues.rlsDisabled.push({
        severity: 'CRITICAL',
        category: 'RLS_DISABLED',
        table: 'storage.objects',
        description: 'Storage objects table has RLS DISABLED - ALL files exposed',
        remediation: 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; -- Then create bucket-specific policies'
      });
    }
  } catch (error) {
    // Storage schema might not exist, skip
  }
}

function calculateTotalIssues(issues: AuditResults): number {
  return issues.rlsDisabled.length +
         issues.noPolices.length +
         issues.publicTables.length +
         issues.unsafeDefaultGrants.length +
         issues.sensitiveColumnGrants.length;
}

function displayAuditResults(issues: AuditResults): void {
  console.log('\nSecurity Audit Results:');

  if (issues.totalIssues === 0) {
    console.log('  No security issues found\n');
    return;
  }

  console.log(`  Found ${issues.totalIssues} issue(s)\n`);

  // Display CRITICAL issues first
  if (issues.rlsDisabled.length > 0) {
    console.log('CRITICAL: Tables with RLS DISABLED');
    issues.rlsDisabled.forEach(issue => {
      console.log(`  Table: ${issue.table}`);
      console.log(`  Issue: ${issue.description}`);
      console.log(`  Fix:   ${issue.remediation}`);
      console.log('');
    });
  }

  if (issues.noPolices.length > 0) {
    console.log('CRITICAL: Tables with RLS enabled but NO POLICIES');
    issues.noPolices.forEach(issue => {
      console.log(`  Table: ${issue.table}`);
      console.log(`  Issue: ${issue.description}`);
      console.log(`  Fix:   ${issue.remediation}`);
      console.log('');
    });
  }

  if (issues.unsafeDefaultGrants.length > 0) {
    console.log('CRITICAL: Unsafe grants without RLS protection');
    issues.unsafeDefaultGrants.forEach(issue => {
      console.log(`  Table: ${issue.table}`);
      console.log(`  Issue: ${issue.description}`);
      console.log(`  Fix:   ${issue.remediation}`);
      console.log('');
    });
  }

  if (issues.publicTables.length > 0) {
    console.log('HIGH: Public storage buckets');
    issues.publicTables.forEach(issue => {
      console.log(`  Bucket: ${issue.table}`);
      console.log(`  Issue:  ${issue.description}`);
      console.log(`  Fix:    ${issue.remediation}`);
      console.log('');
    });
  }

  if (issues.sensitiveColumnGrants.length > 0) {
    console.log('HIGH: Sensitive column exposed');
    issues.sensitiveColumnGrants.forEach(issue => {
      console.log(`  Column: ${issue.table}`);
      console.log(`  Issue:  ${issue.description}`);
      console.log(`  Fix:    ${issue.remediation}`);
      console.log('');
    });
  }

  console.log('Run `supashield test` to verify your RLS policies\n');
}

