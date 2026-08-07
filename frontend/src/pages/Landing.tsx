import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Terminal,
  Activity,
  Menu,
  Zap,
  Flame,
  Sparkles,
  MessageSquare,
  BarChart3,
  GitMerge,
  Waves,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Trophy,
  CheckCircle2,
  Cpu,
  TrendingUp,
  Bot,
} from 'lucide-react'
import InvestorProfileCard from '../components/InvestorProfileCard'

// ─── Shared data ───────────────────────────────────────────────────────────

// Signal Scorecard factors: markers on tracks, no numbers anywhere
const SCORECARD_ROWS = [
  { label: 'Signal strength', pos: 82 },
  { label: 'Agreement', pos: 90 },
  { label: 'Evidence depth', pos: 58 },
  { label: 'Fit with your profile', pos: 70 },
]

const AGENTS = [
  {
    Icon: MessageSquare,
    name: 'Sentiment Scout',
    desc: 'Reads tiered financial news and StockTwits chatter, scoring tone with two independent systems, blended 70% news, 30% social over the last 7 days.',
  },
  {
    Icon: BarChart3,
    name: 'Quant Analyst',
    desc: 'Crunches about a year of price history (momentum, volatility, risk-adjusted return) and ranks each asset against its peers in the run.',
  },
  {
    Icon: Sparkles,
    name: 'Discovery Agent',
    desc: "Hunts overnight for trending tickers you didn't ask about. Every candidate must pass validation before it can enter your feed.",
  },
  {
    Icon: GitMerge,
    name: 'The Orchestrator',
    desc: 'The committee chair: merges the two signals, runs the risk and hype checks, decides the order, and writes the reasoning for every pick.',
  },
]

const FAQS = [
  {
    q: 'Is AlphaSwarm financial advice?',
    a: 'No. AlphaSwarm is a financial-transparency tool: it centralises the evidence and explains it; it never tells you what to do. There are no buy, hold, or sell recommendations, and the final decision always stays with you. Scores are for research and education only and are not financial advice; consult a licensed financial advisor before investing.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Market prices and history from Yahoo Finance (15-minute delayed, with the live USD/ZAR rate), financial news from Finnhub and Marketaux weighted by publisher reliability, retail chatter from StockTwits, and insider and institutional filings from the SEC (Form 4 and 13F). Sentiment is scored by two independent systems and blended 70% news / 30% social over a 7-day window.',
  },
  {
    q: 'How does the AI decide what ranks first?',
    a: "Two independent engines (one quantitative, one sentiment) measure each asset separately. Four disclosed factors then decide the order: signal strength, agreement between the engines, depth of evidence, and fit with your risk profile. They're multiplied, so weakness in any one genuinely drags a pick down, and there is no single hidden score.",
  },
  {
    q: 'Do I need investing experience?',
    a: 'No. Onboarding profiles you from novice to advanced, the committee filters everything through your risk mandate, and the Learning Centre teaches the concepts with plain-language articles, quizzes, XP and badges.',
  },
  {
    q: 'What does "hype flagged" mean?',
    a: 'When social buzz races ahead of what the market data supports, the committee flags it instead of chasing it. AlphaSwarm never ranks by how often a stock is mentioned, because that would just build a meme-stock leaderboard.',
  },
]

// ─── Squiggle ribbons ──────────────────────────────────────────────────────

interface SquiggleRibbonProps {
  pathId: string
  d: string
  viewBox: string
  para: number
  rot: number
  className: string
  strokeClass: string
  strokeWidth: number
  strokeOpacity?: number
  text: string
  textFillClass: string
  textSize: number
  startOffset: string
  textOpacity?: number
  /** Hero-only thin offset echo line under the ribbon */
  echo?: boolean
}

function SquiggleRibbon({
  pathId,
  d,
  viewBox,
  para,
  rot,
  className,
  strokeClass,
  strokeWidth,
  strokeOpacity,
  text,
  textFillClass,
  textSize,
  startOffset,
  textOpacity,
  echo = false,
}: SquiggleRibbonProps) {
  return (
    <svg
      data-para={para}
      data-rot={rot}
      viewBox={viewBox}
      className={`pointer-events-none absolute overflow-visible will-change-transform ${className}`}
      aria-hidden="true"
    >
      <path
        id={pathId}
        data-draw=""
        d={d}
        fill="none"
        className={strokeClass}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={strokeOpacity}
      />
      {echo && (
        <path
          data-draw=""
          d={d}
          fill="none"
          className="stroke-forest-700"
          strokeWidth={1.5}
          opacity={0.18}
          transform="translate(0,34)"
        />
      )}
      <text
        className={`font-sans font-semibold uppercase ${textFillClass}`}
        style={{ fontSize: textSize, letterSpacing: '0.14em' }}
        opacity={textOpacity}
        dominantBaseline="middle"
      >
        <textPath href={`#${pathId}`} startOffset={startOffset}>
          {text}
        </textPath>
      </text>
    </svg>
  )
}

