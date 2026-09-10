// Pure helpers for the Quant tab's historical chart: formatting the window's numbers
// and dates for a reader. No React, no fetching, so every one of them is testable on
// its own and the chart component can stay about layout.

import type { QuantHorizon } from "../../data/quantExplainers";

// A close in the asset's own listing currency, e.g. "$182.40" or "R 1,250.00".
//
// A small symbol map rather than Intl's currency formatter, for two reasons. Intl
// accepts any three letters as a code and prints the ones it does not know as a prefix
// ("ZAC 12.50" for the rand-cents code some JSE lines carry), so a wrong-looking answer
// is indistinguishable from a right one; and its output differs between ICU builds,
// which is a test that passes on one machine and fails on the next. Unknown codes are
// printed after the number, as themselves, which is honest where a guessed symbol is not.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  ZAR: "R ",
  EUR: "€",
  GBP: "£",
};

export function formatPrice(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const code = (currency || "").toUpperCase();
  const digits = Math.abs(value) >= 1000 ? 0 : 2;
  const plain = formatNumber(value, digits);
  const symbol = CURRENCY_SYMBOLS[code];
  if (symbol) return `${symbol}${plain}`;
  return code ? `${plain} ${code}` : plain;
}

// Dot decimals and comma thousands, the way the rest of the app prints prices, done by
// hand so the answer does not depend on the machine's locale data.
export function formatNumber(value: number, digits: number): string {
  const fixed = Math.abs(value).toFixed(digits);
  const [whole, frac] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = value < 0 ? "−" : "";
  return frac ? `${sign}${grouped}.${frac}` : `${sign}${grouped}`;
}

// "+12.4%" / "−3.1%" / "0.0%". A proper minus sign, and an explicit plus so a gain and
// a loss read differently at a glance without colouring either.
export function formatChange(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "—";
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return "0.0%";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded).toFixed(1)}%`;
}

// "−25.0%" for a fall; a drawdown is never positive, so no plus sign is ever shown.
export function formatDrawdown(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "—";
  const rounded = Math.round(Math.abs(pct) * 10) / 10;
  return rounded === 0 ? "0.0%" : `−${rounded.toFixed(1)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A YYYY-MM-DD key taken apart without going through Date at all. The keys are plain
// calendar labels; parsing them as instants and formatting them back through the
// machine's locale is where "Sept" for September and off-by-a-day west of Greenwich
// both come from.
function parts(date: string): { day: number; month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(m[1]), month, day: Number(m[3]) };
}

// The x-axis tick for a day, scaled to the horizon: a month's axis is dated, a
// five-year axis is yearly.
export function formatAxisDate(date: string, horizon: QuantHorizon): string {
  const p = parts(date);
  if (!p) return date;
  const month = MONTHS[p.month - 1];
  switch (horizon) {
    case "1M":
      return `${p.day} ${month}`;
    case "6M":
      return month;
    default:
      return `${month} ${String(p.year).slice(-2)}`;
  }
}

// The full date for a tooltip or the strip: "26 Aug 2026".
export function formatFullDate(date: string): string {
  const p = parts(date);
  if (!p) return date;
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

// The price axis runs from the series' own low to its own high with a little air, not
// from zero. A share trading between 180 and 195 shows nothing zero-anchored. That also
// exaggerates movement, which is exactly how a price chart misleads, so the strip above
// states the percentage change and the caller says so under the chart.
export function priceDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low) * 0.08 || Math.abs(high) * 0.02 || 1;
  return [low - pad, high + pad];
}

// The RSI threshold a day sat past, for the tooltip. Same 30/70 as RsiBand.
export function rsiNote(rsi: number | null | undefined): string | null {
  if (rsi === null || rsi === undefined || Number.isNaN(rsi)) return null;
  if (rsi > 70) return "past 70, the conventional overbought line";
  if (rsi < 30) return "under 30, the conventional oversold line";
  return null;
}
