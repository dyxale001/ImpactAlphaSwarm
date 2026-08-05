import { Terminal } from 'lucide-react'

interface InvestorProfileCardProps {
  name: string
  archetype: string
  experience: string
  path: string
  sectors: string[]
  /** Smaller type/padding scale used by the landing page Journey Stop 01 */
  compact?: boolean
}

export default function InvestorProfileCard({
  name,
  archetype,
  experience,
  path,
  sectors,
  compact = false,
}: InvestorProfileCardProps) {
  const facts = [
    { label: 'Archetype', value: archetype },
    { label: 'Experience', value: experience },
    { label: 'Path', value: path },
  ]

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-forest-900 shadow-[0_32px_80px_rgba(17,35,32,0.18)]">
      {/* Wave motif pinned to the card bottom */}
      <svg
        viewBox={compact ? '0 0 520 280' : '0 0 520 320'}
        preserveAspectRatio="none"
        className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${compact ? 'h-[90px]' : 'h-[110px]'}`}
        aria-hidden="true"
      >
        {compact ? (
          <>
            <path d="M0,190 C90,165 180,215 280,195 C380,177 450,203 520,184 L520,280 L0,280 Z" className="fill-forest-600" opacity="0.55" />
            <path d="M0,232 C120,213 240,247 360,227 C440,214 490,232 520,224 L520,280 L0,280 Z" className="fill-lime-500" opacity="0.14" />
          </>
        ) : (
          <>
            <path d="M0,220 C90,190 180,250 280,225 C380,202 450,235 520,212 L520,320 L0,320 Z" className="fill-forest-600" opacity="0.55" />
            <path d="M0,268 C120,245 240,285 360,262 C440,247 490,268 520,258 L520,320 L0,320 Z" className="fill-lime-500" opacity="0.14" />
          </>
        )}
      </svg>

      {/* Header row */}
      <div className={`relative flex items-center justify-between border-b border-white/8 ${compact ? 'px-[26px] pt-5 pb-4' : 'px-8 pt-7 pb-6'}`}>
        <span className={`flex items-center font-extrabold tracking-[-0.03em] text-white ${compact ? 'gap-[7px] text-sm' : 'gap-2 text-[15px]'}`}>
          <Terminal size={compact ? 14 : 15} className="text-lime-500" strokeWidth={2} />
          AlphaSwarm
        </span>
        <span className={`font-semibold uppercase tracking-eyebrow text-neutral-100/50 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          Investor Profile
        </span>
      </div>

      <div className={`relative ${compact ? 'px-[26px] pt-[18px] pb-5' : 'px-8 pt-6 pb-7'}`}>
        <p className={`font-semibold uppercase tracking-eyebrow text-lime-500 ${compact ? 'mb-[3px] text-[10px]' : 'mb-1 text-[11px]'}`}>
          Mandate Holder
        </p>
        <h4 className={`font-medium tracking-tight text-white ${compact ? 'mb-4 text-[21px]' : 'mb-[22px] text-[26px]'}`}>
          {name}
        </h4>

        <div className={`grid grid-cols-3 ${compact ? 'mb-4 gap-3' : 'mb-[22px] gap-4'}`}>
          {facts.map((fact) => (
            <div key={fact.label}>
              <p className={`font-semibold uppercase tracking-[0.12em] text-neutral-100/45 ${compact ? 'mb-[3px] text-[9px]' : 'mb-1 text-[10px]'}`}>
                {fact.label}
              </p>
              <p className={`font-semibold text-white ${compact ? 'text-[13px]' : 'text-[15px]'}`}>{fact.value}</p>
            </div>
          ))}
        </div>

        <div>
          <p className={`font-semibold uppercase tracking-[0.12em] text-neutral-100/45 ${compact ? 'mb-1.5 text-[9px]' : 'mb-2 text-[10px]'}`}>
            Target Sectors
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sectors.map((sector) => (
              <span
                key={sector}
                className={`rounded-full border border-lime-500/30 bg-lime-500/12 font-semibold text-lime-500 ${compact ? 'px-2.5 py-[3px] text-[10px]' : 'px-3 py-1 text-[11px]'}`}
              >
                {sector}
              </span>
            ))}
          </div>
        </div>

        <div className={`flex items-center ${compact ? 'mt-4 gap-[7px]' : 'mt-6 gap-2'}`}>
          <span className={`rounded-full bg-lime-500 ${compact ? 'h-1.5 w-1.5' : 'h-[7px] w-[7px]'}`} />
          <span className={`font-semibold uppercase tracking-[0.08em] text-neutral-100/60 ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
            Mandate Active
          </span>
        </div>
      </div>
    </div>
  )
}
