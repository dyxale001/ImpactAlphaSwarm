import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { isSpotlightInvited, SPOTLIGHT_KEY } from '../../utils/spotlightTour';

const claims = new Map<string, Promise<boolean>>();
function isCurrent(userId: string) { return useAuthStore.getState().user?.id === userId; }

async function writeStatus(userId: string, status: 'started' | 'skipped' | 'finished') {
  if (!isCurrent(userId)) throw new Error('Account changed.');
  // The SDK merges this single namespaced metadata key; profile, goals and
  // existing registration metadata are not replaced.
  const { data, error } = await supabase.auth.updateUser({ data: { [SPOTLIGHT_KEY]: status } });
  if (error) throw error;
  if (data.user?.id !== userId || data.user.user_metadata?.[SPOTLIGHT_KEY] !== status) {
    throw new Error('Tour status could not be confirmed.');
  }
}

/** Persist consumption before display, so refreshing an interrupted tour does
 * not reopen it. Share a pending claim across React StrictMode effects. */
export function claimSpotlightTour(userId: string): Promise<boolean> {
  const pending = claims.get(userId);
  if (pending) return pending;
  const request = (async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!isCurrent(userId) || data.user?.id !== userId || !isSpotlightInvited(data.user.user_metadata)) return false;
    await writeStatus(userId, 'started');
    return isCurrent(userId);
  })().finally(() => { claims.delete(userId); });
  claims.set(userId, request);
  return request;
}

export async function finishSpotlightTour(userId: string, status: 'skipped' | 'finished') {
  await writeStatus(userId, status);
}
