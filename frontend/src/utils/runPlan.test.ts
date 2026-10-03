import { describe, it, expect } from 'vitest'
import {
  RUN_TICKER_CAP,
  estimateRunSeconds,
  formatRunTime,
  planRun,
  splitPlaces,
} from './runPlan'

const places = (sectors: string[]) => splitPlaces(sectors).map((s) => s.places)

describe('how a run shares its places between sectors', () => {
  it('gives one sector its own cap, not the whole run', () => {
    expect(places(['Technology'])).toEqual([15])
  })

  it.each([
    [2, [15, 15]],
    [3, [10, 10, 10]],
    [4, [8, 8, 7, 7]],
    [5, [6, 6, 6, 6, 6]],
    [6, [5, 5, 5, 5, 5, 5]],
  ])('splits %i sectors as the backend round robin does', (n, expected) => {
    const sectors = ['Technology', 'Finance', 'Healthcare', 'Green Energy', 'AI & Robotics', 'Media & Communications']
    expect(places(sectors.slice(0, n))).toEqual(expected)
  })

  it('never goes over the run cap', () => {
    const sectors = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    expect(places(sectors).reduce((a, b) => a + b, 0)).toBe(RUN_TICKER_CAP)
  })

  it('keeps the order the sectors were picked in, so the first picks get the extra', () => {
    expect(splitPlaces(['Finance', 'Technology', 'Healthcare', 'Green Energy'])).toEqual([
      { sector: 'Finance', places: 8 },
      { sector: 'Technology', places: 8 },
      { sector: 'Healthcare', places: 7 },
      { sector: 'Green Energy', places: 7 },
    ])
  })

  it('counts a sector picked twice once', () => {
    expect(places(['Technology', 'Technology'])).toEqual([15])
  })

  it('is empty with nothing picked', () => {
    expect(splitPlaces([])).toEqual([])
  })
})

describe('the run time estimate', () => {
  it('matches the measured medians: about 80 seconds for 15, about 95 for 30', () => {
    expect(estimateRunSeconds(15)).toBe(80)
    expect(estimateRunSeconds(30)).toBe(95)
  })

  it('grows far less than in proportion, because most of a run is fixed work', () => {
    expect(estimateRunSeconds(30)).toBeLessThan(estimateRunSeconds(15) * 1.5)
  })

  it('is zero with nothing to analyse', () => {
    expect(estimateRunSeconds(0)).toBe(0)
  })

  it.each([
    [45, '45 sec'],
    [60, '1 min'],
    [80, '1 min 20 sec'],
    [95, '1 min 35 sec'],
  ])('reads %i seconds as "%s"', (secs, text) => {
    expect(formatRunTime(secs)).toBe(text)
  })

  it('is the same for two sectors as for six, since both fill the run', () => {
    expect(planRun(['A', 'B']).time).toBe(planRun(['A', 'B', 'C', 'D', 'E', 'F']).time)
  })
})
