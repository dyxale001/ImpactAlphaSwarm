import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningArticle, LearningCategory, LearningProgress } from "../../types/learning";
import { deriveLearningRoadmap } from "../../utils/learningRoadmap";

const database = vi.hoisted(() => ({
  catalogue: [] as LearningCategory[],
  progress: null as LearningProgress | null,
  xp: 200,
  xpWrites: [] as number[],
  xpConfig: [
    { difficulty_level: "BEGINNER", xp: 50 },
    { difficulty_level: "INTERMEDIATE", xp: 100 },
    { difficulty_level: "ADVANCED", xp: 150 },
  ] as Array<{ difficulty_level: string; xp: unknown }>,
  configError: null as { message: string } | null,
  configReads: 0,
  xpError: null as { message: string } | null,
  xpResponse: undefined as Array<{ id: string; learning_xp: number }> | undefined,
  userFilter: "",


}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      let operation = "";
      let payload: Record<string, unknown> = {};
      const execute = () => {
        if (table === "learning_difficulty_xp") {
          database.configReads++;
          return { data: database.xpConfig, error: database.configError };
        }
        if (table === "learning_categories") return { data: database.catalogue, error: null };
        if (table === "user_learning_progress") {
          if (operation === "insert" || database.progress) {
            database.progress = { id: "progress", ...payload } as LearningProgress;
            return { data: [{ id: "progress" }], error: null };
          }
          return { data: [], error: null };
        }
        if (table === "users") {
          if (database.xpError) return { data: null, error: database.xpError };
          if (database.xpResponse !== undefined) return { data: database.xpResponse, error: null };
          database.xp = payload.learning_xp as number;
          database.xpWrites.push(database.xp);
          return { data: [{ id: database.userFilter, learning_xp: database.xp }], error: null };
        }
        throw new Error(`Unexpected table: ${table}`);
      };
      const query = {
        update: (values: Record<string, unknown>) => {
          operation = "update";
          payload = values;
          return query;
        },
        insert: (values: Record<string, unknown>) => {
          operation = "insert";
          payload = values;
          return query;
        },
        eq: (column: string, value: string) => {
          if (table === "users" && column === "id") database.userFilter = value;
          return query;
        },
        order: () => query,
        select: () => query,
        then: (resolve: (value: ReturnType<typeof execute>) => unknown) =>
          Promise.resolve(execute()).then(resolve),
      };
      return query;
    },
  },
}));

vi.mock("./badgeStorageService", () => ({ getBadgeIconSignedUrl: vi.fn() }));

import { LearningCentreRepository, LearningQuizEngine, calculateArticleXp, submitLearningQuiz } from "./learningService";

const questions = Array.from({ length: 4 }, (_, index) => ({
  id: `q${index}`,
  article_id: "lesson",
  question: `Question ${index + 1}`,
  display_order: index + 1,
  answers: Array.from({ length: 4 }, (_, option) => ({
    id: `q${index}-a${option}`,
    question_id: `q${index}`,
    answer: `Option ${option + 1}`,
    is_correct: option === 0,
    display_order: option + 1,
  })),
}));

const article: LearningArticle = {
  id: "lesson", category_id: "category", title: "Lesson", slug: "lesson",
  summary: "Summary", content: "Content", display_order: 1, difficulty_level: "BEGINNER",
  created_at: "2026-01-01", quiz_question_count: 4, questions,
};
const nextArticle = { ...article, id: "next", slug: "next" };
const categories: LearningCategory[] = [{
  id: "category", name: "Category", slug: "category", description: "",
  display_order: 1, created_at: "2026-01-01", articles: [article, nextArticle],
}];

function selections(correctCount: number) {
  return Object.fromEntries(questions.map((question, index) =>
    [question.id, question.answers[index < correctCount ? 0 : 1].id]));
}

function progressMap() {
  return database.progress ? { [article.id]: { ...database.progress } } : {};
}

function submit(correctCount: number, difficulty = article.difficulty_level) {
  return submitLearningQuiz({
    userId: "user", article: { ...article, difficulty_level: difficulty },
    questions, selectedAnswers: selections(correctCount), categories,
    progressByArticleId: progressMap(), badges: [], earnedBadgeIds: new Set(),
    currentLearningXp: database.xp,
  });
}

beforeEach(() => {
  database.xpConfig = [
    { difficulty_level: "BEGINNER", xp: 50 },
    { difficulty_level: "INTERMEDIATE", xp: 100 },
    { difficulty_level: "ADVANCED", xp: 150 },
  ];
  database.configError = null;
  database.configReads = 0;
  database.xpError = null;
  database.xpResponse = undefined;
  database.userFilter = "";
  database.catalogue = [];
  database.progress = null;
  database.xp = 200;
  database.xpWrites = [];
});

