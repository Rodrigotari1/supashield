import { Command } from 'commander';
import {
  createDatabaseConnectionConfig,
  establishValidatedDatabaseConnection,
} from '../core/db.js';
import { executeRlsPolicyProbeForOperation } from '../core/simulate.js';
import { loadPolicyConfigurationFromFile } from '../shared/config.js';
import type {
  DatabaseOperation,
  PolicyConfig,
  PolicySnapshot,
  TestResultDetail,
  TestResults,
} from '../shared/types.js';
import {
  CONSOLE_MESSAGES,
  FILE_PATHS,
  SUPPORTED_DATABASE_OPERATIONS,
} from '../shared/constants.js';
import {
  createLogger,
  formatSummary,
  formatTestResult,
  Logger,
} from '../shared/logger.js';
import {
  compareSnapshots,
  loadPolicySnapshotFromFile,
} from '../shared/diff.js';
import { executePromisesInParallel } from '../shared/parallel.js';
import chokidar from 'chokidar';

export const testCommand = new Command('test')
  .description('Run policy tests against database')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--table <table>', 'Test only specific table (e.g. public.todos)')
  .option('--json', 'Output results in JSON format')
  .option('--watch', 'Watch for changes and re-run tests')
  .option(
    '--parallel <count>',
    'Number of parallel tests to run',
    (value) => parseInt(value, 10),
    1
  )
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    const logger = createLogger(options.verbose);

    const run = async () => {
      const dbUrl = options.url || process.env.DATABASE_URL;

      if (!dbUrl) {
        logger.error(
          'Database URL is required. Use --url or set DATABASE_URL env var.'
        );
        process.exit(1);
      }

      try {
        const startTime = performance.now();

        logger.start(CONSOLE_MESSAGES.LOADING_CONFIG);
        const config = await loadPolicyConfigurationFromFile();
        logger.succeed('Policy configuration loaded.');

        logger.start(CONSOLE_MESSAGES.CONNECTING);
        const connectionConfig = createDatabaseConnectionConfig(dbUrl);
        const pool = await establishValidatedDatabaseConnection(connectionConfig);
        logger.succeed('Connected to database.');

        logger.start(CONSOLE_MESSAGES.RUNNING_TESTS);
        const testResults = await executeAllPolicyTestsForConfiguration(
          pool,
          config,
          {
            target_table: options.table,
            operations_to_test: SUPPORTED_DATABASE_OPERATIONS,
            parallel_concurrency: options.parallel,
            verbose_logging: options.verbose,
          },
          logger
        );
        logger.succeed('All tests complete.');

        await pool.end();

        const endTime = performance.now();
        testResults.execution_time_ms = endTime - startTime;

        if (options.json) {
          console.log(JSON.stringify(testResults, null, 2));
        } else {
          displayTestResultsSummary(testResults, logger);
          await checkAgainstSnapshot(testResults, logger);
        }

        determineProcessExitCode(testResults, logger);
      } catch (error) {
        logger.error('An unexpected error occurred during testing.', error);
        process.exit(1);
      }
    };

    await run();

    if (options.watch) {
      logger.info('👀 Watching for changes...');
      chokidar
        .watch([FILE_PATHS.POLICY_CONFIG_FILE, '**/*.sql'])
        .on('change', () => {
          logger.info('Changes detected, re-running tests...');
          run();
        });
    }
  });

/**
 * Executes all policy tests defined in the configuration.
 */
async function executeAllPolicyTestsForConfiguration(
  pool: any,
  config: PolicyConfig,
  executionConfig: any,
  logger: Logger
): Promise<TestResults> {
  const allTableKeys = Object.keys(config.tables).filter(
    (tableKey) =>
      !executionConfig.target_table ||
      tableKey === executionConfig.target_table
  );

  const testRuns: Array<() => Promise<TestResultDetail[]>> = [];

  for (const tableKey of allTableKeys) {
    const tableConfig = config.tables[tableKey];
    logger.raw(`\n🔍 Testing ${tableKey}:`);
    const [schema, table] = tableKey.split('.');

    for (const scenario of tableConfig.test_scenarios) {
      testRuns.push(() =>
        executeTestScenarioForAllOperations(
          pool,
          schema,
          table,
          scenario,
          executionConfig.operations_to_test,
          logger
        )
      );
    }
  }

  const detailed_results = await executePromisesInParallel(
    testRuns,
    executionConfig.parallel_concurrency
  );

  const results: TestResults = {
    total_tests: 0,
    passed_tests: 0,
    failed_tests: 0,
    error_tests: 0,
    execution_time_ms: 0,
    detailed_results: detailed_results.flat(),
  };

  // Update counters
  for (const result of results.detailed_results) {
    results.total_tests++;
    if (result.passed) {
      results.passed_tests++;
    } else if (result.actual === 'ERROR') {
      results.error_tests++;
    } else {
      results.failed_tests++;
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

  logger.raw(`  👤 ${scenario.name}:`);

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

async function checkAgainstSnapshot(
  results: TestResults,
  logger: Logger
): Promise<void> {
  const previousSnapshot = await loadPolicySnapshotFromFile();
  if (!previousSnapshot) {
    return; // No snapshot, nothing to compare against
  }

  // Re-format test results into a snapshot structure
  const currentSnapshot: PolicySnapshot = {};
  for (const result of results.detailed_results) {
    if (!currentSnapshot[result.table_key]) {
      currentSnapshot[result.table_key] = {};
    }
    if (!currentSnapshot[result.table_key][result.scenario_name]) {
      currentSnapshot[result.table_key][result.scenario_name] = {};
    }
    currentSnapshot[result.table_key][result.scenario_name][
      result.operation
    ] = result.actual;
  }

  const comparison = compareSnapshots(previousSnapshot, currentSnapshot);
  if (comparison.isIdentical) {
    return;
  }

  logger.warn('\n🚦 Snapshot comparison:');

  if (comparison.leaks.length > 0) {
    logger.error('🚨 Potential security leaks found since last snapshot:');
    logger.raw(comparison.leaks.join('\n'));
    // This is a critical failure, so we'll mark it for process exit
    results.failed_tests += comparison.leaks.length;
  }

  if (comparison.regressions.length > 0) {
    logger.warn('\n🔍 Regressions found since last snapshot:');
    logger.raw(comparison.regressions.join('\n'));
  }

  if (comparison.newlyIntroduced.length > 0) {
    logger.info('\n✨ Newly introduced permissions since last snapshot:');
    logger.raw(comparison.newlyIntroduced.join('\n'));
  }
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