import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MessageSquare, BarChart3, Eye, Flame, X, Sparkles,
         TriangleAlert, TrendingUp, TrendingDown } from 'lucide-react'
import { type WatchlistAsset, type ScoreDelta } from '../../hooks/useWatchlistData'

// ─── Sector styles ─────────────────────────────────────────────────────────
const SECTOR_STYLE: Record<string, { border: string; text: string; dot: string }> = {
  'Technology':    { border: 'border-l-blue-400',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  'Green Energy':  { border: 'border-l-green-400',  text: 'text-green-400',  dot: 'bg-green-400' },
  'Finance':       { border: 'border-l-amber-400',  text: 'text-amber-400',  dot: 'bg-amber-400' },
  'AI & Robotics': { border: 'border-l-purple-400', text: 'text-purple-400', dot: 'bg-purple-400' },
  'Healthcare':    { border: 'border-l-pink-400',   text: 'text-pink-400',   dot: 'bg-pink-400' },
}
const DEFAULT_SECTOR = { border: 'border-l-brand-border', text: 'text-brand-muted-fg', dot: 'bg-brand-border' }

function scoreColor(score: number) {
  if (score >= 70) return 'text-brand-accent'
  if (score >= 50) return 'text-semantic-warning'
  return 'text-brand-primary'
}

function daysSince(isoString?: string) {
  if (!isoString) return null
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Today'
  if (diff === 1) return '1d ago'
  return `${diff}d ago`
}

function MiniSparkline({ prices, fetching }: { prices: number[]; fetching: boolean }) {
  if (fetching || prices.length < 2) {
    return (
      <svg viewBox="0 0 112 40" className={`w-full h-10 ${fetching ? 'opacity-20 animate-pulse' : 'opacity-30'}`}>
        <polyline points="0,20 8,18 16,22 24,17 32,21 40,16 48,20 56,18 64,22 72,17 80,21 88,16 96,20 104,18"
          fill="none" stroke="var(--color-brand-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  const W = 112, H = 36, PAD = 3
  const min   = Math.min(...prices)
  const max   = Math.max(...prices)
  const range = max - min || 1

  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W
    const y = H - PAD - ((p - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const isUp   = prices[prices.length - 1] >= prices[0]
  const stroke = isUp ? '#22c55e' : '#ef4444'

  return (
    <svg viewBox="0 0 112 40" className="w-full h-10">
      <polyline points={pts} fill="none" stroke={stroke}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SignalBar({ label, score, emphasis = false, direction }: {
  label: string; score: number; emphasis?: boolean; direction?: ScoreDelta
}) {
  const pct = Math.max(0, Math.min(100, score))
  const barColor = direction === 'up'   ? 'bg-semantic-success'
    : direction === 'down' ? 'bg-semantic-danger'
    : emphasis             ? 'bg-brand-primary'
    :                        'bg-brand-primary/80'
  const arrow = direction === 'up'
    ? <TrendingUp   className="w-3.5 h-3.5 text-semantic-success" />
    : direction === 'down'
    ? <TrendingDown className="w-3.5 h-3.5 text-semantic-danger" />
    : null
  const scoreColor = direction === 'up' ? 'text-semantic-success'
    : direction === 'down' ? 'text-semantic-danger'
    : 'text-brand-fg'
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs uppercase tracking-widest text-brand-muted-fg font-bold flex items-center gap-1.5">
          {label} {arrow}
        </span>
        <span className={`font-mono font-bold text-lg ${scoreColor}`}>
          {score}<span className="text-brand-muted-fg text-xs font-normal"> /100</span>
        </span>
      </div>
      <div className="h-2 w-full bg-brand-border/15 rounded-lg overflow-hidden">
        <div className={`h-full rounded-lg transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

type Tab = 'overview' | 'sentiment' | 'numbers'

function getPreview(asset: WatchlistAsset, tab: Tab) {
  if (!asset.confidenceScore) return {
    title: 'No AI Data',
    body: "This asset hasn't appeared in any of your analysis runs yet. Run a new analysis from the dashboard — watchlist assets are included automatically.",
  }
  switch (tab) {
    case 'sentiment':
      return {
        title: 'Market Vibe',
        body: (asset.sentimentScore ?? 0) >= 70
          ? `Strong social momentum. A score of ${asset.sentimentScore}/100 indicates the market is highly bullish on ${asset.ticker}.`
          : `Neutral chatter. A score of ${asset.sentimentScore}/100 indicates balanced or quiet discussion online.`,
      }
    case 'numbers':
      return {
        title: 'Hard Numbers',
        body: `Quantitative Score: ${asset.quantScore}/100. Higher quant scores indicate stronger technical signals and healthier fundamentals backing the AI's decision.`,
      }
    default:
      return { title: 'Quick Take', body: asset.reasoning || 'No reasoning trace available.' }
  }
}

interface Props {
  asset: WatchlistAsset
  onRemove: (watchlistId: string) => void
  isRemoving?: boolean
  isComparing?: boolean
  onToggleCompare?: (ticker: string) => void
  compareDisabled?: boolean   // true when 3 assets already selected and this isn't one
}

export default function WatchedAssetCard({
  asset, onRemove, isRemoving,
  isComparing, onToggleCompare, compareDisabled
}: Props) {
  const [tab, setTab] = useState<Tab>('overview')

  // Fetch live price history — used for both sparkline and displayed price
  const [livePrices, setLivePrices]   = useState<number[]>([])
  const [priceFetching, setPriceFetching] = useState(true)

  useEffect(() => {
    const BASE = (import.meta as any).env?.VITE_API_BASE ?? ''
    fetch(`${BASE}/api/assets/${asset.ticker.toUpperCase()}/history`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setLivePrices(data?.closes ?? []); setPriceFetching(false) })
      .catch(() => setPriceFetching(false))
  }, [asset.ticker])

  const preview    = getPreview(asset, tab)
  const hasAI      = asset.confidenceScore !== undefined
  const sc         = SECTOR_STYLE[asset.universe] ?? DEFAULT_SECTOR

  // Use the most recent yfinance closing price; fall back to DB price while loading
  const livePrice    = livePrices.length > 0 ? livePrices[livePrices.length - 1] : null
  const displayPrice = livePrice ?? (hasAI && (asset.priceAtRun ?? 0) > 0 ? asset.priceAtRun! : asset.current_price)
  const analysedLabel = daysSince(asset.analysedAt)

  // Per-asset price staleness (4-day window matching backend)
  const priceDaysOld = asset.lastUpdated
    ? Math.floor((Date.now() - new Date(asset.lastUpdated).getTime()) / (1000 * 60 * 60 * 24))
    : null
  const isPriceStale = priceDaysOld !== null && priceDaysOld >= 4

  const tabs = [
    { id: 'overview'  as Tab, label: 'Overview', icon: Eye },
    { id: 'sentiment' as Tab, label: 'Vibe',     icon: MessageSquare },
    { id: 'numbers'   as Tab, label: 'Numbers',  icon: BarChart3 },
  ]

  return (
    <div
      className={`soft-card border-l-4 ${sc.border} p-5 space-y-4 transition-all flex flex-col
        ${isComparing ? 'ring-2 ring-brand-primary/40' : 'hover:border-brand-primary/30'}
        ${isRemoving  ? 'opacity-40 pointer-events-none' : ''}
        ${compareDisabled ? 'opacity-50' : ''}`}
      style={{ animation: 'slide-up 0.4s ease-out forwards' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Compare checkbox */}
          {onToggleCompare && (
            <button
              onClick={() => onToggleCompare(asset.ticker)}
              disabled={compareDisabled}
              title={isComparing ? 'Remove from comparison' : 'Add to comparison'}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                isComparing
                  ? 'bg-brand-primary border-brand-primary'
                  : 'border-brand-border/60 hover:border-brand-primary/60'
              } disabled:opacity-30`}
            >
              {isComparing && <span className="text-white text-[10px] font-bold">✓</span>}
            </button>
          )}

          <div className="w-9 h-9 rounded-full bg-brand-bg/70 border border-brand-border/60 flex items-center justify-center text-[10px] font-bold font-mono shrink-0">
            {asset.ticker.slice(0, 4)}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold truncate text-primary">{asset.ticker}</p>
            <p className="text-[12px] text-primary/80 truncate">{asset.name}</p>
            {displayPrice > 0 && (
              <p className="text-sm font-mono text-primary">R {displayPrice.toFixed(2)}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {asset.universe && (
            <div className={`flex items-center gap-1 chip bg-brand-border/20 ${sc.text} text-[10px]`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
              {asset.universe}
            </div>
          )}
          {hasAI && analysedLabel && (
            <div className="chip bg-brand-border/20 text-brand-muted-fg text-[10px]">
              {analysedLabel}
            </div>
          )}
          <button onClick={() => onRemove(asset.id)} disabled={isRemoving}
            className="p-1.5 rounded-full hover:bg-semantic-danger/10 text-brand-muted-fg hover:text-semantic-danger transition-colors"
            title="Remove">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Sparkline ──────────────────────────────────────────────────── */}
      <MiniSparkline prices={livePrices} fetching={priceFetching} />

      {/* ── AI scores ──────────────────────────────────────────────────── */}
      {hasAI ? (
        <>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-brand-muted-fg font-semibold mb-0.5">Confidence</p>
              <p className={`text-2xl font-bold font-mono leading-none ${scoreColor(asset.confidenceScore!)}`}>
                {asset.confidenceScore}
                <span className="text-sm text-brand-muted-fg font-normal">/100</span>
              </p>
            </div>
            <div className="flex gap-3 mb-0.5">
              <div>
                <p className="text-[10px] text-brand-muted-fg uppercase tracking-wider">Sentiment</p>
                <p className={`text-base font-bold font-mono ${scoreColor(asset.sentimentScore ?? 0)}`}>{asset.sentimentScore}</p>
              </div>
              <div>
                <p className="text-[10px] text-brand-muted-fg uppercase tracking-wider">Quant</p>
                <p className={`text-base font-bold font-mono ${scoreColor(asset.quantScore ?? 0)}`}>{asset.quantScore}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <SignalBar label="Sentiment" score={asset.sentimentScore ?? 0} direction={asset.sentimentDelta} />
            <SignalBar label="Quant"     score={asset.quantScore     ?? 0} direction={asset.quantDelta} />
          </div>

          {asset.isHype && (
            <span className="chip bg-semantic-warning/15 text-semantic-warning w-fit">
              <Flame className="w-3 h-3" /> Hype flagged — penalty applied
            </span>
          )}

          <div className="flex items-center gap-1 bg-brand-bg/60 border border-brand-border/60 rounded-full p-1">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-full transition-colors ${
                  tab === t.id ? 'bg-brand-primary text-brand-bg' : 'text-brand-muted-fg hover:text-brand-fg'
                }`}>
                <t.icon className="w-3 h-3" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="bg-brand-bg/50 rounded-2xl p-3 border border-brand-border/50">
            <p className="text-[10px] text-brand-muted-fg uppercase tracking-widest mb-1 font-semibold">{preview.title}</p>
            <p className="text-xs text-brand-fg/85 leading-relaxed">{preview.body}</p>
          </div>
        </>
      ) : (
        <div className="bg-brand-bg/40 rounded-2xl p-4 border border-brand-border/40 flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-brand-muted-fg shrink-0" />
          <div>
            <p className="text-xs font-semibold text-brand-fg">No AI analysis yet</p>
            <p className="text-[11px] text-brand-muted-fg mt-0.5">
              This asset hasn't appeared in any analysis run. Watchlist assets are automatically included when you reanalyse.
            </p>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="mt-auto pt-1">
        <Link to={`/asset/${asset.ticker}`}
          className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-semibold">
          Full analysis <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}