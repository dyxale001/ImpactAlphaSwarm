import { ArrowRight, Sparkles } from "lucide-react";
import type { MacroArticle, MacroOverview } from "../../services/api/macroNews";
import { sectorColour } from "../../utils/sectorColours";
import { displayHeadline, formatProbability, groupProbability, shortWhen } from "../../utils/macroNews";
import { universeIcon } from "./universeIcons";

// One sector at a glance: what the week's tagged stories add up to (an AI overview),
// the three most relevant of them, and a way into the rest. The summary layer of the
// page; the full cards further down are the evidence for it.

const MARKET_WIDE_TINT = "bg-neutral-100";
const PRESSABLE =
  "transition-transform duration-[120ms] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent";

function StoryRow({
  article,
  group,
  marketWideLabel,
  tint,
}: {
  article: MacroArticle;
  group: string;
  marketWideLabel: string;
  tint: string;
}) {
  const p = groupProbability(article, group, marketWideLabel);
  return (
    <li>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-brand-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
      >
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-brand-primary">
            {displayHeadline(article.headline, article.source)}
          </span>
          <span className="mt-0.5 block text-[11px] text-brand-muted-fg">
            {article.source} · {shortWhen(article.published_at)}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums text-brand-primary ${tint}`}
          aria-label={`${formatProbability(p)} relevant to ${group}`}
        >
          {formatProbability(p)}
        </span>
      </a>
    </li>
  );
}

export default function SectorSummary({
  group,
  stories,
  overview,
  marketWideLabel,
  onSeeAll,
}: {
  group: string;
  /** The group's tagged stories, most relevant first. */
  stories: MacroArticle[];
  overview: MacroOverview | undefined;
  marketWideLabel: string;
  onSeeAll: () => void;
}) {
  const marketWide = group === marketWideLabel;
  const tint = marketWide ? MARKET_WIDE_TINT : sectorColour(group).tint;
  const Icon = universeIcon(group);
  const count = stories.length;
  // Commentary (a presenter's stock pick, a trading idea) never leads a summary: it is
  // an opinion about a stock, and the overview above is written without it too.
  const top = stories.filter((a) => !a.commentary).slice(0, 3);
  const title = marketWide ? "Affecting every sector" : group;

  return (
    <article className="soft-card flex flex-col gap-4 p-5">
      <header className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-primary ${tint}`} aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold tracking-[-0.01em] text-brand-primary">{title}</h3>
          <p className="text-[11px] text-brand-muted-fg">
            {count === 0 ? "No tagged stories this week" : `${count} tagged ${count === 1 ? "story" : "stories"} this week`}
            {marketWide && " · rates, trade, oil and other market-wide news"}
          </p>
        </div>
      </header>

      {count === 0 ? (
        <p className="text-xs leading-relaxed text-brand-secondary">
          Nothing this week was tagged to {group}. Market-wide news, which touches every sector, is still worth a
          look.
        </p>
      ) : (
        <>
          {overview ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm leading-relaxed text-brand-secondary">{overview.summary}</p>
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-muted-fg">
                <Sparkles className="h-3 w-3" aria-hidden />
                AI overview of these stories, can contain mistakes
              </p>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-brand-muted-fg">
              The overview for these stories is written at the next update.
            </p>
          )}

          <ul className="flex flex-col border-t border-brand-border/50 pt-2">
            {top.map((a) => (
              <StoryRow key={a.id} article={a} group={group} marketWideLabel={marketWideLabel} tint={tint} />
            ))}
          </ul>

          <button
            type="button"
            onClick={onSeeAll}
            className={`${PRESSABLE} mt-auto inline-flex w-fit items-center gap-1.5 rounded-full text-xs font-semibold text-forest-500 hover:underline`}
          >
            {count > top.length ? `See all ${count} ${marketWide ? "market-wide" : group} stories` : "See these stories in full"}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </>
      )}
    </article>
  );
}
