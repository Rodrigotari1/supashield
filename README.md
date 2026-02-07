# SupaShield

[![npm version](https://img.shields.io/npm/v/supashield)](https://www.npmjs.com/package/supashield) [![npm downloads](https://img.shields.io/npm/dt/supashield)](https://www.npmjs.com/package/supashield) [![Node](https://img.shields.io/node/v/supashield)](https://nodejs.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Website](https://img.shields.io/badge/website-supashield.app-green)](https://supashield.app/)

🔗 **[Visit the website](https://supashield.app/)** for full documentation and examples.

Catch Supabase RLS security vulnerabilities before they reach production.

## Features
- Security vulnerability detection
- RLS policy static analysis (lint)
- RLS coverage reporting (see what each role can access)
- Policy change detection (snapshot & diff)
- Smart schema discovery  
- RLS policy testing (tables + storage buckets)
- Real user context testing
- Parallel test execution
- JSON output for AI/CI integration
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

Get this from: **Supabase Dashboard → Settings → Database → Connection string → Transaction pooler**

**Important:** Use the **Transaction pooler** connection string (port 6543), not the Direct connection. Transaction pooler is IPv4 compatible and works everywhere.

**Note:** `DATABASE_URL` is also supported for backwards compatibility.

## Quick Start
```bash
supashield audit                       # scan for common RLS security issues
supashield lint                        # static analysis of policy expressions
supashield coverage                    # generate RLS coverage report
supashield init                        # discover tables and storage buckets
supashield test                        # test all table RLS policies
supashield test --json                 # output as JSON (for AI/CI)
supashield test --quiet                # only show failures
supashield test --parallel 8           # run 8 tests in parallel (default: 4)
supashield test-storage                # test storage bucket RLS policies
supashield test --table public.users   # test specific table
supashield test --as-user admin@company.com  # test with real user
supashield snapshot                    # save current RLS policy state
supashield diff                        # compare current state vs snapshot
supashield users                       # list users from auth.users for testing
supashield export-pgtap -o tests.sql   # export tests to pgTap format
```

### Example Output
```
INSECURE - 1 critical issue(s) found

CRITICAL ISSUES (potential data leaks):
  public.payments: anonymous_user can SELECT
    Anonymous users can access this data - missing RLS policy
    FIX: CREATE POLICY "payments_deny_anon_select" ON public.payments FOR SELECT TO anon USING (false);

Tests: 43 passed, 2 failed, 0 skipped (1234ms)
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

## AI-Assisted Development

If you're coding with AI (Cursor, Claude Code, etc.), use `--json` output:

```bash
supashield test --json
```

The structured output lets your AI understand exactly what's wrong and suggest fixes.

## Safety
- All operations use transactions and rollbacks
- No data is ever persisted during testing

## Feature Requests

Got an idea? [Open an issue](https://github.com/Rodrigotari1/supashield/issues/new) or ping me on [X/Twitter](https://x.com/rodrigotari_).

## Disclaimer
This tool tests RLS policies using safe, rolled-back transactions. Always test on staging/local environments first. Use at your own risk. Not liable for data loss.

## License
MIT
