// Copy for the Compare page (D-220). One file, like quantExplainers.ts and
// signalCopy.ts, so every sentence the page says can be read and checked in one
// place.
//
// House rule, stricter here than anywhere else in the app because a comparison
// invites the question "so which one?": describe what each figure is and what
// the gap between them describes. Never better or worse, never a pick, never a
// prediction (D-081, D-082). "Rose more" is a fact; "did better" is a verdict.

import type { MeasuredRow } from "../utils/compareStocks";

export const COMPARE_TITLE = "Compare";
export const COMPARE_EYEBROW = "Side by side";
export const COMPARE_LEAD =
  "Line up two or three stocks, or two or three funds, and see every figure next to each other with what the differences mean. The page never picks one for you; the decision stays yours.";

export const KIND_LABELS = { stocks: "Stocks", funds: "Funds" } as const;

export const PICK_STOCK_PLACEHOLDER = "Search or browse stocks";
export const PICK_FUND_PLACEHOLDER = "Search or browse funds";
export const PICK_FULL = "Three is the most this page lines up. Remove one to add another.";

export const START_TITLE_STOCKS = "Pick two stocks to start";
export const START_TITLE_FUNDS = "Pick two funds to start";
export const START_ONE_MORE = "Pick one more to start";
export const START_BODY_STOCKS =
  "Type a name or ticker, or click the search box to browse every stock by sector. You can line up as many as three, and the comparison appears once two are chosen.";
export const START_BODY_FUNDS =
  "Type a fund's name or JSE code, or click the search box to browse the catalogue, starting with the funds matched to your profile. Funds in the same category compare most clearly, for example three trackers of the same index.";
export const FROM_WATCHLIST = "From your watchlist";
export const FUNDS_MATCHED = "Matched to your profile";

// ── stock sections and rows ────────────────────────────────────────────────

// The three tabs under the written comparison. The trace sits above them, outside
// any tab, because it speaks to all three.
export const TAB_OVERVIEW = "Overview";
export const TAB_TONE = "Tone";
export const TAB_YOURS = "Your analysis";

export const SECTION_OVERVIEW = "Listing and price";
export const SECTION_WINDOW = "Price over";
export const SECTION_TONE = "News and social tone · last 7 days";
export const SECTION_YOURS_NOTE =
  "From your latest completed run. Places and percentiles compare each stock with the others in that run, so they are about your run, not fixed facts about the stock.";

export const DIFFERS_MOST = "Differs most";
export const ALIKE = "Alike";
export const SAME = "Same";

/** What each measured row means, one line, said once under the row. */
export const ROW_MEANING: Record<MeasuredRow, string> = {
  change:
    "How far each price moved from the first close in the window to the most recent one. It describes the window only.",
  drawdown:
    "The largest fall from a high to a later low inside the window. A bigger figure means a deeper dip along the way, whether or not the price recovered.",
  volatility:
    "How much the price moved around from day to day, annualised. Higher means a jumpier price; it is not a measure of safety.",
  rsi: "How fast and how far the price has moved recently, on a 0 to 100 scale. Above 70 is conventionally called overbought and below 30 oversold. These describe the move, not what comes next.",
};

export const ROW_LABELS: Record<MeasuredRow, string> = {
  change: "Change",
  drawdown: "Largest fall from a high",
  volatility: "Volatility (annualised)",
  rsi: "RSI, latest",
};

export const RSI_DAYS_LABEL = "Days RSI sat above 70 / below 30";
export const RSI_DAYS_MEANING =
  "How often the reading sat past the conventional lines during the window. Both are descriptions of past movement.";

export const TONE_ROW_NEWS = "News tone";
export const TONE_ROW_SOCIAL = "Social tone";
export const TONE_MEANING =
  "The average tone of what was written about each stock this week, weighted by how much was written each day. Tone is what people said, not what the price will do.";
export const TONE_BUILDING = "Building history…";

