import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, X } from "lucide-react";
import { type AssetRecommendation } from "../../data/mockData";

interface Props {
  asset: AssetRecommendation;
  onRemove: (ticker: string) => void;
}

export default function WatchedAssetCard({ asset, onRemove }: Props) {
  return (
    <div className="soft-card p-4 flex items-center gap-3">
      <div className="w-11 h-11 rounded-full bg-brand-bg/70 border border-brand-border/60 flex items-center justify-center text-[11px] font-bold font-mono shrink-0 text-brand-fg">
        {asset.ticker.slice(0, 3)}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link to={`/asset/${asset.ticker}`} className="text-sm font-semibold hover:underline truncate text-brand-fg">
            {asset.name}
          </Link>
        </div>
        
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs font-mono font-semibold text-brand-fg">R {asset.price.toFixed(2)}</span>
          <span className={`chip ${asset.change >= 0 ? "bg-brand-accent/15 text-brand-accent" : "bg-brand-primary/15 text-brand-primary"}`}>
            {asset.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {asset.change >= 0 ? "+" : ""}{asset.change}%
          </span>
          <span className={`chip ${
            asset.confidenceScore >= 70 ? "bg-brand-primary/15 text-brand-primary" :
            asset.confidenceScore >= 50 ? "bg-semantic-warning/15 text-semantic-warning" :
            "bg-brand-muted-fg/20 text-brand-muted-fg"
          }`}>
            Score {asset.confidenceScore}
          </span>
        </div>
      </div>
      
      <button
        onClick={() => onRemove(asset.ticker)}
        className="p-2 rounded-full hover:bg-brand-bg/60 text-brand-muted-fg hover:text-brand-fg transition-colors shrink-0"
        title="Remove from watchlist"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}