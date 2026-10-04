import { ExternalLink } from "lucide-react";
import type { MacroArticle } from "../../services/api/macroNews";
import { sectorColour } from "../../utils/sectorColours";
import {
  blurbRepeatsHeadline,
  displayHeadline,
  formatProbability,
  probabilityRows,
} from "../../utils/macroNews";

// One story: publisher, headline, the publisher's own blurb, a link out, and every
// probability the model gave it. The bars are the point of the card, so they are
// shown in full rather than behind a toggle: low numbers are as much a part of the
// explanation as the tags.

// Neutral grey, outside the sector palette (forest and lime), because market-wide is
// not a sector: it applies to all of them.
const MARKET_WIDE_FILL = "bg-neutral-600";

function fillFor(label: string, marketWide: boolean): string {
  return marketWide ? MARKET_WIDE_FILL : sectorColour(label).fill;
}

export function TagChip({ label, marketWide, count }: { label: string; marketWide: boolean; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-border/70 bg-brand-surface px-2 py-0.5 text-[11px] font-semibold text-brand-primary">
      <span className={`h-2 w-2 shrink-0 rounded-full ${fillFor(label, marketWide)}`} aria-hidden />
      {label}
      {count !== undefined && <span className="tabular-nums text-brand-muted-fg">· {count}</span>}
    </span>
  );
}

function ProbabilityBars({
  article,
  universes,
  marketWideLabel,
  threshold,
}: {
  article: MacroArticle;
  universes: string[];
  marketWideLabel: string;
  threshold: number;
}) {
  if (!article.scored) {
    return (
      <p className="text-[11px] leading-relaxed text-brand-muted-fg">
        Not scored yet. It is checked again at the next update.
      </p>
    );
  }
  const rows = probabilityRows(article, universes, marketWideLabel);
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-muted-fg">
        Relevance by universe
      </p>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-[11px]">
            <span
              className={`w-36 shrink-0 truncate sm:w-44 ${
                row.tagged ? "font-bold text-brand-primary" : "text-brand-secondary"
              }`}
            >
              {row.label}
            </span>
            <span
              className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-brand-border/40"
              role="img"
              aria-label={`${row.label}: ${formatProbability(row.p)}${row.tagged ? ", tagged" : ""}`}
            >
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${fillFor(row.label, row.marketWide)} ${
                  row.tagged ? "" : "opacity-50"
                }`}
                style={{ width: `${Math.round((row.p ?? 0) * 100)}%` }}
              />
              {/* The tag line: a story is tagged with this row at or above it. */}
              <span
                className="absolute inset-y-0 w-px bg-brand-primary/60"
                style={{ left: `${Math.round(threshold * 100)}%` }}
                aria-hidden
              />
            </span>
            <span
              className={`w-9 shrink-0 text-right tabular-nums ${
                row.tagged ? "font-bold text-brand-primary" : "text-brand-muted-fg"
              }`}
            >
              {formatProbability(row.p)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MacroArticleCard({
  article,
  universes,
  marketWideLabel,
  threshold,
}: {
  article: MacroArticle;
  universes: string[];
  marketWideLabel: string;
  threshold: number;
}) {
  const time = new Date(article.published_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const headline = displayHeadline(article.headline, article.source);
  const showBlurb = !blurbRepeatsHeadline(article.headline, article.blurb, article.source);

  return (
    <article className="soft-card flex flex-col gap-3 p-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-brand-muted-fg">
          <span className="font-semibold text-brand-secondary">{article.source}</span>
          <span aria-hidden>·</span>
          <time dateTime={article.published_at}>{time}</time>
        </div>
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {article.tags.map((t) => (
              <TagChip key={t} label={t} marketWide={t === marketWideLabel} />
            ))}
          </div>
        )}
        <h3 className="text-[15px] font-bold leading-snug tracking-[-0.01em] text-brand-primary">
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {headline}
          </a>
        </h3>
        {showBlurb && (
          <p className="text-xs leading-relaxed text-brand-secondary">{article.blurb}</p>
        )}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-forest-500 hover:underline"
        >
          Read on {article.source}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </header>
      <ProbabilityBars
        article={article}
        universes={universes}
        marketWideLabel={marketWideLabel}
        threshold={threshold}
      />
    </article>
  );
}
