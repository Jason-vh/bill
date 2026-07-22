// Stale-while-revalidate TTL cache with in-flight de-duplication.
//
// Once a value has been fetched, callers get it back instantly — even after the
// TTL expires — while a single background refresh updates it. Only a genuine
// cold miss (nothing cached yet) blocks on the upstream YNAB call. Concurrent
// callers never trigger more than one in-flight fetch per entry.

type Entry<T> = { value?: T; expiresAt: number; inflight?: Promise<T> };

function read<T>(entry: Entry<T>, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const fresh = entry.value !== undefined && Date.now() < entry.expiresAt;

  // Kick off a refresh when stale (or cold) and none is already running.
  if (!fresh && !entry.inflight) {
    entry.inflight = fn()
      .then((result) => {
        entry.value = result;
        entry.expiresAt = Date.now() + ttlMs;
        return result;
      })
      .finally(() => {
        entry.inflight = undefined;
      });
    // Swallow rejections on the background path so a failed refresh keeps
    // serving stale data instead of surfacing an unhandled rejection.
    entry.inflight.catch(() => undefined);
  }

  // Stale-while-revalidate: serve any cached value immediately.
  if (entry.value !== undefined) return Promise.resolve(entry.value);

  // Cold miss: nothing cached yet, so wait for the in-flight fetch.
  return entry.inflight as Promise<T>;
}

export function cached<T>(ttlMs: number, fn: () => Promise<T>): () => Promise<T> {
  const entry: Entry<T> = { expiresAt: 0 };
  return () => read(entry, ttlMs, fn);
}

/**
 * Like `cached`, but keyed: each distinct key gets its own stale-while-revalidate
 * entry and in-flight de-duplication. Used to cache per-month YNAB fetches
 * independently.
 */
export function cachedBy<T>(ttlMs: number, fn: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const entries = new Map<string, Entry<T>>();

  return (key) => {
    let entry = entries.get(key);
    if (!entry) {
      entry = { expiresAt: 0 };
      entries.set(key, entry);
    }
    return read(entry, ttlMs, () => fn(key));
  };
}
