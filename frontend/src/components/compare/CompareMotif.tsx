// Side-by-side motif for the Compare header.
//
// Every hub page's band carries the figure its page is built on: waves for Whale
// Watching, the ASISA branches for Funds. Compare's is three columns of uneven
// bars standing on one baseline, with a lime hairline drawn level across them:
// the same measure read across several things at once, which is the page.
//
// Purely decorative, so aria-hidden and non-interactive. preserveAspectRatio
// ="none" stretches it to any header width; the hairline uses non-scaling-stroke
// so it stays a hairline however far the box is squashed.
export default function CompareMotif({ className = "" }: { className?: string }) {
  const columns = [
    { x: 1040, bars: [62, 96, 48, 120] },
    { x: 1160, bars: [88, 54, 110, 70] },
    { x: 1280, bars: [40, 104, 76, 92] },
  ];
  const baseline = 206;
  const barWidth = 18;
  const gap = 6;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
    >
      {columns.map((column, c) =>
        column.bars.map((height, b) => (
          <rect
            key={`${c}-${b}`}
            x={column.x + b * (barWidth + gap)}
            y={baseline - height}
            width={barWidth}
            height={height}
            fill={b % 2 ? "var(--color-forest-600)" : "var(--color-forest-500)"}
            opacity={0.45 + (b % 3) * 0.1}
          />
        )),
      )}
      <line
        x1="1010"
        y1={baseline - 80}
        x2="1400"
        y2={baseline - 80}
        stroke="var(--color-lime-500)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        opacity="0.45"
      />
      <line
        x1="1010"
        y1={baseline}
        x2="1400"
        y2={baseline}
        stroke="var(--color-forest-400)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        opacity="0.5"
      />
    </svg>
  );
}
