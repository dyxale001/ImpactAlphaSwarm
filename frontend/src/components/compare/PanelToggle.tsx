// The option pill that sits on the Compare charts' forest panel: the price
// chart's window and the tone chart's source. An option, not a tab, so it is a
// radio group, as the quant chart's window toggle is; lime marks the choice
// because the light page's forest fill would vanish on this ground.

export default function PanelToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center rounded-full border border-white/15 bg-white/5 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${
            value === o.id ? "bg-brand-accent text-brand-fg" : "text-white/70 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
