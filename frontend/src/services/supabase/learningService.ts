import { supabase } from "../../lib/supabase";
import { getBadgeIconSignedUrl } from "./badgeStorageService";
import type {
  LearningArticle,
  LearningBadge,
  LearningCategory,
  LearningDifficultyLevel,
  LearningProgress,
  LearningQuestion,
  LearningQuizResult,
} from "../../types/learning";

const ARTICLE_XP: Record<LearningDifficultyLevel, number> = {
  BEGINNER: 50,
  INTERMEDIATE: 100,
  ADVANCED: 150,
};

type LearningCentreCategoryRow = Omit<LearningCategory, "articles"> & {
  articles?: Array<
    Omit<LearningArticle, "questions"> & {
      questions?: Array<
        Omit<LearningQuestion, "answers"> & {
          answers?: LearningQuestion["answers"];
        }
      >;
    }
  >;
};

type BadgeCriteriaContext = {
  categories: LearningCategory[];
  progressByArticleId: Record<string, LearningProgress | undefined>;
  learningXp: number;
};

type UserStateLoadIssue = {
  scope: "profile" | "progress" | "earnedBadges";
  message: string;
};

type SubmitLearningQuizInput = {
  userId: string;
  article: LearningArticle;
  questions: LearningQuestion[];
  selectedAnswers: Record<string, string | null>;
  categories: LearningCategory[];
  progressByArticleId: Record<string, LearningProgress | undefined>;
  badges: LearningBadge[];
  earnedBadgeIds: Set<string>;
  currentLearningXp: number;
};

export class LearningQuizEngine {
  static normalizeText(value: string) {
    return value.trim().toLowerCase();
  }

  static calculateArticleXp(difficultyLevel: LearningDifficultyLevel) {
    return ARTICLE_XP[difficultyLevel] ?? 0;
  }

  static calculateQuizScore(
    questions: LearningQuestion[],
    selectedAnswers: Record<string, string | null>,
  ) {
    if (questions.length === 0) {
      return { correctAnswers: 0, score: 0 };
    }

    const correctAnswers = questions.reduce((runningTotal, question) => {
      const selectedAnswerId = selectedAnswers[question.id];
      const isCorrect = question.answers.some(
        (answer) => answer.id === selectedAnswerId && answer.is_correct,
      );

      return runningTotal + (isCorrect ? 1 : 0);
    }, 0);

    return {
      correctAnswers,
      score: Math.round((correctAnswers / questions.length) * 100),
    };
  }

  static badgeRequirementText(badge: LearningBadge) {
    const criteriaValue = badge.criteria_value.trim();

    switch (badge.criteria_type.toUpperCase()) {
      case "ARTICLES_COMPLETED":
        return `Complete ${criteriaValue} learning articles to unlock this badge.`;
      case "XP_REACHED":
        return `Reach ${criteriaValue} XP to unlock this badge.`;
      case "CATEGORY_COMPLETED":
        return `Complete every article in ${criteriaValue} to unlock this badge.`;
      default:
        return "Complete the badge requirement to unlock this badge.";
    }
  }

  private static getCompletedArticleCount({
    progressByArticleId,
  }: BadgeCriteriaContext) {
    return Object.values(progressByArticleId).filter(
      (progress) => progress?.status === "COMPLETED",
    ).length;
  }

  private static isCategoryCompleted(
    category: LearningCategory,
    progressByArticleId: Record<string, LearningProgress | undefined>,
  ) {
    if (category.articles.length === 0) {
      return false;
    }

    return category.articles.every(
      (article) => progressByArticleId[article.id]?.status === "COMPLETED",
    );
  }

