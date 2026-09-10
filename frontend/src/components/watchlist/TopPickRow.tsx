import { Link } from 'react-router-dom'
import { type TopPick } from '../../hooks/useWatchlistData'

// One ranked asset from the user's latest run, as a horizontal row.
//
// Lifted out of the Watchlist page when the dashboard started showing the same
// "from your latest analysis" list as a widget. Both render it identically
// because there is only one of it.

export default function TopPickRow({ pick, index }: { pick: TopPick; index: number }) {
  return (
    <div
      className="soft-card p-5 flex items-center gap-5 hover:border-brand-primary/30 transition-all"
      style={{ animation: `slide-up ${0.3 + index * 0.06}s ease-out forwards` }}
    >
      {/* Rank + ticker */}
      <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-none sm:w-36 sm:shrink-0">
        <div className="w-7 h-7 shrink-0 rounded-full bg-brand-primary/10 flex items-center justify-center text-[10px] font-bold text-brand-primary">
          {pick.rank}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black font-mono text-brand-fg">{pick.ticker}</p>
          <p className="text-[10px] text-brand-muted-fg truncate">{pick.name}</p>
        </div>
      </div>

      {/* Reasoning */}
      <p className="flex-1 text-xs text-brand-muted-fg leading-relaxed line-clamp-2 hidden md:block">
        {pick.reasoning || 'No reasoning available.'}
      </p>

      {/* Price + link */}
      <div className="text-right shrink-0 ml-auto">
        {pick.priceAtRun > 0 && (
          <p className="text-xs font-mono text-brand-muted-fg mb-1">R {pick.priceAtRun.toFixed(2)}</p>
        )}
        <Link to={`/asset/${pick.ticker}`}
          className="text-xs text-brand-primary hover:underline font-semibold">
          Analyse →
        </Link>
      </div>
    </div>
  )
}
