// Day keys shared by the trend chart and the posts listed under it.
//
// A "day" here is the calendar day a post was written, in UTC, formatted
// "YYYY-MM-DD". That is the same key the backend buckets rows under, which is what
// lets a bar on the chart and the posts beneath it refer to the same thing without
// either side converting. Local time is deliberately not used: it would slide posts
// between buckets for anyone east or west of UTC, and a day's score would stop
// matching the posts shown for it.

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
  // Everything else gets a date rather than a weekday name. A weekday read faster
  // while the window was five trading days, because each name appeared once. Over
  // seven consecutive days both ends are the same weekday, so "Monday" would name two
  // different bars on the same chart.
  return formatDay(date);
}
