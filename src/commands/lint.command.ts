import { Command } from 'commander';
import { withDatabaseConnection } from '../shared/command-utils.js';
import { lintPolicies, type LintResults, type LintIssue } from '../core/lint.js';

export const lintCommand = new Command('lint')
  .description('Static analysis of RLS policy expressions for security issues')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--all-schemas', 'Include system tables (auth, storage, etc.)')
  .option('--verbose', 'Enable verbose logging')
  .option('--json', 'Output results as JSON')
  .action(async (options) => {
    await withDatabaseConnection(options, async ({ pool, logger }) => {
      logger.start('Linting RLS policies...');

      const client = await pool.connect();
      let results: LintResults;

      try {
        results = await lintPolicies(client, options.allSchemas || false);
      } finally {
        client.release();
      }

      logger.succeed('Policy linting complete.');

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        displayLintResults(results);
      }

      const hasCriticalOrHigh = results.criticalCount > 0 || results.highCount > 0;
      if (hasCriticalOrHigh) {
        process.exit(1);
      }
    });
  });

function displayLintResults(results: LintResults): void {
  console.log('\nPolicy Lint Results:');

  if (results.totalIssues === 0) {
    console.log('  No issues found\n');
    return;
  }

  console.log(`  Found ${results.totalIssues} issue(s) ` +
    `(${results.criticalCount} critical, ${results.highCount} high, ${results.mediumCount} medium)\n`);

  const groupedIssues = groupIssuesBySeverity(results.issues);

  for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const) {
    const issues = groupedIssues[severity];
    if (issues.length === 0) continue;

    displayIssuesForSeverity(severity, issues);
  }
}

function groupIssuesBySeverity(issues: LintIssue[]): Record<string, LintIssue[]> {
  return issues.reduce((acc, issue) => {
    if (!acc[issue.severity]) {
      acc[issue.severity] = [];
    }
    acc[issue.severity].push(issue);
    return acc;
  }, {} as Record<string, LintIssue[]>);
}

function displayIssuesForSeverity(severity: string, issues: LintIssue[]): void {
  const title = formatSeverityTitle(severity);
  console.log(`${severity}: ${title}`);

  for (const issue of issues) {
    console.log(`  Policy: ${issue.policy}`);
    console.log(`  Issue: ${issue.issue}`);
    if (issue.expression) {
      console.log(`  Expression: ${issue.expression}`);
    }
    console.log(`  Fix: ${issue.fix}`);
    console.log('');
  }
}

function formatSeverityTitle(severity: string): string {
  const titles: Record<string, string> = {
    CRITICAL: 'Always-true policies or critical security flaws',
    HIGH: 'Missing authentication checks',
    MEDIUM: 'Policy configuration issues',
    LOW: 'Minor issues'
  };
  return titles[severity] || '';
}
