import { useState } from 'react'
import { useChangePassword } from '../hooks/useChangePassword'
import SettingsCard from './settings/SettingsCard'
import { PrimaryButton, SecondaryButton, TextButton } from './settings/SettingsButtons'
import { PASSWORD_CARD_LEAD, PASSWORD_CARD_TITLE, RETAKE_SAVING } from '../utils/settingsCopy'

const INPUT =
  'mt-1 w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-fg focus:outline-none focus:ring-2 focus:ring-brand-primary/40'

export default function ChangePasswordSection() {
  const [isOpen, setIsOpen] = useState(false)
  const {
    currentPassword, setCurrentPassword,
    newPassword, setNewPassword,
    confirmPassword, setConfirmPassword,
    isLoading,
    error,
    successMessage,
    changePassword,
    reset,
  } = useChangePassword()

  const handleCancel = () => {
    reset()
    setIsOpen(false)
  }

  return (
    <SettingsCard
      id="password"
      title={PASSWORD_CARD_TITLE}
      lead={PASSWORD_CARD_LEAD}
      error={error}
      success={successMessage}
      consequence={<span />}
      actions={
        isOpen ? (
          <>
            <TextButton onClick={handleCancel} disabled={isLoading}>
              Cancel
            </TextButton>
            <PrimaryButton type="submit" form="change-password-form" disabled={isLoading}>
              {isLoading ? RETAKE_SAVING : 'Update password'}
            </PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={() => setIsOpen(true)} aria-expanded={false} aria-controls="change-password-form">
            Change password
          </SecondaryButton>
        )
      }
    >
      {isOpen && (
        <form id="change-password-form" onSubmit={changePassword} className="space-y-4">
          <div>
            <label htmlFor="settings-current-password" className="text-xs font-medium text-brand-muted-fg">
              Current password
            </label>
            <input
              id="settings-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={INPUT}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="settings-new-password" className="text-xs font-medium text-brand-muted-fg">
                New password
              </label>
              <input
                id="settings-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                className={INPUT}
              />
              <p className="mt-1 text-xs text-brand-muted-fg">
                At least 8 characters, with upper and lower case, a number and a symbol.
              </p>
            </div>

            <div>
              <label htmlFor="settings-confirm-password" className="text-xs font-medium text-brand-muted-fg">
                Confirm new password
              </label>
              <input
                id="settings-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className={INPUT}
              />
            </div>
          </div>
        </form>
      )}
    </SettingsCard>
  )
}
