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

/**
 * Like `cached`, but keyed: each distinct key gets its own TTL entry and
 * in-flight de-duplication. Used to cache per-month YNAB fetches independently.
 */
export function cachedBy<T>(ttlMs: number, fn: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const entries = new Map<string, { value?: T; expiresAt: number; inflight?: Promise<T> }>();

  return (key) => {
    let entry = entries.get(key);
    if (!entry) {
      entry = { expiresAt: 0 };
      entries.set(key, entry);
    }

    if (entry.value !== undefined && Date.now() < entry.expiresAt) return Promise.resolve(entry.value);
    if (entry.inflight) return entry.inflight;

    entry.inflight = fn(key)
      .then((result) => {
        entry.value = result;
        entry.expiresAt = Date.now() + ttlMs;
        return result;
      })
      .finally(() => {
        entry.inflight = undefined;
      });

    return entry.inflight;
  };
}
