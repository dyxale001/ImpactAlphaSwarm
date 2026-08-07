import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { deactivateOwnAccount } from '../services/api/analysis'

export default function DeactivateAccountSection() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    const ok = window.confirm(
      "Deactivate your account?\n\nYou'll be signed out immediately. Sign back in whenever you want to reactivate."
    )
    if (!ok) return

    setLoading(true)
    setError(null)
    try {
      await deactivateOwnAccount()
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (err: any) {
      setError(err?.message ?? 'Could not deactivate account. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="glass-card p-6 space-y-4 border-semantic-danger/25">
      <div>
        <h3 className="text-sm font-semibold text-semantic-danger">Deactivate Account</h3>
        <p className="text-xs text-brand-muted-fg mt-1 leading-relaxed">
          Deactivating hides your account and signs you out immediately.
          Your data is kept. You can reactivate at any time by signing back in.
        </p>
      </div>

      {error && <p className="text-xs text-semantic-danger">{error}</p>}

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 rounded-full border border-semantic-danger/40 text-semantic-danger text-sm font-medium hover:bg-semantic-danger/10 transition-colors disabled:opacity-40"
      >
        {loading ? 'Deactivating…' : 'Deactivate my account'}
      </button>
    </div>
  )
}