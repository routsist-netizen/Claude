import type { ProofMode, RecipeFormula, ScheduleSettings, StepKey } from './types'

/**
 * Backwards baking schedule.
 *
 * ## Fermentation model
 *
 * Yeast and lactic bacteria work faster when warm. Over the range a home
 * kitchen sees (~18–30 °C) their activity roughly follows the classic
 * "Q10" rule: every +10 °C multiplies the rate by Q10. For sourdough a Q10
 * around 2.5 matches common baker experience (a 5 h bulk at 24 °C becomes
 * ~6.6 h at 21 °C and ~3.8 h at 27 °C). Time is the inverse of rate, so:
 *
 *     duration(T) = baseDuration × Q10 ^ ((T_ref − T) / 10),   T_ref = 24 °C
 *
 * Base durations (editable per recipe) describe a "standard" dough at
 * 24 °C with 20 % levain and no commercial yeast. Two more factors adapt
 * them to the actual recipe:
 *
 * - Inoculation: more levain = more yeast from the start = faster.
 *   factor = (20 / levain%) ^ 0.35, clamped to [0.6, 2]
 *   (10 % levain → ~1.27× longer, 30 % → ~0.87×).
 * - Commercial yeast: factor = 1 / (1 + 1.5 × yeast%)
 *   (0.2 % → ~0.77×, 1 % → 0.4×).
 *
 * Which steps scale:
 * - levain build, bulk, room-temperature proof: temperature (+ inoculation
 *   and yeast for bulk and proof; the levain build already has its own feed).
 * - autolyse, mix, shaping, bench rest, preheat, bake: fixed clock times.
 * - cold retard: fixed length; at ~4 °C fermentation nearly stops, so
 *   the window is flexible, which is exactly why it's useful for planning.
 *
 * This is a heuristic. Dough temperature, flour and starter vigour all
 * matter, which is why every base duration can be tweaked, and why the
 * journal records what actually happened.
 */

export const REFERENCE_TEMP = 24
export const DEFAULT_Q10 = 2.5
export const REFERENCE_LEVAIN = 20
/** Kitchen temperatures outside this range are clamped; the model isn't meaningful beyond it. */
export const TEMP_RANGE = { min: 10, max: 35 } as const
/** Comfortable range: outside it the schedule warns that the estimate is rough. */
export const COMFORT_RANGE = { min: 18, max: 30 } as const

/** Main chain of steps, in order. Autolyse and preheat run in parallel with it. */
export const STEP_ORDER: StepKey[] = [
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
]

type Scaling = 'levain' | 'dough' | 'fixed'

const SCALING: Record<StepKey, Scaling> = {
  levain: 'levain',
  autolyse: 'fixed',
  mix: 'fixed',
  bulk: 'dough',
  preshape: 'fixed',
  benchRest: 'fixed',
  shape: 'fixed',
  proof: 'dough',
  preheat: 'fixed',
  bake: 'fixed',
}

export type ActionKind =
  | 'feed'
  | 'autolyse'
  | 'mix'
  | 'fold'
  | 'preshape'
  | 'shape'
  | 'fridge'
  | 'preheat'
  | 'bake'
  | 'done'

export interface ScheduledAction {
  kind: ActionKind
  at: Date
  /** 1-based fold number for `fold`. */
  index?: number
  /** True if it falls inside the quiet hours. */
  inconvenient: boolean
}

export interface ScheduledStep {
  key: StepKey
  start: Date
  end: Date
  minutes: number
  /** Runs alongside the main chain (autolyse, preheat). */
  parallel: boolean
  /** True for a cold-retard proof. */
  cold: boolean
}

export interface QuietHours {
  /** Hour of day (0–24) the quiet window starts, e.g. 23. */
  start: number
  /** Hour of day it ends, e.g. 7. */
  end: number
}

export const DEFAULT_QUIET: QuietHours = { start: 23, end: 7 }

export interface ScheduleInput {
  /** When the bread should come out of the oven. */
  target: Date
  kitchenTemp: number
  formula: Pick<RecipeFormula, 'levain' | 'yeast'>
  settings: ScheduleSettings
  quiet?: QuietHours
  q10?: number
}

export interface Schedule {
  steps: ScheduledStep[]
  actions: ScheduledAction[]
  conflicts: ScheduledAction[]
  start: Date
  end: Date
  /** Temperature outside the comfortable range: estimate is rough. */
  tempWarning: boolean
  factors: { temperature: number; levain: number; dough: number }
}

const MIN = 60_000

