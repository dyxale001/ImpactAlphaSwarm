import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { deactivateOwnAccount } from '../services/api/analysis'
import SettingsCard from './settings/SettingsCard'
import { DangerButton, DangerOutlineButton, TextButton } from './settings/SettingsButtons'
import {
  DEACTIVATE_ACTION,
  DEACTIVATE_CARD_LEAD,
  DEACTIVATE_CARD_TITLE,
  DEACTIVATE_CONFIRM,
  DEACTIVATE_CONSEQUENCE,
  DEACTIVATE_KEEP,
  DEACTIVATE_WORKING,
} from '../utils/settingsCopy'

/**
 * Deactivate, never delete: the account is hidden and the login blocked, the
 * data kept, and signing back in reverses it. The confirmation is inline
 * rather than a browser dialog so the card can say, in its own words, exactly
 * what is about to happen.
 */
export default function DeactivateAccountSection() {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDeactivate = async () => {
    setLoading(true)
    setError(null)
    try {
      await deactivateOwnAccount()
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (err: any) {
      setError(err?.message ?? 'Could not deactivate the account. Please try again.')
      setLoading(false)
    }
  }

  return (
    <SettingsCard
      id="deactivate"
      title={DEACTIVATE_CARD_TITLE}
      lead={DEACTIVATE_CARD_LEAD}
      tone="danger"
      error={error}
      consequence={DEACTIVATE_CONSEQUENCE}
      actions={
        confirming ? (
          <>
            <TextButton onClick={() => setConfirming(false)} disabled={loading}>
              {DEACTIVATE_KEEP}
            </TextButton>
            <DangerButton onClick={() => void handleDeactivate()} disabled={loading}>
              {loading ? DEACTIVATE_WORKING : DEACTIVATE_CONFIRM}
            </DangerButton>
          </>
        ) : (
          <DangerOutlineButton onClick={() => setConfirming(true)}>{DEACTIVATE_ACTION}</DangerOutlineButton>
        )
      }
    />
  )
}
