// Answers from the read-only research endpoints, kept for the life of the page.
//
// The asset page renders only the tab being read, so leaving a tab unmounts its panels
// and any state they held. Without this, every return to a tab showed a skeleton while
// it asked the server for text it already had a moment ago. Held at module level, so an
// answer survives the panel that asked for it; a full reload starts empty.
//
// Each answer is stored with how long it stays fresh, decided from the answer itself by
// the caller. Inside that window it is served as is. Past it, it is still served
// straight away, and the caller asks again in the background and swaps the new answer
// in: a stale paragraph on screen for a second beats a skeleton. An answer fresh for no
// time at all is not stored, which is how a caller says "ask again next time".

type Entry = { value: unknown; freshUntil: number };

export class ResponseCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** The stored answer for a key, fresh or not. */
  get<T>(key: string): { value: T; fresh: boolean } | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    return { value: entry.value as T, fresh: this.now() < entry.freshUntil };
  }

  /**
   * Asks the server, sharing one request between every caller asking for the same key
   * at once (three dashboard widgets on one ticker, or StrictMode's second mount).
   * The answer replaces whatever was stored, so the screen always ends on the latest
   * one. A failure leaves the stored answer where it was.
   */
  load<T>(
    key: string,
    fetcher: () => Promise<T>,
    freshFor: (value: T) => number,
  ): Promise<T> {
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight as Promise<T>;

    const request = fetcher()
      .then((value) => {
        const ms = freshFor(value);
        if (ms > 0) this.entries.set(key, { value, freshUntil: this.now() + ms });
        else this.entries.delete(key);
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }
}

export const MINUTE = 60_000;

export const responseCache = new ResponseCache();
