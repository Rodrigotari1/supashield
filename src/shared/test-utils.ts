import type { TestResults, TestResultDetail } from './types.js';
import type { Logger } from './logger.js';
import { CONSOLE_MESSAGES } from './constants.js';

export function updateTestCounters(
  results: TestResults, 
  result: TestResultDetail
): void {
  results.total_tests++;
  if (result.passed) {
    results.passed_tests++;
  } else if (result.actual === 'ERROR') {
    results.error_tests++;
  } else {
    results.failed_tests++;
  }
}

export function exitWithTestResults(
  results: TestResults, 
  logger: Logger
): never {
  const totalFailures = results.failed_tests + results.error_tests;
  if (totalFailures > 0) {
    logger.error(CONSOLE_MESSAGES.ERROR_MISMATCHES_DETECTED(totalFailures));
    logger.info(CONSOLE_MESSAGES.REVIEW_POLICIES);
    process.exit(1);
  } else {
    logger.succeed(CONSOLE_MESSAGES.SUCCESS_ALL_PASSED);
    process.exit(0);
  }
}

export async function loadPolicyConfig(): Promise<any> {
  const { readFile } = await import('fs/promises');
  const { parse } = await import('yaml');
  const { FILE_PATHS } = await import('./constants.js');
  
  const yamlContent = await readFile(FILE_PATHS.POLICY_CONFIG_FILE, 'utf-8');
  return parse(yamlContent);
}