// Parallax + draw-on-scroll for every [data-para] ribbon: one rAF-throttled
// scroll listener translates/rotates each ribbon by its viewport-relative
// progress and reveals the stroke via dasharray/dashoffset. Disabled entirely
// under prefers-reduced-motion (ribbons then render fully drawn and static).
function useRibbonScroll(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    type Ribbon = {
      el: SVGSVGElement
      top: number
      h: number
      speed: number
      rot: number
      items: { p: SVGPathElement; L: number }[]
      text: SVGTextElement | null
    }

    let ribbons: Ribbon[] = []
    let raf: number | null = null

    const collect = () => {
      ribbons = Array.from(root.querySelectorAll<SVGSVGElement>('svg[data-para]')).map((el) => {
        el.style.transform = 'none'
        const r = el.getBoundingClientRect()
        const items = Array.from(el.querySelectorAll<SVGPathElement>('path[data-draw]')).map((p) => {
          const L = p.getTotalLength()
          p.style.strokeDasharray = String(L)
          return { p, L }
        })
        return {
          el,
          top: r.top + window.scrollY,
          h: r.height,
          speed: parseFloat(el.dataset.para || '0') || 0,
          rot: parseFloat(el.dataset.rot || '0') || 0,
          items,
          text: el.querySelector('text'),
        }
      })
    }

    const update = () => {
      const vh = window.innerHeight || 1
      const sc = window.scrollY
      for (const o of ribbons) {
        let t = (sc + vh / 2 - (o.top + o.h / 2)) / vh
        t = Math.max(-1.8, Math.min(1.8, t))
        o.el.style.transform = `translate3d(0, ${(t * o.speed * 140).toFixed(1)}px, 0) rotate(${(t * o.rot).toFixed(2)}deg)`
        // draw-on-scroll: reveal the stroke as the ribbon travels through the viewport
        let p = (sc + vh * 0.9 - o.top) / (o.h + vh * 0.55)
        p = Math.max(0, Math.min(1, p))
        const eased = p * p * (3 - 2 * p)
        for (const it of o.items) {
          it.p.style.strokeDashoffset = String(it.L * (1 - eased))
        }
        if (o.text) o.text.style.opacity = String(Math.max(0, Math.min(1, (eased - 0.12) / 0.55)))
      }
    }

    const onScroll = () => {
      if (raf !== null) return
      raf = requestAnimationFrame(() => {
        raf = null
        update()
      })
    }
    const onResize = () => {
      collect()
      update()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    onResize()
    // fonts/layout settle before measuring
    const t1 = window.setTimeout(onResize, 400)
    const t2 = window.setTimeout(onResize, 1500)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (raf !== null) cancelAnimationFrame(raf)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [rootRef])
}

// ─── Small pieces ──────────────────────────────────────────────────────────

function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span
      className="flex items-center gap-2 font-extrabold tracking-[-0.04em] text-forest-900"
      style={{ fontSize: size }}
    >
      <Terminal size={size} className="text-forest-700" strokeWidth={2} />
      AlphaSwarm
    </span>
  )
}

function StopHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-eyebrow text-muted">{eyebrow}</p>
      <h3 className="text-[28px] font-medium leading-[1.15] tracking-tight text-forest-700 md:text-4xl">{title}</h3>
      <p className="text-base leading-relaxed text-forest-900">{body}</p>
    </>
  )
}

