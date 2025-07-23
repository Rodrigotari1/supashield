import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { parse } from 'yaml';
import {
  establishValidatedDatabaseConnection,
  createDatabaseConnectionConfig
} from '../core/db.js';
import { executeRlsPolicyProbeForOperation } from '../core/simulate.js';
import type {
  PolicyConfig,
  PolicyMatrix,
  TestResults,
  TestResultDetail,
  DatabaseOperation
} from '../shared/types.js';
import {
  SUPPORTED_DATABASE_OPERATIONS,
  CONSOLE_MESSAGES,
  FILE_PATHS,
} from '../shared/constants.js';
import {
  createLogger,
  formatTestResult,
  formatSummary,
  Logger,
} from '../shared/logger.js';

export const testCommand = new Command('test')
  .description('Run policy tests against database')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--table <table>', 'Test only specific table (e.g. public.todos)')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    const logger = createLogger(options.verbose);
    const dbUrl = options.url || process.env.DATABASE_URL;

    if (!dbUrl) {
      logger.error('Database URL is required. Use --url or set DATABASE_URL env var.');
      process.exit(1);
    }

    try {
      const startTime = performance.now();

      logger.start(CONSOLE_MESSAGES.LOADING_CONFIG);
      const config = await loadPolicyConfigurationFromFile();
      logger.succeed('Policy configuration loaded.');

      logger.start(CONSOLE_MESSAGES.CONNECTING);
      const connectionConfig = createDatabaseConnectionConfig(dbUrl, {
        role_validation_enabled: false,
      });
      const pool = await establishValidatedDatabaseConnection(connectionConfig);
      logger.succeed('Connected to database.');

      logger.start(CONSOLE_MESSAGES.RUNNING_TESTS);
      const testResults = await executeAllPolicyTestsForConfiguration(
        pool,
        config,
        {
          target_table: options.table,
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

      displayTestResultsSummary(testResults, logger);
      determineProcessExitCode(testResults, logger);

    } catch (error) {
      logger.error('An unexpected error occurred during testing.', error);
      process.exit(1);
    }
  });

/**
 * Loads policy configuration from the standard policy file location.
 */
async function loadPolicyConfigurationFromFile(): Promise<PolicyConfig> {
  const yamlContent = await readFile(FILE_PATHS.POLICY_CONFIG_FILE, 'utf-8');
  return parse(yamlContent);
}

/**
 * Executes all policy tests defined in the configuration.
 */
async function executeAllPolicyTestsForConfiguration(
  pool: any,
  config: PolicyConfig,
  executionConfig: any,
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

    logger.raw(`\n🔍 Testing ${tableKey}:`);

    const [schema, table] = tableKey.split('.');

    for (const scenario of tableConfig.test_scenarios) {
      logger.raw(`  👤 ${scenario.name}:`);

      const scenarioResults = await executeTestScenarioForAllOperations(
        pool,
        schema,
        table,
        scenario,
        executionConfig.operations_to_test,
        logger
      );

      results.detailed_results.push(...scenarioResults);

      // Update counters
      for (const result of scenarioResults) {
        results.total_tests++;
        if (result.passed) {
          results.passed_tests++;
        } else if (result.actual === 'ERROR') {
          results.error_tests++;
        } else {
          results.failed_tests++;
        }
      }
    }
  }

  return results;
}

/**
 * Executes a test scenario for all specified operations.
 */
async function executeTestScenarioForAllOperations(
  pool: any,
  schema: string,
  table: string,
  scenario: any,
  operations: DatabaseOperation[],
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
 * Displays a comprehensive summary of test results.
 */
function displayTestResultsSummary(results: TestResults, logger: Logger): void {
  logger.raw(formatSummary(results));
}

/**
 * Determines the appropriate process exit code based on test results.
 */
function determineProcessExitCode(results: TestResults, logger: Logger): void {
  const totalFailures = results.failed_tests + results.error_tests;

  if (totalFailures > 0) {
    logger.warn(CONSOLE_MESSAGES.ERROR_MISMATCHES_DETECTED(totalFailures));
    logger.info(CONSOLE_MESSAGES.REVIEW_POLICIES);
    process.exit(1);
  } else {
    logger.succeed(CONSOLE_MESSAGES.SUCCESS_ALL_PASSED);
  }
} 