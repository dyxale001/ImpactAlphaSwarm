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

/** Distances assume first-time passes of currently available quizzes. */
export function deriveNextBadgeMilestone({ badges, earnedBadgeIds, categories, progress, xp, recommended, calculateArticleXp }: NextMilestoneInput): NextBadgeMilestone | undefined {
  // Historical completions still count, even when their articles were deleted.
  const completed = Object.values(progress).filter(entry => entry?.status === "COMPLETED").length;
  const articles = categories.flatMap(category => category.articles);
  const start = Math.max(0, articles.findIndex(article => article.id === recommended?.id));
  const isUnfinished = (article: LearningArticle) => progress[article.id]?.status !== "COMPLETED";
  const hasQuiz = (article: LearningArticle) => Number.isInteger(article.quiz_question_count) &&
    (article.quiz_question_count ?? 0) > 0;
  const upcoming = [...articles.slice(start), ...articles.slice(0, start)]
    .filter(article => isUnfinished(article) && hasQuiz(article));
  const candidates: Array<NextBadgeMilestone & { priority: number }> = [];

  for (const milestone of deriveNumericBadgeMilestones(badges, "ARTICLES_COMPLETED", completed, earnedBadgeIds)) {
    if (milestone.earned || milestone.satisfied || milestone.remaining > upcoming.length) continue;
    candidates.push({ badge: milestone.badge, current: completed, target: milestone.threshold,
      remaining: milestone.remaining, unit: "lessons", estimatedLessons: milestone.remaining, priority: 0 });
  }

  // Unknown XP makes an accurate lesson-distance comparison impossible.
  const awards = upcoming.map(article => {
    try { return calculateArticleXp(article.difficulty_level); }
    catch { return NaN; }
  });
  if (awards.every(award => Number.isSafeInteger(award) && award >= 0)) {
    for (const milestone of deriveNumericBadgeMilestones(badges, "XP_REACHED", xp, earnedBadgeIds)) {
      if (milestone.earned || milestone.satisfied) continue;
      let potentialXp = 0;
      const index = awards.findIndex(award => {
        potentialXp += award;
        return potentialXp >= milestone.remaining;
      });
      if (index < 0) continue;
      candidates.push({ badge: milestone.badge, current: xp, target: milestone.threshold,
        remaining: milestone.remaining, unit: "XP", estimatedLessons: index + 1, priority: 1 });
    }
  }

  const normalize = (value: string) => value.trim().toLowerCase();
  for (const badge of badges) {
    if (earnedBadgeIds.has(badge.id) || badge.criteria_type.toUpperCase() !== "CATEGORY_COMPLETED") continue;
    for (const category of categories) {
      if (!category.articles.length || ![category.name, category.slug].some(value => normalize(value) === normalize(badge.criteria_value))) continue;
      const unfinished = category.articles.filter(isUnfinished);
      if (!unfinished.length || !unfinished.every(hasQuiz)) continue;
      candidates.push({ badge, current: category.articles.length - unfinished.length,
        target: category.articles.length, remaining: unfinished.length, unit: "lessons",
        estimatedLessons: unfinished.length, priority: 2 });
    }
  }

  const selected = candidates.sort((a, b) =>
    a.estimatedLessons! - b.estimatedLessons! || a.priority - b.priority ||
    a.target - b.target || a.badge.id.localeCompare(b.badge.id))[0];
  if (!selected) return undefined;
  const { priority: _priority, ...milestone } = selected;
  return milestone;
}
