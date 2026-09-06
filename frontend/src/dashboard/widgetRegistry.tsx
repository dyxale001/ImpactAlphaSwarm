import type { ComponentType } from "react";
import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  Clock,
  Eye,
  Landmark,
  LineChart,
  ListOrdered,
  MessageCircle,
  Newspaper,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type {
  WidgetProps,
  WidgetSize,
  WidgetSpecMap,
} from "./layoutSchema";
import {
  TopPickWidget,
  RankedFeedWidget,
  AlsoScoredWidget,
  RunStatusWidget,
} from "../components/dashboard/widgets/signalWidgets";
import {
  WatchlistWidget,
  WatchlistSearchWidget,
  WatchlistTopPicksWidget,
} from "../components/dashboard/widgets/watchlistWidgets";
import {
  SentimentTrendWidget,
  NewsInfluentialWidget,
  SocialBuzzWidget,
  SentimentFreshnessWidget,
} from "../components/dashboard/widgets/sentimentWidgets";
import {
  WhaleClusterWidget,
  InstitutionalOwnersWidget,
  TopFundsWidget,
} from "../components/dashboard/widgets/whaleWidgets";
import {
  LearningProgressWidget,
  LearningNextWidget,
} from "../components/dashboard/widgets/learningWidgets";

// The widget library: the single place a widget is declared.
//
// Adding one to the dashboard means adding an entry here and nothing else. The
// add-widget drawer groups by `group`, the size cycler offers `sizes`,
// parseLayout validates against WIDGET_SPEC, and the decks refer to entries by
// id. Removing one is equally local: parseLayout drops ids it does not
// recognise, so a retired widget disappears from every saved layout rather than
// breaking it.

export type WidgetGroup =
  | "Signals"
  | "Watchlist"
  | "Sentiment"
  | "Whales"
  | "Learning";

export const WIDGET_GROUPS: WidgetGroup[] = [
  "Signals",
  "Watchlist",
  "Sentiment",
  "Whales",
  "Learning",
];

export interface WidgetDef {
  id: string;
  /** Shown in the widget's own header and in the add drawer. */
  title: string;
  /** One line explaining what it is, for someone choosing from the drawer. */
  blurb: string;
  icon: LucideIcon;
  group: WidgetGroup;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  /** Points at the dashboard's pinned ticker, and says so when there is none. */
  needsTicker?: boolean;
  /** Renders its own surface rather than sitting inside the standard card. Only
   *  the top pick, which needs the dark forest hero treatment. */
  bare?: boolean;
  Component: ComponentType<WidgetProps>;
}

const ALL: WidgetSize[] = ["small", "medium", "wide"];
const MEDIUM_UP: WidgetSize[] = ["medium", "wide"];
const SMALL_MEDIUM: WidgetSize[] = ["small", "medium"];

