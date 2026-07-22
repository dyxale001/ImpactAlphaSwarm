import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { LearningCategory } from "../data/learningContent";

export type LearningCategoryFormValues = {
  name: string;
  slug: string;
  description: string;
  display_order: number;
};

const emptyFormValues: LearningCategoryFormValues = {
  name: "",
  slug: "",
  description: "",
  display_order: 0,
};

export function useAdminLearningCategories() {
  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("learning_categories")
      .select("*, articles:learning_articles(id)")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    setCategories((data ?? []) as LearningCategory[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  const createCategory = async (values: LearningCategoryFormValues) => {
    const { error: createError } = await supabase
      .from("learning_categories")
      .insert({
        name: values.name,
        slug: values.slug,
        description: values.description,
        display_order: values.display_order,
      })

    if (createError) {
      throw new Error(createError.message);
    }

    await fetchCategories();
  };

  const updateCategory = async (
    id: string,
    values: LearningCategoryFormValues,
  ) => {
    const { error: updateError } = await supabase
      .from("learning_categories")
      .update({
        name: values.name,
        slug: values.slug,
        description: values.description,
        display_order: values.display_order,
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await fetchCategories();
  };

  const deleteCategory = async (id: string) => {
    const { error: deleteError } = await supabase
      .from("learning_categories")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    await fetchCategories();
  };

  return {
    categories,
    loading,
    error,
    refreshCategories: fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    emptyFormValues,
  };
}
