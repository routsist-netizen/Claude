import type { ProofMode, ScheduleSettings } from './types'

/**
 * "How will I bake it?": the vessel, the way the dough is mixed, the kind
 * of oven and where the last rise happens. The choice decides the oven
 * program (temperatures, steam, lid) and the mixing/folding times, and is
 * applied on top of a recipe's own schedule settings.
 */

export type Vessel = 'dutch' | 'stone' | 'tray' | 'tin' | 'pan'
export type Mixing = 'hand' | 'mixer' | 'folds'

export interface BakeMethod {
  vessel: Vessel
  mixing: Mixing
  /** Fan-assisted oven (Umluft / αερόθερμος). */
  fan: boolean
  proofMode: ProofMode
}

export const VESSELS: Vessel[] = ['dutch', 'stone', 'tray', 'tin', 'pan']
export const MIXINGS: Mixing[] = ['hand', 'mixer', 'folds']

export const DEFAULT_METHOD: BakeMethod = { vessel: 'dutch', mixing: 'hand', fan: false, proofMode: 'cold' }

/** A fan oven moves hot air around, so it bakes hotter than the dial says: set it lower. */
export const FAN_OFFSET = 20

export interface BakePhase {
  temp: number
  minutes: number
  /** Lid on (Dutch oven). */
  lid?: boolean
  /** Steam in the oven during this phase. */
  steam?: boolean
}

export interface BakeProgram {
  preheatTemp: number
  preheatMinutes: number
  phases: BakePhase[]
}

/** Programs for a conventional (top/bottom heat) oven. */
const PROGRAMS: Record<Vessel, BakeProgram> = {
  // The pot is preheated with the lid; its trapped steam gives the crust.
  dutch: {
    preheatTemp: 250,
    preheatMinutes: 60,
    phases: [
      { temp: 240, minutes: 20, lid: true },
      { temp: 220, minutes: 25 },
    ],
  },
  // The stone stores heat; steam comes from hot water in a tray below.
  stone: {
    preheatTemp: 250,
    preheatMinutes: 60,
    phases: [
      { temp: 240, minutes: 15, steam: true },
      { temp: 220, minutes: 25 },
    ],
  },
  // A thin tray holds little heat, so a shorter preheat and a slightly cooler bake.
  tray: {
    preheatTemp: 240,
    preheatMinutes: 30,
    phases: [
      { temp: 230, minutes: 15, steam: true },
      { temp: 210, minutes: 25 },
    ],
  },
  tin: {
    preheatTemp: 230,
    preheatMinutes: 30,
    phases: [
      { temp: 230, minutes: 15 },
      { temp: 210, minutes: 30 },
    ],
  },
  // Oiled pan, thin dough: one hot, quick bake.
  pan: { preheatTemp: 230, preheatMinutes: 30, phases: [{ temp: 230, minutes: 25 }] },
}

export function bakeProgram(method: Pick<BakeMethod, 'vessel' | 'fan'>): BakeProgram {
  const p = PROGRAMS[method.vessel]
  const off = method.fan ? FAN_OFFSET : 0
  return {
    preheatTemp: p.preheatTemp - off,
    preheatMinutes: p.preheatMinutes,
    phases: p.phases.map((ph) => ({ ...ph, temp: ph.temp - off })),
  }
}

export function bakeMinutes(program: BakeProgram): number {
  return program.phases.reduce((s, p) => s + p.minutes, 0)
}

/**
 * Mixing sets how long the mix takes and how much folding the bulk needs:
 * a mixer builds strength itself (fewer folds), a no-knead dough is only
 * stirred together and gets its strength from many folds.
 */
const MIXING: Record<Mixing, { mix: number; foldCount: number; foldInterval: number }> = {
  hand: { mix: 15, foldCount: 4, foldInterval: 30 },
  mixer: { mix: 10, foldCount: 2, foldInterval: 45 },
  folds: { mix: 5, foldCount: 6, foldInterval: 30 },
}

/** The recipe's schedule settings with the method's mixing, folding, preheat, bake and proof applied. */
export function applyMethod(settings: ScheduleSettings, method: BakeMethod): ScheduleSettings {
  const program = bakeProgram(method)
  const m = MIXING[method.mixing]
  return {
    ...settings,
    durations: { ...settings.durations, mix: m.mix, preheat: program.preheatMinutes, bake: bakeMinutes(program) },
    foldCount: m.foldCount,
    foldInterval: m.foldInterval,
    proofMode: method.proofMode,
  }
}

/** Make any stored value into a valid method (older or hand-edited data falls back to defaults). */
export function sanitizeMethod(raw: unknown): BakeMethod {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    vessel: VESSELS.includes(o.vessel as Vessel) ? (o.vessel as Vessel) : DEFAULT_METHOD.vessel,
    mixing: MIXINGS.includes(o.mixing as Mixing) ? (o.mixing as Mixing) : DEFAULT_METHOD.mixing,
    fan: o.fan === true,
    proofMode: o.proofMode === 'room' || o.proofMode === 'cold' ? o.proofMode : DEFAULT_METHOD.proofMode,
  }
}

/** URL form, used to carry the choice from the guide to the schedule. */
export function methodToParams(m: BakeMethod): Record<string, string> {
  return { vessel: m.vessel, mixing: m.mixing, fan: m.fan ? '1' : '0', proof: m.proofMode }
}

/** The method in the URL, or null if the URL doesn't carry a (valid) one. */
export function methodFromParams(p: URLSearchParams): BakeMethod | null {
  const vessel = p.get('vessel')
  const mixing = p.get('mixing')
  if (!VESSELS.includes(vessel as Vessel) || !MIXINGS.includes(mixing as Mixing)) return null
  return {
    vessel: vessel as Vessel,
    mixing: mixing as Mixing,
    fan: p.get('fan') === '1',
    proofMode: p.get('proof') === 'room' ? 'room' : 'cold',
  }
}
