import { describe, expect, it } from 'vitest'
import { calculate, flourSum, gramDigits, validate } from './recipe'
import type { RecipeFormula } from './types'

const base = (over: Partial<RecipeFormula> = {}): RecipeFormula => ({
  loaves: 1,
  loafWeight: 1000,
  hydration: 75,
  salt: 2,
  levain: 20,
  levainHydration: 100,
  levainFlour: 'bread',
  levainFeedRatio: 5,
  yeast: 0,
  flours: [{ id: 'bread', name: 'Bread', percent: 100 }],
  inclusions: [],
  ...over,
})

const sumAll = (r: ReturnType<typeof calculate>) =>
  r.mix.flours.reduce((s, f) => s + f.grams, 0) +
  r.mix.water +
  r.mix.salt +
  r.mix.yeast +
  r.mix.inclusions.reduce((s, i) => s + i.grams, 0) +
  r.levain.total

describe('calculate', () => {
  it('derives total flour from dough weight and percentages', () => {
    const r = calculate(base())
    // 1000 / (1 + 0.75 + 0.02) = 564.97
    expect(r.totalFlour).toBeCloseTo(564.97, 2)
    expect(r.totalWater).toBeCloseTo(564.97 * 0.75, 2)
    expect(r.ok).toBe(true)
  })

  it('splits the levain into flour and water by its hydration', () => {
    const r = calculate(base())
    expect(r.levain.total).toBeCloseTo(r.totalFlour * 0.2, 6)
    expect(r.levain.flour).toBeCloseTo(r.levain.total / 2, 6)
    expect(r.levain.water).toBeCloseTo(r.levain.total / 2, 6)

    const stiff = calculate(base({ levainHydration: 50 }))
    expect(stiff.levain.flour).toBeCloseTo(stiff.levain.total / 1.5, 6)
    expect(stiff.levain.water).toBeCloseTo(stiff.levain.total * (0.5 / 1.5), 6)
  })

  it('subtracts levain flour and water so the final hydration is exact', () => {
    const r = calculate(base())
    const flourAdded = r.mix.flours[0].grams
    expect(flourAdded + r.levain.flour).toBeCloseTo(r.totalFlour, 6)
    expect(r.mix.water + r.levain.water).toBeCloseTo(r.totalWater, 6)
    const hydration = (r.mix.water + r.levain.water) / (flourAdded + r.levain.flour)
    expect(hydration).toBeCloseTo(0.75, 9)
  })

  it('makes all ingredients add up to the target dough weight', () => {
    const r = calculate(
      base({
        loaves: 3,
        loafWeight: 850,
        yeast: 0.3,
        inclusions: [
          { id: 's', name: 'Seeds', percent: 10 },
          { id: 'n', name: 'Nuts', percent: 5 },
        ],
      }),
    )
    expect(r.totalDough).toBe(2550)
    expect(r.doughPerLoaf).toBe(850)
    expect(sumAll(r)).toBeCloseTo(2550, 6)
    expect(r.mix.inclusions[0].grams).toBeCloseTo(r.totalFlour * 0.1, 6)
    expect(r.mix.yeast).toBeCloseTo(r.totalFlour * 0.003, 6)
  })

  it('splits a flour blend by percentage and takes levain flour from the chosen flour', () => {
    const r = calculate(
      base({
        flours: [
          { id: 'bread', name: 'Bread', percent: 80 },
          { id: 'ww', name: 'Whole wheat', percent: 20 },
        ],
        levainFlour: 'bread',
      }),
    )
    const [bread, ww] = r.flourTotals
    expect(bread.grams).toBeCloseTo(r.totalFlour * 0.8, 6)
    expect(ww.grams).toBeCloseTo(r.totalFlour * 0.2, 6)
    expect(r.mix.flours[0].grams).toBeCloseTo(bread.grams - r.levain.flour, 6)
    expect(r.mix.flours[1].grams).toBeCloseTo(ww.grams, 6)
  })

  it("spreads levain flour across the blend when it's fed with the blend", () => {
    const r = calculate(
      base({
        flours: [
          { id: 'bread', name: 'Bread', percent: 80 },
          { id: 'ww', name: 'Whole wheat', percent: 20 },
        ],
        levainFlour: 'blend',
      }),
    )
    expect(r.mix.flours[0].grams).toBeCloseTo((r.totalFlour - r.levain.flour) * 0.8, 6)
    expect(r.mix.flours[1].grams).toBeCloseTo((r.totalFlour - r.levain.flour) * 0.2, 6)
  })

  it('works without levain (yeasted dough)', () => {
    const r = calculate(base({ levain: 0, yeast: 1 }))
    expect(r.levain.total).toBe(0)
    expect(r.mix.flours[0].grams).toBeCloseTo(r.totalFlour, 6)
    expect(r.levainBuild.seed).toBe(0)
    expect(r.ok).toBe(true)
  })

  it('computes a levain build from the feed ratio', () => {
    const r = calculate(base({ levainFeedRatio: 5, levainHydration: 100 }))
    // 1 : 5 : 5 → seed is 1/11 of the levain
    expect(r.levainBuild.seed).toBeCloseTo(r.levain.total / 11, 6)
    expect(r.levainBuild.flour).toBeCloseTo(r.levainBuild.seed * 5, 6)
    expect(r.levainBuild.water).toBeCloseTo(r.levainBuild.seed * 5, 6)
    const total = r.levainBuild.seed + r.levainBuild.flour + r.levainBuild.water
    expect(total).toBeCloseTo(r.levain.total, 6)
  })

  it('flags a levain that brings more water than the whole dough has', () => {
    const r = calculate(base({ hydration: 10, levain: 40, levainHydration: 100 }))
    expect(r.issues.map((i) => i.code)).toContain('levainTooWet')
    expect(r.ok).toBe(false)
  })

  it('flags when the chosen levain flour is a too-small part of the blend', () => {
    const r = calculate(
      base({
        flours: [
          { id: 'bread', name: 'Bread', percent: 95 },
          { id: 'rye', name: 'Rye', percent: 5 },
        ],
        levainFlour: 'rye',
        levain: 30,
      }),
    )
    expect(r.issues).toContainEqual({ code: 'levainFlourExceeds', params: { flour: 'Rye' } })
  })

  it('returns zeros, not NaN, for an empty dough', () => {
    const r = calculate(base({ loaves: 0 }))
    expect(r.totalFlour).toBe(0)
    expect(r.doughPerLoaf).toBe(0)
    expect(Number.isNaN(r.mix.water)).toBe(false)
    expect(r.issues.map((i) => i.code)).toContain('loaves')
  })
})