export function round5(n: number): number {
  return Math.max(0, Math.round(n / 5) * 5)
}

export function temperatureFactor(tempC: number, q10 = DEFAULT_Q10): number {
  const t = Math.min(TEMP_RANGE.max, Math.max(TEMP_RANGE.min, tempC))
  return Math.pow(q10, (REFERENCE_TEMP - t) / 10)
}

export function inoculationFactor(levainPercent: number): number {
  if (!(levainPercent > 0)) return 1
  return Math.min(2, Math.max(0.6, Math.pow(REFERENCE_LEVAIN / levainPercent, 0.35)))
}

export function yeastFactor(yeastPercent: number): number {
  return yeastPercent > 0 ? 1 / (1 + 1.5 * yeastPercent) : 1
}

/**
 * Rough time for a levain to peak at the reference temperature, given a
 * 1 : r : r feed. A bigger feed has to grow through more fresh flour, so
 * it takes longer: ~4 h at 1:1:1, ~6.5 h at 1:5:5, ~7.7 h at 1:10:10.
 */
export function levainPeakMinutes(feedRatio: number): number {
  const r = Math.max(0, feedRatio)
  return round5((2.5 + 1.5 * Math.log2(r + 1)) * 60)
}

export function defaultScheduleSettings(feedRatio = 5): ScheduleSettings {
  return {
    durations: {
      levain: levainPeakMinutes(feedRatio),
      autolyse: 60,
      mix: 15,
      bulk: 300,
      preshape: 10,
      benchRest: 30,
      shape: 10,
      proof: 120,
      preheat: 60,
      bake: 45,
    },
    foldCount: 4,
    foldInterval: 30,
    proofMode: 'cold',
    coldRetard: 12 * 60,
  }
}

/** Effective minutes for each step at the given temperature and recipe. */
export function effectiveMinutes(
  input: Pick<ScheduleInput, 'kitchenTemp' | 'formula' | 'settings' | 'q10'>,
): Record<StepKey, number> {
  const tf = temperatureFactor(input.kitchenTemp, input.q10)
  const doughFactor = tf * inoculationFactor(input.formula.levain) * yeastFactor(input.formula.yeast)
  const out = {} as Record<StepKey, number>
  for (const key of STEP_ORDER) {
    const base = Math.max(0, input.settings.durations[key] ?? 0)
    const scaling = SCALING[key]
    let minutes = base
    if (scaling === 'levain') minutes = base * tf
    else if (scaling === 'dough') minutes = base * doughFactor
    if (key === 'proof' && input.settings.proofMode === 'cold') minutes = Math.max(0, input.settings.coldRetard)
    // A levain of 0 % means a yeasted dough: no levain to build.
    if (key === 'levain' && !(input.formula.levain > 0)) minutes = 0
    out[key] = round5(minutes)
  }
  return out
}

export function isQuiet(date: Date, quiet: QuietHours = DEFAULT_QUIET): boolean {
  const h = date.getHours() + date.getMinutes() / 60
  if (quiet.start === quiet.end) return false
  return quiet.start > quiet.end ? h >= quiet.start || h < quiet.end : h >= quiet.start && h < quiet.end
}

const addMin = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MIN)

