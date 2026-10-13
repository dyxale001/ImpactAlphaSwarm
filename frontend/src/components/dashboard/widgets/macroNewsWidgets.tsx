import { Link } from "react-router-dom";
import type { WidgetProps } from "../../../dashboard/layoutSchema";
import {
  SECTOR_SETTING,
  latestTagged,
  leadStories,
  leadTag,
  readSector,
  showsOverview,
  storyLimit,
} from "../../../dashboard/macroNewsWidgets";
import { useMacroFeed } from "../../../hooks/useMacroFeed";
import type { MacroArticle, MacroFeed } from "../../../services/api/macroNews";
import { useAuthStore } from "../../../store/authStore";
import { displayHeadline, shortLabel, shortWhen, storiesFor } from "../../../utils/macroNews";
import { sectorColour } from "../../../utils/sectorColours";
import { AIOverviewBox, StoryRow } from "../../macroNews/SectorSummary";
import { WidgetEmpty, WidgetLoading } from "./widgetChrome";

// The Market News page on the dashboard (D-223): market-wide news, one sector's
// news, and the latest headlines. Each reads the same feed the page does, through
// one shared request, and shows the page's own rows and AI-overview box, so a
// story on the dashboard reads exactly as it does on the page.
//
// Relevance only, as on the page: a story is shown because the model judged it
// relevant to a group, never because it is good or bad for anything, and none of
// it feeds the rankings.

const MARKET_WIDE_TINT = "bg-neutral-100";

function tintFor(group: string, marketWideLabel: string): string {
  return group === marketWideLabel ? MARKET_WIDE_TINT : sectorColour(group).tint;
}

function newsHref(group: string): string {
  return `/news?tab=stories&filter=${encodeURIComponent(group)}`;
}

function Updated({ feed }: { feed: MacroFeed }) {
  if (!feed.updated_at) return null;
  return <span className="text-[11px] text-brand-muted-fg">Updated {shortWhen(feed.updated_at)}</span>;
}

function SeeAll({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mt-auto inline-block text-xs font-semibold text-brand-primary hover:underline">
      {label} →
    </Link>
  );
}

/** One group's week: its AI overview (from medium up) and its most relevant stories. */
function GroupNews({
  feed,
  group,
  size,
  emptyMessage,
  header,
}: {
  feed: MacroFeed;
  group: string;
  size: WidgetProps["size"];
  emptyMessage: string;
  header?: React.ReactNode;
}) {
  const mw = feed.market_wide_label;
  const all = storiesFor(feed.tagged, group, mw);
  const stories = leadStories(all, storyLimit(size));
  const overview = feed.overviews?.[group];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {header}
        <Updated feed={feed} />
      </div>
      {stories.length === 0 ? (
        <WidgetEmpty grow message={emptyMessage} />
      ) : (
        <>
          {showsOverview(size) && overview && <AIOverviewBox summary={overview.summary} />}
          <ul className="flex flex-col">
            {stories.map((a) => (
              <StoryRow key={a.id} article={a} group={group} marketWideLabel={mw} tint={tintFor(group, mw)} />
            ))}
          </ul>
          <SeeAll to={newsHref(group)} label={all.length > stories.length ? `All ${all.length} stories` : "Open Market News"} />
        </>
      )}
    </div>
  );
}

/** Rates, trade, oil and the other news that touches every sector. */
export function MarketWideNewsWidget({ size }: WidgetProps) {
  const { feed, isLoading, error } = useMacroFeed();
  if (isLoading) return <WidgetLoading rows={3} />;
  if (error || !feed) return <WidgetEmpty grow message={error ?? "Market news could not be loaded just now."} />;
  return (
    <GroupNews
      feed={feed}
      group={feed.market_wide_label}
      size={size}
      emptyMessage="Nothing this week was tagged as market-wide news."
    />
  );
}

/** One sector's news. Each copy of the widget follows its own sector, kept in
 *  its settings, and starts on one the reader chose at onboarding. */
export function SectorNewsWidget({ size, settings, updateSettings }: WidgetProps) {
  const { feed, isLoading, error } = useMacroFeed();
  const chosen = useAuthStore((s) => s.analysis?.investment_universe);
  if (isLoading) return <WidgetLoading rows={3} />;
  if (error || !feed) return <WidgetEmpty grow message={error ?? "Market news could not be loaded just now."} />;

  const sector = readSector(settings, feed.universes, chosen);
  if (!sector) return <WidgetEmpty grow message="No sectors are being followed in the news yet." />;

  const picker = (
    <label className="flex items-center gap-2 text-[11px] font-semibold text-brand-muted-fg">
      <span className="sr-only">Sector</span>
      <select
        value={sector}
        onChange={(e) => updateSettings({ [SECTOR_SETTING]: e.target.value })}
        className="min-h-8 rounded-full border border-brand-border/60 bg-brand-surface px-3 py-1 text-xs font-semibold text-brand-primary focus:border-brand-primary/50 focus:outline-none"
      >
        {feed.universes.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <GroupNews
      feed={feed}
      group={sector}
      size={size}
      header={picker}
      emptyMessage={`Nothing this week was tagged to ${sector}. Market-wide news touches every sector too.`}
    />
  );
}

/** The newest tagged stories across every sector, each labelled with the group
 *  it is most relevant to. */
export function LatestHeadlinesWidget({ size }: WidgetProps) {
  const { feed, isLoading, error } = useMacroFeed();
  if (isLoading) return <WidgetLoading rows={3} />;
  if (error || !feed) return <WidgetEmpty grow message={error ?? "Market news could not be loaded just now."} />;

  const mw = feed.market_wide_label;
  const stories = latestTagged(feed.tagged, storyLimit(size));
  if (stories.length === 0) return <WidgetEmpty grow message="No stories were tagged this week." />;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex justify-end">
        <Updated feed={feed} />
      </div>
      <ul className="flex flex-col">
        {stories.map((a) => (
          <HeadlineRow key={a.id} article={a} marketWideLabel={mw} />
        ))}
      </ul>
      <SeeAll to="/news?tab=stories" label="All stories" />
    </div>
  );
}

function HeadlineRow({ article, marketWideLabel }: { article: MacroArticle; marketWideLabel: string }) {
  const tag = leadTag(article, marketWideLabel);
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
        {tag && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-brand-primary ${tintFor(tag, marketWideLabel)}`}
          >
            {tag === marketWideLabel ? "Market-wide" : shortLabel(tag)}
          </span>
        )}
      </a>
    </li>
  );
}
