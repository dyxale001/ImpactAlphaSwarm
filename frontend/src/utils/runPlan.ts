// What an analysis run will look at, and roughly how long it takes, for a choice of
// sectors. Shown live under the sector tiles in Settings.
//
// The split mirrors the backend's TickerScoper.select_from_pool: each sector offers
// its top RUN_SECTOR_CAP names, and the run takes them round robin, one per sector in
// turn, until RUN_TICKER_CAP. So one sector gives 15, two give 15 + 15, three give
// 10 each, and four give 8, 8, 7, 7 (the sectors picked first get the extra). Both
// caps are backend env vars (DISCOVERY_POOL_SIZE, MAX_SCOPED_TICKERS); keep in step.

export const RUN_SECTOR_CAP = 15
export const RUN_TICKER_CAP = 30

export interface SectorShare {
  sector: string
  places: number
}

/** How many places each sector gets in a run, in the order the sectors were picked. */
export function splitPlaces(sectors: string[]): SectorShare[] {
  const unique = Array.from(new Set(sectors))
  const places = unique.map(() => 0)
  let left = RUN_TICKER_CAP
  for (let round = 0; round < RUN_SECTOR_CAP && left > 0; round++) {
    for (let i = 0; i < unique.length && left > 0; i++) {
      places[i] += 1
      left -= 1
    }
  }
  return unique.map((sector, i) => ({ sector, places: places[i] }))
}

// Fitted to 35 completed runs over September 2026 (Cloud Run logs, start request to
// "finished"): 15 tickers took a median of 81 seconds, 26 to 30 tickers a median of
// 93. Most of a run is fixed work (the AI write-ups, saving, sentiment), so a ticker
// adds under a second and a second sector costs far less than the first.
const FIXED_SECONDS = 68
const SECONDS_PER_TICKER = 0.85

/** A typical run time in seconds for this many companies, rounded to 5 seconds. */
export function estimateRunSeconds(companies: number): number {
  if (companies <= 0) return 0
  return Math.round((FIXED_SECONDS + SECONDS_PER_TICKER * companies) / 5) * 5
}

/** 80 -> "1 min 20 sec", 60 -> "1 min", 45 -> "45 sec". */
export function formatRunTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs} sec`
  return secs === 0 ? `${mins} min` : `${mins} min ${secs} sec`
}

/** Everything the preview shows for a choice of sectors. */
export function planRun(sectors: string[]) {
  const shares = splitPlaces(sectors)
  const companies = shares.reduce((sum, s) => sum + s.places, 0)
  const seconds = estimateRunSeconds(companies)
  return { shares, companies, seconds, time: formatRunTime(seconds) }
}
