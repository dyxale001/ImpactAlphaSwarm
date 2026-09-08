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
};

const emptyFormValues: LearningArticleFormValues = {
  title: "",
  slug: "",
  summary: "",
  content: "",
  category_id: "",
  difficulty_level: "",
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
          "id, category_id, title, slug, summary, content, difficulty_level, created_at",
        )
        .order("created_at", { ascending: false }),
    ]);

    if (categoriesResult.error) {
      throw new Error(categoriesResult.error.message);
    }

    if (articlesResult.error) {
      throw new Error(articlesResult.error.message);
    }

    return {
      categories: (categoriesResult.data ?? []) as LearningCategory[],
      articles: (articlesResult.data ?? []) as LearningArticle[],
    };
  }

  async createArticle(values: LearningArticleFormValues) {
    const { error } = await this.client.from("learning_articles").insert({
      title: values.title,
      slug: values.slug,
      summary: values.summary,
      content: values.content,
      category_id: values.category_id,
      difficulty_level: values.difficulty_level,
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async updateArticle(id: string, values: LearningArticleFormValues) {
    const { error } = await this.client
      .from("learning_articles")
      .update({
        title: values.title,
        slug: values.slug,
        summary: values.summary,
        content: values.content,
        category_id: values.category_id,
        difficulty_level: values.difficulty_level,
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
