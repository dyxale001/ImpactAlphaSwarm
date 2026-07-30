// Layered wave silhouettes for the Whale Watching header.
//
// Three passes at different phases and opacities so the crests overlap rather
// than repeating: two forest tones lighter than the forest-700 band they sit on,
// then a thin lime highlight along the bottom picking up the brand accent.
//
// Purely decorative, so it is aria-hidden and non-interactive. `preserveAspect
// Ratio="none"` lets it stretch to any header width without leaving gaps; the
// waves distort slightly when squashed, which is invisible at this opacity.
export default function WaveMotif({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
    >
      <path
        d="M0,140 C160,100 320,180 480,150 C640,120 800,170 960,145 C1120,120 1280,165 1440,135 L1440,220 L0,220 Z"
        fill="var(--color-forest-600)"
        opacity="0.7"
      />
      <path
        d="M0,165 C180,135 300,197 520,170 C740,145 860,192 1080,168 C1260,150 1360,182 1440,165 L1440,220 L0,220 Z"
        fill="var(--color-forest-500)"
        opacity="0.55"
      />
      <path
        d="M0,192 C200,172 380,207 600,193 C820,180 1000,206 1220,191 C1330,183 1390,193 1440,189 L1440,220 L0,220 Z"
        fill="var(--color-lime-500)"
        opacity="0.22"
      />
    </svg>
  );
}
