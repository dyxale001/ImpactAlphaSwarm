import { scoreMeta } from "./sentimentDisplay";

// Two labelled signals shown per news article / social post so the reader can
// tell them apart:
//   * Sentiment -- this item's OWN raw text sentiment (0 to 100), independent of
//     when it was published or how reliable the source is.
//   * Influence -- the share of the rolled-up sentiment score this item actually
//     drives, after tier reliability and recency weighting. Two items can show
//     the same Sentiment while pulling the headline score by very different
//     amounts, and Influence is what makes that visible.
export default function SentimentSignals({
  score,
  influence,
}: {
  score?: number;
  influence?: number;
}) {
  return (
    <>
      {score != null && (
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium ${scoreMeta(score).cls}`}
          title="Sentiment: this item's own text sentiment, from 0 (very negative) to 100 (very positive). Does not factor in date or source tier."
        >
          <span className="opacity-60">Sentiment</span>
          <span className="font-mono tabular-nums">{Math.round(score)}</span>
        </span>
      )}
      {influence != null && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium bg-brand-primary/10 text-brand-primary"
          title="Influence: how much of the overall sentiment score this item drives, after source tier reliability and recency weighting."
        >
          <span className="opacity-60">Influence</span>
          <span className="font-mono tabular-nums">
            {influence < 1 ? "<1%" : `${Math.round(influence)}%`}
          </span>
        </span>
      )}
    </>
  );
}
