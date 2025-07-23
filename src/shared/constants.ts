import type { 
  DatabaseOperation, 
  DefaultTestConfiguration, 
  ExpectedOperationResults,
  DatabaseConnectionConfig 
} from './types.js';

// Database operations that can be tested
export const SUPPORTED_DATABASE_OPERATIONS: readonly DatabaseOperation[] = [
  'SELECT', 
  'INSERT', 
  'UPDATE', 
  'DELETE'
] as const;

// Default test scenarios configuration
export const DEFAULT_TEST_CONFIGURATION: DefaultTestConfiguration = {
  anonymous_user_expectations: {
    SELECT: 'DENY',
    INSERT: 'DENY',
    UPDATE: 'DENY',
    DELETE: 'DENY',
  },
  authenticated_user_expectations: {
    SELECT: 'ALLOW',
    INSERT: 'ALLOW',
    UPDATE: 'ALLOW',
    DELETE: 'ALLOW',
  },
  default_jwt_claims: {
    anonymous: {},
    authenticated: { 
      sub: 'user-123', 
      role: 'authenticated' 
    },
  },
};

// Database connection defaults
export const DEFAULT_CONNECTION_CONFIG: Omit<DatabaseConnectionConfig, 'url'> = {
  role_validation_enabled: true,
  connection_timeout_ms: 30000,
  max_retries: 3,
};

// Schema exclusions for introspection
export const EXCLUDED_SCHEMAS_FROM_INTROSPECTION: readonly string[] = [
  'information_schema',
  'pg_catalog', 
  'pg_toast'
] as const;

// SQL error codes
export const SQL_ERROR_CODES = {
  PERMISSION_DENIED: '42501',
  DUPLICATE_KEY: '23505',
  INVALID_SYNTAX: '42601',
  UNDEFINED_TABLE: '42P01',
} as const;

// Console output messages
export const CONSOLE_MESSAGES = {
  CONNECTING: '🔍 Connecting to database...',
  INTROSPECTING: '📊 Introspecting schema...',
  LOADING_CONFIG: '📋 Loading policy configuration...',
  RUNNING_TESTS: '🧪 Running policy tests...',
  SUCCESS_ALL_PASSED: '🎉 All policy tests passed!',
  ERROR_MISMATCHES_DETECTED: (count: number) => `⚠️  ${count} policy mismatches detected!`,
  REVIEW_POLICIES: '💡 Review your RLS policies or update expected results in policy.yaml',
} as const;

// File system paths
export const FILE_PATHS = {
  SUPASEC_DIRECTORY: '.supasec',
  POLICY_CONFIG_FILE: '.supasec/policy.yaml',
  CACHE_FILE: '.supasec/cache.json',
} as const;

// Column type mappings for test data generation
export const COLUMN_TYPE_TEST_VALUES = {
  UUID: () => 'auth.uid()',
  UUID_RANDOM: () => `'${crypto.randomUUID()}'`,
  TEXT: "'test'",
  VARCHAR: "'test'",
  INTEGER: '1',
  NUMERIC: '1',
  BOOLEAN: 'true',
  DEFAULT: 'DEFAULT',
} as const;

// PostgreSQL system roles
export const POSTGRESQL_SYSTEM_ROLES = {
  ANONYMOUS: 'anon',
  AUTHENTICATED: 'authenticated',
  POSTGRES: 'postgres',
} as const;

// Test scenario names
export const DEFAULT_TEST_SCENARIO_NAMES = {
  ANONYMOUS_USER: 'anonymous_user',
  AUTHENTICATED_USER: 'authenticated_user',
} as const; 