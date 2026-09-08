-- Fix: a full history walk replaces a day instead of arguing about which posts are new.
--
-- ── what was broken ──────────────────────────────────────────────────────────
-- MentionScorer.score built its scored entries without copying message_id across. Every
-- other field was there, so nothing looked wrong and the tests' fixtures carried the
-- field the real code did not. The consequence ran three layers down:
--
--   scorer drops message_id
--     -> SocialDayBuilder._row computes last_message_id = 0 for every day
--       -> accumulate_social_day's guard reads "0 <= 0" and returns the row untouched
--
-- So only the FIRST write for a (ticker, day) was ever kept and every later one was
-- discarded, silently, with no error anywhere. Which write got there first decided
-- whether a day looked right: days the thirty page backfill reached first held real
-- counts (ORCL: 44, 66, 162, 182), days a six page nightly run touched first were frozen
-- at whatever that shallow skim found (ORCL: 6, 14, 11, 21). A no-write dry run of the
-- backfill found 110 posts for ORCL on 2026-08-28, against the 6 stored.
--
-- It could not self-heal either. The seeded_at branch below still fired, so the ticker
-- was marked walked despite having saved nothing, and pending() never offered it again.
--
-- ── why carrying message_id is not on its own enough ──────────────────────────
-- The backfill walks the stream BACKWARDS from the head. Its ids therefore descend as it
-- goes, and for any day it already touched, the sample it offers has a LOWER newest id
-- than the mark it is being compared against. Fix the scorer alone and the guard flips
-- from rejecting every write for being "not new" to rejecting it for being "too old".
-- One silent failure traded for another.
--
-- A single high water mark cannot dedupe a backwards walk against a forwards one. So the
-- two readers stop being treated the same:
--
--   a run       skims the head six pages deep and knows only a slice of the day, so it
--               ADDS, and the mark is what stops it adding the same post twice.
--   a full walk reads the day end to end at thirty pages and knows the whole thing, so
--               it REPLACES. It is not offering an opinion about what is new, it is
--               stating the total, and a total does not need deduplicating.
--
-- p_seeded already means exactly "this sample came from a complete history walk", so it
-- is what selects the mode. It is set only by SocialBackfiller, from the 23:00 scheduler
-- job and the lazy per ticker seed. No path a run can reach ever sets it.
--
-- Safe to re-run. The function signature is unchanged, so existing grants survive.


-- ── the merge, with the seed given its own branch ────────────────────────────
create or replace function public.accumulate_social_day(
  p_ticker              text,
  p_day                 date,
  p_post_count          integer,
  p_bullish             integer,
  p_bearish             integer,
  p_weight_sum          real,
  p_weighted_score_sum  real,
  p_last_message_id     bigint,
  p_top_posts           jsonb,
  p_seeded              boolean default false
)
returns public.social_sentiment_daily
language plpgsql
as $$
declare
  existing public.social_sentiment_daily;
  merged   public.social_sentiment_daily;
  new_weight_sum real;
  new_score_sum  real;
