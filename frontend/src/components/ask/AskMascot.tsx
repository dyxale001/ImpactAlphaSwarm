import { useEffect, useRef } from 'react'

// The Ask AlphaSwarm mascot: a borderless lime blob with the logo's face. Its eyes
// are tall ovals, and when it blinks they turn into the logo's ">_<". It lives in
// the floating panel's corner and the Ask page's header card.
//
// It moves on its own: the edge wobbles and it breathes, and every few seconds it
// picks something small to do (look around, blink, tilt, a quick glance, a hop).
// It also reacts to Ask: it glances down while you type, looks up and drifts while
// an answer is being written, and hops when one arrives (a new `answers` count).
//
// Everything is drawn into one SVG from a requestAnimationFrame loop that writes
// attributes directly, so React does not re-render each frame. With reduced motion
// it stays still and only blinks now and then. It is decorative, so screen readers
// skip it.

export type MascotState = 'idle' | 'typing' | 'thinking'

const BODY = 'var(--color-lime-500)'
const FACE = 'var(--color-forest-900)'

const rand = (a: number, b: number) => a + Math.random() * (b - a)

// A smooth closed path through points (Catmull-Rom to Bézier).
function smoothPath(pts: [number, number][]) {
  const n = pts.length
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }
  return `${d}Z`
}

