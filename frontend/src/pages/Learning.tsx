import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "../lib/supabase";

import LearningCategorySection from "../components/learning/LearningCategorySection";
import ArticleViewerModal from "../components/learning/ResourceViewerModal";
import LearningCenterSkeleton from "../components/learning/LearningCenterSkeleton";

import type {
  LearningCategory,
  LearningArticle,
} from "../data/learningContent";

export default function LearningPage() {
  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [search, setSearch] = useState("");
  const [selectedArticle, setSelectedArticle] =
    useState<LearningArticle | null>(null);
  const [loading, setLoading] = useState(true);

  const scoreArticleMatch = (article: LearningArticle, query: string) => {
    const title = article.title.toLowerCase();
    const summary = article.summary.toLowerCase();
    const content = article.content.toLowerCase();
    const difficultyLevel = article.difficulty_level.toLowerCase();

    if (title === query) return 5;
    if (title.startsWith(query)) return 4;
    if (title.includes(query)) return 3;
    if (summary.includes(query)) return 2;
    if (content.includes(query)) return 1;
    if (difficultyLevel.includes(query)) return 1;

    return 0;
  };

  const suggestedArticles = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return [] as Array<LearningArticle & { categoryName: string }>;
    }

    return categories
      .flatMap((category) =>
        category.articles.map((article) => ({
          ...article,
          categoryName: category.name,
        })),
      )
      .map((article) => ({
        ...article,
        relevance: scoreArticleMatch(article, query),
      }))
      .filter((article) => article.relevance > 0)
      .sort((first, second) => {
        if (second.relevance !== first.relevance) {
          return second.relevance - first.relevance;
        }

        return first.title.localeCompare(second.title);
      })
      .slice(0, 5);
  }, [categories, search]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return categories;
    }

    return categories
      .map((category) => {
        const matchingArticles = category.articles.filter((article) => {
          const searchableText = [
            article.title,
            article.summary,
            article.content,
            article.difficulty_level,
          ]
            .join(" ")
            .toLowerCase();

          return searchableText.includes(query);
        });

        return {
          ...category,
          articles: matchingArticles,
        };
      })
      .filter((category) => category.articles.length > 0);
  }, [categories, search]);

  const hasSearchResults = filteredCategories.length > 0;

  useEffect(() => {
    async function loadLearningContent() {
      setLoading(true);

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
        setLoading(false);
        return;
      }

      setCategories(data ?? []);
      setLoading(false);
    }

    loadLearningContent();
  }, []);

  if (loading) {
    return <LearningCenterSkeleton />;
  }

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

        <section className="relative z-40 glass-card p-4 rounded-2xl">
          <div
            className="
            flex items-center gap-3 
            border border-brand-border
            rounded-xl px-4 py-3
            bg-brand-bg/70
          "
          >
            <Search className="w-4 h-4" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search learning topics..."
              className="
              bg-transparent 
              focus:outline-none
              w-full
              text-brand-fg
              placeholder:text-brand-muted-fg
              "
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-xs font-medium text-brand-muted-fg transition-colors hover:text-brand-fg"
              >
                Clear
              </button>
            )}
          </div>

          {search.trim().length > 0 && (
            <div className="absolute left-4 right-4 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-card">
              <div className="border-b border-brand-border/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-eyebrow text-brand-muted-fg">
                  Suggestions
                </p>
              </div>

              {suggestedArticles.length > 0 ? (
                <div className="max-h-96 divide-y divide-brand-border/50 overflow-y-auto">
                  {suggestedArticles.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSearch(article.title);
                        setSelectedArticle(article);
                      }}
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-brand-bg/60"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                          <p className="font-semibold text-brand-fg">
                            {article.title}
                          </p>
                          <p className="text-xs uppercase tracking-[0.12em] text-brand-muted-fg">
                            {article.categoryName}
                          </p>
                          <p className="line-clamp-2 text-sm text-brand-muted-fg">
                            {article.summary}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-brand-border bg-brand-bg/70 px-2.5 py-1 text-[11px] font-semibold text-brand-primary">
                          Open
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-4 text-sm text-brand-muted-fg">
                  No matching articles found.
                </div>
              )}
            </div>
          )}
        </section>

        <div className="space-y-8">
          {!hasSearchResults && search.trim().length > 0 ? (
            <div className="rounded-2xl border border-brand-border bg-brand-bg/60 p-8 text-center">
              <p className="text-lg font-semibold text-brand-fg">
                No learning articles match "{search.trim()}"
              </p>
              <p className="mt-2 text-sm text-brand-muted-fg">
                Try a different title, summary, or keyword from the article
                content.
              </p>
            </div>
          ) : (
            filteredCategories.map((category) => (
              <LearningCategorySection
                key={category.id}
                category={category}
                onOpenArticle={setSelectedArticle}
              />
            ))
          )}
        </div>
      </div>

      <ArticleViewerModal
        article={selectedArticle}
        onClose={() => setSelectedArticle(null)}
      />
    </>
  );
}
