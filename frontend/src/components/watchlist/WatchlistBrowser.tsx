import { useEffect, useState } from 'react'
import { Check, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface BrowseAsset {
  id: string
  ticker: string
  name: string
  current_price: number
  universe: string
}

interface Props {
  watchedAssetIds: string[]
  onAdd: (assetId: string) => void
  onRemove: (watchlistId: string) => void
  watchlistIdByAssetId: Record<string, string>
}

const SECTOR_STYLE: Record<string, { dot: string; text: string; activeBg: string; activeBorder: string }> = {
  'Technology':    { dot: 'bg-blue-400',   text: 'text-blue-400',   activeBg: 'bg-blue-400/10',   activeBorder: 'border-blue-400/50' },
  'Green Energy':  { dot: 'bg-green-400',  text: 'text-green-400',  activeBg: 'bg-green-400/10',  activeBorder: 'border-green-400/50' },
  'Finance':       { dot: 'bg-amber-400',  text: 'text-amber-400',  activeBg: 'bg-amber-400/10',  activeBorder: 'border-amber-400/50' },
  'AI & Robotics': { dot: 'bg-purple-400', text: 'text-purple-400', activeBg: 'bg-purple-400/10', activeBorder: 'border-purple-400/50' },
  'Healthcare':    { dot: 'bg-pink-400',   text: 'text-pink-400',   activeBg: 'bg-pink-400/10',   activeBorder: 'border-pink-400/50' },
}

const UNIVERSE_ORDER = ['Technology', 'AI & Robotics', 'Finance', 'Green Energy', 'Healthcare']

export default function WatchlistBrowser({ watchedAssetIds, onAdd, onRemove, watchlistIdByAssetId }: Props) {
  const [assets, setAssets]         = useState<BrowseAsset[]>([])
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState(false)
  const [activeSector, setActiveSector] = useState('Technology')

  useEffect(() => {
    supabase
      .from('assets')
      .select('id, ticker, name, current_price, universe')
      .not('universe', 'is', null)
      .order('ticker', { ascending: true })
      .then(({ data }) => { setAssets(data || []); setLoading(false) })
  }, [])

  const grouped = UNIVERSE_ORDER.reduce<Record<string, BrowseAsset[]>>((acc, u) => {
    const list = assets.filter(a => a.universe === u)
    if (list.length > 0) acc[u] = list
    return acc
  }, {})

  const sectorAssets = grouped[activeSector] || []
  const sc = SECTOR_STYLE[activeSector] ?? { dot: 'bg-brand-border', text: 'text-brand-muted-fg', activeBg: '', activeBorder: 'border-brand-border' }

  const handleClick = (asset: BrowseAsset) => {
    const isWatched = watchedAssetIds.includes(asset.id)
    if (isWatched) {
      const wid = watchlistIdByAssetId[asset.id]
      if (wid) onRemove(wid)
    } else {
      onAdd(asset.id)
    }
  }

  return (
    <div className="glass-card overflow-hidden">

      {/* Toggle header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-brand-border/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-brand-fg">Browse by Sector</p>
          <span className="chip bg-brand-border/30 text-brand-muted-fg text-[10px]">
            {assets.length} assets
          </span>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-brand-muted-fg" />
          : <ChevronDown className="w-4 h-4 text-brand-muted-fg" />}
      </button>

      {/* Expandable body */}
      {expanded && (
        <div className="border-t border-brand-border/40 animate-in fade-in duration-200">

          {/* Sector tab row */}
          <div className="flex gap-1.5 px-5 pt-4 pb-3 overflow-x-auto">
            {Object.keys(grouped).map(sector => {
              const s = SECTOR_STYLE[sector]
              const active = activeSector === sector
              const count = grouped[sector].filter(a => watchedAssetIds.includes(a.id)).length
              return (
                <button
                  key={sector}
                  onClick={() => setActiveSector(sector)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all shrink-0 ${
                    active && s
                      ? `${s.activeBg} ${s.activeBorder} ${s.text}`
                      : 'border-brand-border/40 text-brand-muted-fg hover:border-brand-border/70 hover:text-brand-fg'
                  }`}
                >
                  {s && <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />}
                  {sector}
                  {count > 0 && (
                    <span className={`text-[9px] font-bold ${active && s ? s.text : 'text-brand-muted-fg'}`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Asset grid for selected sector */}
          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 px-5 pb-5">
              {[1,2,3,4,5].map(n => (
                <div key={n} className="h-16 rounded-xl bg-brand-border/20 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 px-5 pb-5">
              {sectorAssets.map(asset => {
                const isWatched = watchedAssetIds.includes(asset.id)
                return (
                  <button
                    key={asset.id}
                    onClick={() => handleClick(asset)}
                    title={isWatched ? `Remove ${asset.ticker}` : `Add ${asset.ticker}`}
                    className={`relative flex flex-col items-start p-2.5 rounded-xl border transition-all duration-150 text-left active:scale-95 focus:outline-none ${
                      isWatched
                        ? `${sc.activeBorder} ${sc.activeBg}`
                        : 'border-brand-border/40 bg-brand-surface/20 hover:border-brand-border/70 hover:bg-brand-surface/50'
                    }`}
                  >
                    {/* Watch indicator */}
                    <span className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                      isWatched ? 'bg-brand-accent' : 'border border-brand-border/40'
                    }`}>
                      {isWatched
                        ? <Check size={9} strokeWidth={3} className="text-brand-bg" />
                        : <Plus size={9} className="text-brand-muted-fg/50" />
                      }
                    </span>

                    <p className={`text-sm font-black font-mono leading-none tracking-tight pr-5 ${isWatched ? sc.text : 'text-brand-fg'}`}>
                      {asset.ticker}
                    </p>
                    <p className="text-[9px] text-brand-muted-fg mt-1 leading-tight line-clamp-2 pr-1">
                      {asset.name}
                    </p>
                    {asset.current_price > 0 && (
                      <p className="text-[9px] font-mono text-brand-muted-fg/70 mt-1">
                        R{asset.current_price.toFixed(0)}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}