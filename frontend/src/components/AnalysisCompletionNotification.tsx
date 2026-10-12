import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { checkAnalysisCompletion, useAnalysisNotifications } from '../store/analysisNotifications';
import { getStatus, getResult } from '../services/api/analysis';
import { notificationCountdown } from '../utils/notificationCountdown';

export default function AnalysisCompletionNotification() {
  const userId = useAuthStore(s => s.user?.id);
  const { ready, activate, clear, dismiss } = useAnalysisNotifications();
  const countdown = useRef<ReturnType<typeof notificationCountdown> | null>(null);
  const hovered = useRef(false);
  const visible = Boolean(ready && userId && useAnalysisNotifications.getState().userId === userId);
  useEffect(() => {
    if (!visible) { hovered.current = false; return; }
    const timer = notificationCountdown(dismiss);
    countdown.current = timer;
    if (hovered.current) timer.pause();
    return () => { timer.dispose(); countdown.current = null; };
  }, [visible, ready, userId, dismiss]);
  function dismissNotification() {
    countdown.current?.dispose();
    dismiss();
  }
  useEffect(() => {
    if (!userId) { clear(); return; }
    activate(userId);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (stopped) return;
      // Completion verification must bypass shared progress snapshots.
      let reads = 0;
      await checkAnalysisCompletion(userId!, id => getStatus(id, ++reads > 1), id => getResult(id));
      if (!stopped) timer = setTimeout(() => void tick(), 3000);
    }
    void tick();
    const unsubscribe = useAuthStore.subscribe(state => {
      if (state.user?.id !== userId) {
        stopped = true;
        clearTimeout(timer);
        clear();
      }
    });
    return () => { stopped = true; clearTimeout(timer); unsubscribe(); };
  }, [userId, activate, clear]);

  if (!visible) return null;
  return (
    <aside aria-label="Analysis notification" onMouseEnter={() => { hovered.current = true; countdown.current?.pause(); }} onMouseLeave={() => { hovered.current = false; countdown.current?.resume(); }} className="fixed top-20 right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-brand-border bg-brand-card p-4 shadow-lg lg:top-6 lg:right-6">
      <button type="button" onClick={dismissNotification} aria-label="Dismiss analysis notification" className="float-right rounded p-1 text-brand-muted-fg hover:text-brand-fg"><X size={16} /></button>
      <div role="status" className="pr-6">
        <p className="text-sm font-bold text-brand-primary">Your stock analysis is ready</p>
        <p className="mt-1 text-xs text-brand-muted-fg">Your latest results are available on the Stocks page.</p>
      </div>
      <Link to="/assets" onClick={dismissNotification} className="mt-3 inline-block text-xs font-bold text-brand-primary underline underline-offset-4">View analysis</Link>
    </aside>
  );
}
