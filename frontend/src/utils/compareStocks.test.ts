import { describe, expect, it } from "vitest";
import type { QuantWindowFacts, SentimentHistoryPoint } from "../services/api/analysis";
import {
  differsMost,
  explainPlacement,
  hasNewsHistory,
  isAlike,
  leanWord,
  ordinal,
  changeSeries,
  toneRows,
  weekTone,
  type RunReading,
} from "./compareStocks";

function facts(overrides: Partial<QuantWindowFacts> = {}): QuantWindowFacts {
  return {
    start: "2026-04-07",
    end: "2026-10-06",
    trading_days: 126,
    first_close: 100,
    last_close: 112.4,
    change_pct: 12.4,
    high: 113,
    high_date: "2026-10-02",
    low: 95,
    low_date: "2026-06-11",
    max_drawdown_pct: -9.8,
    volatility_pct: 24,
    latest_rsi: 66,
    rsi_days_measured: 126,
    days_rsi_overbought: 9,
    days_rsi_oversold: 0,
    ...overrides,
  };
}

function reading(overrides: Partial<RunReading> = {}): RunReading {
  return {
    ticker: "AAPL",
    rank: 2,
    confidenceScore: null,
    convergenceState: "agree_strongly",
    signalStrength: 0.6,
    quantLean: 0.4,
    sentLean: 0.5,
    profileFit: 1,
    dataSufficiency: 1,
    momentumPctile: 84,
    riskAdjPctile: 70,
    stabilityPctile: 60,
    beta: 1.18,
    betaBand: "market",
    sharpe: 0.9,
    reasoningTrace: null,
    ...overrides,
  };
}

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [22, "22nd"],
  ])("%i is %s", (n, text) => expect(ordinal(n)).toBe(text));
});

describe("leanWord", () => {
  it("calls a small lean neutral rather than claiming a direction", () => {
    expect(leanWord(0.05)).toBe("were close to neutral");
    expect(leanWord(-0.1)).toBe("were close to neutral");
  });
  it("names a clear lean", () => {
    expect(leanWord(0.4)).toBe("leaned favourable");
    expect(leanWord(-0.4)).toBe("leaned unfavourable");
  });
  it("says when there was nothing", () => expect(leanWord(null)).toBe("had no reading"));
});

describe("explainPlacement", () => {
  const aapl = reading();
  const googl = reading({
    ticker: "GOOGL",
    rank: 7,
    convergenceState: "conflict",
    quantLean: -0.4,
    sentLean: 0.4,
  });

  it("answers the RSI question and keeps the order the user picked", () => {
    const text = explainPlacement([googl, aapl], 12)!.join(" ");
    expect(text).toContain("Your latest analysis placed GOOGL 7th and AAPL 2nd of 12 stocks.");
    expect(text).toContain("For GOOGL, the price measurements leaned unfavourable and the tone leaned favourable, so its signals conflict.");
    expect(text).toContain("RSI is not used to place stocks at all");
  });

  it("never names a winner", () => {
    const text = explainPlacement([aapl, googl], 12)!.join(" ").toLowerCase();
    for (const word of ["better", "best", "worse", "should", "recommend", "winner"]) {
      expect(text).not.toContain(word);
    }
  });

  it("is silent when fewer than two stocks are in the run", () => {
    expect(explainPlacement([aapl, reading({ ticker: "MSFT", rank: null })], 12)).toBeNull();
  });

  it("mentions profile fit only when it splits the stocks", () => {
    const tight = explainPlacement([aapl, { ...googl, profileFit: 0.8 }], 12)!.join(" ");
    expect(tight).toContain("GOOGL moved around more than the risk preference you set");
    const both = explainPlacement([{ ...aapl, profileFit: 0.8 }, { ...googl, profileFit: 0.8 }], 12)!.join(" ");
    expect(both).not.toContain("risk preference you set");
  });

  it("still places the stocks without scorecard terms", () => {
    const legacy = [aapl, googl].map((r) => ({ ...r, convergenceState: null }));
    const text = explainPlacement(legacy, null)!;
    expect(text[0]).toBe("Your latest analysis placed AAPL 2nd and GOOGL 7th.");
    expect(text.join(" ")).not.toContain("For AAPL");
  });
});

