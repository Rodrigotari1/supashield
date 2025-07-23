export interface PolicyMatrix {
  [table: string]: Record<string, boolean>;
}

export function diffMatrix(
  previous: PolicyMatrix,
  current: PolicyMatrix,
): { leaks: string[] } {
  // TODO: naive diff placeholder
  return { leaks: [] };
} 