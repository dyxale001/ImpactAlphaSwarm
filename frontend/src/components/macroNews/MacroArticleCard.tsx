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
import { universeIcon } from "./universeIcons";

// One story: publisher and time, its tags, the headline, the publisher's own blurb,
// a link out, and every score the model gave it.
//
// The scores are a strip rather than a bar per universe. Seven bars a card made the
// numbers louder than the news, and most of them read 1%. The strip boxes what is
// tagged or at least 10%, and lists the rest on one muted line, so all seven numbers
// stay on the card at about a third of the height.

// Neutral grey, outside the sector palette (forest and lime), because market-wide is
// not a sector: it applies to all of them.
const MARKET_WIDE = { fill: "bg-neutral-600", tint: "bg-neutral-100", border: "border-neutral-400" };

function colourFor(label: string, marketWide: boolean) {
  return marketWide ? MARKET_WIDE : sectorColour(label);
}

export function TagPill({ label, marketWide }: { label: string; marketWide: boolean }) {
  const colour = colourFor(label, marketWide);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-brand-primary ${colour.tint}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${colour.fill}`} aria-hidden />
      {label}
    </span>
  );
}

function ScoreCell({ row }: { row: ProbabilityRow }) {
  const colour = colourFor(row.label, row.marketWide);
  const Icon = universeIcon(row.label);
  const pct = Math.round((row.p ?? 0) * 100);
  return (
    <li
      className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-xl px-2.5 py-1.5 text-[11px] ${
        row.tagged ? `${colour.tint} font-bold text-brand-primary` : "bg-brand-bg text-brand-secondary"
      }`}
      aria-label={`${row.label}: ${formatProbability(row.p)}${row.tagged ? ", tagged" : ""}`}
      title={row.label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="whitespace-nowrap">{shortLabel(row.label)}</span>
      <span className="pl-1 tabular-nums">{formatProbability(row.p)}</span>
      {/* How much of the cell the score fills, along its bottom edge. */}
      <span
        className={`absolute bottom-0 left-0 h-[3px] ${colour.fill} ${row.tagged ? "" : "opacity-40"}`}
        style={{ width: `${pct}%` }}
        aria-hidden
      />
    </li>
  );
}

function ScoreStrip({
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
      <p className="text-[11px] leading-relaxed text-brand-muted-fg">
        Not scored yet. It is checked again at the next update.
      </p>
    );
  }
  const { cells, rest } = splitScores(probabilityRows(article, universes, marketWideLabel));
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-muted-fg">Relevance</p>
      {cells.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {cells.map((row) => (
            <ScoreCell key={row.label} row={row} />
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <p className="text-[11px] leading-relaxed text-brand-muted-fg">
          {rest.map((r, i) => (
            <span key={r.label} title={r.label}>
              {i > 0 && <span aria-hidden> · </span>}
              {shortLabel(r.label)} <span className="tabular-nums">{formatProbability(r.p)}</span>
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
    <article className="soft-card flex flex-col gap-4 p-5">
      <header className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-brand-muted-fg">
          <span className="font-semibold text-brand-secondary">{article.source}</span>
          <span aria-hidden>·</span>
          <time dateTime={article.published_at} className="tabular-nums">
            {time}
          </time>
          {article.commentary && (
            <span
              className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning-strong"
              title="A presenter's or columnist's view on a stock, not a news event"
            >
              Commentary
            </span>
          )}
        </div>
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {article.tags.map((t) => (
              <TagPill key={t} label={t} marketWide={t === marketWideLabel} />
            ))}
          </div>
        )}
        <h3 className="text-base font-bold leading-snug tracking-[-0.015em] text-brand-primary">
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {headline}
          </a>
        </h3>
        {showBlurb && <p className="line-clamp-3 text-xs leading-relaxed text-brand-secondary">{article.blurb}</p>}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 rounded-full text-xs font-semibold text-forest-500 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        >
          Read on {article.source}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </header>
      <ScoreStrip article={article} universes={universes} marketWideLabel={marketWideLabel} />
    </article>
  );
}
