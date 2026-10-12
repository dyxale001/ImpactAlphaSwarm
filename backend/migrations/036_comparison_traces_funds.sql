-- Lets comparison_traces (035) hold the Compare page's fund comparison too.
--
-- A fund comparison has no price window, so it is stored under the horizon 'FUNDS'
-- beside the stock rows. Its `windows` column holds each fund's fact sheet date and
-- a fingerprint of the reader's profile answers, and the backend serves a stored
-- paragraph only while both still match. `run_id` and `run_at` stay null.
--
-- Run this in the Supabase SQL editor after 035 and before deploying the backend
-- that writes fund comparisons. Safe to re-run (idempotent).

alter table public.comparison_traces
  drop constraint if exists comparison_traces_horizon_check;

alter table public.comparison_traces
  add constraint comparison_traces_horizon_check
  check (horizon in ('1M', '6M', '3Y', '5Y', 'FUNDS'));
