-- Fix: an intraday tick was overwriting a day's top posts with just its own handful.
--
-- ── what was broken ──────────────────────────────────────────────────────────
-- social_sentiment_daily.top_posts is meant to hold the day's fifteen most influential
-- posts (SentimentConfig.social_day_top_posts). The full-day writers -- the nightly run
-- and the backfill -- walk the day end to end, so the fifteen they submit really are the
-- day's fifteen. accumulate_social_day's incremental branch then took that submission
-- and REPLACED the stored list with it:
--
--   top_posts = coalesce(p_top_posts, existing.top_posts)
--
-- That was fine while the only incremental writer was a nightly run skimming the head of
-- a day it was about to state in full anyway. It stopped being fine when the intraday
-- tick landed. A tick (ss_tick.py) deliberately fetches only the posts newer than the
-- stored high-water mark -- a few dozen at most -- scores those, and submits a day row
-- whose top_posts is the top of that tiny delta. The replace then threw away the fifteen
-- real posts and left whatever three or four the last tick happened to see. GOOG for
-- 1 Sept 2026: 107 scored posts on the row, 3 posts in top_posts.
--
-- ── the fix ──────────────────────────────────────────────────────────────────
-- The incremental branch now MERGES the two lists instead of replacing. Every stored
-- post already carries a `rank` (abs(sentiment_raw) * weight), written by
-- SocialDayBuilder._top_posts precisely so two samples of the same day can be compared.
-- merge_top_posts unions existing + incoming, keeps the higher-ranked copy of any post
-- that appears in both, and returns the top `cap` by rank. A tick's genuinely loud post
-- still gets in; the day's existing loud posts are no longer evicted to make room for a
-- tick's quiet ones.
--
-- The seeded / full-walk branch is left as a replace: a sample that passed the
-- `p_post_count >= existing.post_count` guard has seen the whole day, so its fifteen are
-- authoritative and a merge would only risk re-admitting a stale post a later day had
-- correctly dropped.
--
-- ── recovery: only forwards ──────────────────────────────────────────────────
-- No data statement here, and a day already reduced does NOT repair itself. A day takes
-- another incremental write only when a sample carries a message id above the one stored
-- on its row, and StockTwits ids rise with time: any post newer than 1 Sept's mark was
-- written on 2 Sept and buckets into a different day. So 1 Sept keeps the three posts
-- the last tick left on it, permanently.
--
-- What this fixes is every day from here on. Today's row keeps taking ticks all day and
-- now accretes towards fifteen instead of being reset to each tick's slice.
--
-- Forcing a past day back is possible but unreliable, which is why it is not attempted
-- here. Clearing seeded_at puts the ticker back on the backfill's pending list, as
-- migrations/020 did, but the seed's replace branch is guarded by
-- `p_post_count >= existing.post_count`, and a thirty page walk spread across a seven day
-- window can easily return fewer posts for one busy day than the row already claims. That
-- sample falls through to the mark guard and changes nothing, silently.
--
-- Safe to re-run. Signatures are unchanged, so existing grants survive.


-- ── the merge helper ─────────────────────────────────────────────────────────
create or replace function public.merge_top_posts(
  p_existing jsonb,
  p_incoming jsonb,
  p_cap      integer default 15
)
returns jsonb
language sql
immutable
as $$
  with unioned as (
    select
      elem,
      -- url is the natural key; fall back to author + text for the rare row without one.
      coalesce(elem->>'url', concat_ws('|', elem->>'author', elem->>'text')) as dedupe_key,
      -- Rows written before `rank` existed sort last rather than first.
      coalesce((elem->>'rank')::numeric, -1) as rank
    from jsonb_array_elements(
      coalesce(p_existing, '[]'::jsonb) || coalesce(p_incoming, '[]'::jsonb)
    ) as elem
  ),
  best as (
    -- One row per post, the higher-ranked copy when it appears in both lists.
    select distinct on (dedupe_key) elem, rank
    from unioned
    order by dedupe_key, rank desc
  )
  select coalesce(jsonb_agg(elem order by rank desc), '[]'::jsonb)
  from (
    select elem, rank from best order by rank desc limit greatest(p_cap, 0)
  ) capped;
$$;

grant execute on function public.merge_top_posts(jsonb, jsonb, integer) to service_role;


-- ── the merge, with top_posts accreted on the incremental path ───────────────
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
  -- them with. This is the branch the migrations/020 bug needed and did not have.
  --
  -- The count comparison is what makes the replace incapable of losing data. A walk cut
  -- short by its page ceiling can cover only part of a very busy day, and on the day it
  -- stopped mid-way its total would be lower than what is stored; that sample falls
  -- through to the ordinary path below, where the mark guard turns it into a no-op. So a
  -- day's count can be corrected upwards by a walk, never dragged down by one.
  --
  -- top_posts is replaced here, not merged: a sample that passed the count guard saw the
  -- whole day, so its list is the day's list.
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

  -- The incremental path: a run or a tick that skimmed the head and knows only a slice of
  -- the day. top_posts is MERGED by rank, not replaced -- a tick's slice is a few dozen
  -- posts, and replacing with it was evicting the day's real top fifteen. See the header.
  update public.social_sentiment_daily
     set post_count         = existing.post_count + p_post_count,
         bullish_posts      = existing.bullish_posts + p_bullish,
         bearish_posts      = existing.bearish_posts + p_bearish,
         weight_sum         = new_weight_sum,
         weighted_score_sum = new_score_sum,
         social_sentiment_score = public.social_day_score(new_score_sum, new_weight_sum),
         last_message_id    = greatest(existing.last_message_id, p_last_message_id),
         top_posts          = public.merge_top_posts(existing.top_posts, p_top_posts, 15),
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
