import chalk from 'chalk';
import ora, { Ora } from 'ora';

// --- Interfaces ---
export interface Logger {
  start(text: string): void;
  succeed(text: string): void;
  fail(text: string): void;
  info(text: string): void;
  warn(text: string): void;
  error(text: string, error?: unknown): void;
  raw(text: string): void;
  getSpinner(): Ora;
}

// --- Factory ---
/**
 * Creates a new logger instance.
 * @param verbose - Whether to enable verbose logging.
 * @returns A logger instance.
 */
export function createLogger(verbose = false): Logger {
  let spinner = ora({ isSilent: !process.stdout.isTTY });

  return {
    start: (text: string) => {
      spinner.start(text);
    },
    succeed: (text: string) => {
      spinner.succeed(chalk.green(text));
    },
    fail: (text: string) => {
      spinner.fail(chalk.red(text));
    },
    info: (text: string) => {
      console.log(chalk.blue(`INFO: ${text}`));
    },
    warn: (text: string) => {
      console.log(chalk.yellow(`WARNING: ${text}`));
    },
    error: (text: string, error?: unknown) => {
      console.error(chalk.red(`ERROR: ${text}`));
      if (verbose && error instanceof Error) {
        console.error(chalk.gray(error.stack || error.message));
      }
    },
    raw: (text: string) => {
      console.log(text);
    },
    getSpinner: () => spinner,
  };
}

// --- Test Result Formatting ---
/**
 * Formats a single test result for console output.
 * @param result - The detailed test result.
 * @returns A formatted string.
 */
export function formatTestResult(result: {
  passed: boolean;
  operation: string;
  actual: string;
  expected: string;
  error_message?: string;
}): string {
  const operation = result.operation.padEnd(6, ' ');
  
  // Handle SKIPPED separately
  if (result.actual === 'SKIPPED') {
    const reason = result.error_message || 'Could not seed test data';
    return `    ${chalk.yellow('SKIP')} ${operation}: ${chalk.yellow(reason)}`;
  }
  
  const status = result.passed ? 'PASS' : 'FAIL';
  const statusColor = result.passed ? chalk.green(status) : chalk.red(status);
  const details = result.passed
    ? chalk.green(`${result.actual} (expected ${result.expected})`)
    : chalk.red(`${result.actual} (expected ${result.expected}) - MISMATCH!`);

  return `    ${statusColor} ${operation}: ${details}`;
}

/**
 * Formats the final summary of all test results.
 * @param results - The aggregated test results.
 * @returns A formatted string for the summary.
 */
export function formatSummary(results: {
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  error_tests: number;
  skipped_tests?: number;
  execution_time_ms: number;
}): string {
  const summary = [
    chalk.bold('\nTest Results:'),
    `  Total tests: ${results.total_tests}`,
    chalk.green(`  Passed: ${results.passed_tests}`),
    chalk.red(`  Failed: ${results.failed_tests}`),
  ];

  if (results.skipped_tests && results.skipped_tests > 0) {
    summary.push(chalk.yellow(`  Skipped: ${results.skipped_tests} (tables need test data - run 'supashield audit' for details)`));
  }

  if (results.error_tests > 0) {
    summary.push(chalk.red.bold(`  Errors: ${results.error_tests}`));
  }

  summary.push(`  Execution time: ${Math.round(results.execution_time_ms)}ms`);

  return summary.join('\n');
}

// --- Table Formatting ---
/**
 * Formats a list of discovered tables for console output.
 * @param tables - An array of tables with their schema and policy count.
 * @returns A formatted string.
 */
export function formatDiscoveredTables(tables: Array<{
  schema: string;
  name: string;
  policies: any[];
}>): string {
  const formattedTables = tables.map(table => {
    const tableKey = `${table.schema}.${table.name}`;
    return `  - ${tableKey} (${table.policies.length} policies)`;
  });

  return `\nFound tables:\n${formattedTables.join('\n')}`;
}

/**
 * Formats a list of discovered storage buckets for console output.
 * @param buckets - An array of storage buckets with their policy count.
 * @returns A formatted string.
 */
export function formatDiscoveredBuckets(buckets: Array<{
  name: string;
  public: boolean;
  policies: any[];
}>): string {
  const formattedBuckets = buckets.map(bucket => {
    const publicStatus = bucket.public ? 'public' : 'private';
    return `  - ${bucket.name} (${bucket.policies.length} policies, ${publicStatus})`;
  });

  return `\nFound storage buckets:\n${formattedBuckets.join('\n')}`;
} 