import { ArrowRight, BookOpen, Check, CircleDot, Leaf, Sparkles, Trophy } from "lucide-react";
import { levelLabel } from "./LearningCard";
import type { UserAnalysis } from "../../types/auth";
import type { LearningArticle, LearningBadge, LearningCategory, LearningProgress } from "../../types/learning";
import { badgeRequirementText, calculateArticleXp, LearningQuizEngine } from "../../services/supabase/learningService";
import { deriveLearningRoadmap } from "../../utils/learningRoadmap";
import { deriveNextBadgeMilestone } from "../../utils/learningBadgeMilestones";
import { isOptionalOtherLevelLesson } from "../../utils/learningExpertise";
import "./LearningRoadmap.css";

type Props = {
  categories: LearningCategory[];
  progress: Record<string, LearningProgress | undefined>;
  expertise: UserAnalysis["ai_derived_expertise"];
  dataAvailable: boolean;
  badges: LearningBadge[];
  earnedBadgeIds: Set<string>;
  xp: number;
  onOpenArticle: (article: LearningArticle) => void;
  onStartQuiz: (article: LearningArticle) => void;
  onOpenFinancialTools: () => void;
};

// Present the existing criterion relationship; never determine or mutate awards here.
function matchesCategory(badge: LearningBadge, category: LearningCategory) {
  const value = LearningQuizEngine.normalizeText(badge.criteria_value);
  return badge.criteria_type.toUpperCase() === "CATEGORY_COMPLETED" &&
    [category.name, category.slug].some(name => LearningQuizEngine.normalizeText(name) === value);
}


