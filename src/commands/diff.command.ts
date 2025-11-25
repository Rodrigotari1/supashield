import { Command } from 'commander';
import type { Pool } from 'pg';
import { executeRlsPolicyProbeForOperation } from '../core/simulate.js';
import { SUPPORTED_DATABASE_OPERATIONS } from '../shared/constants.js';
import type { Logger } from '../shared/logger.js';
import type { PolicyConfig, PolicySnapshot } from '../shared/types.js';
import { loadPolicyConfigurationFromFile } from '../shared/config.js';
import { compareSnapshots, loadPolicySnapshotFromFile, type SnapshotComparisonResult } from '../core/diff.js';
import { executePromisesInParallel } from '../shared/parallel.js';
import { withDatabaseConnection, createCommandLogger } from '../shared/command-utils.js';

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
    const logger = createCommandLogger(options.verbose);
    
    const previousSnapshot = await loadPolicySnapshotFromFile();
    if (!previousSnapshot) {
      logger.error('No snapshot found. Run `snapshot` command first.');
      process.exit(1);
    }

    const config = await loadPolicyConfigurationFromFile();

    await withDatabaseConnection(options, async ({ pool, logger }) => {
      logger.start('Creating live policy snapshot for comparison...');
      const currentSnapshot = await createPolicySnapshot(pool, config, options.parallel, logger);
      logger.succeed('Live snapshot created.');

      const comparison = compareSnapshots(previousSnapshot, currentSnapshot);
      printComparisonResult(comparison, logger);
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