import { Check } from 'lucide-react'

// ─── Data ──────────────────────────────────────────────────────────────────

const UNIVERSE_TILES = [
  { id: 'Technology',   icon: '💻', desc: 'Software, hardware & chips' },
  { id: 'Green Energy', icon: '⚡', desc: 'Solar, wind & clean infra' },
  { id: 'Finance',      icon: '📈', desc: 'Banks, fintech & asset mgmt' },
  { id: 'AI & Robotics',icon: '🤖', desc: 'Machine learning & automation' },
  { id: 'Healthcare',   icon: '🧬', desc: 'Biotech, pharma & medtech' },
]

const RISK_TILES = [
  {
    value: 'conservative',
    label: 'Conservative',
    icon: '🛡️',
    tagline: 'Protect first, grow second',
    bars: 1,
    barColor: 'bg-blue-400',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    icon: '⚖️',
    tagline: 'Balanced growth & stability',
    bars: 2,
    barColor: 'bg-brand-primary',
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    icon: '🚀',
    tagline: 'Max upside, accept swings',
    bars: 3,
    barColor: 'bg-semantic-danger',
  },
]

const EXPERTISE_TILES = [
  {
    value: 'novice',
    label: 'Novice',
    icon: '🌱',
    desc: 'AI explains in plain language, no jargon.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    icon: '📊',
    desc: 'Balanced analysis with key metrics.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    icon: '💎',
    desc: 'Full quant detail, technical breakdowns.',
  },
]

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold tracking-widest uppercase text-brand-muted-fg mb-3">
      {children}
    </p>
  )
}

// Animated checkmark badge that appears on selected tiles
function SelectedBadge() {
  return (
    <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-brand-primary flex items-center justify-center shadow-[0_0_8px_rgba(194,102,84,0.6)] animate-in zoom-in-75 duration-200">
      <Check size={11} strokeWidth={3} className="text-white" />
    </span>
  )
}

// Volatility bars (1–3 filled)
function VolatilityBars({ filled, color }: { filled: number; color: string }) {
  return (
    <div className="flex items-end gap-1 h-5">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`w-1.5 rounded-sm transition-all duration-300 ${
            n <= filled ? color : 'bg-brand-border/40'
          }`}
          style={{ height: `${n * 33}%` }}
        />
      ))}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

interface Props {
  formData: {
    risk_tolerance: string
    expertise_level: string
    investment_universe: string[]
  }
  updateFormField: (field: string, value: string) => void
  toggleUniverse: (item: string) => void
  isAppSaving: boolean
  appError: string | null
  appSuccess: string | null
  onSave: () => void
  onReset: () => void
}

export default function InvestmentPreferencesSection({
  formData,
  updateFormField,
  toggleUniverse,
  isAppSaving,
  appError,
  appSuccess,
  onSave,
  onReset,
}: Props) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-brand-fg">Investment Preferences</h2>
        <p className="text-xs text-brand-muted-fg mt-0.5">
          Tap to select. These shape your AI recommendations.
        </p>
      </div>

      {/* ── Universe ─────────────────────────────────── */}
      <div>
        <SectionLabel>Target Sectors</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {UNIVERSE_TILES.map((tile) => {
            const selected = formData.investment_universe.includes(tile.id)
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => toggleUniverse(tile.id)}
                aria-pressed={selected}
                className={`relative text-left p-4 rounded-2xl border transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-primary/40 ${
                  selected
                    ? 'border-brand-primary/60 bg-brand-primary/8 shadow-[0_0_20px_rgba(194,102,84,0.15)]'
                    : 'border-brand-border/50 bg-brand-surface/30 hover:border-brand-border hover:bg-brand-surface/60'
                }`}
              >
                {selected && <SelectedBadge />}
                <span className="text-2xl mb-2 block">{tile.icon}</span>
                <p className={`text-sm font-semibold leading-tight ${selected ? 'text-brand-fg' : 'text-brand-fg'}`}>
                  {tile.id}
                </p>
                <p className="text-[11px] text-brand-muted-fg mt-0.5 leading-snug">{tile.desc}</p>
              </button>
            )
          })}
        </div>
        {formData.investment_universe.length === 0 && (
          <p className="text-xs text-semantic-warning mt-2">Select at least one sector to enable analysis.</p>
        )}
      </div>

      {/* ── Risk Tolerance ───────────────────────────── */}
      <div>
        <SectionLabel>Risk Tolerance</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {RISK_TILES.map((tile) => {
            const selected = formData.risk_tolerance === tile.value
            return (
              <button
                key={tile.value}
                type="button"
                onClick={() => updateFormField('risk_tolerance', tile.value)}
                aria-pressed={selected}
                className={`relative text-left p-4 rounded-2xl border transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-primary/40 ${
                  selected
                    ? 'border-brand-primary/60 bg-brand-primary/8 shadow-[0_0_20px_rgba(194,102,84,0.15)]'
                    : 'border-brand-border/50 bg-brand-surface/30 hover:border-brand-border hover:bg-brand-surface/60'
                }`}
              >
                {selected && <SelectedBadge />}
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{tile.icon}</span>
                  <VolatilityBars filled={tile.bars} color={tile.barColor} />
                </div>
                <p className="text-sm font-semibold text-brand-fg">{tile.label}</p>
                <p className="text-[11px] text-brand-muted-fg mt-0.5 leading-snug">{tile.tagline}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Expertise Level ──────────────────────────── */}
      <div>
        <SectionLabel>Expertise Level</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {EXPERTISE_TILES.map((tile) => {
            const selected = formData.expertise_level === tile.value
            return (
              <button
                key={tile.value}
                type="button"
                onClick={() => updateFormField('expertise_level', tile.value)}
                aria-pressed={selected}
                className={`relative text-left p-4 rounded-2xl border transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-primary/40 ${
                  selected
                    ? 'border-brand-primary/60 bg-brand-primary/8 shadow-[0_0_20px_rgba(194,102,84,0.15)]'
                    : 'border-brand-border/50 bg-brand-surface/30 hover:border-brand-border hover:bg-brand-surface/60'
                }`}
              >
                {selected && <SelectedBadge />}
                <span className="text-2xl mb-2 block">{tile.icon}</span>
                <p className="text-sm font-semibold text-brand-fg">{tile.label}</p>
                <p className="text-[11px] text-brand-muted-fg mt-0.5 leading-snug">{tile.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Feedback & Save ──────────────────────────── */}
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

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={isAppSaving}
          className="flex-1 px-4 py-2 rounded-full bg-accent/95 hover:shadow-glow-accent text-brand-fg font-medium hover:bg-accent/70 disabled:opacity-50 transition-all"
        >
          {isAppSaving ? 'Saving…' : 'Save Preferences'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={isAppSaving}
          className="flex-1 px-4 py-2 rounded-full bg-brand-surface border border-brand-border hover:bg-brand-border/30 disabled:opacity-50 transition-all"
        >
          Reset
        </button>
      </div>
    </section>
  )
}
