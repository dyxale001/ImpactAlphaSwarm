import type { UserAnalysis } from "../types/auth";
import type { LearningDifficultyLevel, LearningQuizStatus } from "../types/learning";

const expertiseRanks = { novice: 0, intermediate: 1, advanced: 2 };
const difficultyRanks = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 };

/** Guidance only: never used for recommendations, access, ordering, or completion. */
export function classifyLearningExpertise(
  expertise: UserAnalysis["ai_derived_expertise"],
  difficulty: LearningDifficultyLevel,
): "within" | "other" | undefined {
  if (!expertise || expertiseRanks[expertise] === undefined || difficultyRanks[difficulty] === undefined) return undefined;
  return difficultyRanks[difficulty] === expertiseRanks[expertise] ? "within" : "other";
}


export function isOptionalOtherLevelLesson(
  expertise: UserAnalysis["ai_derived_expertise"],
  difficulty: LearningDifficultyLevel,
  status: LearningQuizStatus | undefined,
  recommended: boolean,
): boolean {
  return classifyLearningExpertise(expertise, difficulty) === "other" &&
    status !== "COMPLETED" && status !== "IN_PROGRESS" && !recommended;
}
