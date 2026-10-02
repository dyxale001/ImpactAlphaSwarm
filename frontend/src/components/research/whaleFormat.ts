// Formatting shared by the whale-watching views. Extracted when the landing
// page started showing the same insider rows as the per-company panel, so the
// two cannot drift on how a dollar value or an insider name is rendered.

export function formatUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatShares(shares: number): string {
  return shares.toLocaleString("en-US");
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

// SEC transaction codes (Finnhub `transactionCode`). The nature of the trade is
// what explains the missing dollar values, and why a huge "sell" is often not a
// decision to sell: only open-market trades settle at a market price. Grants,
// option exercises and tax withholding do not.
export const TXN_NATURE: Record<string, string> = {
  P: "Open market",
  S: "Open market",
  A: "Grant",
  M: "Options",
  X: "Options",
  F: "Tax withholding",
  G: "Gift",
  D: "Sale to issuer",
  C: "Conversion",
};

export function txnNature(code?: string | null): string | null {
  if (!code) return null;
  return TXN_NATURE[code.trim().toUpperCase()] ?? null;
}

// Plain-language definitions surfaced alongside the labels so a non-expert user
// understands what each transaction type means, and why only some carry a
// dollar value.
export const NATURE_DEFS: Record<string, string> = {
  "Open market":
    "A trade on the public market at the going price, where the insider chose to buy or sell with their own money. The clearest read on conviction.",
  Grant:
    "Shares awarded as compensation (e.g. RSUs), not bought on the market, so there is no purchase price.",
  Options:
    "Shares acquired by exercising stock options, or the related settlement. Not an open-market purchase.",
  "Tax withholding":
    "Shares the company held back to cover taxes owed when equity awards vested. Routine, not a sell decision.",
  Gift: "Shares given away or received as a gift, so no money changes hands.",
  "Sale to issuer":
    "Shares sold back directly to the company rather than on the open market.",
  Conversion:
    "Shares obtained by converting another security (e.g. a derivative) into common stock.",
};

// How many distinct insiders must have bought on the open market inside the
// window before it counts as a cluster. One insider buying is a person; several
// buying at once is a pattern.
export const CLUSTER_MIN_BUYERS = 2;
export const CLUSTER_WINDOW_DAYS = 30;

interface ClusterCandidate {
  name: string;
  transaction_code?: string | null;
  transaction_date?: string | null;
  filing_date?: string | null;
}

/**
 * Count the distinct insiders who bought on the open market recently.
 *
 * SEC code P only: a grant, an option exercise or a tax withholding is not a
 * decision to buy, so counting them would turn routine compensation admin into
 * a conviction signal. Dated off the transaction where there is one, since the
 * filing can lag it by days.
 *
 * Shared by the per-company insider panel and the dashboard's cluster widget so
 * the two cannot disagree about what a cluster is.
 */
export function clusterBuyerCount(
  transactions: ClusterCandidate[],
  now: number = Date.now(),
): number {
  const windowMs = CLUSTER_WINDOW_DAYS * 86_400_000;
  const buyers = new Set<string>();

  for (const t of transactions) {
    if ((t.transaction_code || "").trim().toUpperCase() !== "P") continue;
    const when = new Date(t.transaction_date || t.filing_date || "");
    if (Number.isNaN(when.getTime())) continue;
    if (now - when.getTime() > windowMs) continue;
    buyers.add(t.name.trim().toUpperCase());
  }

  return buyers.size;
}

// Finnhub returns insider names upper-cased and in "LAST FIRST" order. Title-case
// them and tidy initials/suffixes; leave the token order as-is (we cannot
// reliably tell how many leading tokens are the surname).
export function formatName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      if (w === "jr" || w === "jr.") return "Jr.";
      if (w === "sr" || w === "sr.") return "Sr.";
      if (["ii", "iii", "iv", "v"].includes(w)) return w.toUpperCase();
      if (w.replace(".", "").length === 1) return `${w.charAt(0).toUpperCase()}.`;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// How long ago the filing was, worked out here rather than written into the trace. A
// trace that said "three months ago" would be wrong a month later and need rewriting;
// the date in the trace never goes stale, and this label costs no model call.
export function filingAge(asOf: string | null, now: Date = new Date()): string | null {
  if (!asOf) return null;
  const then = new Date(asOf);
  if (Number.isNaN(then.getTime())) return null;
  const months = Math.round((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (months < 1) return "less than a month ago";
  if (months === 1) return "about a month ago";
  return `about ${months} months ago`;
}

// The AI summary box's figures line for the Insider trading tab: how many dealings of
// each kind the note was written from. Counted from the same SEC codes the backend uses
// (P a purchase, S a sale, anything else routine pay admin), so the line and the note
// cannot disagree. Every count is worded: none, one, several.
export function dealingFigures(
  transactions: { transaction_code?: string | null }[],
): string {
  let purchases = 0;
  let sales = 0;
  let routine = 0;
  for (const t of transactions) {
    const code = (t.transaction_code || "").trim().toUpperCase();
    if (code === "P") purchases += 1;
    else if (code === "S") sales += 1;
    else routine += 1;
  }
  const count = (n: number, one: string, many: string) =>
    n === 0 ? `no ${many}` : `${n} ${n === 1 ? one : many}`;
  const parts = [
    count(purchases, "open-market purchase", "open-market purchases"),
    count(sales, "open-market sale", "open-market sales"),
  ];
  if (routine > 0) parts.push(count(routine, "routine entry", "routine entries"));
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
