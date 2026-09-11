/**
 * Every sentence the Settings page shows, in one place.
 *
 * Same arrangement as `fundsCopy.ts`, for the same reason: the product is not
 * a licensed adviser, and the Settings page now explains what a risk rating
 * does to someone's fund matches. That wording has to stay descriptive, and
 * `settingsCopy.test.ts` runs every string here through the funds forbidden-
 * term scan so a rewrite cannot quietly turn a description into a proposal.
 */

// ── Hero ────────────────────────────────────────────────────────────────────
export const SETTINGS_EYEBROW = "Your account";
export const SETTINGS_TITLE = "Settings";
export const SETTINGS_LEAD =
  "What your fund matches and analysis are based on, and how the app is set up.";
export const SETTINGS_SIGN_OUT = "Sign out";
export const SUMMARY_RISK_LABEL = "Risk profile";
export const SUMMARY_ANSWERED_LABEL = "Last saved";
export const SUMMARY_GOALS_LABEL = "Goals";
export const SUMMARY_SECTORS_LABEL = "Sectors";
export const SUMMARY_NOT_ANSWERED = "Not yet answered";
export const SUMMARY_NO_SECTORS = "None chosen";

// ── Tabs ────────────────────────────────────────────────────────────────────
export const PROFILE_TAB_INTRO =
  "The two things your fund matches are worked out from. Both come from your answers, and each is saved on its own.";
export const PREFERENCES_TAB_INTRO =
  "What the analysis run and the app read. Each card saves on its own.";
export const ACCOUNT_TAB_INTRO = "Who you are signed in as.";

// ── Risk profile card ───────────────────────────────────────────────────────
export const RISK_CARD_TITLE = "Your risk profile";
export const RISK_CARD_LEAD =
  "Worked out from your questionnaire answers, not chosen directly. It sets the highest published risk level a fund can carry and still be matched to you.";
export const RISK_CARD_CHIP = "Derived from answers";
export const RISK_RATING_LABEL = "Rating";
export const RISK_CEILING_LABEL = "Ceiling on the manager's five-step scale";
export const RISK_ANSWERED_LABEL = "Based on answers saved";
export const RISK_QUESTIONS_LABEL = "Questions answered";
export const RISK_CONSEQUENCE =
  "Changing your answers changes the rating. Fund matches update as soon as you save.";
export const RISK_REVIEW_ACTION = "Review your answers";
export const RISK_CLOSE_ACTION = "Close";
export const RISK_NOT_ANSWERED = "Not yet answered";
export const RISK_NOT_ANSWERED_LEAD =
  "Answer the questionnaire and the rating appears here, along with the funds it opens.";

// ── Retake stepper ──────────────────────────────────────────────────────────
export const RETAKE_PREFILLED = "Your previous answers are filled in. Change what has changed.";
export const RETAKE_PREVIEW_PREFIX = "These answers give";
export const RETAKE_PREVIEW_SAME = "Same as today.";
export const RETAKE_PREVIEW_CHANGED = "Currently {current}. Saving changes your fund matches.";
export const RETAKE_INCOMPLETE = "Answer every question. The score uses all of them.";
export const RETAKE_BACK = "Back";
export const RETAKE_NEXT = "Next";
export const RETAKE_SAVE = "Save answers";
export const RETAKE_SAVING = "Saving…";
export const RETAKE_CANCEL = "Cancel";
export const RETAKE_SAVED = "Saved. Your matched funds now use these answers.";

// ── Goals card ──────────────────────────────────────────────────────────────
export const GOALS_CARD_TITLE = "What you are investing for";
export const GOALS_CARD_LEAD =
  "Read alongside your risk profile. When you need the money matters as much as how much risk you can take: a five-year fund does not fit a two-year plan whatever your risk answers say.";
export const GOALS_CONSEQUENCE = "Applies to your fund matches immediately. No run needed.";
export const GOALS_EDIT_ACTION = "Edit goals";
export const GOALS_CANCEL_ACTION = "Cancel";
export const GOALS_SAVE_ACTION = "Save goals";
export const GOALS_SAVED = "Saved. Your matched funds now use these goals.";
export const GOALS_NOT_ANSWERED = "Not answered";
export const GOAL_LABEL_HORIZON = "Time horizon";
export const GOAL_LABEL_PURPOSE = "Purpose";
export const GOAL_LABEL_ACCOUNT = "Account";
export const GOAL_LABEL_CONTRIBUTION = "Contributions";

// ── Preferences ─────────────────────────────────────────────────────────────
export const SECTORS_CARD_TITLE = "Target sectors";
export const SECTORS_CARD_LEAD = "The parts of the market your analysis run looks at. Pick at least one.";
export const SECTORS_NONE_WARNING = "Pick at least one sector.";
export const SECTORS_SAVE_ACTION = "Save sectors";
export const EXPERTISE_CARD_TITLE = "Expertise level";
export const EXPERTISE_CARD_LEAD = "How much detail the app explains things with.";
export const EXPERTISE_SAVE_ACTION = "Save expertise";
export const RUN_CONSEQUENCE =
  "Applies on your next analysis run, or refresh from the Assets page.";
