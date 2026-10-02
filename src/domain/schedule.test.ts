import { describe, expect, it } from 'vitest'
import {
  buildSchedule,
  defaultScheduleSettings,
  effectiveMinutes,
  inoculationFactor,
  isQuiet,
  levainPeakMinutes,
  suggestFixes,
  temperatureFactor,
  yeastFactor,
  type ScheduleInput,
} from './schedule'
import { actionsToEvents, foldLine, toIcs } from './ics'
import type { ScheduleSettings } from './types'

// Tests run with TZ=Europe/Athens (see vite.config.ts); all dates below are local.
const at = (s: string) => new Date(s)

const input = (over: Partial<ScheduleInput> = {}, settings: Partial<ScheduleSettings> = {}): ScheduleInput => ({
  target: at('2026-10-10T12:00:00'),
  kitchenTemp: 24,
  formula: { levain: 20, yeast: 0 },
  settings: { ...defaultScheduleSettings(), ...settings },
  ...over,
})

describe('fermentation model', () => {
  it('is neutral at the reference temperature, levain and no yeast', () => {
    expect(temperatureFactor(24)).toBe(1)
    expect(inoculationFactor(20)).toBe(1)
    expect(yeastFactor(0)).toBe(1)
  })

  it('makes warmer kitchens faster and cooler ones slower', () => {
    expect(temperatureFactor(27)).toBeLessThan(1)
    expect(temperatureFactor(21)).toBeGreaterThan(1)
    // Q10 = 2.5: 10 °C cooler is 2.5× longer
    expect(temperatureFactor(14)).toBeCloseTo(2.5, 9)
    expect(temperatureFactor(34)).toBeCloseTo(0.4, 9)
  })

  it('clamps extreme temperatures', () => {
    expect(temperatureFactor(-5)).toBe(temperatureFactor(10))
    expect(temperatureFactor(50)).toBe(temperatureFactor(35))
  })

  it('speeds up with more levain and with commercial yeast', () => {
    expect(inoculationFactor(10)).toBeGreaterThan(1)
    expect(inoculationFactor(30)).toBeLessThan(1)
    expect(inoculationFactor(0.1)).toBe(2) // clamped
    expect(yeastFactor(1)).toBeCloseTo(0.4, 9)
  })

  it('takes longer for a bigger levain feed', () => {
    expect(levainPeakMinutes(1)).toBe(240)
    expect(levainPeakMinutes(5)).toBeGreaterThan(levainPeakMinutes(2))
    expect(levainPeakMinutes(10)).toBeGreaterThan(levainPeakMinutes(5))
  })

  it('scales only fermentation steps with temperature', () => {
    const warm = effectiveMinutes(input({ kitchenTemp: 27 }, { proofMode: 'room' }))
    const cool = effectiveMinutes(input({ kitchenTemp: 20 }, { proofMode: 'room' }))
    expect(warm.bulk).toBeLessThan(300)
    expect(cool.bulk).toBeGreaterThan(300)
    expect(cool.proof).toBeGreaterThan(warm.proof)
    expect(cool.levain).toBeGreaterThan(warm.levain)
    expect(warm.bake).toBe(45)
    expect(cool.bake).toBe(45)
    expect(warm.autolyse).toBe(cool.autolyse)
  })

  it('uses the fixed retard length for a cold proof and rounds to 5 minutes', () => {
    const m = effectiveMinutes(input({ kitchenTemp: 21 }, { proofMode: 'cold', coldRetard: 600 }))
    expect(m.proof).toBe(600)
    expect(m.bulk % 5).toBe(0)
  })

  it('skips the levain build for a yeasted dough', () => {
    const m = effectiveMinutes(input({ formula: { levain: 0, yeast: 1 } }))
    expect(m.levain).toBe(0)
  })
})

