import { ArrowRight, BookOpen, Check, CircleDot, Leaf, Sparkles, Trophy } from "lucide-react";
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
};

// Present the existing criterion relationship; never determine or mutate awards here.
function matchesCategory(badge: LearningBadge, category: LearningCategory) {
  const value = LearningQuizEngine.normalizeText(badge.criteria_value);
  return badge.criteria_type.toUpperCase() === "CATEGORY_COMPLETED" &&
    [category.name, category.slug].some(name => LearningQuizEngine.normalizeText(name) === value);
}


export default function LearningRoadmap({ categories, progress, expertise, dataAvailable, badges, earnedBadgeIds, xp, onOpenArticle, onStartQuiz }: Props) {
  const { articles, completedCount, recommended } = deriveLearningRoadmap(categories, progress, expertise);

  if (!dataAvailable) {
    return <div className="glass-card rounded-2xl p-6 text-brand-muted-fg">Your personalised roadmap is available once your profile and learning data have loaded successfully. You can still browse available articles in the Library.</div>;
  }
  if (!articles.length) {
    return <div className="glass-card rounded-2xl p-6 text-brand-muted-fg">Your roadmap will appear when learning articles are available.</div>;
  }

  const milestone = deriveNextBadgeMilestone({ badges, earnedBadgeIds, categories, progress, xp, recommended, calculateArticleXp });
  const earnedCount = badges.filter(badge => earnedBadgeIds.has(badge.id)).length;
  const percentage = Math.round(completedCount / articles.length * 100);
  const level = expertise ? expertise[0].toUpperCase() + expertise.slice(1) : "Not yet set";

  return (
    <div className="learning-journey space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-brand-border bg-brand-card p-5 shadow-card sm:p-8">
        <Leaf className="pointer-events-none absolute -right-5 -top-5 h-44 w-44 rotate-12 text-brand-primary/5" aria-hidden="true" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-3 py-1.5 text-xs font-semibold text-brand-primary"><Leaf className="h-4 w-4" aria-hidden="true" />Your learning level: {level}</span>
            <h2 className="text-2xl font-semibold tracking-tight text-brand-fg sm:text-3xl">Grow your investing knowledge</h2>
            <p className="max-w-xl text-sm leading-relaxed text-brand-muted-fg">{expertise ? "Your expertise suggests where to begin. Your real quiz progress guides what comes next." : "Your quiz progress guides your journey. No expertise setting is available yet."} Every lesson is open to you.</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-muted-fg">
              <span><strong className="text-brand-fg">{completedCount} / {articles.length}</strong> lessons completed</span>
              <span><strong className="text-brand-fg">{xp}</strong> XP</span>
              <span><strong className="text-brand-fg">{earnedCount}</strong> badges earned</span>
            </div>
            <div className="flex items-center gap-3">
              <progress className="h-2.5 w-full flex-1 accent-brand-primary" aria-label="Completed learning lessons" value={completedCount} max={articles.length} />
              <span className="text-xs font-semibold text-brand-primary">{percentage}%</span>
            </div>
          </div>
          <div className="relative min-w-0 self-center space-y-3">
            {milestone && (
              <section aria-label="Next Milestone" className="flex min-w-0 items-start gap-3 rounded-2xl border border-brand-border/60 bg-brand-card p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-primary/10 text-brand-primary">
                  {milestone.badge.icon_url ? <img src={milestone.badge.icon_url} alt="" className="h-full w-full object-cover" /> : <Trophy className="h-5 w-5" aria-hidden="true" />}
                </span>
                <div className="min-w-0 space-y-1">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">Next Milestone</h3>
                  <p className="break-words text-sm font-semibold text-brand-fg">{milestone.badge.name}</p>
                  <p className="text-xs leading-relaxed text-brand-muted-fg">{milestone.badge.description || badgeRequirementText(milestone.badge)}</p>
                  <p className="text-xs font-medium text-brand-primary">{milestone.current} / {milestone.target} {milestone.unit} · {milestone.remaining} {milestone.unit} remaining</p>
                  {milestone.unit === "XP" && milestone.estimatedLessons !== undefined && <p className="text-xs text-brand-muted-fg">About {milestone.estimatedLessons} lesson completions, assuming first-time quiz passes along your upcoming path.</p>}
                </div>
              </section>
            )}
            <p className="text-xs leading-relaxed text-brand-muted-fg">Read a lesson, then take its quiz at the bottom of the article. Pass with 80% or higher to complete it and earn XP. Reading alone does not mark a lesson complete.</p>
          </div>
        </div>
      </section>

      {recommended ? (
        <section className="rounded-3xl bg-brand-primary p-5 text-brand-bg shadow-card sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-accent"><Sparkles className="h-4 w-4" aria-hidden="true" />Your next step</p>
              <h2 className="break-words text-xl font-semibold sm:text-2xl">{recommended.title}</h2>
              {recommended.summary?.trim() && <p className="max-w-2xl text-sm leading-relaxed text-brand-bg/80">{recommended.summary}</p>}
              {recommended.quiz_question_count === 0 && <p className="text-xs text-brand-bg/80">Quiz not yet available. Read this lesson and explore another below while you wait.</p>}
            </div>
            <div className="flex shrink-0 flex-col gap-2 self-start">
              <button type="button" onClick={() => onOpenArticle(recommended)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-brand-accent px-5 py-3 text-sm font-semibold text-brand-primary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Read Article<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
              {(recommended.quiz_question_count ?? 0) > 0 && (
                <button type="button" onClick={() => onStartQuiz(recommended)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-bg/30 px-5 py-2.5 text-sm font-semibold text-brand-bg transition-colors hover:bg-brand-bg/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                  {progress[recommended.id]?.status === "COMPLETED" ? "Retake Quiz" : "Take Quiz"}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </section>
      ) : <div className="flex items-center gap-3 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-6 text-brand-fg"><Trophy className="h-6 w-6 shrink-0 text-brand-primary" aria-hidden="true" />You’ve completed every available lesson. Revisit any article below to refresh your knowledge.</div>}

      <section aria-label="Your connected learning journey">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-brand-fg">Explore your journey</h2>
          <p className="text-xs text-brand-muted-fg">Follow your next step, or explore any lesson.</p>
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
                        <div className={`journey-lesson rounded-2xl border ${optional ? "p-3 bg-brand-bg border-brand-border/60" : "p-5"} ${next ? "border-brand-primary bg-brand-card shadow-card ring-2 ring-brand-primary/15" : completed ? "border-brand-border/60 bg-brand-bg" : inProgress ? "border-brand-primary/40 bg-brand-primary/5" : optional ? "" : "border-brand-border/70 bg-brand-card"}`}>
                          <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
                            {next && <span className="rounded-full bg-brand-primary px-2.5 py-1 text-brand-bg">Recommended next</span>}
                            <span className={completed || inProgress ? "text-brand-primary" : "text-brand-muted-fg"}>{completed ? "Completed" : inProgress ? "In progress" : "Upcoming"}</span>
                            <span className="text-brand-muted-fg">· {article.difficulty_level}</span>
                          </div>
                          <h4 className={`break-words font-semibold text-brand-fg ${optional ? "text-sm" : "text-base"}`}>{article.title}</h4>
                          <p className="mt-2 text-sm leading-relaxed text-brand-muted-fg">{article.summary}</p>
                          {article.quiz_question_count === 0 && <p className="mt-2 text-xs text-brand-muted-fg">Quiz not yet available</p>}
                          <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => onOpenArticle(article)} aria-label={`Read ${article.title}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-border bg-brand-card px-4 py-2 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                            {completed ? "Revisit lesson" : inProgress ? "Continue lesson" : "Explore lesson"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                            {(article.quiz_question_count ?? 0) > 0 && (
                              <button type="button" onClick={() => onStartQuiz(article)} aria-label={`${completed ? "Retake Quiz" : "Take Quiz"}: ${article.title}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary/5 px-4 py-2 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                                {completed ? "Retake Quiz" : "Take Quiz"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
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
                  <div className="min-w-0 space-y-2 rounded-3xl border border-brand-border bg-brand-card p-5 shadow-card">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">Chapter {categoryIndex + 1} · {categoryCompleted}/{category.articles.length} completed</p>
                    <h3 id={`journey-category-${category.id}`} className="break-words text-lg font-semibold text-brand-fg">{category.name}</h3>
                    <p className="text-sm leading-relaxed text-brand-muted-fg">{category.description}</p>
                    {categoryBadges.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {categoryBadges.map(badge => (
                          <span key={badge.id} className="inline-flex max-w-full items-center gap-2 rounded-full bg-brand-primary/5 px-2.5 py-1.5 text-xs text-brand-primary">
                            {badge.icon_url ? <img src={badge.icon_url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" /> : <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />}
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
                  <details className="journey-advanced rounded-2xl border border-brand-border/60 bg-brand-bg p-4">
                    <summary className="cursor-pointer text-sm font-medium text-brand-muted-fg">Explore other levels ({otherLevelArticles.length})</summary>
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
