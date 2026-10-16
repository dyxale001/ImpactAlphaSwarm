import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { claimSpotlightTour, finishSpotlightTour } from '../services/supabase/spotlightTourService';
import { isSpotlightInvited } from '../utils/spotlightTour';

type TourState = { userId: string; open: boolean; error: string | null };
export function useSpotlightTour() {
  const { user, profile, analysis, isLoading, isProfileLoading, hasResolvedProfile, isRecovery } = useAuthStore();
  const userId = user?.id;
  const ready = Boolean(userId && !isLoading && !isProfileLoading && hasResolvedProfile && !isRecovery &&
    profile?.id === userId && profile.is_active && profile.role === 'user' && analysis?.user_id === userId);
  const [state, setState] = useState<TourState | null>(null);
  useEffect(() => {
    let cancelled = false;
    setState(null);
    if (ready && userId && isSpotlightInvited(user?.user_metadata)) {
      void claimSpotlightTour(userId).then(open => {
        if (!cancelled) setState({ userId, open, error: null });
      }, () => {
        if (!cancelled) setState({ userId, open: false, error: 'The welcome tour could not start because its status could not be saved. You can continue using the dashboard.' });
      });
    }
    return () => { cancelled = true; };
    // Claiming consumes the invitation in auth metadata. That same-user update
    // must not cancel an active tour; only readiness/account changes reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ready]);

  async function dismiss(status: 'skipped' | 'finished') {
    if (!userId) return;
    const dismissedId = userId;
    setState({ userId, open: false, error: null });
    try { await finishSpotlightTour(userId, status); }
    catch {
      if (useAuthStore.getState().user?.id === dismissedId) setState({ userId: dismissedId, open: false,
        error: 'The tour is closed, but its final status could not be synced. Its saved started status prevents it restarting on refresh.' });
    }
  }
  return {
    open: Boolean(ready && state && state.userId === userId && state.open),
    error: ready && state && state.userId === userId ? state.error : null,
    dismiss,
    clearError: () => setState(current => current ? { ...current, error: null } : null),
    userId,
  };
}
