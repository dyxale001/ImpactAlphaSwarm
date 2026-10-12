-- Macro / current-affairs news: world and market news tagged to investment universes.
--
-- Three times a day the backend pulls Finnhub's general news feed, keeps the trusted
-- publishers, and asks Jev (TypeSafe's decision model, via OpenRouter) eight yes/no
-- questions about each article: is it market-relevant, does it affect markets broadly,
-- and does it directly concern each of the six universes. Every probability is stored
-- and shown, including the low ones; `tags` is what clears the threshold.
--
-- Relevance only, never direction. Nothing here feeds the ranking, the scorecard or
-- sentiment.
--
-- Read and written only through the backend (service role); the frontend calls
-- GET /api/macro/news. Run this in the Supabase SQL editor BEFORE turning
-- MACRO_NEWS_ENABLED on. Safe to re-run (idempotent).


-- ── articles ─────────────────────────────────────────────────────────────────
create table if not exists public.macro_news_articles (
  -- Finnhub's own article id. Increasing, which is what lets a pull ask for
  -- "everything after the newest id I hold" (minId) rather than re-reading the feed.
  finnhub_id        bigint primary key,
  headline          text not null,
  -- The publisher's own summary, shown as-is. Usually one sentence; never rewritten.
  blurb             text,
  -- The effective publisher: a wire story syndicated through an aggregator is
  -- credited to the wire, as the sentiment scout does.
  source            text not null,
  url               text not null,
  image_url         text,
  published_at      timestamptz not null,
  fetched_at        timestamptz not null default now(),

  -- Jev's answers. All null until the article has been scored; a failed call leaves
  -- them null and the next pull tries again.
  gate_p            real,
  market_wide_p     real,
  -- {"Technology": 0.82, "Finance": 0.31, ...}: every universe, not just the tagged ones.
  universe_probs    jsonb,
  -- Universe names and/or 'Market-wide' that cleared the threshold.
  tags              text[] not null default '{}',
  jev_model         text,
  -- Hash of the universe set, the question wording and the model. A row whose
  -- version differs from the running code's was scored by older questions and is
  -- re-scored by POST /api/macro/rescore.
  question_version  text,
  scored_at         timestamptz
);

create index if not exists macro_news_articles_published_idx
  on public.macro_news_articles (published_at desc);

create index if not exists macro_news_articles_tags_idx
  on public.macro_news_articles using gin (tags);

grant select, insert, update, delete on public.macro_news_articles to service_role;

alter table public.macro_news_articles enable row level security;


-- ── per-universe overviews ──────────────────────────────────────────────────
-- The short paragraph at the top of a stock's "Market news" tab, written by the LLM
-- from the articles tagged to that universe. Created now so the feature needs one
-- migration; nothing writes it until the stock tab ships.
create table if not exists public.macro_universe_digest (
  universe      text not null,
  -- The pull that wrote it.
  slot_start    timestamptz not null,
  summary       text not null,
  -- The evidence fingerprint: an unchanged set of tagged articles is not rewritten.
  article_ids   bigint[] not null,
  model         text,
  generated_at  timestamptz not null default now(),

  constraint macro_universe_digest_universe_slot_key unique (universe, slot_start)
);

create index if not exists macro_universe_digest_universe_idx
  on public.macro_universe_digest (universe, slot_start desc);

grant select, insert, update, delete on public.macro_universe_digest to service_role;

alter table public.macro_universe_digest enable row level security;
