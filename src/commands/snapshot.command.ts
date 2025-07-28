import { Command } from 'commander';
import { writeFile } from 'fs/promises';
import {
  createDatabaseConnectionConfig,
  establishValidatedDatabaseConnection,
} from '../core/db.js';
import { executeRlsPolicyProbeForOperation } from '../core/simulate.js';
import {
  CONSOLE_MESSAGES,
  FILE_PATHS,
  SUPPORTED_DATABASE_OPERATIONS,
} from '../shared/constants.js';
import { createLogger, Logger } from '../shared/logger.js';
import type { PolicyConfig, PolicySnapshot } from '../shared/types.js';
import { loadPolicyConfigurationFromFile } from '../shared/config.js';
import { executePromisesInParallel } from '../shared/parallel.js';

export const snapshotCommand = new Command('snapshot')
  .description('Take a snapshot of the current policy behavior')
  .option('-u, --url <url>', 'Database connection URL')
  .option(
    '--parallel <count>',
    'Number of parallel snapshots to run',
    (value) => parseInt(value, 10),
    1
  )
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    const logger = createLogger(options.verbose);
    const dbUrl = options.url || process.env.DATABASE_URL;

    if (!dbUrl) {
      logger.error('Database URL is required. Use --url or set DATABASE_URL env var.');
      process.exit(1);
    }

    try {
      logger.start(CONSOLE_MESSAGES.LOADING_CONFIG);
      const config = await loadPolicyConfigurationFromFile();
      logger.succeed('Policy configuration loaded.');

      logger.start(CONSOLE_MESSAGES.CONNECTING);
      const connectionConfig = createDatabaseConnectionConfig(dbUrl);
      const pool = await establishValidatedDatabaseConnection(connectionConfig);
      logger.succeed('Connected to database.');

      logger.start('📸 Creating policy snapshot...');
      const snapshot = await createPolicySnapshot(
        pool,
        config,
        options.parallel,
        logger
      );
      await writePolicySnapshotToFile(snapshot);
      logger.succeed(`Snapshot saved to ${FILE_PATHS.SNAPSHOT_FILE}`);

      await pool.end();
    } catch (error) {
      logger.error('An unexpected error occurred during snapshot creation.', error);
      process.exit(1);
    }
  });

async function createPolicySnapshot(
  pool: any,
  config: PolicyConfig,
  parallelism: number,
  logger: Logger
): Promise<PolicySnapshot> {
  const snapshot: PolicySnapshot = {};
  const snapshotTasks: Array<() => Promise<void>> = [];

  for (const [tableKey, tableConfig] of Object.entries(config.tables)) {
    snapshot[tableKey] = {};
    logger.raw(`\n  Inspecting ${tableKey}:`);

    for (const scenario of tableConfig.test_scenarios) {
      snapshot[tableKey][scenario.name] = {};
      logger.raw(`    - ${scenario.name}`);

      snapshotTasks.push(async () => {
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

async function writePolicySnapshotToFile(snapshot: PolicySnapshot): Promise<void> {
  await writeFile(FILE_PATHS.SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
} 