export const TONE_CHART_TITLE = "Tone, day by day";
export const TONE_SOURCE_SOCIAL = "Social";
export const TONE_SOURCE_NEWS = "News";
export const TONE_CHART_NOTE =
  "The tone of what was written about each stock each day, from 0 to 100, where 50 is neutral. A gap is a day nothing was written. Tone is what people said, not what the price will do.";
export const TONE_CHART_EMPTY =
  "Nothing was written about these stocks in the last 7 days, so there is no tone to plot.";
export const TONE_CHART_BUILDING =
  "The tone history for one of these stocks is still being gathered. Check back in a moment.";

export const YOURS_PLACE = "Place in your run";
export const YOURS_SIGNALS = "Signals";
export const YOURS_CONFIDENCE = "Confidence score";
export const YOURS_BETA = "Beta";
export const YOURS_SHARPE = "Sharpe ratio";
export const YOURS_NOT_IN_RUN = "Not in your latest analysis";
export const YOURS_NOT_IN_RUN_BODY =
  "Your latest run did not include this stock, so it has no place or scorecard. Its price and tone still apply; nothing here is filled in from an older run. A stock on your watchlist is in every run after you add it.";
export const YOURS_ADD_WATCHLIST = "Add to watchlist";
export const YOURS_ADDING = "Adding…";
export const YOURS_ON_WATCHLIST = "On your watchlist, so your next run includes it";
export const YOURS_ADD_FAILED = "That stock could not be added to your watchlist. Try again in a moment.";

export const PRICE_LABEL = "Price";
export const PRICE_MEANING =
  "The most recent close, the one the chart above ends on, in rand. A higher share price is not a bigger or more valuable company, which is why the chart above compares change rather than price.";
export const priceCloseOn = (date: string) => `Close on ${date}`;
export const PRICE_STORED = "Last stored price";
export const YOURS_NO_RUN =
  "You have no completed analysis yet, so there is no place or scorecard to compare. The price and tone above do not depend on one.";
export const WHY_TITLE = "Why your analysis places them differently";
export const WHY_BADGE = "From your run's numbers";
export const OWN_TRACE = "analysis, explained";
/** The one line near the top that answers "where did my run put these?" before the
 *  figures, pointing down to the section that explains it. */
export const RUN_STRIP_LABEL = "In your run";
export const RUN_STRIP_NOT_IN = "not in it";
export const RUN_STRIP_WHY = "See why";
export const RUN_STRIP_DETAILS = "See your analysis";

// ── the written comparison ─────────────────────────────────────────────────

export const TRACE_TITLE = "What separates these";
export const TRACE_INVITE =
  "A short explanation of where these stocks' prices differ, and why your latest analysis placed them where it did. Written for you when you ask, from the figures on this page.";
export const TRACE_INVITE_NO_RUN =
  "A short explanation of where these stocks' prices differ, written for you when you ask, from the figures on this page. Once you have a completed analysis it also explains where that placed them.";
export const TRACE_BUTTON = "Explain this comparison";
export const TRACE_WRITING = "Writing your comparison…";
export const TRACE_DISCLOSURE =
  "Written for you from the figures on this page and your latest analysis, then checked: every number in it appears in those figures, and verdict, advice or suitability wording fails it. It explains; it does not rank, predict or advise.";
export const TRACE_DISCLOSURE_PRICES =
  "Written for you from the figures on this page, then checked: every number in it appears in those figures, and verdict or advice wording fails it. It describes past price behaviour; it does not rank, predict or advise.";
export const traceFromRun = (date: string) => `Explains your analysis of ${date}`;

export const TRACE_INVITE_FUNDS =
  "A short explanation of how these funds differ on their fact sheets, and why each one is or is not among the funds matched to your profile. Written for you when you ask.";
export const TRACE_DISCLOSURE_FUNDS =
  "Written for you from these funds' fact sheets and the fixed rules your profile is matched by, then checked: every number in it appears in those figures, and verdict, advice or suitability wording fails it. The matches come from those rules, not from AI; this explains them and does not choose a fund for you.";
