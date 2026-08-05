// Growth-sprout motif for the Learning Centre header.
//
// A low undergrowth mound runs the full width (staying inside the card's
// bottom padding on the left) and swells bottom-right, where five bezier
// leaf blades rise from it — the tallest deliberately left of the XP stat
// inset so the corner under the card stays quiet. Lime stems and tip dots
// pick up the brand accent, same family as WaveMotif and RadarMotif.
//
// All geometry lives inside the 220-unit viewBox, so nothing can be sliced
// at a band edge; pass h-full so the blades keep their drawn proportions.
// Stems and dots use vector-effect="non-scaling-stroke" to stay hairline/round.
export default function SproutMotif({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
    >
      {/* Undergrowth mounds — whisper-thin at left, swelling to the right */}
      <path
        d="M0,206 C300,202 620,196 860,180 C1060,166 1260,152 1440,152 L1440,220 L0,220 Z"
        fill="var(--color-forest-600)"
        opacity="0.7"
      />
      <path
        d="M760,220 C900,198 1060,182 1200,178 C1310,175 1390,180 1440,186 L1440,220 Z"
        fill="var(--color-forest-500)"
        opacity="0.55"
      />

      {/* Leaf blades — closed two-bezier lenses rising from the mound */}
      <path d="M948,218 C928,192 912,168 906,142 C924,170 942,196 962,218 Z" fill="var(--color-forest-500)" opacity="0.55" />
      <path d="M1064,214 C1008,176 966,128 980,78 C1006,124 1036,172 1082,214 Z" fill="var(--color-forest-500)" opacity="0.55" />
      <path d="M1096,212 C1084,148 1096,84 1140,44 C1150,110 1136,170 1120,212 Z" fill="var(--color-forest-600)" opacity="0.7" />
      <path d="M1180,216 C1216,172 1258,132 1304,108 C1272,160 1228,196 1198,216 Z" fill="var(--color-forest-500)" opacity="0.55" />
      <path d="M1368,220 C1382,196 1398,178 1416,166 C1404,188 1390,206 1382,220 Z" fill="var(--color-forest-600)" opacity="0.55" />

      {/* Lime stems — hairline midline curves */}
      <path d="M1108,212 C1102,150 1112,92 1138,50" fill="none" stroke="var(--color-lime-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.45" />
      <path d="M1070,214 C1030,168 1002,124 984,84" fill="none" stroke="var(--color-lime-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.35" />
      <path d="M1216,214 C1224,178 1248,152 1286,142" fill="none" stroke="var(--color-lime-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.3" />

      {/* Tip dots — zero-length round-cap strokes stay circular under stretch */}
      <path d="M1140,40 h0.01" stroke="var(--color-lime-500)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.85" />
      <path d="M982,74 h0.01" stroke="var(--color-lime-500)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.6" />
      <path d="M1306,104 h0.01" stroke="var(--color-lime-500)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.55" />
      <path d="M1418,162 h0.01" stroke="var(--color-lime-500)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.45" />
    </svg>
  );
}
