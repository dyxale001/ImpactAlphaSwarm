/**
 * WatchedAssetCard — simple market data card.
 *
 * Shows only general asset info (ticker, name, live price, sparkline, sector).
 * No AI scores — those live on the dashboard. This keeps the watchlist feeling
 * like a library, not a second analysis run.
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import { type WatchlistAsset } from '../../hooks/useWatchlistData'

// ─── Sector styles ─────────────────────────────────────────────────────────
const SECTOR_STYLE: Record<string, { border: string; text: string; dot: string }> = {
  'Technology':    { border: 'border-l-blue-400',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  'Green Energy':  { border: 'border-l-green-400',  text: 'text-green-400',  dot: 'bg-green-400' },
  'Finance':       { border: 'border-l-amber-400',  text: 'text-amber-400',  dot: 'bg-amber-400' },
  'AI & Robotics': { border: 'border-l-purple-400', text: 'text-purple-400', dot: 'bg-purple-400' },
  'Healthcare':    { border: 'border-l-pink-400',   text: 'text-pink-400',   dot: 'bg-pink-400' },
}
const DEFAULT_SECTOR = { border: 'border-l-brand-border/50', text: 'text-brand-muted-fg', dot: 'bg-brand-border' }

// ─── Sparkline with real yfinance data ─────────────────────────────────────
function Sparkline({ ticker }: { ticker: string }) {
  const [prices, setPrices]     = useState<number[]>([])
  const [loading, setLoading]   = useState(true)
  const BASE = (import.meta as any).env?.VITE_API_BASE ?? ''

  useEffect(() => {
    fetch(`${BASE}/api/assets/${ticker}/history`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setPrices(d?.closes ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [ticker, BASE])

  if (loading || prices.length < 2) {
    return <div className={`w-full h-12 rounded bg-brand-border/20 ${loading ? 'animate-pulse' : ''}`} />
  }

  const W = 200, H = 44, PAD = 3
  const min = Math.min(...prices), max = Math.max(...prices)
  const range = max - min || 1
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W
    const y = H - PAD - ((p - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const isUp   = prices[prices.length - 1] >= prices[0]
  const stroke = isUp ? '#22c55e' : '#ef4444'
  const livePrice = prices[prices.length - 1]

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12">
        <polyline points={pts} fill="none" stroke={stroke}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* Price overlay on right */}
      <span className={`absolute bottom-0 right-0 text-xs font-mono font-bold ${isUp ? 'text-green-400' : 'text-red-400'}`}>
        R {livePrice.toFixed(2)}
      </span>
    </div>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────
interface Props {
  asset: WatchlistAsset
  onRemove: (id: string) => void
  isRemoving?: boolean
}

export default function WatchedAssetCard({ asset, onRemove, isRemoving }: Props) {
  const sc = SECTOR_STYLE[asset.universe] ?? DEFAULT_SECTOR

  return (
    <div
      className={`soft-card border-l-4 ${sc.border} p-4 flex flex-col gap-3 hover:border-brand-primary/30 transition-all ${isRemoving ? 'opacity-40 pointer-events-none' : ''}`}
      style={{ animation: 'slide-up 0.4s ease-out forwards' }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-brand-bg/70 border border-brand-border/60 flex items-center justify-center text-[10px] font-bold font-mono shrink-0">
            {asset.ticker.slice(0, 4)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-brand-fg leading-tight">{asset.ticker}</p>
            <p className="text-[11px] text-brand-muted-fg truncate">{asset.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {asset.universe && (
            <div className={`flex items-center gap-1 chip bg-brand-border/20 ${sc.text} text-[10px]`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
              {asset.universe}
            </div>
          )}
          <button
            onClick={() => onRemove(asset.id)}
            title="Remove from watchlist"
            className="p-1.5 rounded-full hover:bg-semantic-danger/10 text-brand-muted-fg hover:text-semantic-danger transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sparkline with live price */}
      <Sparkline ticker={asset.ticker} />

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <Link
          to={`/asset/${asset.ticker}`}
          className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-semibold"
        >
          Full analysis <ArrowRight className="w-3 h-3" />
        </Link>
        <span className="text-[10px] text-brand-muted-fg">14-day chart</span>
      </div>
    </div>
  )
}