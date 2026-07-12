import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "../lib/supabase";

import LearningCategorySection from "../components/learning/LearningCategorySection";
import ArticleViewerModal from "../components/learning/ResourceViewerModal";

import type {
  LearningCategory,
  LearningArticle,
} from "../data/learningContent";

export default function LearningPage() {
  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [selectedArticle, setSelectedArticle] =
    useState<LearningArticle | null>(null);

  useEffect(() => {
    async function loadLearningContent() {
      const { data, error } = await supabase
        .from("learning_categories")
        .select(
          `
          *,
          articles:learning_articles(*)
        `,
        )
        .order("display_order");

      if (error) {
        console.error("Failed loading learning content:", error);
        return;
      }

      setCategories(data ?? []);
    }

    loadLearningContent();
  }, []);

  return (
    <>
      <div
        className="
        max-w-7xl
        mx-auto
        px-6
        space-y-8
      "
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
          <div className="space-y-2 max-w-3xl">
            <p className="text-xs uppercase tracking-[0.12em] text-brand-primary font-semibold">
              Learning Centre
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-brand-fg">
              Build confidence with guided investing lessons
            </h1>
            <p className="text-brand-muted-fg text-sm leading-relaxed">
              Explore structured educational content designed to help you
              understand markets, evaluate opportunities, and grow your
              investing toolkit.
            </p>
          </div>
        </div>

        <section className="glass-card p-4 rounded-2xl">
          <div
            className="
            flex items-center gap-3 
            border border-brand-border
            rounded-xl px-4 py-3
          "
          >
            <Search className="w-4 h-4" />

            <input
              placeholder="Search learning topics..."
              className="
              bg-transparent 
              focus:outline-none
              w-full
              "
            />
          </div>
        </section>

        <div className="space-y-8">
          {categories.map((category) => (
            <LearningCategorySection
              key={category.id}
              category={category}
              onOpenArticle={setSelectedArticle}
            />
          ))}
        </div>
      </div>

      <ArticleViewerModal
        article={selectedArticle}
        onClose={() => setSelectedArticle(null)}
      />
    </>
  );
}
