export default function ConfidenceRing({ score, label }: { score: number; label: string }) {
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="transform -rotate-90 w-20 h-20">
          <circle cx="40" cy="40" r={radius} className="stroke-secondary fill-none" strokeWidth="6" />
          <circle cx="40" cy="40" r={radius} 
            className="stroke-primary fill-none transition-all duration-1000"
            strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} />
        </svg>
        <span className="absolute text-xl font-bold font-mono">{score}</span>
      </div>
      <span className="text-[10px] text-muted-foreground uppercase font-semibold">{label}</span>
    </div>
  );
}