import { Layers, ListTree, GraduationCap } from 'lucide-react'

interface Category {
  icon: typeof Layers
  title: string
  description: string
  example: string
}

const CATEGORIES: Category[] = [
  {
    icon: Layers,
    title: 'Understand your results',
    description: 'Give AlphaSwarm a set of results and ask it to explain how the metrics relate to each other.',
    example: "I don't know what to make of my results",
  },
  {
    icon: ListTree,
    title: 'Explore my assets',
    description: 'Ask about rankings, prices, and comparisons across the assets AlphaSwarm already has data on.',
    example: 'Compare the assets in my results',
  },
  {
    icon: GraduationCap,
    title: 'Learn',
    description: 'Ask what a financial or technical concept means — grounded in AlphaSwarm\'s approved educational sources.',
    example: 'What is beta?',
  },
]

interface Props {
  onSelect: (example: string) => void
}

export default function AskLandingCards({ onSelect }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {CATEGORIES.map(cat => (
        <button
          key={cat.title}
          type="button"
          onClick={() => onSelect(cat.example)}
          className="soft-card p-5 text-left space-y-3 hover:border-brand-primary/30 transition-all"
        >
          <cat.icon className="w-5 h-5 text-brand-primary" />
          <div>
            <p className="text-sm font-semibold text-brand-fg">{cat.title}</p>
            <p className="text-xs text-brand-muted-fg leading-relaxed mt-1">{cat.description}</p>
          </div>
          <p className="text-xs text-brand-primary font-medium italic">"{cat.example}"</p>
        </button>
      ))}
    </div>
  )
}
