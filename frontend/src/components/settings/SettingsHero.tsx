import { LogOut, Settings as SettingsIcon } from "lucide-react";
import {
  SETTINGS_EYEBROW,
  SETTINGS_LEAD,
  SETTINGS_SIGN_OUT,
  SETTINGS_TITLE,
  SUMMARY_ANSWERED_LABEL,
  SUMMARY_GOALS_LABEL,
  SUMMARY_NOT_ANSWERED,
  SUMMARY_NO_SECTORS,
  SUMMARY_RISK_LABEL,
  SUMMARY_SECTORS_LABEL,
} from "../../utils/settingsCopy";

/**
 * The page header, on the same forest band every other main page opens with.
 *
 * Settings used to open on a bare heading in a narrow column, which made the
 * nav jump feel like leaving the app. The band is flat forest, no gradient —
 * decided for this page specifically back in May.
 *
 * The block on the right is the profile at a glance, in the position the
 * dashboard puts its "last run" facts. Sign out lives here as a quiet outline
 * chip, where the dashboard also puts it, so red on this page can mean one
 * thing only: the deactivate card.
 */
export default function SettingsHero({
  riskLabel,
  savedAt,
  goalsAnswered,
  goalsTotal,
  sectors,
  onSignOut,
}: {
  riskLabel: string | null;
  savedAt: string | null;
  goalsAnswered: number;
  goalsTotal: number;
  sectors: string[];
  onSignOut: () => void;
}) {
  const sectorSummary =
    sectors.length === 0
      ? SUMMARY_NO_SECTORS
      : sectors.length === 1
        ? sectors[0]
        : `${sectors[0]} +${sectors.length - 1}`;

  return (
    <div className="hero-card overflow-hidden px-5 pb-7 pt-8 sm:px-7">
      <RingsMotif />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-brand-accent">
            {SETTINGS_EYEBROW}
          </p>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-brand-bg lg:text-3xl">
            <SettingsIcon className="h-7 w-7 shrink-0 text-brand-accent" />
            {SETTINGS_TITLE}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-bg/75">{SETTINGS_LEAD}</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-brand-bg/85 transition-colors hover:border-white/50 hover:text-brand-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              <LogOut className="h-3.5 w-3.5" />
              {SETTINGS_SIGN_OUT}
            </button>
          </div>
        </div>

        <dl
          className="grid shrink-0 grid-cols-[auto_auto] gap-x-5 gap-y-1.5 self-start rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs lg:self-end"
          aria-label="Profile summary"
        >
          <dt className="text-brand-bg/60">{SUMMARY_RISK_LABEL}</dt>
          <dd className="text-right font-bold text-brand-bg">{riskLabel ?? SUMMARY_NOT_ANSWERED}</dd>
          {savedAt && (
            <>
              <dt className="text-brand-bg/60">{SUMMARY_ANSWERED_LABEL}</dt>
              <dd className="text-right font-bold text-brand-bg">{savedAt}</dd>
            </>
          )}
          <dt className="text-brand-bg/60">{SUMMARY_GOALS_LABEL}</dt>
          <dd className="text-right font-bold tabular-nums text-brand-bg">
            {goalsAnswered} of {goalsTotal}
          </dd>
          <dt className="text-brand-bg/60">{SUMMARY_SECTORS_LABEL}</dt>
          <dd className="text-right font-bold text-brand-bg">{sectorSummary}</dd>
        </dl>
      </div>
    </div>
  );
}

/** Three concentric rings with a few lime points: the profile as the centre
 *  the rest of the app is set from. Sits behind the copy, right of centre,
 *  and hides on narrow screens where it would collide with the summary. */
function RingsMotif() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 220 260"
      className="pointer-events-none absolute -top-8 bottom-[-32px] right-[260px] hidden h-[calc(100%+64px)] w-[220px] opacity-60 lg:block"
    >
      <g stroke="#c7f269" strokeOpacity=".22" strokeWidth="2" fill="none">
        <circle cx="110" cy="130" r="38" />
        <circle cx="110" cy="130" r="70" />
        <circle cx="110" cy="130" r="104" />
      </g>
      <g fill="#c7f269">
        <circle cx="110" cy="92" r="4" />
        <circle cx="176" cy="150" r="4" opacity=".7" />
        <circle cx="52" cy="184" r="3" opacity=".5" />
      </g>
    </svg>
  );
}
