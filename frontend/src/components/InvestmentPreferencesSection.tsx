import { Check, Cpu, Zap, TrendingUp, Bot, Heart, Shield, Activity, Flame, BookOpen, BarChart2, Brain } from 'lucide-react'

// ─── Data ──────────────────────────────────────────────────────────────────

const UNIVERSE_TILES = [
  { id: 'Technology',    Icon: Cpu,         desc: 'Software, hardware & semiconductors' },
  { id: 'Green Energy',  Icon: Zap,         desc: 'Solar, wind & clean infrastructure' },
  { id: 'Finance',       Icon: TrendingUp,  desc: 'Banks, fintech & asset management' },
  { id: 'AI & Robotics', Icon: Bot,         desc: 'Machine learning & automation' },
  { id: 'Healthcare',    Icon: Heart,       desc: 'Biotech, pharma & medical devices' },
]

const RISK_TILES = [
  { value: 'conservative', label: 'Conservative', Icon: Shield,   tagline: 'Protect first, grow second',   bars: 1 },
  { value: 'moderate',     label: 'Moderate',     Icon: Activity, tagline: 'Balanced growth & stability',  bars: 2 },
  { value: 'aggressive',   label: 'Aggressive',   Icon: Flame,    tagline: 'Maximum upside, accept swings', bars: 3 },
]

const EXPERTISE_TILES = [
  { value: 'novice',        label: 'Novice',        Icon: BookOpen,  numeral: 'I',   desc: 'Plain-language explanations, no jargon.' },
  { value: 'intermediate',  label: 'Intermediate',  Icon: BarChart2, numeral: 'II',  desc: 'Balanced analysis with key metrics.' },
  { value: 'advanced',      label: 'Advanced',      Icon: Brain,     numeral: 'III', desc: 'Full technical and quantitative detail.' },
]

// ─── Shared primitives ──────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-brand-muted-fg mb-2.5">
      {children}
    </p>
  )
}

function SelectionRing() {
  return (
    <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-brand-primary flex items-center justify-center animate-in zoom-in-75 duration-150">
      <Check size={9} strokeWidth={3.5} className="text-white" />
    </span>
  )
}

// Stacked bars showing volatility — height grows left to right
function VolBars({ filled }: { filled: number }) {
  const colors = ['bg-blue-400', 'bg-brand-primary', 'bg-semantic-danger']
  return (
    <div className="flex items-end gap-[3px] h-4">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`w-1 rounded-[2px] transition-all duration-200 ${n <= filled ? colors[filled - 1] : 'bg-brand-border/30'}`}
          style={{ height: `${28 + n * 24}%` }}
        />
      ))}
    </div>
  )
}

