import { MessageCircle, BarChart3 } from "lucide-react";

interface DualBarProps {
  sentimentScore: number;
  fundamentalsScore: number;
}

export default function DualBar({ sentimentScore, fundamentalsScore }: DualBarProps) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground flex items-center gap-1">
            <MessageCircle className="w-3 h-3" /> Market Vibe (Sentiment)
          </span>
          <span className="text-accent/90 font-mono">{sentimentScore}%</span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${sentimentScore}%`,
              background: "hsl(var(--accent) / 0.65)",
            }}
          />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> Hard Numbers (Fundamentals)
          </span>
          <span className="text-primary/90 font-mono">{fundamentalsScore}%</span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${fundamentalsScore}%`,
              background: "hsl(var(--primary) / 0.65)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
