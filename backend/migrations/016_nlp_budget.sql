-- Durable spend guard for the metered Google Cloud NLP calls.
--
-- The cap this replaces was counted in a JSON file on the container's own
-- filesystem (data/cache/gcp_nlp_budget.json). On Cloud Run that file is born
-- empty on every cold start and is never shared between instances, so what it
-- actually enforced was "N units per container lifetime". With maxScale 20 and
-- routine recycling that is not a ceiling, and it fails in the expensive
-- direction: the counter can only ever read LOW, so spending continues past the
-- cap rather than stopping short of it. At 500 units that hardly mattered.
-- Raising it to 40000 to pay for a higher GCP_SENTIMENT_TOP_N is what makes it
-- matter, and there is no GCP-side stop to fall back on: quota overrides on this
-- API are per-minute rate limits and a billing budget only sends an alert.
--
-- Keeping the count here fixes both halves: a restart cannot reset it, and every
-- instance reserves against the same row.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend that reads it.
-- Safe to re-run (idempotent). Until it is applied the backend degrades to the old
-- file counter, so applying it late costs accuracy, not uptime.


create table if not exists public.nlp_budget (
  -- 'YYYY-MM' in UTC. A new month inserts its own row, which is what makes the
  -- reset automatic and unforgeable: nothing ever has to remember to zero it.
  month           text primary key,
  units_reserved  integer not null default 0,
  updated_at      timestamptz not null default now()
);


-- Claim up to p_units of this month's cap, returning how many were granted (0 once
-- the cap is spent, which is the caller's signal to fall back to VADER alone).
--
-- The row lock is the entire point. Two Cloud Run instances reserving at the same
-- moment would otherwise both read the same starting value and both believe they
-- had room. Doing the read and the write inside one locked statement is exactly
-- what a file on an ephemeral disk could never offer.
--
-- Callers claim in chunks and spend locally, so a run costs about one round trip
-- per 25 units rather than one per unit. A chunk claimed but not spent (the
-- container died holding it) is forfeited, which biases the count high. That is the
-- safe direction for a spend guard, and a clean exit hands the remainder back via a
-- negative p_units, which is floored at zero here.
create or replace function public.reserve_nlp_units(
  p_month text,
  p_units integer,
  p_cap   integer
)
returns integer
language plpgsql
as $$
declare
  v_reserved integer;
  v_granted  integer;
begin
  insert into public.nlp_budget (month, units_reserved)
  values (p_month, 0)
  on conflict (month) do nothing;

  select units_reserved into v_reserved
    from public.nlp_budget
   where month = p_month
     for update;

  if p_units < 0 then
    update public.nlp_budget
       set units_reserved = greatest(v_reserved + p_units, 0),
           updated_at = now()
     where month = p_month;
    return p_units;
  end if;

  v_granted := greatest(least(p_units, p_cap - v_reserved), 0);

  if v_granted > 0 then
    update public.nlp_budget
       set units_reserved = v_reserved + v_granted,
           updated_at = now()
     where month = p_month;
  end if;

  return v_granted;
end;
$$;


-- The backend connects as service_role and needs both the table and the function.
grant select, insert, update on public.nlp_budget to service_role;
grant execute on function public.reserve_nlp_units(text, integer, integer) to service_role;

-- Backend only: RLS on with no policies denies anon/authenticated outright, while
-- service_role bypasses it. Nothing in the frontend reads this.
alter table public.nlp_budget enable row level security;
