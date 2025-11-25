import { Command } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import { stringify } from 'yaml';
import { introspectSchema, introspectStorageBuckets } from '../core/introspect.js';
import type { PolicyConfig, TableTestConfiguration, StorageBucketTestConfiguration, TableMeta, StorageBucketMeta } from '../shared/types.js';
import { DEFAULT_TEST_CONFIGURATION, DEFAULT_TEST_SCENARIO_NAMES, FILE_PATHS } from '../shared/constants.js';
import { formatDiscoveredTables, formatDiscoveredBuckets } from '../shared/logger.js';
import { BANNER } from '../shared/banner.js';
import { withDatabaseConnection } from '../shared/command-utils.js';

export const initCommand = new Command('init')
  .description('Discover your public tables and generate RLS tests')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--all-schemas', 'Include system tables (auth, storage, etc.)')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    console.log(BANNER);
    
    await withDatabaseConnection(options, async ({ pool, logger }) => {
      logger.start('Introspecting schema...');
      const discoveredTables = await introspectSchema(pool, {
        includeSystemSchemas: options.allSchemas
      });
      
      logger.start('Introspecting storage buckets...');
      const discoveredBuckets = await introspectStorageBuckets(pool);
      logger.succeed('Schema and storage introspection complete.');

      if (discoveredTables.length === 0 && discoveredBuckets.length === 0) {
        logger.warn('No tables with RLS enabled or storage buckets found.');
        return;
      }

      await createSupashieldDirectoryIfNotExists();
      const policyConfig = generatePolicyConfigurationFromDiscoveredTables(discoveredTables, discoveredBuckets);
      await writePolicyConfigurationToFile(policyConfig);

      logger.succeed(`Generated ${FILE_PATHS.POLICY_CONFIG_FILE} with ${discoveredTables.length} tables and ${discoveredBuckets.length} storage buckets`);
      logger.info('Edit the file to customize test scenarios and expected permissions');

      logger.raw(formatDiscoveredTables(discoveredTables));
      if (discoveredBuckets.length > 0) {
        logger.raw(formatDiscoveredBuckets(discoveredBuckets));
      }
    });
  });

async function createSupashieldDirectoryIfNotExists(): Promise<void> {
  await mkdir(FILE_PATHS.SUPASHIELD_DIRECTORY, { recursive: true });
}

function generatePolicyConfigurationFromDiscoveredTables(
  discoveredTables: TableMeta[],
  discoveredBuckets: StorageBucketMeta[] = []
): PolicyConfig {
  const config: PolicyConfig = {
    tables: {},
    storage_buckets: {},
    defaults: DEFAULT_TEST_CONFIGURATION,
  };

  for (const table of discoveredTables) {
    const tableKey = `${table.schema}.${table.name}`;
    config.tables[tableKey] = createDefaultTableTestConfiguration();
  }

  for (const bucket of discoveredBuckets) {
    config.storage_buckets![bucket.name] = createDefaultStorageBucketTestConfiguration();
  }

  return config;
}

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

async function writePolicyConfigurationToFile(config: PolicyConfig): Promise<void> {
  const yamlContent = stringify(config, { indent: 2 });
  await writeFile(FILE_PATHS.POLICY_CONFIG_FILE, yamlContent);
} 