describe('buildSchedule', () => {
  it('works backwards from the target so the bake ends exactly then', () => {
    const s = buildSchedule(input())
    const bake = s.steps.find((x) => x.key === 'bake')!
    expect(bake.end.getTime()).toBe(at('2026-10-10T12:00:00').getTime())
    expect(bake.start.getTime()).toBe(at('2026-10-10T11:15:00').getTime())
    expect(s.end.getTime()).toBe(bake.end.getTime())
  })

  it('chains the main steps without gaps', () => {
    const s = buildSchedule(input())
    const chain = s.steps.filter((x) => !x.parallel)
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].start.getTime()).toBe(chain[i - 1].end.getTime())
    }
    expect(chain.map((x) => x.key)).toEqual(['levain', 'mix', 'bulk', 'preshape', 'benchRest', 'shape', 'proof', 'bake'])
  })

  it('runs autolyse before the mix and preheat before the bake', () => {
    const s = buildSchedule(input())
    const get = (k: string) => s.steps.find((x) => x.key === k)!
    expect(get('autolyse').end.getTime()).toBe(get('mix').start.getTime())
    expect(get('preheat').end.getTime()).toBe(get('bake').start.getTime())
    expect(get('autolyse').parallel).toBe(true)
  })

  it('computes the default cold-retard timeline at 24 °C', () => {
    // bake 45, proof 720 (cold), shape 10, bench 30, preshape 10, bulk 300, mix 15, levain 385
    const s = buildSchedule(input())
    const get = (k: string) => s.steps.find((x) => x.key === k)!
    expect(get('proof').cold).toBe(true)
    expect(get('shape').start.getTime()).toBe(at('2026-10-09T23:05:00').getTime())
    expect(get('mix').start.getTime()).toBe(at('2026-10-09T17:10:00').getTime())
    expect(get('levain').start.getTime()).toBe(at('2026-10-09T10:45:00').getTime())
    expect(s.start.getTime()).toBe(get('levain').start.getTime())
  })

  it('places stretch & folds inside the bulk', () => {
    const s = buildSchedule(input({}, { foldCount: 4, foldInterval: 30 }))
    const bulk = s.steps.find((x) => x.key === 'bulk')!
    const folds = s.actions.filter((a) => a.kind === 'fold')
    expect(folds.map((f) => f.index)).toEqual([1, 2, 3, 4])
    expect(folds[0].at.getTime()).toBe(bulk.start.getTime() + 30 * 60_000)
    for (const f of folds) expect(f.at.getTime()).toBeLessThan(bulk.end.getTime())
  })

  it('drops folds that would fall after the end of bulk', () => {
    const s = buildSchedule(input({ kitchenTemp: 30 }, { foldCount: 20, foldInterval: 30 }))
    const bulk = s.steps.find((x) => x.key === 'bulk')!
    const folds = s.actions.filter((a) => a.kind === 'fold')
    expect(folds.length).toBeLessThan(20)
    expect(folds.at(-1)!.at.getTime()).toBeLessThan(bulk.end.getTime())
  })

  it('omits steps with zero duration (e.g. focaccia without pre-shape)', () => {
    const s = buildSchedule(
      input({}, { durations: { ...defaultScheduleSettings().durations, preshape: 0, benchRest: 0, autolyse: 0 } }),
    )
    const keys = s.steps.map((x) => x.key)
    expect(keys).not.toContain('preshape')
    expect(keys).not.toContain('benchRest')
    expect(keys).not.toContain('autolyse')
    expect(s.actions.map((a) => a.kind)).not.toContain('preshape')
  })

  it('adds a "put in the fridge" action only for a cold proof', () => {
    expect(buildSchedule(input({}, { proofMode: 'cold' })).actions.map((a) => a.kind)).toContain('fridge')
    expect(buildSchedule(input({}, { proofMode: 'room' })).actions.map((a) => a.kind)).not.toContain('fridge')
  })

  it('flags actions that land in the quiet hours', () => {
    // Default cold plan: shaping at 23:05 and fridge at 23:15 are at night.
    const s = buildSchedule(input())
    expect(s.conflicts.map((c) => c.kind)).toEqual(['shape', 'fridge'])
    for (const c of s.conflicts) expect(c.inconvenient).toBe(true)
  })

  it('warns when the kitchen temperature is outside the comfortable range', () => {
    expect(buildSchedule(input({ kitchenTemp: 16 })).tempWarning).toBe(true)
    expect(buildSchedule(input({ kitchenTemp: 22 })).tempWarning).toBe(false)
  })
})

