import { describe, expect, it } from "vitest";
import {
  formatAxisDate,
  formatChange,
  formatDrawdown,
  formatFullDate,
  formatNumber,
  formatPrice,
  priceDomain,
  rsiNote,
} from "./quantSeries";
import { percentileReading } from "../../data/quantExplainers";

describe("formatPrice", () => {
  it("uses the listing currency's own symbol", () => {
    expect(formatPrice(182.4, "USD")).toBe("$182.40");
    expect(formatPrice(182.4, "ZAR")).toBe("R 182.40");
  });

  it("drops the cents once a price is in the thousands, and groups them", () => {
    expect(formatPrice(1250.55, "USD")).toBe("$1,251");
    expect(formatPrice(1234567.8, "USD")).toBe("$1,234,568");
  });

  it("prints an unknown code after the number rather than guessing a symbol", () => {
    expect(formatPrice(12.5, "ZAc")).toBe("12.50 ZAC");
  });

  it("shows a placeholder for a missing value", () => {
    expect(formatPrice(null, "USD")).toBe("—");
    expect(formatPrice(undefined, "")).toBe("—");
  });

  it("copes with no currency at all", () => {
    expect(formatPrice(3.5, "")).toBe("3.50");
  });

  it("carries a proper minus for a negative number", () => {
    expect(formatNumber(-1234.5, 1)).toBe("−1,234.5");
  });
});

describe("formatChange", () => {
  it("signs a gain and a loss explicitly", () => {
    expect(formatChange(12.44)).toBe("+12.4%");
    expect(formatChange(-3.06)).toBe("−3.1%");
  });

  it("does not sign zero", () => {
    expect(formatChange(0.04)).toBe("0.0%");
  });

  it("placeholders a missing change", () => {
    expect(formatChange(null)).toBe("—");
  });
});

describe("formatDrawdown", () => {
  it("is never positive", () => {
    expect(formatDrawdown(-25)).toBe("−25.0%");
    expect(formatDrawdown(25)).toBe("−25.0%");
    expect(formatDrawdown(0)).toBe("0.0%");
  });
});

describe("axis dates", () => {
  it("dates a month, names a month for six months and years the long horizons", () => {
    expect(formatAxisDate("2026-08-26", "1M")).toBe("26 Aug");
    expect(formatAxisDate("2026-08-26", "6M")).toBe("Aug");
    expect(formatAxisDate("2024-08-26", "3Y")).toBe("Aug 24");
    expect(formatAxisDate("2021-09-09", "5Y")).toBe("Sep 21");
  });

  it("does not go through the machine's clock or locale at all", () => {
    // Parsed as an instant and formatted back, this shifts a day west of Greenwich and
    // September comes out as "Sept" on some ICU builds. Taken apart as text, neither.
    expect(formatAxisDate("2026-03-01", "1M")).toBe("1 Mar");
    expect(formatAxisDate("2026-09-09", "1M")).toBe("9 Sep");
  });

  it("gives the tooltip a full date", () => {
    expect(formatFullDate("2026-08-26")).toBe("26 Aug 2026");
  });

  it("passes a malformed key through untouched", () => {
    expect(formatAxisDate("not-a-date", "1M")).toBe("not-a-date");
  });
});

describe("priceDomain", () => {
  it("pads the series' own range rather than anchoring at zero", () => {
    const [lo, hi] = priceDomain([180, 195, 190]);
    expect(lo).toBeLessThan(180);
    expect(lo).toBeGreaterThan(170);
    expect(hi).toBeGreaterThan(195);
    expect(hi).toBeLessThan(205);
  });

  it("still opens up a flat series", () => {
    const [lo, hi] = priceDomain([100, 100, 100]);
    expect(hi).toBeGreaterThan(lo);
  });

  it("has a sane answer for nothing", () => {
    expect(priceDomain([])).toEqual([0, 1]);
  });
});

describe("rsiNote", () => {
  it("names the line a day sat past, and nothing in between", () => {
    expect(rsiNote(75)).toMatch(/overbought/);
    expect(rsiNote(22)).toMatch(/oversold/);
    expect(rsiNote(50)).toBeNull();
    expect(rsiNote(null)).toBeNull();
  });
});

describe("percentileReading (D-122)", () => {
  it("says which way is which for each row", () => {
    expect(percentileReading("stability", 82)).toMatch(/steadier price than about 8 in 10/);
    expect(percentileReading("stability", 18)).toMatch(/jumpier price than about 8 in 10/);
    expect(percentileReading("momentum", 75)).toMatch(/stronger trend/);
    expect(percentileReading("risk_adjusted_return", 30)).toMatch(/less return per unit/);
  });

  it("does not turn the middle of the pack into a claim", () => {
    expect(percentileReading("momentum", 50)).toMatch(/middle/);
    expect(percentileReading("momentum", 44)).toMatch(/middle/);
    expect(percentileReading("momentum", 61)).toMatch(/middle/);
  });

  it("names the extremes as nearly everyone", () => {
    expect(percentileReading("stability", 96)).toMatch(/nearly every other asset/);
    expect(percentileReading("stability", 3)).toMatch(/nearly every other asset/);
  });

  it("never uses advice words", () => {
    for (const p of [3, 18, 50, 82, 96]) {
      for (const key of ["momentum", "risk_adjusted_return", "stability"] as const) {
        expect(percentileReading(key, p)).not.toMatch(/\b(buy|sell|hold|should|better|worse|good|bad)\b/i);
      }
    }
  });
});