export const TRACE_DISCLOSURE_FUNDS_NO_PROFILE =
  "Written from these funds' fact sheets, then checked: every number in it appears in those figures, and verdict or advice wording fails it. Complete your risk profile to see which of them are matched to you.";

export const ASK_ABOUT_THIS = "Ask AlphaSwarm a follow-up";
export const askPrompt = (tickers: string[]) =>
  tickers.length === 2
    ? `Compare ${tickers[0]} and ${tickers[1]}`
    : `Compare ${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}`;

export const CHART_TITLE = "Change since the start of the window";
export const CHART_EMPTY =
  "There are not enough prices in this window to draw the change. A longer window may have more.";
export const CHART_NOTE =
  "Every stock starts at 0%, so a different share price does not hide the shape of each move. Each line ends on the same change as the Change row below. Past movement only.";

export const STOCKS_DISCLAIMER =
  "AlphaSwarm describes and explains; it does not recommend. Nothing on this page is a suggestion to buy, sell or hold, and the order of the columns is the order you picked them in.";

// ── funds ──────────────────────────────────────────────────────────────────

export const FUND_SECTION_WHAT = "What it is";
export const FUND_SECTION_COST = "Cost";
export const FUND_SECTION_RISK = "Risk and time";
export const FUND_SECTION_RETURNS = "Past returns, in rand, yearly average";
export const FUND_SECTION_HOLDINGS = "What it holds";

export const FUND_COST_MEANING =
  "What the fund takes each year to run, as a share of what you hold (TER). Shown on R10,000 for one year so it is a rand amount; no growth is assumed.";
export const FUND_RETURNS_MEANING =
  "Only the periods every fund here reports. Each fund's own published figures, before inflation. Past returns describe the past.";
export const FUND_HOLDINGS_MEANING =
  "Funds that hold the same companies will tend to move together, whatever their names.";
export const FUND_RISK_MEANING =
  "Each fund house's own label from its fact sheet, on the common 1 to 5 scale.";
export const fundDateWarning = (days: number) =>
  `These fact sheets are about ${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? "" : "s"} apart, so their figures end on different dates and do not cover exactly the same period.`;
export const FUNDS_DISCLAIMER =
  "Figures are transcribed from each manager's published fact sheet. AlphaSwarm is not a licensed financial services provider and does not advise; the order of the columns is the order you picked them in.";

// ── about this page ────────────────────────────────────────────────────────
// The "How Compare works" dialog behind the header's About button, written for
// someone new to investing (D-203's explanation with every analytic output), the
// way Market News explains itself.

export const ABOUT_BUTTON = "About this page";
export const ABOUT_EYEBROW = "About this page";
export const ABOUT_TITLE = "How Compare works";
export const ABOUT_INTRO =
  "Two stocks can look alike on their own pages and turn out quite different side by side, or the other way round. Compare lines up two or three stocks, or two or three funds, in one table, marks where they differ most, and says what each difference describes. It never tells you which one to choose.";

export const ABOUT_STEPS_TITLE = "What happens when you compare";
export const ABOUT_STEPS = [
  {
    key: "pick",
    title: "Pick",
    body: "Choose two or three stocks, or two or three funds. Search by name, or browse your watchlist, every sector, or the funds matched to your profile.",
  },
  {
    key: "line",
    title: "Line up",
    body: "Each figure gets one row with a column per pick, all over the same price window, so you read across instead of flicking between pages.",
  },
  {
    key: "mark",
    title: "Mark",
    body: "A line under each row says what it means. The row where the stocks differ most is tagged, and rows where they are nearly the same say so.",
  },
  {
    key: "explain",
    title: "Explain",
    body: "Ask for a written comparison and a short explanation is written for you from the figures on the page, then checked before you see it.",
  },
] as const;

