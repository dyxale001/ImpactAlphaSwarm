import { ArrowRight, Sparkles } from "lucide-react";
import type { MacroArticle, MacroOverview } from "../../services/api/macroNews";
import { sectorColour } from "../../utils/sectorColours";
import { displayHeadline, formatProbability, groupProbability, shortWhen } from "../../utils/macroNews";
import { sectorDot } from "./MacroArticleCard";

// One sector at a glance: what the week's tagged stories add up to (an AI overview),
// the three most relevant of them, and a way into the rest. The summary layer of the
// page; the full cards further down are the evidence for it.

const MARKET_WIDE_TINT = "bg-neutral-100";

export function StoryRow({
  article,
  group,
  marketWideLabel,
  tint,
  variant = "plain",
}: {
  article: MacroArticle;
  group: string;
  marketWideLabel: string;
  tint: string;
  /** "list": a row inside a bordered list, its relevance spelled out in a neutral
   *  chip so the figure cannot be read as a score or a probability of anything. */
  variant?: "plain" | "list";
}) {
  const p = groupProbability(article, group, marketWideLabel);
  if (variant === "list") {
    return (
      <li>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-forest-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-primary"
        >
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-semibold leading-snug text-forest-900">
              {displayHeadline(article.headline, article.source)}
            </span>
            <span className="mt-0.5 block text-xs text-brand-muted-fg">
              {article.source} · {shortWhen(article.published_at)}
            </span>
          </span>
          <span className="chip shrink-0 tabular-nums" title={`How closely this story concerns ${group}, not whether it is good or bad news.`}>
            {formatProbability(p)} relevant
          </span>
        </a>
      </li>
    );
  }
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

/** The AI overview, in the soft Sparkles box every AI-written paragraph uses. */
export function AIOverviewBox({ summary }: { summary: string }) {
  // The reasoning-trace box, exactly as the stock page, the sentiment and quant
  // panels and Whale Watching frame theirs, so AI-written prose reads as the
  // same kind of object wherever it appears.
  return (
    <div className="as-inset p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-forest-900">
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-lime-500 text-forest-800">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        AI overview
      </p>
      <p className="text-sm leading-relaxed text-forest-900">{summary}</p>
      <p className="mt-2 text-xs leading-relaxed text-brand-muted-fg">
        Written from the stories below. It can contain mistakes, so check the source.
      </p>
    </div>
  );
}

export default function SectorSummary({
  group,
  stories,
  overview,
  marketWideLabel,
  onSeeAll,
  className = "",
}: {
  group: string;
  /** The group's tagged stories, most relevant first. */
  stories: MacroArticle[];
  overview: MacroOverview | undefined;
  marketWideLabel: string;
  onSeeAll: () => void;
  className?: string;
}) {
  const marketWide = group === marketWideLabel;
  const tint = marketWide ? MARKET_WIDE_TINT : sectorColour(group).tint;
  const count = stories.length;
  // Commentary (a presenter's stock pick, a trading idea) never leads a summary: it is
  // an opinion about a stock, and the overview above is written without it too.
  const top = stories.filter((a) => !a.commentary).slice(0, 3);
  const title = marketWide ? "Affecting every sector" : group;

  // The conservative card: the sector's dot and name, the overview, its three most
  // relevant stories in the bordered list the stock page's Market news tab uses, and
  // a way into the rest.
  return (
    <article className={`as-card flex flex-col gap-4 p-4 sm:p-6 ${className}`}>
      <header>
        <h3 className="flex items-center gap-2 text-base font-bold tracking-[-0.01em] text-forest-900">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${sectorDot(group, marketWide)}`} aria-hidden />
          {title}
        </h3>
        <p className="mt-1 text-xs text-brand-muted-fg">
          {count === 0 ? "No tagged stories this week" : `${count} tagged ${count === 1 ? "story" : "stories"} this week`}
          {marketWide && " · rates, trade, oil and other market-wide news"}
        </p>
      </header>

      {count === 0 ? (
        <p className="text-sm leading-relaxed text-brand-muted-fg">
          Nothing this week was tagged to {group}. Market-wide news, which touches every sector, is still worth a
          look.
        </p>
      ) : (
        <>
          {overview ? (
            <AIOverviewBox summary={overview.summary} />
          ) : (
            <p className="text-xs leading-relaxed text-brand-muted-fg">
              The overview for these stories is written at the next update.
            </p>
          )}

          <ul className="divide-y divide-forest-900/8 overflow-hidden rounded-[12px] border border-forest-900/10">
            {top.map((a) => (
              <StoryRow key={a.id} article={a} group={group} marketWideLabel={marketWideLabel} tint={tint} variant="list" />
            ))}
          </ul>

          <button
            type="button"
            onClick={onSeeAll}
            className="mt-auto inline-flex w-fit items-center gap-1.5 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {count > top.length ? `See all ${count} ${marketWide ? "market-wide" : group} stories` : "See these stories in full"}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </>
      )}
    </article>
  );
}
