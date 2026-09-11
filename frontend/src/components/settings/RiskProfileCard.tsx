import { useState } from "react";
import { Clock } from "lucide-react";
import QuestionBlock from "../onboarding/QuestionBlock";
import RiskScale from "../funds/RiskScale";
import SettingsCard, { CardChip, Consequence } from "./SettingsCard";
import { PrimaryButton, SecondaryButton, TextButton } from "./SettingsButtons";
import { useFundMatches } from "../../hooks/useFundCatalogue";
import type { useProfileAnswers } from "../../hooks/useProfileAnswers";
import { SURVEY_QUESTIONS } from "../../utils/onboardingData";
import { determinePsychometrics } from "../../utils/scoringEngine";
import { FUNDS_ENABLED } from "../../utils/fundsFlags";
import {
  RETAKE_STEPS,
  questionsInStep,
  retakeProgress,
  stepComplete,
} from "../../utils/retakeSteps";
import {
  RETAKE_BACK,
  RETAKE_CANCEL,
  RETAKE_INCOMPLETE,
  RETAKE_NEXT,
  RETAKE_PREFILLED,
  RETAKE_PREVIEW_CHANGED,
  RETAKE_PREVIEW_PREFIX,
  RETAKE_PREVIEW_SAME,
  RETAKE_SAVE,
  RETAKE_SAVED,
  RETAKE_SAVING,
  RISK_ANSWERED_LABEL,
  RISK_CARD_CHIP,
  RISK_CARD_LEAD,
  RISK_CARD_TITLE,
  RISK_CEILING_LABEL,
  RISK_CLOSE_ACTION,
  RISK_CONSEQUENCE,
  RISK_NOT_ANSWERED,
  RISK_NOT_ANSWERED_LEAD,
  RISK_QUESTIONS_LABEL,
  RISK_RATING_LABEL,
  RISK_REVIEW_ACTION,
  formatSavedDate,
} from "../../utils/settingsCopy";

type Profile = ReturnType<typeof useProfileAnswers>;

/**
 * The risk rating, and the only way to change it.
 *
 * Risk tolerance is shown here but **cannot be set here**. It is derived from
 * the questionnaire: the answers are scored, and the score decides the label.
 * Settings once offered three tiles that wrote the label directly, which let a
 * user pick "Aggressive" without the answers that justify it. Harmless while
 * the label only tinted a dashboard; not harmless once it decided which funds
 * someone is shown, because the whole basis of that filter is that both sides
 * of the comparison are published rather than chosen.
 *
 * So the card opens as a summary — the rating, the five-step ceiling it puts on
 * a manager's own label, when the answers were saved — and the retake is a
 * step in. It is prefilled, because this is a revision of a considered set of
 * answers rather than a fresh interrogation, and it is paced in four steps of
 * five: the twenty questions unrolled inline used to run this page past nine
 * thousand pixels.
 */