begin
  select * into existing
    from public.social_sentiment_daily
   where ticker = upper(p_ticker) and as_of_night = p_day
     for update;

  if not found then
    insert into public.social_sentiment_daily (
      ticker, as_of_night, post_count, bullish_posts, bearish_posts,
      weight_sum, weighted_score_sum, last_message_id, top_posts,
      social_sentiment_score, seeded_at, updated_at
    ) values (
      upper(p_ticker), p_day, p_post_count, p_bullish, p_bearish,
      p_weight_sum, p_weighted_score_sum, p_last_message_id, coalesce(p_top_posts, '[]'::jsonb),
      public.social_day_score(p_weighted_score_sum, p_weight_sum),
      case when p_seeded then now() else null end, now()
    )
    returning * into merged;
    return merged;
  end if;

  -- A complete walk of the day, and it saw at least as much as is on record. Take its
  -- numbers wholesale rather than adding them to a partial count nobody can reconcile
  -- them with. This is the branch the bug above needed and did not have.
  --
  -- The count comparison is what makes the replace incapable of losing data. A walk cut
  -- short by its page ceiling can cover only part of a very busy day, and on the day it
  -- stopped mid-way its total would be lower than what is stored; that sample falls
  -- through to the ordinary path below, where the mark guard turns it into a no-op. So a
  -- day's count can be corrected upwards by a walk, never dragged down by one.
  --
  -- greatest() on the mark, not the incoming value. A walk starts at the head of the
  -- stream, so its newest id is normally at or above anything a run stored earlier and
  -- the two agree. Where they do not, the row has been written by something concurrent,
  -- and keeping the higher mark costs at most a few posts the next run declines to count
  -- again. Taking the lower one would let those same posts be counted twice, and an
  -- inflated bar is the worse of the two lies.
  if p_seeded and p_post_count >= existing.post_count then
    update public.social_sentiment_daily
       set post_count         = p_post_count,
           bullish_posts      = p_bullish,
           bearish_posts      = p_bearish,
           weight_sum         = p_weight_sum,
           weighted_score_sum = p_weighted_score_sum,
           social_sentiment_score = public.social_day_score(p_weighted_score_sum, p_weight_sum),
           last_message_id    = greatest(existing.last_message_id, p_last_message_id),
           top_posts          = coalesce(p_top_posts, existing.top_posts),
           seeded_at          = now(),
           updated_at         = now()
     where ticker = existing.ticker and as_of_night = existing.as_of_night
    returning * into merged;
    return merged;
  end if;

  -- Nothing newer than what is already counted. Leave the row exactly as it stands,
  -- except for the seed mark, which a seed is entitled to set even on a day it added
  -- no posts to: that is how a silent ticker records that it was walked.
  if p_last_message_id <= existing.last_message_id then
    if p_seeded and existing.seeded_at is null then
      update public.social_sentiment_daily
         set seeded_at = now(), updated_at = now()
       where ticker = existing.ticker and as_of_night = existing.as_of_night
      returning * into merged;
      return merged;
    end if;
    return existing;
  end if;

  new_weight_sum := round((existing.weight_sum + p_weight_sum)::numeric, 4);
  new_score_sum  := round((existing.weighted_score_sum + p_weighted_score_sum)::numeric, 4);

  -- top_posts is replaced, not merged. A walk always starts at the head, so any sample
  -- that stayed inside its page cap has seen the whole day and its top posts are the
  -- true ones. Merging instead would mean reading every stored post back on every run,
  -- which is the cost this whole design exists to avoid.
  update public.social_sentiment_daily
     set post_count         = existing.post_count + p_post_count,
         bullish_posts      = existing.bullish_posts + p_bullish,
         bearish_posts      = existing.bearish_posts + p_bearish,
         weight_sum         = new_weight_sum,
         weighted_score_sum = new_score_sum,
         social_sentiment_score = public.social_day_score(new_score_sum, new_weight_sum),
         last_message_id    = greatest(existing.last_message_id, p_last_message_id),
         top_posts          = coalesce(p_top_posts, existing.top_posts),
         seeded_at          = case when p_seeded then now() else existing.seeded_at end,
         updated_at         = now()
   where ticker = existing.ticker and as_of_night = existing.as_of_night
  returning * into merged;

  return merged;
end;
$$;

grant execute on function public.accumulate_social_day(
  text, date, integer, integer, integer, real, real, bigint, jsonb, boolean
) to service_role;


-- ── the repair ───────────────────────────────────────────────────────────────
-- Every row in this table was written by a build that never stamped a real message id,
-- so no seed mark in it is trustworthy: each one says "walked" about a walk whose writes
-- were thrown away. Clearing them all is not over-broad, it is the actual extent of it.
--
-- This is the only statement here that touches data. It writes nothing to the counts,
-- so re-running it is harmless and nothing is destroyed: it puts tickers back on the
-- backfill's pending list, and the 23:00 job walks them again that night, this time with
-- writes that land. Bounded by SOCIAL_BACKFILL_QUOTA (30 tickers) and
-- SOCIAL_BACKFILL_MAX_SECONDS (900s), so a large universe simply takes a second night.
--
-- Expect the lazy seed to fire too. Opening an asset's social page for a ticker that is
-- pending again starts a walk behind the request, and the page shows "building history"
-- for a few seconds before filling in. That is the designed behaviour for a ticker
-- nobody has walked, and SeedRegistry collapses concurrent reloads into one walk.
update public.social_sentiment_daily
   set seeded_at = null
 where seeded_at is not null;
