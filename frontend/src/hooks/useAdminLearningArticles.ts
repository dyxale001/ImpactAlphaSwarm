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
};

const emptyFormValues: LearningArticleFormValues = {
  title: "",
  slug: "",
  summary: "",
  content: "",
  category_id: "",
};

export function useAdminLearningArticles() {
  const [articles, setArticles] = useState<LearningArticle[]>([]);
  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [categoriesResult, articlesResult] = await Promise.all([
      supabase
        .from("learning_categories")
        .select("id, name, slug, description, display_order, created_at")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("learning_articles")
        .select("id, category_id, title, slug, summary, content, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (categoriesResult.error) {
      setError(categoriesResult.error.message);
      setLoading(false);
      return;
    }

    if (articlesResult.error) {
      setError(articlesResult.error.message);
      setLoading(false);
      return;
    }

    setCategories((categoriesResult.data ?? []) as LearningCategory[]);
    setArticles((articlesResult.data ?? []) as LearningArticle[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchArticles();
  }, [fetchArticles]);

  const createArticle = async (values: LearningArticleFormValues) => {
    const { error: createError } = await supabase
      .from("learning_articles")
      .insert({
        title: values.title,
        slug: values.slug,
        summary: values.summary,
        content: values.content,
        category_id: values.category_id,
      });

    if (createError) {
      throw new Error(createError.message);
    }

    await fetchArticles();
  };

  const updateArticle = async (
    id: string,
    values: LearningArticleFormValues,
  ) => {
    const { error: updateError } = await supabase
      .from("learning_articles")
      .update({
        title: values.title,
        slug: values.slug,
        summary: values.summary,
        content: values.content,
        category_id: values.category_id,
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await fetchArticles();
  };

  const deleteArticle = async (id: string) => {
    const { error: deleteError } = await supabase
      .from("learning_articles")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

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
