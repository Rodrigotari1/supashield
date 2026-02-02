import type { TestResults, TestResultDetail } from './types.js';
import type { Logger } from './logger.js';

export interface JsonOutput {
  verdict: 'SECURE' | 'INSECURE';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    execution_time_ms: number;
  };
  issues: Array<{
    severity: 'CRITICAL' | 'HIGH';
    table: string;
    scenario: string;
    operation: string;
    expected: string;
    actual: string;
    diagnosis: string;
    suggested_fix: string | null;
  }>;
  skipped: Array<{
    table: string;
    operation: string;
    reason: string;
  }>;
}

export function formatTestResultsAsJson(results: TestResults): JsonOutput {
  const failures = results.detailed_results.filter(r => !r.passed && r.actual !== 'SKIPPED');
  const skipped = results.detailed_results.filter(r => r.actual === 'SKIPPED');
  
  return {
    verdict: results.failed_tests === 0 && results.error_tests === 0 ? 'SECURE' : 'INSECURE',
    summary: {
      total: results.total_tests,
      passed: results.passed_tests,
      failed: results.failed_tests,
      skipped: results.skipped_tests,
      errors: results.error_tests,
      execution_time_ms: Math.round(results.execution_time_ms),
    },
    issues: failures.map(f => ({
      severity: f.actual === 'ALLOW' && f.expected === 'DENY' ? 'CRITICAL' as const : 'HIGH' as const,
      table: f.table_key,
      scenario: f.scenario_name,
      operation: f.operation,
      expected: f.expected,
      actual: f.actual,
      diagnosis: getDiagnosis(f),
      suggested_fix: getSuggestedFix(f),
    })),
    skipped: skipped.map(s => ({
      table: s.table_key,
      operation: s.operation,
      reason: s.error_message || 'Unknown',
    })),
  };
}

export function printTestResultsForHumans(results: TestResults, logger: Logger, quiet: boolean): void {
  const failures = results.detailed_results.filter(r => !r.passed && r.actual !== 'SKIPPED');
  const critical = failures.filter(f => f.actual === 'ALLOW' && f.expected === 'DENY');
  
  console.log('');
  if (results.failed_tests === 0 && results.error_tests === 0) {
    console.log('SECURE - All policy tests passed');
  } else if (critical.length > 0) {
    console.log(`INSECURE - ${critical.length} critical issue(s) found`);
  } else {
    console.log(`WARNING - ${results.failed_tests} policy mismatch(es) detected`);
  }
  console.log('');
  
  if (critical.length > 0) {
    console.log('CRITICAL ISSUES (potential data leaks):');
    for (const issue of critical) {
      console.log(`  ${issue.table_key}: ${issue.scenario_name} can ${issue.operation}`);
      console.log(`    ${getDiagnosis(issue)}`);
      const fix = getSuggestedFix(issue);
      if (fix) console.log(`    FIX: ${fix}`);
      console.log('');
    }
  }
  
  const otherFailures = failures.filter(f => !(f.actual === 'ALLOW' && f.expected === 'DENY'));
  if (otherFailures.length > 0 && !quiet) {
    console.log('OTHER MISMATCHES:');
    for (const issue of otherFailures) {
      console.log(`  ${issue.table_key}: ${issue.scenario_name}.${issue.operation} = ${issue.actual} (expected ${issue.expected})`);
    }
    console.log('');
  }
  
  if (results.skipped_tests > 0 && !quiet) {
    console.log(`SKIPPED: ${results.skipped_tests} tests (FK constraints or missing test data)`);
    console.log('');
  }
  
  console.log(`Tests: ${results.passed_tests} passed, ${results.failed_tests} failed, ${results.skipped_tests} skipped (${Math.round(results.execution_time_ms)}ms)`);
}

function getDiagnosis(result: TestResultDetail): string {
  if (result.actual === 'ALLOW' && result.expected === 'DENY') {
    if (result.scenario_name.includes('anonymous')) {
      return 'Anonymous users can access this data - missing RLS policy';
    }
    return 'Access granted when it should be denied';
  }
  if (result.actual === 'DENY' && result.expected === 'ALLOW') {
    return 'Access denied - RLS policy may be too restrictive';
  }
  return 'Unexpected behavior';
}

function getSuggestedFix(result: TestResultDetail): string | null {
  if (result.actual === 'ALLOW' && result.expected === 'DENY') {
    const [schema, table] = result.table_key.split('.');
    if (result.scenario_name.includes('anonymous')) {
      return `CREATE POLICY "${table}_deny_anon_${result.operation.toLowerCase()}" ON ${result.table_key} FOR ${result.operation} TO anon USING (false);`;
    }
    return `CREATE POLICY "${table}_${result.operation.toLowerCase()}" ON ${result.table_key} FOR ${result.operation} USING (auth.uid() = user_id);`;
  }
  return null;
}
