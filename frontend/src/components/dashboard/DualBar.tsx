export default function DualBar({
  sentimentScore,
  quantitativeScore,
}: {
  sentimentScore: number;
  quantitativeScore: number;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="relative group inline-block">
            <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">
              Sentiment Score
            </span>
            <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-1/2 -translate-x-1/2 mt-2 w-64 z-50">
              <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border">
                A real-time measure of market mood and social momentum. High
                scores indicate strong bullish chatter across social channels
                and news, while low scores suggest bearish or quiet sentiment.
              </div>
            </div>
          </span>
          <span className="text-foreground font-mono font-semibold">
            {sentimentScore}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-background rounded-full overflow-hidden">
          <div
            className="h-full bg-primary"
            style={{ width: `${sentimentScore}%` }}
          />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="relative group inline-block">
            <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">
              Quantitative Score
            </span>
            <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-1/2 -translate-x-1/2 mt-2 w-64 z-50">
              <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border">
                A purely data-driven score based on financial health, valuation
                models, and technical indicators. This metric ignores market
                emotion to evaluate the underlying mathematical strength of the
                asset.
              </div>
            </div>
          </span>
          <span className="text-foreground font-mono font-semibold">
            {quantitativeScore}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-background rounded-full overflow-hidden">
          <div
            className="h-full bg-primary"
            style={{ width: `${quantitativeScore}%` }}
          />
        </div>
      </div>
    </div>
  );
}
