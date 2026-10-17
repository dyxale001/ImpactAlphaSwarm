import { Blend, Newspaper, ScanText, Scale } from 'lucide-react';
import { tierMeta } from '../research/sentimentDisplay';
import {
  DAY_TOP_ARTICLES,
  DAY_TOP_POSTS,
  DECLARED_BEARISH_SCORE,
  DECLARED_BULLISH_SCORE,
  ENGAGEMENT_CAP,
  GCP_TOP_N,
  ITEM_NEGATIVE_FROM,
  ITEM_POSITIVE_FROM,
  NEWS_LOOKBACK_DAYS,
  NEWS_MAX_ARTICLES,
  NEWS_TIERS,
  NEWS_WEIGHT_PCT,
  RECENCY_HALFLIFE_DAYS,
  SOCIAL_HISTORY_DAYS,
  SOCIAL_LOOKBACK_DAYS,
  SOCIAL_WEIGHT_PCT,
  VERDICT_BANDS,
} from '../../data/sentimentMethodology';
import { BandStrip, Body, Bullets, Figures, Lead, MoreDetail, Section, ShareBar, Steps, Strong } from './MethodologyParts';

// The Sentiment Score, end to end. Every figure comes from
// data/sentimentMethodology.ts, which mirrors the backend's constants.

const TIER_FILL: Record<number, string> = { 1: 'bg-forest-700', 2: 'bg-forest-500', 3: 'bg-lime-400' };

const VERDICT_FILL: Record<string, string> = {
  'Strongly negative': 'bg-down text-white',
  Negative: 'bg-down-bg text-down',
  Neutral: 'bg-forest-100 text-forest-700',
  Positive: 'bg-up-bg text-up',
  'Strongly positive': 'bg-up text-white',
};

