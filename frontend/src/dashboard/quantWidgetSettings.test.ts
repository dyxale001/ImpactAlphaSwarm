import { describe, it, expect } from "vitest";
import { readHorizon } from "./quantWidgetSettings";
import { DEFAULT_QUANT_HORIZON } from "../data/quantExplainers";

describe("readHorizon", () => {
  it("reads a stored horizon", () => {
    expect(readHorizon({ horizon: "1M" })).toBe("1M");
    expect(readHorizon({ horizon: "5Y" })).toBe("5Y");
  });

  it("is forgiving about case and padding, since the column is hand-editable", () => {
    expect(readHorizon({ horizon: " 3y " })).toBe("3Y");
  });

  it("falls back to the default for nothing, junk or a horizon this build does not offer", () => {
    expect(readHorizon(undefined)).toBe(DEFAULT_QUANT_HORIZON);
    expect(readHorizon({})).toBe(DEFAULT_QUANT_HORIZON);
    expect(readHorizon({ horizon: 6 })).toBe(DEFAULT_QUANT_HORIZON);
    expect(readHorizon({ horizon: "2W" })).toBe(DEFAULT_QUANT_HORIZON);
  });

  it("ignores the ticker and anything else stored beside it", () => {
    expect(readHorizon({ ticker: "NVDA", horizon: "1M", sort: "x" })).toBe("1M");
  });
});