export default function LearningRoadmap({ categories, progress, expertise, dataAvailable, badges, earnedBadgeIds, xp, onOpenArticle, onStartQuiz, onOpenFinancialTools }: Props) {
  const { articles, completedCount, recommended } = deriveLearningRoadmap(categories, progress, expertise);

  if (!dataAvailable) {
    return <div className="as-card p-6 text-sm text-brand-muted-fg">Your personalised roadmap is available once your profile and learning data have loaded successfully. You can still browse available articles in the Library.</div>;
  }
  if (!articles.length) {
    return <div className="as-card p-6 text-sm text-brand-muted-fg">Your roadmap will appear when learning articles are available.</div>;
  }

  const milestone = deriveNextBadgeMilestone({ badges, earnedBadgeIds, categories, progress, xp, recommended, calculateArticleXp: difficulty => {
    try { return calculateArticleXp(difficulty); }
    // Existing milestone logic omits XP lesson estimates when configuration is unavailable.
    catch { return NaN; }
  } });
  const earnedCount = badges.filter(badge => earnedBadgeIds.has(badge.id)).length;
  const percentage = Math.round(completedCount / articles.length * 100);
  const level = expertise ? expertise[0].toUpperCase() + expertise.slice(1) : "Not yet set";

  return (
    <div className="learning-journey space-y-8">
      {/* The two cards from the full redesign: what to read next, and where you are. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {recommended ? (
          <section className="as-card flex flex-col gap-4 p-5 sm:p-6" aria-label="Your next step">
            <div>
              <p className="flex items-center gap-2 text-base font-bold tracking-[-0.01em] text-forest-900">
                <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800" aria-hidden="true">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                Your next step
              </p>
              <p className="mt-1 text-xs text-brand-muted-fg">
                {expertise ? `Chosen from your level (${level}) and your quiz results` : "Chosen from your quiz results"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">{levelLabel(recommended.difficulty_level)}</span>
              {(recommended.quiz_question_count ?? 0) > 0 && (
                <span className="text-xs text-brand-muted-fg">Quiz of {recommended.quiz_question_count} {recommended.quiz_question_count === 1 ? "question" : "questions"}</span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-xl font-bold leading-snug tracking-[-0.01em] text-forest-900">{recommended.title}</h2>
              {recommended.summary?.trim() && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-brand-muted-fg">{recommended.summary}</p>}
              {recommended.quiz_question_count === 0 && <p className="mt-1.5 text-xs text-brand-muted-fg">Quiz not yet available. Read this lesson and explore another below while you wait.</p>}
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <button type="button" onClick={() => onOpenArticle(recommended)} className="as-btn as-btn-primary">
                Read article<ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              {(recommended.quiz_question_count ?? 0) > 0 && (
                <button type="button" onClick={() => onStartQuiz(recommended)} className="as-btn as-btn-secondary">
                  {progress[recommended.id]?.status === "COMPLETED" ? "Retake quiz" : "Take quiz"}
                </button>
              )}
            </div>
          </section>
        ) : (
          <section className="as-card flex items-center gap-3 p-6 text-sm text-forest-900">
            <Trophy className="h-6 w-6 shrink-0 text-forest-700" aria-hidden="true" />
            You’ve completed every available lesson. Revisit any article below to refresh your knowledge.
          </section>
        )}

        <section className="as-card flex flex-col gap-4 p-5 sm:p-6" aria-label="Your progress">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold tracking-[-0.01em] text-forest-900">Your progress</p>
              <p className="mt-1 text-xs text-brand-muted-fg">Your learning level: {level}</p>
            </div>
            <span className="chip chip-accent"><Trophy className="h-3.5 w-3.5" aria-hidden="true" />{earnedCount} {earnedCount === 1 ? "badge" : "badges"}</span>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-forest-900">Lessons completed</span>
              <span className="tabular-nums text-brand-muted-fg">{completedCount} of {articles.length} · {percentage}%</span>
            </div>
            {/* Lessons, not XP: D-240 keeps XP a number. */}
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-forest-50"
              role="progressbar"
              aria-label="Completed learning lessons"
              aria-valuemin={0}
              aria-valuemax={articles.length}
              aria-valuenow={completedCount}
            >
              <div className="h-full rounded-full bg-forest-700" style={{ width: `${percentage}%` }} />
            </div>
          </div>
          {milestone && (
            <div className="as-inset flex min-w-0 items-start gap-3 p-3" aria-label="Next milestone">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-forest-700">
                {milestone.badge.icon_url ? <img src={milestone.badge.icon_url} alt="" className="h-full w-full object-cover" /> : <Trophy className="h-5 w-5" aria-hidden="true" />}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-bold text-forest-900">Next badge: {milestone.badge.name}</p>
                <p className="text-xs leading-relaxed text-brand-muted-fg">{milestone.badge.description || badgeRequirementText(milestone.badge)}</p>
                <p className="text-xs font-semibold text-forest-700">{milestone.current} / {milestone.target} {milestone.unit} · {milestone.remaining} {milestone.unit} remaining</p>
                {milestone.unit === "XP" && milestone.estimatedLessons !== undefined && <p className="text-xs text-brand-muted-fg">About {milestone.estimatedLessons} lesson completions, assuming first-time quiz passes along your upcoming path.</p>}
              </div>
            </div>
          )}
          <p className="text-xs leading-relaxed text-brand-muted-fg">Read a lesson, then take its quiz at the bottom of the article. Pass with 75% or higher to complete it and earn XP. Reading alone does not mark a lesson complete.</p>
        </section>
      </div>

      <section aria-label="Your connected learning journey">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 md:mb-8">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.015em] text-forest-900">Explore your journey</h2>
            <p className="mt-1 text-sm text-brand-muted-fg">Follow your next step, or explore any lesson.</p>
          </div>
          {/* Financial Tools has its own tab now (D-233); this is the way across. */}
          <button type="button" onClick={onOpenFinancialTools} className="inline-flex items-center gap-1.5 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
            Explore Financial Tools<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="journey-path">
          {categories.filter(category => category.articles.length > 0).map((category, categoryIndex) => {
            const categoryCompleted = category.articles.filter(article => progress[article.id]?.status === "COMPLETED").length;
            const categoryBadges = badges.filter(badge => matchesCategory(badge, category));
            const optionalArticle = (article: LearningArticle) => isOptionalOtherLevelLesson(
              expertise, article.difficulty_level, progress[article.id]?.status, recommended?.id === article.id,
            );
            const primaryArticles = category.articles.filter(article => !optionalArticle(article));
            const otherLevelArticles = category.articles.filter(optionalArticle);
            const renderLesson = (article: LearningArticle, index: number, optional = false) => {
                    const status = progress[article.id]?.status;
                    const completed = status === "COMPLETED";
                    const inProgress = status === "IN_PROGRESS";
                    const next = recommended?.id === article.id;
                    const Icon = completed ? Check : inProgress ? CircleDot : BookOpen;
                    return (
                      <li key={article.id} className={optional ? "min-w-0" : `journey-stop ${index % 2 ? "journey-stop-right" : "journey-stop-left"}`}>
                        {!optional && <span className={`journey-node ${next ? "journey-node-next" : completed ? "journey-node-complete" : ""}`} aria-hidden="true"><Icon className="h-4 w-4" /></span>}
                        <div className={`journey-lesson as-card p-3 md:p-5 ${optional ? "md:p-4" : ""} ${next ? "journey-lesson-next" : completed ? "journey-lesson-done" : ""}`}>
                          {/* A phone shows a compact row: status, title and one button. The
                              summary and the quiz button join it from md up. */}
                          <div className="flex items-center gap-3 md:block">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs md:mb-2">
                                {next && <span className="chip chip-accent">Up next</span>}
                                <span className={`font-semibold ${completed || inProgress ? "text-forest-700" : "text-brand-muted-fg"}`}>{completed ? "Completed" : inProgress ? "In progress" : "Upcoming"}</span>
                                <span className="text-brand-muted-fg">· {levelLabel(article.difficulty_level)}</span>
                              </div>
                              <h4 className={`break-words font-bold leading-snug text-forest-900 ${optional ? "text-sm" : "text-sm md:text-base"}`}>{article.title}</h4>
                              <p className="mt-1.5 hidden text-sm leading-relaxed text-brand-muted-fg md:block">{article.summary}</p>
                              {article.quiz_question_count === 0 && <p className="mt-1.5 hidden text-xs text-brand-muted-fg md:block">Quiz not yet available</p>}
                            </div>
                            <button type="button" onClick={() => onOpenArticle(article)} aria-label={`Read ${article.title}`} className={`as-btn as-btn-sm shrink-0 md:hidden ${next ? "as-btn-primary" : "as-btn-secondary"}`}>
                              {completed ? "Revisit" : "Read"}
                            </button>
                          </div>
                          <div className="mt-4 hidden flex-wrap gap-2 md:flex">
                            <button type="button" onClick={() => onOpenArticle(article)} aria-label={`Read ${article.title}`} className={`as-btn as-btn-sm ${next ? "as-btn-primary" : "as-btn-secondary"}`}>
                              {completed ? "Revisit lesson" : inProgress ? "Continue lesson" : "Explore lesson"}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            {(article.quiz_question_count ?? 0) > 0 && (
                              <button type="button" onClick={() => onStartQuiz(article)} aria-label={`${completed ? "Retake quiz" : "Take quiz"}: ${article.title}`} className="as-btn as-btn-sm as-btn-secondary">
                                {completed ? "Retake quiz" : "Take quiz"}
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
            };
            return (
              <section key={category.id} className="journey-category" aria-labelledby={`journey-category-${category.id}`}>
                <div className="journey-milestone">
                  <span className="journey-milestone-icon" aria-hidden="true">{categoryCompleted === category.articles.length ? <Check className="h-5 w-5" /> : <Leaf className="h-5 w-5" />}</span>
                  <div className="as-card min-w-0 space-y-1.5 p-4 md:p-5">
                    <p className="text-xs font-bold text-forest-700">Chapter {categoryIndex + 1} · {categoryCompleted} of {category.articles.length} completed</p>
                    <h3 id={`journey-category-${category.id}`} className="break-words text-lg font-bold tracking-[-0.015em] text-forest-900">{category.name}</h3>
                    <p className="hidden text-sm leading-relaxed text-brand-muted-fg md:block">{category.description}</p>
                    {categoryBadges.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {categoryBadges.map(badge => (
                          <span key={badge.id} className={`chip max-w-full whitespace-normal ${earnedBadgeIds.has(badge.id) ? "chip-accent" : ""}`}>
                            {badge.icon_url ? <img src={badge.icon_url} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" /> : <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                            <span className="min-w-0 break-words">{badge.name} · {earnedBadgeIds.has(badge.id) ? "Earned" : categoryCompleted === category.articles.length ? "Requirement met · Not awarded" : "Category reward"}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <ol className="journey-lessons">
                  {primaryArticles.map((article, index) => renderLesson(article, index))}

                </ol>
                {otherLevelArticles.length > 0 && (
                  <details className="journey-advanced as-inset p-4">
                    <summary className="cursor-pointer text-sm font-bold text-forest-900">Explore other levels ({otherLevelArticles.length})</summary>
                    <p className="mt-2 text-xs leading-relaxed text-brand-muted-fg">Lessons at other difficulty levels, for a refresher or a new challenge. Explore whenever you’re curious.</p>
                    <ol className="mt-4 grid min-w-0 list-none gap-3 p-0">
                      {otherLevelArticles.map((article, index) => renderLesson(article, index, true))}
                    </ol>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
