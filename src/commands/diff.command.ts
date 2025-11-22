import { Command } from 'commander';
import type { Pool } from 'pg';
import {
  createDatabaseConnectionConfig,
  establishValidatedDatabaseConnection,
} from '../core/db.js';
import { executeRlsPolicyProbeForOperation } from '../core/simulate.js';
import {
  CONSOLE_MESSAGES,
  SUPPORTED_DATABASE_OPERATIONS,
} from '../shared/constants.js';
import { createLogger, Logger } from '../shared/logger.js';
import type { PolicyConfig, PolicySnapshot } from '../shared/types.js';
import { loadPolicyConfigurationFromFile } from '../shared/config.js';
import {
  compareSnapshots,
  loadPolicySnapshotFromFile,
  SnapshotComparisonResult,
} from '../shared/diff.js';
import { executePromisesInParallel } from '../shared/parallel.js';

export const diffCommand = new Command('diff')
  .description('Compare the current policy against a snapshot')
  .option('-u, --url <url>', 'Database connection URL')
  .option(
    '--parallel <count>',
    'Number of parallel snapshots to run',
    (value) => parseInt(value, 10),
    10
  )
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    const logger = createLogger(options.verbose);
    const dbUrl = options.url || process.env.SUPASHIELD_DATABASE_URL || process.env.DATABASE_URL;

    if (!dbUrl) {
      logger.error('Database URL is required. Use --url or set SUPASHIELD_DATABASE_URL env var.');
      process.exit(1);
    }

    try {
      const previousSnapshot = await loadPolicySnapshotFromFile();
      if (!previousSnapshot) {
        logger.error('No snapshot found. Run `snapshot` command first.');
        process.exit(1);
      }

      logger.start(CONSOLE_MESSAGES.LOADING_CONFIG);
      const config = await loadPolicyConfigurationFromFile();
      logger.succeed('Policy configuration loaded.');

      logger.start(CONSOLE_MESSAGES.CONNECTING);
      const connectionConfig = createDatabaseConnectionConfig(dbUrl);
      const pool = await establishValidatedDatabaseConnection(connectionConfig);
      logger.succeed('Connected to database.');

      logger.start('Creating live policy snapshot for comparison...');
      const currentSnapshot = await createPolicySnapshot(
        pool,
        config,
        options.parallel,
        logger
      );
      logger.succeed('Live snapshot created.');

      await pool.end();

      const comparison = compareSnapshots(previousSnapshot, currentSnapshot);
      printComparisonResult(comparison, logger);
    } catch (error) {
      logger.error('An unexpected error occurred during diff.', error);
      process.exit(1);
    }
  });

async function createPolicySnapshot(
  pool: Pool,
  config: PolicyConfig,
  parallelism: number,
  logger: Logger
): Promise<PolicySnapshot> {
  const snapshot: PolicySnapshot = {};
  const snapshotTasks: Array<() => Promise<void>> = [];

  for (const [tableKey, tableConfig] of Object.entries(config.tables)) {
    snapshot[tableKey] = {};

    for (const scenario of tableConfig.test_scenarios) {
      snapshot[tableKey][scenario.name] = {};

      snapshotTasks.push(async () => {
        logger.raw(`  Inspecting ${tableKey} for ${scenario.name}...`);
        for (const operation of SUPPORTED_DATABASE_OPERATIONS) {
          const [schema, table] = tableKey.split('.');
          const result = await executeRlsPolicyProbeForOperation(
            pool,
            schema,
            table,
            operation,
            scenario.jwt_claims
          );
          snapshot[tableKey][scenario.name][operation] = result;
        }
      });
    }
  }

  await executePromisesInParallel(snapshotTasks, parallelism);

  return snapshot;
}

function printComparisonResult(
  comparison: SnapshotComparisonResult,
  logger: Logger
): void {
  if (comparison.isIdentical) {
    logger.succeed('No changes detected.');
    return;
  }

  logger.warn('Policy changes detected!');

  if (comparison.leaks.length > 0) {
    logger.error('Potential security leaks found:');
    logger.raw(comparison.leaks.join('\n'));
  }

  if (comparison.regressions.length > 0) {
    logger.warn('\nRegressions found:');
    logger.raw(comparison.regressions.join('\n'));
  }

  if (comparison.newlyIntroduced.length > 0) {
    logger.info('\nNewly introduced permissions:');
    logger.raw(comparison.newlyIntroduced.join('\n'));
  }
}