  static isBadgeEarned(badge: LearningBadge, context: BadgeCriteriaContext) {
    const criteriaValue = badge.criteria_value.trim();

    switch (badge.criteria_type.toUpperCase()) {
      case "ARTICLES_COMPLETED": {
        const requiredCount = Number.parseInt(criteriaValue, 10);
        return Number.isFinite(requiredCount)
          ? this.getCompletedArticleCount(context) >= requiredCount
          : false;
      }

      case "XP_REACHED": {
        const requiredXp = Number.parseInt(criteriaValue, 10);
        return Number.isFinite(requiredXp)
          ? context.learningXp >= requiredXp
          : false;
      }

      case "CATEGORY_COMPLETED": {
        const targetCategoryName = this.normalizeText(criteriaValue);

        return context.categories.some((category) => {
          const matchesCategory =
            this.normalizeText(category.name) === targetCategoryName ||
            this.normalizeText(category.slug) === targetCategoryName;

          return (
            matchesCategory &&
            this.isCategoryCompleted(category, context.progressByArticleId)
          );
        });
      }

      default:
        return false;
    }
  }
}

export class LearningCentreRepository {
  private static sortLearningContent(
    categories: LearningCentreCategoryRow[],
  ): LearningCategory[] {
    return [...categories]
      .sort((left, right) => left.display_order - right.display_order)
      .map((category) => ({
        ...category,
        articles: [...(category.articles ?? [])]
          .sort((left, right) =>
            left.created_at.localeCompare(right.created_at),
          )
          .map((article) => ({
            ...article,
            questions: [...(article.questions ?? [])]
              .sort((left, right) => left.display_order - right.display_order)
              .map((question) => ({
                ...question,
                answers: [...(question.answers ?? [])].sort(
                  (left, right) => left.display_order - right.display_order,
                ),
              })),
          })),
      }));
  }

  async fetchLearningCentreData() {
    const { data, error } = await supabase
      .from("learning_categories")
      .select(
        `
          *,
          articles:learning_articles(*)
        `,
      )
      .order("display_order");

    if (error) {
      throw error;
    }

    return LearningCentreRepository.sortLearningContent(
      (data ?? []) as LearningCentreCategoryRow[],
    );
  }

  async fetchLearningQuizQuestions(articleId: string) {
    const { data, error } = await supabase
      .from("learning_questions")
      .select(
        `
          id,
          article_id,
          question,
          display_order,
          answers:learning_answers(
            id,
            question_id,
            answer,
            is_correct,
            display_order
          )
        `,
      )
      .eq("article_id", articleId)
      .order("display_order");

    if (error) {
      throw new Error(
        `Failed to load quiz questions for article ${articleId}: ${error.message}`,
      );
    }

    return ((data ?? []) as LearningQuestion[]).map((question) => ({
      ...question,
      answers: [...(question.answers ?? [])].sort(
        (left, right) => left.display_order - right.display_order,
      ),
    }));
  }

