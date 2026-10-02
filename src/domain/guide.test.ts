import { describe, expect, it } from 'vitest'
import { buildGuide } from './guide'
import { DEFAULT_METHOD, type BakeMethod } from './method'
import { EXAMPLE_RECIPES } from './examples'
import { calculate } from './recipe'
import type { GuideLine } from './guide'
import type { Recipe } from './types'

const country = EXAMPLE_RECIPES.find((r) => r.id === 'example-country')!
const focaccia = EXAMPLE_RECIPES.find((r) => r.id === 'example-focaccia')!
const wholewheat = EXAMPLE_RECIPES.find((r) => r.id === 'example-wholewheat')!
const method = (over: Partial<BakeMethod> = {}): BakeMethod => ({ ...DEFAULT_METHOD, ...over })
const ids = (g: ReturnType<typeof buildGuide>) => g.steps.map((s) => s.id)
const grams = (lines: GuideLine[]) => lines.reduce((s, l) => s + l.grams, 0)

const without = (r: Recipe, patch: Partial<Recipe['schedule']['durations']>): Recipe => ({
  ...r,
  schedule: { ...r.schedule, durations: { ...r.schedule.durations, ...patch } },
})

describe('buildGuide', () => {
  it('lists the steps in baking order, ending with preheat, bake and cooling', () => {
    expect(ids(buildGuide(country, method(), 24))).toEqual([
      'levain',
      'autolyse',
      'mix',
      'bulk',
      'preshape',
      'benchRest',
      'shape',
      'proof',
      'preheat',
      'bake',
      'cool',
    ])
  })

  it('weighs every ingredient exactly once across the steps', () => {
    const g = buildGuide(country, method(), 24)
    const total = calculate(country.formula).totalDough
    const inDough = g.steps.filter((s) => s.id !== 'levain').flatMap((s) => s.lines)
    expect(grams(inDough)).toBeCloseTo(total, 6)
  })

  it('puts flour and water in the autolyse and the levain and salt in the mix', () => {
    const g = buildGuide(country, method(), 24)
    const kinds = (id: string) => g.steps.find((s) => s.id === id)!.lines.map((l) => l.kind)
    expect(kinds('autolyse')).toEqual(['flour', 'flour', 'water'])
    expect(kinds('mix')).toEqual(['levain', 'salt'])
    expect(g.autolyse).toBe(true)
  })

  it('moves flour and water to the mix when there is no autolyse', () => {
    const g = buildGuide(without(country, { autolyse: 0 }), method(), 24)
    expect(ids(g)).not.toContain('autolyse')
    expect(g.steps.find((s) => s.id === 'mix')!.lines.map((l) => l.kind)).toEqual(['flour', 'flour', 'water', 'levain', 'salt'])
  })

  it('gives the levain build quantities, with the flour named', () => {
    const g = buildGuide(country, method(), 24)
    const levain = g.steps.find((s) => s.id === 'levain')!
    expect(levain.lines.map((l) => l.kind)).toEqual(['seed', 'levainFlour', 'water'])
    expect(levain.lines[1].name).toBe('Weissmehl')
    const r = calculate(country.formula)
    expect(grams(levain.lines)).toBeCloseTo(r.levain.total, 6)
  })

  it('leaves out the levain step for a yeasted dough', () => {
    const yeasted: Recipe = { ...country, formula: { ...country.formula, levain: 0, yeast: 0.5 } }
    const g = buildGuide(yeasted, method(), 24)
    expect(ids(g)).not.toContain('levain')
    expect(g.hasYeast).toBe(true)
    expect(g.steps.find((s) => s.id === 'mix')!.lines.map((l) => l.kind)).toContain('yeast')
  })

  it('takes inclusions into the bulk step', () => {
    const g = buildGuide(wholewheat, method(), 24)
    expect(g.hasInclusions).toBe(true)
    expect(g.steps.find((s) => s.id === 'bulk')!.lines.map((l) => l.kind)).toEqual(['inclusion'])
  })

  it('takes the baking times from the vessel', () => {
    const at = (vessel: BakeMethod['vessel']) => buildGuide(country, method({ vessel }), 24).steps
    expect(at('dutch').find((s) => s.id === 'bake')!.minutes).toBe(45)
    expect(at('tin').find((s) => s.id === 'preheat')!.minutes).toBe(30)
    expect(at('pan').find((s) => s.id === 'bake')!.minutes).toBe(25)
  })

  it('cools a focaccia for less time than a loaf', () => {
    const cool = (vessel: BakeMethod['vessel']) => buildGuide(country, method({ vessel }), 24).steps.at(-1)!.minutes
    expect(cool('pan')).toBeLessThan(cool('dutch'))
  })

  it('scales the rises with the kitchen temperature', () => {
    const bulk = (t: number) => buildGuide(country, method(), t).steps.find((s) => s.id === 'bulk')!.minutes
    expect(bulk(20)).toBeGreaterThan(bulk(24))
    expect(bulk(28)).toBeLessThan(bulk(24))
  })

  it('uses the retard length for a cold proof and the temperature-scaled time for room proof', () => {
    const cold = buildGuide(country, method({ proofMode: 'cold' }), 24).steps.find((s) => s.id === 'proof')!
    expect(cold.minutes).toBe(country.schedule.coldRetard)
    const room = buildGuide(country, method({ proofMode: 'room' }), 24).steps.find((s) => s.id === 'proof')!
    expect(room.minutes).toBe(country.schedule.durations.proof)
  })

  it('counts only the folds that fit inside the bulk', () => {
    expect(buildGuide(country, method({ mixing: 'hand' }), 24).folds).toBe(4)
    expect(buildGuide(country, method({ mixing: 'mixer' }), 24).folds).toBe(2)
    // 6 folds every 30 min do not fit in a 2 h bulk (hot kitchen)
    const hot = buildGuide(country, method({ mixing: 'folds' }), 34)
    expect(hot.folds).toBeLessThan(6)
    expect(hot.folds).toBeGreaterThan(0)
  })

  it('skips pre-shape and bench rest for a focaccia', () => {
    const g = buildGuide(focaccia, method({ vessel: 'pan', proofMode: 'room' }), 24)
    expect(ids(g)).not.toContain('preshape')
    expect(ids(g)).not.toContain('benchRest')
    expect(ids(g)).toContain('shape')
  })

  it('reports the loaf count and size, and when the recipe numbers are off', () => {
    const g = buildGuide(country, method(), 24)
    expect(g.loaves).toBe(2)
    expect(g.perLoaf).toBe(900)
    expect(g.ok).toBe(true)
    const bad: Recipe = { ...country, formula: { ...country.formula, hydration: 5, levain: 50 } }
    expect(buildGuide(bad, method(), 24).ok).toBe(false)
  })

  it('falls back to a normal kitchen temperature for a missing value', () => {
    expect(buildGuide(country, method(), Number.NaN).kitchenTemp).toBe(22)
  })
})