function ScorecardRowsDark() {
  return (
    <div className="my-1.5 flex w-full flex-col gap-[11px]">
      {SCORECARD_ROWS.map((row) => (
        <div key={row.label}>
          <p className="mb-[5px] text-[9px] font-semibold uppercase tracking-[0.12em] text-lime-500">{row.label}</p>
          <div className="relative h-[5px] rounded-full bg-white/15">
            <span
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-forest-900 bg-lime-500"
              style={{ left: `${row.pos}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ScorecardRowsLight() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
      <span className="self-start rounded-sm bg-forest-700/12 px-3 py-1 text-[11px] font-bold tracking-[0.02em] text-forest-700">
        Signals agree strongly
      </span>
      {SCORECARD_ROWS.map((row) => (
        <div key={row.label}>
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-forest-700">{row.label}</p>
          <div className="relative h-[5px] rounded-full bg-forest-900/8">
            <span
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-forest-700"
              style={{ left: `${row.pos}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [navOpen, setNavOpen] = useState(false)
  useRibbonScroll(rootRef)

  return (
    <div
      ref={rootRef}
      className="relative min-h-screen overflow-x-clip bg-neutral-100 font-sans text-forest-900 selection:bg-lime-500 selection:text-forest-900"
    >
      {/* ═══ Nav ═══ */}
      <nav className="relative z-20 mx-auto flex max-w-[1200px] items-center justify-between px-4 py-6 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-2">
          <a href="#journey" className="hidden rounded-full px-[18px] py-2 text-sm font-medium text-forest-900 transition-colors hover:bg-neutral-200 lg:inline-flex">
            The Journey
          </a>
          <a href="#swarm" className="hidden rounded-full px-[18px] py-2 text-sm font-medium text-forest-900 transition-colors hover:bg-neutral-200 lg:inline-flex">
            The Swarm
          </a>
          <a href="#faq" className="hidden rounded-full px-[18px] py-2 text-sm font-medium text-forest-900 transition-colors hover:bg-neutral-200 lg:inline-flex">
            FAQ
          </a>
          <Link
            to="/login"
            className="ml-2 hidden rounded-full border border-forest-900/14 px-[18px] py-2 text-sm font-medium text-forest-900 transition-colors hover:border-forest-900/28 sm:inline-flex"
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            className="rounded-full bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 sm:px-[22px] sm:py-2.5"
          >
            Open Account
          </Link>
          <button
            type="button"
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            className="inline-flex rounded-full p-2 text-forest-900 transition-colors hover:bg-neutral-200 lg:hidden"
          >
            <Menu size={20} strokeWidth={2} />
          </button>
        </div>

        {navOpen && (
          <div className="absolute top-full right-4 z-30 flex w-56 flex-col gap-1 rounded-2xl border border-forest-900/10 bg-white p-2 shadow-xl sm:right-8 lg:hidden">
            {[
              ['#journey', 'The Journey'],
              ['#swarm', 'The Swarm'],
              ['#faq', 'FAQ'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={() => setNavOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-forest-900 transition-colors hover:bg-neutral-100"
              >
                {label}
              </a>
            ))}
            <Link
              to="/login"
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-forest-900 transition-colors hover:bg-neutral-100 sm:hidden"
            >
              Sign In
            </Link>
          </div>
        )}
      </nav>

      {/* ═══ Hero ═══ */}
      <header className="relative mx-auto max-w-[1200px] px-4 sm:px-8 pt-6">
        {/* Hero ribbon: above the lime panel, below the bento cards */}
        <SquiggleRibbon
          pathId="rb-hero"
          d="M-80,180 C240,300 480,40 760,150 C1020,250 1080,470 940,610 C830,720 620,700 560,830"
          viewBox="0 0 1400 900"
          para={0.16}
          rot={5}
          className="hidden lg:block z-3 -top-[140px] -left-[120px] h-[960px] w-[1500px]"
          strokeClass="stroke-lime-500"
          strokeWidth={58}
          text="Emotionless Research · Explainable Signals · Built For Everyday Investors · Powered By A Swarm Of Specialist Agents · Emotionless Research"
          textFillClass="fill-forest-700"
          textSize={21}
          startOffset="1%"
          echo
        />

        <div className="relative z-2 rounded-3xl bg-gradient-to-b from-lime-200 to-lime-100 px-8 py-16 md:px-[72px] md:pt-[88px] md:pb-24">
          <div className="relative z-4 flex max-w-[640px] flex-col gap-6">
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-eyebrow text-forest-700">
              <Activity size={13} strokeWidth={2} />
              Welcome To AlphaSwarm
            </span>
            <h1 className="text-[34px] font-medium leading-[1.05] tracking-tight text-balance text-forest-700 sm:text-[42px] md:text-[68px]">
              Meet Your AI Investment Committee
            </h1>
            <p className="max-w-[480px] text-lg leading-relaxed text-forest-900">
              Specialist agents read the market for you: sentiment, price behaviour, and risk. Every conclusion is
              explained in plain language. No black boxes, no hype-chasing.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-forest-700 px-[30px] py-[15px] text-[15px] font-semibold text-white transition-opacity hover:opacity-85 active:scale-[0.98]"
              >
                Open Account
                <ArrowUpRight size={16} strokeWidth={2} />
              </Link>
              <a
                href="#swarm"
                className="rounded-full border border-forest-900/20 bg-white/50 px-[30px] py-[15px] text-[15px] font-semibold text-forest-700 transition-colors hover:border-forest-900/40"
              >
                See How the Swarm Works
              </a>
            </div>
            <p className="text-[13px] text-forest-500">US stocks · prices shown in rand</p>
          </div>
        </div>

        {/* Hero bento row */}
        <div className="relative mt-5 grid grid-cols-1 gap-5 md:grid-cols-[1.2fr_1fr_1fr]">
          {/* Today's top pick */}
          <div className="relative z-4 flex flex-col gap-3.5 rounded-2xl bg-white p-6 shadow-md">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">Today's Top Pick</p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-forest-900/10 bg-neutral-100/70 text-[10px] font-bold">
                  NVD
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-forest-700">NVDA</p>
                  <p className="text-xs text-forest-700">NVIDIA Corp · R 1240.50</p>
                </div>
              </div>
              <span className="inline-flex rounded-sm bg-forest-700/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-forest-700">
                Rank 1
              </span>
            </div>
            <div>
              <div className="mb-1 flex justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-forest-700">Sentiment Score</span>
                  <span className="rounded-full bg-forest-900/6 px-1.5 py-px text-[9px] text-muted">Last 7 days</span>
                </span>
                <span className="text-xs font-semibold text-forest-900">72%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full w-[72%] bg-forest-700" />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-forest-700">Quant Position vs Peers</span>
                <span className="text-xs font-semibold text-forest-900">81st pctile</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-neutral-100">
                <span className="absolute top-1/2 left-[81%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-forest-700 shadow-[0_2px_6px_rgba(17,35,32,0.05)]" />
              </div>
            </div>
            <div className="rounded-lg border border-forest-900/7 bg-neutral-100/50 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <Zap size={12} className="text-forest-700" strokeWidth={2} />
                Why it ranks here
              </p>
              <p className="text-xs leading-normal text-forest-900/85">
                Positive coverage tone and top-quartile momentum agree, with no hype gap detected between the two
                engines.
              </p>
            </div>
          </div>

          {/* Signal Scorecard (dark) */}
          <div className="relative z-4 flex flex-col items-start gap-3 overflow-hidden rounded-2xl bg-forest-900 p-6">
            <svg viewBox="0 0 400 220" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-[90px] w-full" aria-hidden="true">
              <path d="M0,140 C60,110 120,170 200,148 C280,128 330,162 400,140 L400,220 L0,220 Z" className="fill-forest-600" opacity="0.7" />
              <path d="M0,180 C80,160 160,196 260,178 C330,166 370,182 400,174 L400,220 L0,220 Z" className="fill-lime-500" opacity="0.18" />
            </svg>
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-lime-500/18 px-3 py-1 text-[11px] font-bold tracking-[0.02em] text-lime-500">
              Signals agree strongly
            </span>
            <ScorecardRowsDark />
            <p className="text-[13px] leading-[1.55] text-neutral-100/75">
              Every verdict is a state, not a secret score. Tap any row and the Swarm shows its working.
            </p>
          </div>

          {/* Hype flag */}
          <div className="relative z-2 flex flex-col justify-between gap-3 rounded-2xl bg-white p-6 shadow-md">
            <span className="inline-flex items-center gap-1.5 self-start rounded-sm bg-warning/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-warning-strong">
              <Flame size={12} strokeWidth={2} />
              Hype flagged
            </span>
            <p className="text-[22px] font-medium leading-[1.3] tracking-tight text-forest-700">
              We flag the hype before you chase it.
            </p>
            <p className="text-[13px] leading-[1.55] text-muted">
              When social buzz outruns the fundamentals, the Swarm says so, plainly, on the card.
            </p>
            <a href="#journey" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-forest-700 hover:underline">
              Follow the journey
              <ArrowRight size={14} strokeWidth={2} />
            </a>
          </div>
        </div>
      </header>

      {/* ═══ The Swarm ═══ */}
      <section id="swarm" className="relative mx-auto mt-32 max-w-[1200px] px-4 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-forest-900 px-8 py-12 md:px-16 md:py-[72px]">
          <svg viewBox="0 0 600 600" className="pointer-events-none absolute -top-[180px] -right-[160px] h-[480px] w-[480px]" aria-hidden="true">
            <circle cx="300" cy="300" r="280" className="fill-lime-500" opacity="0.16" />
            <circle cx="300" cy="300" r="190" className="fill-lime-500" opacity="0.12" />
          </svg>
          <svg viewBox="0 0 400 400" className="pointer-events-none absolute -bottom-[220px] -left-[140px] h-[420px] w-[420px]" aria-hidden="true">
            <circle cx="200" cy="200" r="190" fill="none" className="stroke-lime-500" strokeWidth={1.5} opacity="0.35" />
            <circle cx="200" cy="200" r="130" fill="none" className="stroke-lime-500" strokeWidth={1.5} opacity="0.25" />
          </svg>
          <div className="relative z-2 flex flex-col gap-12">
            <div className="max-w-[560px]">
              <p className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-lime-500">Meet The Swarm</p>
              <h2 className="mb-4 text-4xl font-medium leading-[1.1] tracking-tight text-white md:text-[44px]">
                One Committee. Zero Emotions.
              </h2>
              <p className="text-base leading-relaxed text-neutral-100/72">
                Independent engines measure every asset, an orchestrator weighs their findings against your profile,
                and the result arrives as a ranked, fully explained list.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {AGENTS.map(({ Icon, name, desc }) => (
                <div key={name} className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-white/6 p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-lime-500/15">
                    <Icon size={20} className="text-lime-500" strokeWidth={2} />
                  </div>
                  <p className="text-[15px] font-semibold text-white">{name}</p>
                  <p className="text-[13px] leading-normal text-neutral-100/65">{desc}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-4">
              <div className="h-px flex-1 bg-lime-500/25" />
              <span className="inline-flex items-center gap-2 rounded-full bg-lime-500 px-[22px] py-2.5 text-center text-[13px] font-bold uppercase tracking-wide text-forest-900">
                <Terminal size={14} strokeWidth={2} />
                Your Ranked, Explained List
              </span>
              <div className="h-px flex-1 bg-lime-500/25" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Journey ═══ */}
      <section id="journey" className="relative mx-auto mt-32 max-w-[1200px] px-4 sm:px-8">
        <div className="mx-auto mb-24 max-w-[620px] text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-forest-700">The Journey</p>
          <h2 className="mb-4 text-4xl font-medium leading-[1.1] tracking-tight text-balance text-forest-700 md:text-5xl">
            From First Login to Confident Investor
          </h2>
          <p className="text-base leading-relaxed text-muted">
            Scroll the path. Six stops, two investors, and a swarm doing the homework at every one.
          </p>
        </div>

        {/* Ribbon 2: weaves from journey intro through stop 01 */}
        <SquiggleRibbon
          pathId="rb-two"
          d="M1350,60 C1050,160 850,80 700,260 C610,400 680,500 640,600 C600,700 300,640 -60,700"
          viewBox="0 0 1300 1100"
          para={0.12}
          rot={-2}
          className="hidden lg:block z-1 top-[160px] -right-[180px] h-[1100px] w-[1300px]"
          strokeClass="stroke-forest-700"
          strokeWidth={52}
          strokeOpacity={0.95}
          text="A Few Minutes Of Setup · Every List Filtered Through Your Risk Profile · Pick Your Path · The Swarm Does The Rest"
          textFillClass="fill-lime-200"
          textSize={19}
          startOffset="3%"
        />

        {/* Stop 01 · Your Profile */}
        <div className="relative z-2 grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-[18px]">
            <StopHeader
              eyebrow="Stop 01 · Your Profile"
              title="Tell the Swarm Who You Are"
              body="Choose your investor path, tap the companies you already know, and take a short risk assessment. All AI recommendations are filtered through the risk mandate that results. Fit with your profile is one of the four disclosed ranking factors."
            />
          </div>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-md border border-lime-500 bg-white p-3.5 ring-4 ring-lime-500/25">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-forest-900">Technology</span>
                  <span className="flex h-3 w-3 items-center justify-center rounded-full border border-lime-500 bg-lime-500">
                    <span className="h-1 w-1 rounded-full bg-forest-900" />
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-normal text-muted-foreground">Software, hardware &amp; semiconductors</p>
              </div>
              <div className="rounded-md border border-forest-900/14 bg-neutral-100/50 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-muted-foreground">Green Energy</span>
                  <span className="h-3 w-3 rounded-full border border-forest-900/14" />
                </div>
                <p className="mt-1 text-[10px] leading-normal text-muted-foreground">Solar, wind &amp; clean infrastructure</p>
              </div>
              <div className="rounded-md border border-lime-500 bg-white p-3.5 ring-4 ring-lime-500/25">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-forest-900">AI &amp; Robotics</span>
                  <span className="flex h-3 w-3 items-center justify-center rounded-full border border-lime-500 bg-lime-500">
                    <span className="h-1 w-1 rounded-full bg-forest-900" />
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-normal text-muted-foreground">Machine learning &amp; automation</p>
              </div>
            </div>
            <InvestorProfileCard
              compact
              name="Betty M."
              archetype="Conservative"
              experience="Novice"
              path="Steady Builder"
              sectors={['Technology', 'AI & Robotics']}
            />
          </div>
        </div>

        {/* Stop 02 · The Dashboard */}
        <div className="relative z-2 mt-40 grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="relative grid grid-cols-1 gap-4 max-lg:order-2 sm:grid-cols-2">
            <div className="relative z-4 flex flex-col items-center gap-5 rounded-2xl bg-white p-[22px] shadow-md sm:col-span-2 sm:flex-row">
              <ScorecardRowsLight />
              <div className="flex-1">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-forest-700">Signal Scorecard</p>
                <p className="text-[13px] leading-normal text-muted">
                  Four disclosed factors, each shown as a position, with no composite number anywhere. Tap any row and
                  the app explains it.
                </p>
              </div>
            </div>
            <div className="relative z-2 rounded-2xl bg-white p-5 shadow-md">
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-lime-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-forest-900">
                <Sparkles size={11} strokeWidth={2} />
                Discovered
              </span>
              <p className="mt-2.5 text-[13px] leading-[1.55] text-muted">Companies the agent found on its own carry the lime badge.</p>
            </div>
            <div className="relative z-2 rounded-2xl bg-white p-5 shadow-md">
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-warning/15 px-2.5 py-1 text-[10px] font-bold tracking-[0.02em] text-warning-strong">
                <Flame size={11} strokeWidth={2} />
                Hype flagged
              </span>
              <p className="mt-2.5 text-[13px] leading-[1.55] text-muted">Buzz without substance gets a warning, not a rank boost.</p>
            </div>
          </div>
          <div className="flex flex-col gap-[18px] max-lg:order-1">
            <StopHeader
              eyebrow="Stop 02 · The Dashboard"
              title="One Daily Pick, Fully Explained"
              body={'Your dashboard centralizes the Swarm\'s intelligence: a ranked top pick, sentiment and quant read side by side, and a "why it ranks here" trace on every card.'}
            />
          </div>
        </div>

        {/* Ribbon 3: lime, crosses between stop 02 and 03 */}
        <SquiggleRibbon
          pathId="rb-three"
          d="M-80,250 C260,160 560,300 900,220 C1150,150 1420,270 1680,210"
          viewBox="0 0 1600 700"
          para={0.12}
          rot={3}
          className="hidden lg:block z-1 top-[1010px] -left-[220px] h-[720px] w-[1650px]"
          strokeClass="stroke-lime-500"
          strokeWidth={54}
          text="Track The Signals · Question The Hype · Learn As You Go · Track The Signals · Question The Hype · Learn As You Go"
          textFillClass="fill-forest-700"
          textSize={20}
          startOffset="2%"
        />

        {/* Stop 03 · Watchlist */}
        <div className="relative z-2 mt-40 grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-[18px]">
            <StopHeader
              eyebrow="Stop 03 · Watchlist"
              title="A Library, Not a Second Analysis Run"
              body="Track any asset. Watched assets are included in your next analysis run. Until then it's live prices and 14-day charts, deliberately free of AI scores."
            />
            <ul className="flex flex-col gap-2.5">
              {['Live prices & 14-day sparklines', 'No scores, just the asset', 'Watched assets join your next analysis run'].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-forest-700">
                  <CheckCircle2 size={18} className="shrink-0 text-forest-700" strokeWidth={2} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="relative z-4 flex flex-col gap-3 rounded-lg bg-white p-4 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-forest-900/10 bg-neutral-100/70 text-[10px] font-bold">
                    AAPL
                  </div>
                  <div>
                    <p className="text-sm font-bold text-forest-900">AAPL</p>
                    <p className="text-[11px] text-muted-foreground">Apple Inc.</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-sm bg-forest-900/6 px-2 py-[3px] text-[10px] font-bold uppercase text-info">
                  <span className="h-1.5 w-1.5 rounded-full bg-info" />
                  Technology
                </span>
              </div>
              <div className="relative">
                <svg viewBox="0 0 200 44" className="h-12 w-full">
                  <polyline
                    points="0,36 18,32 36,34 54,26 72,28 90,20 108,24 126,16 144,18 162,10 180,14 200,6"
                    fill="none"
                    className="stroke-gain"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="absolute right-0 bottom-0 text-xs font-bold text-gain">R 3412.80</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-forest-700">
                  Full analysis <ArrowRight size={12} strokeWidth={2} />
                </span>
                <span className="text-[10px] text-muted-foreground">14-day chart</span>
              </div>
            </div>
            <div className="relative z-2 flex flex-col gap-3 rounded-lg bg-white p-4 shadow-md sm:mt-7">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-forest-900/10 bg-neutral-100/70 text-[10px] font-bold">
                    TSLA
                  </div>
                  <div>
                    <p className="text-sm font-bold text-forest-900">TSLA</p>
                    <p className="text-[11px] text-muted-foreground">Tesla Inc</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-sm bg-forest-900/6 px-2 py-[3px] text-[10px] font-bold uppercase text-sector-ai-robotics-strong">
                  <span className="h-1.5 w-1.5 rounded-full bg-sector-ai-robotics" />
                  AI &amp; Robotics
                </span>
              </div>
              <div className="relative">
                <svg viewBox="0 0 200 44" className="h-12 w-full">
                  <polyline
                    points="0,10 18,14 36,12 54,20 72,18 90,26 108,22 126,30 144,28 162,34 180,32 200,38"
                    fill="none"
                    className="stroke-loss"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="absolute right-0 bottom-0 text-xs font-bold text-loss">R 4302.18</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-forest-700">
                  Full analysis <ArrowRight size={12} strokeWidth={2} />
                </span>
                <span className="text-[10px] text-muted-foreground">14-day chart</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stop 04 · Whale Watching */}
        <div className="relative z-2 mt-40">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <div className="relative overflow-hidden rounded-lg bg-forest-700 px-7 pt-8 pb-16 max-lg:order-2">
              <svg viewBox="0 0 1440 220" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full" aria-hidden="true">
                <path d="M0,140 C160,100 320,180 480,150 C640,120 800,170 960,145 C1120,120 1280,165 1440,135 L1440,220 L0,220 Z" className="fill-forest-600" opacity="0.7" />
                <path d="M0,165 C180,135 300,197 520,170 C740,145 860,192 1080,168 C1260,150 1360,182 1440,165 L1440,220 L0,220 Z" className="fill-forest-500" opacity="0.55" />
                <path d="M0,192 C200,172 380,207 600,193 C820,180 1000,206 1220,191 C1330,183 1390,193 1440,189 L1440,220 L0,220 Z" className="fill-lime-500" opacity="0.22" />
              </svg>
              <div className="relative">
                <h4 className="mb-2 flex items-center gap-3 text-[26px] font-bold text-neutral-100">
                  <Waves size={26} className="text-lime-500" strokeWidth={2} />
                  Whale Watching
                </h4>
                <p className="max-w-[400px] text-[13px] leading-relaxed text-neutral-100/75">
                  Insider dealings, the institutions that own each stock, and what the largest funds are buying.
                  Informational only; this never affects your recommendations.
                </p>
                <div className="mt-[18px] flex flex-wrap gap-2.5">
                  <div className="min-w-[120px] flex-1 rounded-[14px] bg-white p-3.5">
                    <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-[10px] bg-forest-700">
                      <Cpu size={16} className="text-neutral-100" strokeWidth={2} />
                    </div>
                    <p className="text-[13px] font-semibold text-forest-900">Technology</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-forest-700">14 companies</p>
                  </div>
                  <div className="min-w-[120px] flex-1 rounded-[14px] bg-white p-3.5">
                    <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-[10px] bg-forest-700">
                      <TrendingUp size={16} className="text-neutral-100" strokeWidth={2} />
                    </div>
                    <p className="text-[13px] font-semibold text-forest-900">Finance</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-forest-700">11 companies</p>
                  </div>
                  <div className="relative min-w-[120px] flex-1 rounded-[14px] bg-white p-3.5">
                    <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-[3px] rounded-sm bg-lime-500 px-2 py-0.5 text-[9px] font-bold uppercase text-forest-900">
                      New
                    </span>
                    <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-[10px] bg-forest-700">
                      <Bot size={16} className="text-neutral-100" strokeWidth={2} />
                    </div>
                    <p className="text-[13px] font-semibold text-forest-900">AI &amp; Robotics</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-forest-700">9 companies</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-[18px] max-lg:order-1">
              <StopHeader
                eyebrow="Stop 04 · Whale Watching"
                title="Follow the Big Money"
                body="Open any company for its insider dealings (SEC Form 4) and institutional owners (13F filings), or flip to Top Funds, with a cluster-buying callout when multiple insiders buy within 30 days."
              />
            </div>
          </div>
        </div>

        {/* Ribbon 4: forest S-curve behind learning */}
        <SquiggleRibbon
          pathId="rb-four"
          d="M-60,200 C300,80 560,340 840,260 C1140,175 1240,430 1560,380"
          viewBox="0 0 1500 900"
          para={0.1}
          rot={-3}
          className="hidden lg:block z-1 top-[1990px] -left-[200px] h-[940px] w-[1560px]"
          strokeClass="stroke-lime-300"
          strokeWidth={64}
          text="Read · Quiz · Earn The Badge · Every Concept In Plain Language · Read · Quiz · Earn The Badge"
          textFillClass="fill-forest-700"
          textSize={20}
          startOffset="4%"
          textOpacity={0.75}
        />

        {/* Stop 05 · Learning Centre */}
        <div className="relative z-2 mt-40 grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-[18px]">
            <StopHeader
              eyebrow="Stop 05 · Learning Centre"
              title="Learn as You Go, Earn as You Learn"
              body="Bite-size articles by difficulty, quizzes that earn XP when you pass at 80%+, and badges that unlock as you learn. A perfect score puts a trophy on the article."
            />
          </div>
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start">
            <div className="relative flex-[1.2] rounded-lg border border-forest-900/14 bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_32px_-16px_rgba(17,35,32,0.2)] backdrop-blur-lg">
              <div className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-forest-700/20 bg-forest-700/10 text-forest-700">
                <Trophy size={18} strokeWidth={2} />
              </div>
              <span className="mb-3 inline-flex rounded-full border border-forest-900/14 bg-neutral-100/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-forest-700">
                Beginner
              </span>
              <h4 className="mb-2 text-[17px] font-semibold text-forest-900">Risk vs Reward</h4>
              <p className="mb-5 text-[13px] leading-[1.55] text-muted-foreground">
                Why bigger potential returns come with bigger swings, and how to find the level you can live with.
              </p>
              <div className="flex gap-2.5">
                <span className="rounded-full border border-forest-900/14 bg-white px-4 py-2 text-[13px] text-forest-900">Read Article</span>
                <span className="rounded-full bg-forest-700 px-4 py-2 text-[13px] font-medium text-neutral-100">Take Quiz</span>
              </div>
            </div>
            <div className="relative flex-[0.9] overflow-hidden rounded-lg bg-forest-900 p-5 sm:mt-9">
              <svg viewBox="0 0 300 160" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-[60px] w-full" aria-hidden="true">
                <path d="M0,120 C80,100 160,140 300,110 L300,160 L0,160 Z" className="fill-forest-600" opacity="0.7" />
              </svg>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-eyebrow text-lime-500">Quiz Result</p>
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-lime-500 bg-lime-500/15">
                <Trophy size={26} className="text-lime-500" strokeWidth={2} />
              </div>
              <p className="text-[15px] font-semibold text-white">Congratulations!</p>
              <p className="mt-1 text-xs text-neutral-100/65">You earned +100 XP · Newly earned badges: 1</p>
            </div>
          </div>
        </div>

        {/* Stop 06 · How It Works */}
        <div className="relative z-2 mt-40 grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-2xl bg-white p-8 shadow-md max-lg:order-2">
            <p className="mb-5 text-[10px] font-semibold uppercase tracking-eyebrow text-forest-700">How these numbers are built</p>
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-700/10 text-sm font-bold text-forest-700">1</div>
                <div className="mt-1 w-px flex-1 bg-forest-900/10" />
              </div>
              <div className="pb-7">
                <p className="mb-1 text-sm font-semibold text-forest-900">Two engines measure independently</p>
                <p className="text-[13px] leading-[1.55] text-muted">
                  Sentiment reads what's being said; quant reads what the price is doing. Neither sees the other's
                  answer.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-700/10 text-sm font-bold text-forest-700">2</div>
                <div className="mt-1 w-px flex-1 bg-forest-900/10" />
              </div>
              <div className="pb-7">
                <p className="mb-1 text-sm font-semibold text-forest-900">Four disclosed factors decide the order</p>
                <p className="text-[13px] leading-[1.55] text-muted">
                  Signal strength, agreement, evidence depth, and fit with your profile, multiplied together, so one
                  weak factor genuinely drags a pick down.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-700/10 text-sm font-bold text-forest-700">3</div>
              <div>
                <p className="mb-1 text-sm font-semibold text-forest-900">Every card links to its explanation</p>
                <p className="text-[13px] leading-[1.55] text-muted">
                  "How is this calculated?" is a tap away from any number in the app. The walkthrough page shows the
                  working.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-[18px] max-lg:order-1">
            <StopHeader
              eyebrow="Stop 06 · How It Works"
              title="No Black Boxes. Ever."
              body={'Transparency is the product. Every methodology (sentiment, quant, and ranking) has its own plain-language walkthrough. As the app puts it: "Four measurements decide placement: there is no single overall score."'}
            />
            <p className="text-[13px] text-muted-foreground">
              Fit with your profile only ever demotes a pick, never promotes one. Research and education only, never
              financial advice.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="relative z-2 mx-auto mt-40 max-w-[800px] px-8">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-forest-700">Questions &amp; Answers</p>
          <h2 className="text-4xl font-medium tracking-tight text-forest-700 md:text-[44px]">Frequently Asked Questions</h2>
        </div>
        <div className="flex flex-col gap-3">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group rounded-lg bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-base font-semibold text-forest-900 [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown
                  size={18}
                  className="shrink-0 text-forest-700 transition-transform duration-200 group-open:rotate-180"
                  strokeWidth={2}
                />
              </summary>
              <p className="px-6 pb-5 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section id="cta" className="relative mx-auto mt-32 max-w-[1200px] px-4 sm:px-8">
        <SquiggleRibbon
          pathId="rb-cta"
          d="M950,20 C780,90 700,50 640,140 C570,250 760,330 680,470"
          viewBox="0 0 900 500"
          para={0.14}
          rot={4}
          className="hidden lg:block z-1 -top-[120px] -right-[140px] h-[480px] w-[860px]"
          strokeClass="stroke-lime-500"
          strokeWidth={48}
          text="Join The Swarm · Research Without The Noise · Join The Swarm"
          textFillClass="fill-forest-700"
          textSize={18}
          startOffset="4%"
        />
        <div className="relative z-2 overflow-hidden rounded-3xl bg-forest-900 px-8 py-16 md:px-16 md:py-[88px]">
          <svg viewBox="0 0 600 600" className="pointer-events-none absolute -top-[200px] -right-[180px] h-[520px] w-[520px]" aria-hidden="true">
            <circle cx="300" cy="300" r="280" className="fill-lime-500" opacity="0.14" />
          </svg>
          <svg viewBox="0 0 400 400" className="pointer-events-none absolute -bottom-[240px] -left-[120px] h-[400px] w-[400px]" aria-hidden="true">
            <circle cx="200" cy="200" r="190" fill="none" className="stroke-lime-500" strokeWidth={1.5} opacity="0.35" />
          </svg>
          <div className="relative z-2 flex max-w-[560px] flex-col gap-5">
            <p className="text-xs font-semibold uppercase tracking-eyebrow text-lime-500">Ready When You Are</p>
            <h2 className="text-4xl font-medium leading-[1.1] tracking-tight text-white md:text-5xl">
              Let the Swarm Do the Homework
            </h2>
            <p className="text-base leading-relaxed text-neutral-100/72">
              Open your account, set your profile, and get your first explained pick today.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-lime-500 px-8 py-[15px] text-[15px] font-bold text-forest-900 transition-colors hover:bg-lime-400 active:scale-[0.98]"
              >
                Open Account
                <ArrowUpRight size={16} strokeWidth={2} />
              </Link>
              <span className="text-[13px] text-neutral-100/55">Research and education only, not financial advice</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className="relative z-2 mx-auto mt-24 max-w-[1200px] px-4 sm:px-8 pb-12">
        <div className="flex flex-wrap justify-between gap-12 border-b border-forest-900/8 pb-10">
          <div className="max-w-[300px]">
            <div className="mb-3">
              <Wordmark size={20} />
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              An AI investment committee that explains its working. Research and education only, not financial advice.
            </p>
          </div>
          <div className="flex flex-wrap gap-16">
            <div>
              <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">Product</p>
              <div className="flex flex-col gap-2.5">
                <a href="#journey" className="text-sm text-forest-900 hover:underline">Dashboard</a>
                <a href="#journey" className="text-sm text-forest-900 hover:underline">Watchlist</a>
                <a href="#journey" className="text-sm text-forest-900 hover:underline">Whale Watching</a>
                <a href="#journey" className="text-sm text-forest-900 hover:underline">Learning Centre</a>
              </div>
            </div>
            <div>
              <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">Company</p>
              <div className="flex flex-col gap-2.5">
                <a href="#journey" className="text-sm text-forest-900 hover:underline">How It Works</a>
                <a href="#faq" className="text-sm text-forest-900 hover:underline">FAQ</a>
                <Link to="/login" className="text-sm text-forest-900 hover:underline">Sign In</Link>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">© 2026 AlphaSwarm · Information Systems Honours Project</p>
      </footer>
    </div>
  )
}
