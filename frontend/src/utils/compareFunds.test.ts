import { describe, expect, it } from "vitest";
import {
  commonPeriods,
  costRange,
  fundDiffersMost,
  fundsSummary,
  daysApart,
  normaliseHolding,
  partialPeriods,
  sharedHoldings,
  yearlyCost,
} from "./compareFunds";

describe("commonPeriods", () => {
  it("keeps only the periods every fund reports, never inception", () => {
    const perfs = [
      { "1y": 18.1, "3y": 14.6, "5y": 12, inception: 11 },
      { "1y": 18.3, "3y": 14.8, inception: 9 },
    ];
    expect(commonPeriods(perfs)).toEqual(["1y", "3y"]);
    expect(partialPeriods(perfs)).toEqual(["5y"]);
  });

  it("leaves nothing when a fund has no table", () => {
    expect(commonPeriods([{ "1y": 1 }, null])).toEqual([]);
  });
});

describe("daysApart", () => {
  it("measures the oldest against the newest sheet", () => {
    expect(daysApart(["2026-08-31", "2026-06-30", "2026-08-31"])).toBe(62);
  });
  it("is unknown when a date is missing", () => {
    expect(daysApart(["2026-08-31", null])).toBeNull();
  });
});

describe("yearlyCost", () => {
  it("is one year on R10,000 with no growth", () => {
    expect(yearlyCost(0.35)).toBe(35);
    expect(yearlyCost(1.37)).toBe(137);
    expect(yearlyCost(0.08)).toBe(8);
  });
  it("refuses a missing figure", () => {
    expect(yearlyCost(null)).toBeNull();
  });
});

describe("holdings", () => {
  it("treats one company's names on different sheets as one", () => {
    expect(normaliseHolding("APPLE INC.")).toBe(normaliseHolding("Apple Inc"));
    expect(normaliseHolding("Alphabet Inc Class A")).toBe("alphabet");
    expect(normaliseHolding("Naspers Ltd (N)")).toBe("naspers");
  });

  it("counts what every fund's top list shares", () => {
    const shared = sharedHoldings([
      { "NVIDIA Corp": 7.1, "Microsoft Corp": 6.5, "Apple Inc": 6.2 },
      { NVIDIA: 7, "MICROSOFT CORP.": 6.4, "Amazon.com Inc": 3.9, "Apple Inc.": 6 },
    ]);
    expect(shared).toEqual({ shared: 3, of: 3 });
  });

  it("counts against the shortest list and needs every fund to hold it", () => {
    const shared = sharedHoldings([
      { Naspers: 15, "FirstRand Ltd": 6, "Anglo American plc": 5 },
      { "NASPERS LTD": 14, "Standard Bank Group": 5, "Anglo American": 4, "MTN Group": 3 },
      { Naspers: 13, "Anglo American PLC": 4, Sasol: 2 },
    ]);
    expect(shared).toEqual({ shared: 2, of: 3 });
  });

  it("is unknown rather than zero when a list was never transcribed", () => {
    expect(sharedHoldings([{ A: 1 }, null])).toBeNull();
  });
});

describe("costRange", () => {
  it("spans the cheapest and dearest", () => {
    expect(costRange([0.35, 0.2, 0.08])).toEqual({ low: 0.08, high: 0.35 });
  });
  it("is unknown when one fund has no cost", () => {
    expect(costRange([0.35, null])).toBeNull();
  });
});

describe("fundsSummary", () => {
  const tracker = (code: string, ter: number, asOf = "2026-08-31") => ({
    code,
    benchmark: "S&P 500",
    indexTracker: true,
    category: "Global - Equity - Unclassified",
    riskLevel: 4,
    ter,
    performance: { "1y": 18 },
    asOf,
  });

  it("says what is the same, then what differs", () => {
    const text = fundsSummary(
      [tracker("STX500", 0.35), tracker("SYG500", 0.2), tracker("CSP500", 0.08, "2026-06-30")],
      { shared: 10, of: 10 },
    )!;
    expect(text).toContain("All three track the same index, S&P 500.");
    expect(text).toContain("Their largest holdings are the same companies");
    expect(text).toContain("risk rating of 4 out of 5");
    expect(text).toContain("from 0.08% to 0.35%, which on R10,000 is R8 to R35 a year");
    expect(text).toContain("62 days apart");
  });

  it("never ranks the funds", () => {
    const text = fundsSummary([tracker("A", 0.35), tracker("B", 0.08)], null)!.toLowerCase();
    for (const word of ["better", "best", "cheapest", "should", "recommend"]) {
      expect(text).not.toContain(word);
    }
  });

  it("falls back to the category when the funds do not track one index", () => {
    const active = { ...tracker("A", 1.2), indexTracker: false, benchmark: "CPI + 3%" };
    const text = fundsSummary([active, { ...active, code: "B", benchmark: "CPI + 5%" }], null)!;
    expect(text).toContain("Both sit in the same ASISA category");
  });

  it("marks cost as what differs most for same-index trackers", () => {
    expect(fundDiffersMost([tracker("A", 0.35), tracker("B", 0.08)])).toBe("ter");
    expect(fundDiffersMost([tracker("A", 0.35), tracker("B", 0.34)])).toBeNull();
  });
});
