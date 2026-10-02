import { describe, expect, it } from 'vitest'
import { BASE_HYDRATION, FLOUR_KINDS, findFlourKind, nextFlourKind, suggestedHydration } from './flours'
import { EXAMPLE_RECIPES } from './examples'
import { el } from '../i18n/el'

describe('flour catalogue', () => {
  it('has unique ids and a Greek description for every flour', () => {
    expect(new Set(FLOUR_KINDS.map((k) => k.id)).size).toBe(FLOUR_KINDS.length)
    for (const k of FLOUR_KINDS) expect(el.calc.flourInfo[k.id], k.id).toBeTruthy()
  })

  it('includes the Swiss flours bakers buy in Zurich', () => {
    for (const name of ['Weissmehl', 'Halbweissmehl', 'Ruchmehl', 'Vollkornmehl', 'Dinkel-Weissmehl', 'Roggenmehl']) {
      expect(FLOUR_KINDS.map((k) => k.name)).toContain(name)
    }
  })

  it('only references known flours in the examples', () => {
    for (const r of EXAMPLE_RECIPES) for (const f of r.formula.flours) expect(findFlourKind(f.kind), f.kind).toBeDefined()
  })

  it('suggests the next common flour not yet in the blend', () => {
    expect(nextFlourKind([]).id).toBe('weissmehl')
    expect(nextFlourKind([{ kind: 'weissmehl' }]).id).toBe('ruchmehl')
    expect(nextFlourKind([{ kind: 'weissmehl' }, { kind: 'ruchmehl' }]).id).toBe('vollkornmehl')
  })
})

describe('suggestedHydration', () => {
  const part = (kind: string | undefined, percent: number) => ({ id: kind ?? 'x', name: kind ?? 'x', kind, percent })

  it('starts from the white-flour base', () => {
    expect(suggestedHydration([part('weissmehl', 100)])).toBe(BASE_HYDRATION)
  })

  it('asks for more water with bran and rye, less with spelt', () => {
    const ruch = suggestedHydration([part('ruchmehl', 80), part('vollkornmehl', 20)])!
    expect(ruch).toBe(Math.round(70 + 0.8 * 6 + 0.2 * 10)) // 77
    expect(suggestedHydration([part('roggen-vollkorn', 100)])).toBeGreaterThan(ruch)
    expect(suggestedHydration([part('dinkel-weiss', 100)])).toBeLessThan(BASE_HYDRATION)
  })

  it('weights by share even if the blend does not sum to 100 yet', () => {
    expect(suggestedHydration([part('vollkornmehl', 50)])).toBe(80)
  })

  it('treats custom flours as neutral and gives no hint without any catalogue flour', () => {
    expect(suggestedHydration([part('vollkornmehl', 50), part(undefined, 50)])).toBe(75)
    expect(suggestedHydration([part(undefined, 100)])).toBeNull()
    expect(suggestedHydration([])).toBeNull()
  })
})
