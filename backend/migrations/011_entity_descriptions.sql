-- Plain-English descriptions for the entities shown in Whale Watching:
-- companies (assets) and institutional funds.
--
-- Why this exists: the asset-discovery agent adds new tickers every night, and
-- each new ticker drags in fund holders we have never seen before. Both were
-- previously undescribed — a discovered ticker showed as a bare symbol, and any
-- fund outside the ~40 hand-written blurbs in whale_watching.py fell through to
-- a generic "an institutional investment firm" line. Descriptions are now
-- generated once by a light LLM (Groq) in the nightly job and cached here, so
-- the page never waits on a model and we never pay for the same blurb twice.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads
-- and writes these. Safe to re-run (idempotent).

-- ── assets: description lives on the row itself ─────────────────────────────
-- Kept as a column rather than a side table because the frontend already reads
-- `assets` directly (useUniverseAssets), so the description comes along in the
-- existing select with no extra query.
alter table public.assets
  add column if not exists description               text,
  add column if not exists description_generated_at  timestamptz;

-- The nightly backfill asks for "active assets with no description yet". This
-- partial index keeps that scan trivial as the discovered pool grows.
create index if not exists assets_missing_description_idx
  on public.assets (is_active)
  where description is null;

-- ── fund_descriptions: funds are not rows in `assets` ───────────────────────
-- Funds only ever appear inside the 13F payloads, so they need their own home.
-- Keyed on a normalised form of the fund name (lower-cased, punctuation and
-- corporate suffixes stripped) so "BlackRock Inc.", "Blackrock, Inc" and
-- "BLACKROCK INC" collapse to one row instead of generating three blurbs.
create table if not exists public.fund_descriptions (
  fund_key      text primary key,                    -- normalised match key
  fund_name     text not null,                       -- most recent display name seen
  description   text not null,
  source        text not null default 'llm',         -- 'llm' | 'curated' | 'manual'
  is_manual     boolean not null default false,      -- true = never regenerate, a human wrote this
  generated_at  timestamptz not null default now()
);

grant select, insert, update on public.fund_descriptions to service_role;

-- Backend-only cache: RLS on with no policies denies anon/authenticated while
-- service_role bypasses RLS. The frontend gets these through /api/funds.
alter table public.fund_descriptions enable row level security;
