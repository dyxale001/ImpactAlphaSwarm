import { ArrowUpRight, ArrowDownLeft } from "lucide-react";

// Directional sentiment marker shared by the news and social transparency lists:
// green up-right arrow for positive, red down-left arrow for negative (a mirror
// of the positive arrow), grey dot for neutral.
export default function SentimentIndicator({
  sentiment,
}: {
  sentiment?: string;
}) {
  if (sentiment === "Positive") {
    return (
      <ArrowUpRight
        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
        aria-label="Positive"
      />
    );
  }
  if (sentiment === "Negative") {
    return (
      <ArrowDownLeft
        className="mt-0.5 h-4 w-4 shrink-0 text-rose-500"
        aria-label="Negative"
      />
    );
  }
  return (
    <span
      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400"
      aria-label="Neutral"
      title="Neutral"
    />
  );
}