export default function RiskProfileCard({ profile }: { profile: Profile }) {
  const {
    riskLabel,
    surveyAnswers,
    setSurveyAnswer,
    saveRetake,
    discardChanges,
    isSaving,
    error,
    savedWhat,
    answeredSurvey,
    lastSavedAt,
  } = profile;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const total = SURVEY_QUESTIONS.length;
  const complete = answeredSurvey === total;
  const savedDate = formatSavedDate(lastSavedAt);

  // Shown live during a retake so the consequence of a change is visible
  // before it is saved, rather than appearing as a different label afterwards.
  const preview = open && answeredSurvey > 0 ? determinePsychometrics(surveyAnswers).riskTolerance : null;

  function openRetake() {
    setStep(0);
    setOpen(true);
  }
  function closeRetake() {
    discardChanges();
    setOpen(false);
  }
  async function submit() {
    const ok = await saveRetake();
    if (ok) setOpen(false);
  }

  const lastStep = step === RETAKE_STEPS.length - 1;
  const current = RETAKE_STEPS[step];
  const questions = questionsInStep(SURVEY_QUESTIONS, step);

  return (
    <SettingsCard
      id="risk-profile"
      title={RISK_CARD_TITLE}
      lead={RISK_CARD_LEAD}
      chip={<CardChip>{RISK_CARD_CHIP}</CardChip>}
      error={error && !open ? error : null}
      success={savedWhat === "retake" ? RETAKE_SAVED : null}
      consequence={
        <Consequence icon={<Clock className="h-3.5 w-3.5" />}>{RISK_CONSEQUENCE}</Consequence>
      }
      actions={
        <SecondaryButton
          onClick={open ? closeRetake : openRetake}
          aria-expanded={open}
          aria-controls="risk-retake"
        >
          {open ? RISK_CLOSE_ACTION : RISK_REVIEW_ACTION}
        </SecondaryButton>
      }
    >
      {/* ── The rating, and the ceiling it sets ── */}
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand-muted-fg">
            {RISK_RATING_LABEL}
          </p>
          <p className="mt-1.5 text-3xl font-extrabold leading-none tracking-tight text-brand-primary">
            {riskLabel ?? RISK_NOT_ANSWERED}
          </p>
        </div>
        {FUNDS_ENABLED && riskLabel && <CeilingScale />}
      </div>

      {riskLabel ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-3">
          {savedDate && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-brand-muted-fg">
                {RISK_ANSWERED_LABEL}
              </dt>
              <dd className="mt-0.5 font-semibold text-brand-fg">{savedDate}</dd>
            </div>
          )}
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-brand-muted-fg">
              {RISK_QUESTIONS_LABEL}
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-brand-fg">
              {answeredSurvey} of {total}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-brand-muted-fg">{RISK_NOT_ANSWERED_LEAD}</p>
      )}

      {/* ── The retake, in steps ── */}
      {open && (
        <div id="risk-retake" className="flex flex-col gap-4 border-t border-brand-border/40 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-bold text-brand-primary">
              Step {step + 1} of {RETAKE_STEPS.length}{" "}
              <span className="font-semibold text-brand-muted-fg">· {current.title}</span>
            </p>
            <p className="text-xs tabular-nums text-brand-muted-fg">
              Questions {current.from + 1} to {current.to} · {answeredSurvey} of {total} answered
            </p>
          </div>

          <div
            className="h-1.5 overflow-hidden rounded-full bg-brand-primary/8"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={retakeProgress(step)}
          >
            <div
              className="h-full rounded-full bg-brand-accent transition-[width] duration-300 ease-[cubic-bezier(0.2,0.6,0.2,1)]"
              style={{ width: `${retakeProgress(step)}%` }}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {RETAKE_STEPS.map((s, i) => {
              const done = stepComplete(surveyAnswers, i);
              return (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    i === step
                      ? "border-transparent bg-brand-primary text-brand-bg"
                      : done
                        ? "border-transparent bg-lime-100 text-lime-700 hover:bg-lime-200"
                        : "border-brand-border text-brand-muted-fg hover:text-brand-fg"
                  }`}
                >
                  {s.title}
                </button>
              );
            })}
          </div>

          {preview && (
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-brand-border/40 bg-forest-50 px-3 py-2.5 text-sm text-brand-fg">
              <span>
                {RETAKE_PREVIEW_PREFIX} <strong className="text-brand-primary">{preview}</strong>
              </span>
              <span className="text-xs text-brand-muted-fg">
                {riskLabel && preview !== riskLabel
                  ? RETAKE_PREVIEW_CHANGED.replace("{current}", riskLabel)
                  : RETAKE_PREVIEW_SAME}
              </span>
            </p>
          )}

          <p className="text-xs text-brand-muted-fg">{RETAKE_PREFILLED}</p>

          <div className="flex flex-col divide-y divide-brand-border/40">
            {questions.map((q, i) => (
              <QuestionBlock
                key={q.id}
                question={q}
                value={surveyAnswers[q.id]}
                onAnswer={setSurveyAnswer}
                appearance="embedded"
                number={current.from + i + 1}
              />
            ))}
          </div>

          {error && (
            <p role="alert" className="text-xs text-semantic-danger">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 border-t border-brand-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <TextButton onClick={closeRetake} disabled={isSaving}>
                {RETAKE_CANCEL}
              </TextButton>
              {lastStep && !complete && (
                <span className="text-xs text-brand-muted-fg">{RETAKE_INCOMPLETE}</span>
              )}
            </div>
            <div className="flex items-center gap-2 sm:justify-end">
              {step > 0 && (
                <SecondaryButton onClick={() => setStep((s) => s - 1)} disabled={isSaving}>
                  {RETAKE_BACK}
                </SecondaryButton>
              )}
              {lastStep ? (
                <PrimaryButton onClick={() => void submit()} disabled={isSaving || !complete}>
                  {isSaving ? RETAKE_SAVING : RETAKE_SAVE}
                </PrimaryButton>
              ) : (
                <PrimaryButton onClick={() => setStep((s) => s + 1)}>{RETAKE_NEXT}</PrimaryButton>
              )}
            </div>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

/**
 * The ceiling the rating puts on a manager's published label, read off the
 * same server bracket the Funds page and the dashboard tile render, so the
 * three can never disagree. Its own component so the request is only made
 * when the funds section is switched on and there is a rating to explain.
 */
function CeilingScale() {
  const { bracket, isLoading, error } = useFundMatches();
  if (isLoading || error || !bracket) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand-muted-fg">
        {RISK_CEILING_LABEL}
      </p>
      <div className="mt-1.5">
        <RiskScale level={bracket.ceiling} label={bracket.ceiling_label} compact />
      </div>
    </div>
  );
}
