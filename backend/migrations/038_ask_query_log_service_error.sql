-- Ask AlphaSwarm: record when the MODEL SERVICE failed, as opposed to when
-- AlphaSwarm genuinely could not handle a question.
--
-- WHY. The Chatbot report shows each question with an outcome of "answered",
-- "fallback" or "not answered". Those last two are ambiguous: a question
-- falls back or goes unanswered both when AlphaSwarm cannot handle it AND
-- when the Groq call behind it failed — a rate limit, an outage, an empty
-- completion. They look identical in the log and mean opposite things. One
-- is a coverage gap (go and improve routing); the other is an operational
-- problem (go and look at the quota). Reading a daily-token-limit outage as
-- a coverage gap sends someone to fix routing that is working, which is
-- exactly what nearly happened: a log full of "Fallback" and "Not answered"
-- rows turned out to be the Groq key hitting its 200,000 tokens/day cap.
--
-- WHAT. One boolean, set by the backend when any model call made on behalf
-- of the request raised, or when no model client was configured at all.
-- It describes the SERVICE, never the question or the answer, so it adds no
-- personal information.
--
-- SAFE TO APPLY IN ANY ORDER. Declared `not null default false`, so existing
-- rows read as "no service error" and none of them is rewritten. The
-- backend tolerates this column being absent: a failed insert retries
-- without it, so deploying the code before this migration loses nothing.

alter table public.ask_query_logs
  add column if not exists service_error boolean not null default false;

comment on column public.ask_query_logs.service_error is
  'True when a model call made for this request failed (rate limit, outage, empty completion) or no model client was configured. Distinguishes an operational failure from a question AlphaSwarm could not handle.';

-- The report filters and counts on it.
create index if not exists ask_query_logs_service_error_idx
  on public.ask_query_logs (service_error)
  where service_error;