export const WIDGETS: WidgetDef[] = [
  // ── Signals ────────────────────────────────────────────────────────────
  {
    id: "top-pick",
    title: "Top pick",
    blurb: "The single strongest name in your latest run, with the reasoning behind it.",
    icon: Sparkles,
    group: "Signals",
    sizes: MEDIUM_UP,
    defaultSize: "wide",
    bare: true,
    Component: TopPickWidget,
  },
  {
    id: "ranked-feed",
    title: "Your shortlist",
    blurb: "Ranks two to five from your latest run, as full cards.",
    icon: ListOrdered,
    group: "Signals",
    sizes: MEDIUM_UP,
    defaultSize: "wide",
    Component: RankedFeedWidget,
  },
  {
    id: "also-scored",
    title: "Also scored",
    blurb: "Everything else the run ranked, below the shortlist.",
    icon: BarChart3,
    group: "Signals",
    sizes: ["wide"],
    defaultSize: "wide",
    Component: AlsoScoredWidget,
  },
  {
    id: "run-status",
    title: "Run status",
    blurb: "How old your numbers are, and a button to make them newer.",
    icon: RefreshCw,
    group: "Signals",
    sizes: SMALL_MEDIUM,
    defaultSize: "small",
    Component: RunStatusWidget,
  },

  // ── Watchlist ──────────────────────────────────────────────────────────
  {
    id: "watchlist",
    title: "Your watchlist",
    blurb: "Every asset you track, with a fortnight of price history on each.",
    icon: Eye,
    group: "Watchlist",
    sizes: ALL,
    defaultSize: "wide",
    Component: WatchlistWidget,
  },
  {
    id: "watchlist-search",
    title: "Quick add",
    blurb: "Search any ticker and add it without leaving the dashboard.",
    icon: Search,
    group: "Watchlist",
    sizes: SMALL_MEDIUM,
    defaultSize: "medium",
    Component: WatchlistSearchWidget,
  },
  {
    id: "watchlist-top-picks",
    title: "From your latest analysis",
    blurb: "The ranked names from your last completed run, as compact rows.",
    icon: TrendingUp,
    group: "Watchlist",
    sizes: MEDIUM_UP,
    defaultSize: "wide",
    Component: WatchlistTopPicksWidget,
  },

  // ── Sentiment ──────────────────────────────────────────────────────────
  {
    id: "sentiment-trend",
    title: "Sentiment trend",
    blurb: "Seven days of news and social sentiment for the asset you pin.",
    icon: LineChart,
    group: "Sentiment",
    sizes: MEDIUM_UP,
    defaultSize: "wide",
    needsTicker: true,
    Component: SentimentTrendWidget,
  },
  {
    id: "news-influential",
    title: "Influential news",
    blurb: "The articles driving your pinned asset's most recent coverage.",
    icon: Newspaper,
    group: "Sentiment",
    sizes: MEDIUM_UP,
    defaultSize: "medium",
    needsTicker: true,
    Component: NewsInfluentialWidget,
  },
  {
    id: "social-buzz",
    title: "Social buzz",
    blurb: "What people are posting about your pinned asset, and which way it leans.",
    icon: MessageCircle,
    group: "Sentiment",
    sizes: MEDIUM_UP,
    defaultSize: "medium",
    needsTicker: true,
    Component: SocialBuzzWidget,
  },
  {
    id: "sentiment-freshness",
    title: "Sentiment freshness",
    blurb: "When news and social readings were last topped up.",
    icon: Clock,
    group: "Sentiment",
    sizes: SMALL_MEDIUM,
    defaultSize: "small",
    Component: SentimentFreshnessWidget,
  },

  // ── Whales ─────────────────────────────────────────────────────────────
  {
    id: "whale-cluster",
    title: "Insider cluster buying",
    blurb: "Whether several insiders have been buying your pinned asset at once.",
    icon: Users,
    group: "Whales",
    sizes: MEDIUM_UP,
    defaultSize: "wide",
    needsTicker: true,
    Component: WhaleClusterWidget,
  },
  {
    id: "institutional-owners",
    title: "Who owns it",
    blurb: "Institutional and insider ownership of your pinned asset.",
    icon: Building2,
    group: "Whales",
    sizes: MEDIUM_UP,
    defaultSize: "medium",
    needsTicker: true,
    Component: InstitutionalOwnersWidget,
  },
  {
    id: "top-funds",
    title: "Top funds",
    blurb: "The largest fund positions across everything the platform tracks.",
    icon: Landmark,
    group: "Whales",
    sizes: MEDIUM_UP,
    defaultSize: "medium",
    Component: TopFundsWidget,
  },

  // ── Learning ───────────────────────────────────────────────────────────
  {
    id: "learning-progress",
    title: "Learning progress",
    blurb: "Your XP, badges and how far through the articles you are.",
    icon: Award,
    group: "Learning",
    sizes: SMALL_MEDIUM,
    defaultSize: "small",
    Component: LearningProgressWidget,
  },
  {
    id: "learning-next",
    title: "Read next",
    blurb: "The next article you have not finished.",
    icon: BookOpen,
    group: "Learning",
    sizes: SMALL_MEDIUM,
    defaultSize: "small",
    Component: LearningNextWidget,
  },
];

const BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export function widgetById(id: string): WidgetDef | undefined {
  return BY_ID.get(id);
}

/** The shape parseLayout validates against. Derived rather than maintained, so
 *  it can never fall out of step with the registry above. */
export const WIDGET_SPEC: WidgetSpecMap = Object.fromEntries(
  WIDGETS.map((w) => [w.id, { sizes: w.sizes, defaultSize: w.defaultSize }]),
);
