import { useEffect, useState } from 'react'
import { Plus, Check, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

interface Props {
  ticker: string
  /** On a dark forest card: light text and outline when not watched. */
  onDark?: boolean
}

export default function AddToWatchlistButton({ ticker, onDark = false }: Props) {
  const { session } = useAuthStore()
  const userId = session?.user?.id

  const [assetId, setAssetId]       = useState<string | null>(null)
  const [watchlistId, setWatchlistId] = useState<string | null>(null)
  const [isWatched, setIsWatched]   = useState(false)
  const [loading, setLoading]       = useState(true)
  const [working, setWorking]       = useState(false)

  // On mount — resolve the asset id and check watchlist status
  useEffect(() => {
    if (!userId || !ticker) return

    async function check() {
      setLoading(true)

      // 1. Get asset_id from ticker
      const { data: asset } = await supabase
        .from('assets')
        .select('id')
        .eq('ticker', ticker.toUpperCase())
        .maybeSingle()

      if (!asset) { setLoading(false); return }
      setAssetId(asset.id)

      // 2. Check if already in user's watchlist
      const { data: row } = await supabase
        .from('user_watchlist_assets')
        .select('id')
        .eq('user_id', userId)
        .eq('asset_id', asset.id)
        .maybeSingle()

      setIsWatched(!!row)
      setWatchlistId(row?.id ?? null)
      setLoading(false)
    }

    check()
  }, [userId, ticker])

  const handleClick = async () => {
    if (!userId || !assetId || working) return
    setWorking(true)

    if (isWatched && watchlistId) {
      // Remove
      await supabase
        .from('user_watchlist_assets')
        .delete()
        .eq('id', watchlistId)
      setIsWatched(false)
      setWatchlistId(null)
    } else {
      // Add
      const { data } = await supabase
        .from('user_watchlist_assets')
        // The ticker too, not only the asset link: readers that select the ticker
        // column (the run's watchlist merge, Compare's suggestions) skipped rows without it.
        .insert({ user_id: userId, asset_id: assetId, ticker: ticker.toUpperCase() })
        .select('id')
        .single()
      setIsWatched(true)
      setWatchlistId(data?.id ?? null)
    }

    setWorking(false)
  }

  // Don't render if asset not found in DB
  if (!loading && !assetId) return null

  return (
    <button
      onClick={handleClick}
      disabled={loading || working}
      title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
      // Watched used to be `text-brand-accent`, which is lime-500 (#c7f269) as
      // TEXT on a near-white card and effectively unreadable. The Discovered
      // chip uses the same green the other way round, as a fill behind dark
      // text, so it borrows that treatment here. Both states are chips so the
      // control does not change size when it is toggled.
      className={`chip transition-all disabled:opacity-50 ${
        isWatched
          ? 'chip-accent hover:bg-lime-300'
          : onDark
            ? 'bg-white/10 text-white ring-1 ring-inset ring-white/30 hover:bg-white/20'
            : 'chip-line hover:bg-forest-50'
      }`}
    >
      {loading || working ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : isWatched ? (
        <Check className="w-3 h-3" />
      ) : (
        <Plus className="w-3 h-3" />
      )}
      {isWatched ? 'Watching' : 'Watchlist'}
    </button>
  )
}