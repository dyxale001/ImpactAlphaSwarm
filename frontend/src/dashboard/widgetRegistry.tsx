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
  MessageCircle,
  Newspaper,
  RefreshCw,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type {
  WidgetProps,
  WidgetSize,
  WidgetSpecMap,
} from "./layoutSchema";
import {
  ShortlistWidget,
  AlsoScoredWidget,
  RunStatusWidget,
} from "../components/dashboard/widgets/signalWidgets";
import { WatchlistWidget } from "../components/dashboard/widgets/watchlistWidgets";
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
import { FundBracketWidget } from "../components/dashboard/widgets/fundWidgets";
import { FUNDS_ENABLED } from "../utils/fundsFlags";

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
  | "Funds"
  | "Learning";

// Funds is the one group behind a flag. The same VITE_FUNDS_ENABLED that mounts
// the /funds route decides whether the drawer offers the group at all. With the
// flag off the tile is never spread into WIDGETS, so a layout saved with it in
// loses it the way it loses a retired widget, and the widget module is dead
// code the bundler drops, as the page's already is.
export const WIDGET_GROUPS: WidgetGroup[] = [
  "Signals",
  "Watchlist",
  "Sentiment",
  "Whales",
  ...(FUNDS_ENABLED ? (["Funds"] as WidgetGroup[]) : []),
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
  /** Scoped to one asset, which it stores in its own settings and picks for
   *  itself. Each such widget is independent: retargeting one leaves the rest
   *  where they were. */
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
    // Was two widgets, "top-pick" and "ranked-feed". Keeping the "top-pick" id
    // means a saved layout carrying it still resolves; parseLayout quietly
    // drops the retired "ranked-feed", and a layout holding both ends up with
    // one shortlist rather than a duplicate.
    id: "top-pick",
    title: "Your shortlist",
    blurb:
      "The strongest name in your latest run with the reasoning behind it, then ranks two to five as cards.",
    icon: Sparkles,
    group: "Signals",
    sizes: MEDIUM_UP,
    defaultSize: "wide",
    bare: true,
    Component: ShortlistWidget,
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
    blurb:
      "Search any ticker to add it, and every asset you track with a fortnight of price history on each.",
    icon: Eye,
    group: "Watchlist",
    sizes: ALL,
    defaultSize: "wide",
    Component: WatchlistWidget,
  },
  // Retired: "watchlist-search" ("Quick add") is now the search bar at the top
  // of the watchlist widget itself, so adding an asset and seeing the list it
  // joins are one card. parseLayout drops the id from any saved layout.
  //
  // Retired: "watchlist-top-picks" ("From your latest analysis") duplicated the
  // Signals group's "top-pick" widget, which already covers the same ranked run
  // as a hero plus cards. parseLayout drops the id from any saved layout that
  // still holds it.

  // ── Sentiment ──────────────────────────────────────────────────────────
  {
    id: "sentiment-trend",
    title: "Sentiment trend",
    blurb: "Seven days of news and social sentiment for the asset you focus on.",
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
    blurb: "The articles driving your focused asset's most recent coverage.",
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
    blurb: "What people are posting about your focused asset, and which way it leans.",
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
    blurb: "Whether several insiders have been buying your focused asset at once.",
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
    blurb: "Institutional and insider ownership of your focused asset.",
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

  // ── Funds ──────────────────────────────────────────────────────────────
  // Named for the bracket, not for any fund: a dashboard tile that listed funds
  // would be the product choosing, which is what the section's design keeps
  // behind. The tile shows the rating the answers score to and the categories
  // in play, and links to the page that applies the rule.
  ...(FUNDS_ENABLED
    ? [
        {
          id: "fund-bracket",
          title: "Your fund bracket",
          blurb:
            "The risk bracket your profile answers map to, and the fund categories in play.",
          icon: Landmark,
          group: "Funds",
          sizes: ALL,
          defaultSize: "medium",
          Component: FundBracketWidget,
        } satisfies WidgetDef,
      ]
    : []),

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
  WIDGETS.map((w) => [
    w.id,
    { sizes: w.sizes, defaultSize: w.defaultSize, needsTicker: w.needsTicker },
  ]),
);
