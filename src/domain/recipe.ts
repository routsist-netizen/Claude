import type { RecipeFormula } from './types'

/**
 * Baker's-percentage calculator.
 *
 * Conventions (the same ones most sourdough spreadsheets use):
 * - Every percentage is relative to the TOTAL flour, including the flour
 *   that lives inside the levain. Same for water. So "75% hydration with
 *   20% levain" means the finished dough really is 75% hydration; the
 *   levain's water and flour are subtracted from what you add at the mix.
 * - The target dough weight covers everything that goes in the bowl,
 *   inclusions included.
 *
 * Derivation:
 *   dough = F × (1 + h + s + y + Σinclusions)       (levain is already inside F and W)
 *   ⇒ F = dough / (1 + h + s + y + Σinclusions)
 *   W = F × h,   L = F × levain%
 *   levain flour Lf = L / (1 + levainHydration),  levain water Lw = L − Lf
 *   flour to add = F − Lf,  water to add = W − Lw
 */

export interface Line {
  id: string
  name: string
  grams: number
}

export type IssueCode =
  | 'flourSum'
  | 'noFlour'
  | 'negative'
  | 'loaves'
  | 'levainTooWet'
  | 'levainFlourExceeds'
  | 'levainTooLarge'

export interface Issue {
  code: IssueCode
  /** Values for the message, e.g. the flour name or the current sum. */
  params?: Record<string, string | number>
}

export interface RecipeResult {
  totalDough: number
  doughPerLoaf: number
  totalFlour: number
  totalWater: number
  levain: { total: number; flour: number; water: number }
  /** How to build the levain from a bit of your mother starter. */
  levainBuild: { seed: number; flour: number; water: number }
  /** What actually goes into the bowl at the final mix (levain added whole). */
  mix: {
    flours: Line[]
    water: number
    salt: number
    yeast: number
    inclusions: Line[]
  }
  /** Total flour per type, levain included. */
  flourTotals: Line[]
  issues: Issue[]
  ok: boolean
}

const EPS = 1e-6

export function flourSum(formula: Pick<RecipeFormula, 'flours'>): number {
  return formula.flours.reduce((sum, f) => sum + (Number.isFinite(f.percent) ? f.percent : 0), 0)
}

export function validate(formula: RecipeFormula): Issue[] {
  const issues: Issue[] = []
  if (formula.flours.length === 0) issues.push({ code: 'noFlour' })
  const sum = flourSum(formula)
  if (formula.flours.length > 0 && Math.abs(sum - 100) > 0.01) {
    issues.push({ code: 'flourSum', params: { sum: round(sum, 1) } })
  }
  if (!Number.isInteger(formula.loaves) || formula.loaves < 1) issues.push({ code: 'loaves' })
  const numbers = [
    formula.loafWeight,
    formula.hydration,
    formula.salt,
    formula.levain,
    formula.levainHydration,
    formula.levainFeedRatio,
    formula.yeast,
    ...formula.flours.map((f) => f.percent),
    ...formula.inclusions.map((i) => i.percent),
  ]
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) issues.push({ code: 'negative' })
  return issues
}

export function calculate(formula: RecipeFormula): RecipeResult {
  const issues = validate(formula)
  const pct = (n: number) => (Number.isFinite(n) && n > 0 ? n / 100 : 0)

  const loaves = Math.max(0, Math.floor(formula.loaves) || 0)
  const totalDough = loaves * Math.max(0, formula.loafWeight || 0)

  const h = pct(formula.hydration)
  const s = pct(formula.salt)
  const y = pct(formula.yeast)
  const inc = formula.inclusions.reduce((sum, i) => sum + pct(i.percent), 0)

  const totalFlour = totalDough / (1 + h + s + y + inc)
  const totalWater = totalFlour * h

  const levainTotal = totalFlour * pct(formula.levain)
  const levainFlour = levainTotal / (1 + pct(formula.levainHydration))
  const levainWater = levainTotal - levainFlour

  // Flour shares are normalised so a blend that doesn't (yet) sum to 100%
  // still produces sensible grams while the user is typing.
  const sum = flourSum(formula)
  const share = (p: number) => (sum > 0 ? (Number.isFinite(p) ? Math.max(0, p) : 0) / sum : 0)

  const flourTotals: Line[] = formula.flours.map((f) => ({
    id: f.id,
    name: f.name,
    grams: totalFlour * share(f.percent),
  }))

  // Take the levain flour out of the flour it was built with.
  const fromBlend = formula.levainFlour === 'blend' || !formula.flours.some((f) => f.id === formula.levainFlour)
  const mixFlours: Line[] = flourTotals.map((f) => {
    const inLevain = fromBlend ? levainFlour * (f.grams / (totalFlour || 1)) : f.id === formula.levainFlour ? levainFlour : 0
    return { ...f, grams: f.grams - inLevain }
  })

  const mixWater = totalWater - levainWater

  if (levainTotal > 0 && levainFlour > totalFlour + EPS) {
    issues.push({ code: 'levainTooLarge' })
  } else {
    const short = mixFlours.find((f) => f.grams < -EPS)
    if (short) issues.push({ code: 'levainFlourExceeds', params: { flour: short.name } })
  }
  if (mixWater < -EPS) issues.push({ code: 'levainTooWet' })

  // Levain build: seed (assumed same hydration) : flour : water = 1 : r : r × hydration.
  const r = Math.max(0, formula.levainFeedRatio || 0)
  const lh = pct(formula.levainHydration)
  const seed = levainTotal / (1 + r * (1 + lh))
  const levainBuild = { seed, flour: seed * r, water: seed * r * lh }

  return {
    totalDough,
    doughPerLoaf: loaves > 0 ? totalDough / loaves : 0,
    totalFlour,
    totalWater,
    levain: { total: levainTotal, flour: levainFlour, water: levainWater },
    levainBuild,
    mix: {
      flours: mixFlours,
      water: mixWater,
      salt: totalFlour * s,
      yeast: totalFlour * y,
      inclusions: formula.inclusions.map((i) => ({ id: i.id, name: i.name, grams: totalFlour * pct(i.percent) })),
    },
    flourTotals,
    issues,
    ok: issues.length === 0,
  }
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** Decimals worth showing for a gram amount: one for small amounts (salt, yeast), none otherwise. */
export function gramDigits(n: number): number {
  const abs = Math.abs(n)
  return abs > 0 && abs < 20 ? 1 : 0
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
