import { articleLinkParams, resolveArticle } from '../utils/learningArticleLinks';
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Search, X } from "lucide-react";

import ArticleViewerModal from "../components/learning/ResourceViewerModal";
import LearningBadgeGallery from "../components/learning/LearningBadgeGallery";
import LearningCategorySection from "../components/learning/LearningCategorySection";
import LearningCenterSkeleton from "../components/learning/LearningCenterSkeleton";
import LearningQuizModal from "../components/learning/LearningQuizModal";
import { useNavigate, useSearchParams } from "react-router-dom";
import LearningRoadmap from "../components/learning/LearningRoadmap";
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

class LearningCentreSearchEngine {
  scoreArticleMatch(article: LearningArticle, query: string) {
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
  }

  buildSuggestedArticles(
    categories: LearningCategory[],
    search: string,
  ): Array<LearningArticle & { categoryName: string; relevance: number }> {
    const query = search.trim().toLowerCase();

    if (!query) {
      return [];
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
        relevance: this.scoreArticleMatch(article, query),
      }))
      .filter((article) => article.relevance > 0)
      .sort((first, second) => {
        if (second.relevance !== first.relevance) {
          return second.relevance - first.relevance;
        }

        return first.title.localeCompare(second.title);
      })
      .slice(0, 5);
  }

  filterCategoriesByQuery(categories: LearningCategory[], query: string) {
    const trimmedQuery = query.trim().toLowerCase();

    if (!trimmedQuery) {
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

          return searchableText.includes(trimmedQuery);
        });

        return {
          ...category,
          articles: matchingArticles,
        };
      })
      .filter((category) => category.articles.length > 0);
  }
}