export const ABOUT_EXAMPLE_TITLE = "Why it compares change, not price";
export const ABOUT_EXAMPLE_LABEL = "An illustration, not real stocks";
export const ABOUT_EXAMPLE_VIEWS = { price: "Share price", change: "Change" } as const;
/** Two made-up stocks over the same window: one cheap share, one expensive one. */
export const ABOUT_EXAMPLE_STOCKS = [
  { name: "Stock A", start: 40, end: 46 },
  { name: "Stock B", start: 800, end: 840 },
] as const;
export const ABOUT_EXAMPLE_PRICE_READ =
  "Stock B's share costs about 18 times as much, so its bar dwarfs Stock A's. That says nothing about how big either company is, or how far either price moved.";
export const ABOUT_EXAMPLE_CHANGE_READ =
  "Started from the same line, Stock A rose 15% and Stock B rose 5%. This is what the chart and the Change row show: how far each moved, whatever its price.";

export const ABOUT_MARKS_TITLE = "Reading the tags";
export const ABOUT_MARKS = [
  {
    kind: "differs",
    label: DIFFERS_MOST,
    body: "The one row with the biggest gap, measured against each figure's own scale, so 10 points of change and 10 points of RSI are not treated alike. It says where they differ, not which side is preferable.",
  },
  {
    kind: "alike",
    label: ALIKE,
    body: "The figures are within a hair of each other, such as 2 points of change. Worth knowing when you expected a difference.",
  },
  {
    kind: "alike",
    label: SAME,
    body: "Shared facts that match exactly, such as both stocks being in the same sector or on the same exchange.",
  },
] as const;

export const ABOUT_MEANS_TITLE = "What a comparison tells you";
export const ABOUT_MEANS_LABEL = "It tells you";
export const ABOUT_MEANS = [
  "Where these picks differ, on the same figures over the same window.",
  "What each gap describes, in a line under its row.",
  "Under Your analysis, where your own latest run placed each stock.",
];
export const ABOUT_NOT_MEANS_LABEL = "It doesn't tell you";
export const ABOUT_NOT_MEANS = [
  "That one is better, or a better buy.",
  "What any price will do next.",
  "Anything by its column order: that is the order you picked them in.",
];
export const ABOUT_PAST_NOTE =
  "Prices, tone and fund returns all describe the past. Two picks that moved together before can part ways.";

export const ABOUT_TRACE_TITLE = "The written comparison";
export const ABOUT_TRACE_BADGE = "Written for you";
export const ABOUT_TRACE_BODY =
  "Explain this comparison writes a short paragraph when you ask. For stocks it covers where their prices differ and why your latest analysis placed them where it did; for funds, how their fact sheets differ and why each one is or isn't among the funds matched to your profile. Before you see it, it is checked: every number in it has to appear in the figures on the page, and any verdict, advice or suitability wording fails the check. Fund matches come from fixed rules, not AI; the paragraph only explains them.";

export const ABOUT_WAYFINDING_TITLE = "Finding your way around";
export const ABOUT_WAYFINDING = [
  {
    key: "overview",
    title: TAB_OVERVIEW,
    body: "Each stock's latest price, the change chart over 1M to 5Y, and the measured rows: change, largest fall, volatility and RSI.",
  },
  {
    key: "tone",
    title: TAB_TONE,
    body: "What news and social posts said about each stock over the last 7 days, day by day. Tone is what people said, not what the price will do.",
  },
  {
    key: "yours",
    title: TAB_YOURS,
    body: "Each stock's place, signals and scorecard from your latest completed run. A stock that wasn't in it says so, and can go on your watchlist for the next one.",
  },
  {
    key: "funds",
    title: KIND_LABELS.funds,
    body: "What each fund is, its yearly cost on R10,000, its risk label and time horizon, past returns over the periods every fund reports, and what it holds.",
  },
  {
    key: "share",
    title: "Share it",
    body: "The comparison lives in the page's address, so a copied link opens it as you see it and Back undoes your last pick. Compare with… on any stock or fund page starts one for you.",
  },
] as const;

export const ABOUT_FOOTER =
  "Compare describes and explains; it doesn't advise. Nothing on this page is a suggestion to buy, sell or hold.";
export const ABOUT_DONE = "Got it";
