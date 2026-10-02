-- The Big investors tab's reasoning trace, stored on the institutional cache row it was
-- written from.
--
-- The asset page gives every tab its own trace (D-125). This one explains a ticker's 13F
-- ownership to a beginner: whether the headline figures are normal, which of the top
-- holders are index funds and which chose the stock, what a holder's percentage change
-- means, the filing lag, and what the data cannot say.
--
-- Why columns on institutional_holders_cache rather than a table of its own: there is
-- exactly one trace per ticker, and it is a function of that row's payload and nothing
-- else. Keeping the two side by side means one read serves both.
--
-- Why a fingerprint: the payload is refetched from yfinance whenever its TTL runs out,
-- but 13F data only really changes once a quarter. The trace is written once, stored
-- with a hash of the facts it was written FROM, and rewritten only when a refetch brings
-- facts that hash differently. A refetch that returns the same filing costs nothing.
--
-- The payload refresh upserts only (ticker, payload, fetched_at), so it never clears
-- these columns; a stale trace is caught by the fingerprint, not by being wiped.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads/writes it,
-- and before setting WHALE_INSTITUTIONS_TRACE_ENABLED=true. Until that flag is on the
-- backend never touches these columns. Safe to re-run (idempotent).

alter table public.institutional_holders_cache
  add column if not exists trace              text,
  -- 'model' is the language model, checked before storing: every number in the
  -- paragraph must appear in the facts it was given, and advice or forward looking
  -- words fail it. 'template' is the deterministic paragraph built from the same facts
  -- when the model was unconfigured, failed, or was rejected. Shown as a badge.
  add column if not exists trace_source       text
    check (trace_source is null or trace_source in ('model', 'template')),
  add column if not exists trace_model        text,
  -- sha256 of the canonical facts. Compared on every read; a mismatch regenerates.
  add column if not exists trace_fingerprint  text,
  -- The facts themselves, for review: any sentence can be checked against what the
  -- model was allowed to use, and a bad batch after a model change is selectable.
  add column if not exists trace_facts        jsonb,
  add column if not exists trace_generated_at timestamptz;

-- The backend already has select/insert/update on this table (migration 007).
