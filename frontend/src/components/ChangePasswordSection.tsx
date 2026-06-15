import { useState } from 'react'
import { useChangePassword } from '../hooks/useChangePassword'

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
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-brand-fg">Password</h2>
        <button
          type="button"
          onClick={() => { if (isOpen) handleCancel(); else setIsOpen(true) }}
          className="text-xs text-brand-primary hover:underline focus:outline-none"
        >
          {isOpen ? 'Cancel' : 'Change password'}
        </button>
      </div>

      {!isOpen && (
        <p className="text-xs text-brand-muted-fg tracking-widest">••••••••</p>
      )}

      {isOpen && (
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-brand-muted-fg">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-brand-muted-fg">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
            />
            <p className="text-xs text-brand-muted-fg mt-1">
              Min. 8 characters with uppercase, lowercase, number, and special character.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-brand-muted-fg">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
            />
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-xs">
              {error}
            </div>
          )}
          {successMessage && (
            <div role="status" className="p-3 rounded-lg bg-semantic-success/10 border border-semantic-success/20 text-semantic-success text-xs">
              {successMessage}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 rounded-full bg-accent/95 hover:shadow-glow-accent text-brand-fg font-medium hover:bg-accent/70 text-sm disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Update Password'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2 rounded-full bg-brand-surface border border-brand-border hover:bg-brand-border/30 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
