# SupaShield

[![npm version](https://img.shields.io/npm/v/supashield)](https://www.npmjs.com/package/supashield) [![Node](https://img.shields.io/node/v/supashield)](https://nodejs.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Website](https://img.shields.io/badge/website-supashield.app-green)](https://supashield.app/)

🔗 **[Visit the website](https://supashield.app/)** for full documentation and examples.

Catch Supabase RLS security vulnerabilities before they reach production.

## Features
- Security vulnerability detection
- Smart schema discovery  
- RLS policy testing (tables + storage buckets)
- Real user context testing
- CI/CD ready
- Zero configuration

## Installation
```bash
npm install -g supashield
```

## Setup
Set your Supabase database URL:
```bash
export SUPASHIELD_DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
```

Get this from: **Supabase Dashboard → Settings → Database → Connection string → Session pooler**

**Important:** Use the **Session pooler** connection string (port 6543), not the Direct connection. Session pooler is IPv4 compatible and works everywhere.

**Note:** `DATABASE_URL` is also supported for backwards compatibility.

## Quick Start
```bash
supashield audit                       # scan for common RLS security issues
supashield init                        # discover tables and storage buckets
supashield test                        # test all table RLS policies
supashield test-storage                # test storage bucket RLS policies
supashield test --table public.users   # test specific table
supashield test --as-user admin@company.com  # test with real user
supashield users                       # list users from auth.users for testing
supashield export-pgtap -o tests.sql   # export tests to pgTap format
```

### Example Output
Testing public.users:
  anonymous_user:
    SELECT: ALLOW (expected DENY) - MISMATCH
    INSERT: DENY (expected DENY) - PASS
  authenticated_user:
    SELECT: ALLOW (expected ALLOW) - PASS
    INSERT: DENY (expected ALLOW) - MISMATCH

Results: 2 passed, 2 failed
2 policy mismatches detected
```

## Configuration (`.supashield/policy.yaml`)
```yaml
tables:
  public.users:
    test_scenarios:
      - name: anonymous_user
        jwt_claims: {}
        expected: { SELECT: DENY, INSERT: DENY, UPDATE: DENY, DELETE: DENY }
      - name: authenticated_user
        jwt_claims: { sub: "user-123", role: "authenticated" }
        expected: { SELECT: ALLOW, INSERT: ALLOW, UPDATE: ALLOW, DELETE: ALLOW }

storage_buckets:
  avatars:
    test_scenarios:
      - name: anonymous_user
        jwt_claims: {}
        expected: { SELECT: DENY, INSERT: DENY, UPDATE: DENY, DELETE: DENY }
      - name: authenticated_user
        jwt_claims: { sub: "user-123", role: "authenticated" }
        expected: { SELECT: ALLOW, INSERT: ALLOW, UPDATE: ALLOW, DELETE: ALLOW }
```

## Why SupaShield?

**RLS Testing is Hard**
- Manual testing doesn't scale
- Complex permission logic is error-prone
- Security bugs are expensive to fix in production

**SupaShield Makes it Easy**
- Automatically discovers your schema
- Tests all CRUD operations for each role
- Validates real user permissions
- Integrates with your CI/CD pipeline

## CI/CD Integration
```yaml
- run: supashield test
  env:
    SUPASHIELD_DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

## Safety
- All operations use transactions and rollbacks
- No data is ever persisted during testing
- Works safely with production databases

## Feature Requests

Got an idea? [Open an issue](https://github.com/Rodrigotari1/supashield/issues/new) or ping me on [X/Twitter](https://x.com/rodrigotari_).

## Disclaimer
This tool tests RLS policies using safe, rolled-back transactions. Always test on staging/local environments first. Use at your own risk. Not liable for data loss.

## License
MIT
