import { Command } from 'commander';
import type { Pool } from 'pg';
import {
  establishValidatedDatabaseConnection,
  createDatabaseConnectionConfig
} from '../core/db.js';
import { 
  executeRlsPolicyProbeForOperation,
  fetchRealUserContext,
  createJwtClaimsFromUser 
} from '../core/simulate.js';
import type {
  PolicyConfig,
  TestResults,
  TestResultDetail,
  DatabaseOperation,
  ProbeResult
} from '../shared/types.js';
import {
  SUPPORTED_DATABASE_OPERATIONS,
  CONSOLE_MESSAGES,
} from '../shared/constants.js';
import {
  createLogger,
  formatTestResult,
  formatSummary,
  Logger,
} from '../shared/logger.js';
import {
  updateTestCounters,
  exitWithTestResults,
  loadPolicyConfig,
} from '../shared/test-utils.js';

export const testCommand = new Command('test')
  .description('Test RLS policies for data leaks and access violations')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--table <table>', 'Test only specific table (e.g. public.users)')
  .option('--as-user <email>', 'Test with specific user email/ID from auth.users')
  .option('--all-schemas', 'Include system tables (auth, storage, etc.)')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    const logger = createLogger(options.verbose);
    const dbUrl = options.url || process.env.SUPASHIELD_DATABASE_URL || process.env.DATABASE_URL;

    if (!dbUrl) {
      logger.error('Database URL is required. Use --url or set SUPASHIELD_DATABASE_URL (or DATABASE_URL) env var.');
      process.exit(1);
    }

    try {
      const startTime = performance.now();

      logger.start(CONSOLE_MESSAGES.LOADING_CONFIG);
      let config = await loadPolicyConfig();
      logger.succeed('Policy configuration loaded.');

      logger.start(CONSOLE_MESSAGES.CONNECTING);
      const connectionConfig = createDatabaseConnectionConfig(dbUrl);
      const pool = await establishValidatedDatabaseConnection(connectionConfig);
      logger.succeed('Connected to database.');

      // Handle real user testing
      if (options.asUser) {
        logger.start(`Fetching user context for: ${options.asUser}`);
        const userContext = await fetchRealUserContext(pool, options.asUser);
        
        if (!userContext) {
          logger.error(`User not found: ${options.asUser}`);
          process.exit(1);
        }
        
        logger.succeed(`Testing as: ${userContext.email} (${userContext.id})`);
        
        // Override config to test with real user
        config = await createConfigForRealUser(config, userContext, options.table);
      }

      logger.start(CONSOLE_MESSAGES.RUNNING_TESTS);
      const testResults = await executeAllPolicyTestsForConfiguration(
        pool,
        config,
        {
          target_table: options.table,
          include_system_schemas: options.allSchemas,
          operations_to_test: SUPPORTED_DATABASE_OPERATIONS,
          parallel_execution: false,
          verbose_logging: options.verbose,
        },
        logger
      );
      logger.succeed('All tests complete.');

      await pool.end();

      const endTime = performance.now();
      testResults.execution_time_ms = endTime - startTime;

      logger.raw(formatSummary(testResults));
      exitWithTestResults(testResults, logger);

    } catch (error) {
      logger.error('An unexpected error occurred during testing.', error);
      process.exit(1);
    }
  });


/**
 * Executes all policy tests defined in the configuration.
 */
