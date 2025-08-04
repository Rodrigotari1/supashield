# SupaGuard

[![npm version](https://img.shields.io/npm/v/supaguard)](https://www.npmjs.com/package/supaguard) [![Node](https://img.shields.io/node/v/supaguard)](https://nodejs.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Test your Supabase RLS policies before they break in production.

## Features
- Scans RLS tables and auto-generates tests
- Probes SELECT / INSERT / UPDATE / DELETE for each role
- Detects leaks (DENY → ALLOW) and regressions
- JSON output + non-zero exit codes for CI

## Requirements
- Node 18+
- PostgreSQL 13+ (Supabase uses 14)

## Installation
```bash
npm install -g supaguard
```

## Quick Start
1. Create a test role (see below)
2. `export DATABASE_URL=postgresql://supaguard_tester:password@db.supabase.co/postgres`
3. `supaguard init` — generates `.supasec/policy.yaml`
4. `supaguard test`

## Usage
### Commands
```bash
supaguard init             # scaffold tests
supaguard test             # run all tables
supaguard test --table public.users  # one table
supaguard snapshot         # save baseline
supaguard diff             # compare to baseline
```

### Example Output
```
🔍 Testing public.users:
  👤 anonymous_user:
    ❌ SELECT: ALLOW (expected DENY) - MISMATCH!
    ✅ INSERT: DENY (expected DENY)
  👤 authenticated_user:
    ✅ SELECT: ALLOW (expected ALLOW)
    ❌ INSERT: DENY (expected ALLOW) - MISMATCH!

📊 Results: 2 passed, 2 failed
⚠️ 2 policy mismatches detected!
```

## Configuration (`.supasec/policy.yaml`)
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
```

## CI
```yaml
- run: supaguard test --json
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```
Fails the job if any test fails or a leak is detected.

## Safety
- Rejects superuser / dangerous roles
- All probes in rolled-back transactions — no data persists

## License
MIT