  async fetchLearningBadges() {
    const { data, error } = await supabase
      .from("badges")
      .select(
        "id, name, description, icon_path, criteria_type, criteria_value, created_at",
      )
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to load badge catalogue: ${error.message}`);
    }

    return Promise.all(
      ((data ?? []) as LearningBadge[]).map(async (badge) => {
        const iconUrl = await getBadgeIconSignedUrl(badge.icon_path);

        return {
          ...badge,
          icon_url: iconUrl,
        };
      }),
    );
  }

  async fetchLearningUserState(userId: string) {
    const [profileResult, progressResult, earnedBadgesResult] =
      await Promise.allSettled([
        supabase
          .from("users")
          .select("id, learning_xp")
          .eq("id", userId)
          .single(),
        supabase
          .from("user_learning_progress")
          .select("id, user_id, article_id, status, quiz_score")
          .eq("user_id", userId),
        supabase.from("user_badges").select("badge_id").eq("user_id", userId),
      ]);

    const profileData =
      profileResult.status === "fulfilled" ? profileResult.value.data : null;
    const profileError =
      profileResult.status === "fulfilled"
        ? profileResult.value.error
        : profileResult.reason;

    const progressData =
      progressResult.status === "fulfilled" ? progressResult.value.data : null;
    const progressError =
      progressResult.status === "fulfilled"
        ? progressResult.value.error
        : progressResult.reason;

    const earnedBadgesData =
      earnedBadgesResult.status === "fulfilled"
        ? earnedBadgesResult.value.data
        : null;
    const earnedBadgesError =
      earnedBadgesResult.status === "fulfilled"
        ? earnedBadgesResult.value.error
        : earnedBadgesResult.reason;

    const issues: UserStateLoadIssue[] = [];

    if (profileError) {
      issues.push({
        scope: "profile",
        message:
          profileError instanceof Error
            ? profileError.message
            : String(profileError),
      });
    }

    if (progressError) {
      issues.push({
        scope: "progress",
        message:
          progressError instanceof Error
            ? progressError.message
            : String(progressError),
      });
    }

    if (earnedBadgesError) {
      issues.push({
        scope: "earnedBadges",
        message:
          earnedBadgesError instanceof Error
            ? earnedBadgesError.message
            : String(earnedBadgesError),
      });
    }

    const progressEntries = (progressData ?? []) as LearningProgress[];
    const progressByArticleId = progressEntries.reduce<
      Record<string, LearningProgress>
    >((accumulator, progress) => {
      accumulator[progress.article_id] = progress;
      return accumulator;
    }, {});

    const earnedBadgeIds = new Set(
      (earnedBadgesData ?? []).map((row) => row.badge_id as string),
    );

    return {
      learningXp: Number(profileData?.learning_xp ?? 0),
      progressEntries,
      progressByArticleId,
      earnedBadgeIds,
      issues,
    };
  }

  async submitLearningQuiz({
    userId,
    article,
    questions,
    selectedAnswers,
    categories,
    progressByArticleId,
    badges,
    earnedBadgeIds,
    currentLearningXp,
  }: SubmitLearningQuizInput): Promise<LearningQuizResult> {
    const { score } = LearningQuizEngine.calculateQuizScore(
      questions,
      selectedAnswers,
    );
    const passed = score >= 80;
    const previousProgress = progressByArticleId[article.id];
    const previouslyCompleted = previousProgress?.status === "COMPLETED";
    const previousQuizScore = previousProgress?.quiz_score ?? null;
    const savedQuizScore =
      previousQuizScore === null ? score : Math.max(previousQuizScore, score);
    const status = previouslyCompleted
      ? "COMPLETED"
      : passed
        ? "COMPLETED"
        : "IN_PROGRESS";

    const progressPayload = {
      user_id: userId,
      article_id: article.id,
      status,
      quiz_score: savedQuizScore,
    };

    const { data: updatedProgressRows, error: progressUpdateError } =
      await supabase
        .from("user_learning_progress")
        .update(progressPayload)
        .eq("user_id", userId)
        .eq("article_id", article.id)
        .select("id");

    if (progressUpdateError) {
      throw new Error(
        `Failed to save quiz progress (update): ${progressUpdateError.message}`,
      );
    }

    if ((updatedProgressRows ?? []).length === 0) {
      const { error: progressInsertError } = await supabase
        .from("user_learning_progress")
        .insert(progressPayload);

      if (progressInsertError) {
        throw new Error(
          `Failed to save quiz progress (insert): ${progressInsertError.message}`,
        );
      }
    }

    let updatedLearningXp = currentLearningXp;
    let xpEarned = 0;

    if (passed && !previouslyCompleted) {
      xpEarned = LearningQuizEngine.calculateArticleXp(
        article.difficulty_level,
      );
      updatedLearningXp += xpEarned;

      const { error: xpError } = await supabase
        .from("users")
        .update({ learning_xp: updatedLearningXp })
        .eq("id", userId);

      if (xpError) {
        throw new Error(`Failed to update learning XP: ${xpError.message}`);
      }
    }

    const updatedProgressByArticleId = {
      ...progressByArticleId,
      [article.id]: {
        id: previousProgress?.id ?? article.id,
        user_id: userId,
        article_id: article.id,
        status: status as LearningProgress["status"],
        quiz_score: savedQuizScore,
      },
    };

    const eligibleBadges = badges.filter((badge) =>
      LearningQuizEngine.isBadgeEarned(badge, {
        categories,
        progressByArticleId: updatedProgressByArticleId,
        learningXp: updatedLearningXp,
      }),
    );

    const newlyEarnedBadges = eligibleBadges.filter(
      (badge) => !earnedBadgeIds.has(badge.id),
    );

    if (newlyEarnedBadges.length > 0) {
      const candidateBadgeIds = newlyEarnedBadges.map((badge) => badge.id);
      const { data: authData, error: authError } =
        await supabase.auth.getUser();
      const { data: sessionData } = await supabase.auth.getSession();

      console.log(
        "[learning badges] current auth user id:",
        authData.user?.id ?? null,
      );
      console.log(
        "[learning badges] current session exists:",
        Boolean(sessionData.session),
      );
      console.log("[learning badges] userId passed into insert flow:", userId);
      console.log("[learning badges] auth lookup error:", authError ?? null);

      const { data: existingBadges, error: existingBadgesError } =
        await supabase
          .from("user_badges")
          .select("badge_id")
          .eq("user_id", userId)
          .in("badge_id", candidateBadgeIds);

      if (existingBadgesError) {
        throw new Error(
          `Failed to verify existing badges before awarding: ${existingBadgesError.message}`,
        );
      }

      const existingBadgeIdSet = new Set(
        (existingBadges ?? []).map((row) => row.badge_id as string),
      );

      const badgesToInsert = newlyEarnedBadges.filter(
        (badge) => !existingBadgeIdSet.has(badge.id),
      );

      if (badgesToInsert.length > 0) {
        const badgeInsertPayload = badgesToInsert.map((badge) => ({
          user_id: userId,
          badge_id: badge.id,
          earned_at: new Date().toISOString(),
        }));

        console.log(
          "[learning badges] user_badges insert payload:",
          badgeInsertPayload,
        );
        console.log(
          "[learning badges] auth.uid() comparison:",
          authData.user?.id ?? null,
          "===",
          userId,
          authData.user?.id === userId,
        );

        const { error: badgeInsertError } = await supabase
          .from("user_badges")
          .insert(badgeInsertPayload);

        if (badgeInsertError) {
          throw new Error(
            `Failed to award learning badges: ${badgeInsertError.message}`,
          );
        }
      }
    }

    return {
      score,
      passed,
      xpEarned,
      newlyEarnedBadges,
      updatedLearningXp,
    };
  }
}

export const learningCentreRepository = new LearningCentreRepository();

export function calculateArticleXp(difficultyLevel: LearningDifficultyLevel) {
  return LearningQuizEngine.calculateArticleXp(difficultyLevel);
}

export function calculateQuizScore(
  questions: LearningQuestion[],
  selectedAnswers: Record<string, string | null>,
) {
  return LearningQuizEngine.calculateQuizScore(questions, selectedAnswers);
}

export function badgeRequirementText(badge: LearningBadge) {
  return LearningQuizEngine.badgeRequirementText(badge);
}

export function isBadgeEarned(
  badge: LearningBadge,
  context: BadgeCriteriaContext,
) {
  return LearningQuizEngine.isBadgeEarned(badge, context);
}

export async function fetchLearningCentreData() {
  return learningCentreRepository.fetchLearningCentreData();
}

export async function fetchLearningQuizQuestions(articleId: string) {
  return learningCentreRepository.fetchLearningQuizQuestions(articleId);
}

export async function fetchLearningBadges() {
  return learningCentreRepository.fetchLearningBadges();
}

export async function fetchLearningUserState(userId: string) {
  return learningCentreRepository.fetchLearningUserState(userId);
}

export async function submitLearningQuiz(
  input: SubmitLearningQuizInput,
): Promise<LearningQuizResult> {
  return learningCentreRepository.submitLearningQuiz(input);
}
