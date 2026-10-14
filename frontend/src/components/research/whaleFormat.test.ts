import { describe, expect, it } from "vitest";
import {
  dealingFigures,
  filingAge,
  formatPct,
  formatUsd,
  isOpenMarket,
  topTenIn,
} from "./whaleFormat";

describe("topTenIn", () => {
  it("says the count is only where the fund is a top 10 holder", () => {
    expect(topTenIn(96)).toBe("Top 10 holder in 96 companies");
    expect(topTenIn(1)).toBe("Top 10 holder in 1 company");
  });
});

describe("formatUsd", () => {
  it("reaches trillions, so a fund total never reads $3393.4B", () => {
    expect(formatUsd(3_393_400_000_000)).toBe("$3.4T");
    expect(formatUsd(445_243_045_171)).toBe("$445.2B");
    expect(formatUsd(2_600_000)).toBe("$2.6M");
    expect(formatUsd(450_000)).toBe("$450K");
    expect(formatUsd(null)).toBe("—");
  });
});

describe("formatPct", () => {
  it("reads the endpoints' fractions as percentages", () => {
    expect(formatPct(0.6632)).toBe("66.3%");
    expect(formatPct(0.0797)).toBe("8.0%");
    expect(formatPct(null)).toBe("—");
  });
});

describe("isOpenMarket", () => {
  it("is true only for open-market purchases and sales", () => {
    expect(isOpenMarket("P")).toBe(true);
    expect(isOpenMarket(" s ")).toBe(true);
    for (const code of ["A", "M", "F", "G", "D", "C", null, undefined]) {
      expect(isOpenMarket(code)).toBe(false);
    }
  });
});

describe("filingAge", () => {
  const now = new Date("2026-09-30T12:00:00Z");

  it("says how many months ago a filing was", () => {
    expect(filingAge("2026-06-30", now)).toBe("about 3 months ago");
    expect(filingAge("2026-08-28", now)).toBe("about a month ago");
    expect(filingAge("2026-09-20", now)).toBe("less than a month ago");
  });

  it("says nothing for a missing or unreadable date", () => {
    expect(filingAge(null, now)).toBeNull();
    expect(filingAge("not a date", now)).toBeNull();
  });
});

describe("dealingFigures", () => {
  const deal = (code: string) => ({ transaction_code: code });

  it("counts each kind, with singular and plural wording", () => {
    expect(dealingFigures([deal("P"), deal("S"), deal("S"), deal("F")])).toBe(
      "1 open-market purchase · 2 open-market sales · 1 routine entry",
    );
    expect(dealingFigures([deal("P"), deal("P"), deal("A"), deal("M")])).toBe(
      "2 open-market purchases · no open-market sales · 2 routine entries",
    );
  });

  it("says none rather than zero, and leaves out routine when there is none", () => {
    expect(dealingFigures([deal("S")])).toBe(
      "No open-market purchases · 1 open-market sale",
    );
  });

  it("treats a missing code as routine, like the backend", () => {
    expect(dealingFigures([{ transaction_code: null }])).toBe(
      "No open-market purchases · no open-market sales · 1 routine entry",
    );
  });
});
