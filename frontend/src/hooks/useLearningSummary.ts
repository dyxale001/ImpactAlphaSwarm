import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { fetchLearningBadges, fetchLearningCentreData, fetchLearningUserState } from "../services/supabase/learningService";
import type { LearningBadge } from "../types/learning";
import { deriveDashboardLearning, type LearningData } from "../dashboard/learningSummary";

// Called once by the dashboard provider, never once per widget.
export function useLearningSummary(enabled: boolean, needsBadges: boolean) {
  const { profile, analysis } = useAuthStore();
  const userId = profile?.id;
  const [core, setCore] = useState<{ userId: string; data: LearningData | null; error: boolean } | null>(null);
  const [badgeLoad, setBadgeLoad] = useState<{ userId: string; badges: LearningBadge[] | null; error: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCore(null);
    if (enabled && userId) {
      void Promise.all([fetchLearningCentreData(), fetchLearningUserState(userId)])
        .then(([categories, userState]) => {
          if (!cancelled) setCore({ userId, data: { categories, userState }, error: false });
        }, () => {
          if (!cancelled) setCore({ userId, data: null, error: true });
        });
    }
    return () => { cancelled = true; };
  }, [enabled, userId]);

  useEffect(() => {
    let cancelled = false;
    setBadgeLoad(null);
    if (needsBadges && userId) {
      void fetchLearningBadges().then(badges => {
        if (!cancelled) setBadgeLoad({ userId, badges, error: false });
      }, () => {
        if (!cancelled) setBadgeLoad({ userId, badges: null, error: true });
      });
    }
    return () => { cancelled = true; };
  }, [needsBadges, userId]);

  const current = enabled && core?.userId === userId ? core : null;
  const currentBadges = needsBadges && badgeLoad?.userId === userId ? badgeLoad : null;
  return deriveDashboardLearning(
    current?.data ?? null,
    currentBadges?.badges ?? null,
    analysis?.ai_derived_expertise,
    Boolean(current?.error),
    Boolean(currentBadges?.error),
  );
}
