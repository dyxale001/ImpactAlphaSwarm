// Classification motif for the Funds header.
//
// Funds is the only hub page whose header band carried no artwork, and the
// figure it should carry is the one the whole page is built on: the ASISA
// classification. A lime spine with forest bands branching off it at uneven
// lengths — where a fund invests, what it holds, its focus within that — which
// is the same shape the browse navigator draws in controls further down.
//
// The uneven lengths are the point and not a texture: a category holding
// dozens of funds and one holding a single fund sit side by side in this
// classification, which is exactly what the inclusion rule says out loud. Two
// leaf markers pick up the accent at the ends of the longest branches.
//
// Purely decorative, so aria-hidden and non-interactive. preserveAspectRatio
// ="none" lets the band stretch to any header width; the spine and the leaves
// use vector-effect="non-scaling-stroke" so the line stays hairline and the
// dots stay round however far the box is squashed. Pass className="h-full".
export default function TiersMotif({ className = "" }: { className?: string }) {
  const spineX = 1150;

  const branches = [
    { y: 56, length: 208, tone: "var(--color-forest-500)", opacity: 0.5 },
    { y: 82, length: 142, tone: "var(--color-forest-600)", opacity: 0.65 },
    { y: 108, length: 262, tone: "var(--color-forest-500)", opacity: 0.45 },
    { y: 134, length: 118, tone: "var(--color-forest-600)", opacity: 0.7 },
    { y: 160, length: 196, tone: "var(--color-forest-500)", opacity: 0.55 },
    { y: 186, length: 96, tone: "var(--color-forest-600)", opacity: 0.6 },
  ];

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
    >
      {branches.map((branch) => (
        <rect
          key={branch.y}
          x={spineX}
          y={branch.y}
          width={branch.length}
          height="12"
          fill={branch.tone}
          opacity={branch.opacity}
        />
      ))}

      <line
        x1={spineX}
        y1="46"
        x2={spineX}
        y2="208"
        stroke="var(--color-lime-500)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        opacity="0.35"
      />

      {/* Leaf markers — zero-length round-cap strokes stay circular under the
          stretch, the trick the ladder and radar motifs both use */}
      <path
        d="M1412 114 h0.01"
        stroke="var(--color-lime-500)"
        strokeWidth="5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.8"
      />
      <path
        d="M1358 62 h0.01"
        stroke="var(--color-lime-500)"
        strokeWidth="4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.45"
      />
    </svg>
  );
}
