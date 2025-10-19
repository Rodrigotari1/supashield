import { Command } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import { stringify } from 'yaml';
import {
  establishValidatedDatabaseConnection,
  createDatabaseConnectionConfig
} from '../core/db.js';
import { introspectSchema, introspectStorageBuckets } from '../core/introspect.js';
import type { PolicyConfig, TableTestConfiguration, StorageBucketTestConfiguration } from '../shared/types.js';
import {
  DEFAULT_TEST_CONFIGURATION,
  DEFAULT_TEST_SCENARIO_NAMES,
  CONSOLE_MESSAGES,
  FILE_PATHS
} from '../shared/constants.js';
import {
  createLogger,
  formatDiscoveredTables,
  formatDiscoveredBuckets,
  Logger,
} from '../shared/logger.js';

export const initCommand = new Command('init')
  .description('Discover your public tables and generate RLS tests')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--all-schemas', 'Include system tables (auth, storage, etc.)')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    const logger = createLogger(options.verbose);
    const dbUrl = options.url || process.env.DATABASE_URL;

    if (!dbUrl) {
      logger.error('Database URL is required. Use --url or set DATABASE_URL env var.');
      process.exit(1);
    }

    try {
      logger.start(CONSOLE_MESSAGES.CONNECTING);
      const connectionConfig = createDatabaseConnectionConfig(dbUrl);
      const pool = await establishValidatedDatabaseConnection(connectionConfig);
      logger.succeed('Connected to database.');

      logger.start(CONSOLE_MESSAGES.INTROSPECTING);
      const discoveredTables = await introspectSchema(pool, {
        includeSystemSchemas: options.allSchemas
      });
      
      logger.start('Introspecting storage buckets...');
      const discoveredBuckets = await introspectStorageBuckets(pool);
      await pool.end();
      logger.succeed('Schema and storage introspection complete.');

      if (discoveredTables.length === 0 && discoveredBuckets.length === 0) {
        logger.warn('No tables with RLS enabled or storage buckets found.');
        return;
      }

      await createSupashieldDirectoryIfNotExists();
      const policyConfig = generatePolicyConfigurationFromDiscoveredTables(discoveredTables, discoveredBuckets);
      await writePolicyConfigurationToFile(policyConfig);

      const totalItems = discoveredTables.length + discoveredBuckets.length;
      logger.succeed(`Generated ${FILE_PATHS.POLICY_CONFIG_FILE} with ${discoveredTables.length} tables and ${discoveredBuckets.length} storage buckets`);
      logger.info('Edit the file to customize test scenarios and expected permissions');

      logger.raw(formatDiscoveredTables(discoveredTables));
      if (discoveredBuckets.length > 0) {
        logger.raw(formatDiscoveredBuckets(discoveredBuckets));
      }

    } catch (error) {
      logger.error('An unexpected error occurred during initialization.', error);
      process.exit(1);
    }
  });

/**
 * Creates the .supasec directory if it doesn't already exist.
 */
async function createSupashieldDirectoryIfNotExists(): Promise<void> {
  await mkdir(FILE_PATHS.SUPASHIELD_DIRECTORY, { recursive: true });
}

/**
 * Generates a policy configuration from discovered database tables and storage buckets.
 */
function generatePolicyConfigurationFromDiscoveredTables(
  discoveredTables: any[],
  discoveredBuckets: any[] = []
): PolicyConfig {
  const config: PolicyConfig = {
    tables: {},
    storage_buckets: {},
    defaults: DEFAULT_TEST_CONFIGURATION,
  };

  discoveredTables.forEach((table) => {
    const tableKey = createTableKeyFromSchemaAndName(table.schema, table.name);
    config.tables[tableKey] = createDefaultTableTestConfiguration();
  });

  discoveredBuckets.forEach((bucket) => {
    const bucketKey = bucket.name;
    config.storage_buckets![bucketKey] = createDefaultStorageBucketTestConfiguration();
  });

  return config;
}

/**
 * Creates a table key from schema and table name.
 */
function createTableKeyFromSchemaAndName(schema: string, tableName: string): string {
  return `${schema}.${tableName}`;
}

/**
 * Creates a default test configuration for a table.
 */
function createDefaultTableTestConfiguration(): TableTestConfiguration {
  return {
    test_scenarios: [
      {
        name: DEFAULT_TEST_SCENARIO_NAMES.ANONYMOUS_USER,
        jwt_claims: DEFAULT_TEST_CONFIGURATION.default_jwt_claims.anonymous,
        expected: DEFAULT_TEST_CONFIGURATION.anonymous_user_expectations,
      },
      {
        name: DEFAULT_TEST_SCENARIO_NAMES.AUTHENTICATED_USER,
        jwt_claims: DEFAULT_TEST_CONFIGURATION.default_jwt_claims.authenticated,
        expected: DEFAULT_TEST_CONFIGURATION.authenticated_user_expectations,
      },
    ],
  };
}

/**
 * Creates a default test configuration for a storage bucket.
 */
function createDefaultStorageBucketTestConfiguration(): StorageBucketTestConfiguration {
  return {
    test_scenarios: [
      {
        name: DEFAULT_TEST_SCENARIO_NAMES.ANONYMOUS_USER,
        jwt_claims: DEFAULT_TEST_CONFIGURATION.default_jwt_claims.anonymous,
        expected: DEFAULT_TEST_CONFIGURATION.anonymous_user_expectations,
      },
      {
        name: DEFAULT_TEST_SCENARIO_NAMES.AUTHENTICATED_USER,
        jwt_claims: DEFAULT_TEST_CONFIGURATION.default_jwt_claims.authenticated,
        expected: DEFAULT_TEST_CONFIGURATION.authenticated_user_expectations,
      },
    ],
  };
}

/**
 * Writes the policy configuration to the standard policy file location.
 */
async function writePolicyConfigurationToFile(config: PolicyConfig): Promise<void> {
  const yamlContent = stringify(config, { indent: 2 });
  await writeFile(FILE_PATHS.POLICY_CONFIG_FILE, yamlContent);
}

/**
 * Displays a summary of successful initialization with discovered tables.
 */
function displaySuccessfulInitializationSummary(logger: Logger, discoveredTables: any[]): void {
  logger.succeed(`Generated ${FILE_PATHS.POLICY_CONFIG_FILE} with ${discoveredTables.length} tables`);
  logger.info('Edit the file to customize test scenarios and expected permissions');

  logger.raw(formatDiscoveredTables(discoveredTables));
} 