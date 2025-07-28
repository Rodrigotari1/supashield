# Supasec - Supabase RLS Policy Tester

Supasec is a command-line tool designed to give you confidence in your Supabase Row Level Security (RLS) policies. It helps you catch security vulnerabilities before they make it to production by allowing you to write simple, declarative tests for your RLS policies.

Supasec connects directly to your database to run a series of probes against your tables, testing how your RLS policies respond to different user roles and JWT claims. It can be used both for local development and in your CI/CD pipeline to prevent security regressions.

## Key Features

-   **Declarative Testing**: Define your security expectations in a simple `policy.yaml` file. No complex test code required.
-   **Automated Introspection**: The `init` command automatically discovers your tables and RLS policies, giving you a head start on writing your tests.
-   **Snapshot Testing**: Take a "golden record" snapshot of your security policies and use the `diff` command to detect any unexpected changes or potential security leaks.
-   **CI/CD Integration**: Use the `--json` flag to get machine-readable output that you can use to automate security checks in your deployment pipeline.
-   **Watch Mode**: Get instant feedback as you develop with the `test --watch` command that automatically re-runs your tests on changes.

## Getting Started

### 1. Create a Dedicated Tester Role

For security, you should always run Supasec with a dedicated, non-superuser role. This role needs to have `SELECT`, `INSERT`, `UPDATE`, and `DELETE` permissions on the tables you want to test, but it should not have any other privileges.

You can use the following SQL script to create a `supaguard_tester` role with the correct permissions.

```sql
-- Create a new role for testing
CREATE ROLE supaguard_tester LOGIN PASSWORD 'your-secure-password';

-- Grant connect permissions
GRANT CONNECT ON DATABASE postgres TO supaguard_tester;

-- Grant usage on the schemas you want to test
GRANT USAGE ON SCHEMA public, auth TO supaguard_tester;

-- Grant the minimum required permissions on the tables you want to test
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO supaguard_tester;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO supaguard_tester;
```

### 2. Install Supasec

You can install Supasec globally using npm:

```bash
npm install -g supasec
```

### 3. Initialize Your Policy File

Once you have the tool installed, you need to create a `DATABASE_URL` environment variable with the connection string for your new `supaguard_tester` role. Then, you can run the `init` command.

```bash
export DATABASE_URL="postgresql://supaguard_tester:your-secure-password@db.project-ref.supabase.co:5432/postgres"
supasec init
```

This will create a `.supasec/policy.yaml` file with a default set of test scenarios for all of the tables it finds with RLS enabled.

## Core Commands

### `init`

The `init` command introspects your database to find all of the tables with RLS enabled. It then generates a `.supasec/policy.yaml` file with a default set of tests for "anonymous" and "authenticated" users.

### `test`

The `test` command runs all of the tests in your `policy.yaml` file and reports on any failures.

```bash
supasec test
```

### `snapshot`

The `snapshot` command creates a `.supasec/snapshot.json` file. This file acts as a "golden record" of your security posture. You should check this file into your version control.

```bash
supasec snapshot
```

### `diff`

The `diff` command compares the current behavior of your RLS policies against your `snapshot.json` file. This is useful for detecting unintended security regressions.

```bash
supasec diff
```

## Advanced Usage

### Watch Mode

For a faster development workflow, you can use the `--watch` flag to automatically re-run your tests whenever you make a change to your `.sql` or `policy.yaml` files.

```bash
supasec test --watch
```

### CI/CD Integration

To use Supasec in your CI/CD pipeline, you can use the `--json` flag to get machine-readable output. The command will also exit with a non-zero status code if any tests fail or if any security leaks are detected, which will fail your build.

```bash
supasec test --json
```