describe("differsMost and isAlike", () => {
  it("picks the row with the largest gap for its scale", () => {
    const a = facts({ change_pct: 12.4, latest_rsi: 66, max_drawdown_pct: -9.8, volatility_pct: 24 });
    const b = facts({ change_pct: -3.1, latest_rsi: 37, max_drawdown_pct: -14.2, volatility_pct: 29 });
    // RSI: 29/30 ≈ 0.97 against change 15.5/20 ≈ 0.78.
    expect(differsMost([a, b])).toBe("rsi");
  });

  it("returns nothing when the stocks are close everywhere", () => {
    expect(differsMost([facts(), facts({ change_pct: 13 })])).toBeNull();
  });

  it("returns nothing while a window is missing", () => {
    expect(differsMost([facts(), null])).toBeNull();
  });

  it("calls values within the row's tolerance alike", () => {
    expect(isAlike("rsi", [facts({ latest_rsi: 50 }), facts({ latest_rsi: 54 })])).toBe(true);
    expect(isAlike("rsi", [facts({ latest_rsi: 50 }), facts({ latest_rsi: 60 })])).toBe(false);
  });
});

describe("weekTone", () => {
  const day = (overrides: Partial<SentimentHistoryPoint>): SentimentHistoryPoint => ({
    date: "2026-10-01",
    score: null,
    post_count: 0,
    bullish: 0,
    bearish: 0,
    top_posts: [],
    summary: null,
    ...overrides,
  });

  it("weights each day by how much was said", () => {
    const tone = weekTone([
      day({ score: 80, post_count: 2 }),
      day({ score: 40, post_count: 198, news_score: 60, news_count: 4 }),
      day({ score: null, post_count: 0, news_score: null, news_count: 0 }),
    ]);
    expect(tone.socialScore).toBeCloseTo(40.4, 1);
    expect(tone.posts).toBe(200);
    expect(tone.newsScore).toBe(60);
    expect(tone.articles).toBe(4);
    expect(tone.hasNews).toBe(true);
  });

  it("knows when news history is switched off", () => {
    const tone = weekTone([day({ score: 50, post_count: 3 })]);
    expect(tone.hasNews).toBe(false);
    expect(tone.newsScore).toBeNull();
  });
});

describe("toneRows", () => {
  const day = (date: string, overrides: Partial<SentimentHistoryPoint> = {}): SentimentHistoryPoint => ({
    date,
    score: null,
    post_count: 0,
    bullish: 0,
    bearish: 0,
    top_posts: [],
    summary: null,
    ...overrides,
  });

  const series = [
    { ticker: "AAPL", points: [day("2026-10-02", { score: 64, news_score: 58 }), day("2026-10-01", { score: 61 })] },
    { ticker: "GOOGL", points: [day("2026-10-01", { score: 40, news_score: null }), day("2026-10-03", { score: 45 })] },
  ];

  it("lines every day up oldest first, with a gap where a stock had nothing", () => {
    expect(toneRows(series, "social")).toEqual([
      { date: "2026-10-01", AAPL: 61, GOOGL: 40 },
      { date: "2026-10-02", AAPL: 64, GOOGL: null },
      { date: "2026-10-03", AAPL: null, GOOGL: 45 },
    ]);
  });

  it("reads the news score for news, and a missing field as a gap, never a zero", () => {
    expect(toneRows(series, "news")).toEqual([
      { date: "2026-10-01", AAPL: null, GOOGL: null },
      { date: "2026-10-02", AAPL: 58, GOOGL: null },
      { date: "2026-10-03", AAPL: null, GOOGL: null },
    ]);
  });

  it("knows whether any stock carries news history", () => {
    expect(hasNewsHistory(series)).toBe(true);
    expect(hasNewsHistory([{ points: [day("2026-10-01", { score: 50 })] }])).toBe(false);
  });
});

describe("changeSeries", () => {
  it("starts every stock at 0% and merges by date", () => {
    const rows = changeSeries([
      { ticker: "AAPL", points: [{ date: "2026-01-02", close: 200 }, { date: "2026-01-03", close: 220 }] },
      { ticker: "GOOGL", points: [{ date: "2026-01-03", close: 50 }, { date: "2026-01-02", close: 40 }] },
    ]);
    expect(rows).toEqual([
      { date: "2026-01-02", AAPL: 0, GOOGL: -20 },
      { date: "2026-01-03", AAPL: 10, GOOGL: 0 },
    ]);
  });

  it("leaves a gap where one listing has no close", () => {
    const rows = changeSeries([
      { ticker: "A", points: [{ date: "d1", close: 10 }, { date: "d2", close: 11 }] },
      { ticker: "B", points: [{ date: "d1", close: 5 }] },
    ]);
    expect(rows[1]).toEqual({ date: "d2", A: 10 });
  });
});
