import { create } from 'zustand';
import { AnalysisAccessError, getAnalysisExecutionIdentity } from '../types/analysisLifecycle';
import type { AnalysisStatus } from '../types/analysisLifecycle';

export interface PendingAnalysis { runId: string; createdAt: string | null }
interface Tracking { pending: PendingAnalysis | null; handled: string[]; ready: string | null }
const empty = (): Tracking => ({ pending: null, handled: [], ready: null });
const key = (userId: string) => `alphaswarm:analysis-notifications:${userId}`;
function read(userId: string): Tracking {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(userId)) ?? 'null');
    if (!value) return empty();
    const pending = value.pending;
    return {
      pending: pending && typeof pending.runId === 'string' && (pending.createdAt === null || typeof pending.createdAt === 'string') ? pending : null,
      handled: Array.isArray(value.handled) ? value.handled.filter((s: unknown) => typeof s === 'string').slice(-50) : [],
      ready: typeof value.ready === 'string' ? value.ready : null,
    };
  } catch { return empty(); }
}
function persist(userId: string, tracking: Tracking) {
  try { sessionStorage.setItem(key(userId), JSON.stringify(tracking)); } catch { /* Memory still works if storage is unavailable. */ }
}
interface State extends Tracking {
  userId: string | null;
  activate: (userId: string) => void;
  clear: () => void;
  register: (userId: string, runId: string) => void;
  dismiss: () => void;
}
export const useAnalysisNotifications = create<State>((set, get) => ({
  ...empty(), userId: null,
  activate: userId => {
    if (get().userId === userId) return;
    get().clear();
    set({ userId, ...read(userId) });
  },
  clear: () => {
    const userId = get().userId;
    if (userId) { try { sessionStorage.removeItem(key(userId)); } catch { /* unavailable */ } }
    set({ userId: null, ...empty() });
  },
  register: (userId, runId) => {
    get().activate(userId);
    if (get().pending?.runId === runId) return;
    set({ pending: { runId, createdAt: null }, ready: null });
    persist(userId, get());
  },
  dismiss: () => {
    set({ ready: null });
    if (get().userId) persist(get().userId!, get());
  },
}));

/** One serial check; identity is checked again after reading the results. */
export async function checkAnalysisCompletion(
  userId: string,
  status: (runId: string) => Promise<AnalysisStatus>,
  result: (runId: string) => Promise<{ top_5?: unknown[] }>,
) {
  const initial = useAnalysisNotifications.getState();
  const pending = initial.pending;
  if (initial.userId !== userId || !pending) return;
  const current = () => useAnalysisNotifications.getState().userId === userId && useAnalysisNotifications.getState().pending === pending;
  const update = (patch: Partial<Tracking>) => {
    if (!current()) return;
    useAnalysisNotifications.setState(patch);
    persist(userId, useAnalysisNotifications.getState());
  };
  try {
    const first = await status(pending.runId);
    if (!current() || first.id !== pending.runId) return;
    if (!pending.createdAt) {
      update({ pending: { ...pending, createdAt: first.created_at } });
      return;
    }
    if (first.created_at !== pending.createdAt || first.status === 'failed') {
      update({ pending: null });
      return;
    }
    if (first.status !== 'complete') return;
    const identity = getAnalysisExecutionIdentity(first.id, first.created_at);
    if (initial.handled.includes(identity)) { update({ pending: null }); return; }
    const results = await result(pending.runId);
    if (!current() || !Array.isArray(results.top_5) || results.top_5.length === 0) return;
    const verified = await status(pending.runId);
    if (!current()) return;
    if (verified.id !== first.id || verified.created_at !== first.created_at || verified.status !== 'complete') {
      update({ pending: null });
      return;
    }
    update({ pending: null, ready: identity, handled: [...initial.handled, identity].slice(-50) });
  } catch (error) {
    if (error instanceof AnalysisAccessError) update({ pending: null });
    // Other errors are retried by the next monitor tick, never treated as success.
  }
}
