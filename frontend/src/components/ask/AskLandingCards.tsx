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
    title: 'Explore my stocks',
    description: 'Ask about rankings, prices, and comparisons across the stocks AlphaSwarm already has data on.',
    example: 'Compare the stocks in my results',
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
          className="as-card flex flex-col gap-3 p-5 text-left transition-shadow hover:shadow-float focus-visible:shadow-float focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-forest-50 text-forest-700" aria-hidden="true">
            <cat.icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-bold text-forest-900">{cat.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-brand-muted-fg">{cat.description}</p>
          </div>
          <p className="mt-auto text-sm font-semibold italic text-forest-700">"{cat.example}"</p>
        </button>
      ))}
    </div>
  )
}
