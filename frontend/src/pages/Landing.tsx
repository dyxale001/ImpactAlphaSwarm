import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Calculator,
  CandlestickChart,
  Check,
  ChevronDown,
  CircleHelp,
  Columns2,
  Eye,
  Flame,
  Info,
  Landmark,
  Layers,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Newspaper,
  Sparkles,
  Terminal,
  Upload,
  UserRound,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react'
import { FUNDS_ENABLED } from '../utils/fundsFlags'
import { COMPARE_ENABLED } from '../utils/compareFlags'
import { MACRO_NEWS_ENABLED } from '../utils/macroNewsFlags'
import { sectorColour } from '../utils/sectorColours'

// The public front door. Written to the reframe the team settled on (D-230,
// D-231): lead with the problem, then what the platform explains, never what it
// recommends. Nothing here says advice, predictions or live web search, and no
// data source is named as a partner.
//
// Every flagged feature (Funds, Compare, Market News) appears only while its
// flag is on, so the page never advertises a page a visitor cannot open.

type Flag = 'funds' | 'compare' | 'news'
const FLAGS: Record<Flag, boolean> = { funds: FUNDS_ENABLED, compare: COMPARE_ENABLED, news: MACRO_NEWS_ENABLED }
const on = (flag?: Flag) => !flag || FLAGS[flag]

// ─── Content ───────────────────────────────────────────────────────────────

type Feature = { icon: LucideIcon; title: string; body: string; tab?: string; flag?: Flag }

// Grouped like the app's sidebar.
const FEATURE_GROUPS: { label: string; items: Feature[] }[] = [
  {
    label: 'Explore',
    items: [
      { icon: CandlestickChart, title: 'Stocks', tab: 'stocks', body: 'Up to 30 US stocks in your sectors ranked for your profile each run, with why each one sits where it does. Every stock has its own page.' },
      { icon: Landmark, title: 'Funds', tab: 'funds', flag: 'funds', body: 'South African unit trusts and ETFs matched to your answers, with “Why this appears” on each. Upload any fund’s fact sheet to add it.' },
      { icon: Newspaper, title: 'Market News', tab: 'news', flag: 'news', body: 'The week’s market news scored for how relevant it is to each sector, with a short AI overview.' },
      { icon: Waves, title: 'Whale Watching', tab: 'whale', body: 'Insider dealings, the institutions that own each stock and what the largest funds hold.' },
    ],
  },
  {
    label: 'Your tools',
    items: [
      { icon: LayoutDashboard, title: 'Dashboard', tab: 'dash', body: 'Your shortlist, watchlist, news and learning progress on one board you arrange yourself.' },
      { icon: Eye, title: 'Watchlist', tab: 'stocks', body: 'Follow any US stock with live prices and 14-day charts. Watched stocks join your next analysis run.' },
      { icon: Columns2, title: 'Compare', tab: 'compare', flag: 'compare', body: 'Line up two or three stocks or funds side by side, with the measure that differs most marked.' },
      { icon: Calculator, title: 'Financial Tools', tab: 'learn', body: 'See what saving could grow to, what a goal takes, and how much tax-free allowance you have left.' },
    ],
  },
  {
    label: 'Learn and ask',
    items: [
      { icon: BookOpen, title: 'Learning Centre', tab: 'learn', body: 'Short lessons on a roadmap matched to your level, with quizzes, XP and badges.' },
      { icon: Sparkles, title: 'Ask AlphaSwarm', tab: 'ask', body: 'Ask about your results, any stock or fund, or what a term means. Answers explain and list their sources, never advise.' },
      { icon: Info, title: 'Explained on every page', tab: 'stocks', body: 'A “How is this worked out?” window and short lessons sit next to every figure, so nothing is a black box.' },
      { icon: UserRound, title: 'Your profile, your reasons', body: 'Settings shows the answers behind your risk rating in plain words, and you can retake the questions any time.' },
    ],
  },
]

const FAQS: { q: string; a: string; flag?: Flag }[] = [
  { q: 'Is AlphaSwarm financial advice?', a: 'No. It gathers the evidence and explains it, and is designed to stay on the informational side. There are no buy, hold or sell calls and no price predictions, and the decision always stays with you.' },
  { q: 'Do I need investing experience?', a: 'No. Onboarding places you from novice to advanced, explanations match your level, and the Learning Centre teaches the ideas in short lessons with quizzes.' },
  { q: 'How does AlphaSwarm decide the order of stocks?', a: 'Two independent engines, one reading sentiment and one reading price behaviour, measure each stock. Four disclosed factors then decide the order: signal strength, agreement, evidence depth and fit with your profile. There is no single hidden score.' },
  { q: 'What does it cover?', a: 'US stocks listed on the NYSE and Nasdaq in six sectors: Technology, Green Energy, Finance, AI & Robotics, Healthcare, and Media & Communications. Each run scores up to 30 stocks for you.' },
  { q: 'Which funds are covered, and how are they matched?', flag: 'funds', a: 'South African unit trusts and ETFs, described from their managers’ fact sheets. A fund appears in your matches when its published risk label and minimum term fit your answers. No AI picks the funds.' },
  { q: 'What happens to a fact sheet I upload?', flag: 'funds', a: 'It is read for you, anything unclear is flagged, and you confirm or correct those values before it is saved. The PDF isn’t kept, and uploaded funds stay private to your account.' },
  { q: 'Where does the data come from?', a: 'Prices from Yahoo Finance with the USD/ZAR rate stated, company news from Finnhub and Marketaux, social posts from StockTwits, insider and institutional filings from the SEC (Form 4 and 13F), and fund facts from managers’ published fact sheets.' },
  { q: 'What does “Hype flagged” mean?', a: 'When social buzz runs ahead of what the price evidence supports, the stock is flagged rather than pushed up. AlphaSwarm never ranks by how often a stock is mentioned.' },
  { q: 'Can Ask AlphaSwarm get things wrong?', a: 'Yes, so every answer lists its sources and AI-written text is labelled. It explains your data and terms, and won’t predict prices or tell you what to buy.' },
]

