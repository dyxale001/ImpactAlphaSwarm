/**
 * WatchedAssetCard — simple market data card.
 *
 * Shows only general asset info (ticker, name, price, its 14-day move and a
 * sparkline, sector). No AI scores — those live on the dashboard. This keeps the
 * watchlist feeling like a library, not a second analysis run.
 *
 * Laid out as the redesign's card: the price and its change sit beside the line
 * rather than on top of it, the change is in the platform's up and down colours,
 * and the sector moves to the footer, where a long name has room.
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import { type WatchlistAsset } from '../../hooks/useWatchlistData'

import { sectorColour } from '../../utils/sectorColours'

// The last 14 closes, from the same history endpoint the card always used.
function useCloses(ticker: string) {
  const [prices, setPrices] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const BASE = (import.meta as any).env?.VITE_API_BASE ?? ''

  useEffect(() => {
    fetch(`${BASE}/api/assets/${ticker}/history`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setPrices(d?.closes ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [ticker, BASE])

  return { prices, loading }
}

function Sparkline({ prices, up }: { prices: number[]; up: boolean }) {
  const W = 128, H = 44, PAD = 3
  const min = Math.min(...prices), max = Math.max(...prices)
  const range = max - min || 1
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W
    const y = H - PAD - ((p - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    // Shrinks before the price does, so a narrow dashboard column keeps the figure whole.
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-11 w-32 min-w-16 shrink" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? 'var(--color-up)' : 'var(--color-down)'}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────
interface Props {
  asset: WatchlistAsset
  onRemove: (id: string) => void
  isRemoving?: boolean
}

export default function WatchedAssetCard({ asset, onRemove, isRemoving }: Props) {
  const sc = sectorColour(asset.universe)
  const { prices, loading } = useCloses(asset.ticker)
  const hasLine = prices.length >= 2
  const first = prices[0]
  const last = prices[prices.length - 1]
  const change = hasLine && first ? (last - first) / first : null
  const up = (change ?? 0) >= 0

  return (
    <article
      className={`as-card flex flex-col gap-3 p-4 sm:p-5 transition-shadow hover:shadow-float ${isRemoving ? 'opacity-40 pointer-events-none' : ''}`}
      style={{ animation: 'slide-up 0.4s ease-out forwards' }}
    >
      {/* Ticker and name, and the remove button */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold text-forest-900">{asset.ticker}</p>
          <p className="truncate text-xs text-brand-muted-fg">{asset.name}</p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(asset.id)}
          aria-label={`Remove ${asset.ticker} from your watchlist`}
          title="Remove from watchlist"
          className="-mr-1.5 -mt-1 shrink-0 rounded-full p-1.5 text-brand-muted-fg transition-colors hover:bg-down-bg hover:text-down focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Price and its 14-day move, beside the line */}
      <div className="flex items-end justify-between gap-3">
        {loading ? (
          <div className="space-y-1.5" aria-hidden="true">
            <div className="h-6 w-24 animate-pulse rounded bg-forest-50" />
            <div className="h-3 w-20 animate-pulse rounded bg-forest-50" />
          </div>
        ) : hasLine ? (
          <div className="shrink-0">
            <p className="text-xl font-bold tabular-nums tracking-[-0.01em] text-forest-900">R {last.toFixed(2)}</p>
            {change != null && (
              <p className={`text-xs font-semibold tabular-nums ${up ? 'text-up' : 'text-down'}`}>
                {`${up ? '+' : ''}${(change * 100).toFixed(1)}%`} <span className="font-normal text-brand-muted-fg">in 14 days</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-brand-muted-fg">Price unavailable</p>
        )}
        {loading
          ? <div className="h-11 w-32 shrink-0 animate-pulse rounded bg-forest-50" aria-hidden="true" />
          : hasLine && <Sparkline prices={prices} up={up} />}
      </div>

      {/* Sector and the way into the stock page */}
      <div className="flex items-center justify-between gap-3 border-t border-forest-900/8 pt-3">
        {asset.universe ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-brand-muted-fg">
            <span className={`h-2 w-2 shrink-0 rounded-full ${sc.fill}`} aria-hidden="true" />
            <span className="truncate">{asset.universe}</span>
          </span>
        ) : <span />}
        <Link
          to={`/asset/${asset.ticker}`}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
        >
          Full analysis <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}