describe('validate', () => {
  it('requires the flour blend to sum to 100%', () => {
    const f = base({
      flours: [
        { id: 'a', name: 'A', percent: 70 },
        { id: 'b', name: 'B', percent: 20 },
      ],
    })
    expect(flourSum(f)).toBe(90)
    expect(validate(f)).toContainEqual({ code: 'flourSum', params: { sum: 90 } })
  })

  it('accepts tiny rounding differences in the blend', () => {
    const f = base({
      flours: [
        { id: 'a', name: 'A', percent: 33.333 },
        { id: 'b', name: 'B', percent: 33.333 },
        { id: 'c', name: 'C', percent: 33.334 },
      ],
    })
    expect(validate(f)).toEqual([])
  })

  it('rejects negative and non-numeric values', () => {
    expect(validate(base({ salt: -1 })).map((i) => i.code)).toContain('negative')
    expect(validate(base({ hydration: Number.NaN })).map((i) => i.code)).toContain('negative')
  })

  it('requires at least one flour and a whole number of loaves', () => {
    expect(validate(base({ flours: [] })).map((i) => i.code)).toContain('noFlour')
    expect(validate(base({ loaves: 1.5 })).map((i) => i.code)).toContain('loaves')
  })
})

describe('gramDigits', () => {
  it('shows a decimal only for small amounts', () => {
    expect(gramDigits(11.3)).toBe(1)
    expect(gramDigits(450)).toBe(0)
    expect(gramDigits(0)).toBe(0)
  })
})