// ─── Small pieces ──────────────────────────────────────────────────────────

const SIGNUP = '/signup'
const SECTION_HEAD = 'flex max-w-[720px] flex-col gap-3'
const EYEBROW = 'text-xs font-bold uppercase tracking-[0.1em] text-forest-700'
const H2 = 'text-balance text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-forest-900 lg:text-[40px]'
const SUB = 'max-w-[62ch] text-base text-brand-muted-fg'
const CARD = 'flex min-w-0 flex-col gap-3 rounded-[20px] border border-forest-900/8 bg-white p-5 shadow-[0_1px_2px_rgba(17,35,32,.04),0_6px_18px_rgba(17,35,32,.04)]'

function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-xl font-extrabold tracking-[-0.04em] text-forest-900">
      <Terminal size={20} className="text-forest-700" strokeWidth={2} aria-hidden="true" />
      AlphaSwarm
    </span>
  )
}

function SparkTile({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <span
      className={`grid shrink-0 place-items-center bg-lime-500 text-forest-800 ${
        size === 'lg' ? 'h-10 w-10 rounded-[12px]' : 'h-[22px] w-[22px] rounded-[7px]'
      }`}
      aria-hidden="true"
    >
      <Sparkles className={size === 'lg' ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5'} />
    </span>
  )
}

function Meter({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-brand-muted-fg">{label}</span>
        <b className="text-sm tabular-nums text-forest-900">{value}</b>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-forest-900/8">
        <i className="block h-full rounded-full bg-forest-700" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function TickerTile({ ticker, small = false, light = false }: { ticker: string; small?: boolean; light?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center px-1.5 text-xs font-bold ${light ? 'bg-forest-50 text-forest-700' : 'bg-forest-700 text-white'} ${
        small ? 'h-8 min-w-8 rounded-[10px]' : 'h-9 min-w-9 rounded-[11px]'
      }`}
      aria-hidden="true"
    >
      {ticker}
    </span>
  )
}

function SectorDot({ sector }: { sector: string }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${sectorColour(sector).fill}`} aria-hidden="true" />
}

/** A plain forest ribbon, drawn in by the shared ribbon CSS. It keeps its
 *  proportions (the panel crops it rather than stretching it) and is hidden on
 *  phones, where it would only cut across the copy. */
function Ribbon({ d, viewBox, width, className }: { d: string; viewBox: string; width: number; className: string }) {
  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" className={`pointer-events-none absolute hidden lg:block ${className}`} aria-hidden="true">
      <path pathLength={1} strokeDasharray="1" d={d} fill="none" className="ribbon-draw stroke-forest-700" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Tour panes (example figures, drawn with the app's own pieces) ─────────

// A smooth-ish random walk ending at `end`, seeded so the picture never changes.
function walk(seed: number, n: number, end: number) {
  let s = seed
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  const z = [0]
  for (let i = 1; i < n; i++) z.push(z[i - 1] + (r() - 0.5) * 5)
  return z.map((v, i) => (end * i) / (n - 1) + v - (z[n - 1] * i) / (n - 1))
}

function DarkChart() {
  const series = [
    { d: walk(11, 30, 42), stroke: 'var(--color-lime-500)', dash: undefined },
    { d: walk(23, 30, 18.6), stroke: '#ffffff', dash: '6 4' },
  ]
  const all = series.flatMap((s) => s.d)
  const mn = Math.min(...all)
  const mx = Math.max(...all)
  const y = (v: number) => (1 - (v - mn) / (mx - mn || 1)) * 100
  return (
    <div className="h-[140px] rounded-[14px] bg-forest-700 p-3">
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="block h-full w-full overflow-visible" aria-hidden="true">
        <line x1="0" x2="1000" y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.25)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        {series.map((s, k) => (
          <path
            key={k}
            d={s.d.map((v, i) => `${i ? 'L' : 'M'}${((i / (s.d.length - 1)) * 1000).toFixed(1)},${y(v).toFixed(1)}`).join('')}
            fill="none"
            stroke={s.stroke}
            strokeWidth={2.5}
            strokeDasharray={s.dash}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  )
}

const ROW = 'flex min-w-0 items-center gap-3 border-t border-forest-900/8 py-2.5 first:border-t-0 first:pt-0 last:pb-0'

type TourItem = { key: string; label: string; flag?: Flag; title: string; body: string; ticks: string[]; stage: ReactNode }

const TOUR: TourItem[] = [
  {
    key: 'dash',
    label: 'Dashboard',
    title: 'Your board, arranged your way',
    body: 'A starter board is ready the moment you finish setup. Add, move and resize widgets for the parts you use most.',
    ticks: ['Your shortlist and the stocks ranked below it', 'Your watchlist with 14-day charts', 'Sector news, big investors and insider buying for any stock', 'Learning progress and your next lesson'],
    stage: (
      <>
        <div className={CARD}>
          <div className="flex items-center justify-between gap-3"><b className="text-base text-forest-900">Good afternoon, Naledi</b><span className="chip">4 widgets</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="as-inset p-3"><p className="text-xs text-brand-muted-fg">Last AI run</p><p className="text-sm font-bold tabular-nums text-forest-900">13 Oct, 08:12</p></div>
            <div className="as-inset p-3"><p className="text-xs text-brand-muted-fg">Sentiment updated</p><p className="text-sm font-bold tabular-nums text-forest-900">13 Oct, 14:00</p></div>
          </div>
        </div>
        <div className={CARD}>
          <div className="flex items-center justify-between gap-3"><b className="text-sm text-forest-900">Learning progress</b><span className="chip chip-accent">2 of 6 badges</span></div>
          <div><p className="text-2xl font-bold tabular-nums text-forest-900">240</p><p className="text-xs text-brand-muted-fg">Learning XP</p></div>
          <Meter label="Lessons completed" value="3 of 11" percent={27} />
        </div>
      </>
    ),
  },
  {
    key: 'stocks',
    label: 'Stocks',
    title: 'A ranked list, with the reasons written down',
    body: 'Each run ranks up to 30 US stocks in your chosen sectors. Four disclosed factors decide the order, shown as positions rather than a hidden score.',
    ticks: ['Signal strength, agreement, evidence depth and fit with your profile', 'A plain-language “Why it ranks here” on every stock', 'Stock pages with sentiment, quant, big investors, insider trading and news', 'Hype flagged when buzz outruns the evidence'],
    stage: (
      <div className={CARD}>
        <div className="flex items-center justify-between gap-3"><b className="text-base text-forest-900">Also scored</b><span className="text-xs text-brand-muted-fg">Ranked in the same run</span></div>
        <ul>
          {[
            { rank: 6, t: 'GOOGL', n: 'Alphabet', s: '57 · Positive', up: true, p: '58th percentile' },
            { rank: 7, t: 'AMD', n: 'Advanced Micro Devices', s: '53 · Neutral', up: false, p: '61st percentile' },
            { rank: 9, t: 'PLTR', n: 'Palantir', s: '71 · Strongly positive', up: true, p: '38th percentile', hype: true },
          ].map((r) => (
            <li key={r.t} className={`${ROW} items-start`}>
              <span className="w-4 shrink-0 pt-0.5 text-center text-xs font-bold text-brand-muted-fg">{r.rank}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-forest-900">{r.t} <span className="text-xs font-normal text-brand-muted-fg">{r.n}</span></p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className={`chip ${r.up ? 'chip-up' : ''}`}>{r.s}</span>
                  <span className="text-xs tabular-nums text-brand-muted-fg">{r.p} vs peers</span>
                  {r.hype && <span className="chip chip-caution"><Flame className="h-3 w-3" aria-hidden="true" />Hype flagged</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    key: 'funds',
    label: 'Funds',
    flag: 'funds',
    title: 'South African funds matched to you, plus any fund you upload',
    body: 'Unit trusts and ETFs, described from the fact sheets their managers publish and matched when their published risk label fits your answers.',
    ticks: ['Cost a year, risk label, fund size and minimum term on every card', '“Why this appears” explains each match from the rules, not AI picks', 'Upload a fact sheet: it is read for you, and you confirm anything unclear', 'Funds you upload stay private to your account'],
    stage: (
      <>
        <div className={CARD}>
          <div className="flex flex-wrap gap-1.5"><span className="chip">Unit trust</span><span className="chip chip-line">Index tracker</span><span className="chip chip-accent">Tax-free eligible</span></div>
          <div><b className="text-base text-forest-900">Satrix Balanced Index Fund</b><p className="text-xs text-brand-muted-fg">Satrix · South African · Multi-asset</p></div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-brand-muted-fg">Risk, as the manager publishes it</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex gap-[3px]" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={`h-1.5 w-[18px] rounded-full ${n <= 3 ? 'bg-forest-700' : 'bg-forest-100'}`} />)}</span>
                <b className="text-sm text-forest-900">3 of 5</b>
              </div>
            </div>
            <div className="text-right"><p className="text-xl font-bold tabular-nums text-forest-900">0.37%</p><p className="text-xs text-brand-muted-fg">Cost a year</p></div>
          </div>
        </div>
        <div className={`${CARD} flex-row items-center border-dashed border-forest-900/28`}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-forest-50 text-forest-700"><Upload className="h-[18px] w-[18px]" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><b className="text-sm text-forest-900">Upload a fact sheet</b><p className="text-xs text-brand-muted-fg">Read for you, checked by you</p></div>
          <span className="chip chip-up"><Check className="h-3 w-3" aria-hidden="true" />Confirmed</span>
        </div>
      </>
    ),
  },
  {
    key: 'news',
    label: 'Market News',
    flag: 'news',
    title: 'The week’s news, sorted by what it means for your sectors',
    body: 'Stories from Reuters, CNBC and Bloomberg, updated through the day. Each one shows how relevant it is to each sector, never whether it is good or bad news.',
    ticks: ['A short AI overview per sector, labelled as possibly mistaken', 'Relevance shown for every sector on every story', 'Filter to your own sectors or see everything', 'Never changes your stock rankings'],
    stage: (
      <div className={CARD}>
        <div className="flex items-center justify-between gap-3"><b className="flex items-center gap-2 text-base text-forest-900"><SectorDot sector="Technology" />Technology</b><span className="text-xs text-brand-muted-fg">11 stories this week</span></div>
        <div className="as-inset p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-forest-900"><SparkTile />AI overview</p>
          <p className="text-sm leading-relaxed text-forest-900">Chip export rules and AI spending lead the week, with cloud companies raising data-centre budgets.</p>
        </div>
        <ul>
          {[['US weighs tighter curbs on AI chip exports', 'Reuters · Today 12:17', 94], ['Microsoft lifts data-centre spending forecast', 'CNBC · Today 09:35', 88], ['TSMC September sales jump 31%', 'Bloomberg · Yesterday', 81]].map(([h, s, p]) => (
            <li key={h as string} className={ROW}>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-forest-900">{h}</p><p className="text-xs text-brand-muted-fg">{s}</p></div>
              <span className="chip shrink-0 tabular-nums">{p}% relevant</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    key: 'whale',
    label: 'Whale Watching',
    title: 'Follow the big money, with the context explained',
    body: 'See which institutions own each stock and what company insiders have been buying and selling, with when it was filed and what that means.',
    ticks: ['Institutional owners from quarterly 13F filings', 'Insider dealings from SEC Form 4, routine entries labelled', 'The largest fund positions we track', 'Information only: it never changes your rankings'],
    stage: (
      <div className={CARD}>
        <div className="flex items-center justify-between gap-3"><b className="text-base text-forest-900">Who owns NVDA</b><span className="chip">13F filings</span></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="as-inset p-3"><p className="text-xs text-brand-muted-fg">Institutions</p><p className="text-xl font-bold tabular-nums text-forest-900">61.4%</p></div>
          <div className="as-inset p-3"><p className="text-xs text-brand-muted-fg">Insiders</p><p className="text-xl font-bold tabular-nums text-forest-900">3.5%</p></div>
        </div>
        <ul>
          {[['Vanguard Group Inc', '9.3%', 100], ['BlackRock Inc', '6.0%', 65], ['FMR LLC', '4.9%', 53]].map(([n, v, w]) => (
            <li key={n as string} className="border-t border-forest-900/8 py-2.5 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3"><span className="truncate text-sm font-semibold text-forest-900">{n}</span><b className="text-sm tabular-nums text-forest-900">{v}</b></div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-forest-900/8"><i className="block h-full rounded-full bg-forest-700" style={{ width: `${w}%` }} /></div>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    key: 'compare',
    label: 'Compare',
    flag: 'compare',
    title: 'Two or three side by side, with the difference marked',
    body: 'Line up stocks or funds on the same measures. Compare uses change rather than price, so a R40 share and an R800 share can be read together.',
    ticks: ['Stocks or funds, two or three at a time', '“Differs most” marks the measure that separates them', 'A plain-language note on every row', 'A written summary of what separates them'],
    stage: (
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <b className="text-sm text-forest-900">Change over one year</b>
          <span className="flex gap-3 text-xs text-brand-muted-fg">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[3px] w-3.5 bg-lime-500" />NVDA</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[3px] w-3.5 bg-forest-300" />AMD</span>
          </span>
        </div>
        <DarkChart />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-sm">
            <thead><tr className="text-left text-xs text-brand-muted-fg"><th className="px-2 pb-2 font-semibold">Measure</th><th className="px-2 pb-2 text-right font-semibold">NVDA</th><th className="px-2 pb-2 text-right font-semibold">AMD</th><th /></tr></thead>
            <tbody className="tabular-nums">
              <tr className="border-t border-forest-900/8"><td className="px-2 py-2">Change</td><td className="px-2 py-2 text-right">+42.1%</td><td className="px-2 py-2 text-right">+18.6%</td><td /></tr>
              <tr className="border-t border-forest-900/8"><td className="px-2 py-2">Largest fall</td><td className="px-2 py-2 text-right">−20.8%</td><td className="px-2 py-2 text-right">−29.1%</td><td className="px-2 py-2"><span className="chip chip-accent">Differs most</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    key: 'learn',
    label: 'Learn and plan',
    title: 'Learn the ideas, then try them with your own numbers',
    body: 'A roadmap of short lessons matched to your level, with a quiz at the end of each. Financial Tools let you test growth, goals and your tax-free allowance.',
    ticks: ['Lessons from beginner to advanced, each with a quiz', 'XP and badges as you go', 'Growth and goal calculators, with inflation shown in today’s money', 'A TFSA planner for your yearly and lifetime allowance'],
    stage: (
      <>
        <div className={CARD}>
          <div className="flex items-center justify-between gap-3"><span className="chip">Beginner</span><span className="text-xs text-brand-muted-fg">Investing basics</span></div>
          <b className="text-base text-forest-900">Diversification: not all eggs in one basket</b>
          <p className="text-sm text-brand-muted-fg">Spreading your money so one bad result does not sink everything.</p>
          <span className="as-btn as-btn-sm as-btn-primary w-fit">Read lesson <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
        </div>
        <div className={CARD}>
          <b className="text-sm text-forest-900">Tax-free allowance · 2026/27</b>
          <Meter label="This year" value="R12 000 of R46 000" percent={26} />
          <Meter label="Lifetime" value="R92 000 of R500 000" percent={18} />
        </div>
      </>
    ),
  },
  {
    key: 'ask',
    label: 'Ask AlphaSwarm',
    title: 'Ask in plain English, get the evidence back',
    body: 'Ask about your results, any stock or fund we cover, or what a term means. Answers list where they came from and never predict prices.',
    ticks: ['Questions about your own results and rankings', 'Comparisons and definitions on request', 'Sources listed under every answer', 'On every page from the Ask button'],
    stage: (
      <div className="flex flex-col gap-3">
        <p className="max-w-[85%] self-end rounded-[18px_18px_6px_18px] bg-forest-700 px-3.5 py-2.5 text-sm text-white">Why is NVDA first for me?</p>
        <div className={CARD}>
          <p className="flex items-center gap-2 text-sm font-bold text-forest-900"><SparkTile />AlphaSwarm</p>
          <p className="text-sm leading-relaxed text-forest-900">
            Both kinds of evidence point the same way. News this week scores 64 out of 100, which reads as positive, and its price trend is stronger than 84% of the stocks analysed. This describes the evidence; it isn’t a recommendation to buy.
          </p>
          <div className="as-inset p-3 text-xs"><b>Sources</b><br />AlphaSwarm analysis, 13 Oct 2026</div>
        </div>
      </div>
    ),
  },
]

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const tourItems = TOUR.filter((t) => on(t.flag))
  const [tab, setTab] = useState(tourItems[0].key)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const openTab = (key?: string) => {
    if (key && tourItems.some((t) => t.key === key)) setTab(key)
  }

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = tourItems.findIndex((t) => t.key === tab)
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = tourItems[(i + step + tourItems.length) % tourItems.length].key
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  const NAV_LINKS: [string, string][] = [['#features', 'Platform'], ['#tour', 'Explore'], ['#how', 'How it works'], ['#faq', 'FAQ']]
  const active = tourItems.find((t) => t.key === tab) ?? tourItems[0]

  return (
    <div className="min-h-screen overflow-x-clip bg-brand-bg text-forest-900 selection:bg-lime-500 selection:text-forest-900">
      {/* ═══ Nav ═══ */}
      <nav
        aria-label="Main"
        className={`sticky top-0 z-50 border-b bg-brand-bg/90 backdrop-blur-md transition-colors ${scrolled ? 'border-forest-900/8' : 'border-transparent'}`}
      >
        <div className="relative mx-auto flex h-[68px] max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-8">
          <a href="#top"><Wordmark /></a>
          <div className="hidden gap-1 lg:flex">
            {NAV_LINKS.map(([href, label]) => (
              <a key={href} href={href} className="rounded-full px-3.5 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-900/6">{label}</a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden h-10 items-center rounded-full px-4 text-sm font-semibold text-forest-900 hover:bg-forest-900/6 sm:inline-flex">Sign in</Link>
            <Link to={SIGNUP} className="as-btn as-btn-primary">Open account</Link>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className="grid h-10 w-10 place-items-center rounded-full border border-forest-900/14 bg-white lg:hidden"
            >
              {menuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          {menuOpen && (
            <div className="absolute right-4 top-16 flex w-[min(280px,calc(100vw-32px))] flex-col gap-0.5 rounded-[20px] border border-forest-900/8 bg-white p-2 shadow-float sm:right-8 lg:hidden">
              {NAV_LINKS.map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)} className="rounded-[12px] px-3.5 py-2.5 text-base font-semibold hover:bg-forest-50">{label}</a>
              ))}
              <Link to="/login" className="rounded-[12px] px-3.5 py-2.5 text-base font-semibold hover:bg-forest-50">Sign in</Link>
            </div>
          )}
        </div>
      </nav>

      <main id="top">
        {/* ═══ Hero ═══ */}
        <section aria-labelledby="hero-title" className="mx-auto max-w-[1200px] px-4 pt-5 sm:px-8">
          <div className="relative isolate grid grid-cols-1 items-center gap-12 overflow-hidden rounded-[32px] bg-lime-200 px-6 pb-9 pt-9 sm:px-10 sm:pb-14 sm:pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:px-16 lg:pb-40 lg:pt-[72px]">
            {/* One unhurried sweep: along the foot under the copy, then up and
                away behind the preview cards. */}
            <Ribbon
              viewBox="0 0 1200 680"
              d="M-60,585 C170,625 380,615 560,565 C720,520 800,450 870,380 C960,290 1040,240 1130,205 C1185,185 1235,176 1290,172"
              width={34}
              className="inset-0 z-[1] h-full w-full"
            />
            <div className="relative z-[3] flex flex-col gap-5">
              <span className="inline-flex items-center gap-2 self-start rounded-full bg-white py-1.5 pl-2 pr-3.5 text-xs font-bold text-forest-700 shadow-[0_1px_2px_rgba(17,35,32,.04),0_6px_18px_rgba(17,35,32,.04)]">
                <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-forest-700 text-lime-500"><Sparkles className="h-3 w-3" aria-hidden="true" /></span>
                For first-time South African investors
              </span>
              <h1 id="hero-title" className="text-balance text-[clamp(40px,4.6vw,56px)] font-bold leading-[1.05] tracking-[-0.02em] text-forest-900">
                See the evidence, understand it, decide for yourself.
              </h1>
              <p className="max-w-[52ch] text-base leading-relaxed text-forest-900 lg:text-lg">
                AlphaSwarm gathers the evidence on US stocks{FLAGS.funds && ' and South African funds'}, explains it in plain language at your level, and shows how it got there. The decision stays yours.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to={SIGNUP} className="as-btn as-btn-primary h-12 px-6 text-base">Open account <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                <a href="#tour" className="as-btn as-btn-secondary h-12 px-6 text-base">See what’s inside</a>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-forest-800">
                {['US stocks priced in rand', FLAGS.funds && 'SA unit trusts and ETFs', 'Research and education, not advice'].filter(Boolean).map((t) => (
                  <li key={t as string} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-forest-700" strokeWidth={2.4} aria-hidden="true" />{t}</li>
                ))}
              </ul>
            </div>

            {/* The dashboard's own shortlist card, in miniature, with example figures */}
            <div className="relative z-[2] grid gap-3.5" aria-hidden="true">
              <div className={`${CARD} animate-fade-up shadow-float`}>
                <div className="flex items-center justify-between gap-3"><b className="text-base text-forest-900">Your shortlist</b><span className="text-xs text-brand-muted-fg">Example figures</span></div>
                <div className="as-inset flex flex-col gap-3 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3"><TickerTile ticker="NVDA" /><div className="min-w-0"><p className="text-sm font-bold">NVDA</p><p className="truncate text-xs text-brand-muted-fg">NVIDIA Corporation</p></div></div>
                    <p className="whitespace-nowrap text-xl font-bold tabular-nums">R3 392.96</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5"><span className="chip chip-dark">1st for your profile</span><span className="chip chip-up">Signals agree strongly</span></div>
                  <div className="grid gap-3 sm:grid-cols-2"><Meter label="Sentiment" value="64 · Positive" percent={64} /><Meter label="Quant vs peers" value="84th percentile" percent={84} /></div>
                </div>
                <ul>
                  {[['2', 'MSFT', 'Microsoft', 'Technology · R9 436.57'], ['3', 'ENPH', 'Enphase Energy', 'Green Energy · R716.54']].map(([r, t, n, s]) => (
                    <li key={t} className={ROW}>
                      <span className="w-4 shrink-0 text-center text-xs font-bold text-brand-muted-fg">{r}</span>
                      <TickerTile ticker={t} small />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{t} <span className="text-xs font-normal text-brand-muted-fg">{n}</span></p><p className="truncate text-xs tabular-nums text-brand-muted-fg">{s}</p></div>
                      <span className="chip hidden sm:inline-flex">Lean the same way</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`${CARD} animate-fade-up-delayed gap-2 shadow-float`}>
                <p className="flex items-center gap-2 text-sm font-bold"><SparkTile />Why it ranks here</p>
                <p className="text-sm leading-relaxed">News this week has been positive (64 out of 100) and the price trend is stronger than 84% of the stocks in your run. Both signals point the same way.</p>
                <p className="text-xs text-brand-muted-fg">Written by AI from the evidence. It can be wrong, so check the sources.</p>
              </div>
              <div className={`${CARD} animate-fade-up-delayed flex-row items-center px-4 py-3.5 shadow-float`}>
                <span className="chip chip-caution shrink-0"><Flame className="h-3 w-3" />Hype flagged</span>
                <span className="text-sm text-brand-muted-fg">When social buzz runs ahead of the price evidence, the card says so.</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ The problem ═══ */}
        <section aria-labelledby="problem-title" className="mx-auto max-w-[1200px] px-4 py-[clamp(72px,9vw,112px)] sm:px-8">
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
            <div className={SECTION_HEAD}>
              <span className={EYEBROW}>Why AlphaSwarm</span>
              <h2 id="problem-title" className={`${H2} max-w-[18ch]`}>Institutions have analysts to explain the evidence. Most first-time investors have neither.</h2>
              <p className={SUB}>The gap isn’t access to information. It’s knowing what the information means for you.</p>
            </div>
            <div className="grid gap-3">
              {[
                { icon: Layers, t: 'The evidence is scattered', b: `News, price history, company filings${FLAGS.funds ? ' and fund fact sheets' : ''} all live in different places.` },
                { icon: CircleHelp, t: 'The numbers don’t explain themselves', b: 'A percentile, a risk label or a filing means little without someone to say what it shows.' },
                { icon: MessageCircle, t: 'Tips tell you what, never why', b: 'So you never get better at reading the evidence yourself.' },
              ].map(({ icon: Icon, t, b }) => (
                <div key={t} className="grid grid-cols-[40px_minmax(0,1fr)] gap-4 rounded-[20px] border border-forest-900/8 bg-white p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-forest-50 text-forest-700"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                  <div><p className="text-base font-bold">{t}</p><p className="text-sm text-brand-muted-fg">{b}</p></div>
                </div>
              ))}
              <div className="mt-1 grid grid-cols-[40px_minmax(0,1fr)] gap-4 rounded-[20px] bg-forest-700 p-5 text-white">
                <SparkTile size="lg" />
                <div><p className="text-base font-bold">AlphaSwarm does the explaining</p><p className="text-sm text-white/80">It gathers the evidence, explains it at your level, shows how it got there and teaches you to read it. The decision, and the platform you invest on, stay yours.</p></div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Everything on the platform ═══ */}
        <section id="features" aria-labelledby="features-title" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pb-[clamp(72px,9vw,112px)] sm:px-8">
          <div className={`${SECTION_HEAD} mb-10`}>
            <span className={EYEBROW}>Everything in one place</span>
            <h2 id="features-title" className={H2}>One way of explaining things, on every page</h2>
            <p className={SUB}>Every part of AlphaSwarm follows the same pattern: the plain answer first, then the evidence behind it, then how it was worked out.</p>
          </div>
          {FEATURE_GROUPS.map((group) => (
            <div key={group.label} className="mt-8 first-of-type:mt-0">
              <p className="mb-3 text-sm font-bold text-brand-muted-fg">{group.label}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                {group.items.filter((f) => on(f.flag)).map(({ icon: Icon, title, body, tab: t }) => (
                  <a
                    key={title}
                    href="#tour"
                    onClick={() => openTab(t)}
                    // A compact row on phones (icon beside the text), a card from sm up.
                    className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-[20px] border border-forest-900/8 bg-white p-4 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-forest-900/28 hover:shadow-[0_10px_28px_rgba(17,35,32,0.08)] sm:flex sm:flex-col sm:gap-2.5 sm:p-5"
                  >
                    <span className="row-span-2 grid h-10 w-10 place-items-center rounded-[12px] bg-forest-700 text-lime-500"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <b className="text-base tracking-[-0.01em]">{title}</b>
                    <p className="text-sm leading-relaxed text-brand-muted-fg">{body}</p>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ═══ Tour ═══ */}
        <section id="tour" aria-labelledby="tour-title" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pb-[clamp(72px,9vw,112px)] sm:px-8">
          <div className={`${SECTION_HEAD} mb-10`}>
            <span className={EYEBROW}>Explore the platform</span>
            <h2 id="tour-title" className={H2}>See each part before you sign up</h2>
            <p className={SUB}>Pick an area. These are the same screens you’ll use, filled with example figures.</p>
          </div>
          <div className="rounded-[32px] border border-forest-900/8 bg-white p-4 shadow-[0_1px_2px_rgba(17,35,32,.04),0_6px_18px_rgba(17,35,32,.04)] sm:p-8">
            <div role="tablist" aria-label="Areas of the platform" onKeyDown={onTabKey} className="as-tabs">
              {tourItems.map((t) => (
                <button
                  key={t.key}
                  ref={(el) => { tabRefs.current[t.key] = el }}
                  type="button"
                  role="tab"
                  id={`tour-tab-${t.key}`}
                  aria-controls={`tour-pane-${t.key}`}
                  aria-selected={tab === t.key}
                  tabIndex={tab === t.key ? 0 : -1}
                  onClick={() => setTab(t.key)}
                  className="as-tab"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`tour-pane-${active.key}`}
              aria-labelledby={`tour-tab-${active.key}`}
              className="mt-7 grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14"
            >
              <div className="flex min-w-0 flex-col gap-4">
                <h3 className="text-balance text-2xl font-bold leading-tight tracking-[-0.02em]">{active.title}</h3>
                <p className={SUB}>{active.body}</p>
                <ul className="flex flex-col gap-2.5">
                  {active.ticks.map((t) => (
                    <li key={t} className="flex gap-2.5 text-sm leading-relaxed"><Check className="mt-0.5 h-4 w-4 shrink-0 text-up" strokeWidth={2.4} aria-hidden="true" />{t}</li>
                  ))}
                </ul>
                <Link to={SIGNUP} className="as-btn as-btn-primary w-fit">Open account <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
              <div className="grid min-w-0 gap-3.5 rounded-[24px] bg-brand-bg p-3.5 sm:p-7" aria-hidden="true">{active.stage}</div>
            </div>
          </div>
        </section>

        {/* ═══ How it works ═══ */}
        <section id="how" aria-labelledby="how-title" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pb-[clamp(72px,9vw,112px)] sm:px-8">
          <div className={`${SECTION_HEAD} mb-10`}>
            <span className={EYEBROW}>How it works</span>
            <h2 id="how-title" className={H2}>Three steps from sign-up to your first explained list</h2>
          </div>
          <ol className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Step n={1} title="Tell us who you are" body="Pick an investing style, tap the companies you already know, and answer a short risk questionnaire. Your profile shapes what you see, and Settings explains in plain words why you got your rating.">
              <div className="flex flex-wrap gap-1.5"><span className="chip">Steady Builder</span><span className="chip">Moderate</span><span className="chip chip-line"><SectorDot sector="Technology" />Technology</span></div>
            </Step>
            <Step n={2} title="Specialist agents do the homework" body="Four agents measure every stock in your sectors separately. Their findings are combined, checked for hype and written up in plain language.">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[['Sentiment Scout', 'Reads tiered news and social posts'], ['Quant Analyst', 'Measures a year of price behaviour'], ['Discovery Agent', 'Finds trending stocks to check'], ['Orchestrator', 'Combines, checks hype, explains']].map(([n, d]) => (
                  <div key={n} className="as-inset min-w-0 px-3 py-2.5"><p className="text-sm font-bold">{n}</p><p className="text-xs leading-snug text-brand-muted-fg">{d}</p></div>
                ))}
              </div>
            </Step>
            <Step n={3} title="Read, compare and decide" body={`Open your ranked list${FLAGS.funds ? ' and fund matches' : ''} with the reasons written down. Dig into any stock, ask a question in plain English, or learn a concept in a short lesson. You make the call.`}>
              <div className="flex flex-wrap gap-1.5"><span className="chip">Stock pages</span>{FLAGS.compare && <span className="chip">Compare</span>}<span className="chip">Ask AlphaSwarm</span></div>
            </Step>
          </ol>
        </section>

        {/* ═══ What it will never do ═══ */}
        <section aria-labelledby="never-title" className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="rounded-[32px] bg-forest-700 p-[clamp(28px,5vw,64px)] text-white">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-lime-500">Transparent about its reasoning</span>
            <h2 id="never-title" className={`${H2} mt-3 max-w-[18ch] text-white`}>What AlphaSwarm will never do</h2>
            <p className="mt-3 max-w-[62ch] text-base text-white/80">It’s designed to explain, not to decide. These hold on every page.</p>
            <div className="mt-9 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Tell you to buy or sell', 'No buy, hold or sell calls, and no price predictions. You get the evidence and what it means.'],
                ['Hide a secret score', 'Four disclosed factors decide the order, each shown as a position, and every figure links to how it was worked out.'],
                ['Chase the hype', 'It never ranks by how often a stock is mentioned. Buzz that outruns the evidence is flagged.'],
                FLAGS.funds
                  ? ['Let AI pick your funds', 'Fund matches follow fixed rules on the risk labels managers publish themselves. No AI chooses them.']
                  : ['Learn from your data', 'Your answers shape what you see and are never used to rank anyone else’s stocks.'],
              ].map(([t, b]) => (
                <div key={t} className="flex min-w-0 flex-col gap-2 rounded-[20px] border border-white/12 bg-white/6 p-5">
                  <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-lime-500/16 text-lime-500"><X className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" /></span>
                  <p className="text-base font-bold">{t}</p>
                  <p className="text-sm leading-relaxed text-white/75">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ Built for South Africa ═══ */}
        <section aria-labelledby="sa-title" className="mx-auto max-w-[1200px] px-4 py-[clamp(72px,9vw,112px)] sm:px-8">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className={SECTION_HEAD}>
              <span className={EYEBROW}>Built for South African investors</span>
              <h2 id="sa-title" className={H2}>Local where it matters</h2>
              <p className={SUB}>
                US stocks are shown in rand with the exchange rate stated
                {FLAGS.funds && ', and the funds section covers South African unit trusts and ETFs you can buy on the platform you already use, such as EasyEquities'}.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ['R18.42', 'per US$, stated next to every price, so you always know what you’re looking at'],
                FLAGS.funds ? ['SA funds', 'Unit trusts and ETFs described from their managers’ own fact sheets'] : null,
                ['R46 000', 'Yearly tax-free allowance, tracked in the TFSA planner with the R500 000 lifetime limit'],
                ['Your level', 'Novice, intermediate or advanced: explanations and lessons match how much you know'],
              ].filter((x): x is string[] => x !== null).map(([big, text]) => (
                <div key={big} className="flex min-w-0 flex-col gap-1.5 rounded-[20px] border border-forest-900/8 bg-white p-5">
                  <span className="text-2xl font-extrabold tabular-nums tracking-[-0.02em]">{big}</span>
                  <span className="text-sm text-brand-muted-fg">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ FAQ ═══ */}
        <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pb-[clamp(72px,9vw,112px)] sm:px-8">
          <div className={`${SECTION_HEAD} mx-auto mb-10 items-center text-center`}>
            <span className={EYEBROW}>Questions and answers</span>
            <h2 id="faq-title" className={H2}>Frequently asked questions</h2>
          </div>
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            {FAQS.filter((f) => on(f.flag)).map(({ q, a }) => (
              <details key={q} className="group rounded-[20px] border border-forest-900/8 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-base font-bold [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown className="h-[18px] w-[18px] shrink-0 text-forest-700 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-brand-muted-fg">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ═══ Closing call to action ═══ */}
        <section aria-labelledby="cta-title" className="mx-auto max-w-[1200px] px-4 sm:px-8">
          <div className="flex flex-col items-start gap-3.5 rounded-[32px] bg-forest-900 p-[clamp(36px,6vw,80px)] text-white">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-lime-500">Ready when you are</span>
            <h2 id="cta-title" className={`${H2} text-white`}>Let the Swarm do the homework</h2>
            <p className="max-w-[52ch] text-base text-white/75">Open your account, set your profile, and get your first explained list today.</p>
            <Link to={SIGNUP} className="as-btn as-btn-lime mt-2 h-12 px-6 text-base">Open account <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            <span className="text-xs text-white/65">Research and education only, not financial advice</span>
          </div>
        </section>
      </main>

      {/* ═══ Footer, grouped like the sidebar ═══ */}
      <footer className="mx-auto max-w-[1200px] px-4 pb-10 pt-14 sm:px-8">
        <div className="grid grid-cols-3 gap-x-4 gap-y-8 border-b border-forest-900/8 pb-8 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:gap-8">
          <div className="col-span-3 lg:col-span-1">
            <Wordmark />
            <p className="mt-3 max-w-[34ch] text-sm text-brand-muted-fg">The evidence on US stocks{FLAGS.funds && ' and South African funds'}, explained in plain language.</p>
          </div>
          <FooterLinks title="Explore" links={[['Stocks', 'stocks'], FLAGS.funds && ['Funds', 'funds'], FLAGS.news && ['Market News', 'news'], ['Whale Watching', 'whale']]} onPick={openTab} />
          <FooterLinks title="Your tools" links={[['Dashboard', 'dash'], ['Watchlist', 'stocks'], FLAGS.compare && ['Compare', 'compare'], ['Financial Tools', 'learn']]} onPick={openTab} />
          <FooterLinks title="Learn" links={[['Learning Centre', 'learn'], ['Ask AlphaSwarm', 'ask'], ['How it works', '#how'], ['FAQ', '#faq']]} onPick={openTab} />
        </div>
        <p className="mt-5 max-w-[90ch] text-xs text-brand-muted-fg">
          AlphaSwarm is not a licensed financial services provider and does not give financial advice. Everything shown is research and education. © 2026 AlphaSwarm · Information Systems Honours Project, University of Cape Town.
        </p>
      </footer>
    </div>
  )
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col gap-3.5 rounded-[24px] border border-forest-900/8 bg-white p-6">
      <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-forest-700 text-base font-extrabold text-lime-500" aria-hidden="true">{n}</span>
      <h3 className="text-lg font-bold leading-snug tracking-[-0.01em]">{title}</h3>
      <p className="text-sm text-brand-muted-fg">{body}</p>
      {children}
    </li>
  )
}

/** A footer column. A link is [label, tour tab] or [label, '#section']; false drops it. */
function FooterLinks({ title, links, onPick }: { title: string; links: (false | [string, string])[]; onPick: (tab?: string) => void }) {
  return (
    <div>
      <h4 className="mb-3 text-xs font-bold text-brand-muted-fg">{title}</h4>
      <ul className="flex flex-col gap-2">
        {links.filter((l): l is [string, string] => Boolean(l)).map(([label, target]) => (
          <li key={label}>
            <a
              href={target.startsWith('#') ? target : '#tour'}
              onClick={() => (target.startsWith('#') ? undefined : onPick(target))}
              className="text-sm font-medium hover:underline"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