describe("Learning Centre passing threshold", () => {
  it.each([0, 1, 2, 3, 4])("scores %i of four and saves completion/XP only on a pass", async (correctCount) => {
    const score = correctCount * 25;
    const passed = correctCount >= 3;
    expect(LearningQuizEngine.calculateQuizScore(questions, selections(correctCount)))
      .toEqual({ correctAnswers: correctCount, score });
    const result = await submit(correctCount);
    expect(result).toMatchObject({
      score, passed, xpEarned: passed ? 50 : 0,
      updatedLearningXp: passed ? 250 : 200,
    });
    expect(database.progress).toMatchObject({
      article_id: article.id, quiz_score: score,
      status: passed ? "COMPLETED" : "IN_PROGRESS",
    });
    expect(database.xpWrites).toEqual(passed ? [250] : []);
  });

  it.each(["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const)(
    "preserves the %s first-completion XP award at exactly 75%%", async (difficulty) => {
      const award = { BEGINNER: 50, INTERMEDIATE: 100, ADVANCED: 150 }[difficulty];
      expect(await submit(3, difficulty)).toMatchObject({ passed: true, xpEarned: award });
      expect(await submit(4, difficulty)).toMatchObject({ passed: true, xpEarned: 0 });
      expect(database.xpWrites).toEqual([200 + award]);
    },
  );

  it.each([0, 1, 2, 3, 4])("preserves completion and best score without XP on a %i-of-four retake", async (correctCount) => {
    await submit(3);
    const result = await submit(correctCount);
    expect(result).toMatchObject({ score: correctCount * 25, passed: correctCount >= 3, xpEarned: 0 });
    expect(database.progress).toMatchObject({ status: "COMPLETED", quiz_score: Math.max(75, correctCount * 25) });
    expect(database.xpWrites).toEqual([250]);
  });

  it("preserves a perfect best score after a failed retake", async () => {
    await submit(4);
    await submit(1);
    expect(database.progress).toMatchObject({ status: "COMPLETED", quiz_score: 100 });
    expect(database.xpWrites).toEqual([250]);
  });

  it("preserves a failed best score and awards XP only when a later attempt passes", async () => {
    await submit(2);
    await submit(1);
    expect(database.progress).toMatchObject({ status: "IN_PROGRESS", quiz_score: 50 });
    expect(database.xpWrites).toEqual([]);
    expect(await submit(3)).toMatchObject({ passed: true, xpEarned: 50 });
    expect(database.progress).toMatchObject({ status: "COMPLETED", quiz_score: 75 });
    expect(database.xpWrites).toEqual([250]);
  });

  it("uses a 75% completion for category badges and roadmap progression", async () => {
    const badge = {
      id: "badge", name: "Category", description: "", icon_path: "",
      criteria_type: "CATEGORY_COMPLETED", criteria_value: "category", created_at: "",
    };
    const singleLessonCategory = [{ ...categories[0], articles: [article] }];
    await submit(2);
    expect(LearningQuizEngine.isBadgeEarned(badge, {
      categories: singleLessonCategory, progressByArticleId: progressMap(), learningXp: database.xp,
    })).toBe(false);
    expect(deriveLearningRoadmap(categories, progressMap(), "novice").recommended?.id).toBe(article.id);
    await submit(3);
    expect(LearningQuizEngine.isBadgeEarned(badge, {
      categories: singleLessonCategory, progressByArticleId: progressMap(), learningXp: database.xp,
    })).toBe(true);
    expect(deriveLearningRoadmap(categories, progressMap(), "novice"))
      .toMatchObject({ completedCount: 1, recommended: { id: nextArticle.id } });
  });
});


describe("database difficulty XP configuration", () => {
  it("loads configuration with the catalogue and uses it for roadmap estimates", async () => {
    const repository = new LearningCentreRepository();
    await repository.fetchLearningCentreData();
    expect(database.configReads).toBe(1);
    expect(repository.calculateArticleXp("BEGINNER")).toBe(50);
    expect(repository.calculateArticleXp("INTERMEDIATE")).toBe(100);
    expect(repository.calculateArticleXp("ADVANCED")).toBe(150);
  });

  it("uses the database amount rather than a legacy mapping for completion and estimates", async () => {
    database.xpConfig[0].xp = 65;
    expect(await submit(3)).toMatchObject({ xpEarned: 65, updatedLearningXp: 265 });
    expect(calculateArticleXp("BEGINNER")).toBe(65);
  });

  it("accepts an explicitly configured zero award", async () => {
    database.xpConfig[0].xp = 0;
    expect(await submit(3)).toMatchObject({ passed: true, xpEarned: 0 });
    expect(database.progress?.status).toBe("COMPLETED");
  });

  it.each([
    ["missing", [{ difficulty_level: "BEGINNER", xp: 50 }]],
    ["empty", []],
    ["negative", [{ difficulty_level: "BEGINNER", xp: -1 }]],
    ["fractional", [{ difficulty_level: "BEGINNER", xp: 1.5 }]],
    ["string", [{ difficulty_level: "BEGINNER", xp: "50" }]],
    ["null", [{ difficulty_level: "BEGINNER", xp: null }]],
    ["unknown difficulty", [{ difficulty_level: "OTHER", xp: 50 }]],
    ["duplicate", [{ difficulty_level: "BEGINNER", xp: 50 }, { difficulty_level: "BEGINNER", xp: 50 }]],
  ])("rejects %s configuration before any writes", async (_name, rows) => {
    database.xpConfig = rows as typeof database.xpConfig;
    await expect(submit(3)).rejects.toThrow("Learning XP configuration");
    expect(database.progress).toBeNull();
    expect(database.xpWrites).toEqual([]);
  });

  it("blocks reads and submission on a database error without using cached XP", async () => {
    await submit(2);
    const originalProgress = { ...database.progress };
    database.configError = { message: "permission denied" };
    await expect(submit(3)).rejects.toThrow("permission denied");
    await expect(new LearningCentreRepository().fetchLearningCentreData()).rejects.toThrow("permission denied");
    expect(() => calculateArticleXp("BEGINNER")).toThrow("unavailable");
    expect(database.progress).toEqual(originalProgress);
    expect(database.xpWrites).toEqual([]);
  });

  it("requires configuration even before the first catalogue load", () => {
    expect(() => new LearningCentreRepository().calculateArticleXp("BEGINNER"))
      .toThrow("unavailable");
  });
});


describe("confirmed XP persistence", () => {
  it("confirms the intended user's saved balance before returning an award", async () => {
    expect(await submit(4)).toMatchObject({ xpEarned: 50, updatedLearningXp: 250 });
    expect(database.userFilter).toBe("user");
    expect(database.xp).toBe(250);
  });

  it("reports an XP update error instead of returning success", async () => {
    database.xpError = { message: "permission denied" };
    await expect(submit(4)).rejects.toThrow("Failed to update learning XP: permission denied");
    expect(database.xp).toBe(200);
    expect(database.xpWrites).toEqual([]);
    // Existing separate-write architecture is preserved: progress was saved first.
    expect(database.progress?.status).toBe("COMPLETED");
  });

  it.each([
    { rows: [] },
    { rows: [{ id: "other-user", learning_xp: 250 }] },
    { rows: [{ id: "user", learning_xp: 200 }] },
    { rows: [{ id: "user", learning_xp: 250 }, { id: "user", learning_xp: 250 }] },
  ])("rejects unconfirmed update responses: %j", async ({ rows }) => {
    database.xpResponse = rows;
    await expect(submit(4)).rejects.toThrow("Could not confirm");
    expect(database.xp).toBe(200);
  });

  it("uses the submission's returned map while another refresh clears shared configuration", async () => {
    const repository = new LearningCentreRepository();
    const fetch = repository.fetchDifficultyXp.bind(repository);
    vi.spyOn(repository, "fetchDifficultyXp").mockImplementationOnce(async () => {
      const ownMap = await fetch();
      // Model another refresh's invalidation between fetch completion and lookup.
      (repository as unknown as { difficultyXp: unknown }).difficultyXp = null;
      return ownMap;
    });
    const result = await repository.submitLearningQuiz({
      userId: "user", article, questions, selectedAnswers: selections(4), categories,
      progressByArticleId: {}, badges: [], earnedBadgeIds: new Set(), currentLearningXp: 200,
    });
    expect(result).toMatchObject({ xpEarned: 50, updatedLearningXp: 250 });
  });
});


describe("article sequence", () => {
  it("preserves category order and sorts by article position, creation date, then numeric ID", async () => {
    database.catalogue = [
      { ...categories[0], id: "later", display_order: 2, articles: [] },
      { ...categories[0], display_order: 1, articles: [
        { ...article, id: "4", display_order: 3, created_at: "2020-01-01" },
        { ...article, id: "22", display_order: 2, created_at: "2030-01-01" },
        { ...article, id: "1", display_order: 1, created_at: "2027-01-01T00:00:00Z" },
        { ...article, id: "10", display_order: 1, created_at: "2026-01-01T00:00:00Z" },
        { ...article, id: "3", display_order: 1, created_at: "2026-01-01T02:00:00+02:00" },
      ] },
    ];
    const result = await new LearningCentreRepository().fetchLearningCentreData();
    expect(result.map(category => category.id)).toEqual(["category", "later"]);
    expect(result[0].articles.map(lesson => lesson.id)).toEqual(["3", "10", "1", "22", "4"]);
  });
});
