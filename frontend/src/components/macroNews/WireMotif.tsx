// Newsprint motif for the Market News header.
//
// Two columns of type set as bars: a heavier headline bar over lines of body copy,
// ragged on the right the way a news column is. The first column's headline picks
// up the lime accent, the one story the eye lands on first, which is what the page
// does with tagged news. Same construction as the other hub motifs: forest tones
// lighter than the band they sit on, on the right so the copy keeps the left.
//
// Purely decorative, so aria-hidden and non-interactive. preserveAspectRatio="none"
// lets it stretch to any header width; at these opacities the stretch is invisible.
// Pass className="h-full".
export default function WireMotif({ className = "" }: { className?: string }) {
  const columns = [
    {
      x: 930,
      headline: { width: 210, tone: "var(--color-lime-500)", opacity: 0.32 },
      lines: [230, 214, 236, 188, 226, 140],
    },
    {
      x: 1200,
      headline: { width: 168, tone: "var(--color-forest-500)", opacity: 0.6 },
      lines: [200, 182, 206, 120, 196],
    },
  ];

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
    >
      {columns.map((col) => (
        <g key={col.x}>
          <rect
            x={col.x}
            y={38}
            width={col.headline.width}
            height={14}
            rx={7}
            fill={col.headline.tone}
            opacity={col.headline.opacity}
          />
          {col.lines.map((width, i) => (
            <rect
              key={i}
              x={col.x}
              y={70 + i * 20}
              width={width}
              height={7}
              rx={3.5}
              fill={i % 2 ? "var(--color-forest-600)" : "var(--color-forest-500)"}
              opacity={0.55 - i * 0.05}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