/** How much an item counts by age, on the half-life. */
function Decay() {
  const days = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="as-inset p-4" role="img"
      aria-label={`Weight by age: today 100%, ${RECENCY_HALFLIFE_DAYS} days ago 50%, ${RECENCY_HALFLIFE_DAYS * 2} days ago 25%`}>
      <div className="flex h-28 items-end gap-2" aria-hidden="true">
        {days.map(d => {
          const weight = Math.pow(0.5, d / RECENCY_HALFLIFE_DAYS);
          return (
            <div key={d} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[11px] font-semibold tabular-nums text-forest-900">{Math.round(weight * 100)}%</span>
              <div className="w-full rounded-t-md bg-forest-700" style={{ height: `${weight * 80}px` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2 text-center text-[11px] text-brand-muted-fg" aria-hidden="true">
        {days.map(d => <span key={d} className="min-w-0 flex-1">{d === 0 ? 'Today' : `${d}d ago`}</span>)}
      </div>
    </div>
  );
}

export default function SentimentMethodology() {
  return (
    <>
      <Lead>
        A reading from 0 to 100 of how positive the news and the chatter about a stock
        are. 50 is neutral. It describes what is being said, not what the price will do.
      </Lead>

      <Figures figures={[
        { value: `${NEWS_WEIGHT_PCT}%`, label: 'News share of the score' },
        { value: `${SOCIAL_WEIGHT_PCT}%`, label: 'Social share of the score' },
        { value: `${NEWS_LOOKBACK_DAYS} days`, label: 'News looks back' },
        { value: `${SOCIAL_LOOKBACK_DAYS} days`, label: 'Posts look back' },
      ]} />

      <Section title="How the score is built">
        <Steps steps={[
          {
            icon: Newspaper, title: 'Collect',
            body: <>News from the last {NEWS_LOOKBACK_DAYS} days, from trusted publishers only (up to {NEWS_MAX_ARTICLES} per stock), and StockTwits posts from the last {SOCIAL_LOOKBACK_DAYS} days with spam and ticker lists removed.</>,
          },
          {
            icon: ScanText, title: 'Score each item',
            body: <>Every headline and post gets its own 0 to 100 score from the tone of its wording. A post its author tagged Bullish or Bearish is taken at their word.</>,
          },
          {
            icon: Scale, title: 'Weigh them',
            body: <>News counts by the publisher's reliability, posts by how many people reacted, and newer items count for more.</>,
          },
          {
            icon: Blend, title: 'Blend',
            body: <>News and social are combined {NEWS_WEIGHT_PCT}/{SOCIAL_WEIGHT_PCT}, because professional reporting is a steadier signal than retail chatter.</>,
          },
        ]} />
      </Section>

      <Section title="News counts by reliability, not volume">
        <Body>
          Each reliability tier contributes its own average at a fixed share, so a
          handful of Tier 1 wires keep their weight however many Tier 3 pieces appear.
          Articles from any other publisher are not counted at all.
        </Body>
        <ShareBar label="News share by tier" parts={NEWS_TIERS.map(t => ({ label: `Tier ${t.tier}`, pct: t.sharePct, className: TIER_FILL[t.tier] }))} />
        <ul className="space-y-2">
          {NEWS_TIERS.map(t => {
            const meta = tierMeta(t.tier);
            return (
              <li key={t.tier} className="as-inset flex items-start gap-3 p-3">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-forest-900">{t.label}</span>
                  <span className="block text-xs leading-relaxed text-brand-muted-fg">{t.examples}</span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-forest-900">{t.sharePct}%</span>
              </li>
            );
          })}
        </ul>
        <Body>When a tier has no articles, its share is spread across the tiers that do.</Body>
      </Section>

      <Section title="Newer items count for more">
        <Body>
          Weight halves every {RECENCY_HALFLIFE_DAYS} days. For news this only reorders
          articles <Strong>within</Strong> a tier, so a fresh Tier 3 piece never outranks
          the Tier 1 wires.
        </Body>
        <Decay />
      </Section>

      <Section title="News and social, blended">
        <ShareBar label="Blend" parts={[
          { label: 'News', pct: NEWS_WEIGHT_PCT, className: 'bg-forest-700' },
          { label: 'Social', pct: SOCIAL_WEIGHT_PCT, className: 'bg-lime-400' },
        ]} />
        <Body>
          If one side has nothing (no recent articles, or no posts), the score is the
          other side alone, and the card says <Strong>Not in score</Strong> for the empty
          side. If neither has anything, the score stays at a neutral 50.
        </Body>
      </Section>

      <Section title="What the words mean">
        <BandStrip label="Sentiment verdicts" bands={[...VERDICT_BANDS].reverse().map(b => ({
          name: b.label,
          range: b.to === 100 ? `${b.from}+` : b.from === 0 ? `${b.to} and below` : `${b.from}–${b.to}`,
          className: VERDICT_FILL[b.label] ?? 'bg-forest-100 text-forest-700',
        }))} />
      </Section>

      <MoreDetail title="More detail">
        <Bullets items={[
          <>
            <Strong>The two tone readers.</Strong> VADER, a rule-based analyser built for
            short informal text, reads every item. Google Cloud Natural Language also reads
            the {GCP_TOP_N} most important items from each source per run, and where both
            have read an item their scores are averaged. Author-tagged posts score{' '}
            {DECLARED_BULLISH_SCORE} (Bullish) or {DECLARED_BEARISH_SCORE} (Bearish).
          </>,
          <>
            <Strong>Item labels.</Strong> An item scoring {ITEM_POSITIVE_FROM} or more is
            labelled positive, {ITEM_NEGATIVE_FROM} or less negative, and neutral in between.
            The filters, colours and the day's bullish and bearish counts all use this label.
          </>,
          <>
            <Strong>Engagement.</Strong> Likes, replies and reshares (which count double)
            raise a post's weight on a scale that flattens quickly, up to {ENGAGEMENT_CAP}{' '}
            times a post nobody reacted to, so one viral post cannot outvote everyone else.
          </>,
          <>
            <Strong>Sources.</Strong> News comes from Finnhub's company news, plus Tier 1
            wires from Marketaux in the nightly run. A wire story republished by an
            aggregator is credited to the original wire.
          </>,
          <>
            <Strong>Carried-over news.</Strong> If a run finds no new articles, the card may
            still show the last week's news from an earlier run, labelled as carried over.
            It is not part of the score.
          </>,
          <>
            <Strong>The {SOCIAL_HISTORY_DAYS}-day chart.</Strong> One column per day, midnight
            to midnight UTC (2am to 2am in South Africa). The solid line is that day's posts
            and the dashed line that day's articles, neither weighted by age, so neither line
            is the score itself. The first time anyone opens a stock, its last{' '}
            {SOCIAL_HISTORY_DAYS} days of posts are filled in where StockTwits still has them.
          </>,
          <>
            <Strong>Daily lists.</Strong> The news and social pages list each day's{' '}
            {DAY_TOP_ARTICLES} most influential articles and {DAY_TOP_POSTS} most influential
            posts. The score uses every item in its window, not only those listed.
          </>,
          <>
            <Strong>"What's driving the sentiment".</Strong> A short paragraph written by AI
            from that day's stored articles and post figures only. It never sees the share
            price, never quotes a post and does not claim the news caused the chatter.
            Today's paragraph is marked <Strong>So far today</Strong> and is rewritten as
            new articles arrive.
          </>,
          <>
            <Strong>When it updates.</Strong> Readings are collected every night at 22:00 UTC
            (midnight in South Africa).
          </>,
        ]} />
      </MoreDetail>
    </>
  );
}
