import { describe, expect, it } from "vitest";
import { deriveLearningRoadmap } from "./learningRoadmap";
import type { LearningArticle, LearningCategory, LearningProgress } from "../types/learning";

const article = (id: string, difficulty_level: LearningArticle["difficulty_level"]): LearningArticle => ({
  id, difficulty_level, title: id, category_id: "category", slug: id,
  summary: "", content: "", created_at: "2026-01-01", questions: [],
});
const first = article("first", "BEGINNER");
const middle = article("middle", "INTERMEDIATE");
const last = article("last", "ADVANCED");
const catalogue = (articles = [first, middle, last]): LearningCategory[] => [{
  id: "category", name: "Category", slug: "category", description: "", display_order: 1,
  created_at: "2026-01-01", articles,
}];
const progress = (id: string, status: LearningProgress["status"]): LearningProgress => ({
  id, article_id: id, user_id: "user", status, quiz_score: null,
});

describe("derived learning roadmap", () => {
  it.each([['novice', first], ['intermediate', middle], ['advanced', last]] as const)("uses %s expertise only as an entry point", (expertise, expected) => {
    const result = deriveLearningRoadmap(catalogue(), {}, expertise);
    expect(result.recommended).toBe(expected);
    expect(result.completedCount).toBe(0);
    expect(result.articles).toEqual([first, middle, last]);
  });
  it("prioritises in-progress work over expertise", () => {
    expect(deriveLearningRoadmap(catalogue(), { first: progress("first", "IN_PROGRESS") }, "advanced").recommended).toBe(first);
  });
  it("advances after completed intermediate work instead of repeating the entry point", () => {
    expect(deriveLearningRoadmap(catalogue(), { middle: progress("middle", "COMPLETED") }, "intermediate").recommended).toBe(last);
  });
  it("returns to earlier gaps after reaching the end", () => {
    expect(deriveLearningRoadmap(catalogue(), { last: progress("last", "COMPLETED") }, "advanced").recommended).toBe(first);
  });
  it("uses repository order rather than sorting by difficulty, title or timestamp", () => {
    const result = deriveLearningRoadmap(catalogue([last, first, middle]), { last: progress("last", "COMPLETED") }, "advanced");
    expect(result.articles).toEqual([last, first, middle]);
    expect(result.recommended).toBe(first);
  });
  it("does not invent progress from orphaned records or expertise", () => {
    expect(deriveLearningRoadmap(catalogue(), { missing: progress("missing", "COMPLETED") }, "intermediate").recommended).toBe(middle);
  });
  it("handles absent expertise and absent matching complexity", () => {
    expect(deriveLearningRoadmap(catalogue(), {}, undefined).recommended).toBe(first);
    expect(deriveLearningRoadmap(catalogue([first]), {}, "advanced").recommended).toBe(first);
  });
  it("has no recommendation when every lesson is complete", () => {
    const result = deriveLearningRoadmap(catalogue(), Object.fromEntries([first, middle, last].map(a => [a.id, progress(a.id, "COMPLETED")])), "advanced");
    expect(result.recommended).toBeUndefined();
    expect(result.completedCount).toBe(3);
  });
  it("handles empty catalogues", () => {
    expect(deriveLearningRoadmap([], {}, undefined)).toMatchObject({ articles: [], completedCount: 0, recommended: undefined });
  });
});