async function executeAllPolicyTestsForConfiguration(
  pool: Pool,
  config: PolicyConfig,
  executionConfig: {
    target_table?: string;
    include_system_schemas?: boolean;
    operations_to_test: readonly DatabaseOperation[];
    parallel_execution: boolean;
    verbose_logging: boolean;
  },
  logger: Logger
): Promise<TestResults> {
  const results: TestResults = {
    total_tests: 0,
    passed_tests: 0,
    failed_tests: 0,
    error_tests: 0,
    execution_time_ms: 0,
    detailed_results: [],
  };

  for (const [tableKey, tableConfig] of Object.entries(config.tables)) {
    if (executionConfig.target_table && tableKey !== executionConfig.target_table) {
      continue;
    }
    
    // Skip system schemas unless explicitly requested
    if (!executionConfig.include_system_schemas && !tableKey.startsWith('public.')) {
      continue;
    }

    logger.raw(`\nTesting ${tableKey}:`);

    const [schema, table] = tableKey.split('.');

    for (const scenario of tableConfig.test_scenarios) {
      logger.raw(`  ${scenario.name}:`);

      const scenarioResults = await executeTestScenarioForAllOperations(
        pool,
        schema,
        table,
        scenario,
        executionConfig.operations_to_test,
        logger
      );

      results.detailed_results.push(...scenarioResults);

      for (const result of scenarioResults) {
        updateTestCounters(results, result);
      }
    }
  }

  return results;
}

/**
 * Executes a test scenario for all specified operations.
 */
async function executeTestScenarioForAllOperations(
  pool: Pool,
  schema: string,
  table: string,
  scenario: {
    name: string;
    jwt_claims: Record<string, any>;
    expected: {
      SELECT?: ProbeResult;
      INSERT?: ProbeResult;
      UPDATE?: ProbeResult;
      DELETE?: ProbeResult;
    };
  },
  operations: readonly DatabaseOperation[],
  logger: Logger
): Promise<TestResultDetail[]> {
  const results: TestResultDetail[] = [];

  for (const operation of operations) {
    const expected = scenario.expected[operation];
    if (!expected) continue; // Skip if no expectation set

    const operationStartTime = performance.now();

    try {
      const actual = await executeRlsPolicyProbeForOperation(
        pool,
        schema,
        table,
        operation,
        scenario.jwt_claims
      );

      const operationEndTime = performance.now();
      const passed = actual === expected;

      const resultDetail: TestResultDetail = {
        table_key: `${schema}.${table}`,
        scenario_name: scenario.name,
        operation,
        expected,
        actual,
        passed,
        execution_time_ms: operationEndTime - operationStartTime,
      };

      results.push(resultDetail);

      logger.raw(formatTestResult(resultDetail));

    } catch (error) {
      const operationEndTime = performance.now();
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.raw(`    🔥 ${operation}: ERROR - ${errorMessage}`);

      results.push({
        table_key: `${schema}.${table}`,
        scenario_name: scenario.name,
        operation,
        expected,
        actual: 'ERROR',
        passed: false,
        error_message: errorMessage,
        execution_time_ms: operationEndTime - operationStartTime,
      });
    }
  }

  return results;
}

/**
 * Creates a policy configuration for testing with a real user context.
 */
async function createConfigForRealUser(
  originalConfig: PolicyConfig,
  userContext: {
    id: string;
    email?: string;
    role?: string;
  },
  targetTable?: string
): Promise<PolicyConfig> {
  const realUserClaims = createJwtClaimsFromUser(userContext);
  
  const modifiedConfig: PolicyConfig = {
    ...originalConfig,
    tables: {}
  };

  // If targeting specific table, only test that one
  const tablesToTest = targetTable 
    ? { [targetTable]: originalConfig.tables[targetTable] }
    : originalConfig.tables;

  // Replace test scenarios with real user context
  for (const [tableKey, tableConfig] of Object.entries(tablesToTest)) {
    if (!tableConfig) continue;
    
    modifiedConfig.tables[tableKey] = {
      ...tableConfig,
      test_scenarios: [
        {
          name: `real_user_${userContext.email}`,
          jwt_claims: realUserClaims,
          expected: {
            // Default to ALLOW for real user testing - will show actual behavior
            SELECT: 'ALLOW',
            INSERT: 'ALLOW', 
            UPDATE: 'ALLOW',
            DELETE: 'ALLOW'
          }
        }
      ]
    };
  }

  return modifiedConfig;
} 