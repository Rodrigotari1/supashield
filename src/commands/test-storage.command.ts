import { Command } from 'commander';
import type { Pool } from 'pg';
import {
  establishValidatedDatabaseConnection,
  createDatabaseConnectionConfig
} from '../core/db.js';
import { executeStorageRlsPolicyProbeForOperation } from '../core/simulate.js';
import type {
  PolicyConfig,
  TestResults,
  TestResultDetail,
  DatabaseOperation
} from '../shared/types.js';
import {
  SUPPORTED_DATABASE_OPERATIONS,
  CONSOLE_MESSAGES,
} from '../shared/constants.js';
import {
  createLogger,
  formatTestResult,
  formatSummary,
} from '../shared/logger.js';
import {
  updateTestCounters,
  exitWithTestResults,
  loadPolicyConfig,
} from '../shared/test-utils.js';

export const testStorageCommand = new Command('test-storage')
  .description('Test RLS policies for Supabase Storage buckets')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--bucket <bucket>', 'Test only specific bucket')
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
      const config = await loadPolicyConfig();
      logger.succeed('Policy configuration loaded.');

      if (!config.storage_buckets || Object.keys(config.storage_buckets).length === 0) {
        logger.warn('No storage buckets configured in policy.yaml');
        process.exit(0);
      }

      logger.start(CONSOLE_MESSAGES.CONNECTING);
      const connectionConfig = createDatabaseConnectionConfig(dbUrl);
      const pool = await establishValidatedDatabaseConnection(connectionConfig);
      logger.succeed('Connected to database.');

      logger.start('Running storage policy tests...');
      const results = await runAllStorageBucketTests(pool, config, options, logger);
      logger.succeed('All tests complete.');

      await pool.end();

      const endTime = performance.now();
      results.execution_time_ms = endTime - startTime;

      logger.raw(formatSummary(results));
      exitWithTestResults(results, logger);

    } catch (error) {
      logger.error('An unexpected error occurred during testing.');
      if (error instanceof Error) {
        logger.error(error.stack || error.message);
      }
      process.exit(1);
    }
  });


async function runAllStorageBucketTests(
  pool: Pool, 
  config: PolicyConfig, 
  options: { bucket?: string }, 
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

  for (const [bucketName, bucketConfig] of Object.entries(config.storage_buckets!)) {
    if (options.bucket && bucketName !== options.bucket) {
      continue;
    }

    logger.raw(`\nTesting storage bucket: ${bucketName}`);

    const bucketId = await getBucketId(pool, bucketName);
    if (!bucketId) {
      logger.warn(`Bucket ${bucketName} not found, skipping tests`);
      continue;
    }

    for (const scenario of bucketConfig.test_scenarios) {
      logger.raw(`  ${scenario.name}:`);

      for (const operation of SUPPORTED_DATABASE_OPERATIONS) {
        const expected = scenario.expected[operation];
        if (!expected) continue;

        const startTime = performance.now();

        try {
          const actual = await executeStorageRlsPolicyProbeForOperation(
            pool,
            bucketId,
            operation,
            scenario.jwt_claims
          );

          const result: TestResultDetail = {
            table_key: `storage.${bucketName}`,
            scenario_name: scenario.name,
            operation,
            expected,
            actual,
            passed: actual === expected,
            execution_time_ms: performance.now() - startTime,
          };

          results.detailed_results.push(result);
          updateTestCounters(results, result);
          logger.raw(formatTestResult(result));

        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const result: TestResultDetail = {
            table_key: `storage.${bucketName}`,
            scenario_name: scenario.name,
            operation,
            expected,
            actual: 'ERROR',
            passed: false,
            error_message: errorMessage,
            execution_time_ms: performance.now() - startTime,
          };

          results.detailed_results.push(result);
          updateTestCounters(results, result);
          logger.raw(`    ${operation}: ERROR - ${errorMessage}`);
        }
      }
    }
  }

  return results;
}

async function getBucketId(pool: Pool, bucketName: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT id FROM storage.buckets WHERE name = $1', [bucketName]);
    return result.rows.length > 0 ? result.rows[0].id : null;
  } finally {
    client.release();
  }
}

