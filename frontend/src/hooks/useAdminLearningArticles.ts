import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  LearningArticle,
  LearningCategory,
} from "../data/learningContent";

export type LearningArticleFormValues = {
  title: string;
  slug: string;
  summary: string;
  content: string;
  category_id: string;
  difficulty_level: string;
  display_order: string;
};

const emptyFormValues: LearningArticleFormValues = {
  title: "",
  slug: "",
  summary: "",
  content: "",
  category_id: "",
  difficulty_level: "",
  display_order: "",
};

export class LearningArticleAdminRepository {
  private readonly client = supabase;

  async fetchArticles() {
    const [categoriesResult, articlesResult] = await Promise.all([
      this.client
        .from("learning_categories")
        .select("id, name, slug, description, display_order, created_at")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      this.client
        .from("learning_articles")
        .select(
          "id, category_id, title, slug, summary, content, difficulty_level, display_order, created_at",
        )
        .order("created_at", { ascending: false }),
    ]);

    if (categoriesResult.error) {
      throw new Error(categoriesResult.error.message);
    }

    if (articlesResult.error) {
      throw new Error(articlesResult.error.message);
    }

    const categories = (categoriesResult.data ?? []) as LearningCategory[];
    const categoryOrder = new Map(categories.map(category => [category.id, category.display_order]));
    const articles = ((articlesResult.data ?? []) as LearningArticle[]).sort((a, b) =>
      (categoryOrder.get(a.category_id) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(b.category_id) ?? Number.MAX_SAFE_INTEGER) ||
      a.display_order - b.display_order ||
      Date.parse(a.created_at) - Date.parse(b.created_at) || Number(a.id) - Number(b.id));
    return { categories, articles };
  }

  private async resolveDisplayOrder(values: LearningArticleFormValues) {
    if (values.display_order.trim() !== "") {
      const position = Number(values.display_order);
      if (!/^\d+$/.test(values.display_order.trim()) || !Number.isInteger(position) ||
          position < 1 || position > 2147483647) {
        throw new Error("Order within category must be a positive integer.");
      }
      return position;
    }
    const { data: positions, error: positionError } = await this.client
      .from("learning_articles")
      .select("display_order")
      .eq("category_id", values.category_id)
      .order("display_order", { ascending: false })
      .limit(1);
    if (positionError) throw new Error(positionError.message);
    const position = (positions?.[0]?.display_order ?? 0) + 1;
    if (!Number.isInteger(position) || position < 1 || position > 2147483647) {
      throw new Error("Unable to assign a valid order within category.");
    }
    return position;
  }

  async createArticle(values: LearningArticleFormValues) {
    const displayOrder = await this.resolveDisplayOrder(values);
    const { error } = await this.client.from("learning_articles").insert({
      title: values.title,
      slug: values.slug,
      summary: values.summary,
      content: values.content,
      category_id: values.category_id,
      difficulty_level: values.difficulty_level,
      display_order: displayOrder,
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async updateArticle(id: string, values: LearningArticleFormValues) {
    const displayOrder = await this.resolveDisplayOrder(values);
    const { error } = await this.client
      .from("learning_articles")
      .update({
        title: values.title,
        slug: values.slug,
        summary: values.summary,
        content: values.content,
        category_id: values.category_id,
        difficulty_level: values.difficulty_level,
        display_order: displayOrder,
      })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }
  }

  async deleteArticle(id: string) {
    const { error } = await this.client
      .from("learning_articles")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export function useAdminLearningArticles() {
  const [articles, setArticles] = useState<LearningArticle[]>([]);
  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const repository = useMemo(() => new LearningArticleAdminRepository(), []);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await repository.fetchArticles();
      setCategories(result.categories);
      setArticles(result.articles);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Unable to load learning articles.",
      );
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void fetchArticles();
  }, [fetchArticles]);

  const createArticle = async (values: LearningArticleFormValues) => {
    await repository.createArticle(values);
    await fetchArticles();
  };

  const updateArticle = async (
    id: string,
    values: LearningArticleFormValues,
  ) => {
    await repository.updateArticle(id, values);
    await fetchArticles();
  };

  const deleteArticle = async (id: string) => {
    await repository.deleteArticle(id);
    setArticles((current) => current.filter((article) => article.id !== id));
  };

  return {
    articles,
    categories,
    categoryById,
    loading,
    error,
    refreshArticles: fetchArticles,
    createArticle,
    updateArticle,
    deleteArticle,
    emptyFormValues,
  };
}
