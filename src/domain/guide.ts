import { calculate } from './recipe'
import { applyMethod, bakeProgram, type BakeMethod, type BakeProgram } from './method'
import { effectiveMinutes } from './schedule'
import type { Recipe, StepKey } from './types'

/**
 * Step-by-step baking guide: the recipe's real quantities and the schedule
 * engine's temperature-adjusted durations, arranged for a chosen method.
 * Pure data; the wording lives in the i18n dictionary.
 */

export type GuideStepId = StepKey | 'cool'

export interface GuideLine {
  kind: 'seed' | 'levainFlour' | 'water' | 'flour' | 'levain' | 'salt' | 'yeast' | 'inclusion'
  /** Flour or inclusion name; the other kinds are named by the UI. */
  name?: string
  grams: number
}

export interface GuideStep {
  id: GuideStepId
  minutes: number
  /** What to weigh out for this step. */
  lines: GuideLine[]
}

export interface Guide {
  method: BakeMethod
  program: BakeProgram
  kitchenTemp: number
  loaves: number
  perLoaf: number
  /** Stretch & folds that fit inside the bulk. */
  folds: number
  foldInterval: number
  hasInclusions: boolean
  hasYeast: boolean
  /** Whether the flour and water rest on their own before the levain goes in. */
  autolyse: boolean
  steps: GuideStep[]
  /** False if the recipe's numbers don't add up (see the calculator). */
  ok: boolean
}

/** Cooling time before cutting: a loaf needs about an hour, a focaccia much less. */
export const COOL_MINUTES = { loaf: 60, pan: 20 } as const

export function buildGuide(recipe: Recipe, method: BakeMethod, kitchenTemp: number): Guide {
  const f = recipe.formula
  const settings = applyMethod(recipe.schedule, method)
  const temp = Number.isFinite(kitchenTemp) ? kitchenTemp : 22
  const minutes = effectiveMinutes({ kitchenTemp: temp, formula: f, settings })
  const r = calculate(f)

  const interval = Math.max(5, settings.foldInterval)
  let folds = 0
  for (let i = 1; i <= settings.foldCount && i * interval < minutes.bulk; i++) folds++

  const levainFlourName = f.flours.find((x) => x.id === f.levainFlour)?.name
  const levainLines: GuideLine[] =
    r.levain.total > 0
      ? [
          { kind: 'seed', grams: r.levainBuild.seed },
          { kind: 'levainFlour', name: levainFlourName, grams: r.levainBuild.flour },
          { kind: 'water', grams: r.levainBuild.water },
        ]
      : []
  const flourLines: GuideLine[] = r.mix.flours.map((x) => ({ kind: 'flour', name: x.name, grams: x.grams }))
  const waterLine: GuideLine = { kind: 'water', grams: r.mix.water }
  const rest: GuideLine[] = [
    ...(r.levain.total > 0 ? [{ kind: 'levain', grams: r.levain.total } as GuideLine] : []),
    { kind: 'salt', grams: r.mix.salt },
    ...(r.mix.yeast > 0 ? [{ kind: 'yeast', grams: r.mix.yeast } as GuideLine] : []),
  ]
  const inclusionLines: GuideLine[] = r.mix.inclusions.map((x) => ({ kind: 'inclusion', name: x.name, grams: x.grams }))

  const autolyse = minutes.autolyse > 0
  const steps: GuideStep[] = []
  const add = (id: StepKey, lines: GuideLine[] = []) => {
    if (minutes[id] > 0) steps.push({ id, minutes: minutes[id], lines })
  }
  add('levain', levainLines)
  add('autolyse', [...flourLines, waterLine])
  // The mix, preheat, bake and cooling always appear: they're where the ingredients and the oven are.
  steps.push({ id: 'mix', minutes: minutes.mix, lines: autolyse ? rest : [...flourLines, waterLine, ...rest] })
  add('bulk', inclusionLines)
  add('preshape')
  add('benchRest')
  add('shape')
  add('proof')
  steps.push({ id: 'preheat', minutes: minutes.preheat, lines: [] })
  steps.push({ id: 'bake', minutes: minutes.bake, lines: [] })
  steps.push({ id: 'cool', minutes: method.vessel === 'pan' ? COOL_MINUTES.pan : COOL_MINUTES.loaf, lines: [] })

  return {
    method,
    program: bakeProgram(method),
    kitchenTemp: temp,
    loaves: Math.max(1, Math.floor(f.loaves) || 1),
    perLoaf: r.doughPerLoaf,
    folds,
    foldInterval: interval,
    hasInclusions: f.inclusions.length > 0,
    hasYeast: f.yeast > 0,
    autolyse,
    steps,
    ok: r.ok,
  }
}
