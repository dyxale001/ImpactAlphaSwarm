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

export const PICK_STOCK_PLACEHOLDER = "Add a stock";
export const PICK_FUND_PLACEHOLDER = "Add a fund";
export const PICK_FULL = "Three is the most this page lines up. Remove one to add another.";

export const START_TITLE_STOCKS = "Pick two stocks to start";
export const START_TITLE_FUNDS = "Pick two funds to start";
export const START_ONE_MORE = "Pick one more to start";
export const START_BODY_STOCKS =
  "Search any stock in AlphaSwarm's universes. You can line up as many as three, and the explanation appears once two are chosen.";
export const START_BODY_FUNDS =
  "Search the fund catalogue by name or JSE code. Funds in the same category compare most clearly, for example three trackers of the same index.";
export const FROM_WATCHLIST = "From your watchlist";

// ── stock sections and rows ────────────────────────────────────────────────

export const SECTION_OVERVIEW = "Overview";
export const SECTION_WINDOW = "Price over";
export const SECTION_TONE = "News and social tone · last 7 days";
export const SECTION_YOURS = "Your analysis";
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

export const YOURS_PLACE = "Place in your run";
export const YOURS_SIGNALS = "Signals";
export const YOURS_CONFIDENCE = "Confidence score";
export const YOURS_BETA = "Beta";
export const YOURS_SHARPE = "Sharpe ratio";
export const YOURS_NOT_IN_RUN = "Not in your latest analysis";
export const YOURS_NOT_IN_RUN_BODY =
  "Your latest run did not include this stock, so it has no place or scorecard. Its price and tone above still apply; nothing here is filled in from an older run.";
export const YOURS_NO_RUN =
  "You have no completed analysis yet, so there is no place or scorecard to compare. The price and tone above do not depend on one.";
export const WHY_TITLE = "Why your analysis places them differently";
export const WHY_BADGE = "From your run's numbers";
export const OWN_TRACE = "analysis, explained";

// ── the written comparison ─────────────────────────────────────────────────

export const TRACE_TITLE = "What separates these";
export const TRACE_DISCLOSURE =
  "Written from the figures in the price rows below and each stock's stored measurements only, then checked: every number in it appears in those figures, and verdict or advice words fail it. It describes past price behaviour; it does not rank, predict or advise.";
export const TRACE_EMPTY = "No written comparison for these yet. The rows below still explain each difference.";

export const ASK_ABOUT_THIS = "Ask AlphaSwarm about this";
export const askPrompt = (tickers: string[]) =>
  tickers.length === 2
    ? `Compare ${tickers[0]} and ${tickers[1]}`
    : `Compare ${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}`;

export const CHART_TITLE = "Price, with every stock starting at 100";
export const CHART_NOTE =
  "Rebased so a different share price does not hide the shape of each move: 110 means 10% above where that stock started the window. Past movement only.";

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
export const FUND_TRACE_BADGE = "From template";
export const FUND_TRACE_DISCLOSURE =
  "Built from the fact sheets on each fund's page by a fixed template, with no AI.";
export const FUNDS_DISCLAIMER =
  "Figures are transcribed from each manager's published fact sheet. AlphaSwarm is not a licensed financial services provider and does not advise; the order of the columns is the order you picked them in.";
