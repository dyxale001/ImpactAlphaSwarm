import type { LearningArticle, LearningBadge, LearningCategory, LearningProgress } from "../types/learning";

/** Presentation only. Award records, not threshold comparisons, determine earned status. */
export function deriveNumericBadgeMilestones(
  badges: LearningBadge[],
  type: "ARTICLES_COMPLETED" | "XP_REACHED",
  current: number,
  earnedBadgeIds: Set<string>,
) {
  const milestones = badges.flatMap(badge => {
    if (badge.criteria_type.toUpperCase() !== type) return [];
    const value = badge.criteria_value.trim();
    if (!/^\d+$/.test(value)) return [];
    const threshold = Number(value);
    if (!Number.isSafeInteger(threshold) || threshold <= 0) return [];
    const earned = earnedBadgeIds.has(badge.id);
    return [{ badge, threshold, earned, satisfied: current >= threshold,
      remaining: Math.max(0, threshold - current) }];
  }).sort((a, b) => a.threshold - b.threshold || a.badge.id.localeCompare(b.badge.id));
  const nextThreshold = milestones.find(m => !m.earned && !m.satisfied)?.threshold;
  return milestones.map(m => ({ ...m, next: !m.earned && !m.satisfied && m.threshold === nextThreshold }));
}


type NextMilestoneInput = {
  badges: LearningBadge[];
  earnedBadgeIds: Set<string>;
  categories: LearningCategory[];
  progress: Record<string, LearningProgress | undefined>;
  xp: number;
  recommended: LearningArticle | undefined;
  calculateArticleXp: (difficulty: LearningArticle["difficulty_level"]) => number;
};

export type NextBadgeMilestone = {
  badge: LearningBadge;
  current: number;
  target: number;
  remaining: number;
  unit: "lessons" | "XP";
  estimatedLessons?: number;
};

/** Estimates assume first-time quiz passes, using the supplied existing XP rule. */
export function deriveNextBadgeMilestone({ badges, earnedBadgeIds, categories, progress, xp, recommended, calculateArticleXp }: NextMilestoneInput): NextBadgeMilestone | undefined {
  const completed = Object.values(progress).filter(entry => entry?.status === "COMPLETED").length;
  const articleCandidate = deriveNumericBadgeMilestones(badges, "ARTICLES_COMPLETED", completed, earnedBadgeIds).find(m => m.next);
  const xpCandidate = deriveNumericBadgeMilestones(badges, "XP_REACHED", xp, earnedBadgeIds).find(m => m.next);
  let xpLessons: number | undefined;
  if (xpCandidate) {
    const articles = categories.flatMap(category => category.articles);
    const start = articles.findIndex(article => article.id === recommended?.id);
    if (start >= 0) {
      const upcoming = [...articles.slice(start), ...articles.slice(0, start)]
        .filter(article => progress[article.id]?.status !== "COMPLETED");
      let expectedXp = 0;
      for (let index = 0; index < upcoming.length; index++) {
        const article = upcoming[index];
        const award = calculateArticleXp(article.difficulty_level);
        // Unknown/unavailable quizzes or XP prevent a reliable estimate along this path.
        if (!(article.quiz_question_count && article.quiz_question_count > 0) || !Number.isFinite(award) || award <= 0) break;
        expectedXp += award;
        if (expectedXp >= xpCandidate.remaining) {
          xpLessons = index + 1;
          break;
        }
      }
    }
  }
  if (articleCandidate && (!xpCandidate || xpLessons === undefined || articleCandidate.remaining <= xpLessons)) {
    return { badge: articleCandidate.badge, current: completed, target: articleCandidate.threshold,
      remaining: articleCandidate.remaining, unit: "lessons", estimatedLessons: articleCandidate.remaining };
  }
  if (xpCandidate) {
    return { badge: xpCandidate.badge, current: xp, target: xpCandidate.threshold,
      remaining: xpCandidate.remaining, unit: "XP", estimatedLessons: xpLessons };
  }
  const category = categories.find(category => category.articles.some(article => article.id === recommended?.id));
  if (!category || !category.articles.length) return undefined;
  const categoryCompleted = category.articles.filter(article => progress[article.id]?.status === "COMPLETED").length;
  if (categoryCompleted === category.articles.length) return undefined;
  const normalize = (value: string) => value.trim().toLowerCase();
  const categoryBadge = badges.filter(badge => !earnedBadgeIds.has(badge.id) &&
    badge.criteria_type.toUpperCase() === "CATEGORY_COMPLETED" &&
    [category.name, category.slug].some(name => normalize(name) === normalize(badge.criteria_value)))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!categoryBadge) return undefined;
  return { badge: categoryBadge, current: categoryCompleted, target: category.articles.length,
    remaining: category.articles.length - categoryCompleted, unit: "lessons" };
}
