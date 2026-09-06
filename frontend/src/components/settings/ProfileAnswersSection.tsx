import { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import GoalQuestions from "../onboarding/GoalQuestions";
import { GOAL_QUESTIONS, SURVEY_QUESTIONS } from "../../utils/onboardingData";
import { determinePsychometrics } from "../../utils/scoringEngine";
import { useProfileAnswers } from "../../hooks/useProfileAnswers";

/**
 * The answers behind a user's profile, and the only place they change.
 *
 * Risk tolerance is shown here but **cannot be set here**. It is derived from
 * the questionnaire — the answers are scored, and the score decides the label.
 * Settings previously offered three tiles that wrote the label directly, which
 * meant a user could pick "Aggressive" without the answers that justify it.
 * That was harmless while the label only tinted a dashboard; it stopped being
 * harmless when it started deciding which funds someone is shown, because the
 * whole basis of that filter is that both sides of the comparison are published
 * rather than chosen.
 *
 * So the label is read-only and the way to change it is to revise the answers.
 * The retake is prefilled from what was answered before: this is a revision of
 * a considered set of answers, not a fresh interrogation, and starting blank
 * would push people to click through it.
 *
 * The goals block sits alongside because the two are read together — the fund
 * matcher takes the risk label and the goals in the same pass — but they are
 * saved separately, since revising what your money is for should not require
 * re-answering twenty questions about risk.
 */
export default function ProfileAnswersSection() {
  const {
    riskLabel,
    surveyAnswers,
    goalAnswers,
    setSurveyAnswer,
    setGoalAnswer,
    saveGoals,
    saveRetake,
    isSaving,
    error,
    saved,
    answeredSurvey,
    answeredGoals,
  } = useProfileAnswers();

  const [retakeOpen, setRetakeOpen] = useState(false);

  // Shown live during a retake so the consequence of a change is visible before
  // it is saved, rather than appearing as a different label afterwards.
  const preview = retakeOpen ? determinePsychometrics(surveyAnswers).riskTolerance : null;
  const complete = answeredSurvey === SURVEY_QUESTIONS.length;

  return (
    <section className="space-y-6">
      {/* ── Risk, derived ── */}
      <div className="rounded-xl border border-brand-border/40 bg-brand-card p-6 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-brand-fg">Your risk profile</h2>
          <span className="rounded-full bg-brand-primary/10 px-3 py-1 text-sm font-semibold text-brand-fg">
            {riskLabel ?? "Not yet answered"}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-brand-muted-fg">
          Worked out from your questionnaire answers, not chosen directly. It sets the highest risk
          level a fund can carry and still be matched to you, so it has to come from the answers
          rather than from a preference.
        </p>

        <button
          type="button"
          onClick={() => setRetakeOpen((open) => !open)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-fg hover:underline"
        >
          {retakeOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {retakeOpen ? "Close" : "Review your answers"}
        </button>

        {retakeOpen && (
          <div className="space-y-4 border-t border-brand-border/40 pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-brand-muted-fg">
                Your previous answers are filled in. Change what has changed.
              </p>
              <span className="text-xs text-brand-muted-fg">
                {answeredSurvey} / {SURVEY_QUESTIONS.length} answered
              </span>
            </div>

            {preview && (
              <p className="rounded-md bg-brand-surface/40 px-3 py-2 text-sm text-brand-fg">
                These answers give <strong>{preview}</strong>
                {riskLabel && preview !== riskLabel && (
                  <span className="text-brand-muted-fg"> — currently {riskLabel}</span>
                )}
                .
              </p>
            )}

            <div className="flex flex-col gap-4">
              {SURVEY_QUESTIONS.map((q) => (
                <div key={q.id} className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
                  <p className="text-[15px] font-semibold leading-normal text-forest-900">
                    {q.question}
                  </p>
                  <div className="flex flex-col gap-2">
                    {q.options.map((opt) => {
                      const selected = surveyAnswers[q.id] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSurveyAnswer(q.id, opt.value)}
                          className={`flex items-center gap-3 rounded-md border px-3.5 py-[11px] text-left transition-all duration-150 ${
                            selected
                              ? "border-lime-500/80 bg-lime-100"
                              : "border-forest-900/8 bg-neutral-100/60"
                          }`}
                        >
                          <span
                            className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                              selected ? "border-forest-900" : "border-forest-900/25"
                            }`}
                          >
                            {selected && <span className="h-1.5 w-1.5 rounded-full bg-forest-900" />}
                          </span>
                          <span
                            className={`text-[13px] leading-[1.45] ${
                              selected ? "font-semibold text-forest-900" : "text-muted"
                            }`}
                          >
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isSaving || !complete}
                onClick={() => void saveRetake().then((ok) => ok && setRetakeOpen(false))}
                className="rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save answers"}
              </button>
              {!complete && (
                <span className="text-xs text-brand-muted-fg">
                  Answer every question — the score uses all of them.
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── What the money is for ── */}
      <div className="rounded-xl border border-brand-border/40 bg-brand-card p-6 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-brand-fg">What you are investing for</h2>
          <span className="text-xs text-brand-muted-fg">
            {answeredGoals} / {GOAL_QUESTIONS.length} answered
          </span>
        </div>
        <p className="text-sm leading-relaxed text-brand-muted-fg">
          Used alongside your risk profile to narrow the funds you are shown. When you need the
          money matters as much as how much risk you can take: a five-year fund does not fit a
          two-year plan whatever your risk answers say.
        </p>

        <GoalQuestions answers={goalAnswers} onAnswer={setGoalAnswer} />

        <button
          type="button"
          disabled={isSaving}
          onClick={() => void saveGoals()}
          className="rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save goals"}
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && (
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
          <Check className="h-4 w-4" />
          Saved. Your matched funds will use these answers.
        </p>
      )}
    </section>
  );
}
