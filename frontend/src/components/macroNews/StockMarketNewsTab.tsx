import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { getStockMacro, type StockMacro, type StockMacroSection } from "../../services/api/macroNews";
import { sectorColour } from "../../utils/sectorColours";
import FundsNotice from "../funds/FundsNotice";
import { AIOverviewBox, StoryRow } from "./SectorSummary";
import { universeIcon } from "./universeIcons";

// The stock page's Market news tab (D-223): news about the stock's sector as a whole,
// then news that touches every sector. Universe level, never ticker level, so every
// stock in a sector sees the same stories, and the tab says so up front. Fetched when
// the tab opens, not with the page.

const MARKET_WIDE_TINT = "bg-neutral-100";

function Section({
  section,
  title,
  description,
  marketWideLabel,
  seeAllLabel,
  footnote,
}: {
  section: StockMacroSection;
  title: string;
  description: string;
  marketWideLabel: string;
  seeAllLabel: string;
  footnote?: string;
}) {
  const marketWide = section.group === marketWideLabel;
  const tint = marketWide ? MARKET_WIDE_TINT : sectorColour(section.group).tint;
  const Icon = universeIcon(section.group);
  const href = `/news?tab=stories&filter=${encodeURIComponent(section.group)}`;

  return (
    <section className="as-card w-full space-y-5 p-4 sm:p-6">
      {/* The heading every stock page tab uses: 16px title, short subtitle. */}
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold tracking-[-0.01em] text-forest-900">
          <Icon className="h-4 w-4 text-forest-700" aria-hidden="true" />
          {title}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-brand-muted-fg">{description}</p>
      </div>

      {section.total === 0 ? (
        <p className="text-xs leading-relaxed text-brand-muted-fg">
          No stories were tagged to {section.group} in the last week.
        </p>
      ) : (
        <>
          {section.overview ? (
            <AIOverviewBox summary={section.overview.summary} />
          ) : (
            <p className="text-xs leading-relaxed text-brand-muted-fg">
              The overview for these stories is written at the next update.
            </p>
          )}
          {section.stories.length > 0 && (
            <ul className="divide-y divide-forest-900/8 overflow-hidden rounded-[12px] border border-forest-900/10">
              {section.stories.map((a) => (
                <StoryRow key={a.id} article={a} group={section.group} marketWideLabel={marketWideLabel} tint={tint} variant="list" />
              ))}
            </ul>
          )}
          <Link
            to={href}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            {seeAllLabel}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </>
      )}
      {footnote ? (
        <p className="border-t border-forest-900/10 pt-4 text-xs leading-relaxed text-brand-muted-fg">{footnote}</p>
      ) : null}
    </section>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="as-card h-64 animate-pulse p-5">
          <div className="h-3 w-40 rounded-full bg-brand-border/50" />
          <div className="mt-3 h-4 w-3/4 rounded-full bg-brand-border/50" />
          <div className="mt-5 h-24 rounded-2xl bg-brand-border/30" />
        </div>
      ))}
    </div>
  );
}

export default function StockMarketNewsTab({ ticker }: { ticker: string }) {
  const [data, setData] = useState<StockMacro | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    getStockMacro(ticker)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (error) {
    return <FundsNotice icon={AlertTriangle} tone="warning" title="Market news isn't available right now" body={error} />;
  }
  if (!data) return <TabSkeleton />;

  const { sector, market_wide: marketWide, universe } = data;
  const mw = data.market_wide_label;
  const count = (n: number) => `${n} ${n === 1 ? "story" : "stories"}`;

  return (
    <div className="space-y-3">
      {sector && universe ? (
        <Section
          section={sector}
          title={`${universe} news this week`}
          description={`News about the ${universe} sector as a whole, not about ${data.ticker} itself. Every ${universe} stock shows the same stories here.`}
          marketWideLabel={mw}
          seeAllLabel={`See all ${count(sector.total)} on Market News`}
        />
      ) : (
        <div className="as-card p-4 text-sm text-brand-muted-fg sm:p-6">
          {data.ticker} isn't placed in one of AlphaSwarm's sectors, so there's no sector news to show. News that
          affects every sector is below.
        </div>
      )}

      <Section
        section={marketWide}
        title="Market-wide news"
        description="Interest rates, trade, oil and major world events: news that touches every stock, including this one."
        marketWideLabel={mw}
        seeAllLabel={`See all ${marketWide.total} market-wide ${marketWide.total === 1 ? "story" : "stories"} on Market News`}
        // The tab's caveat, at the foot of its last card like the other tabs'.
        footnote={`These stories are matched to a sector by how relevant they are, not whether they are good or bad news, and they don't affect ${data.ticker}'s ranking.`}
      />
    </div>
  );
}
