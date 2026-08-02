// Radar-sweep motif for the Watchlist header.
//
// Concentric ripples emanate from the bottom-right corner — the watchlist as a
// scanner, each blip a tracked contact. Two forest quarter-discs carry the
// filled layered mass (same family as the whale header's WaveMotif), then a
// lime pass: hairline arcs brightening toward the origin, plus blip dots.
//
// preserveAspectRatio="none" stretches the sweep to whatever box the caller
// gives it; circles distort into ellipses, which reads as ripples on a
// receding plane. Pass h-full so the rings span the whole card and crop only
// at its real edges — a shorter band slices the discs at an invisible line
// mid-card. Arcs and blips use vector-effect="non-scaling-stroke" so lines
// stay hairline-thin and blips stay round at every viewport.
export default function RadarMotif({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
    >
      <circle cx="1440" cy="220" r="380" fill="var(--color-forest-600)" opacity="0.7" />
      <circle cx="1440" cy="220" r="250" fill="var(--color-forest-500)" opacity="0.55" />

      <circle cx="1440" cy="220" r="450" fill="none" stroke="var(--color-lime-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.15" />
      <circle cx="1440" cy="220" r="320" fill="none" stroke="var(--color-lime-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.2" />
      <circle cx="1440" cy="220" r="180" fill="none" stroke="var(--color-lime-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.26" />
      <circle cx="1440" cy="220" r="95" fill="none" stroke="var(--color-lime-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.32" />

      {/* Blips — zero-length round-cap strokes stay circular under the stretch */}
      <path d="M1313 93 h0.01" stroke="var(--color-lime-500)" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.9" />
      <path d="M1157 70 h0.01" stroke="var(--color-lime-500)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.65" />
      <path d="M1001 120 h0.01" stroke="var(--color-lime-500)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.45" />
      <path d="M1368 150 h0.01" stroke="var(--color-lime-500)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.4" />
    </svg>
  );
}
