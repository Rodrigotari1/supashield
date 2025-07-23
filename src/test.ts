import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { parse } from 'yaml';
import { connectReadOnly } from './utils/db.js';
import { probe } from './utils/simulate.js';
import type { PolicyConfig, PolicyMatrix } from './utils/types.js';

export const testCommand = new Command('test')
  .description('Run policy tests against database')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--table <table>', 'Test only specific table (e.g. public.todos)')
  .action(async (options) => {
    const dbUrl = options.url || process.env.DATABASE_URL;
    
    if (!dbUrl) {
      console.error('❌ Error: Database URL is required. Use --url or set DATABASE_URL env var.');
      process.exit(1);
    }

    try {
      // Load policy configuration
      console.log('📋 Loading policy configuration...');
      const yamlContent = await readFile('.supasec/policy.yaml', 'utf-8');
      const config: PolicyConfig = parse(yamlContent);
      
      const pool = await connectReadOnly(dbUrl);
      
      console.log('🧪 Running policy tests...');
      const matrix: PolicyMatrix = {};
      
      const operations = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
      let totalTests = 0;
      let passedTests = 0;
      let failedTests = 0;
      
      for (const [tableKey, tableConfig] of Object.entries(config.tables)) {
        // Skip if testing specific table and this isn't it
        if (options.table && tableKey !== options.table) {
          continue;
        }
        
        console.log(`\n🔍 Testing ${tableKey}:`);
        matrix[tableKey] = {};
        
        const [schema, table] = tableKey.split('.');
        
        for (const scenario of tableConfig.test_scenarios) {
          console.log(`  👤 ${scenario.name}:`);
          
          for (const operation of operations) {
            const expected = scenario.expected[operation];
            if (!expected) continue; // Skip if no expectation set
            
            totalTests++;
            
            try {
              const result = await probe(pool, schema, table, operation, scenario.jwt_claims);
              const testKey = `${scenario.name}_${operation}`;
              matrix[tableKey][testKey] = result;
              
              const passed = result === expected;
              if (passed) {
                console.log(`    ✅ ${operation}: ${result} (expected ${expected})`);
                passedTests++;
              } else {
                console.log(`    ❌ ${operation}: ${result} (expected ${expected}) - MISMATCH!`);
                failedTests++;
              }
              
            } catch (error) {
              console.log(`    🔥 ${operation}: ERROR - ${error instanceof Error ? error.message : error}`);
              matrix[tableKey][`${scenario.name}_${operation}`] = 'ERROR';
              failedTests++;
            }
          }
        }
      }
      
      await pool.end();
      
      // Summary
      console.log(`\n📊 Test Results:`);
      console.log(`  Total tests: ${totalTests}`);
      console.log(`  Passed: ${passedTests} ✅`);
      console.log(`  Failed: ${failedTests} ❌`);
      
      if (failedTests > 0) {
        console.log(`\n⚠️  ${failedTests} policy mismatches detected!`);
        console.log('💡 Review your RLS policies or update expected results in policy.yaml');
        process.exit(1);
      } else {
        console.log('\n🎉 All policy tests passed!');
      }
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }); 