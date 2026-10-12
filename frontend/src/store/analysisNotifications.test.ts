import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { checkAnalysisCompletion as tick, useAnalysisNotifications as store } from './analysisNotifications';
import { AnalysisAccessError, type AnalysisStatus } from '../types/analysisLifecycle';
const status = (state: AnalysisStatus['status'] = 'running', created_at = 'time-1'): AnalysisStatus => ({ id: 'run', created_at, status: state, progress: null });
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  store.setState({ userId: null, pending: null, handled: [], ready: null });
});
afterEach(() => vi.unstubAllGlobals());
const results = async () => ({ top_5: [{ ticker: 'AAPL' }] });
const check = (s: AnalysisStatus) => tick('user', async () => s, results);
async function register() { store.getState().register('user', 'run'); await check(status()); }

it('requires completion and results, and notifies once', async () => {
  await register(); await check(status()); expect(store.getState().ready).toBeNull();
  await check(status('complete')); expect(store.getState().ready).toBe('run:time-1');
  store.getState().dismiss(); store.getState().register('user', 'run');
  await check(status('complete')); await check(status('complete'));
  expect(store.getState().ready).toBeNull(); expect(store.getState().handled).toEqual(['run:time-1']);
});
it('tracks independently of page mounting and recovers after refresh', async () => {
  await register();
  store.setState({ userId: null, pending: null, handled: [], ready: null });
  store.getState().activate('user'); expect(store.getState().pending?.createdAt).toBe('time-1');
  await check(status('complete')); store.getState().dismiss();
  store.setState({ userId: null, pending: null, handled: [], ready: null });
  store.getState().activate('user'); expect(store.getState().handled).toEqual(['run:time-1']); expect(store.getState().ready).toBeNull();
});
it('does not notify old completed runs at login', async () => {
  store.getState().activate('user'); const read = vi.fn(async () => status('complete'));
  await tick('user', read, results); expect(read).not.toHaveBeenCalled();
});
it('attaches already-running registrations without losing identity', async () => {
  await register(); const pending = store.getState().pending;
  store.getState().register('user', 'run'); expect(store.getState().pending).toBe(pending);
  await check(status('complete')); expect(store.getState().handled).toHaveLength(1);
});
it('allows reused run IDs with new timestamps', async () => {
  await register(); await check(status('complete')); store.getState().register('user', 'run');
  await check(status('running', 'time-2')); await check(status('complete', 'time-2'));
  expect(store.getState().handled).toEqual(['run:time-1', 'run:time-2']);
});
it('rejects replacement executions before or during results', async () => {
  await register(); await check(status('complete', 'time-2')); expect(store.getState().ready).toBeNull();
  await register(); const read = vi.fn().mockResolvedValueOnce(status('complete')).mockResolvedValueOnce(status('running', 'time-2'));
  await tick('user', read, results); expect(store.getState().ready).toBeNull(); expect(store.getState().pending).toBeNull();
});
it('waits for nonempty results', async () => {
  await register(); await tick('user', async () => status('complete'), async () => ({ top_5: [] }));
  expect(store.getState().ready).toBeNull(); expect(store.getState().pending).not.toBeNull();
  await check(status('complete')); expect(store.getState().ready).not.toBeNull();
});
it('stops failures and access denial', async () => {
  await register(); await check(status('failed')); expect(store.getState().pending).toBeNull();
  await register(); await tick('user', async () => { throw new AnalysisAccessError(); }, results);
  expect(store.getState().pending).toBeNull(); expect(store.getState().ready).toBeNull();
});
it('retries transient status and result errors', async () => {
  await register(); await tick('user', async () => { throw Error('network'); }, results);
  await tick('user', async () => status('complete'), async () => { throw Error('network'); });
  expect(store.getState().pending).not.toBeNull(); expect(store.getState().ready).toBeNull();
  await check(status('complete')); expect(store.getState().ready).not.toBeNull();
});
it('ignores late responses after logout and account switching', async () => {
  await register(); let resolve!: (s: AnalysisStatus) => void;
  const work = tick('user', () => new Promise(r => { resolve = r; }), results);
  store.getState().clear(); store.getState().activate('other'); resolve(status('complete')); await work;
  expect(store.getState().ready).toBeNull(); expect(store.getState().userId).toBe('other');
  store.getState().activate('user'); expect(store.getState().pending).toBeNull();
});
it('tolerates corrupt or unavailable storage', () => {
  storage.set('alphaswarm:analysis-notifications:user', '{bad'); store.getState().activate('user');
  expect(store.getState().pending).toBeNull();
  vi.stubGlobal('sessionStorage', { setItem: () => { throw Error(); } });
  expect(() => store.getState().register('user', 'run')).not.toThrow();
});
