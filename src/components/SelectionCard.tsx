interface SelectionCardProps {
  isSelected: boolean;
  onClick: () => void;
  label: string;
  desc?: string;
  colorClass?: string;
}

export default function SelectionCard({ 
  isSelected, 
  onClick, 
  label, 
  desc, 
  colorClass = "hover:border-brand-accent" 
}: SelectionCardProps) {
  return (
    <button 
      type="button" 
      onClick={onClick}
      className={`p-3 rounded-xl border text-left transition-all duration-200 flex flex-col gap-1 group
        ${isSelected ? 'bg-brand-secondary border-brand-accent shadow-glow-accent' : `bg-brand-bg/50 border-brand-border ${colorClass}`}`}
    >
      <div className="flex justify-between items-center w-full">
        <span className={`font-bold text-sm ${isSelected ? 'text-brand-fg' : 'text-brand-muted-fg group-hover:text-brand-fg'}`}>
          {label}
        </span>
        <div className={`w-3 h-3 rounded-full border flex items-center justify-center transition-colors ${isSelected ? 'border-brand-accent bg-brand-accent' : 'border-brand-border'}`}>
          {isSelected && <div className="w-1 h-1 bg-brand-bg rounded-full" />}
        </div>
      </div>
      {desc && <span className="text-[10px] text-brand-muted-fg leading-relaxed">{desc}</span>}
    </button>
  )
}