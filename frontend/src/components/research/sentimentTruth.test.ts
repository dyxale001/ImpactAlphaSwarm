import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bullBearTag } from './SocialPosts'
import { itemLean, scoreMeta, sentimentVerdict } from './sentimentDisplay'
import {
  DECLARED_BEARISH_SCORE,
  DECLARED_BULLISH_SCORE,
  ITEM_NEGATIVE_FROM,
  ITEM_POSITIVE_FROM,
  VERDICT_BANDS,
} from '../../data/sentimentMethodology'
import { shownProduct } from './SentimentCalculation'
import { newsDayIndex, newsDaysFromHistory } from './newsDaily'
import { dayPhrase } from './sentimentDays'
import type { NewsArticle } from './NewsArticles'
import type { SentimentHistoryPoint } from '../../services/api/analysis'

// Four figures on the sentiment pages that a reader could check and find wrong.

describe('a post tag never disagrees with the filter it sits under', () => {
  it('follows the label the filters sort by, not a wider cut of the score', () => {
    // 53 is labelled Positive by the backend (its cut is 52.5), so it sits under the
    // Positive filter. It used to wear a "Neutral" tag there, from a 55 cut.
    expect(bullBearTag('Positive', 53)?.label).toBe('Bullish')
    expect(bullBearTag('Negative', 47)?.label).toBe('Bearish')
    expect(bullBearTag('Neutral', 52)?.label).toBe('Neutral')
  })

  it('falls back to the backend cut when a post carries no label', () => {
    expect(bullBearTag(undefined, 52.5)?.label).toBe('Bullish')
    expect(bullBearTag(undefined, 52.4)?.label).toBe('Neutral')
    expect(bullBearTag(undefined, 47.5)?.label).toBe('Bearish')
  })

  it('shows no tag at all with neither a label nor a score', () => {
    expect(bullBearTag(undefined, undefined)).toBeNull()
  })

  it('colours the score badge by the same lean as the tag', () => {
    // A Positive post scoring 53 used to wear a grey badge from a 55 cut.
    expect(scoreMeta(53, 'Positive').cls).toContain('emerald')
    expect(scoreMeta(47, 'Negative').cls).toContain('rose')
    expect(scoreMeta(56, 'Neutral').cls).toContain('slate')
    expect(scoreMeta(52.5).cls).toContain('emerald')
    expect(scoreMeta(null).cls).toContain('slate')
  })

  it('never lets the badge and the tag disagree across the whole scale', () => {
    for (let score = 0; score <= 100; score += 0.5) {
      const tag = bullBearTag(undefined, score)?.label
      const badge = scoreMeta(score).cls
      const badgeLean = badge.includes('emerald')
        ? 'Bullish'
        : badge.includes('rose')
          ? 'Bearish'
          : 'Neutral'
      expect(badgeLean).toBe(tag)
    }
  })
})

describe('the working multiplies the figures it shows', () => {
  it('rounds the value before multiplying, so the line can be checked by hand', () => {
    // Shown as "62 x 70%". The unrounded 61.6 gave 43.1 beside it.
    expect(shownProduct(61.6, 70)).toBeCloseTo(43.4)
    expect(shownProduct(57.8, 66.7)).toBeCloseTo(58 * 67 / 100)
  })

  it('makes the blend rows add up to the blended score the backend stored', () => {
    // The backend blends whole-number sub-scores: round(0.7 x 57 + 0.3 x 61) = 58.
    const total = shownProduct(57, 70) + shownProduct(61, 30)
    expect(Math.round(total)).toBe(58)
  })
})

describe("a news day's positive and negative counts cover the whole day", () => {
  const article = (sentiment: string): NewsArticle => ({
    date: '2026-10-09',
    sentiment,
    sentiment_score: 60,
    influence: 10,
  })

  it('reads the stored day totals, not the labels of the few articles kept', () => {
    const point = {
      date: '2026-10-09',
      score: 55,
      post_count: 10,
      bullish: 4,
      bearish: 1,
      top_posts: [],
      summary: null,
      news_score: 62,
      news_count: 20,
      news_bullish: 12,
      news_bearish: 3,
      top_articles: [article('Positive'), article('Negative')],
    } as SentimentHistoryPoint
    const day = newsDaysFromHistory([point]).get('2026-10-09')
    expect(day?.bullish).toBe(12)
    expect(day?.bearish).toBe(3)
  })

  it('counts every article when it derives the day from the full run list', () => {
    const day = newsDayIndex([
      article('Positive'),
      article('Positive'),
      article('Negative'),
      article('Neutral'),
    ]).get('2026-10-09')
    expect(day?.bullish).toBe(2)
    expect(day?.bearish).toBe(1)
  })
})

describe('dayPhrase', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads naturally inside an empty state', () => {
    expect(dayPhrase('2026-10-10')).toBe('today')
    expect(dayPhrase('2026-10-09')).toBe('yesterday')
    expect(dayPhrase('2026-10-05')).toBe('on 5 Oct')
  })
})

// The How it works page quotes these numbers. They are checked against the rules the
// pages actually run, so the explanation cannot drift from what a reader sees.
describe('the How it works figures match the rules the pages run', () => {
  it('names the same verdict word for every whole score from 0 to 100', () => {
    for (let score = 0; score <= 100; score += 1) {
      const band = VERDICT_BANDS.find((b) => score >= b.from && score <= b.to)
      expect(band, `no band covers ${score}`).toBeDefined()
      expect(band?.label).toBe(sentimentVerdict(score).label)
      expect(band?.tone).toBe(sentimentVerdict(score).tone)
    }
  })

  it('quotes the cut where an item turns positive or negative', () => {
    expect(itemLean(undefined, ITEM_POSITIVE_FROM)).toBe('Positive')
    expect(itemLean(undefined, ITEM_POSITIVE_FROM - 0.1)).toBe('Neutral')
    expect(itemLean(undefined, ITEM_NEGATIVE_FROM)).toBe('Negative')
    expect(itemLean(undefined, ITEM_NEGATIVE_FROM + 0.1)).toBe('Neutral')
  })

  it("quotes the score an author's own Bullish or Bearish tag gives", () => {
    // MentionScorer.DECLARED_SENTIMENT_SIGNED is 0.6 either side of neutral.
    expect(DECLARED_BULLISH_SCORE).toBe((0.6 + 1) * 50)
    expect(DECLARED_BEARISH_SCORE).toBe((-0.6 + 1) * 50)
  })
})
