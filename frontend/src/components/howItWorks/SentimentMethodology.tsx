import {
  MessageSquare,
  Newspaper,
  Users,
  ScanText,
  Layers,
  Heart,
  Clock,
  Scale,
  Gauge,
  CalendarDays,
  BrainCircuit,
} from "lucide-react";
import MethodologyCardHeader from "./MethodologyCardHeader";
import MethodologyStep from "./MethodologyStep";
import TierShareRow from "./TierShareRow";
import { TONE_ON_FOREST } from "../research/sentimentDisplay";
import {
  NEWS_WEIGHT_PCT,
  SOCIAL_WEIGHT_PCT,
  RECENCY_HALFLIFE_DAYS,
  NEWS_LOOKBACK_DAYS,
  SOCIAL_LOOKBACK_DAYS,
  SOCIAL_HISTORY_DAYS,
  NEWS_TIERS,
  NEWS_MAX_ARTICLES,
  GCP_TOP_N,
  DECLARED_BULLISH_SCORE,
  DECLARED_BEARISH_SCORE,
  ITEM_POSITIVE_FROM,
  ITEM_NEGATIVE_FROM,
  ENGAGEMENT_CAP,
  DAY_TOP_POSTS,
  DAY_TOP_ARTICLES,
  VERDICT_BANDS,
} from "../../data/sentimentMethodology";

// Walkthrough of how the sentiment readings are built, mirroring the backend
// pipeline (backend/src/agents/sentiment_scout.py and the ss_* modules). Every number
// on it is imported from data/sentimentMethodology.ts, the same constants the asset
// page reads, so the explanation moves when the pipeline does.
//
// The figures sit on the forest panel the Sentiment tab itself uses, in the same
// lime and tone colours, so the page explains the card in the card's own look.

const MUTED_ON_FOREST = "rgba(255,255,255,0.6)";

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
      <span>{children}</span>
    </li>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-brand-fg">{children}</span>;
}

// The numbers a reader needs before the detail: how the blend splits, and how far
// back each half looks. The same forest panel and lime figures as the card's verdict.
function AtAGlance() {
  const figures = [
    { value: `${NEWS_WEIGHT_PCT}%`, label: "News share" },
    { value: `${SOCIAL_WEIGHT_PCT}%`, label: "Social share" },
    { value: `${NEWS_LOOKBACK_DAYS} days`, label: "News looks back" },
    { value: `${SOCIAL_LOOKBACK_DAYS} days`, label: "Posts look back" },
  ];
  return (
    <div className="hero-card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
      {figures.map((f) => (
        <div key={f.label}>
          <p className="text-2xl font-bold tabular-nums leading-none text-lime-500">
            {f.value}
          </p>
          <p
            className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: MUTED_ON_FOREST }}
          >
            {f.label}
          </p>
        </div>
      ))}
    </div>
  );
}

