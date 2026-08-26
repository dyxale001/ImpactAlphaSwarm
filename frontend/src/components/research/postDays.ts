// Day keys shared by the social posts list, the trend chart and the social
// sentiment page.
//
// A "day" here is the calendar day a post was written, in UTC, formatted
// "YYYY-MM-DD". That is the same key the backend buckets rollups under, which is
// what lets a bar on the chart and a group of posts refer to the same thing
// without either side converting. Local time is deliberately not used: it would
// slide posts between buckets for anyone east or west of UTC, and the score for
// a day would stop matching the posts shown under it.

import type { SocialPost } from "./SocialPosts";

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// "2026-08-26" -> "26 Aug"
export function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// The same, but naming the day when it is one the reader thinks of by name.
export function dayLabel(date: string): string {
  if (date === todayKey()) return "Today";
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (date === yesterday) return "Yesterday";
  return formatDay(date);
}

// Every day present in a set of posts, newest first.
export function postDays(posts: SocialPost[]): string[] {
  const days = new Set<string>();
  for (const post of posts) if (post.date) days.add(post.date);
  return [...days].sort().reverse();
}

// The most recent day that actually carries posts.
//
// Not simply today: a run that last collected two days ago has nothing under
// today's key, and defaulting to an empty day would show a reader an empty list
// and let them conclude there is no chatter at all.
export function latestPostDay(posts: SocialPost[]): string | null {
  return postDays(posts)[0] ?? null;
}

// `null` means every day, which is what the "all days" choice passes.
export function postsOnDay(
  posts: SocialPost[],
  day: string | null,
): SocialPost[] {
  if (!day) return posts;
  return posts.filter((post) => post.date === day);
}

export function countsByDay(posts: SocialPost[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    if (post.date) counts[post.date] = (counts[post.date] ?? 0) + 1;
  }
  return counts;
}
