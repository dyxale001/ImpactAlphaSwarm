import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Trophy,
  X,
} from "lucide-react";
import { fetchLearningQuizQuestions } from "../../services/supabase/learningService";
import type {
  LearningArticle,
  LearningBadge,
  LearningQuestion,
  LearningQuizResult,
} from "../../types/learning";

type Props = {
  article: LearningArticle;
  onClose: () => void;
  onSubmitQuiz: (
    selectedAnswers: Record<string, string | null>,
    questions: LearningQuestion[],
  ) => Promise<LearningQuizResult>;
};

export default function LearningQuizModal({
  article,
  onClose,
  onSubmitQuiz,
}: Props) {
  const [questions, setQuestions] = useState<LearningQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, string | null>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<LearningQuizResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const currentQuestion = questions[currentQuestionIndex];
  const answeredQuestionCount = useMemo(
    () => Object.values(selectedAnswers).filter(Boolean).length,
    [selectedAnswers],
  );

  useEffect(() => {
    let cancelled = false;

    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setIsSubmitting(false);
    setErrorMessage("");
    setResult(null);
    setLoadingQuestions(true);

    async function loadQuestions() {
      try {
        const fetchedQuestions = await fetchLearningQuizQuestions(article.id);

        if (!cancelled) {
          setQuestions(fetchedQuestions);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setQuestions([]);
          setErrorMessage(
            "Quiz questions could not be loaded for this article.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingQuestions(false);
        }
      }
    }

    loadQuestions();

    return () => {
      cancelled = true;
    };
  }, [article.id, reloadKey]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleAnswerSelect = (questionId: string, answerId: string) => {
    setSelectedAnswers((current) => ({
      ...current,
      [questionId]: answerId,
    }));
  };

  const handleSubmit = async () => {
    const unansweredQuestions = questions.filter(
      (question) => !selectedAnswers[question.id],
    );

    if (unansweredQuestions.length > 0) {
      setErrorMessage("Please answer every question before submitting.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const submissionResult = await onSubmitQuiz(selectedAnswers, questions);
      setResult(submissionResult);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to submit quiz.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBadgeNames = (badges: LearningBadge[]) => {
    if (badges.length === 0) {
      return (
        <p className="text-sm text-brand-muted-fg">
          No new badges earned this time.
        </p>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span
            key={badge.id}
            className="inline-flex items-center gap-1 rounded-full border border-brand-border bg-brand-bg/70 px-3 py-1 text-xs font-semibold text-brand-fg"
          >
            <Trophy className="h-3.5 w-3.5 text-brand-primary" />
            {badge.name}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-brand-border/60 bg-brand-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-brand-border/60 bg-brand-bg/70 px-6 py-5">
          <div className="min-w-0 space-y-2">
            <span className="inline-flex items-center rounded-full border border-brand-primary/15 bg-brand-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
              Quiz Mode
            </span>
            <h3 className="text-xl font-semibold text-brand-fg">
              {article.title}
            </h3>
            <p className="text-sm text-brand-muted-fg">
              {questions.length} questions • {answeredQuestionCount} answered
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-brand-border/60 bg-brand-card px-3 py-2 text-sm text-brand-muted-fg transition-colors hover:text-brand-fg"
            aria-label="Close quiz"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-6">
          {loadingQuestions ? (
            <div className="space-y-4 py-8 text-center text-sm text-brand-muted-fg">
              Loading quiz questions...
            </div>
          ) : result ? (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-brand-primary/20 bg-brand-primary/10">
                <CheckCircle2 className="h-8 w-8 text-brand-primary" />
              </div>
              <div className="space-y-2">
                <h4 className="text-2xl font-semibold text-brand-fg">
                  {result.passed ? "Congratulations!" : "Keep going"}
                </h4>
                <p className="text-sm text-brand-muted-fg">
                  Score achieved:{" "}
                  <span className="font-semibold text-brand-fg">
                    {result.score}%
                  </span>
                </p>
                <p className="text-sm text-brand-muted-fg">
                  {result.passed
                    ? "You passed this quiz and the article is now marked as completed."
                    : "You need 80% or higher to pass this quiz."}
                </p>
              </div>

              {result.passed && result.xpEarned > 0 ? (
                <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 px-5 py-4 text-sm font-medium text-brand-fg">
                  You earned +{result.xpEarned} XP
                </div>
              ) : null}

              <div className="space-y-3 text-left">
                <h5 className="text-sm font-semibold uppercase tracking-eyebrow text-brand-primary">
                  Newly earned badges
                </h5>
                {renderBadgeNames(result.newlyEarnedBadges)}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-brand-bg transition-opacity hover:opacity-90"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="h-2 rounded-full bg-brand-border/40">
                <div
                  className="h-2 rounded-full bg-brand-primary transition-all"
                  style={{
                    width: `${((currentQuestionIndex + 1) / questions.length) * 100}%`,
                  }}
                />
              </div>

              {questions.length === 0 ? (
                <div className="rounded-2xl border border-brand-border bg-brand-bg/60 p-6 text-sm text-brand-muted-fg">
                  <p>This article currently has no quiz questions.</p>
                  <button
                    type="button"
                    onClick={() => setReloadKey((current) => current + 1)}
                    className="mt-4 inline-flex items-center rounded-full border border-brand-border bg-brand-card px-4 py-2 text-xs font-semibold text-brand-fg transition-colors hover:border-brand-primary/40"
                  >
                    Retry loading questions
                  </button>
                </div>
              ) : currentQuestion ? (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-eyebrow text-brand-primary">
                      Question {currentQuestionIndex + 1} of {questions.length}
                    </p>
                    <h4 className="text-xl font-semibold leading-snug text-brand-fg">
                      {currentQuestion.question}
                    </h4>
                  </div>

                  <div className="space-y-3">
                    {currentQuestion.answers.map((answer) => {
                      const isSelected =
                        selectedAnswers[currentQuestion.id] === answer.id;

                      return (
                        <button
                          key={answer.id}
                          type="button"
                          onClick={() =>
                            handleAnswerSelect(currentQuestion.id, answer.id)
                          }
                          className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-brand-primary/40 bg-brand-primary/10 text-brand-fg"
                              : "border-brand-border bg-brand-bg/60 text-brand-fg hover:border-brand-primary/25 hover:bg-brand-primary/5"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              isSelected
                                ? "border-brand-primary bg-brand-primary"
                                : "border-brand-border"
                            }`}
                          >
                            {isSelected ? (
                              <span className="h-2 w-2 rounded-full bg-brand-bg" />
                            ) : null}
                          </span>
                          <span className="text-sm leading-relaxed">
                            {answer.answer}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {errorMessage ? (
                    <p className="rounded-2xl border border-semantic-danger/30 bg-semantic-danger/10 px-4 py-3 text-sm text-semantic-danger">
                      {errorMessage}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentQuestionIndex((value) =>
                          Math.max(0, value - 1),
                        )
                      }
                      disabled={currentQuestionIndex === 0}
                      className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-card px-4 py-2.5 text-sm font-medium text-brand-muted-fg transition-colors hover:text-brand-fg disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>

                    {currentQuestionIndex < questions.length - 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentQuestionIndex((value) =>
                            Math.min(questions.length - 1, value + 1),
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-bg transition-opacity hover:opacity-90"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isSubmitting ? "Submitting..." : "Submit Quiz"}
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
