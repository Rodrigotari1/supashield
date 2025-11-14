import 'dotenv/config';
import { Command } from 'commander';
import { initCommand } from './commands/init.command.js';
import { testCommand } from './commands/test.command.js';
import { testStorageCommand } from './commands/test-storage.command.js';
import { exportPgtapCommand } from './commands/export-pgtap.command.js';
import { auditCommand } from './commands/audit.command.js';

const program = new Command();

program
  .name('supashield')
  .description('Security testing for Supabase RLS policies - catch data leaks before production');

// Quick command to list users for testing
program
  .command('users')
  .description('List users from auth.users table for testing')
  .option('-u, --url <url>', 'Database connection URL')
  .action(async (options) => {
    const { createDatabaseConnectionConfig, establishValidatedDatabaseConnection } = await import('./core/db.js');
    const dbUrl = options.url || process.env.SUPASHIELD_DATABASE_URL || process.env.DATABASE_URL;
    
    if (!dbUrl) {
      console.log('Database URL is required. Use --url or set DATABASE_URL env var.');
      process.exit(1);
    }
    
    try {
      const connectionConfig = createDatabaseConnectionConfig(dbUrl);
      const pool = await establishValidatedDatabaseConnection(connectionConfig);
      
      const client = await pool.connect();
      const { rows } = await client.query('SELECT email, id, created_at FROM auth.users ORDER BY created_at DESC LIMIT 10');
      client.release();
      await pool.end();
      
      if (rows.length === 0) {
        console.log('No users found in auth.users table');
      } else {
        console.log('Found users:');
        rows.forEach((user: any) => {
          console.log(`  - ${user.email} (${user.id})`);
        });
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program.addCommand(auditCommand);
program.addCommand(initCommand);
program.addCommand(testCommand);
program.addCommand(testStorageCommand);
program.addCommand(exportPgtapCommand);

program.parse(); 