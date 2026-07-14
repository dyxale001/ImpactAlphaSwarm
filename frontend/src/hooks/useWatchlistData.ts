import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { startAnalysis, getStatus, getResult } from '../services/api/analysis'
import { pollUntilComplete } from '../services/api/poll'

// ─── Types ─────────────────────────────────────────────────────────────────

export type ScoreDelta = 'up' | 'down' | 'same'

export interface WatchlistAsset {
  id: string
  asset_id: string
  ticker: string
  name: string
  current_price: number
  universe: string
  addedAt?: string
  confidenceScore?: number
  sentimentScore?: number
  quantScore?: number
  reasoning?: string
  hypePenalty?: number
  isHype?: boolean
  priceAtRun?: number
  rank?: number
  analysedAt?: string
  lastUpdated?: string   // assets.last_updated — for per-asset price staleness
  // Direction since last refresh — undefined on first load
  confidenceDelta?: ScoreDelta
  sentimentDelta?: ScoreDelta
  quantDelta?: ScoreDelta
}

export interface AssetSearchResult {
  id: string
  ticker: string
  name: string
  current_price: number
  universe: string
}

export type SortOption = 'confidence' | 'ticker' | 'sentiment' | 'quant' | 'added'

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useWatchlistData() {
  const { session, profile } = useAuthStore()
  const userId = session?.user?.id

  const [watchedAssets, setWatchedAssets]   = useState<WatchlistAsset[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [search, setSearch]                 = useState('')
  const [searchResults, setSearchResults]   = useState<AssetSearchResult[]>([])
  const [searchLoading, setSearchLoading]   = useState(false)
  const [removing, setRemoving]             = useState<Set<string>>(new Set())

  // Tracks previous scores across refreshes so we can show up/down deltas
  const prevScoresRef = useRef<Map<string, { confidence: number; sentiment: number; quant: number }>>(new Map())

  // Compare — up to 3 assets by ticker
  const [compareSet, setCompareSet]         = useState<Set<string>>(new Set())

  // Sort & filter
  const [sortBy, setSortBy]                 = useState<SortOption>('added')
  const [sectorFilter, setSectorFilter]     = useState('All')

  // Reanalysis
  const [reanalysing, setReanalysing]       = useState(false)
  const [lastAnalysedAt, setLastAnalysedAt] = useState<Date | null>(null)

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchWatchlist = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    setError(null)

    const { data: rows, error: wErr } = await supabase
      .from('user_watchlist_assets')
      .select('id, asset_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (wErr) { setError(wErr.message); setLoading(false); return }
    if (!rows || rows.length === 0) { setWatchedAssets([]); setLoading(false); return }

    const assetIds = rows.map(r => r.asset_id)
    const addedAtMap = new Map(rows.map(r => [r.asset_id, r.created_at]))

    const { data: assets, error: aErr } = await supabase
      .from('assets')
      .select('id, ticker, name, current_price, universe, last_updated')
      .in('id', assetIds)

    if (aErr) { setError(aErr.message); setLoading(false); return }
    const assetMap = new Map((assets || []).map(a => [a.id, a]))

    // Last 20 runs — for AI data and staleness detection
    const { data: allRuns } = await supabase
      .from('ai_runs')
      .select('id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (allRuns && allRuns[0]?.created_at) {
      setLastAnalysedAt(new Date(allRuns[0].created_at))
    }

    const recMap = new Map<string, any>()
    const recRunMap = new Map<string, string>()  // asset_id → run created_at

    if (allRuns && allRuns.length > 0) {
      const runIds = allRuns.map(r => r.id)
      const runRecency = new Map(runIds.map((id, i) => [id, i]))
      const runCreatedAt = new Map(allRuns.map(r => [r.id, r.created_at]))

      const { data: allRecs } = await supabase
        .from('ai_recommendation')
        .select('asset_id, run_id, confidence_score, quant_score, sentiment_score, reasoning_trace, hype_penalty, price_at_run, rank')
        .in('run_id', runIds)
        .in('asset_id', assetIds)

      ;(allRecs || []).forEach(rec => {
        const existing = recMap.get(rec.asset_id)
        const thisRecency  = runRecency.get(rec.run_id)  ?? 999
        const existRecency = existing ? (runRecency.get(existing.run_id) ?? 999) : 999
        if (!existing || thisRecency < existRecency) {
          recMap.set(rec.asset_id, rec)
          recRunMap.set(rec.asset_id, runCreatedAt.get(rec.run_id) ?? '')
        }
      })
    }

    const merged = rows
      .map(row => {
        const asset = assetMap.get(row.asset_id)
        if (!asset) return null
        const rec = recMap.get(row.asset_id)
        return {
          id:            row.id,
          asset_id:      row.asset_id,
          ticker:        asset.ticker,
          name:          asset.name,
          current_price: asset.current_price ?? 0,
          universe:      asset.universe ?? '',
          addedAt:       addedAtMap.get(row.asset_id) ?? '',
          lastUpdated:   asset.last_updated ?? '',
          ...(rec ? {
            confidenceScore: rec.confidence_score ?? 0,
            sentimentScore:  rec.sentiment_score  ?? 0,
            quantScore:      rec.quant_score      ?? 0,
            reasoning:       rec.reasoning_trace  ?? '',
            hypePenalty:     rec.hype_penalty     ?? 0,
            isHype:          (rec.hype_penalty ?? 0) > 0,
            priceAtRun:      rec.price_at_run     ?? 0,
            rank:            rec.rank             ?? 0,
            analysedAt:      recRunMap.get(row.asset_id) ?? '',
          } : {}),
        }
      })
      .filter(Boolean) as WatchlistAsset[]

    // Compute score deltas vs previous fetch
    const prev = prevScoresRef.current
    const newPrev = new Map<string, { confidence: number; sentiment: number; quant: number }>()

    const withDeltas = merged.map(asset => {
      if (asset.confidenceScore === undefined) return asset
      const p = prev.get(asset.ticker)
      newPrev.set(asset.ticker, {
        confidence: asset.confidenceScore,
        sentiment:  asset.sentimentScore  ?? 0,
        quant:      asset.quantScore      ?? 0,
      })
      if (!p) return asset  // first load — no delta yet
      const delta = (curr: number, old: number): ScoreDelta =>
        curr > old ? 'up' : curr < old ? 'down' : 'same'
      return {
        ...asset,
        confidenceDelta: delta(asset.confidenceScore,      p.confidence),
        sentimentDelta:  delta(asset.sentimentScore  ?? 0, p.sentiment),
        quantDelta:      delta(asset.quantScore      ?? 0, p.quant),
      }
    })

    prevScoresRef.current = newPrev
    setWatchedAssets(withDeltas)
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchWatchlist() }, [fetchWatchlist])

  // Auto-refresh when the user returns to the tab
  useEffect(() => {
    const onFocus = () => fetchWatchlist()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchWatchlist()
    })
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchWatchlist])

  // Refresh every 5 minutes while the page is open
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchWatchlist()
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchWatchlist])

  // ── Search ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      const watchedAssetIds = watchedAssets.map(a => a.asset_id)
      let query = supabase
        .from('assets')
        .select('id, ticker, name, current_price, universe')
        .or(`ticker.ilike.%${search}%,name.ilike.%${search}%`)
        .limit(8)
      if (watchedAssetIds.length > 0) {
        query = query.not('id', 'in', `(${watchedAssetIds.join(',')})`)
      }
      const { data } = await query
      setSearchResults(data || [])
      setSearchLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, watchedAssets])

  // ── Add / Remove ────────────────────────────────────────────────────────
  const addToWatchlist = async (assetId: string) => {
    if (!userId) return
    const { error } = await supabase
      .from('user_watchlist_assets')
      .insert({ user_id: userId, asset_id: assetId })
    if (error) { setError(`Failed to add asset: ${error.message}`); return }
    setSearch('')
    await fetchWatchlist()
  }

  const removeFromWatchlist = async (watchlistId: string) => {
    setRemoving(prev => new Set(prev).add(watchlistId))
    const { error } = await supabase
      .from('user_watchlist_assets')
      .delete()
      .eq('id', watchlistId)
    if (error) {
      setError(`Failed to remove: ${error.message}`)
    } else {
      setWatchedAssets(prev => prev.filter(a => a.id !== watchlistId))
    }
    setRemoving(prev => { const next = new Set(prev); next.delete(watchlistId); return next })
  }

  // ── Compare ─────────────────────────────────────────────────────────────
  const toggleCompare = (ticker: string) => {
    setCompareSet(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) {
        next.delete(ticker)
      } else if (next.size < 3) {
        next.add(ticker)
      }
      return next
    })
  }

  const clearCompare = () => setCompareSet(new Set())

  const compareAssets = useMemo(
    () => watchedAssets.filter(a => compareSet.has(a.ticker)),
    [watchedAssets, compareSet]
  )

  // ── Reanalyse ───────────────────────────────────────────────────────────
  const reanalyse = async () => {
    if (!userId || reanalysing) return
    setReanalysing(true)
    setError(null)
    try {
      const { run_id } = await startAnalysis({
        universes: (profile as any)?.analysis?.investment_universe || [],
        watchlist:  watchedAssets.map(a => a.ticker),
        risk_tolerance:  (profile as any)?.analysis?.risk_tolerance,
        expertise_level: (profile as any)?.analysis?.ai_derived_expertise,
      })
      await pollUntilComplete(run_id, getStatus, getResult, () => {})
      await fetchWatchlist()
    } catch (err: any) {
      setError(`Reanalysis failed: ${err?.message ?? 'unknown error'}`)
    }
    setReanalysing(false)
  }

  // ── Staleness ───────────────────────────────────────────────────────────
  const daysSinceAnalysis = lastAnalysedAt
    ? Math.floor((Date.now() - lastAnalysedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null
  const isStale = daysSinceAnalysis !== null && daysSinceAnalysis >= 4

  // ── Sort + filter ───────────────────────────────────────────────────────
  const displayedAssets = useMemo(() => {
    let list = [...watchedAssets]

    // Sector filter
    if (sectorFilter !== 'All') {
      list = list.filter(a => a.universe === sectorFilter)
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case 'confidence': return (b.confidenceScore ?? -1) - (a.confidenceScore ?? -1)
        case 'sentiment':  return (b.sentimentScore  ?? -1) - (a.sentimentScore  ?? -1)
        case 'quant':      return (b.quantScore       ?? -1) - (a.quantScore      ?? -1)
        case 'ticker':     return a.ticker.localeCompare(b.ticker)
        case 'added':      return (b.addedAt ?? '').localeCompare(a.addedAt ?? '')
        default: return 0
      }
    })
    return list
  }, [watchedAssets, sectorFilter, sortBy])

  // ── Derived stats ───────────────────────────────────────────────────────
  const assetsWithAI  = watchedAssets.filter(a => a.confidenceScore !== undefined)
  const avgConfidence = assetsWithAI.length
    ? Math.round(assetsWithAI.reduce((s, a) => s + (a.confidenceScore ?? 0), 0) / assetsWithAI.length)
    : null
  const hypeCount = watchedAssets.filter(a => a.isHype).length

  // Unique sectors present in watchlist
  const sectors = ['All', ...Array.from(new Set(watchedAssets.map(a => a.universe).filter(Boolean)))]

  return {
    watchedAssets,
    displayedAssets,
    loading,
    error,
    search,
    setSearch,
    searchResults,
    searchLoading,
    removing,
    addToWatchlist,
    removeFromWatchlist,
    refreshWatchlist: fetchWatchlist,
    // Compare
    compareSet,
    compareAssets,
    toggleCompare,
    clearCompare,
    // Sort / filter
    sortBy,
    setSortBy,
    sectorFilter,
    setSectorFilter,
    sectors,
    // Reanalysis
    reanalyse,
    reanalysing,
    lastAnalysedAt,
    daysSinceAnalysis,
    isStale,
    // Stats
    avgConfidence,
    hypeCount,
    assetsWithAICount: assetsWithAI.length,
  }
}