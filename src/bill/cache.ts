// Tiny single-value TTL cache with in-flight de-duplication, so concurrent
// requests never trigger more than one upstream YNAB call.

export function cached<T>(ttlMs: number, fn: () => Promise<T>): () => Promise<T> {
  let value: T | undefined;
  let expiresAt = 0;
  let inflight: Promise<T> | undefined;

  return () => {
    if (value !== undefined && Date.now() < expiresAt) return Promise.resolve(value);
    if (inflight) return inflight;

    inflight = fn()
      .then((result) => {
        value = result;
        expiresAt = Date.now() + ttlMs;
        return result;
      })
      .finally(() => {
        inflight = undefined;
      });

    return inflight;
  };
}
