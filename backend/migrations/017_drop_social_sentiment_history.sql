-- Undo migrations/015. The social signal goes back to what main does: fetch the
-- newest StockTwits posts per run, score them, keep nothing.
--
-- The stored posts and the daily rollups bought a trend chart, and the chart is
-- gone. Nothing in the backend reads or writes either table any more, so they are
-- inert either way; this file exists so the schema matches the code rather than
-- carrying two tables nobody can explain in six months.
--
-- THIS DESTROYS THE STORED POSTS. There is no copy of them anywhere else, and a
-- fresh crawl can only reach back as far as StockTwits still serves. Run it only
-- when you are sure the history is not wanted, and take a Supabase backup first if
-- there is any doubt. Leaving the tables in place harms nothing in the meantime.
--
-- Run in the Supabase SQL editor AFTER deploying the backend that no longer reads
-- them. Safe to re-run.

drop table if exists public.social_sentiment_daily;
drop table if exists public.stocktwits_message_cache;