export default function AskMascot({
  size = 72,
  state = 'idle',
  answers = 0,
  className = '',
}: {
  size?: number
  state?: MascotState
  /** How many answers there are so far; it hops each time this goes up. */
  answers?: number
  className?: string
}) {
  const lift = useRef<SVGGElement>(null)
  const body = useRef<SVGGElement>(null)
  const blob = useRef<SVGPathElement>(null)
  const face = useRef<SVGGElement>(null)
  const open = useRef<SVGGElement>(null)
  const shut = useRef<SVGGElement>(null)
  const mouth = useRef<SVGRectElement>(null)
  const stateRef = useRef<MascotState>(state)
  const hopRef = useRef(-1)
  const answersRef = useRef(answers)

  stateRef.current = state

  // A new answer: hop.
  useEffect(() => {
    if (answers > answersRef.current) hopRef.current = performance.now()
    answersRef.current = answers
  }, [answers])

  useEffect(() => {
    let reduced = false
    let query: MediaQueryList | null = null
    try {
      query = window.matchMedia('(prefers-reduced-motion: reduce)')
      reduced = query.matches
    } catch { /* no matchMedia: animate */ }
    const onChange = (e: MediaQueryListEvent) => { reduced = e.matches }
    query?.addEventListener?.('change', onChange)

    const seed = Math.random() * 1000
    const phases = Array.from({ length: 8 }, () => [rand(0, 6.28), rand(0, 6.28)])
    const cur = { dx: 0, dy: 0, rot: 0 }
    const tgt = { dx: 0, dy: 0, rot: 0 }
    let blinkUntil = 0
    let doubleAt = 0
    let returnAt = 0
    let nextAt = performance.now() + rand(400, 1600)
    let glanceAt = 0
    let raf = 0

    const blink = (now: number, double = Math.random() < 0.2) => {
      blinkUntil = now + 140
      doubleAt = double ? now + 320 : 0
    }

    function schedule(now: number) {
      nextAt = now + rand(1000, 3400)
      if (reduced) { if (Math.random() < 0.5) blink(now, false); return }
      const r = Math.random()
      if (r < 0.34) { // look somewhere
        tgt.dx = rand(-8, 8); tgt.dy = rand(-5, 4); tgt.rot = tgt.dx * 0.7
        returnAt = now + rand(700, 2000)
      } else if (r < 0.62) blink(now)
      else if (r < 0.72) { tgt.rot = rand(-9, 9); tgt.dx = tgt.rot / 2; returnAt = now + rand(900, 1600) }
      else if (r < 0.8) hopRef.current = now
      else if (r < 0.92) { // a quick glance left, then right
        tgt.dx = -7; tgt.dy = 0; tgt.rot = -4
        glanceAt = now + 420
        returnAt = now + 950
      }
      // otherwise rest
    }

    function frame(now: number) {
      const t = now / 1000
      const s = stateRef.current

      if (s === 'thinking' && !reduced) {
        tgt.dx = Math.sin(t * 1.7 + seed) * 6; tgt.dy = -7; tgt.rot = Math.sin(t * 1.7 + seed) * 3
        if (now > nextAt) { nextAt = now + rand(1800, 3200); if (Math.random() < 0.5) blink(now, false) }
      } else if (s === 'typing' && !reduced) {
        tgt.dx = 3 + Math.sin(t * 0.8) * 2; tgt.dy = 6; tgt.rot = 2
        if (now > nextAt) { nextAt = now + rand(1500, 3000); blink(now, false) }
      } else {
        if (glanceAt && now > glanceAt) { tgt.dx = 7; tgt.rot = 4; glanceAt = 0 }
        if (returnAt && now > returnAt) { tgt.dx = 0; tgt.dy = 0; tgt.rot = 0; returnAt = 0 }
        if (now > nextAt) schedule(now)
      }
      if (doubleAt && now > doubleAt) { blinkUntil = now + 120; doubleAt = 0 }

      // Ease towards the target.
      const k = reduced ? 1 : 0.12
      cur.dx += ((reduced ? 0 : tgt.dx) - cur.dx) * k
      cur.dy += ((reduced ? 0 : tgt.dy) - cur.dy) * k
      cur.rot += ((reduced ? 0 : tgt.rot) - cur.rot) * k

      // Hop: squash, spring up, land, settle.
      let hy = 0, squash = 0
      if (hopRef.current >= 0 && !reduced) {
        const p = (now - hopRef.current) / 620
        if (p >= 1) hopRef.current = -1
        else if (p < 0) { /* not started */ }
        else if (p < 0.15) squash = 0.12 * (p / 0.15)
        else if (p < 0.6) { const q = (p - 0.15) / 0.45; hy = -16 * Math.sin(q * Math.PI); squash = -0.08 * Math.sin(q * Math.PI) }
        else if (p < 0.78) squash = 0.1 * Math.sin(((p - 0.6) / 0.18) * Math.PI)
        else squash = -0.03 * Math.sin(((p - 0.78) / 0.22) * Math.PI)
      }

      // Breathing and the wobbling edge, a little flatter at the base.
      const breathe = reduced ? 0 : Math.sin(t * 2 + seed) * 0.018
      const pts: [number, number][] = []
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2
        const [p1, p2] = phases[i]
        const r = 1 + (reduced ? 0 : 0.035 * Math.sin(t * 1.3 + p1) + 0.02 * Math.sin(t * 2.1 + p2))
        const base = Math.sin(a) > 0.55 ? 0.94 : 1
        pts.push([60 + Math.cos(a) * 44 * r, 66 + Math.sin(a) * 40 * r * base])
      }
      blob.current?.setAttribute('d', smoothPath(pts))

      const sx = 1 + squash + breathe * 0.5, sy = 1 - squash + breathe
      body.current?.setAttribute('transform', `translate(60 104) rotate(${cur.rot.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-60 -104)`)
      lift.current?.setAttribute('transform', `translate(0 ${hy.toFixed(2)})`)
      face.current?.setAttribute('transform', `translate(${cur.dx.toFixed(2)} ${cur.dy.toFixed(2)})`)
      mouth.current?.setAttribute('transform', `translate(${(-cur.dx * 0.35).toFixed(2)} ${(-cur.dy * 0.3).toFixed(2)})`)
      const closed = now < blinkUntil
      if (open.current) open.current.style.display = closed ? 'none' : ''
      if (shut.current) shut.current.style.display = closed ? '' : 'none'

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      query?.removeEventListener?.('change', onChange)
    }
  }, [])

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`block shrink-0 overflow-visible ${className}`}
    >
      <g ref={lift}>
        <g ref={body}>
          <path ref={blob} d="M60,26 C84,26 104,44 104,66 C104,88 84,104 60,104 C36,104 16,88 16,66 C16,44 36,26 60,26Z" style={{ fill: BODY }} />
          <g ref={face}>
            <g ref={open} style={{ fill: FACE }}>
              <ellipse cx="46" cy="58" rx="5.6" ry="9.2" />
              <ellipse cx="74" cy="58" rx="5.6" ry="9.2" />
            </g>
            <g ref={shut} style={{ display: 'none', stroke: FACE }} fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="40,50 50,58 40,66" />
              <polyline points="80,50 70,58 80,66" />
            </g>
            <rect ref={mouth} x="52.5" y="74" width="15" height="4.6" rx="2.3" style={{ fill: FACE }} />
          </g>
        </g>
      </g>
    </svg>
  )
}