// ─── Props ──────────────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

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
    <section className="space-y-7">

      <div className="pb-4 border-b border-brand-border/40">
        <h2 className="text-sm font-semibold text-brand-fg tracking-tight">Investment Preferences</h2>
        <p className="text-xs text-brand-muted-fg mt-0.5">
          Changes apply on your next analysis run.
        </p>
      </div>

      {/* ── Target Sectors ─────────────────────────────── */}
      <div>
        <Label>Target Sectors</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {UNIVERSE_TILES.map(({ id, Icon, desc }) => {
            const on = formData.investment_universe.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleUniverse(id)}
                aria-pressed={on}
                className={`relative group text-left px-3.5 py-3 rounded-xl border transition-all duration-150 active:scale-[0.97] focus:outline-none ${
                  on
                    ? 'border-brand-primary/50 bg-brand-primary/5'
                    : 'border-brand-border/40 bg-brand-surface/20 hover:border-brand-border/70 hover:bg-brand-surface/40'
                }`}
              >
                {on && <SelectionRing />}

                {/* Icon container */}
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2.5 transition-colors ${
                  on ? 'bg-brand-primary/15' : 'bg-brand-border/20 group-hover:bg-brand-border/30'
                }`}>
                  <Icon size={13} className={on ? 'text-brand-primary' : 'text-brand-muted-fg'} strokeWidth={1.75} />
                </div>

                <p className={`text-xs font-semibold leading-tight ${on ? 'text-brand-fg' : 'text-brand-fg'}`}>
                  {id}
                </p>
                <p className="text-[10px] text-brand-muted-fg mt-0.5 leading-snug">{desc}</p>
              </button>
            )
          })}
        </div>
        {formData.investment_universe.length === 0 && (
          <p className="text-[11px] text-semantic-warning mt-2">Select at least one sector.</p>
        )}
      </div>

      {/* ── Risk Tolerance ─────────────────────────────── */}
      <div>
        <Label>Risk Tolerance</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {RISK_TILES.map(({ value, label, Icon, tagline, bars }) => {
            const on = formData.risk_tolerance === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => updateFormField('risk_tolerance', value)}
                aria-pressed={on}
                className={`relative group text-left px-3.5 py-3 rounded-xl border transition-all duration-150 active:scale-[0.97] focus:outline-none ${
                  on
                    ? 'border-brand-primary/50 bg-brand-primary/5'
                    : 'border-brand-border/40 bg-brand-surface/20 hover:border-brand-border/70 hover:bg-brand-surface/40'
                }`}
              >
                {on && <SelectionRing />}

                <div className="flex items-center justify-between mb-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    on ? 'bg-brand-primary/15' : 'bg-brand-border/20'
                  }`}>
                    <Icon size={13} className={on ? 'text-brand-primary' : 'text-brand-muted-fg'} strokeWidth={1.75} />
                  </div>
                  <VolBars filled={bars} />
                </div>

                <p className="text-xs font-semibold text-brand-fg">{label}</p>
                <p className="text-[10px] text-brand-muted-fg mt-0.5 leading-snug">{tagline}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Expertise Level ────────────────────────────── */}
      <div>
        <Label>Expertise Level</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {EXPERTISE_TILES.map(({ value, label, Icon, numeral, desc }) => {
            const on = formData.expertise_level === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => updateFormField('expertise_level', value)}
                aria-pressed={on}
                className={`relative group text-left px-3.5 py-3 rounded-xl border transition-all duration-150 active:scale-[0.97] focus:outline-none ${
                  on
                    ? 'border-brand-primary/50 bg-brand-primary/5'
                    : 'border-brand-border/40 bg-brand-surface/20 hover:border-brand-border/70 hover:bg-brand-surface/40'
                }`}
              >
                {on && <SelectionRing />}

                <div className="flex items-center gap-2 mb-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    on ? 'bg-brand-primary/15' : 'bg-brand-border/20'
                  }`}>
                    <Icon size={13} className={on ? 'text-brand-primary' : 'text-brand-muted-fg'} strokeWidth={1.75} />
                  </div>
                  <span className={`text-[10px] font-mono font-bold tracking-wider ${on ? 'text-brand-primary' : 'text-brand-muted-fg/50'}`}>
                    {numeral}
                  </span>
                </div>

                <p className="text-xs font-semibold text-brand-fg">{label}</p>
                <p className="text-[10px] text-brand-muted-fg mt-0.5 leading-snug">{desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Feedback ───────────────────────────────────── */}
      {appError && (
        <p role="alert" className="text-xs text-semantic-danger bg-semantic-danger/8 border border-semantic-danger/20 px-3 py-2.5 rounded-lg">
          {appError}
        </p>
      )}
      {appSuccess && (
        <p role="status" className="text-xs text-semantic-success bg-semantic-success/8 border border-semantic-success/20 px-3 py-2.5 rounded-lg">
          {appSuccess}
        </p>
      )}

      {/* ── Actions ────────────────────────────────────── */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={isAppSaving}
          className="flex-1 py-2 rounded-full bg-accent/90 hover:bg-accent/70 hover:shadow-glow-accent text-brand-fg text-sm font-semibold disabled:opacity-40 transition-all duration-200"
        >
          {isAppSaving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={isAppSaving}
          className="px-5 py-2 rounded-full border border-brand-border text-brand-muted-fg text-sm hover:text-brand-fg hover:border-brand-border/80 disabled:opacity-40 transition-all duration-200"
        >
          Reset
        </button>
      </div>

    </section>
  )
}