export const DASHBOARD_CARD_TITLE = "Dashboard layout";
export const DASHBOARD_CARD_LEAD =
  "What your dashboard currently holds. Rearranging is done on the dashboard itself.";

// ── Account ─────────────────────────────────────────────────────────────────
export const DETAILS_CARD_TITLE = "Your details";
export const DETAILS_SAVE_ACTION = "Save details";
export const DETAILS_CANCEL_ACTION = "Cancel";
export const DETAILS_EMAIL_NOTE = "Email cannot be changed.";
export const PASSWORD_CARD_TITLE = "Password";
export const PASSWORD_CARD_LEAD = "Used to sign in. Changing it signs out no other device.";
export const DEACTIVATE_CARD_TITLE = "Deactivate account";
export const DEACTIVATE_CARD_LEAD =
  "Hides your account and signs you out straight away. Your data is kept, and signing back in reactivates it.";
export const DEACTIVATE_CONSEQUENCE = "Reversible by signing back in.";
export const DEACTIVATE_ACTION = "Deactivate my account";
export const DEACTIVATE_CONFIRM = "Yes, deactivate my account";
export const DEACTIVATE_KEEP = "Keep my account";
export const DEACTIVATE_WORKING = "Deactivating…";

/** An ISO timestamp as the page shows it: "5 September 2026". Null for
 *  anything that is not a date, so a bad row shows nothing rather than
 *  "Invalid Date". */
export function formatSavedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

/** Every string above, for the forbidden-term scan. */
export function allSettingsStrings(): string[] {
  return [
    SETTINGS_EYEBROW,
    SETTINGS_TITLE,
    SETTINGS_LEAD,
    SETTINGS_SIGN_OUT,
    SUMMARY_RISK_LABEL,
    SUMMARY_ANSWERED_LABEL,
    SUMMARY_GOALS_LABEL,
    SUMMARY_SECTORS_LABEL,
    SUMMARY_NOT_ANSWERED,
    SUMMARY_NO_SECTORS,
    PROFILE_TAB_INTRO,
    PREFERENCES_TAB_INTRO,
    ACCOUNT_TAB_INTRO,
    RISK_CARD_TITLE,
    RISK_CARD_LEAD,
    RISK_CARD_CHIP,
    RISK_RATING_LABEL,
    RISK_CEILING_LABEL,
    RISK_ANSWERED_LABEL,
    RISK_QUESTIONS_LABEL,
    RISK_CONSEQUENCE,
    RISK_REVIEW_ACTION,
    RISK_CLOSE_ACTION,
    RISK_NOT_ANSWERED,
    RISK_NOT_ANSWERED_LEAD,
    RETAKE_PREFILLED,
    RETAKE_PREVIEW_PREFIX,
    RETAKE_PREVIEW_SAME,
    RETAKE_PREVIEW_CHANGED,
    RETAKE_INCOMPLETE,
    RETAKE_BACK,
    RETAKE_NEXT,
    RETAKE_SAVE,
    RETAKE_SAVING,
    RETAKE_CANCEL,
    RETAKE_SAVED,
    GOALS_CARD_TITLE,
    GOALS_CARD_LEAD,
    GOALS_CONSEQUENCE,
    GOALS_EDIT_ACTION,
    GOALS_CANCEL_ACTION,
    GOALS_SAVE_ACTION,
    GOALS_SAVED,
    GOALS_NOT_ANSWERED,
    GOAL_LABEL_HORIZON,
    GOAL_LABEL_PURPOSE,
    GOAL_LABEL_ACCOUNT,
    GOAL_LABEL_CONTRIBUTION,
    SECTORS_CARD_TITLE,
    SECTORS_CARD_LEAD,
    SECTORS_NONE_WARNING,
    SECTORS_SAVE_ACTION,
    EXPERTISE_CARD_TITLE,
    EXPERTISE_CARD_LEAD,
    EXPERTISE_SAVE_ACTION,
    RUN_CONSEQUENCE,
    DASHBOARD_CARD_TITLE,
    DASHBOARD_CARD_LEAD,
    DETAILS_CARD_TITLE,
    DETAILS_SAVE_ACTION,
    DETAILS_CANCEL_ACTION,
    DETAILS_EMAIL_NOTE,
    PASSWORD_CARD_TITLE,
    PASSWORD_CARD_LEAD,
    DEACTIVATE_CARD_TITLE,
    DEACTIVATE_CARD_LEAD,
    DEACTIVATE_CONSEQUENCE,
    DEACTIVATE_ACTION,
    DEACTIVATE_CONFIRM,
    DEACTIVATE_KEEP,
    DEACTIVATE_WORKING,
  ];
}
