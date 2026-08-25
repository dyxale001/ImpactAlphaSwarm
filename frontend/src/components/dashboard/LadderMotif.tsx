// Ranked-column motif for the Assets header.
//
// Columns climbing toward the bottom-right corner — the ranked universe, each
// column a place in the order, the tallest one the top pick. Two forest tones
// carry the filled mass (same family as the whale header's WaveMotif and the
// watchlist's RadarMotif), then a lime pass: a hairline traced across the
// column tops, with brighter caps on the leaders.
//
// preserveAspectRatio="none" stretches the columns to whatever box the caller
// gives it, so they stay anchored to the bottom edge at any width. Pass a short
// height (h-16) rather than h-full: this motif reads as a band along the bottom
// edge, and letting it fill the card makes the columns tower over the copy. The
// trace and caps use vector-effect="non-scaling-stroke" so the line stays
// hairline thin and the caps stay round however far the box is squashed.
export default function LadderMotif({ className = "" }: { className?: string }) {
  const columns = [
    { x: 760, height: 42, tone: "var(--color-forest-600)", opacity: 0.45 },
    { x: 830, height: 58, tone: "var(--color-forest-500)", opacity: 0.4 },
    { x: 900, height: 50, tone: "var(--color-forest-600)", opacity: 0.55 },
    { x: 970, height: 74, tone: "var(--color-forest-500)", opacity: 0.45 },
    { x: 1040, height: 66, tone: "var(--color-forest-600)", opacity: 0.6 },
    { x: 1110, height: 92, tone: "var(--color-forest-500)", opacity: 0.5 },
    { x: 1180, height: 84, tone: "var(--color-forest-600)", opacity: 0.7 },
    { x: 1250, height: 112, tone: "var(--color-forest-500)", opacity: 0.55 },
    { x: 1320, height: 104, tone: "var(--color-forest-600)", opacity: 0.75 },
    { x: 1390, height: 136, tone: "var(--color-forest-500)", opacity: 0.6 },
  ];

  const trace = columns
    .map((column) => `${column.x + 25},${220 - column.height}`)
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
    >
      {columns.map((column) => (
        <rect
          key={column.x}
          x={column.x}
          y={220 - column.height}
          width="50"
          height={column.height}
          fill={column.tone}
          opacity={column.opacity}
        />
      ))}

      <polyline
        points={trace}
        fill="none"
        stroke="var(--color-lime-500)"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.3"
      />

      {/* Leader caps — zero-length round-cap strokes stay circular under the
          stretch, the same trick the radar motif uses for its blips */}
      <path d="M1415 84 h0.01" stroke="var(--color-lime-500)" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.9" />
      <path d="M1275 108 h0.01" stroke="var(--color-lime-500)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.55" />
      <path d="M1135 128 h0.01" stroke="var(--color-lime-500)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.4" />
    </svg>
  );
}
