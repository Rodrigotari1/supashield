import { Command } from 'commander';
import type { Pool } from 'pg';
import { writeFile } from 'fs/promises';
import { executeRlsPolicyProbeForOperation } from '../core/simulate.js';
import { FILE_PATHS, SUPPORTED_DATABASE_OPERATIONS } from '../shared/constants.js';
import type { Logger } from '../shared/logger.js';
import type { PolicyConfig, PolicySnapshot } from '../shared/types.js';
import { loadPolicyConfigurationFromFile } from '../shared/config.js';
import { executePromisesInParallel } from '../shared/parallel.js';
import { withDatabaseConnection } from '../shared/command-utils.js';

export const snapshotCommand = new Command('snapshot')
  .description('Take a snapshot of the current policy behavior')
  .option('-u, --url <url>', 'Database connection URL')
  .option(
    '--parallel <count>',
    'Number of parallel snapshots to run',
    (value) => parseInt(value, 10),
    10
  )
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    const config = await loadPolicyConfigurationFromFile();

    await withDatabaseConnection(options, async ({ pool, logger }) => {
      logger.start('Creating policy snapshot...');
      const snapshot = await createPolicySnapshot(pool, config, options.parallel, logger);
      await writePolicySnapshotToFile(snapshot);
      logger.succeed(`Snapshot saved to ${FILE_PATHS.SNAPSHOT_FILE}`);
    });
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