describe('isQuiet', () => {
  it('handles a window that wraps past midnight', () => {
    expect(isQuiet(at('2026-10-10T23:00:00'))).toBe(true)
    expect(isQuiet(at('2026-10-10T02:30:00'))).toBe(true)
    expect(isQuiet(at('2026-10-10T06:59:00'))).toBe(true)
    expect(isQuiet(at('2026-10-10T07:00:00'))).toBe(false)
    expect(isQuiet(at('2026-10-10T22:59:00'))).toBe(false)
  })

  it('handles a daytime window and an empty one', () => {
    expect(isQuiet(at('2026-10-10T13:00:00'), { start: 12, end: 14 })).toBe(true)
    expect(isQuiet(at('2026-10-10T15:00:00'), { start: 12, end: 14 })).toBe(false)
    expect(isQuiet(at('2026-10-10T03:00:00'), { start: 0, end: 0 })).toBe(false)
  })
})

describe('suggestFixes', () => {
  it('returns nothing when the plan is already convenient', () => {
    const ok = input({ target: at('2026-10-10T22:30:00') }, { proofMode: 'room' })
    expect(buildSchedule(ok).conflicts).toHaveLength(0)
    expect(suggestFixes(ok)).toEqual([])
  })

  it('suggests a cold retard for a room-temperature proof that runs into the night', () => {
    // Room proof, bread out at 06:00 → shaping etc. in the small hours.
    const i = input({ target: at('2026-10-10T06:00:00') }, { proofMode: 'room' })
    expect(buildSchedule(i).conflicts.length).toBeGreaterThan(0)
    const cold = suggestFixes(i).find((x) => x.kind === 'cold')
    expect(cold).toBeDefined()
    expect(cold!.conflicts).toBeLessThan(buildSchedule(i).conflicts.length)
  })

  it('suggests a different retard length that clears the night', () => {
    const i = input()
    const fix = suggestFixes(i).find((x) => x.kind === 'retard')
    expect(fix).toBeDefined()
    expect(fix!.conflicts).toBe(0)
    const applied = buildSchedule({ ...i, settings: { ...i.settings, coldRetard: fix!.coldRetard } })
    expect(applied.conflicts).toHaveLength(0)
    expect(applied.end.getTime()).toBe(i.target.getTime())
  })

  it('suggests the smallest shift of the bake time that clears the night', () => {
    const i = input({}, { proofMode: 'room' })
    i.target = at('2026-10-10T03:00:00')
    const shift = suggestFixes(i).find((x) => x.kind === 'shift')
    expect(shift).toBeDefined()
    if (shift?.kind !== 'shift') throw new Error('expected shift')
    expect(buildSchedule({ ...i, target: shift.target }).conflicts).toHaveLength(0)
    // No smaller shift works.
    for (let m = 15; m < Math.abs(shift.offsetMinutes); m += 15) {
      for (const o of [m, -m]) {
        const t = new Date(i.target.getTime() + o * 60_000)
        expect(buildSchedule({ ...i, target: t }).conflicts.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('ics export', () => {
  it('writes a valid calendar with one event and alarm per action', () => {
    const s = buildSchedule(input())
    const events = actionsToEvents(s.actions, (a) => `Βήμα: ${a.kind}`, 'bake1')
    const ics = toIcs(events, 'Ψήσιμο; δοκιμή', new Date(Date.UTC(2026, 9, 1)))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(s.actions.length)
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(s.actions.length)
    expect(ics).toContain('X-WR-CALNAME:Ψήσιμο\\; δοκιμή')
    // Bake ends 12:00 Athens (UTC+3 in October) = 09:00Z
    expect(ics).toContain('DTSTART:20261010T090000Z')
  })

  it('folds long lines at 75 octets without breaking multi-byte characters', () => {
    const line = 'SUMMARY:' + 'Ζύμωμα '.repeat(30)
    const folded = foldLine(line)
    const enc = new TextEncoder()
    for (const part of folded.split('\r\n')) expect(enc.encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.split('\r\n').map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line)
  })
})
