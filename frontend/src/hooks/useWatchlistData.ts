/**
 * useWatchlistData — General asset library hook.
 *
 * The watchlist is intentionally NOT a separate analysis run.
 * It is a simple library of assets the user wants to track.
 * Personalisation (AI scores, recommendations) lives on the dashboard.
 *
 * Persistence: when the assets table is refreshed by a scheduled run, a user's
 * watched entries can become orphaned. The hook falls back to live yfinance data
 * for price display so cards never go blank.
 *
 * Migration recommended (run once in Supabase SQL editor):
 *   ALTER TABLE user_watchlist_assets ADD COLUMN IF NOT EXISTS ticker TEXT;
 *   UPDATE user_watchlist_assets wa
 *     SET ticker = a.ticker FROM assets a WHERE wa.asset_id = a.id;
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

// ─── Types ─────────────────────────────────────────────────────────────────

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