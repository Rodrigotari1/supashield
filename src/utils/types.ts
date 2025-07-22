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