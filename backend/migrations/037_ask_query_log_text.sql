-- Ask AlphaSwarm: keep the question text, so an admin can see what is being asked.
--
-- THIS REVERSES A DOCUMENTED DECISION. Migration 018 stored aggregate
-- metadata only and listed the raw query among the things "explicitly NOT
-- stored, by design (privacy)". The product owner has now asked for the
-- questions to be visible in the admin report, so that decision is
-- superseded here, deliberately and on the record, rather than quietly.
--
-- What is stored, and what still is not:
--   * query_text   the user's QUESTION, truncated to 500 characters.
--   * NOT stored:  the model's answer / narration, the system prompt, or
--                  anything the retrieval returned. Only what the user typed.
--
-- Why it is worth being careful about. This is free text typed by a person
-- into a finance assistant, and people put things in it that they were not
-- asked for: names, account details, their own circumstances ("I'm 54 and
-- my pension is..."). It is personal information under POPIA the moment it
-- is stored. Hence:
--   * the column is nullable and optional — nothing breaks without it;
--   * RLS stays on with no policies (as in 018), so only the backend's
--     service role can read it, and the admin endpoint is the only reader;
--   * the app truncates before writing and never logs it elsewhere;
--   * `ask_query_logs_purge_text` below gives retention a single, obvious
--     lever: the text can be nulled out after N days WITHOUT losing the
--     aggregate row, so the usage statistics outlive the questions.
--
-- Nothing here deletes or rewrites existing rows. Rows written before this
-- migration simply have no query text.

alter table public.ask_query_logs
  add column if not exists query_text text;

comment on column public.ask_query_logs.query_text is
  'The user''s question, truncated to 500 chars by the backend. Personal information: admin-only, purge on a schedule via ask_query_logs_purge_text(). The model''s answer is never stored.';

-- Retention lever. Call from a scheduled job (e.g. daily) or by hand:
--   select public.ask_query_logs_purge_text(90);
-- Nulls the question text on rows older than `keep_days`, keeping the row so
-- counts, intents, latency and success rates are unaffected. Returns how many
-- rows were cleared.
create or replace function public.ask_query_logs_purge_text(keep_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cleared integer;
begin
  update public.ask_query_logs
     set query_text = null
   where query_text is not null
     and created_at < now() - make_interval(days => keep_days);
  get diagnostics cleared = row_count;
  return cleared;
end;
$$;

-- The function rewrites data, so it must not be callable by clients.
revoke all on function public.ask_query_logs_purge_text(integer) from public, anon, authenticated;
