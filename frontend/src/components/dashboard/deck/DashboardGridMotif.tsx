// Header motif for the dashboard band, in the same family as LadderMotif
// (Assets), WaveMotif (Whale Watching) and RadarMotif (Watchlist) — each hub
// gets a decoration that is a picture of the thing it is a hub FOR.
//
// LadderMotif's climbing columns are a ranking; a widget grid is not a ranking,
// it is an arrangement, so a chart-shaped graphic here was borrowed scenery
// rather than a picture of this page. This draws a small bento grid instead —
// rounded tiles at a few different spans, two picked out in lime as "selected"
// — which is what the page below it actually is.
//
// preserveAspectRatio="none" and vector-effect="non-scaling-stroke" for the same
// reason LadderMotif uses them: the band stretches to whatever width the hero
// card is given, and the strokes have to stay hairline-thin through that.
export default function DashboardGridMotif({
  className = "",
}: {
  className?: string;
}) {
  const tiles = [
    { x: 780, y: 30, w: 150, h: 68, tone: "var(--color-forest-600)", opacity: 0.45 },
    { x: 945, y: 30, w: 95, h: 68, tone: "var(--color-forest-500)", opacity: 0.4 },
    { x: 1055, y: 30, w: 130, h: 145, accent: true },
    { x: 1200, y: 30, w: 140, h: 68, tone: "var(--color-forest-600)", opacity: 0.55 },
    { x: 780, y: 113, w: 95, h: 62, tone: "var(--color-forest-500)", opacity: 0.5 },
    { x: 890, y: 113, w: 150, h: 62, accent: true },
    { x: 1200, y: 113, w: 140, h: 62, tone: "var(--color-forest-500)", opacity: 0.45 },
  ];

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
    >
      {tiles.map((tile, i) =>
        tile.accent ? (
          <rect
            key={i}
            x={tile.x}
            y={tile.y}
            width={tile.w}
            height={tile.h}
            rx="10"
            fill="var(--color-lime-500)"
            opacity="0.14"
            stroke="var(--color-lime-500)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeOpacity="0.7"
          />
        ) : (
          <rect
            key={i}
            x={tile.x}
            y={tile.y}
            width={tile.w}
            height={tile.h}
            rx="10"
            fill={tile.tone}
            opacity={tile.opacity}
          />
        ),
      )}
    </svg>
  );
}
