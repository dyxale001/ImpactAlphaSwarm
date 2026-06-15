import { useAuthStore } from "../store/authStore"
import { useNavigate } from "react-router-dom"
import { useUserSettings } from "../hooks/useUserSettings"
import { UNIVERSE_OPTIONS } from "../utils/onboardingData"
import ChangePasswordSection from "../components/ChangePasswordSection"

export default function SettingsPage() {
  const { setSession } = useAuthStore()
  const navigate = useNavigate()

  const {
    formData,
    updateFormField,
    toggleUniverse,
    saveAccountInfo,
    resetAccountInfo,
    isAccountSaving,
    accountError,
    accountSuccess,
    saveInvestmentPrefs,
    resetInvestmentPrefs,
    isAppSaving,
    appError,
    appSuccess,
    email,
  } = useUserSettings()

  const handleSignOut = () => {
    setSession(null)
    navigate("/", { replace: true })
  }

  const onSubmitAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await saveAccountInfo()
  }

  const onSubmitApp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await saveInvestmentPrefs()
  }

  return (
    <div className="space-y-10 pt-10 px-8 pb-16 max-w-4xl mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-fg">Settings</h1>
          <p className="text-sm text-brand-muted-fg mt-1">Manage your account and app preferences.</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="px-4 py-2 rounded-full bg-danger/30 border border-danger hover:bg-danger hover:text-white text-semantic-danger text-sm transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* ── Account Management ───────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-brand-fg">Account Management</h2>
          <p className="text-xs text-brand-muted-fg mt-0.5">Update your personal details and security settings.</p>
        </div>

        <form onSubmit={onSubmitAccount} className="space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-brand-fg">Account Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-brand-muted-fg">First Name</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => updateFormField("first_name", e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-muted-fg">Last Name</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => updateFormField("last_name", e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-brand-surface border border-brand-border text-brand-fg focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
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

          {accountError && (
            <div role="alert" className="p-4 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-sm">
              {accountError}
            </div>
          )}
          {accountSuccess && (
            <div role="status" className="p-4 rounded-lg bg-semantic-success/10 border border-semantic-success/20 text-semantic-success text-sm">
              {accountSuccess}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={isAccountSaving}
              className="flex-1 px-4 py-2 rounded-full bg-accent/95 hover:shadow-glow-accent text-brand-fg font-medium hover:bg-accent/70 disabled:opacity-50"
            >
              {isAccountSaving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={resetAccountInfo}
              disabled={isAccountSaving}
              className="flex-1 px-4 py-2 rounded-full bg-brand-surface border border-brand-border hover:bg-brand-border/30 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>

        <ChangePasswordSection />
      </section>

      {/* ── App Settings ─────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-brand-fg">App Settings</h2>
          <p className="text-xs text-brand-muted-fg mt-0.5">Customize your investment preferences and experience.</p>
        </div>

        <form onSubmit={onSubmitApp} className="space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-primary">Investment Preferences</h3>

            <div>
              <label className="text-xs font-medium text-primary">Risk Tolerance</label>
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
              <label className="text-xs font-medium text-primary">Expertise Level</label>
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
              <label className="text-xs font-medium text-primary">Investment Universe</label>
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
                          : "bg-brand-secondary/5 border-brand-border/60 text-brand-muted-fg hover:border-brand-primary/40 hover:text-brand-fg"
                      }`}
                    >
                      {item}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-brand-muted-fg mt-2">Click to toggle selection.</p>
            </div>
          </div>

          {appError && (
            <div role="alert" className="p-4 rounded-lg bg-semantic-danger/10 border border-semantic-danger/20 text-semantic-danger text-sm">
              {appError}
            </div>
          )}
          {appSuccess && (
            <div role="status" className="p-4 rounded-lg bg-semantic-success/10 border border-semantic-success/20 text-semantic-success text-sm">
              {appSuccess}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={isAppSaving}
              className="flex-1 px-4 py-2 rounded-full bg-accent/95 hover:shadow-glow-accent text-brand-fg font-medium hover:bg-accent/70 disabled:opacity-50"
            >
              {isAppSaving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={resetInvestmentPrefs}
              disabled={isAppSaving}
              className="flex-1 px-4 py-2 rounded-full bg-brand-surface border border-brand-border hover:bg-brand-border/30 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </section>

    </div>
  )
}
