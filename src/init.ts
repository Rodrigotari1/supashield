import { Command } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import { stringify } from 'yaml';
import { connectReadOnly } from './utils/db.js';
import { introspectSchema } from './utils/introspect.js';
import type { PolicyConfig } from './utils/types.js';

export const initCommand = new Command('init')
  .description('Introspect database schema and scaffold policy.yaml')
  .option('-u, --url <url>', 'Database connection URL')
  .action(async (options) => {
    const dbUrl = options.url || process.env.DATABASE_URL;
    
    if (!dbUrl) {
      console.error('❌ Error: Database URL is required. Use --url or set DATABASE_URL env var.');
      process.exit(1);
    }

    try {
      console.log('🔍 Connecting to database...');
      const pool = await connectReadOnly(dbUrl);
      
      console.log('📊 Introspecting schema...');
      const tables = await introspectSchema(pool);
      await pool.end();

      if (tables.length === 0) {
        console.log('⚠️  No tables with RLS enabled found.');
        return;
      }

      // Create .supasec directory
      await mkdir('.supasec', { recursive: true });

      // Generate policy config
      const config: PolicyConfig = {
        tables: {},
      };

      tables.forEach((table) => {
        const tableKey = `${table.schema}.${table.name}`;
        config.tables[tableKey] = {
          test_scenarios: [
            {
              name: 'anonymous_user',
              jwt_claims: {},
              expected: {
                SELECT: 'DENY',
                INSERT: 'DENY', 
                UPDATE: 'DENY',
                DELETE: 'DENY',
              },
            },
            {
              name: 'authenticated_user',
              jwt_claims: { sub: 'user-123', role: 'authenticated' },
              expected: {
                SELECT: 'ALLOW',
                INSERT: 'ALLOW',
                UPDATE: 'ALLOW',
                DELETE: 'ALLOW',
              },
            },
          ],
        };
      });

      const yamlContent = stringify(config, { indent: 2 });
      await writeFile('.supasec/policy.yaml', yamlContent);

      console.log(`✅ Generated .supasec/policy.yaml with ${tables.length} tables`);
      console.log('📝 Edit the file to customize test scenarios and expected permissions');
      
      // Show found tables
      console.log('\n📋 Found tables:');
      tables.forEach(table => {
        console.log(`  • ${table.schema}.${table.name} (${table.policies.length} policies)`);
      });
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }); 