/**
 * Executes an array of promise-returning functions in parallel with a concurrency limit.
 */
export async function executePromisesInParallel<T>(
  promiseFactories: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let currentIndex = 0;

  const execute = async () => {
    while (currentIndex < promiseFactories.length) {
      const promiseIndex = currentIndex++;
      const result = await promiseFactories[promiseIndex]();
      results[promiseIndex] = result;
    }
  };

  const parallelExecutions = Array(concurrency).fill(null).map(execute);
  await Promise.all(parallelExecutions);

  return results;
} 