import {
  MessageSquare,
  Newspaper,
  Users,
  ScanText,
  Layers,
  Clock,
  Scale,
  Gauge,
} from "lucide-react";
import MethodologyCardHeader from "./MethodologyCardHeader";
import MethodologyStep from "./MethodologyStep";
import TierShareRow from "./TierShareRow";
import {
  NEWS_WEIGHT_PCT,
  SOCIAL_WEIGHT_PCT,
  RECENCY_HALFLIFE_DAYS,
  NEWS_LOOKBACK_DAYS,
  NEWS_TIERS,
} from "../../data/sentimentMethodology";

// Walkthrough of how the 0–100 sentiment score is derived, mirroring the backend
// sentiment scout pipeline (backend/src/agents/sentiment_scout.py).
export default function SentimentMethodology() {
  return (
    <div className="soft-card w-full space-y-6 p-6">
      <MethodologyCardHeader
        icon={MessageSquare}
        title="The Sentiment Score"
        subtitle="A 0–100 reading where 50 is neutral, above 50 is net positive, and below 50 is net negative."
      />

      <div className="pt-1">
        <MethodologyStep n={1} icon={Newspaper} title="Collect from trusted sources">
          <p>
            We gather recent coverage from two places and drop anything that
            isn't from a source we trust:
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
                <Newspaper className="h-3 w-3 text-brand-primary" />
                Financial news
              </p>
              <p className="text-sm text-brand-fg">
                Articles from established publishers (last {NEWS_LOOKBACK_DAYS}{" "}
                days), sorted into reliability tiers. Wire stories republished by
                an aggregator are credited back to the original wire (e.g. a
                Reuters story carried by Yahoo counts as Reuters).
              </p>
            </div>
            <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/55 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
                <Users className="h-3 w-3 text-brand-primary" />
                Social posts
              </p>
              <p className="text-sm text-brand-fg">
                Retail chatter from StockTwits for the same ticker. Useful as a
                pulse check, but weighted lower because it's noisier than
                professional reporting.
              </p>
            </div>
          </div>
        </MethodologyStep>

        <MethodologyStep n={2} icon={ScanText} title="Score each item's language">
          <p>
            Every headline and post is read by two independent text-analysis
            engines that rate how positive or negative the wording is:
          </p>
          <ul className="ml-1 space-y-1.5">
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
              <span>
                <span className="font-semibold text-brand-fg">VADER</span>, a
                finance-friendly rule-based analyser that runs on every item.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
              <span>
                <span className="font-semibold text-brand-fg">
                  Google Cloud NLP
                </span>
                , a machine-learning model that runs on the most important items.
                When both engines weigh in, their scores are averaged.
              </span>
            </li>
          </ul>
          <p>
            Each item ends up with its own score on the same 0–100 scale, and is
            tagged positive, neutral, or negative.
          </p>
        </MethodologyStep>

        <MethodologyStep
          n={3}
          icon={Layers}
          title="Group news by reliability, not by volume"
        >
          <p>
            Instead of a simple average (which would let a flood of low-quality
            articles drown out a few authoritative ones), each tier contributes
            its <span className="font-semibold text-brand-fg">own average</span>{" "}
            at a fixed share. A handful of Tier-1 wires keep their weight no
            matter how many Tier-3 posts appear.
          </p>
          <div className="space-y-2">
            {NEWS_TIERS.map((tier) => (
              <TierShareRow key={tier.tier} tier={tier} />
            ))}
          </div>
          <p className="text-[12px]">
            If a tier has no articles, its share is redistributed across the
            tiers that do, so the shares always add up to a complete picture.
          </p>
        </MethodologyStep>

        <MethodologyStep n={4} icon={Clock} title="Weight newer news more heavily">
          <p>
            Within each tier, fresher articles count for more using a{" "}
            {RECENCY_HALFLIFE_DAYS}-day half-life: an article from today counts
            roughly twice as much as one from {RECENCY_HALFLIFE_DAYS} days ago,
            and about four times a {RECENCY_HALFLIFE_DAYS * 2}-day-old one. This
            recency decay only reorders items{" "}
            <span className="font-semibold text-brand-fg">within</span> a tier. It
            never lets a fresh Tier-3 post outrank the Tier-1 wires.
          </p>
        </MethodologyStep>

        <MethodologyStep n={5} icon={Scale} title="Blend news and social">
          <p>
            The news and social sub-scores are combined with news carrying more
            weight, because trusted reporting is a more reliable signal than
            retail chatter:
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-brand-fg">
                {NEWS_WEIGHT_PCT}%
              </p>
              <p className="text-[11px] uppercase tracking-widest text-brand-muted-fg">
                News
              </p>
            </div>
            <span className="text-brand-muted-fg">+</span>
            <div className="flex-1 rounded-2xl border border-brand-border/60 bg-brand-bg/55 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-brand-fg">
                {SOCIAL_WEIGHT_PCT}%
              </p>
              <p className="text-[11px] uppercase tracking-widest text-brand-muted-fg">
                Social
              </p>
            </div>
          </div>
          <p className="text-[12px]">
            If one source has no data (e.g. no recent news), the score falls back
            entirely to the other. If neither has data, the score stays neutral
            at 50.
          </p>
        </MethodologyStep>

        <MethodologyStep n={6} icon={Gauge} title="The final Sentiment Score" isLast>
          <p>
            The blended result is the 0–100{" "}
            <span className="font-semibold text-brand-fg">Blended Score</span>{" "}
            you see at the top of the Sentiment Data card. Every article that fed
            into it is listed there with its own tier, date, and sentiment, so
            you can trace the number back to its sources.
          </p>
        </MethodologyStep>
      </div>
    </div>
  );
}
