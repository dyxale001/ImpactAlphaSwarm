import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { LearningBadge, LearningCategory } from "../types/learning";
import {
  deleteBadgeIcon,
  getBadgeIconSignedUrl,
  uploadBadgeIcon,
} from "../services/supabase/badgeStorageService";

export type BadgeCriteriaType =
  | "ARTICLES_COMPLETED"
  | "XP_REACHED"
  | "CATEGORY_COMPLETED";

export type BadgeFormValues = {
  name: string;
  description: string;
  criteria_type: BadgeCriteriaType;
  criteria_value: string;
};

const emptyFormValues: BadgeFormValues = {
  name: "",
  description: "",
  criteria_type: "ARTICLES_COMPLETED",
  criteria_value: "1",
};

async function loadBadgesWithSignedUrls() {
  const { data, error } = await supabase
    .from("badges")
    .select(
      "id, name, description, icon_path, criteria_type, criteria_value, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const badges = (data ?? []) as LearningBadge[];

  return Promise.all(
    badges.map(async (badge) => ({
      ...badge,
      icon_url: await getBadgeIconSignedUrl(badge.icon_path),
    })),
  );
}

async function loadLearningCategories() {
  const { data, error } = await supabase
    .from("learning_categories")
    .select("id, name, slug, description, display_order, created_at")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LearningCategory[];
}

export function useAdminBadges() {
  const [badges, setBadges] = useState<LearningBadge[]>([]);
  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    const isSilent = options?.silent ?? false;

    if (!isSilent) {
      setLoading(true);
    }

    setError(null);

    try {
      const [badgeRows, categoryRows] = await Promise.all([
        loadBadgesWithSignedUrls(),
        loadLearningCategories(),
      ]);

      setBadges(badgeRows);
      setCategories(categoryRows);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Unable to load badge management data.",
      );
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const createBadge = async (values: BadgeFormValues, iconFile: File) => {
    const iconPath = await uploadBadgeIcon(iconFile);

    const { error: createError } = await supabase.from("badges").insert({
      name: values.name.trim(),
      description: values.description.trim(),
      icon_path: iconPath,
      criteria_type: values.criteria_type,
      criteria_value: values.criteria_value.trim(),
    });

    if (createError) {
      await deleteBadgeIcon(iconPath).catch(() => null);

      if (createError.code === "23505") {
        throw new Error("A badge with this name already exists.");
      }

      throw new Error(createError.message);
    }

    await fetchData({ silent: true });
  };

  const updateBadge = async (
    id: string,
    values: BadgeFormValues,
    newIconFile?: File | null,
  ) => {
    const existingBadge = badges.find((badge) => badge.id === id);

    if (!existingBadge) {
      throw new Error("The selected badge could not be found.");
    }

    let nextIconPath = existingBadge.icon_path;
    let uploadedIconPath: string | null = null;

    if (newIconFile) {
      uploadedIconPath = await uploadBadgeIcon(newIconFile);
      nextIconPath = uploadedIconPath;
    }

    const { error: updateError } = await supabase
      .from("badges")
      .update({
        name: values.name.trim(),
        description: values.description.trim(),
        icon_path: nextIconPath,
        criteria_type: values.criteria_type,
        criteria_value: values.criteria_value.trim(),
      })
      .eq("id", id);

    if (updateError) {
      if (uploadedIconPath) {
        await deleteBadgeIcon(uploadedIconPath).catch(() => null);
      }

      if (updateError.code === "23505") {
        throw new Error("A badge with this name already exists.");
      }

      throw new Error(updateError.message);
    }

    if (newIconFile && existingBadge.icon_path) {
      try {
        await deleteBadgeIcon(existingBadge.icon_path);
      } catch (deleteError) {
        throw new Error(
          deleteError instanceof Error
            ? `Badge saved, but the previous icon could not be deleted: ${deleteError.message}`
            : "Badge saved, but the previous icon could not be deleted.",
        );
      }
    }

    await fetchData({ silent: true });
  };

  const deleteBadge = async (id: string, iconPath: string | null) => {
    const { error: deleteError } = await supabase
      .from("badges")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    await fetchData({ silent: true });

    if (iconPath) {
      await deleteBadgeIcon(iconPath);
    }
  };

  return {
    badges,
    categories,
    loading,
    error,
    createBadge,
    updateBadge,
    deleteBadge,
    emptyFormValues,
    refreshBadges: fetchData,
  };
}
