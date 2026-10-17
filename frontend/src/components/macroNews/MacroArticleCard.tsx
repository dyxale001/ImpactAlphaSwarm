import { ArrowUpRight } from "lucide-react";
import type { MacroArticle } from "../../services/api/macroNews";
import { sectorColour } from "../../utils/sectorColours";
import {
  blurbRepeatsHeadline,
  displayHeadline,
  formatProbability,
  probabilityRows,
  shortLabel,
  splitScores,
  type ProbabilityRow,
} from "../../utils/macroNews";

// One story: publisher and time, its tags, the headline, the publisher's own blurb,
// a link out, and every score the model gave it.
//
// The scores that matter (tagged, or at least 10%) are a bar each, so two sectors
// can be compared at a glance; the rest are listed on one muted line, so all seven
// numbers stay on the card without seven bars that mostly read 1%. Bars are coloured
// by state, as in the About dialog's example: forest when the story is tagged to the
// sector, grey when it is not. The sector's own colour is the dot beside its name.

// Neutral grey, outside the sector palette (forest and lime), because market-wide is
// not a sector: it applies to all of them.
const MARKET_WIDE_DOT = "bg-neutral-500";

export function sectorDot(label: string, marketWide: boolean): string {
  return marketWide ? MARKET_WIDE_DOT : sectorColour(label).fill;
}

export function TagChip({ label, marketWide }: { label: string; marketWide: boolean }) {
  return (
    <span className="chip">
      <span className={`h-2 w-2 shrink-0 rounded-full ${sectorDot(label, marketWide)}`} aria-hidden />
      {label}
    </span>
  );
}

function ScoreBar({ row }: { row: ProbabilityRow }) {
  const pct = Math.round((row.p ?? 0) * 100);
  return (
    <li
      className="flex flex-col gap-1"
      aria-label={`${row.label}: ${formatProbability(row.p)}${row.tagged ? ", tagged" : ""}`}
    >
      <span className="flex items-center justify-between gap-3 text-xs">
        <span
          className={`flex min-w-0 items-center gap-1.5 ${row.tagged ? "font-semibold text-forest-900" : "text-brand-muted-fg"}`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${sectorDot(row.label, row.marketWide)}`} aria-hidden />
          <span className="truncate">{row.label}</span>
        </span>
        <span className={`tabular-nums ${row.tagged ? "font-bold text-forest-900" : "text-brand-muted-fg"}`}>
          {formatProbability(row.p)}
        </span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-forest-50" aria-hidden>
        <span
          className={`block h-full rounded-full ${row.tagged ? "bg-forest-700" : "bg-neutral-400"}`}
          style={{ width: `max(4px, ${pct}%)` }}
        />
      </span>
    </li>
  );
}

function Relevance({
  article,
  universes,
  marketWideLabel,
}: {
  article: MacroArticle;
  universes: string[];
  marketWideLabel: string;
}) {
  if (!article.scored) {
    return (
      <p className="text-xs leading-relaxed text-brand-muted-fg">Not scored yet. It is checked again at the next update.</p>
    );
  }
  const { cells, rest } = splitScores(probabilityRows(article, universes, marketWideLabel));
  return (
    <div className="flex flex-col gap-2 border-t border-forest-900/8 pt-3">
      <p className="text-xs font-bold text-brand-muted-fg">Relevance</p>
      {cells.length > 0 && (
        <ul className="flex flex-col gap-2">
          {cells.map((row) => (
            <ScoreBar key={row.label} row={row} />
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <p className="text-xs leading-relaxed text-brand-muted-fg">
          {cells.length > 0 && "Others: "}
          {rest.map((r, i) => (
            <span key={r.label} title={r.label}>
              {i > 0 && <span aria-hidden> · </span>}
              {/* A name never wraps away from its number. */}
              <span className="whitespace-nowrap">
                {shortLabel(r.label)} <span className="tabular-nums">{formatProbability(r.p)}</span>
              </span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export default function MacroArticleCard({
  article,
  universes,
  marketWideLabel,
}: {
  article: MacroArticle;
  universes: string[];
  marketWideLabel: string;
}) {
  const time = new Date(article.published_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const headline = displayHeadline(article.headline, article.source);
  const showBlurb = !blurbRepeatsHeadline(article.headline, article.blurb, article.source);

  return (
    <article className="as-card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-brand-muted-fg">
        <span className="font-bold text-forest-900">{article.source}</span>
        <span aria-hidden>·</span>
        <time dateTime={article.published_at} className="tabular-nums">
          {time}
        </time>
        {article.commentary && (
          <span className="chip chip-caution" title="A presenter's or columnist's view on a stock, not a news event">
            Commentary
          </span>
        )}
      </div>
      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {article.tags.map((t) => (
            <TagChip key={t} label={t} marketWide={t === marketWideLabel} />
          ))}
        </div>
      )}
      <h3 className="text-base font-bold leading-snug tracking-[-0.01em] text-forest-900">
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {headline}
        </a>
      </h3>
      {showBlurb && <p className="line-clamp-3 text-sm leading-relaxed text-brand-muted-fg">{article.blurb}</p>}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        Read on {article.source}
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </a>
      <div className="mt-auto">
        <Relevance article={article} universes={universes} marketWideLabel={marketWideLabel} />
      </div>
    </article>
  );
}
