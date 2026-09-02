-- News sentiment history: one row per ticker per calendar day.
--
-- The counterpart to social_sentiment_daily (migrations/019), and the reason the trend
-- chart can draw a real news line instead of one the browser reconstructs.
--
-- Until this exists the frontend derives a daily news figure from the article list on
-- ai_recommendation. That works, because news_articles is uncapped and every article
-- carries its own date, tier and score, but it is wrong in three ways this table fixes:
--
--   * It weights by each article's stored "influence", which already folds in recency
--     ACROSS the seven day window. Used as a weight WITHIN one day that is simply the
--     wrong number: an article on a recent day outweighs an equally reliable article on
--     an older one, for no reason a reader would accept.
--   * It is recomputed from whatever the newest run happened to fetch, so a past day
--     silently changes shape when a later run returns a different set of articles.
--     History that rewrites itself is not history.
--   * It cannot outlive the lookback. Thirty days of chart needs thirty days of rows.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/writes it,
-- and before setting NEWS_HISTORY_ENABLED=true. Until that flag is on the backend never
-- touches this table. Safe to re-run (idempotent).


-- ── the table ────────────────────────────────────────────────────────────────
-- The date discriminator is in the unique key, which is the lesson of migrations/013
-- and 019: without it a second run in the same day destroys the first.
create table if not exists public.news_sentiment_daily (
  ticker               text not null,
  as_of_day            date not null,
  news_sentiment_score integer,
  article_count        integer not null default 0,
  bullish_articles     integer not null default 0,
  bearish_articles     integer not null default 0,
  -- The day's tier mix. Cheap to store, and it is what lets the chart say WHY a day
  -- scored as it did: three wire stories and thirty blog posts are not the same day
  -- even when they average to the same number.
  tier1_count          integer not null default 0,
  tier2_count          integer not null default 0,
  tier3_count          integer not null default 0,
  top_articles         jsonb   not null default '[]'::jsonb,
  updated_at           timestamptz not null default now(),
  constraint news_sentiment_daily_ticker_day_key unique (ticker, as_of_day)
);

-- Deliberately NOT the running sums social_sentiment_daily keeps.
--
-- Social can store a numerator and a denominator because its day score is a flat
-- weighted mean, so two samples of the same day add. The news score is not: it is a
-- two level aggregation, a recency weighted average WITHIN each reliability tier and
-- then a fixed share ACROSS tiers (see ss_aggregation.aggregate_signed). That does not
-- reduce to one sum over one weight, so storing a pair of sums here would be storing
-- something the score cannot be rebuilt from. A day is therefore stated, not added to.
--
-- Stating it is also correct, which is the part that makes this simpler than social
-- rather than merely different. StockTwits is read through a sliding page window, so a
-- run sees only the posts still on the pages it fetched and has to accumulate. News is
-- read from a per ticker cache covering the whole lookback, so a run sees a day's
-- articles complete and can say what the day was. There is no monotonic article id to
-- dedupe on either, and ss_scoring already records that news mentions carry no
-- message_id, so accumulation has nothing to deduplicate WITH.

-- One ticker's trailing days for the endpoint; every ticker's for a run's write.
create index if not exists news_sentiment_daily_ticker_day_idx
  on public.news_sentiment_daily (ticker, as_of_day desc);

grant select, insert, update, delete on public.news_sentiment_daily to service_role;

-- Internal table, same as the caches: RLS on with no policies denies anon and
-- authenticated outright, while service_role bypasses RLS. The frontend reads this
-- only through the sentiment-history endpoint, never directly.
alter table public.news_sentiment_daily enable row level security;


-- ── the merge ────────────────────────────────────────────────────────────────
-- One call for a whole run's rows, merged in Postgres under the row lock the unique
-- constraint gives us. The house pattern, after reserve_nlp_units (migrations/016) and
-- accumulate_social_days (019): a day is written by the nightly batch AND by every user
-- refresh, so two writers landing on the same (ticker, day) is ordinary, and reading a
-- row into Python to decide what to write loses whichever write reads first.
--
-- The guard is `excluded.article_count >= existing.article_count`, and it is doing real
-- work rather than being defensive decoration. A user refresh can run the scout with
-- Marketaux off while the nightly batch runs it on, so the refresh legitimately sees
-- fewer tier 1 articles for the same day. Blind last writer wins would let that thinner
-- sample overwrite the fuller one and quietly degrade a good row every time somebody
-- hit refresh. Keeping the more complete sample is the only rule that survives both
-- writers without ordering them.
--
-- Equality is included so that a re-run with the same articles still refreshes
-- updated_at and any improved scoring, rather than being rejected as a tie.
create or replace function public.upsert_news_days(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  merged integer := 0;
begin
  insert into public.news_sentiment_daily as t (
    ticker, as_of_day, news_sentiment_score, article_count,
    bullish_articles, bearish_articles,
    tier1_count, tier2_count, tier3_count, top_articles, updated_at
  )
  select
    upper(r->>'ticker'),
    (r->>'as_of_day')::date,
    nullif(r->>'news_sentiment_score', '')::integer,
    coalesce((r->>'article_count')::integer, 0),
    coalesce((r->>'bullish_articles')::integer, 0),
    coalesce((r->>'bearish_articles')::integer, 0),
    coalesce((r->>'tier1_count')::integer, 0),
    coalesce((r->>'tier2_count')::integer, 0),
    coalesce((r->>'tier3_count')::integer, 0),
    coalesce(r->'top_articles', '[]'::jsonb),
    now()
  from jsonb_array_elements(p_rows) as r
  on conflict on constraint news_sentiment_daily_ticker_day_key do update
    set news_sentiment_score = excluded.news_sentiment_score,
        article_count        = excluded.article_count,
        bullish_articles     = excluded.bullish_articles,
        bearish_articles     = excluded.bearish_articles,
        tier1_count          = excluded.tier1_count,
        tier2_count          = excluded.tier2_count,
        tier3_count          = excluded.tier3_count,
        top_articles         = excluded.top_articles,
        updated_at           = now()
    where excluded.article_count >= t.article_count;

  get diagnostics merged = row_count;
  return merged;
end;
$$;

grant execute on function public.upsert_news_days(jsonb) to service_role;
