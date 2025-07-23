import { Command } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import { stringify } from 'yaml';
import { 
  establishValidatedDatabaseConnection, 
  createDatabaseConnectionConfig 
} from './utils/db.js';
import { introspectSchema } from './utils/introspect.js';
import type { PolicyConfig, TableTestConfiguration } from './utils/types.js';
import { 
  DEFAULT_TEST_CONFIGURATION, 
  DEFAULT_TEST_SCENARIO_NAMES, 
  CONSOLE_MESSAGES, 
  FILE_PATHS 
} from './utils/constants.js';

export const initCommand = new Command('init')
  .description('Introspect database schema and scaffold policy.yaml')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--role-validation', 'Enable database role validation (default: disabled)')
  .action(async (options) => {
    const dbUrl = options.url || process.env.DATABASE_URL;
    
    if (!dbUrl) {
      console.error('❌ Error: Database URL is required. Use --url or set DATABASE_URL env var.');
      process.exit(1);
    }

    try {
      console.log(CONSOLE_MESSAGES.CONNECTING);
      const connectionConfig = createDatabaseConnectionConfig(dbUrl, {
        role_validation_enabled: options.roleValidation || false,
      });
      const pool = await establishValidatedDatabaseConnection(connectionConfig);
      
      console.log(CONSOLE_MESSAGES.INTROSPECTING);
      const discoveredTables = await introspectSchema(pool);
      await pool.end();

      if (discoveredTables.length === 0) {
        console.log('⚠️  No tables with RLS enabled found.');
        return;
      }

      await createSupasecDirectoryIfNotExists();
      const policyConfig = generatePolicyConfigurationFromDiscoveredTables(discoveredTables);
      await writePolicyConfigurationToFile(policyConfig);

      displaySuccessfulInitializationSummary(discoveredTables);
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Creates the .supasec directory if it doesn't already exist.
 */
async function createSupasecDirectoryIfNotExists(): Promise<void> {
  await mkdir(FILE_PATHS.SUPASEC_DIRECTORY, { recursive: true });
}

/**
 * Generates a policy configuration from discovered database tables.
 */
function generatePolicyConfigurationFromDiscoveredTables(
  discoveredTables: any[]
): PolicyConfig {
  const config: PolicyConfig = {
    tables: {},
    defaults: DEFAULT_TEST_CONFIGURATION,
  };

  discoveredTables.forEach((table) => {
    const tableKey = createTableKeyFromSchemaAndName(table.schema, table.name);
    config.tables[tableKey] = createDefaultTableTestConfiguration();
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
 * Writes the policy configuration to the standard policy file location.
 */
async function writePolicyConfigurationToFile(config: PolicyConfig): Promise<void> {
  const yamlContent = stringify(config, { indent: 2 });
  await writeFile(FILE_PATHS.POLICY_CONFIG_FILE, yamlContent);
}

/**
 * Displays a summary of successful initialization with discovered tables.
 */
function displaySuccessfulInitializationSummary(discoveredTables: any[]): void {
  console.log(`✅ Generated ${FILE_PATHS.POLICY_CONFIG_FILE} with ${discoveredTables.length} tables`);
  console.log('📝 Edit the file to customize test scenarios and expected permissions');
  
  console.log('\n📋 Found tables:');
  discoveredTables.forEach(table => {
    const tableKey = createTableKeyFromSchemaAndName(table.schema, table.name);
    console.log(`  • ${tableKey} (${table.policies.length} policies)`);
  });
} 