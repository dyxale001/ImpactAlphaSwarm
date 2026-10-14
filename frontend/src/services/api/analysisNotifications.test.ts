import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { startAnalysis, getStatus } from './analysis';
import { useAnalysisNotifications } from '../../store/analysisNotifications';
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: { id: 'user' } as { id: string } | null }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: mocks.session } } }));
vi.mock('../../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: mocks.user }) } }));
const request = vi.fn();
let sequence = 0;
beforeEach(() => {
  request.mockReset(); mocks.user = { id: 'user' };
  mocks.session.mockResolvedValue({ data: { session: { access_token: `token-${++sequence}`, user: { id: 'user' } } } });
  vi.stubGlobal('fetch', request);
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  useAnalysisNotifications.setState({ userId: null, pending: null, ready: null, handled: [] });
});
afterEach(() => vi.unstubAllGlobals());
it.each([false, true])('registers returned execution, including already_running=%s', async already_running => {
  request.mockResolvedValueOnce(new Response(JSON.stringify({ run_id: 'run', already_running })));
  request.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'run', created_at: 'time', status: 'running', progress: null })));
  expect(await startAnalysis({ universes: [] })).toEqual({ run_id: 'run', already_running });
  expect(useAnalysisNotifications.getState().pending).toEqual({ runId: 'run', createdAt: 'time' });
});
it('shares progress status reads but bypasses snapshots for verification', async () => {
  request.mockImplementation(async () => new Response(JSON.stringify({ id: 'run', created_at: 'time', status: 'running', progress: null })));
  await Promise.all([getStatus('run'), getStatus('run')]); expect(request).toHaveBeenCalledTimes(1);
  await getStatus('run', true); expect(request).toHaveBeenCalledTimes(2);
});
it('does not register a late start response after logout', async () => {
  request.mockImplementation(async () => { mocks.user = null; return new Response(JSON.stringify({ run_id: 'run' })); });
  await startAnalysis({ universes: [] });
  expect(useAnalysisNotifications.getState().pending).toBeNull();
});
it('keeps pending registration after a transient identity lookup error', async () => {
  request.mockResolvedValueOnce(new Response(JSON.stringify({ run_id: 'run' }))).mockRejectedValueOnce(Error('network'));
  await startAnalysis({ universes: [] });
  expect(useAnalysisNotifications.getState().pending).toEqual({ runId: 'run', createdAt: null });
});
