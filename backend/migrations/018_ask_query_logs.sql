-- Ask AlphaSwarm query analytics (Admin Reports — Chatbot report).
--
-- /api/ask is currently fully stateless: every request is computed and
-- returned with nothing durable left behind (see backend/src/api.py
-- ask_alphaswarm). This table adds the MINIMUM aggregate metadata needed to
-- report on chatbot usage/quality — never the conversation content itself.
--
-- Explicitly NOT stored, by design (privacy — see ADMIN_REPORTS notes):
--   * raw user prompt / query text
--   * raw model narration / answer text
--   * system/developer prompt content
--   * any other personally-identifying or financial-advice content
--
-- One row per /api/ask request, regardless of how many internal Groq calls
-- (classification, narration, one bounded repair attempt) that request took
-- — the backend writes exactly one row per handled request, after the
-- response is fully resolved.
--
-- Same convention as discovery_runs (009) / nlp_budget (016): RLS enabled
-- with no policies, so anon/authenticated are denied outright and only the
-- backend's service_role (which bypasses RLS) can read or write. Admin-only
-- exposure is enforced in the FastAPI layer via _require_admin(), not by a
-- per-row Postgres policy — there is no per-user data here worth a user-
-- scoped policy in the first place.

create table if not exists public.ask_query_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.users(id) on delete set null,
  asset_symbol       text,          -- resolved ticker, when the query was about one; null otherwise
  intent             text,          -- e.g. ASSET_SEARCH, USER_DATA_SEARCH, LEARNING_QUESTION, UNKNOWN, ...
  success            boolean not null default false,
  fallback_used      boolean not null default false,  -- deterministic fallback text used instead of LLM narration
  validation_failed  boolean not null default false,  -- validate_ask_output() rejected the narration at least once
  latency_ms         integer,
  created_at         timestamptz not null default now()
);

-- Reporting queries filter by time range and group by intent/asset — both
-- benefit from an index; user_id supports the future "queries per user"
-- aggregate without a full scan.
create index if not exists ask_query_logs_created_at_idx
  on public.ask_query_logs (created_at desc);
create index if not exists ask_query_logs_intent_idx
  on public.ask_query_logs (intent);
create index if not exists ask_query_logs_asset_symbol_idx
  on public.ask_query_logs (asset_symbol);
create index if not exists ask_query_logs_user_id_idx
  on public.ask_query_logs (user_id);

-- The backend connects as service_role and needs table privileges (not
-- always auto-granted on newly created tables).
grant select, insert on public.ask_query_logs to service_role;

-- Internal analytics table, never read directly by the frontend: enable RLS
-- with no policies so anon/authenticated are denied while service_role
-- bypasses RLS. Matches discovery_runs (009) and nlp_budget (016).
alter table public.ask_query_logs enable row level security;
