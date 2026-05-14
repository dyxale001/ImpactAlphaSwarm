import { useAuthStore } from "../store/authStore"
import { useNavigate } from "react-router-dom"
import { useUserSettings } from "../hooks/useUserSettings"
import { UNIVERSE_OPTIONS } from "../utils/onboardingData"

export default function SettingsPage() {
  const { setSession } = useAuthStore()
  const navigate = useNavigate()

  const {
    formData,
    updateFormField,
    toggleUniverse,
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveChanges()
  }

  return (
    <div className="space-y-6 pt-10 px-8 pb-10 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-brand-fg">Settings</h1>
        <p className="text-sm text-brand-muted-fg mt-2">Manage your account and preferences.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-brand-fg">Account Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-brand-muted-fg">First Name</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => updateFormField("first_name", e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-brand-muted-fg">Last Name</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => updateFormField("last_name", e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg"
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
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { value: 'aggressive', label: 'Aggressive' },
                { value: 'moderate', label: 'Moderate' },
                { value: 'conservative', label: 'Conservative' },
              ].map((opt) => {
                const selected = formData.risk_tolerance === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateFormField('risk_tolerance', opt.value)}
                    aria-pressed={selected}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-150 border focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                      selected
                        ? 'bg-brand-primary border-brand-primary text-white shadow-glow-primary'
                        : 'bg-brand-surface border-brand-border text-brand-fg hover:border-brand-primary/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>

            <label className="text-xs font-medium text-brand-muted-fg">Expertise Level</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { value: 'novice', label: 'Novice' },
                { value: 'intermediate', label: 'Intermediate' },
                { value: 'advanced', label: 'Advanced' },
              ].map((opt) => {
                const selected = formData.expertise_level === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateFormField('expertise_level', opt.value)}
                    aria-pressed={selected}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-150 border focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                      selected
                        ? 'bg-brand-primary border-brand-primary text-white shadow-glow-primary'
                        : 'bg-brand-surface border-brand-border text-brand-fg hover:border-brand-primary/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            
            
          </div>

          <div>
            <label className="text-xs font-medium text-brand-muted-fg">Investment Universe</label>

            <div className="mt-2 flex flex-wrap gap-2.5">
              {UNIVERSE_OPTIONS.map((item) => {
                const isSelected = formData.investment_universe.includes(item)
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleUniverse(item)}
                    className={`px-4 py-2.5 rounded-full text-xs font-medium transition-all duration-200 border ${
                      isSelected
                        ? "bg-brand-primary border-brand-primary text-white shadow-glow-primary"
                        : "bg-brand-secondary/40 border-brand-border/60 text-brand-muted-fg hover:border-brand-primary/40 hover:text-brand-fg"
                    }`}
                  >
                    {item}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-brand-muted-fg mt-2">Click a Investment Universe to toggle selection.</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-sm">
            {error}
          </div>
        )}
        {successMessage && (
          <div role="status" className="p-4 rounded-lg bg-semantic-success/10 border border-semantic-success/20 text-semantic-success text-sm">
            {successMessage}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="submit" disabled={isSaving} className="flex-1 px-4 py-2 rounded-full bg-brand-primary text-white">
            {isSaving ? "Saving..." : "Save Changes"}
          </button>

          <button type="button" onClick={resetChanges} disabled={isSaving} className="flex-1 px-4 py-2 rounded-full bg-brand-surface border border-brand-border">
            Cancel
          </button>

          <button type="button" onClick={handleSignOut} className="px-4 py-2 rounded-full bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger">
            Sign out
          </button>
        </div>
      </form>
    </div>
  )
}