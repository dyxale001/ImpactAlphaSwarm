import { describe, expect, it, vi } from 'vitest';
import { ResponseCache } from './responseCache';

// A clock the test moves by hand, so freshness is checked without waiting.
function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('ResponseCache', () => {
  it('stores an answer and serves it as fresh inside its window', async () => {
    const c = clock();
    const cache = new ResponseCache(c.now);
    await cache.load('k', async () => 'a', () => 1000);

    expect(cache.get('k')).toEqual({ value: 'a', fresh: true });
    c.advance(999);
    expect(cache.get('k')?.fresh).toBe(true);
  });

  it('keeps serving an answer past its window, marked stale', async () => {
    const c = clock();
    const cache = new ResponseCache(c.now);
    await cache.load('k', async () => 'a', () => 1000);

    c.advance(1000);
    expect(cache.get('k')).toEqual({ value: 'a', fresh: false });
  });

  it('never goes stale when the answer is fresh for ever', async () => {
    const c = clock();
    const cache = new ResponseCache(c.now);
    await cache.load('k', async () => 'settled', () => Infinity);

    c.advance(365 * 24 * 60 * 60 * 1000);
    expect(cache.get('k')?.fresh).toBe(true);
  });

  it('does not store an answer fresh for no time, and drops the one it replaces', async () => {
    const cache = new ResponseCache(clock().now);
    await cache.load('k', async () => 'empty', () => 0);
    expect(cache.get('k')).toBeUndefined();

    await cache.load('k', async () => 'kept', () => 1000);
    await cache.load('k', async () => 'empty', () => 0);
    expect(cache.get('k')).toBeUndefined();
  });

  it('decides freshness from the answer itself', async () => {
    const cache = new ResponseCache(clock().now);
    const freshFor = (v: { final: boolean }) => (v.final ? Infinity : 0);
    await cache.load('today', async () => ({ final: false }), freshFor);
    await cache.load('yesterday', async () => ({ final: true }), freshFor);

    expect(cache.get('today')).toBeUndefined();
    expect(cache.get('yesterday')?.value).toEqual({ final: true });
  });

  it('replaces a stale answer with the new one on refresh', async () => {
    const c = clock();
    const cache = new ResponseCache(c.now);
    await cache.load('k', async () => 'old', () => 1000);
    c.advance(2000);
    await cache.load('k', async () => 'new', () => 1000);

    expect(cache.get('k')).toEqual({ value: 'new', fresh: true });
  });

  it('shares one request between callers asking for the same key at once', async () => {
    const cache = new ResponseCache(clock().now);
    const fetcher = vi.fn(async () => 'a');
    const [first, second] = await Promise.all([
      cache.load('k', fetcher, () => 1000),
      cache.load('k', fetcher, () => 1000),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toBe('a');
    expect(second).toBe('a');
  });

  it('asks again once the shared request has settled', async () => {
    const cache = new ResponseCache(clock().now);
    const fetcher = vi.fn(async () => 'a');
    await cache.load('k', fetcher, () => 0);
    await cache.load('k', fetcher, () => 0);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the stored answer when a refresh fails, and can be asked again after', async () => {
    const c = clock();
    const cache = new ResponseCache(c.now);
    await cache.load('k', async () => 'good', () => 1000);
    c.advance(2000);

    await expect(
      cache.load('k', async () => { throw new Error('down'); }, () => 1000),
    ).rejects.toThrow('down');
    expect(cache.get('k')).toEqual({ value: 'good', fresh: false });

    await cache.load('k', async () => 'back', () => 1000);
    expect(cache.get('k')?.value).toBe('back');
  });

  it('keeps keys apart', async () => {
    const cache = new ResponseCache(clock().now);
    await cache.load('whale-trace:insiders:AAPL', async () => 'insiders', () => 1000);
    await cache.load('whale-trace:institutions:AAPL', async () => 'institutions', () => 1000);

    expect(cache.get('whale-trace:insiders:AAPL')?.value).toBe('insiders');
    expect(cache.get('whale-trace:institutions:AAPL')?.value).toBe('institutions');
    expect(cache.get('whale-trace:insiders:MSFT')).toBeUndefined();
  });
});
