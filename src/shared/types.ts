export interface TableMeta {
  schema: string;
  name: string;
  policies: PolicyInfo[];
}

export interface StorageBucketMeta {
  bucket_id: string;
  name: string;
  policies: PolicyInfo[];
  public: boolean;
}

export interface PolicyInfo {
  name: string;
  command: DatabaseOperation;
  roles: string[];
  using_expression?: string;
  with_check_expression?: string;
}

export interface PolicySnapshot {
  [tableKey: string]: {
    [scenarioName: string]: {
      [operation in DatabaseOperation]?: ProbeResult;
    };
  };
}

export interface PolicyConfig {
  tables: {
    [tableKey: string]: TableTestConfiguration;
  };
  storage_buckets?: {
    [bucketKey: string]: StorageBucketTestConfiguration;
  };
  defaults?: DefaultTestConfiguration;
}

export interface TableTestConfiguration {
  test_scenarios: TestScenario[];
  custom_operations?: DatabaseOperation[];
}

export interface StorageBucketTestConfiguration {
  test_scenarios: TestScenario[];
  custom_operations?: DatabaseOperation[];
}

export interface TestScenario {
  name: string;
  jwt_claims: Record<string, any>;
  expected: ExpectedOperationResults;
}

export interface ExpectedOperationResults {
  SELECT?: ProbeResult;
  INSERT?: ProbeResult;
  UPDATE?: ProbeResult;
  DELETE?: ProbeResult;
}

export interface DefaultTestConfiguration {
  anonymous_user_expectations: ExpectedOperationResults;
  authenticated_user_expectations: ExpectedOperationResults;
  default_jwt_claims: {
    anonymous: Record<string, any>;
    authenticated: Record<string, any>;
  };
}

export interface DatabaseConnectionConfig {
  url: string;
  role_validation_enabled: boolean;
  connection_timeout_ms: number;
  max_retries: number;
}

export interface TestExecutionConfig {
  target_table?: string;
  operations_to_test: DatabaseOperation[];
  parallel_execution: boolean;
  verbose_logging: boolean;
}

export interface TestResults {
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  error_tests: number;
  execution_time_ms: number;
  detailed_results: TestResultDetail[];
}

export interface TestResultDetail {
  table_key: string;
  scenario_name: string;
  operation: DatabaseOperation;
  expected: ProbeResult;
  actual: ProbeResult;
  passed: boolean;
  error_message?: string;
  execution_time_ms: number;
}

// Enums for better type safety and elimination of magic strings
export type DatabaseOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
export type ProbeResult = 'ALLOW' | 'DENY' | 'ERROR';
export type UserRole = 'anonymous' | 'authenticated' | string;

export interface ColumnIntrospectionResult {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  is_primary_key: boolean;
}

export interface DatabaseRolePrivileges {
  role_name: string;
  has_global_dml: boolean;
  has_create_privilege: boolean;
  table_specific_privileges: string[];
  is_superuser: boolean;
}