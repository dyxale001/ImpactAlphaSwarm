import { Settings as SettingsIcon } from "lucide-react";
import LearnPopover from "../learning/LearnPopover";
import type { LearningContext } from "../../data/learningContexts";
import {
  SETTINGS_EYEBROW,
  SETTINGS_LEAD,
  SETTINGS_TITLE,
  SUMMARY_GOALS_LABEL,
  SUMMARY_NOT_ANSWERED,
  SUMMARY_NO_SECTORS,
  SUMMARY_RISK_LABEL,
  SUMMARY_SECTORS_LABEL,
} from "../../utils/settingsCopy";

/**
 * The page header, the hub header every main page opens with: no motif, the
 * profile at a glance as stat tiles on the right (as the Learning Centre shows
 * its progress), and the book button for this tab's lessons.
 *
 * Sign out is not here: it lives in the profile control at the bottom of the
 * sidebar and in the phone menu (D-212), so red on this page can mean one thing
 * only: the deactivate card. When the risk answers were saved is shown in the
 * risk card, where it is explained.
 */
export default function SettingsHero({
  riskLabel,
  goalsAnswered,
  goalsTotal,
  sectors,
  learnContext,
}: {
  riskLabel: string | null;
  goalsAnswered: number;
  goalsTotal: number;
  sectors: string[];
  /** The lessons for the tab in view, or none (the Account tab). */
  learnContext: LearningContext | null;
}) {
  const sectorSummary =
    sectors.length === 0
      ? SUMMARY_NO_SECTORS
      : sectors.length === 1
        ? sectors[0]
        : `${sectors[0]} +${sectors.length - 1}`;

  const stats = [
    { label: SUMMARY_RISK_LABEL, value: riskLabel ?? SUMMARY_NOT_ANSWERED },
    { label: SUMMARY_GOALS_LABEL, value: `${goalsAnswered} of ${goalsTotal}` },
    // On a phone the tile is too narrow for a sector's name, so it says how many.
    {
      label: SUMMARY_SECTORS_LABEL,
      value: sectorSummary,
      short: sectors.length === 0 ? SUMMARY_NO_SECTORS : `${sectors.length} ${sectors.length === 1 ? "sector" : "sectors"}`,
    },
  ];

  return (
    <div className="hero-card px-5 py-6 sm:px-8 sm:py-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="band-eyebrow mb-2">{SETTINGS_EYEBROW}</p>
            {learnContext && <LearnPopover context={learnContext} onDark className="shrink-0 lg:hidden" />}
          </div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-[-0.02em] text-brand-bg lg:text-3xl">
            <SettingsIcon className="h-7 w-7 shrink-0 text-brand-accent" />
            {SETTINGS_TITLE}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-bg/75">{SETTINGS_LEAD}</p>
        </div>

        <div className="flex shrink-0 items-start gap-3">
          <dl className="grid grid-cols-3 gap-2" aria-label="Profile summary">
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0 rounded-[14px] bg-white/8 px-3 py-2.5 sm:px-4">
                <dt className="text-xs text-brand-bg/60">{stat.label}</dt>
                <dd className="text-sm font-bold leading-snug text-brand-bg sm:text-lg">
                  {"short" in stat ? (
                    <>
                      <span className="sm:hidden">{stat.short}</span>
                      <span className="hidden sm:inline">{stat.value}</span>
                    </>
                  ) : (
                    stat.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {learnContext && <LearnPopover context={learnContext} onDark className="hidden shrink-0 lg:block" />}
        </div>
      </div>
    </div>
  );
}
