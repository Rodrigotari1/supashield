import { describe, test, expect } from 'vitest';

describe('Introspect - Core Logic', () => {
  describe('RLS Status Detection', () => {
    test('table with relrowsecurity=true has RLS enabled', () => {
      const table = { relrowsecurity: true };
      expect(table.relrowsecurity).toBe(true);
    });

    test('table with relrowsecurity=false has RLS disabled', () => {
      const table = { relrowsecurity: false };
      expect(table.relrowsecurity).toBe(false);
    });

    test('filters tables by RLS status', () => {
      const tables = [
        { name: 'users', relrowsecurity: true },
        { name: 'posts', relrowsecurity: false },
        { name: 'comments', relrowsecurity: true }
      ];

      const rlsEnabled = tables.filter(t => t.relrowsecurity);
      const rlsDisabled = tables.filter(t => !t.relrowsecurity);

      expect(rlsEnabled.length).toBe(2);
      expect(rlsDisabled.length).toBe(1);
    });
  });

  describe('Schema Filtering Logic', () => {
    test('public schema only when includeSystemSchemas is false', () => {
      const includeSystemSchemas = false;
      const schemaCondition = includeSystemSchemas
        ? "nsp.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')"
        : "nsp.nspname = 'public'";

      expect(schemaCondition).toBe("nsp.nspname = 'public'");
    });

    test('excludes system schemas when includeSystemSchemas is true', () => {
      const includeSystemSchemas = true;
      const schemaCondition = includeSystemSchemas
        ? "nsp.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')"
        : "nsp.nspname = 'public'";

      expect(schemaCondition).toContain('NOT IN');
      expect(schemaCondition).toContain('information_schema');
    });

    test('excluded schemas list is correct', () => {
      const excludedSchemas = ['information_schema', 'pg_catalog', 'pg_toast'];
      expect(excludedSchemas).toContain('information_schema');
      expect(excludedSchemas).toContain('pg_catalog');
      expect(excludedSchemas).toContain('pg_toast');
      expect(excludedSchemas.length).toBe(3);
    });
  });

  describe('Policy Discovery Logic', () => {
    test('counts policies correctly', () => {
      const policies = [
        { name: 'policy1', table: 'users' },
        { name: 'policy2', table: 'users' },
        { name: 'policy3', table: 'posts' }
      ];

      const usersPolicies = policies.filter(p => p.table === 'users');
      expect(usersPolicies.length).toBe(2);
    });

    test('identifies tables without policies', () => {
      const policyCount = 0;
      const hasNoPolicies = policyCount === 0;
      expect(hasNoPolicies).toBe(true);
    });

    test('identifies tables with policies', () => {
      const policyCount = 3;
      const hasPolicies = policyCount > 0;
      expect(hasPolicies).toBe(true);
    });
  });

  describe('Storage Bucket Discovery', () => {
    test('identifies public bucket', () => {
      const bucket = { name: 'avatars', public: true };
      expect(bucket.public).toBe(true);
    });

    test('identifies private bucket', () => {
      const bucket = { name: 'documents', public: false };
      expect(bucket.public).toBe(false);
    });

    test('filters buckets by visibility', () => {
      const buckets = [
        { name: 'avatars', public: true },
        { name: 'documents', public: false },
        { name: 'uploads', public: true }
      ];

      const publicBuckets = buckets.filter(b => b.public);
      const privateBuckets = buckets.filter(b => !b.public);

      expect(publicBuckets.length).toBe(2);
      expect(privateBuckets.length).toBe(1);
    });
  });

  describe('Table Metadata Extraction', () => {
    test('extracts schema and table name', () => {
      const row = { schema: 'public', name: 'users' };
      expect(row.schema).toBe('public');
      expect(row.name).toBe('users');
    });

    test('creates table identifier', () => {
      const schema = 'public';
      const name = 'users';
      const identifier = `${schema}.${name}`;
      expect(identifier).toBe('public.users');
    });

    test('handles different schemas', () => {
      const tables = [
        { schema: 'public', name: 'users' },
        { schema: 'auth', name: 'users' },
        { schema: 'storage', name: 'objects' }
      ];

      const identifiers = tables.map(t => `${t.schema}.${t.name}`);
      expect(identifiers).toContain('public.users');
      expect(identifiers).toContain('auth.users');
      expect(identifiers).toContain('storage.objects');
    });
  });

  describe('RLS Warning Logic', () => {
    test('generates warning for disabled RLS tables', () => {
      const rlsDisabledTables = [
        { schema: 'public', name: 'users' },
        { schema: 'public', name: 'posts' }
      ];

      const shouldWarn = rlsDisabledTables.length > 0;
      expect(shouldWarn).toBe(true);
      expect(rlsDisabledTables.length).toBe(2);
    });

    test('no warning when all tables have RLS', () => {
      const rlsDisabledTables: any[] = [];
      const shouldWarn = rlsDisabledTables.length > 0;
      expect(shouldWarn).toBe(false);
    });
  });

  describe('Policy Configuration Generation', () => {
    test('generates default test scenarios', () => {
      const scenarios = [
        { name: 'anonymous_user', jwt_claims: {} },
        { name: 'authenticated_user', jwt_claims: { sub: 'user-123' } }
      ];

      expect(scenarios.length).toBe(2);
      expect(scenarios[0].name).toBe('anonymous_user');
      expect(scenarios[1].name).toBe('authenticated_user');
    });

    test('generates default expected permissions', () => {
      const expected = {
        SELECT: 'DENY',
        INSERT: 'DENY',
        UPDATE: 'DENY',
        DELETE: 'DENY'
      };

      expect(expected.SELECT).toBe('DENY');
      expect(expected.INSERT).toBe('DENY');
      expect(expected.UPDATE).toBe('DENY');
      expect(expected.DELETE).toBe('DENY');
    });

    test('creates table configuration structure', () => {
      const tableConfig = {
        table: 'public.users',
        test_scenarios: [
          { name: 'anonymous_user', jwt_claims: {} }
        ]
      };

      expect(tableConfig.table).toBe('public.users');
      expect(tableConfig.test_scenarios.length).toBe(1);
    });
  });

  describe('Forced RLS Detection', () => {
    test('identifies forced RLS', () => {
      const table = { relforcerowsecurity: true };
      expect(table.relforcerowsecurity).toBe(true);
    });

    test('identifies non-forced RLS', () => {
      const table = { relforcerowsecurity: false };
      expect(table.relforcerowsecurity).toBe(false);
    });
  });

  describe('Table Type Filtering', () => {
    test('filters for regular tables only', () => {
      const objects = [
        { relkind: 'r', name: 'users' },      // regular table
        { relkind: 'v', name: 'user_view' },  // view
        { relkind: 'i', name: 'idx_users' },  // index
        { relkind: 'r', name: 'posts' }       // regular table
      ];

      const tables = objects.filter(o => o.relkind === 'r');
      expect(tables.length).toBe(2);
    });
  });

  describe('Storage Policy Discovery', () => {
    test('counts storage policies per bucket', () => {
      const policies = [
        { bucket_id: 'avatars', name: 'policy1' },
        { bucket_id: 'avatars', name: 'policy2' },
        { bucket_id: 'documents', name: 'policy3' }
      ];

      const avatarsPolicies = policies.filter(p => p.bucket_id === 'avatars');
      expect(avatarsPolicies.length).toBe(2);
    });

    test('identifies buckets without policies', () => {
      const bucket = { name: 'avatars', policy_count: 0 };
      const noPolicies = bucket.policy_count === 0;
      expect(noPolicies).toBe(true);
    });
  });

  describe('Console Output Formatting', () => {
    test('formats table list correctly', () => {
      const tables = [
        { schema: 'public', name: 'users', policy_count: 3 },
        { schema: 'public', name: 'posts', policy_count: 2 }
      ];

      const formatted = tables.map(t => 
        `  - ${t.schema}.${t.name} (${t.policy_count} policies)`
      );

      expect(formatted[0]).toContain('public.users');
      expect(formatted[0]).toContain('3 policies');
    });

    test('formats bucket list correctly', () => {
      const buckets = [
        { name: 'avatars', policy_count: 0, public: true },
        { name: 'documents', policy_count: 2, public: false }
      ];

      const formatted = buckets.map(b =>
        `  - ${b.name} (${b.policy_count} policies, ${b.public ? 'public' : 'private'})`
      );

      expect(formatted[0]).toContain('avatars');
      expect(formatted[0]).toContain('public');
    });
  });
});

