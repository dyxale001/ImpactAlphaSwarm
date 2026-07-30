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
