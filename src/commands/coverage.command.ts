import { Command } from 'commander';
import chalk from 'chalk';
import { createLogger } from '../shared/logger.js';
import { createDatabaseConnectionConfig, establishValidatedDatabaseConnection } from '../core/db.js';
import { generateCoverageReport, type CoverageReport, type RoleAccess } from '../core/coverage.js';
import { text } from 'stream/consumers';

export const coverageCommand = new Command('coverage')
  .description('Generate a coverage report of RLS policies')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--all-schemas', 'Include system tables')
  .action(async (options) => {
    const logger = createLogger(false); // Verbose false by default for report
    const dbUrl = options.url || process.env.SUPASHIELD_DATABASE_URL || process.env.DATABASE_URL;

    if (!dbUrl) {
      logger.error('Database URL is required. Use --url or set SUPASHIELD_DATABASE_URL env var.');
      process.exit(1);
    }

    try {
      logger.start('Connecting to database...');
      const connectionConfig = createDatabaseConnectionConfig(dbUrl);
      const pool = await establishValidatedDatabaseConnection(connectionConfig);
      logger.succeed('Connected.');

      logger.start('Generating coverage report... (this may take a moment)');
      const report = await generateCoverageReport(pool, {
        includeSystemSchemas: options.allSchemas
      });
      logger.succeed('Report generated.');

      await pool.end();

      printCoverageReport(report);

    } catch (error) {
      logger.error('Failed to generate coverage report.', error);
      process.exit(1);
    }
  });

function printCoverageReport(report: CoverageReport) {
  console.log('');
  printTableHeader();
  
  const warnings = collectWarnings(report);
  printTableRows(report);
  
  console.log('');
  printWarnings(warnings);
}

function printTableHeader() {
  const header = [
    'Table'.padEnd(35),
    'RLS'.padEnd(12),
    'Anonymous'.padEnd(25),
    'Authenticated'
  ].join('');
  
  console.log(chalk.bold(header));
  console.log(chalk.gray('-'.repeat(100)));
}

function printTableRows(report: CoverageReport) {
  report.tables.forEach(table => {
    const tableName = `${table.schema}.${table.name}`;
    const row = [
      tableName.padEnd(35),
      formatRlsStatus(table.rls_enabled),
      formatAccessColumn(table.access.anonymous, 'Anonymous').padEnd(25),
      formatAccessColumn(table.access.authenticated, 'Authenticated')
    ].join('');
    
    console.log(row);
  });
}

function formatRlsStatus(enabled: boolean): string {
  const status = (enabled ? 'ENABLED' : 'DISABLED').padEnd(12);
  return enabled ? chalk.green(status) : chalk.red(status);
}

function formatAccessColumn(access: RoleAccess, roleName: string): string {
  const permissions = getPermissions(access);
  
  if (permissions.length === 0) {
    return chalk.gray('No Access');
  }
  
  if (permissions.length === 4) {
    return chalk.green('Full Access');
  }
  
  const text = permissions.join(', ');
  
  if (roleName === 'Anonymous') {
    return chalk.red(text);
  }
  
  const hasWrites = permissions.some(p => ['Insert', 'Update', 'Delete'].includes(p));
  return hasWrites ? chalk.yellow(text) : chalk.green(text);
}

function getPermissions(access: RoleAccess): string[] {
  const permissions: string[] = [];
  if (access.SELECT === 'ALLOW') permissions.push('Read');
  if (access.INSERT === 'ALLOW') permissions.push('Insert');
  if (access.UPDATE === 'ALLOW') permissions.push('Update');
  if (access.DELETE === 'ALLOW') permissions.push('Delete');
  return permissions;
}

function collectWarnings(report: CoverageReport): string[] {
  return report.tables.flatMap(table => {
    const tableName = `${table.schema}.${table.name}`;
    
    if (!table.rls_enabled) {
      return [`${tableName}: RLS is DISABLED - all data exposed`];
    }
    
    const anonPermissions = getPermissions(table.access.anonymous);
    if (anonPermissions.length > 0) {
      const operations = anonPermissions.map(p => p.toLowerCase()).join(', ');
      return [`${tableName}: Anonymous users can ${operations}`];
    }
    
    return [];
  });
}

function printWarnings(warnings: string[]) {
  if (warnings.length === 0) {
    console.log(chalk.green('✓ No security warnings detected'));
    console.log('');
    return;
  }
  
  console.log(chalk.red.bold(`SECURITY WARNINGS (${warnings.length}):`));
  warnings.forEach(warning => {
    console.log(chalk.red(`  • ${warning}`));
  });
  console.log('');
}

