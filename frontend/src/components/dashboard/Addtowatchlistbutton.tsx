import { useEffect, useState } from 'react'
import { Plus, Check, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

interface Props {
  ticker: string
}

export default function AddToWatchlistButton({ ticker }: Props) {
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
        .insert({ user_id: userId, asset_id: assetId })
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
      className={`flex items-center gap-1 text-xs font-semibold transition-all disabled:opacity-50 ${
        isWatched
          ? 'text-brand-accent hover:text-brand-accent/70'
          : 'text-brand-muted-fg hover:text-brand-fg'
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