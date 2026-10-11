import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningArticle, LearningCategory, LearningProgress } from "../../types/learning";
import { deriveLearningRoadmap } from "../../utils/learningRoadmap";

const database = vi.hoisted(() => ({
  progress: null as LearningProgress | null,
  xp: 200,
  xpWrites: [] as number[],
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      let operation = "";
      let payload: Record<string, unknown> = {};
      const execute = () => {
        if (table === "user_learning_progress") {
          if (operation === "insert" || database.progress) {
            database.progress = { id: "progress", ...payload } as LearningProgress;
            return { data: [{ id: "progress" }], error: null };
          }
          return { data: [], error: null };
        }
        if (table === "users") {
          database.xp = payload.learning_xp as number;
          database.xpWrites.push(database.xp);
          return { data: null, error: null };
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
        eq: () => query,
        select: async () => execute(),
        then: (resolve: (value: ReturnType<typeof execute>) => unknown) =>
          Promise.resolve(execute()).then(resolve),
      };
      return query;
    },
  },
}));

vi.mock("./badgeStorageService", () => ({ getBadgeIconSignedUrl: vi.fn() }));

import { LearningQuizEngine, submitLearningQuiz } from "./learningService";

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
  summary: "Summary", content: "Content", difficulty_level: "BEGINNER",
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
