import { describe, expect, it } from "vitest";
import { dealingFigures, filingAge } from "./whaleFormat";

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
