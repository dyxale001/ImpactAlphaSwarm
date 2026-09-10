import { describe, expect, it } from "vitest";
import type { LearningBadge } from "../types/learning";
import { deriveNumericBadgeMilestones } from "./learningBadgeMilestones";
const badge = (id: string, criteria_value: string, criteria_type = "ARTICLES_COMPLETED"): LearningBadge => ({
  id, criteria_value, criteria_type, name: id, description: "", icon_path: "", created_at: "",
});
describe("numeric badge milestones", () => {
  it("sorts thresholds, not catalogue order, and retains actual badge objects", () => {
    const higher = badge("higher", "19");
    const lower = badge("lower", "7");
    const result = deriveNumericBadgeMilestones([higher, lower], "ARTICLES_COMPLETED", 3, new Set());
    expect(result.map(m => m.threshold)).toEqual([7, 19]);
    expect(result[0]).toMatchObject({ badge: lower, next: true, remaining: 4 });
    expect(result[0].badge).toBe(lower);
    expect(result[1].next).toBe(false);
  });
  it("rejects malformed, nonpositive, fractional and unsafe thresholds", () => {
    const values = ["", "0", "-2", "2.5", "7abc", "1e3", "Infinity", "9007199254740992"];
    expect(deriveNumericBadgeMilestones(values.map(v => badge(v, v)), "ARTICLES_COMPLETED", 0, new Set())).toEqual([]);
    expect(deriveNumericBadgeMilestones([badge("valid", " 007 ")], "ARTICLES_COMPLETED", 0, new Set())[0].threshold).toBe(7);
  });
  it("distinguishes satisfied-but-unawarded from earned and future", () => {
    const result = deriveNumericBadgeMilestones([badge("met", "3"), badge("earned", "7"), badge("future", "11")], "ARTICLES_COMPLETED", 4, new Set(["earned"]));
    expect(result[0]).toMatchObject({ earned: false, satisfied: true, next: false, remaining: 0 });
    expect(result[1]).toMatchObject({ earned: true, next: false });
    expect(result[2]).toMatchObject({ earned: false, next: true, remaining: 7 });
  });
  it("keeps XP separate and ignores unknown criteria", () => {
    const result = deriveNumericBadgeMilestones([badge("articles", "7"), badge("xp", "320", "XP_REACHED"), badge("unknown", "8", "FUTURE")], "XP_REACHED", 220, new Set());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ remaining: 100, next: true });
  });
  it("handles ties consistently and adapts to changed thresholds", () => {
    const a = badge("a", "8"), b = badge("b", "8");
    expect(deriveNumericBadgeMilestones([b, a], "ARTICLES_COMPLETED", 0, new Set()).map(m => [m.badge.id, m.next])).toEqual([["a", true], ["b", true]]);
    expect(deriveNumericBadgeMilestones([a, { ...b, criteria_value: "4" }], "ARTICLES_COMPLETED", 0, new Set())[0].badge.id).toBe("b");
  });
  it("has no future goal when all records are earned or satisfied", () => {
    expect(deriveNumericBadgeMilestones([badge("one", "3")], "ARTICLES_COMPLETED", 3, new Set()).some(m => m.next)).toBe(false);
    expect(deriveNumericBadgeMilestones([], "XP_REACHED", 0, new Set())).toEqual([]);
  });
});

import { deriveNextBadgeMilestone } from "./learningBadgeMilestones";
import type { LearningArticle, LearningCategory, LearningProgress } from "../types/learning";
const lessons: LearningArticle[] = ["a", "b", "c", "d"].map(id => ({
  id, title: id, slug: id, category_id: "category", summary: "", content: "",
  difficulty_level: "BEGINNER", created_at: "", questions: [], quiz_question_count: 1,
}));
const categories: LearningCategory[] = [{ id: "category", name: "Sample Category", slug: "sample", description: "", created_at: "", display_order: 0, articles: lessons }];
const input = (badges: LearningBadge[]) => ({ badges, earnedBadgeIds: new Set<string>(), categories,
  progress: {} as Record<string, LearningProgress>, xp: 0, recommended: lessons[0],
  calculateArticleXp: () => 20 }); // Deliberately supplied fixture rule, not production XP configuration.

