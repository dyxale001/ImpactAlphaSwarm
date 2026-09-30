import { describe, expect, it } from "vitest";
import { filingAge } from "./whaleFormat";

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
