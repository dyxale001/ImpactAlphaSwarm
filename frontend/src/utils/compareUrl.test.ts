import { describe, expect, it } from "vitest";
import {
  buildCompareParams,
  cleanIds,
  compareHref,
  parseCompareParams,
} from "./compareUrl";

describe("parseCompareParams", () => {
  it("reads stocks, upper-cased, in the order given", () => {
    const state = parseCompareParams(new URLSearchParams("kind=stocks&ids=googl,aapl&h=1m"));
    expect(state).toEqual({ kind: "stocks", ids: ["GOOGL", "AAPL"], horizon: "1M" });
  });

  it("defaults to stocks over six months when the link says nothing", () => {
    expect(parseCompareParams(new URLSearchParams(""))).toEqual({
      kind: "stocks",
      ids: [],
      horizon: "6M",
    });
  });

  it("drops junk, duplicates and anything past three", () => {
    const state = parseCompareParams(
      new URLSearchParams("ids=AAPL,aapl,<script>,MSFT,NVDA,TSLA&h=2W"),
    );
    expect(state.ids).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(state.horizon).toBe("6M");
  });

  it("keeps fund ids as they are", () => {
    const id = "8c1f2d34-aaaa-4bbb-8ccc-1234567890ab";
    expect(parseCompareParams(new URLSearchParams(`kind=funds&ids=${id}`)).ids).toEqual([id]);
  });
});

describe("buildCompareParams", () => {
  it("round-trips and leaves the default horizon out", () => {
    const params = buildCompareParams({ kind: "stocks", ids: ["AAPL", "GOOGL"], horizon: "6M" });
    expect(params.toString()).toBe("kind=stocks&ids=AAPL%2CGOOGL");
    expect(parseCompareParams(params).ids).toEqual(["AAPL", "GOOGL"]);
  });

  it("never writes a horizon for funds", () => {
    const params = buildCompareParams({ kind: "funds", ids: ["a"], horizon: "5Y" });
    expect(params.has("h")).toBe(false);
  });
});

describe("compareHref", () => {
  it("opens the page with one stock already in place", () => {
    expect(compareHref("stocks", ["aapl"])).toBe("/compare?kind=stocks&ids=AAPL");
  });

  it("cleans what it is handed", () => {
    expect(cleanIds(["", " msft "], "stocks")).toEqual(["MSFT"]);
  });
});
