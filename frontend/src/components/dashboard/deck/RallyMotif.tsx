// Rally motif for the dashboard header.
//
// Built to the same recipe as its siblings — WaveMotif (Whale Watching),
// RadarMotif (Watchlist) and SproutMotif (Learning): two big soft forest masses
// carrying the weight, a restrained lime pass over them, then small lime blips.
// This one draws an ascending range of highs and lows, a rally, which is the
// thing the whole product is pointed at.
//
// It avoids the two shapes Assets already owns: candlesticks are that page's
// identity icon, and LadderMotif's solid columns are its motif. And it stays
// clear of WaveMotif by being angular and directional — waves are smooth and
// repeat flat across the card, this climbs.
//
// ── What earlier attempts here got wrong ───────────────────────────────────
//
// 1. Shape language. A bento grid of rounded rectangles was the first try. With
//    preserveAspectRatio="none" the viewBox is squashed by the ratio between
//    the x and y scales, and rectangles do not survive that — the corner radii
//    smear and the tiles flatten into featureless bars. Every sibling is built
//    from organic filled silhouettes for exactly this reason.
//
// 2. Tone. A later try was a bright lime line chart over faint gradient washes.
//    Rendered beside the siblings it was obviously wrong: they carry their
//    weight in large, soft, low-contrast forest masses and keep the lime down
//    at 0.15-0.32 hairlines plus a few dots, so the decoration stays
//    atmosphere. A bright continuous line made the dashboard the loudest header
//    in the app.
//
// 3. The Refresh pill. The sibling pages have no right-hand control in their
//    hero, so their motifs can climb anywhere. This one cannot: the ridge is
//    deliberately capped low enough that it passes under the run/refresh pill
//    rather than through it.
//
// Pass h-full, the way RadarMotif and SproutMotif are passed it, so the masses
// sweep the whole card instead of being sliced at an invisible band edge.

// The topmost ridge. Shared by the back mass and the lime trace over it, so the
// highlight always sits exactly on the silhouette's own edge.
const RIDGE =
  "600,220 676,202 742,212 838,186 892,198 986,174 1032,186 1136,160 1196,172 1298,146 1352,158 1440,134";

// [x, y, dot size, opacity] — the three strongest highs on the ridge, stepping
// down in brightness leftward.
const BLIPS: Array<[number, number, number, number]> = [
  [1298, 146, 6, 0.9],
  [1136, 160, 5, 0.6],
  [986, 174, 4, 0.45],
];

export default function RallyMotif({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
    >
      {/* Filled mass — the two forest passes the siblings all carry */}
      <polygon points={`${RIDGE} 1440,220`} fill="var(--color-forest-600)" opacity="0.7" />
      <polygon
        points="806,220 884,204 948,213 1036,194 1092,204 1178,184 1236,194 1322,173 1378,183 1440,164 1440,220"
        fill="var(--color-forest-500)"
        opacity="0.55"
      />

      {/* Lime pass — a low band picking up the accent, the same job WaveMotif's
          third path does */}
      <polygon
        points="966,220 1032,211 1094,217 1168,203 1224,211 1296,197 1348,205 1412,191 1440,196 1440,220"
        fill="var(--color-lime-500)"
        opacity="0.2"
      />

      {/* The ridge line itself, kept hairline and quiet */}
      <polyline
        points={RIDGE}
        fill="none"
        stroke="var(--color-lime-500)"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.3"
      />

      {/* Blips — zero-length round-cap strokes stay circular under the stretch,
          the same trick the radar and sprout motifs use for theirs */}
      {BLIPS.map(([x, y, size, opacity]) => (
        <path
          key={x}
          d={`M${x} ${y} h0.01`}
          stroke="var(--color-lime-500)"
          strokeWidth={size}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={opacity}
        />
      ))}
    </svg>
  );
}
