import { Command } from 'commander';
import type { Pool } from 'pg';
import {
  executeRlsPolicyProbeDetailed,
  fetchRealUserContext,
  createJwtClaimsFromUser
} from '../core/simulate.js';
import type {
  PolicyConfig,
  TestResults,
  TestResultDetail,
  DatabaseOperation,
  ProbeResult,
  TableTestConfiguration
} from '../shared/types.js';
import { SUPPORTED_DATABASE_OPERATIONS, CONSOLE_MESSAGES } from '../shared/constants.js';
import { type Logger } from '../shared/logger.js';
import { updateTestCounters, loadPolicyConfig } from '../shared/test-utils.js';
import { withDatabaseConnection } from '../shared/command-utils.js';
import { executePromisesInParallel } from '../shared/parallel.js';
import { formatTestResultsAsJson, printTestResultsForHumans } from '../shared/output.js';

export const testCommand = new Command('test')
  .description('Test RLS policies for data leaks and access violations')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--table <table>', 'Test only specific table (e.g. public.users)')
  .option('--as-user <email>', 'Test with specific user email/ID from auth.users')
  .option('--parallel <number>', 'Number of parallel tests (default: 4, max: 10)', '4')
  .option('--all-schemas', 'Include system tables (auth, storage, etc.)')
  .option('--json', 'Output results as JSON (AI-friendly)')
  .option('--quiet', 'Only show failures and summary')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    const startTime = performance.now();
    let config = await loadPolicyConfig();
    const isJson = options.json;
    const isQuiet = options.quiet;

    await withDatabaseConnection(options, async ({ pool, logger }) => {
      if (options.asUser) {
        if (!isJson) logger.start(`Fetching user context for: ${options.asUser}`);
        const userContext = await fetchRealUserContext(pool, options.asUser);
        
        if (!userContext) {
          if (isJson) {
            console.log(JSON.stringify({ error: `User not found: ${options.asUser}` }));
          } else {
            logger.error(`User not found: ${options.asUser}`);
          }
          process.exit(1);
        }
        
        if (!isJson) logger.succeed(`Testing as: ${userContext.email} (${userContext.id})`);
        config = await createConfigForRealUser(config, userContext, options.table);
      }

      const parallelism = Math.min(Math.max(parseInt(options.parallel) || 1, 1), 10);

      if (!isJson) logger.start(CONSOLE_MESSAGES.RUNNING_TESTS);
      
      const testResults = await executeAllPolicyTestsForConfiguration(
        pool,
        config,
        {
          target_table: options.table,
          include_system_schemas: options.allSchemas,
          operations_to_test: SUPPORTED_DATABASE_OPERATIONS,
          parallel_execution: parallelism > 1,
          parallelism,
          verbose_logging: options.verbose,
          quiet: isQuiet,
          json: isJson,
        },
        logger
      );
      
      if (!isJson) logger.succeed('Tests complete.');

      testResults.execution_time_ms = performance.now() - startTime;

      if (isJson) {
        console.log(JSON.stringify(formatTestResultsAsJson(testResults), null, 2));
      } else {
        printTestResultsForHumans(testResults, logger, isQuiet);
      }
      
      const hasFailures = testResults.failed_tests > 0 || testResults.error_tests > 0;
      process.exit(hasFailures ? 1 : 0);
    });
  });

interface ExecutionConfig {
  target_table?: string;
  include_system_schemas?: boolean;
  operations_to_test: readonly DatabaseOperation[];
  parallel_execution: boolean;
  parallelism?: number;
  verbose_logging: boolean;
  quiet?: boolean;
  json?: boolean;
}

/**
 * Executes all policy tests defined in the configuration.
 */
async function executeAllPolicyTestsForConfiguration(
  pool: Pool,
  config: PolicyConfig,
  executionConfig: ExecutionConfig,
  logger: Logger
): Promise<TestResults> {
  const results: TestResults = {
    total_tests: 0,
    passed_tests: 0,
    failed_tests: 0,
    error_tests: 0,
    skipped_tests: 0,
    execution_time_ms: 0,
    detailed_results: [],
  };

  const tableEntries = Object.entries(config.tables).filter(([tableKey]) => {
    if (executionConfig.target_table && tableKey !== executionConfig.target_table) {
      return false;
    }
    if (!executionConfig.include_system_schemas && !tableKey.startsWith('public.')) {
      return false;
    }
    return true;
  });

  const suppressOutput = executionConfig.json || executionConfig.quiet;

  // Parallel execution - collect results silently, display after
  if (executionConfig.parallel_execution && executionConfig.parallelism && executionConfig.parallelism > 1) {
    const tableResults = await executeTablesInParallel(
      pool,
      tableEntries,
      executionConfig.operations_to_test,
      executionConfig.parallelism
    );

    tableResults.sort((a, b) => a.tableKey.localeCompare(b.tableKey));

    for (const tableResult of tableResults) {
      results.detailed_results.push(...tableResult.allResults);
      for (const result of tableResult.allResults) {
        updateTestCounters(results, result);
      }
    }
  } else {
    // Sequential execution
    for (const [tableKey, tableConfig] of tableEntries) {
      const [schema, table] = tableKey.split('.');

      for (const scenario of tableConfig.test_scenarios) {
        const scenarioResults = await executeTestScenarioForAllOperations(
          pool,
          schema,
          table,
          scenario,
          executionConfig.operations_to_test
        );

        results.detailed_results.push(...scenarioResults);

        for (const result of scenarioResults) {
          updateTestCounters(results, result);
        }
      }
    }
  }

  return results;
}

interface TableTestResult {
  tableKey: string;
  scenarios: Array<{
    scenarioName: string;
    results: TestResultDetail[];
  }>;
  allResults: TestResultDetail[];
}

async function executeTablesInParallel(
  pool: Pool,
  tableEntries: Array<[string, TableTestConfiguration]>,
  operations: readonly DatabaseOperation[],
  parallelism: number
): Promise<TableTestResult[]> {
  const promiseFactories = tableEntries.map(([tableKey, tableConfig]) =>
    async () => {
      const [schema, table] = tableKey.split('.');
      const scenarios: Array<{ scenarioName: string; results: TestResultDetail[] }> = [];
      const allResults: TestResultDetail[] = [];

      for (const scenario of tableConfig.test_scenarios) {
        const scenarioResults = await executeTestScenarioForAllOperations(
          pool,
          schema,
          table,
          scenario,
          operations
        );

        scenarios.push({
          scenarioName: scenario.name,
          results: scenarioResults
        });
        allResults.push(...scenarioResults);
      }

      return { tableKey, scenarios, allResults };
    }
  );

  return executePromisesInParallel(promiseFactories, parallelism);
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
  operations: readonly DatabaseOperation[]
): Promise<TestResultDetail[]> {
  const results: TestResultDetail[] = [];

  for (const operation of operations) {
    const expected = scenario.expected[operation];
    if (!expected) continue;

    const operationStartTime = performance.now();

    const probeResult = await executeRlsPolicyProbeDetailed(
      pool,
      schema,
      table,
      operation,
      scenario.jwt_claims
    );

    const operationEndTime = performance.now();
    const passed = probeResult.result === expected;

    results.push({
      table_key: `${schema}.${table}`,
      scenario_name: scenario.name,
      operation,
      expected,
      actual: probeResult.result,
      passed: probeResult.result === 'SKIPPED' ? false : passed,
      error_message: probeResult.reason,
      execution_time_ms: operationEndTime - operationStartTime,
    });
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