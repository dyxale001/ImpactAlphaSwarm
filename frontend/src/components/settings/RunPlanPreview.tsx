import { Layers, Timer } from "lucide-react";
import { RUN_TICKER_CAP, planRun } from "../../utils/runPlan";
import {
  RUN_PLAN_COUNT_LABEL,
  RUN_PLAN_SPLIT_LABEL,
  RUN_PLAN_TIME_LABEL,
  RUN_PLAN_TIME_NOTE,
  RUN_PLAN_WATCHLIST_NOTE,
} from "../../utils/settingsCopy";

// The app's own forest and lime ramps, alternating dark and light so neighbouring
// slices always separate. Assigned by position, not by sector: six greens tied to
// sectors could sit side by side and blur together. The legend dots use the same
// fill, so each slice still reads against its name.
const THEME_FILLS = [
  "bg-forest-700",
  "bg-lime-500",
  "bg-forest-400",
  "bg-lime-700",
  "bg-forest-200",
  "bg-forest-600",
];
const fillAt = (index: number) => THEME_FILLS[index % THEME_FILLS.length];

function Stat({ Icon, label, value }: { Icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10">
        <Icon size={14} className="text-brand-primary" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-muted-fg">{label}</p>
        <p className="text-sm font-bold tabular-nums text-brand-fg transition-all duration-200">{value}</p>
      </div>
    </div>
  );
}

/**
 * What the next analysis run will look at for the sectors picked so far: a typical
 * run time, how many companies, and how the run's places are shared out. Updates as
 * tiles are toggled, before anything is saved, so the trade off is visible while the
 * choice is being made.
 *
 * The bar is drawn against the full run, so one sector shows its 15 places filling
 * half of it, and a second sector visibly completes it.
 */
export default function RunPlanPreview({ sectors }: { sectors: string[] }) {
  if (sectors.length === 0) return null;
  const plan = planRun(sectors);
  const summary = plan.shares.map((s) => `${s.sector} ${s.places}`).join(", ");

  return (
    <div className="rounded-xl border border-brand-border/40 bg-brand-surface/20 p-4" aria-live="polite">
      <div className="grid grid-cols-2 gap-3">
        <Stat Icon={Timer} label={RUN_PLAN_TIME_LABEL} value={`About ${plan.time}`} />
        <Stat Icon={Layers} label={RUN_PLAN_COUNT_LABEL} value={`${plan.companies} of ${RUN_TICKER_CAP}`} />
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-muted-fg">
          {RUN_PLAN_SPLIT_LABEL}
        </p>
        <div
          role="img"
          aria-label={`${RUN_PLAN_SPLIT_LABEL}: ${summary}`}
          className="mt-2 flex h-2 w-full gap-[3px] overflow-hidden rounded-full bg-brand-border/25"
        >
          {plan.shares.map((s, i) => (
            <span
              key={s.sector}
              className={`h-full rounded-full transition-[width] duration-300 ease-out ${fillAt(i)}`}
              style={{ width: `${(s.places / RUN_TICKER_CAP) * 100}%` }}
            />
          ))}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {plan.shares.map((s, i) => (
            <li key={s.sector} className="inline-flex items-center gap-1.5 text-[11px] text-brand-muted-fg">
              <span className={`h-2 w-2 shrink-0 rounded-full ${fillAt(i)}`} />
              {s.sector}
              <span className="font-bold tabular-nums text-brand-fg">{s.places}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3.5 space-y-1 border-t border-brand-border/30 pt-3 text-[10px] leading-snug text-brand-muted-fg">
        <p>{RUN_PLAN_TIME_NOTE}</p>
        <p>{RUN_PLAN_WATCHLIST_NOTE}</p>
      </div>
    </div>
  );
}
