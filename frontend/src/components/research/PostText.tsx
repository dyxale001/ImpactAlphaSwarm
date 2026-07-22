// Renders StockTwits post text scoped to the asset being viewed:
//   * cashtags for the selected ticker (e.g. $NPN or $NPN.JO) are kept and bolded
//   * cashtags for any other ticker are stripped out entirely, so a multi-ticker
//     spam post reads as if it only mentioned the asset on this page
// News headlines are edited copy and go through untouched, so this is only used
// for social posts.

const CASHTAG_RE = /\$[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]{1,4})?/g;

function isSelectedTicker(cashtag: string, ticker: string): boolean {
  // Compare on the base symbol so $NPN and $NPN.JO both count as the
  // selected ticker when viewing NPN.
  const base = cashtag.slice(1).split(".")[0].toUpperCase();
  return base === ticker.toUpperCase();
}

// Strip cashtags that do not belong to the selected ticker, then tidy the
// whitespace and punctuation gaps the removal leaves behind.
export function cleanPostText(text: string, ticker?: string): string {
  if (!text) return text;
  return text
    .replace(CASHTAG_RE, (tag) =>
      ticker && isSelectedTicker(tag, ticker) ? tag : "",
    )
    .replace(/\s+([,.;:!?)\]])/g, "$1")
    .replace(/([([])\s+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export default function PostText({
  text,
  ticker,
}: {
  text?: string;
  ticker?: string;
}) {
  const cleaned = cleanPostText(text ?? "", ticker);
  if (!cleaned) return <>—</>;

  // After cleaning, any cashtag still present is the selected ticker; split on
  // cashtags (keeping them via the capture group) and bold those segments.
  const parts = cleaned.split(
    /(\$[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]{1,4})?)/g,
  );
  return (
    <>
      {/* split() alternates text / captured cashtag, so odd indices are tags */}
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-bold text-brand-fg">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}
