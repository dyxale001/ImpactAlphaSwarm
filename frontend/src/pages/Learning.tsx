import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import ArticleViewerModal from "../components/learning/ResourceViewerModal";
import LearningBadgeGallery from "../components/learning/LearningBadgeGallery";
import LearningCategorySection from "../components/learning/LearningCategorySection";
import LearningCenterSkeleton from "../components/learning/LearningCenterSkeleton";
import LearningQuizModal from "../components/learning/LearningQuizModal";
import { useAuthStore } from "../store/authStore";
import {
  fetchLearningBadges,
  fetchLearningCentreData,
  fetchLearningUserState,
  submitLearningQuiz,
} from "../services/supabase/learningService";
import type {
  LearningArticle,
  LearningBadge,
  LearningCategory,
  LearningProgress,
  LearningQuizResult,
} from "../types/learning";

export default function LearningPage() {
  const { session, profile, fetchProfile } = useAuthStore();
  const userId = profile?.id ?? session?.user?.id ?? null;

  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [search, setSearch] = useState("");
  const [selectedArticle, setSelectedArticle] =
    useState<LearningArticle | null>(null);
  const [selectedQuizArticle, setSelectedQuizArticle] =
    useState<LearningArticle | null>(null);
  const [progressByArticleId, setProgressByArticleId] = useState<
    Record<string, LearningProgress | undefined>
  >({});
  const [badges, setBadges] = useState<LearningBadge[]>([]);
  const [earnedBadgeIds, setEarnedBadgeIds] = useState<Set<string>>(new Set());
  const [learningXp, setLearningXp] = useState(0);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingQuizSync, setPendingQuizSync] = useState<{
    articleId: string;
    result: LearningQuizResult;
  } | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    async function loadLearningContent() {
      setLoading(true);
      setLoadWarnings([]);

      try {
        const [learningContentResult, badgeCatalogueResult] =
          await Promise.allSettled([
            fetchLearningCentreData(),
            fetchLearningBadges(),
          ]);

        if (learningContentResult.status !== "fulfilled") {
          throw learningContentResult.reason;
        }

        if (cancelled) {
          return;
        }

        setCategories(learningContentResult.value);

        if (badgeCatalogueResult.status === "fulfilled") {
          setBadges(badgeCatalogueResult.value);
        } else {
          setBadges([]);
          setLoadWarnings([
            badgeCatalogueResult.reason instanceof Error
              ? badgeCatalogueResult.reason.message
              : "Badge catalogue could not be loaded.",
          ]);
        }

        if (userId) {
          try {
            const userState = await fetchLearningUserState(userId);

            if (cancelled) {
              return;
            }

            setProgressByArticleId(userState.progressByArticleId);
            setEarnedBadgeIds(userState.earnedBadgeIds);
            setLearningXp(userState.learningXp);

            if (userState.issues.length > 0) {
              setLoadWarnings(
                userState.issues.map(
                  ({ scope, message }) => `${scope}: ${message}`,
                ),
              );
            }
          } catch (userStateError) {
            if (!cancelled) {
              setLoadWarnings([
                userStateError instanceof Error
                  ? userStateError.message
                  : "Failed to load your learning progress.",
              ]);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoadWarnings([
            error instanceof Error
              ? error.message
              : "Learning content could not be loaded.",
          ]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLearningContent();

    return () => {
      cancelled = true;
    };
  }, [userId]);

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
  const hasLearningContent = categories.length > 0;

  const getArticleQuizScore = (articleId: string) =>
    progressByArticleId[articleId]?.quiz_score ?? null;

  const handleTakeQuiz = (article: LearningArticle) => {
    setSelectedQuizArticle(article);
  };

  const handleSubmitQuiz = async (
    selectedAnswers: Record<string, string | null>,
    questions: LearningArticle["questions"],
  ): Promise<LearningQuizResult> => {
    if (!userId) {
      throw new Error("You need to be logged in to take a quiz.");
    }

    if (!selectedQuizArticle) {
      throw new Error("No quiz article selected.");
    }

    const submissionResult = await submitLearningQuiz({
      userId,
      article: selectedQuizArticle,
      questions,
      selectedAnswers,
      categories,
      progressByArticleId,
      badges,
      earnedBadgeIds,
      currentLearningXp: learningXp,
    });

    setPendingQuizSync({
      articleId: selectedQuizArticle.id,
      result: submissionResult,
    });

    return submissionResult;
  };

  const handleCloseQuizModal = () => {
    if (pendingQuizSync && userId) {
      const { articleId, result } = pendingQuizSync;

      setProgressByArticleId((current) => ({
        ...current,
        [articleId]: {
          id: current[articleId]?.id ?? articleId,
          user_id: userId,
          article_id: articleId,
          status:
            current[articleId]?.status === "COMPLETED"
              ? "COMPLETED"
              : result.passed
                ? "COMPLETED"
                : "IN_PROGRESS",
          quiz_score:
            current[articleId]?.quiz_score === null ||
            current[articleId]?.quiz_score === undefined
              ? result.score
              : Math.max(current[articleId].quiz_score, result.score),
        },
      }));

      setLearningXp(result.updatedLearningXp);

      if (result.xpEarned > 0) {
        void fetchProfile(userId);
      }

      if (result.newlyEarnedBadges.length > 0) {
        setEarnedBadgeIds((current) => {
          const next = new Set(current);

          result.newlyEarnedBadges.forEach((badge) => next.add(badge.id));

          return next;
        });
      }

      setPendingQuizSync(null);
    }

    setSelectedQuizArticle(null);
  };

  if (loading) {
    return <LearningCenterSkeleton />;
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-8 px-6">
        <div className="-mx-4 flex flex-col gap-4 rounded-lg bg-brand-bg/60 p-4 px-4 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-primary">
              Learning Centre
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-brand-fg">
              Build confidence with guided investing lessons
            </h1>
            <p className="text-sm leading-relaxed text-brand-muted-fg">
              Explore structured educational content designed to help you
              understand markets, evaluate opportunities, and grow your
              investing toolkit.
            </p>
          </div>

          <div className="rounded-2xl border border-brand-border bg-brand-card px-4 py-3 text-sm text-brand-fg shadow-card">
            <p className="text-xs uppercase tracking-[0.12em] text-brand-muted-fg">
              Learning XP
            </p>
            <p className="mt-1 text-2xl font-semibold text-brand-primary">
              {learningXp} XP
            </p>
          </div>
        </div>

        <section className="relative z-40 rounded-2xl bg-brand-card p-4 shadow-card">
          <div className="flex items-center gap-3 rounded-xl border border-brand-border bg-brand-bg/70 px-4 py-3">
            <Search className="h-4 w-4" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search learning topics..."
              className="w-full bg-transparent text-brand-fg placeholder:text-brand-muted-fg focus:outline-none"
            />

            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-xs font-medium text-brand-muted-fg transition-colors hover:text-brand-fg"
              >
                Clear
              </button>
            ) : null}
          </div>

          {search.trim().length > 0 ? (
            <div className="absolute left-4 right-4 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-card">
              <div className="border-b border-brand-border/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-eyebrow text-brand-muted-fg">
                  Suggestions
                </p>
              </div>

              {suggestedArticles.length > 0 ? (
                <div>
                  <div className="max-h-96 divide-y divide-brand-border/50 overflow-y-auto">
                    {suggestedArticles.map((article) => (
                      <div
                        key={article.id}
                        className="w-full px-4 py-3 transition-colors hover:bg-brand-bg/60"
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
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setSearch(article.title);
                                setSelectedArticle(article);
                              }}
                              className="rounded-full border border-brand-border bg-brand-bg/70 px-2.5 py-1 text-[11px] font-semibold text-brand-primary transition-colors hover:bg-brand-bg"
                            >
                              Read Article
                            </button>
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleTakeQuiz(article)}
                              className="rounded-full bg-brand-primary px-2.5 py-1 text-[11px] font-semibold text-brand-bg transition-opacity hover:opacity-90"
                            >
                              Take Quiz
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-4 text-sm text-brand-muted-fg">
                  No matching articles found.
                </div>
              )}
            </div>
          ) : null}
        </section>

        {loadWarnings.length > 0 ? (
          <section className="rounded-2xl border border-semantic-danger/35 bg-semantic-danger/10 p-4">
            <p className="text-sm font-semibold text-semantic-danger">
              Some learning data could not be loaded.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-semantic-danger">
              {loadWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <LearningBadgeGallery
          badges={badges}
          earnedBadgeIds={earnedBadgeIds}
          hasUserContext={Boolean(userId)}
        />

        <div className="space-y-8">
          {!hasLearningContent && !loading ? (
            <div className="rounded-2xl border border-brand-border bg-brand-bg/60 p-8 text-center">
              <p className="text-lg font-semibold text-brand-fg">
                No learning articles are available right now.
              </p>
              <p className="mt-2 text-sm text-brand-muted-fg">
                The Learning Centre loaded, but the article catalogue did not
                return any records.
              </p>
            </div>
          ) : !hasSearchResults && search.trim().length > 0 ? (
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
                onTakeQuiz={handleTakeQuiz}
                getArticleQuizScore={getArticleQuizScore}
              />
            ))
          )}
        </div>
      </div>

      <ArticleViewerModal
        article={selectedArticle}
        onClose={() => setSelectedArticle(null)}
      />

      {selectedQuizArticle ? (
        <LearningQuizModal
          article={selectedQuizArticle}
          onClose={handleCloseQuizModal}
          onSubmitQuiz={handleSubmitQuiz}
        />
      ) : null}
    </>
  );
}
