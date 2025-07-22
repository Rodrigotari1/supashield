# Supasec CLI Implementation Prompt

## Context
You are implementing a **zero-footprint CLI tool** called Supasec that detects misconfigured Row-Level-Security (RLS) policies for Supabase/Postgres databases. The tool must be **read-only**, **fail-safe**, and under **1,000 LOC** total.

## Current State
- Basic project structure exists with TypeScript, ESLint, Vitest
- Skeleton files created but core functionality is TODO
- `db.ts` has read-only connection validation implemented
- Missing: schema introspection, policy testing engine, diff logic, CLI commands

## Architecture Overview
```
supasec CLI → Core Library (TS) → .supasec/policy.yaml + cache.json
├── cli.ts (commander routing)
├── init.ts (schema → YAML scaffold)  
├── test.ts (YAML → policy matrix → diff)
└── utils/
    ├── db.ts ✅ (read-only connection)
    ├── introspect.ts ❌ (schema crawler)
    ├── simulate.ts ❌ (SAVEPOINT probe engine)
    ├── diff.ts ❌ (matrix comparison)
    ├── types.ts ❌ (shared interfaces)
    ├── jwt.ts ❌ (test token helpers)
    └── log.ts ❌ (pretty output)
```

## Implementation Tasks (Execute in Order)

### Task 1: Core Types & Interfaces
Create `src/utils/types.ts`:
```typescript
export interface TableMeta {
  schema: string;
  name: string;
  policies: PolicyInfo[];
}

export interface PolicyInfo {
  name: string;
  command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  roles: string[];
  using_expression?: string;
  with_check_expression?: string;
}

export interface PolicyMatrix {
  [tableKey: string]: {
    [operation: string]: 'ALLOW' | 'DENY' | 'ERROR';
  };
}

export interface CacheFile {
  db_hash: string;
  matrix: PolicyMatrix;
  timestamp: string;
}

export interface PolicyConfig {
  tables: {
    [tableKey: string]: {
      test_scenarios: TestScenario[];
    };
  };
}

export interface TestScenario {
  name: string;
  jwt_claims: Record<string, any>;
  expected: {
    SELECT?: 'ALLOW' | 'DENY';
    INSERT?: 'ALLOW' | 'DENY';
    UPDATE?: 'ALLOW' | 'DENY';
    DELETE?: 'ALLOW' | 'DENY';
  };
}
```

### Task 2: Schema Introspection Engine
Implement `src/utils/introspect.ts`:
- Query `pg_catalog.pg_tables` for user tables
- Query `pg_catalog.pg_policies` for RLS policies per table
- Generate schema fingerprint (hash) for change detection
- Return `TableMeta[]` with full policy information

Required functions:
```typescript
export async function introspectSchema(pool: ReadOnlyPool): Promise<TableMeta[]>
export function generateSchemaHash(tables: TableMeta[]): string
```

### Task 3: Policy Simulation Engine
Create `src/utils/simulate.ts`:
- Use `SAVEPOINT` + `ROLLBACK` pattern for safe testing
- Test each CRUD operation with different JWT contexts
- Handle RLS policy evaluation errors gracefully
- Return operation results without persisting changes

Required functions:
```typescript
export async function probeTable(
  pool: ReadOnlyPool,
  table: TableMeta,
  jwtClaims: Record<string, any>
): Promise<Record<string, 'ALLOW' | 'DENY' | 'ERROR'>>
```

### Task 4: Matrix Diff Logic
Complete `src/utils/diff.ts`:
- Compare previous vs current policy matrices
- Flag **newly allowed operations** as security leaks
- Ignore newly denied operations (security improvements)
- Return actionable diff report

Required functions:
```typescript
export function diffMatrix(previous: PolicyMatrix, current: PolicyMatrix): {
  leaks: Array<{ table: string; operation: string; change: string }>;
  improvements: Array<{ table: string; operation: string; change: string }>;
}
```

### Task 5: JWT Helper Utilities
Create `src/utils/jwt.ts`:
- Generate test JWTs for different user roles/scenarios
- Parse JWT claims from policy YAML configuration
- Handle Supabase-specific JWT structure

Required functions:
```typescript
export function generateTestJWT(claims: Record<string, any>): string
export function parseJWTClaims(token: string): Record<string, any>
```

### Task 6: Pretty Logging
Create `src/utils/log.ts`:
- Colorful console output for policy matrices
- Table formatting for diff results
- Progress indicators during testing

Required functions:
```typescript
export function logMatrix(matrix: PolicyMatrix): void
export function logDiff(diff: ReturnType<typeof diffMatrix>): void
export function logProgress(message: string): void
```

### Task 7: Init Command Implementation
Complete `src/init.ts`:
- Connect using `connectReadOnly()`
- Call `introspectSchema()` to discover tables/policies
- Generate `.supasec/policy.yaml` scaffold with test scenarios
- Create directory structure if needed

Expected YAML output format:
```yaml
tables:
  public.users:
    test_scenarios:
      - name: "authenticated_user"
        jwt_claims:
          sub: "user-123"
          role: "authenticated"
        expected:
          SELECT: ALLOW
          UPDATE: DENY
  public.posts:
    test_scenarios:
      - name: "owner_access"
        jwt_claims:
          sub: "user-123"
          role: "authenticated"
        expected:
          SELECT: ALLOW
          INSERT: ALLOW
          UPDATE: ALLOW
          DELETE: ALLOW
```

### Task 8: Test Command Implementation
Complete `src/test.ts`:
- Load `.supasec/policy.yaml` configuration
- Load previous `.supasec/cache.json` if exists
- Run policy probes for each table/scenario combination
- Build current policy matrix
- Compare with cached matrix using `diffMatrix()`
- Exit with code 1 if security leaks detected
- Update cache file with new results

### Task 9: Error Handling & Validation
Add comprehensive error handling:
- Database connection failures
- Missing configuration files
- Invalid JWT tokens
- SQL execution errors during probing
- File system permission issues

### Task 10: Fix Linter Issues
- Add missing `@types/pg` dependency
- Fix TypeScript configuration for vitest.config.ts
- Ensure all imports use `.js` extensions for ESM compatibility
- Add proper error handling for async operations

## Success Criteria
- [ ] `supasec init` creates working policy.yaml from live database
- [ ] `supasec test` runs policy matrix without modifying database
- [ ] Detects newly allowed operations as security leaks
- [ ] Exits with proper codes (0 = safe, 1 = leaks found)
- [ ] All operations use read-only database role
- [ ] Under 1,000 lines of code total
- [ ] Passes linter and type checking
- [ ] Works with both Supabase and vanilla Postgres

## Key Constraints
1. **Read-only**: Never modify database state
2. **Transactional safety**: All probes in `SAVEPOINT...ROLLBACK`
3. **Fail-safe**: Assume DENY if policy evaluation fails
4. **Modular**: Each utility function has single responsibility
5. **Type-safe**: Full TypeScript coverage with proper interfaces

## Implementation Notes
- Use `pg` library for database connections
- Use `yaml` library for configuration parsing
- Use `commander` for CLI argument parsing
- All database operations must be wrapped in transactions
- Cache files use JSON for fast parsing
- YAML files use human-readable format for configuration

Execute these tasks in sequence to build a production-ready Supasec CLI tool. 