export function buildSchedule(input: ScheduleInput): Schedule {
  const quiet = input.quiet ?? DEFAULT_QUIET
  const minutes = effectiveMinutes(input)
  const { settings } = input
  const cold = settings.proofMode === 'cold'

  // Walk the main chain backwards from the target time.
  const chain: StepKey[] = ['levain', 'mix', 'bulk', 'preshape', 'benchRest', 'shape', 'proof', 'bake']
  const spans = new Map<StepKey, { start: Date; end: Date }>()
  let cursor = input.target
  for (let i = chain.length - 1; i >= 0; i--) {
    const key = chain[i]
    const start = addMin(cursor, -minutes[key])
    spans.set(key, { start, end: cursor })
    cursor = start
  }
  // Parallel steps end where their chain partner starts.
  const mixStart = spans.get('mix')!.start
  const bakeStart = spans.get('bake')!.start
  spans.set('autolyse', { start: addMin(mixStart, -minutes.autolyse), end: mixStart })
  spans.set('preheat', { start: addMin(bakeStart, -minutes.preheat), end: bakeStart })

  const steps: ScheduledStep[] = STEP_ORDER.filter((key) => minutes[key] > 0).map((key) => ({
    key,
    ...spans.get(key)!,
    minutes: minutes[key],
    parallel: key === 'autolyse' || key === 'preheat',
    cold: key === 'proof' && cold,
  }))

  const actions: Omit<ScheduledAction, 'inconvenient'>[] = []
  const at = (key: StepKey) => (minutes[key] > 0 ? spans.get(key)!.start : null)
  const push = (kind: ActionKind, date: Date | null, index?: number) => {
    if (date) actions.push(index ? { kind, at: date, index } : { kind, at: date })
  }
  push('feed', at('levain'))
  push('autolyse', at('autolyse'))
  push('mix', at('mix'))
  if (minutes.bulk > 0) {
    const bulk = spans.get('bulk')!
    const interval = Math.max(5, settings.foldInterval)
    for (let i = 1; i <= settings.foldCount; i++) {
      const t = addMin(bulk.start, i * interval)
      if (t.getTime() >= bulk.end.getTime()) break
      push('fold', t, i)
    }
  }
  push('preshape', at('preshape'))
  push('shape', at('shape'))
  if (cold && minutes.proof > 0) push('fridge', spans.get('proof')!.start)
  push('preheat', at('preheat'))
  push('bake', at('bake'))
  push('done', input.target)

  const full = actions
    .map((a) => ({ ...a, inconvenient: isQuiet(a.at, quiet) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  const tf = temperatureFactor(input.kitchenTemp, input.q10)
  return {
    steps: steps.sort((a, b) => a.start.getTime() - b.start.getTime() || Number(a.parallel) - Number(b.parallel)),
    actions: full,
    conflicts: full.filter((a) => a.inconvenient),
    start: new Date(Math.min(...steps.map((s) => s.start.getTime()), input.target.getTime())),
    end: input.target,
    tempWarning: input.kitchenTemp < COMFORT_RANGE.min || input.kitchenTemp > COMFORT_RANGE.max,
    factors: {
      temperature: tf,
      levain: inoculationFactor(input.formula.levain),
      dough: tf * inoculationFactor(input.formula.levain) * yeastFactor(input.formula.yeast),
    },
  }
}

export type Suggestion =
  | { kind: 'cold'; coldRetard: number; conflicts: number }
  | { kind: 'retard'; coldRetard: number; conflicts: number }
  | { kind: 'shift'; target: Date; offsetMinutes: number; conflicts: number }

/** Allowed cold-retard window when searching for a better plan. */
export const RETARD_RANGE = { min: 8 * 60, max: 18 * 60 } as const

/**
 * Ways to get the inconvenient steps out of the night:
 * 1. Switch a room-temperature proof to a cold retard (or, if already
 *    cold, change the retard length within 8–18 h). The bake time stays put.
 * 2. Shift the out-of-oven time by the smallest amount that clears the night.
 * Only suggestions that reduce the number of conflicts are returned.
 */
export function suggestFixes(input: ScheduleInput): Suggestion[] {
  const current = buildSchedule(input).conflicts.length
  if (current === 0) return []
  const out: Suggestion[] = []
  const withSettings = (patch: Partial<ScheduleSettings>) =>
    buildSchedule({ ...input, settings: { ...input.settings, ...patch } }).conflicts.length

  // Retard lengths, nearest to the current (or default 12 h) first.
  const pivot = input.settings.proofMode === 'cold' ? input.settings.coldRetard : 12 * 60
  const lengths: number[] = []
  for (let m = RETARD_RANGE.min; m <= RETARD_RANGE.max; m += 30) lengths.push(m)
  lengths.sort((a, b) => Math.abs(a - pivot) - Math.abs(b - pivot))
  let best: { coldRetard: number; conflicts: number } | null = null
  for (const coldRetard of lengths) {
    if (input.settings.proofMode === 'cold' && coldRetard === input.settings.coldRetard) continue
    const conflicts = withSettings({ proofMode: 'cold' as ProofMode, coldRetard })
    if (!best || conflicts < best.conflicts) best = { coldRetard, conflicts }
    if (conflicts === 0) break
  }
  if (best && best.conflicts < current) {
    out.push({ kind: input.settings.proofMode === 'cold' ? 'retard' : 'cold', ...best })
  }

  // Smallest shift of the target time (15-min steps, up to ±12 h).
  for (let step = 15; step <= 12 * 60; step += 15) {
    const found = [step, -step].find(
      (offset) => buildSchedule({ ...input, target: addMin(input.target, offset) }).conflicts.length === 0,
    )
    if (found !== undefined) {
      out.push({ kind: 'shift', target: addMin(input.target, found), offsetMinutes: found, conflicts: 0 })
      break
    }
  }
  return out
}
