import { useId, useState, type ComponentType, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, Info } from 'lucide-react';

// The building blocks the "How it's calculated" sections share, in the same
// visual language as the "About this page" dialogs: soft forest-50 insets,
// numbered pipelines and small diagrams instead of long runs of prose.

type Icon = ComponentType<{ className?: string }>;

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-bold tracking-[-0.01em] text-forest-900">{title}</h3>
      {children}
    </section>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="text-base leading-relaxed text-forest-900">{children}</p>;
}

export function Body({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-brand-muted-fg">{children}</p>;
}

export function Strong({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-forest-900">{children}</span>;
}

/** Numbered steps across the width, with arrows between them from sm up. */
export function Steps({ steps }: { steps: { icon: Icon; title: string; body: ReactNode }[] }) {
  const cols = steps.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4';
  return (
    <ol className={`grid gap-2 ${cols}`}>
      {steps.map((step, i) => (
        <li key={step.title} className="as-inset relative flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-brand-accent" aria-hidden="true">
              <step.icon className="h-4 w-4" />
            </span>
            <h4 className="text-sm font-bold text-forest-900">
              <span className="sr-only">Step {i + 1}: </span>
              {step.title}
            </h4>
          </div>
          <div className="text-xs leading-relaxed text-brand-muted-fg">{step.body}</div>
          {i < steps.length - 1 && (
            <ArrowRight className="absolute -right-2.5 top-5 z-10 hidden h-4 w-4 rounded-full bg-white text-forest-500 sm:block" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}

/** Headline figures, each with a short label. */
export function Figures({ figures }: { figures: { value: string; label: string }[] }) {
  return (
    <dl className={`grid grid-cols-2 gap-2 ${figures.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
      {figures.map(f => (
        <div key={f.label} className="as-inset flex flex-col-reverse gap-1 p-3">
          <dt className="text-xs text-brand-muted-fg">{f.label}</dt>
          <dd className="text-xl font-bold tabular-nums tracking-[-0.01em] text-forest-900">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A titled card in a two-column grid. */
export function Cards({ cards }: { cards: { icon?: Icon; title: string; body: ReactNode; extra?: ReactNode }[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {cards.map(card => (
        <div key={card.title} className="as-inset flex flex-col gap-2 p-4">
          <h4 className="flex items-center gap-2 text-sm font-bold text-forest-900">
            {card.icon && <card.icon className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />}
            {card.title}
          </h4>
          <div className="text-xs leading-relaxed text-brand-muted-fg">{card.body}</div>
          {card.extra}
        </div>
      ))}
    </div>
  );
}

/** One bar split into labelled shares that add up to 100. */
export function ShareBar({ parts, label }: { parts: { label: string; pct: number; className: string }[]; label: string }) {
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label={`${label}: ${parts.map(p => `${p.label} ${p.pct}%`).join(', ')}`}>
        {parts.map(p => <div key={p.label} className={p.className} style={{ width: `${p.pct}%` }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-muted-fg" aria-hidden="true">
        {parts.map(p => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${p.className}`} />
            {p.label} <span className="font-semibold tabular-nums text-forest-900">{p.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Labelled bands along a scale, equal width, each with its range underneath. */
export function BandStrip({ bands, label }: { bands: { name: string; range: string; className: string }[]; label: string }) {
  return (
    <div role="img" aria-label={`${label}: ${bands.map(b => `${b.name}, ${b.range}`).join('; ')}`}>
      <div className="flex gap-1" aria-hidden="true">
        {bands.map(b => (
          <div key={b.name} className="min-w-0 flex-1">
            <div className={`flex h-9 items-center justify-center rounded-lg px-1 text-center text-xs font-semibold leading-tight ${b.className}`}>{b.name}</div>
            <p className="mt-1 text-center text-xs tabular-nums text-brand-muted-fg">{b.range}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A plain note: an info line on the soft inset. */
export function Note({ children, icon: NoteIcon = Info }: { children: ReactNode; icon?: Icon }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[12px] border border-forest-900/10 p-3.5">
      <NoteIcon className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
      <div className="text-sm leading-relaxed text-brand-muted-fg">{children}</div>
    </div>
  );
}

/** Secondary detail, closed by default so the section reads at a glance. */
export function MoreDetail({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-t border-forest-900/10 pt-4">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls={id}
        className="flex items-center gap-1.5 text-sm font-bold text-forest-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
        {title}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <div id={id} hidden={!open} className="mt-3 space-y-3 text-sm leading-relaxed text-brand-muted-fg">{children}</div>
    </div>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-forest-500" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
