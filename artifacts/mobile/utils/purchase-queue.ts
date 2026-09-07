/** Identity changes and transactions share one SDK; never overlap them. */
export function createPurchaseQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      const result = tail.then(operation);
      tail = result.catch(() => {});
      return result;
    },
  };
}
