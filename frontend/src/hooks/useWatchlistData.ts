

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TopPick {
  asset_id: string
  ticker: string
  name: string
  rank: number
  confidenceScore: number
  sentimentScore: number
  quantScore: number
  reasoning: string
  isHype: boolean
  priceAtRun: number
  universe: string
}

export interface WatchlistAsset {
  id: string           // user_watchlist_assets row id
  asset_id: string | null
  ticker: string
  name: string
  current_price: number  // from assets table, overridden by live yfinance price
  universe: string
  addedAt?: string
}

export interface AssetSearchResult {
  ticker: string
  name: string
  current_price: number
  universe: string
  asset_id: string | null
  source: 'db' | 'live'
}

export type SortOption = 'added' | 'ticker' | 'universe'

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useWatchlistData() {
  const { session } = useAuthStore()
  const userId = session?.user?.id
  const BASE   = (import.meta as any).env?.VITE_API_BASE ?? ''

  const [topPicks, setTopPicks]             = useState<TopPick[]>([])
  const [allRanked, setAllRanked]           = useState<TopPick[]>([])
  const [showAllRanked, setShowAllRanked]   = useState(false)
  const [watchedAssets, setWatchedAssets]   = useState<WatchlistAsset[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [search, setSearch]                 = useState('')
  const [searchResults, setSearchResults]   = useState<AssetSearchResult[]>([])
  const [searchLoading, setSearchLoading]   = useState(false)
  const [removing, setRemoving]             = useState<Set<string>>(new Set())
  const [sortBy, setSortBy]                 = useState<SortOption>('added')
  const [sectorFilter, setSectorFilter]     = useState('All')

  // ── Fetch watchlist ───────────────────────────────────────────────────
  const fetchWatchlist = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    setError(null)

    const { data: rows, error: wErr } = await supabase
      .from('user_watchlist_assets')
      .select('id, asset_id, ticker, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (wErr) { setError(wErr.message); setLoading(false); return }
    if (!rows || rows.length === 0) { setWatchedAssets([]); setLoading(false); return }

    // Resolve asset details from the assets table where possible
    const assetIds = rows.map(r => r.asset_id).filter(Boolean)
    const assetMap = new Map<string, any>()

    if (assetIds.length > 0) {
      const { data: assets } = await supabase
        .from('assets')
        .select('id, ticker, name, current_price, universe')
        .in('id', assetIds)
      ;(assets || []).forEach(a => assetMap.set(a.id, a))
    }

    setWatchedAssets(
      rows.map(row => {
        const asset = assetMap.get(row.asset_id)
        // Prefer ticker stored directly on the row (migration applied),
        // fall back to the joined asset ticker, then asset_id as last resort
        const ticker = row.ticker || asset?.ticker || row.asset_id || '?'
        return {
          id:            row.id,
          asset_id:      row.asset_id,
          ticker:        ticker.toUpperCase(),
          name:          asset?.name || ticker,
          current_price: asset?.current_price || 0,
          universe:      asset?.universe || '',
          addedAt:       row.created_at,
        }
      })
    )
    // Fetch top 4 from latest completed AI run
    const { data: latestRun } = await supabase
      .from('ai_runs')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestRun?.id) {
      const { data: recs } = await supabase
        .from('ai_recommendation')
        .select('asset_id, rank, confidence_score, sentiment_score, quant_score, reasoning_trace, hype_penalty, price_at_run')
        .eq('run_id', latestRun.id)
        .order('rank', { ascending: true })

      if (recs && recs.length > 0) {
        const recAssetIds = recs.map((r: any) => r.asset_id).filter(Boolean)
        const { data: recAssets } = await supabase
          .from('assets')
          .select('id, ticker, name, universe')
          .in('id', recAssetIds)
        const recAssetMap = new Map((recAssets || []).map((a: any) => [a.id, a]))

        const mapped: TopPick[] = recs.map((r: any) => {
          const a: any = recAssetMap.get(r.asset_id) || {}
          return {
            asset_id:       r.asset_id,
            ticker:         a.ticker || '',
            name:           a.name || '',
            rank:           r.rank,
            confidenceScore: r.confidence_score ?? 0,
            sentimentScore:  r.sentiment_score  ?? 0,
            quantScore:      r.quant_score      ?? 0,
            reasoning:       r.reasoning_trace  ?? '',
            isHype:          (r.hype_penalty    ?? 0) < 0,
            priceAtRun:      r.price_at_run     ?? 0,
            universe:        a.universe         ?? '',
          }
        }).filter((p: TopPick) => p.ticker)

        setTopPicks(mapped.slice(0, 5))
        setAllRanked(mapped)
      }
    }

    setLoading(false)
  }, [userId])

  useEffect(() => { fetchWatchlist() }, [fetchWatchlist])

  // Refresh on tab focus
  useEffect(() => {
    const onFocus = () => fetchWatchlist()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchWatchlist])

  // ── Live search (backend endpoint — DB + yfinance) ───────────────────
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const watchedTickers = new Set(watchedAssets.map(a => a.ticker))
        const res  = await fetch(`${BASE}/api/assets/search?q=${encodeURIComponent(search)}`)
        const data = res.ok ? await res.json() : { results: [] }
        setSearchResults(
          (data.results || []).filter((r: AssetSearchResult) => !watchedTickers.has(r.ticker))
        )
      } catch {
        setSearchResults([])
      }
      setSearchLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, watchedAssets, BASE])

  // ── Add ───────────────────────────────────────────────────────────────
const addToWatchlist = async (result: AssetSearchResult) => {
  if (!userId) return
  const { error } = await supabase
    .from('user_watchlist_assets')
    .insert({
      user_id:  userId,
      ticker:   result.ticker,
      ...(result.asset_id ? { asset_id: result.asset_id } : {}),
    })
  if (error) { setError(`Failed to add: ${error.message}`); return }
  setSearch('')
  await fetchWatchlist()
}

  // ── Remove ────────────────────────────────────────────────────────────
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
    setRemoving(prev => { const n = new Set(prev); n.delete(watchlistId); return n })
  }

  // ── Sort + filter ─────────────────────────────────────────────────────
  const displayedAssets = useMemo(() => {
    let list = [...watchedAssets]
    if (sectorFilter !== 'All') list = list.filter(a => a.universe === sectorFilter)
    list.sort((a, b) => {
      if (sortBy === 'ticker')   return a.ticker.localeCompare(b.ticker)
      if (sortBy === 'universe') return (a.universe || '').localeCompare(b.universe || '')
      return (b.addedAt || '').localeCompare(a.addedAt || '')  // added (default)
    })
    return list
  }, [watchedAssets, sectorFilter, sortBy])

  const sectors = ['All', ...Array.from(new Set(watchedAssets.map(a => a.universe).filter(Boolean)))]

  return {
    topPicks,
    allRanked,
    showAllRanked,
    setShowAllRanked,
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
    sortBy,
    setSortBy,
    sectorFilter,
    setSectorFilter,
    sectors,
  }
}