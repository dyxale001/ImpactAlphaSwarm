import type { UserAnalysis } from "../types/auth";
import type { LearningBadge, LearningCategory } from "../types/learning";
import type { fetchLearningUserState } from "../services/supabase/learningService";
import { deriveLearningRoadmap } from "../utils/learningRoadmap";

export type LearningUserState = Awaited<ReturnType<typeof fetchLearningUserState>>;
export type LearningData = {
  categories: LearningCategory[];
  userState: LearningUserState;
};

// Widget availability follows the service's partial-failure contract. Badge
// catalogue loading is independent of the catalogue/progress recommendation.
export function deriveDashboardLearning(
  data: LearningData | null,
  badges: LearningBadge[] | null,
  expertise: UserAnalysis["ai_derived_expertise"],
  coreError: boolean,
  badgeError: boolean,
) {
  const progressFailed = data?.userState.issues.some(issue => issue.scope === "progress");
  const nextError = coreError || progressFailed
    ? "Unable to load your next lesson." : null;
  const progressError = coreError || badgeError || Boolean(data?.userState.issues.length)
    ? "Unable to load your learning progress." : null;
  const roadmap = data && !nextError
    ? deriveLearningRoadmap(data.categories, data.userState.progressByArticleId, expertise)
    : null;
  const nextArticle = roadmap?.recommended ?? null;
  return {
    next: {
      isLoading: !data && !nextError,
      error: nextError,
      nextArticle,
      articlesTotal: roadmap?.articles.length ?? 0,
      nextArticleCategory: data?.categories.find(category =>
        category.articles.some(article => article === nextArticle))?.name ?? null,
    },
    progress: {
      isLoading: !progressError && (!data || !badges),
      error: progressError,
      // Do not expose fallback service values as an available summary.
      summary: data && badges && !progressError && roadmap ? {
        learningXp: data.userState.learningXp,
        articlesCompleted: roadmap.completedCount,
        articlesTotal: roadmap.articles.length,
        badgesEarned: data.userState.earnedBadgeIds.size,
        badgesTotal: badges.length,
        earnedBadges: badges.filter(badge => data.userState.earnedBadgeIds.has(badge.id)),
      } : null,
    },
  };
}
