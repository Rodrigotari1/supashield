import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { FILE_PATHS } from './constants.js';
import type { DatabaseOperation, PolicySnapshot } from './types.js';

export interface SnapshotComparisonResult {
  isIdentical: boolean;
  leaks: string[];
  regressions: string[];
  newlyIntroduced: string[];
}

export async function loadPolicySnapshotFromFile(): Promise<PolicySnapshot | undefined> {
  if (!existsSync(FILE_PATHS.SNAPSHOT_FILE)) {
    return undefined;
  }
  const content = await readFile(FILE_PATHS.SNAPSHOT_FILE, 'utf-8');
  return JSON.parse(content);
}

export function compareSnapshots(
  previous: PolicySnapshot,
  current: PolicySnapshot
): SnapshotComparisonResult {
  const result: SnapshotComparisonResult = {
    isIdentical: true,
    leaks: [],
    regressions: [],
    newlyIntroduced: [],
  };

  for (const tableKey in current) {
    for (const scenarioName in current[tableKey]) {
      for (const operation in current[tableKey][scenarioName]) {
        const op = operation as DatabaseOperation;
        const currentResult = current[tableKey][scenarioName][op];
        const previousResult = previous[tableKey]?.[scenarioName]?.[op];

        const message = `  - ${tableKey} -> ${scenarioName} -> ${operation}`;

        if (previousResult === undefined) {
          result.newlyIntroduced.push(`${message} (is now ${currentResult})`);
          result.isIdentical = false;
        } else if (currentResult !== previousResult) {
          if (currentResult === 'ALLOW' && previousResult === 'DENY') {
            result.leaks.push(`${message} (changed from DENY to ALLOW)`);
          } else {
            result.regressions.push(
              `${message} (changed from ${previousResult} to ${currentResult})`
            );
          }
          result.isIdentical = false;
        }
      }
    }
  }

  return result;
} 