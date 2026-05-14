export default function ConfidenceRing({
  score,
  label,
}: {
  score: number;
  label: string;
}) {
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  function tooltipText(label: string) {
    switch (label) {
      case "Confidence Score":
        return "A unified measure of the AI's conviction in this asset. It blends quantitative data with market sentiment, specifically applying penalties to risky assets where social hype outpaces actual financial strength.";
      case "Sentiment Score":
        return "A real-time measure of market mood and social momentum. High scores indicate strong bullish chatter across social channels and news, while low scores suggest bearish or quiet sentiment.";
      case "Quantitative Score":
      case "Quant Score":
        return "A purely data-driven score based on financial health, valuation models, and technical indicators. This metric ignores market emotion to evaluate the underlying mathematical strength of the asset.";
      default:
        return label;
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="transform -rotate-90 w-20 h-20">
          <circle
            cx="40"
            cy="40"
            r={radius}
            className="stroke-secondary fill-none"
            strokeWidth="6"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            className="stroke-primary fill-none transition-all duration-1000"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <span className="absolute text-xl font-bold font-mono">{score}</span>
      </div>

      <div className="relative group">
        <span className="text-[10px] text-muted-foreground uppercase font-semibold">
          {label}
        </span>
        <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-full ml-3 top-1/2 -translate-y-1/2 w-64 z-50">
          <div className="bg-brand-fg text-brand-bg text-xs rounded-md p-2 shadow-lg border border-brand-border">
            {tooltipText(label)}
          </div>
        </div>
      </div>
    </div>
  );
}