describe("single next milestone", () => {
  it.each([[2, 60, "article"], [3, 20, "xp"], [2, 40, "article"]])("compares lesson distances and favours articles on ties (%s, %s)", (articleThreshold, xpThreshold, expected) => {
    const result = deriveNextBadgeMilestone(input([badge("article", String(articleThreshold)), badge("xp", String(xpThreshold), "XP_REACHED")]));
    expect(result?.badge.id).toBe(expected);
  });
  it("uses the provided XP rule, skips completed lessons, and starts at the recommendation", () => {
    const args = input([badge("article", "5"), badge("xp", "45", "XP_REACHED")]);
    args.recommended = lessons[2];
    args.calculateArticleXp = () => 30;
    args.progress.b = { id: "p", user_id: "u", article_id: "b", status: "COMPLETED", quiz_score: 100 };
    expect(deriveNextBadgeMilestone(args)).toMatchObject({ badge: { id: "xp" }, estimatedLessons: 2 });
  });
  it("wraps earlier incomplete lessons in repository order", () => {
    const args = input([badge("xp", "40", "XP_REACHED")]);
    args.recommended = lessons[3];
    expect(deriveNextBadgeMilestone(args)?.estimatedLessons).toBe(2);
  });
  it.each([0, undefined])("prefers articles when an upcoming quiz count is %s", count => {
    const args = input([badge("article", "3"), badge("xp", "20", "XP_REACHED")]);
    args.categories = [{ ...categories[0], articles: [{ ...lessons[0], quiz_question_count: count }, ...lessons.slice(1)] }];
    expect(deriveNextBadgeMilestone(args)?.badge.id).toBe("article");
  });
  it("falls back to articles for unreachable XP or invalid XP rules", () => {
    const args = input([badge("article", "2"), badge("xp", "900", "XP_REACHED")]);
    expect(deriveNextBadgeMilestone(args)?.badge.id).toBe("article");
    args.calculateArticleXp = () => NaN;
    expect(deriveNextBadgeMilestone(args)?.badge.id).toBe("article");
  });
  it("uses XP without an estimate if no article candidate remains", () => {
    const result = deriveNextBadgeMilestone(input([badge("xp", "900", "XP_REACHED"), badge("category", "sample", "CATEGORY_COMPLETED")]));
    expect(result).toMatchObject({ badge: { id: "xp" }, remaining: 900 });
    expect(result?.estimatedLessons).toBeUndefined();
  });
  it("excludes earned and satisfied-but-unawarded candidates", () => {
    const args = input([badge("met", "10", "XP_REACHED"), badge("earned", "30", "XP_REACHED"), badge("future", "60", "XP_REACHED")]);
    args.xp = 20;
    args.earnedBadgeIds.add("earned");
    expect(deriveNextBadgeMilestone(args)).toMatchObject({ badge: { id: "future" }, current: 20, target: 60, remaining: 40 });
  });
  it("matches category fallback by normalized name or slug and excludes completed categories", () => {
    const args = input([badge("category", " SAMPLE CATEGORY ", "CATEGORY_COMPLETED")]);
    expect(deriveNextBadgeMilestone(args)).toMatchObject({ badge: { id: "category" }, current: 0, target: 4 });
    args.badges = [badge("category", " SAMPLE ", "CATEGORY_COMPLETED")];
    expect(deriveNextBadgeMilestone(args)?.badge.id).toBe("category");
    args.progress = Object.fromEntries(lessons.map(a => [a.id, { id: a.id, user_id: "u", article_id: a.id, status: "COMPLETED", quiz_score: 100 }]));
    expect(deriveNextBadgeMilestone(args)).toBeUndefined();
  });
  it("ignores unknown types, invalid thresholds, unmatched categories, and earned category badges", () => {
    expect(deriveNextBadgeMilestone(input([badge("bad", "2abc"), badge("unknown", "2", "NEW_TYPE"), badge("category", "missing", "CATEGORY_COMPLETED")]))).toBeUndefined();
    const args = input([badge("category", "sample", "CATEGORY_COMPLETED")]);
    args.earnedBadgeIds.add("category");
    expect(deriveNextBadgeMilestone(args)).toBeUndefined();
  });
});
