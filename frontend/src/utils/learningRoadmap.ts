import type { UserAnalysis } from "../types/auth";
import type { LearningCategory, LearningProgress } from "../types/learning";

/** Consume repository order unchanged, including any future article ordering. */
export function deriveLearningRoadmap(
  categories: LearningCategory[],
  progress: Record<string, LearningProgress | undefined>,
  expertise: UserAnalysis["ai_derived_expertise"],
) {
  const articles = categories.flatMap(category => category.articles);
  const completed = articles.filter(article => progress[article.id]?.status === "COMPLETED");
  const unfinished = articles.filter(article => progress[article.id]?.status !== "COMPLETED");
  const inProgress = unfinished.find(article => progress[article.id]?.status === "IN_PROGRESS");
  const difficulty = expertise === "advanced" ? "ADVANCED"
    : expertise === "intermediate" ? "INTERMEDIATE" : "BEGINNER";
  const entry = articles.find(article => article.difficulty_level === difficulty) ?? articles[0];

  let recommended = inProgress;
  let reason = "Continue this lesson: your quiz is in progress.";
  if (!recommended && completed.length) {
    const lastCompletedIndex = articles.reduce((last, article, index) =>
      progress[article.id]?.status === "COMPLETED" ? index : last, -1);
    recommended = articles.slice(lastCompletedIndex + 1).find(article =>
      progress[article.id]?.status !== "COMPLETED");
    reason = "Continue with the next unfinished lesson after your completed work.";
    if (!recommended) {
      recommended = unfinished[0];
      reason = "Revisit an earlier unfinished lesson to complete your learning sequence.";
    }
  } else if (!recommended) {
    recommended = entry;
    reason = expertise && entry?.difficulty_level === difficulty
      ? `Suggested starting point based on your ${expertise} expertise setting.`
      : "Start here using the available catalogue order and foundational content.";
  }
  return { articles, completedCount: completed.length, recommended, reason };
}
