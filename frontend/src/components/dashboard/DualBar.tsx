export default function DualBar({ sentimentScore, fundamentalsScore }: { sentimentScore: number; fundamentalsScore: number }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
          <span>Sentiment</span>
          <span className="text-foreground">{sentimentScore}%</span>
        </div>
        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${sentimentScore}%` }} />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
          <span>Fundamentals</span>
          <span className="text-foreground">{fundamentalsScore}%</span>
        </div>
        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${fundamentalsScore}%` }} />
        </div>
      </div>
    </div>
  );
}