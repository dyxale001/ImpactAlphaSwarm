import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { deriveDashboardLearning, type LearningData } from "./learningSummary";
import { deriveLearningRoadmap } from "../utils/learningRoadmap";
import type { LearningArticle, LearningProgress } from "../types/learning";

const context = vi.hoisted(() => ({ value: {} as ReturnType<typeof deriveDashboardLearning> }));
vi.mock("./DashboardDataContext", () => ({ useDashboardLearning: () => context.value }));
import { LearningNextWidget, LearningProgressWidget } from "../components/dashboard/widgets/learningWidgets";

const articles = (["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const).map((difficulty_level, i): LearningArticle => ({
  id: String(i), category_id: "category", title: `Lesson ${i}`, slug: String(i),
  summary: "Summary", content: "", difficulty_level, created_at: "2026-01-01", questions: [],
}));
function data(statuses: LearningProgress["status"][] = []): LearningData {
  return {
    categories: [{ id: "category", name: "Category", slug: "category", description: "", display_order: 1, created_at: "2026-01-01", articles }],
    userState: { learningXp: 100, earnedBadgeIds: new Set(), issues: [], progressEntries: [],
      progressByArticleId: Object.fromEntries(statuses.map((status, i) => [String(i), {
        id: String(i), article_id: String(i), user_id: "user", status, quiz_score: null,
      }])) },
  };
}
const render = (Component: typeof LearningNextWidget) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Component)));

describe("dashboard Learning integration", () => {
  it.each([
    ["in-progress beats untouched", ["NOT_STARTED", "IN_PROGRESS"], "advanced"],
    ["after furthest completion", ["NOT_STARTED", "COMPLETED"], "intermediate"],
    ["intermediate entry", [], "intermediate"],
    ["advanced entry", [], "advanced"],
    ["everything complete", ["COMPLETED", "COMPLETED", "COMPLETED"], "advanced"],
  ] as const)("matches roadmap: %s", (_, statuses, expertise) => {
    const input = data([...statuses]);
    const result = deriveDashboardLearning(input, [], expertise, false, false);
    expect(result.next.nextArticle).toBe(deriveLearningRoadmap(input.categories, input.userState.progressByArticleId, expertise).recommended ?? null);
    if (result.next.nextArticle) {
      expect(articles).toContain(result.next.nextArticle);
      expect(result.next.nextArticleCategory).toBe("Category");
    }
  });
  it.each(["progress", "profile", "earnedBadges"] as const)("does not render fallback progress when %s fails", scope => {
    const input = data();
    input.userState.issues.push({ scope, message: "backend detail" });
    context.value = deriveDashboardLearning(input, [], "advanced", false, false);
    expect(context.value.progress.summary).toBeNull();
    const html = render(LearningProgressWidget);
    expect(html).toContain("Unable to load your learning progress.");
    expect(html).not.toContain("Learning XP");
    expect(html).not.toContain("backend detail");
    expect(Boolean(context.value.next.error)).toBe(scope === "progress");
  });
  it("badge loading and failure do not block recommendations", () => {
    for (const badgeError of [false, true]) {
      context.value = deriveDashboardLearning(data(), null, "advanced", false, badgeError);
      expect(context.value.next.isLoading).toBe(false);
      expect(context.value.next.error).toBeNull();
      expect(render(LearningNextWidget)).toContain("Lesson 2");
    }
  });
  it("distinguishes empty content from all completed", () => {
    const empty = data();
    empty.categories = [];
    context.value = deriveDashboardLearning(empty, [], undefined, false, false);
    expect(render(LearningNextWidget)).toContain("No learning content available yet.");
    expect(render(LearningNextWidget)).not.toContain("finished every article");
    context.value = deriveDashboardLearning(data(["COMPLETED", "COMPLETED", "COMPLETED"]), [], undefined, false, false);
    expect(render(LearningNextWidget)).toContain("finished every article");
  });
  it("keeps fetch errors distinct from loading and empty content", () => {
    context.value = deriveDashboardLearning(null, null, undefined, true, false);
    expect(render(LearningNextWidget)).toContain("Unable to load your next lesson.");
    context.value = deriveDashboardLearning(null, null, undefined, false, false);
    const html = render(LearningNextWidget);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading widget content");
    expect(html).not.toContain("finished every article");
  });
});