// What each verdict word on the card covers, coloured exactly as the card colours it.
function VerdictScale() {
  return (
    <div className="hero-card p-4">
      <ul className="space-y-1.5">
        {VERDICT_BANDS.map((band) => (
          <li key={band.label} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold" style={{ color: TONE_ON_FOREST[band.tone].text }}>
              {band.label}
            </span>
            <span className="font-mono tabular-nums text-white">
              {band.to === 100
                ? `${band.from} and above`
                : band.from === 0
                  ? `${band.to} and below`
                  : `${band.from} to ${band.to}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SentimentMethodology() {
  return (
    <div id="sentiment" className="soft-card w-full space-y-6 p-6" style={{ scrollMarginTop: "1.5rem" }}>
      <MethodologyCardHeader
        icon={MessageSquare}
        title="The Sentiment Score"
        subtitle="A reading from 0 to 100 of how positive the news and the chatter about a stock are. 50 is neutral. It describes what is being said, not what the price will do."
      />

      <AtAGlance />

      <div className="pt-1">
        <MethodologyStep n={1} icon={Newspaper} title="Collect from trusted sources">
          <p>We read two kinds of coverage for each stock:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
                <Newspaper className="h-3 w-3 text-brand-primary" />
                Financial news
              </p>
              <p className="text-sm text-brand-fg">
                Articles from the last {NEWS_LOOKBACK_DAYS} days, from Finnhub's
                company news and, in the nightly run, top tier wires from
                Marketaux. Only publishers on our list are kept (see step 3), and
                up to {NEWS_MAX_ARTICLES} per stock from Finnhub, most reliable
                first. A wire story
                republished by an aggregator is credited to the original wire, so a
                Reuters story carried by Yahoo counts as Reuters.
              </p>
            </div>
            <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
                <Users className="h-3 w-3 text-brand-primary" />
                Social posts
              </p>
              <p className="text-sm text-brand-fg">
                StockTwits posts about the stock from the last{" "}
                {SOCIAL_LOOKBACK_DAYS} days. Promotions, lists of tickers and posts
                with too little to say are dropped, a post must actually be about
                this stock, and the same author repeating the same post counts
                once.
              </p>
            </div>
          </div>
        </MethodologyStep>

        <MethodologyStep n={2} icon={ScanText} title="Score each item's language">
          <p>
            Every headline and post is read by two independent tools that rate
            how positive or negative the wording is:
          </p>
          <ul className="ml-1 space-y-1.5">
            <Bullet>
              <Strong>VADER</Strong>, a rule based analyser built for short,
              informal text, reads every item.
            </Bullet>
            <Bullet>
              <Strong>Google Cloud Natural Language</Strong>, a machine learning
              model, also reads up to {GCP_TOP_N} of the most important items from
              each source on every run: the most reliable and recent articles, and the
              posts with the most engagement. Where both have read an item, their
              scores are averaged.
            </Bullet>
            <Bullet>
              When a StockTwits author tags their own post{" "}
              <Strong>Bullish</Strong> or <Strong>Bearish</Strong>, we take them at
              their word: the post scores {DECLARED_BULLISH_SCORE} or{" "}
              {DECLARED_BEARISH_SCORE} and its wording is not analysed.
            </Bullet>
          </ul>
          <p>
            Each item ends up with its own score from 0 to 100. From{" "}
            {ITEM_POSITIVE_FROM} up it is labelled <Strong>positive</Strong>, from{" "}
            {ITEM_NEGATIVE_FROM} down <Strong>negative</Strong>, and{" "}
            <Strong>neutral</Strong> in between. That label drives the
            Positive, Neutral and Negative filters, the colour of each item's
            score, the Bullish and Bearish tags on posts, and the day's bullish and
            bearish counts, so they always agree.
          </p>
        </MethodologyStep>

        <MethodologyStep n={3} icon={Layers} title="Group news by reliability, not by volume">
          <p>
            A simple average would let a flood of lesser articles drown out a few
            authoritative ones. Instead each tier contributes its{" "}
            <Strong>own average</Strong> at a fixed share, so a handful of Tier 1
            wires keep their weight however many Tier 3 pieces appear.
          </p>
          <div className="space-y-2">
            {NEWS_TIERS.map((tier) => (
              <TierShareRow key={tier.tier} tier={tier} />
            ))}
          </div>
          <p className="text-[12px]">
            When a tier has no articles its share is spread across the tiers that
            do, so the shares always add up to the whole. Articles from any other
            publisher are not counted at all.
          </p>
        </MethodologyStep>

        <MethodologyStep n={4} icon={Heart} title="Weight posts by engagement">
          <p>
            Posts have no tiers. Instead a post that people reacted to counts for
            more: likes, replies and reshares (which count double) raise its
            weight, on a scale that flattens quickly, up to {ENGAGEMENT_CAP} times
            a post nobody reacted to. A widely shared post matters more, but one
            viral post cannot outvote everyone else.
          </p>
        </MethodologyStep>

        <MethodologyStep n={5} icon={Clock} title="Count newer items for more">
          <p>
            Fresher items count for more, on a {RECENCY_HALFLIFE_DAYS} day half
            life: something from today counts about twice as much as something
            from {RECENCY_HALFLIFE_DAYS} days ago, and four times as much as
            something from {RECENCY_HALFLIFE_DAYS * 2} days ago. For news this only
            reorders articles <Strong>within</Strong> a tier, so a fresh Tier 3
            piece never outranks the Tier 1 wires.
          </p>
        </MethodologyStep>

        <MethodologyStep n={6} icon={Scale} title="Blend news and social">
          <p>
            The news and social readings are combined with news carrying more
            weight, because professional reporting is a steadier signal than
            retail chatter:
          </p>
          <div className="hero-card flex items-center justify-center gap-4 px-5 py-4">
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums leading-none text-lime-500">
                {NEWS_WEIGHT_PCT}%
              </p>
              <p
                className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: MUTED_ON_FOREST }}
              >
                News
              </p>
            </div>
            <span className="text-xl" style={{ color: MUTED_ON_FOREST }}>
              +
            </span>
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums leading-none text-lime-500">
                {SOCIAL_WEIGHT_PCT}%
              </p>
              <p
                className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: MUTED_ON_FOREST }}
              >
                Social
              </p>
            </div>
          </div>
          <ul className="ml-1 space-y-1.5 text-[13px]">
            <Bullet>
              If one side has nothing (no recent articles, or no posts), the score
              is the other side alone. If neither has anything, it stays at a
              neutral 50. The badge beside News and Social on the card shows the
              share each actually had, and says <Strong>Not in score</Strong> for a
              side that had none.
            </Bullet>
            <Bullet>
              If a run finds no new articles, the card may still show the last
              week's news from an earlier run, so a passing outage does not blank
              it. That news is labelled as carried over and is{" "}
              <Strong>not</Strong> part of the score.
            </Bullet>
          </ul>
        </MethodologyStep>

        <MethodologyStep n={7} icon={Gauge} title="The score, and what its words mean">
          <p>
            The result is the <Strong>Blended sentiment</Strong> at the top of the
            Sentiment tab. The word under it, and under each of News and Social,
            reads the number like this:
          </p>
          <VerdictScale />
          <p>
            To check the number yourself, open{" "}
            <Strong>Show how this score was calculated</Strong> under it for the
            working, tier by tier. The news page lists each day's{" "}
            {DAY_TOP_ARTICLES} most influential articles and the social page each
            day's {DAY_TOP_POSTS} most influential posts, with the day's full
            counts beside them. The score itself uses every article and post in
            its window, not only those listed.
          </p>
        </MethodologyStep>

        <MethodologyStep n={8} icon={CalendarDays} title={`The ${SOCIAL_HISTORY_DAYS} day trend chart`}>
          <p>
            The chart shows one column per day for the last {SOCIAL_HISTORY_DAYS}{" "}
            days. A day runs from midnight to midnight UTC, which is 2am to 2am in
            South Africa.
          </p>
          <ul className="ml-1 space-y-1.5">
            <Bullet>
              <Strong>The solid line</Strong> is that day's posts only, weighted by
              engagement. <Strong>The dashed line</Strong> is that day's articles
              only, by tier. Within a single day nothing is weighted by age. So
              neither line is the card's score, which looks across the whole window
              and favours newer items.
            </Bullet>
            <Bullet>
              <Strong>The bars</Strong> are how many posts were scored that day.
              Weekends and US market holidays are shaded and named, because
              chatter is naturally quieter when the market is shut. A faint dotted
              line bridges open days that have no reading at all.
            </Bullet>
            <Bullet>
              Readings are collected every night at 22:00 UTC (midnight in South
              Africa), and on weekdays again at 09:35 and 13:35 New York time,
              shortly after the US market opens and at midday. The first time
              anyone opens a stock, its earlier days are filled in from as far
              back as StockTwits allows.
            </Bullet>
          </ul>
        </MethodologyStep>

        <MethodologyStep
          n={9}
          icon={BrainCircuit}
          title="What's driving the sentiment"
          isLast
        >
          <p>
            Clicking a day opens a short paragraph written by an AI model. It
            works only from that day's stored articles (up to the{" "}
            {DAY_TOP_ARTICLES} most influential, with the publisher's own summary)
            and from the day's post figures. It never sees the share price, never
            quotes a post, and does not say whether the news caused the chatter.
          </p>
          <p>
            Today's paragraph is marked <Strong>So far today</Strong> and is
            rewritten as new articles arrive. Once a day is over its paragraph is
            settled. A day with no articles shows the paragraph of the latest
            earlier day that had some, and says which day that is.
          </p>
        </MethodologyStep>
      </div>
    </div>
  );
}
