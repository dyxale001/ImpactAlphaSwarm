import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  positions: [] as Array<{ display_order: number }>,
  error: null as { message: string } | null,
  category: "",
  inserted: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  articles: [] as Array<Record<string, unknown>>,
  categories: [] as Array<Record<string, unknown>>,
}));

vi.mock("../lib/supabase", () => ({ supabase: {
  from: (table: string) => {
    const query = {
      select: () => query,
      eq: (_column: string, value: string) => { db.category = value; return query; },
      order: () => query,
      limit: async () => ({ data: db.positions, error: db.error }),
      update: (payload: Record<string, unknown>) => { db.updated = payload; return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: table === "learning_categories" ? db.categories : db.articles, error: null,
      }).then(resolve),
      insert: async (payload: Record<string, unknown>) => {
        db.inserted = payload;
        return { error: null };
      },
    };
    return query;
  },
} }));

import { LearningArticleAdminRepository, type LearningArticleFormValues } from "./useAdminLearningArticles";
const values: LearningArticleFormValues = {
  tags: [], video_url: "",
  title: "New lesson", slug: "new-lesson", summary: "Summary", content: "Content",
  category_id: "category", difficulty_level: "BEGINNER", display_order: "",
};

beforeEach(() => { db.positions = []; db.error = null; db.category = ""; db.inserted = null; db.updated = null; db.articles = []; db.categories = []; });

describe("new article positions", () => {
  it("starts at one in an empty category", async () => {
    await new LearningArticleAdminRepository().createArticle(values);
    expect(db.category).toBe("category");
    expect(db.inserted).toEqual({ ...values, video_url: null, display_order: 1 });
  });

  it("appends after the category's highest position", async () => {
    db.positions = [{ display_order: 5 }];
    await new LearningArticleAdminRepository().createArticle(values);
    expect(db.inserted?.display_order).toBe(6);
  });

  it("does not insert if the position read fails", async () => {
    db.error = { message: "permission denied" };
    await expect(new LearningArticleAdminRepository().createArticle(values)).rejects.toThrow("permission denied");
    expect(db.inserted).toBeNull();
  });
});


describe("admin article ordering", () => {
  it("sorts categories by their positions, then article positions, creation dates and numeric IDs", async () => {
    db.categories = [{ id: "first", display_order: 1 }, { id: "second", display_order: 2 }];
    db.articles = [
      { id: "1", category_id: "second", display_order: 1, created_at: "2020-01-01T00:00:00Z" },
      { id: "4", category_id: "first", display_order: 2, created_at: "2020-01-01T00:00:00Z" },
      { id: "2", category_id: "first", display_order: 1, created_at: "2027-01-01T00:00:00Z" },
      { id: "10", category_id: "first", display_order: 1, created_at: "2026-01-01T00:00:00Z" },
      { id: "3", category_id: "first", display_order: 1, created_at: "2026-01-01T02:00:00+02:00" },
    ];
    const result = await new LearningArticleAdminRepository().fetchArticles();
    expect(result.articles.map(article => article.id)).toEqual(["3", "10", "2", "4", "1"]);
  });

  it("creates an explicitly positioned article without an append lookup", async () => {
    db.error = { message: "append read must not happen" };
    await new LearningArticleAdminRepository().createArticle({ ...values, display_order: "2" });
    expect(db.inserted?.display_order).toBe(2);
  });

  it("preserves the prepopulated position on an ordinary edit", async () => {
    await new LearningArticleAdminRepository().updateArticle("4", { ...values, display_order: "3" });
    expect(db.updated?.display_order).toBe(3);
  });

  it("appends a category-moved article when its form position is cleared", async () => {
    db.positions = [{ display_order: 5 }];
    await new LearningArticleAdminRepository().updateArticle("4", { ...values, category_id: "destination" });
    expect(db.updated).toMatchObject({ category_id: "destination", display_order: 6 });
  });

  it("honours an explicit position after a category change", async () => {
    await new LearningArticleAdminRepository().updateArticle("4", { ...values, category_id: "destination", display_order: "2" });
    expect(db.updated).toMatchObject({ category_id: "destination", display_order: 2 });
  });

  it.each(["0", "-1", "1.5", "1e2", "abc", "2147483648"])("rejects invalid position %s before writing", async display_order => {
    const repository = new LearningArticleAdminRepository();
    await expect(repository.createArticle({ ...values, display_order })).rejects.toThrow("positive integer");
    await expect(repository.updateArticle("4", { ...values, display_order })).rejects.toThrow("positive integer");
    expect(db.inserted).toBeNull();
    expect(db.updated).toBeNull();
  });
});

describe('article contextual metadata', () => {
  it('saves normalized controlled tags and video', async () => {
    await new LearningArticleAdminRepository().createArticle({ ...values, tags: [' STOCKS ', 'stocks', 'quant-analysis'], video_url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(db.inserted?.tags).toEqual(['stocks', 'quant-analysis']);
    expect(db.inserted?.video_url).toBe('https://youtu.be/dQw4w9WgXcQ');
  });
  it('removes tags and videos during editing', async () => {
    await new LearningArticleAdminRepository().updateArticle('1', { ...values, tags: [], video_url: '' });
    expect(db.updated?.tags).toEqual([]); expect(db.updated?.video_url).toBeNull();
  });
  it('rejects unsupported video before writing', async () => {
    await expect(new LearningArticleAdminRepository().createArticle({ ...values, video_url: 'https://evil.test/video' })).rejects.toThrow('supported HTTPS');
  });
});

it('reloads article tags and optional video metadata for editing', async () => {
  db.articles = [{ id: '1', category_id: 'category', tags: ['tfsa-planning'], video_url: 'https://vimeo.com/123', display_order: 1, created_at: '2026-10-13' }];
  const result = await new LearningArticleAdminRepository().fetchArticles();
  expect(result.articles[0].tags).toEqual(['tfsa-planning']);
  expect(result.articles[0].video_url).toBe('https://vimeo.com/123');
});
