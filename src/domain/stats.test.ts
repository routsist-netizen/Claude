import { describe, expect, it } from 'vitest'
import { averageRating, correlation, filterBakes, metricValue, points, strength } from './stats'
import { bakeFromSchedule, feedingRatio, peakMinutes, starterHydration } from './journal'
import { EXAMPLE_RECIPES } from './examples'
import { calculate } from './recipe'
import { buildSchedule } from './schedule'
import type { Bake } from './types'

const recipe = EXAMPLE_RECIPES[0]

function bake(over: Partial<Bake> & { bulk?: number; actualBulk?: number }): Bake {
  const { bulk = 300, actualBulk, ...rest } = over
  return {
    id: Math.random().toString(36),
    date: '2026-09-01T12:00:00.000Z',
    recipeId: recipe.id,
    recipeName: recipe.name,
    snapshot: recipe.formula,
    kitchenTemp: 22,
    proofMode: 'cold',
    steps: [{ key: 'bulk', plannedStart: '2026-09-01T06:00:00.000Z', plannedMinutes: bulk, actualMinutes: actualBulk }],
    notes: '',
    rating: 4,
    photos: [],
    createdAt: '',
    updatedAt: '',
    ...rest,
  }
}

describe('examples', () => {
  it('are all valid, marked as examples and have unique ids', () => {
    expect(EXAMPLE_RECIPES.length).toBeGreaterThanOrEqual(3)
    expect(new Set(EXAMPLE_RECIPES.map((r) => r.id)).size).toBe(EXAMPLE_RECIPES.length)
    for (const r of EXAMPLE_RECIPES) {
      expect(r.isExample).toBe(true)
      expect(calculate(r.formula).issues).toEqual([])
    }
  })
})

describe('stats', () => {
  it('prefers actual over planned step times', () => {
    expect(metricValue(bake({ bulk: 300 }), 'bulkHours')).toBe(5)
    expect(metricValue(bake({ bulk: 300, actualBulk: 360 }), 'bulkHours')).toBe(6)
    expect(metricValue(bake({}), 'hydration')).toBe(75)
    expect(metricValue(bake({}), 'proofHours')).toBeNull()
  })

  it('skips unrated bakes when building points', () => {
    const pts = points([bake({ rating: 5 }), bake({ rating: null })], 'bulkHours')
    expect(pts).toHaveLength(1)
  })

  it('computes Pearson correlation', () => {
    expect(correlation([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }])).toBeCloseTo(1, 9)
    expect(correlation([{ x: 1, y: 3 }, { x: 2, y: 2 }, { x: 3, y: 1 }])).toBeCloseTo(-1, 9)
    expect(correlation([{ x: 1, y: 3 }, { x: 2, y: 3 }])).toBeNull()
    expect(correlation([{ x: 1, y: 3 }, { x: 1, y: 4 }, { x: 1, y: 5 }])).toBeNull()
    expect(strength(0.1)).toBe('none')
    expect(strength(-0.5)).toBe('moderate')
    expect(strength(0.9)).toBe('strong')
  })

  it('filters by recipe, rating and date, newest first', () => {
    const list = [
      bake({ id: 'a', date: '2026-08-01T10:00:00Z', rating: 2 }),
      bake({ id: 'b', date: '2026-09-15T10:00:00Z', rating: 5 }),
      bake({ id: 'c', date: '2026-09-20T10:00:00Z', rating: 4, recipeId: 'other' }),
    ]
    expect(filterBakes(list, {}).map((b) => b.id)).toEqual(['c', 'b', 'a'])
    expect(filterBakes(list, { recipeId: recipe.id }).map((b) => b.id)).toEqual(['b', 'a'])
    expect(filterBakes(list, { minRating: 4 }).map((b) => b.id)).toEqual(['c', 'b'])
    expect(filterBakes(list, { from: '2026-09-01', to: '2026-09-16' }).map((b) => b.id)).toEqual(['b'])
    expect(averageRating(list)).toBeCloseTo(11 / 3, 9)
    expect(averageRating([])).toBeNull()
  })
})

describe('journal', () => {
  it('pre-fills a bake from the schedule with a snapshot of the recipe', () => {
    const schedule = buildSchedule({
      target: new Date('2026-10-10T12:00:00'),
      kitchenTemp: 23,
      formula: recipe.formula,
      settings: recipe.schedule,
    })
    const b = bakeFromSchedule(recipe, schedule, 23, new Date('2026-10-09T08:00:00Z'))
    expect(b.recipeName).toBe(recipe.name)
    expect(b.snapshot).toEqual(recipe.formula)
    expect(b.snapshot).not.toBe(recipe.formula)
    expect(b.steps.map((s) => s.key)).toEqual(schedule.steps.map((s) => s.key))
    expect(b.date).toBe(schedule.end.toISOString())
    expect(b.rating).toBeNull()
  })

  it('describes starter feedings', () => {
    expect(feedingRatio({ seed: 20, flour: 100, water: 100 })).toBe('1:5:5')
    expect(feedingRatio({ seed: 0, flour: 100, water: 100 })).toBe('–')
    expect(starterHydration({ flour: 100, water: 80 })).toBe(80)
    expect(peakMinutes({ fedAt: '2026-10-01T08:00:00Z', peakAt: '2026-10-01T13:30:00Z' })).toBe(330)
    expect(peakMinutes({ fedAt: '2026-10-01T08:00:00Z', peakAt: null })).toBeNull()
  })
})
