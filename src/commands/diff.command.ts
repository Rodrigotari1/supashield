import { Command } from 'commander';
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

export const diffCommand = new Command('diff')
  .description('Compare the current policy against a snapshot')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    const logger = createLogger(options.verbose);
    const dbUrl = options.url || process.env.DATABASE_URL;

    if (!dbUrl) {
      logger.error('Database URL is required. Use --url or set DATABASE_URL env var.');
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

      logger.start('📸 Creating live policy snapshot for comparison...');
      const currentSnapshot = await createPolicySnapshot(pool, config, logger);
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
  pool: any,
  config: PolicyConfig,
  logger: Logger
): Promise<PolicySnapshot> {
  const snapshot: PolicySnapshot = {};

  for (const [tableKey, tableConfig] of Object.entries(config.tables)) {
    snapshot[tableKey] = {};
    for (const scenario of tableConfig.test_scenarios) {
      snapshot[tableKey][scenario.name] = {};
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
    }
  }

  return snapshot;
}

function printComparisonResult(
  comparison: SnapshotComparisonResult,
  logger: Logger
): void {
  if (comparison.isIdentical) {
    logger.succeed('✅ No changes detected.');
    return;
  }

  logger.warn('⚠️ Policy changes detected!');

  if (comparison.leaks.length > 0) {
    logger.error('🚨 Potential security leaks found:');
    logger.raw(comparison.leaks.join('\n'));
  }

  if (comparison.regressions.length > 0) {
    logger.warn('\n🔍 Regressions found:');
    logger.raw(comparison.regressions.join('\n'));
  }

  if (comparison.newlyIntroduced.length > 0) {
    logger.info('\n✨ Newly introduced permissions:');
    logger.raw(comparison.newlyIntroduced.join('\n'));
  }
} 