import { useAuthStore } from "../store/authStore"
import { useNavigate } from "react-router-dom"
import { useUserSettings } from "../hooks/useUserSettings"

export default function SettingsPage() {
  const { setSession } = useAuthStore()
  const navigate = useNavigate()

  const {
    formData,
    updateFormField,
    saveChanges,
    resetChanges,
    isSaving,
    error,
    successMessage,
    email,
  } = useUserSettings()

  const handleSignOut = () => {
    setSession(null)
    navigate("/", { replace: true })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveChanges()
  }

  return (
    <div className="space-y-6 pt-10 px-8 pb-10 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-brand-fg">Settings</h1>
        <p className="text-sm text-brand-muted-fg mt-2">
          Manage your account and preferences.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-brand-fg">Account Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-brand-muted-fg">First Name</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => updateFormField("first_name", e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg placeholder-brand-muted-fg focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-brand-muted-fg">Last Name</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => updateFormField("last_name", e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg placeholder-brand-muted-fg focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-brand-muted-fg">Email</label>
            <input
              type="email"
              value={email}
              disabled
              className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-muted-fg opacity-60 cursor-not-allowed"
            />
            <p className="text-xs text-brand-muted-fg mt-1">Email cannot be changed</p>
          </div>
        </div>

        <div className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-brand-fg">Investment Preferences</h2>

          <div>
            <label className="text-xs font-medium text-brand-muted-fg">Risk Tolerance</label>
            <select
              value={formData.risk_tolerance}
              onChange={(e) => updateFormField("risk_tolerance", e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="aggressive">Aggressive</option>
              <option value="moderate">Moderate</option>
              <option value="conservative">Conservative</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-brand-muted-fg">Expertise Level</label>
            <select
              value={formData.expertise_level}
              onChange={(e) => updateFormField("expertise_level", e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="novice">Novice</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-4 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-sm"
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="p-4 rounded-lg bg-semantic-success/10 border border-semantic-success/20 text-semantic-success text-sm"
          >
            {successMessage}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 px-4 py-2 rounded-full bg-brand-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>

          <button
            type="button"
            onClick={resetChanges}
            disabled={isSaving}
            className="flex-1 px-4 py-2 rounded-full bg-brand-surface border border-brand-border text-brand-fg text-sm font-medium hover:bg-brand-border/20 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="px-4 py-2 rounded-full bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-sm hover:bg-semantic-danger/20 transition-colors"
          >
            Sign out
          </button>
        </div>
      </form>
    </div>
  )
}