const learningTabs = ["roadmap", "library"] as const;
const levelFilters = ["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
const levelLabels: Record<(typeof levelFilters)[number], string> = {
  ALL: "All levels",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};
const learningTabLabels = { roadmap: "My Roadmap", library: "Library" };

const learningCentreSearchEngine = new LearningCentreSearchEngine();

export default function LearningPage() {
  const navigate = useNavigate();
  const [articleParams, setArticleParams] = useSearchParams();
  const { session, profile, analysis, isProfileLoading, fetchProfile } = useAuthStore();
  const userId = profile?.id ?? session?.user?.id ?? null;

  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [activeTab, setActiveTab] = useState<(typeof learningTabs)[number]>("roadmap");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<(typeof levelFilters)[number]>("ALL");
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

  // The URL owns the visible lesson/quiz; there is no second modal selection state.
  const resolvedArticle = resolveArticle(categories.flatMap(category => category.articles), articleParams);
  const selectedQuizArticle = articleParams.get("quiz") === "1" ? resolvedArticle : null;
  const selectedArticle = selectedQuizArticle ? null : resolvedArticle;

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

  const suggestedArticles = useMemo(
    () => learningCentreSearchEngine.buildSuggestedArticles(categories, search),
    [categories, search],
  );

  // The search, then the level: a level with nothing in a category drops that
  // category rather than leaving an empty heading.
  const filteredCategories = useMemo(
    () =>
      learningCentreSearchEngine
        .filterCategoriesByQuery(categories, search)
        .map((category) => ({
          ...category,
          articles:
            level === "ALL"
              ? category.articles
              : category.articles.filter((article) => article.difficulty_level.toUpperCase() === level),
        }))
        .filter((category) => category.articles.length > 0),
    [categories, search, level],
  );

  // The header's three figures: XP, lessons completed and badges earned.
  const allArticles = categories.flatMap((category) => category.articles);
  const lessonsCompleted = allArticles.filter((article) => progressByArticleId[article.id]?.status === "COMPLETED").length;
  const badgesEarned = badges.filter((badge) => earnedBadgeIds.has(badge.id)).length;

  const hasSearchResults = filteredCategories.length > 0;
  const hasLearningContent = categories.length > 0;

  const getArticleQuizScore = (articleId: string) =>
    progressByArticleId[articleId]?.quiz_score ?? null;

  const handleTakeQuiz = (article: LearningArticle) => {
    const next = articleLinkParams(articleParams, String(article.id));
    next.set("quiz", "1");
    setArticleParams(next, { replace: true });
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

  const syncPendingQuiz = () => {
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

  };

  const handleCloseQuizModal = () => {
    syncPendingQuiz();
    setArticleParams(articleLinkParams(articleParams, null), { replace: true });
  };

  const requestedArticleId = articleParams.get("article");
  useEffect(() => {
    // Preserve the existing result synchronization when browser navigation closes a quiz.
    if (pendingQuizSync && selectedQuizArticle?.id !== pendingQuizSync.articleId) syncPendingQuiz();
  });
  function openArticle(article: LearningArticle) {
    setArticleParams(articleLinkParams(articleParams, String(article.id)));
  }
  function closeArticle() {
    setArticleParams(articleLinkParams(articleParams, null), { replace: true });
  }

  if (loading) {
    return <LearningCenterSkeleton />;
  }

  return (
    <>
      <div className="max-w-7xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-16 space-y-6 animate-fade-in-up">
        {/* ── Header ──
            The same title card as the other hub pages, no motif, with the learner's
            three figures on the right. They are counts, not an XP bar (D-240). */}
        <div className="hero-card px-5 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="band-eyebrow mb-2">Build your confidence</p>
              <h1 className="flex items-center gap-3 text-2xl font-bold tracking-[-0.02em] text-brand-bg lg:text-3xl">
                <BookOpen className="h-7 w-7 shrink-0 text-brand-accent" />
                Learning Centre
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-bg/75">
                Short lessons on how markets work and how to read what AlphaSwarm shows you. Take
                the quiz at the end of each to earn XP.
              </p>
            </div>
            <dl className="grid shrink-0 grid-cols-3 gap-2 self-start">
              {[
                { label: "Learning XP", short: "XP", value: `${learningXp}`, accent: true },
                { label: "Lessons", value: `${lessonsCompleted} of ${allArticles.length}` },
                { label: "Badges", value: `${badgesEarned} of ${badges.length}` },
              ].map((stat) => (
                <div key={stat.label} className="rounded-[14px] bg-white/8 px-3 py-2.5 sm:px-4">
                  <dt className="text-xs text-brand-bg/60">
                    {"short" in stat ? <><span className="sm:hidden">{stat.short}</span><span className="hidden sm:inline">{stat.label}</span></> : stat.label}
                  </dt>
                  <dd className={`whitespace-nowrap text-lg font-bold tabular-nums sm:text-xl ${stat.accent ? "text-brand-accent" : "text-brand-bg"}`}>{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* The platform's tab bar; an even grid across the width on a phone. */}
        <div role="tablist" aria-label="Learning Centre views" className="as-tabs grid w-full grid-cols-2 rounded-[20px] sm:inline-flex sm:w-auto sm:rounded-full">
          {learningTabs.map((tab, index) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`learning-tab-${tab}`}
              aria-controls={`learning-panel-${tab}`}
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? learningTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + learningTabs.length) % learningTabs.length;
                const next = learningTabs[nextIndex];
                setActiveTab(next);
                document.getElementById(`learning-tab-${next}`)?.focus();
              }}
              className="as-tab"
            >
              {learningTabLabels[tab]}
            </button>
          ))}
        </div>

        {loadWarnings.length > 0 ? (
          <section className="rounded-[12px] bg-down-bg p-4" role="alert">
            <p className="text-sm font-semibold text-down">
              Some learning data could not be loaded.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-down">
              {loadWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <div id="learning-panel-roadmap" role="tabpanel" aria-labelledby="learning-tab-roadmap" hidden={activeTab !== "roadmap"} tabIndex={0}>
          <LearningRoadmap
            badges={badges}
            earnedBadgeIds={earnedBadgeIds}
            xp={learningXp}
            categories={categories}
            progress={progressByArticleId}
            expertise={analysis?.user_id === userId ? analysis.ai_derived_expertise : undefined}
            dataAvailable={loadWarnings.length === 0 && !isProfileLoading}
            onOpenArticle={openArticle}
            onStartQuiz={handleTakeQuiz}
            onOpenFinancialTools={() => navigate("/financial-tools")}
          />
        </div>

        <div id="learning-panel-library" role="tabpanel" aria-labelledby="learning-tab-library" hidden={activeTab !== "library"} tabIndex={0} className="space-y-8">
        {/* ── Toolbar ── the search and the level, in one card as on the other pages. */}
        <section className="as-card relative z-40 flex flex-col gap-3 p-3 sm:p-4 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted-fg pointer-events-none" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search learning topics..."
                aria-label="Search learning topics"
                className="h-10 w-full rounded-full border border-forest-900/15 bg-white pl-9 pr-9 text-sm text-forest-900 transition-colors placeholder:text-forest-400 hover:border-forest-900/30 focus:border-forest-700 focus:outline-none"
              />
              {search ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted-fg transition-colors hover:text-brand-fg"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            {search.trim().length > 0 ? (
              <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-[16px] border border-forest-900/10 bg-white shadow-float">
                <p className="border-b border-forest-900/8 px-4 py-2.5 text-xs font-bold text-brand-muted-fg">
                  Suggestions
                </p>

                {suggestedArticles.length > 0 ? (
                  <div className="max-h-96 divide-y divide-forest-900/8 overflow-y-auto">
                    {suggestedArticles.map((article) => (
                      <div key={article.id} className="w-full px-4 py-3 transition-colors hover:bg-forest-50">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-bold text-forest-900">{article.title}</p>
                            <p className="text-xs text-brand-muted-fg">{article.categoryName}</p>
                            <p className="line-clamp-2 text-sm text-brand-muted-fg">{article.summary}</p>
                          </div>
                          <div className="flex flex-wrap sm:shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setSearch(article.title);
                                openArticle(article);
                              }}
                              className="as-btn as-btn-sm as-btn-secondary"
                            >
                              Read article
                            </button>
                            {(article.quiz_question_count ?? 0) > 0 ? (
                              <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => handleTakeQuiz(article)}
                                className="as-btn as-btn-sm as-btn-primary"
                              >
                                {progressByArticleId[article.id]?.status === "COMPLETED" ? "Retake quiz" : "Take quiz"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-4 text-sm text-brand-muted-fg">No matching articles found.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="as-tabs as-tabs-sm grid grid-cols-4 rounded-[16px] md:inline-flex md:shrink-0 md:rounded-full" role="group" aria-label="Filter by level">
            {levelFilters.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={level === option}
                onClick={() => setLevel(option)}
                className="as-tab px-1.5 sm:px-3"
              >
                {option === "ALL" ? <><span className="sm:hidden">All</span><span className="hidden sm:inline">All levels</span></> : levelLabels[option]}
              </button>
            ))}
          </div>
        </section>

        <LearningBadgeGallery
          badges={badges}
          earnedBadgeIds={earnedBadgeIds}
          hasUserContext={Boolean(userId)}
        />

        <div className="space-y-10">
          {!hasLearningContent && !loading ? (
            <EmptyLibrary
              title="No learning articles are available right now."
              body="The Learning Centre loaded, but the article catalogue did not return any records."
            />
          ) : !hasSearchResults ? (
            <EmptyLibrary
              title={search.trim() ? `No learning articles match "${search.trim()}"` : `No ${levelLabels[level].toLowerCase()} lessons yet`}
              body={search.trim() ? "Try a different title, summary, or keyword from the article content." : "Choose another level to see more lessons."}
            />
          ) : (
            filteredCategories.map((category) => (
              <LearningCategorySection
                key={category.id}
                category={category}
                onOpenArticle={openArticle}
                onTakeQuiz={handleTakeQuiz}
                getArticleQuizScore={getArticleQuizScore}
                getArticleQuizStatus={(articleId) => progressByArticleId[articleId]?.status}
              />
            ))
          )}
        </div>
        </div>
      </div>

      {requestedArticleId && !resolveArticle(categories.flatMap(category => category.articles), articleParams) && !loading && <p role="status" className="text-sm text-brand-muted-fg">This learning article is unavailable. <button onClick={closeArticle} className="underline">Return to Learning Centre</button></p>}
      <ArticleViewerModal
        article={selectedQuizArticle ? null : selectedArticle}
        onStartQuiz={handleTakeQuiz}
        quizStatus={
          selectedArticle ? progressByArticleId[selectedArticle.id]?.status : undefined
        }
        onClose={closeArticle}
      />

      {selectedQuizArticle ? (
        <LearningQuizModal
          key={selectedQuizArticle.id}
          article={selectedQuizArticle}
          onClose={handleCloseQuizModal}
          onSubmitQuiz={handleSubmitQuiz}
        />
      ) : null}
    </>
  );
}

function EmptyLibrary({ title, body }: { title: string; body: string }) {
  return (
    <div className="as-card px-6 py-10 text-center">
      <p className="text-base font-bold text-forest-900">{title}</p>
      <p className="mt-2 text-sm text-brand-muted-fg">{body}</p>
    </div>
  );
}
