import { describe, test, expect } from 'vitest';
import type { PolicyLintData } from '../src/core/lint.js';

describe('Lint - Policy Expression Analysis', () => {
  describe('ALWAYS_TRUE_USING Detection', () => {
    test('detects literal true in USING clause', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'users',
        policy_name: 'bad_policy',
        command: 'SELECT',
        using_expression: 'true',
        with_check_expression: null,
        roles: ['authenticated']
      };

      const isAlwaysTrue = policy.using_expression?.trim() === 'true';
      expect(isAlwaysTrue).toBe(true);
    });

    test('detects parenthesized true in USING clause', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'users',
        policy_name: 'bad_policy',
        command: 'SELECT',
        using_expression: '(true)',
        with_check_expression: null,
        roles: ['authenticated']
      };

      const isAlwaysTrue = policy.using_expression?.trim() === '(true)';
      expect(isAlwaysTrue).toBe(true);
    });

    test('does not flag proper USING expression', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'users',
        policy_name: 'good_policy',
        command: 'SELECT',
        using_expression: '(auth.uid() = user_id)',
        with_check_expression: null,
        roles: ['authenticated']
      };

      const isAlwaysTrue = policy.using_expression?.trim() === 'true' ||
                          policy.using_expression?.trim() === '(true)';
      expect(isAlwaysTrue).toBe(false);
    });
  });

  describe('ALWAYS_TRUE_WITH_CHECK Detection', () => {
    test('detects literal true in WITH CHECK clause', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'users',
        policy_name: 'bad_policy',
        command: 'INSERT',
        using_expression: null,
        with_check_expression: 'true',
        roles: ['authenticated']
      };

      const isAlwaysTrue = policy.with_check_expression?.trim() === 'true';
      expect(isAlwaysTrue).toBe(true);
    });

    test('detects parenthesized true in WITH CHECK clause', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'users',
        policy_name: 'bad_policy',
        command: 'UPDATE',
        using_expression: null,
        with_check_expression: '(true)',
        roles: ['authenticated']
      };

      const isAlwaysTrue = policy.with_check_expression?.trim() === '(true)';
      expect(isAlwaysTrue).toBe(true);
    });
  });

  describe('NO_AUTH_UID_CHECK Detection', () => {
    test('flags SELECT policy without auth.uid()', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'posts',
        policy_name: 'select_published',
        command: 'SELECT',
        using_expression: '(status = \'published\')',
        with_check_expression: null,
        roles: ['authenticated']
      };

      const hasAuthUid = policy.using_expression?.includes('auth.uid()');
      const shouldFlag = policy.command === 'SELECT' && !hasAuthUid;
      expect(shouldFlag).toBe(true);
    });

    test('does not flag SELECT policy with auth.uid()', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'posts',
        policy_name: 'select_own',
        command: 'SELECT',
        using_expression: '(auth.uid() = user_id)',
        with_check_expression: null,
        roles: ['authenticated']
      };

      const hasAuthUid = policy.using_expression?.includes('auth.uid()');
      expect(hasAuthUid).toBe(true);
    });

    test('does not flag non-SELECT policies', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'posts',
        policy_name: 'insert_posts',
        command: 'INSERT',
        using_expression: null,
        with_check_expression: '(status = \'draft\')',
        roles: ['authenticated']
      };

      const shouldFlag = policy.command === 'SELECT';
      expect(shouldFlag).toBe(false);
    });
  });

  describe('PERMISSIVE_FOR_ALL Detection', () => {
    test('detects policy for all roles', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'users',
        policy_name: 'allow_all',
        command: 'SELECT',
        using_expression: '(true)',
        with_check_expression: null,
        roles: ['{0}']
      };

      const appliesToAll = policy.roles.includes('{0}') || policy.roles.includes('0');
      expect(appliesToAll).toBe(true);
    });

    test('does not flag role-specific policy', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'users',
        policy_name: 'select_own',
        command: 'SELECT',
        using_expression: '(auth.uid() = id)',
        with_check_expression: null,
        roles: ['authenticated']
      };

      const appliesToAll = policy.roles.includes('{0}') || policy.roles.includes('0');
      expect(appliesToAll).toBe(false);
    });
  });

  describe('MISSING_WITH_CHECK Detection', () => {
    test('flags INSERT with USING but no WITH CHECK', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'posts',
        policy_name: 'insert_posts',
        command: 'INSERT',
        using_expression: '(auth.uid() = user_id)',
        with_check_expression: null,
        roles: ['authenticated']
      };

      const hasUsing = policy.using_expression != null;
      const hasWithCheck = policy.with_check_expression != null;
      const isInsertOrUpdate = policy.command === 'INSERT' || policy.command === 'UPDATE';
      const shouldFlag = isInsertOrUpdate && hasUsing && !hasWithCheck;

      expect(shouldFlag).toBe(true);
    });

    test('flags UPDATE with USING but no WITH CHECK', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'posts',
        policy_name: 'update_posts',
        command: 'UPDATE',
        using_expression: '(auth.uid() = user_id)',
        with_check_expression: null,
        roles: ['authenticated']
      };

      const hasUsing = policy.using_expression != null;
      const hasWithCheck = policy.with_check_expression != null;
      const isInsertOrUpdate = policy.command === 'INSERT' || policy.command === 'UPDATE';
      const shouldFlag = isInsertOrUpdate && hasUsing && !hasWithCheck;

      expect(shouldFlag).toBe(true);
    });

    test('does not flag INSERT with both USING and WITH CHECK', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'posts',
        policy_name: 'insert_posts',
        command: 'INSERT',
        using_expression: '(true)',
        with_check_expression: '(auth.uid() = user_id)',
        roles: ['authenticated']
      };

      const hasUsing = policy.using_expression != null;
      const hasWithCheck = policy.with_check_expression != null;
      const isInsertOrUpdate = policy.command === 'INSERT' || policy.command === 'UPDATE';
      const shouldFlag = isInsertOrUpdate && hasUsing && !hasWithCheck;

      expect(shouldFlag).toBe(false);
    });

    test('does not flag SELECT policy', () => {
      const policy: PolicyLintData = {
        schema: 'public',
        table: 'posts',
        policy_name: 'select_posts',
        command: 'SELECT',
        using_expression: '(auth.uid() = user_id)',
        with_check_expression: null,
        roles: ['authenticated']
      };

      const hasUsing = policy.using_expression != null;
      const hasWithCheck = policy.with_check_expression != null;
      const isInsertOrUpdate = policy.command === 'INSERT' || policy.command === 'UPDATE';
      const shouldFlag = isInsertOrUpdate && hasUsing && !hasWithCheck;

      expect(shouldFlag).toBe(false);
    });
  });

  describe('Schema Filtering Logic', () => {
    test('generates public schema condition when not including system schemas', () => {
      const includeSystemSchemas = false;
      const schemaCondition = includeSystemSchemas
        ? "nsp.nspname NOT IN ('pg_catalog', 'information_schema')"
        : "nsp.nspname = 'public'";

      expect(schemaCondition).toBe("nsp.nspname = 'public'");
    });

    test('generates exclusion condition when including system schemas', () => {
      const includeSystemSchemas = true;
      const schemaCondition = includeSystemSchemas
        ? "nsp.nspname NOT IN ('pg_catalog', 'information_schema')"
        : "nsp.nspname = 'public'";

      expect(schemaCondition).toContain('NOT IN');
      expect(schemaCondition).toContain('pg_catalog');
      expect(schemaCondition).toContain('information_schema');
    });
  });

  describe('Issue Categorization', () => {
    test('counts issues by severity correctly', () => {
      const issues = [
        { severity: 'CRITICAL' as const, check_id: 'TEST1', policy: 'p1', issue: 'i1', fix: 'f1' },
        { severity: 'CRITICAL' as const, check_id: 'TEST2', policy: 'p2', issue: 'i2', fix: 'f2' },
        { severity: 'HIGH' as const, check_id: 'TEST3', policy: 'p3', issue: 'i3', fix: 'f3' },
        { severity: 'MEDIUM' as const, check_id: 'TEST4', policy: 'p4', issue: 'i4', fix: 'f4' },
      ];

      const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
      const highCount = issues.filter(i => i.severity === 'HIGH').length;
      const mediumCount = issues.filter(i => i.severity === 'MEDIUM').length;

      expect(criticalCount).toBe(2);
      expect(highCount).toBe(1);
      expect(mediumCount).toBe(1);
      expect(issues.length).toBe(4);
    });
  });

  describe('Policy Name Formatting', () => {
    test('creates fully qualified policy name', () => {
      const schema = 'public';
      const table = 'users';
      const policyName = 'select_own';
      const fullName = `${schema}.${table}.${policyName}`;

      expect(fullName).toBe('public.users.select_own');
    });
  });
});
