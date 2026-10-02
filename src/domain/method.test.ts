import { describe, expect, it } from 'vitest'
import {
  applyMethod,
  bakeMinutes,
  bakeProgram,
  DEFAULT_METHOD,
  FAN_OFFSET,
  methodFromParams,
  methodToParams,
  MIXINGS,
  sanitizeMethod,
  VESSELS,
  type BakeMethod,
} from './method'
import { defaultScheduleSettings } from './schedule'

const method = (over: Partial<BakeMethod> = {}): BakeMethod => ({ ...DEFAULT_METHOD, ...over })

describe('bakeProgram', () => {
  it('preheats the Dutch oven hot and bakes with the lid on first, then off', () => {
    const p = bakeProgram(method())
    expect(p.preheatTemp).toBe(250)
    expect(p.preheatMinutes).toBe(60)
    expect(p.phases[0]).toMatchObject({ lid: true, temp: 240, minutes: 20 })
    expect(p.phases[1].lid).toBeUndefined()
    expect(bakeMinutes(p)).toBe(45)
  })

  it('uses steam, not a lid, for a stone and for a plain tray', () => {
    for (const vessel of ['stone', 'tray'] as const) {
      const p = bakeProgram(method({ vessel }))
      expect(p.phases[0].steam).toBe(true)
      expect(p.phases.some((ph) => ph.lid)).toBe(false)
    }
  })

  it('needs no steam or lid for a tin or a focaccia pan', () => {
    for (const vessel of ['tin', 'pan'] as const) {
      expect(bakeProgram(method({ vessel })).phases.some((ph) => ph.steam || ph.lid)).toBe(false)
    }
  })

  it('bakes a focaccia in one short hot phase', () => {
    const p = bakeProgram(method({ vessel: 'pan' }))
    expect(p.phases).toHaveLength(1)
    expect(bakeMinutes(p)).toBe(25)
  })

  it('lowers every temperature by 20 °C in a fan oven, and nothing else', () => {
    for (const vessel of VESSELS) {
      const still = bakeProgram(method({ vessel, fan: false }))
      const fan = bakeProgram(method({ vessel, fan: true }))
      expect(fan.preheatTemp).toBe(still.preheatTemp - FAN_OFFSET)
      expect(fan.preheatMinutes).toBe(still.preheatMinutes)
      fan.phases.forEach((ph, i) => {
        expect(ph.temp).toBe(still.phases[i].temp - FAN_OFFSET)
        expect(ph.minutes).toBe(still.phases[i].minutes)
      })
    }
  })

  it('drops the temperature in the second phase and never runs hotter than the preheat', () => {
    for (const vessel of VESSELS) {
      const p = bakeProgram(method({ vessel }))
      for (let i = 1; i < p.phases.length; i++) expect(p.phases[i].temp).toBeLessThan(p.phases[i - 1].temp)
      for (const ph of p.phases) expect(ph.temp).toBeLessThanOrEqual(p.preheatTemp)
    }
  })
})

describe('applyMethod', () => {
  const base = defaultScheduleSettings()

  it('sets preheat and bake from the vessel, and does not touch the original settings', () => {
    const out = applyMethod(base, method({ vessel: 'tin' }))
    expect(out.durations.preheat).toBe(30)
    expect(out.durations.bake).toBe(45)
    expect(base.durations.preheat).toBe(60)
    expect(out.durations.bulk).toBe(base.durations.bulk)
  })

  it('needs fewer folds with a mixer and many more without kneading', () => {
    const hand = applyMethod(base, method({ mixing: 'hand' }))
    const mixer = applyMethod(base, method({ mixing: 'mixer' }))
    const folds = applyMethod(base, method({ mixing: 'folds' }))
    expect(mixer.foldCount).toBeLessThan(hand.foldCount)
    expect(folds.foldCount).toBeGreaterThan(hand.foldCount)
    expect(folds.durations.mix).toBeLessThan(hand.durations.mix)
  })

  it('takes the proof mode from the method', () => {
    expect(applyMethod(base, method({ proofMode: 'room' })).proofMode).toBe('room')
  })

  it('leaves the default recipe settings unchanged for a Dutch oven and hand mixing', () => {
    const out = applyMethod(base, method({ vessel: 'dutch', mixing: 'hand', proofMode: base.proofMode }))
    expect(out).toEqual(base)
  })
})

describe('method storage', () => {
  it('sanitises anything into a valid method', () => {
    expect(sanitizeMethod(null)).toEqual(DEFAULT_METHOD)
    expect(sanitizeMethod('x')).toEqual(DEFAULT_METHOD)
    expect(sanitizeMethod({ vessel: 'pizza-oven', mixing: 'mixer', fan: 'yes', proofMode: 'room' })).toEqual({
      vessel: 'dutch',
      mixing: 'mixer',
      fan: false,
      proofMode: 'room',
    })
  })

  it('round-trips through URL parameters', () => {
    for (const vessel of VESSELS) {
      for (const mixing of MIXINGS) {
        const m = method({ vessel, mixing, fan: vessel === 'tin', proofMode: mixing === 'hand' ? 'room' : 'cold' })
        expect(methodFromParams(new URLSearchParams(methodToParams(m)))).toEqual(m)
      }
    }
  })

  it('returns null when the URL has no valid method', () => {
    expect(methodFromParams(new URLSearchParams(''))).toBeNull()
    expect(methodFromParams(new URLSearchParams('vessel=dutch'))).toBeNull()
    expect(methodFromParams(new URLSearchParams('vessel=oops&mixing=hand'))).toBeNull()
  })
})
