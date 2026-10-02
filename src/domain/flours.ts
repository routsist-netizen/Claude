import type { FlourPart } from './types'

/**
 * Flour catalogue, using the names on Swiss supermarket and mill packaging
 * (Migros, Coop, Swissmill…). Names are product names, so they stay in
 * German; the Greek explanation of each lives in the i18n dictionary.
 *
 * `absorption` is a rough hydration adjustment in percentage points
 * relative to plain white flour (Weissmehl): bran and rye drink more water,
 * spelt (Dinkel) less. It only feeds the "suggested hydration" hint.
 */

export type FlourGroup = 'wheat' | 'spelt' | 'rye' | 'other'

export interface FlourKind {
  id: string
  name: string
  group: FlourGroup
  absorption: number
  /** Swatch colour, roughly the colour of the flour. */
  color: string
}

export const FLOUR_KINDS: FlourKind[] = [
  { id: 'weissmehl', name: 'Weissmehl', group: 'wheat', absorption: 0, color: '#f1dfb8' },
  { id: 'halbweissmehl', name: 'Halbweissmehl', group: 'wheat', absorption: 3, color: '#e3c58f' },
  { id: 'ruchmehl', name: 'Ruchmehl', group: 'wheat', absorption: 6, color: '#c49a63' },
  { id: 'vollkornmehl', name: 'Vollkornmehl', group: 'wheat', absorption: 10, color: '#a0703f' },
  { id: 'zopfmehl', name: 'Zopfmehl', group: 'wheat', absorption: -2, color: '#f4e4c4' },
  { id: 'pizzamehl', name: 'Pizzamehl (Tipo 00)', group: 'wheat', absorption: 0, color: '#f7ead0' },
  { id: 'hartweizen', name: 'Hartweizendunst', group: 'wheat', absorption: 3, color: '#e8c86a' },
  { id: 'dinkel-weiss', name: 'Dinkel-Weissmehl', group: 'spelt', absorption: -4, color: '#ecd9b0' },
  { id: 'dinkel-halbweiss', name: 'Dinkel-Halbweissmehl', group: 'spelt', absorption: -2, color: '#dcbd88' },
  { id: 'dinkel-vollkorn', name: 'Dinkel-Vollkornmehl', group: 'spelt', absorption: 4, color: '#9c7448' },
  { id: 'roggenmehl', name: 'Roggenmehl', group: 'rye', absorption: 10, color: '#8f7a68' },
  { id: 'roggen-vollkorn', name: 'Roggen-Vollkornmehl', group: 'rye', absorption: 15, color: '#6e5a4a' },
]

export const FLOUR_GROUPS: FlourGroup[] = ['wheat', 'spelt', 'rye']

/** Hydration that suits plain Weissmehl in a sourdough country loaf. */
export const BASE_HYDRATION = 70

/** Picked in this order when adding another flour to a blend. */
const ADD_ORDER = ['weissmehl', 'ruchmehl', 'vollkornmehl', 'halbweissmehl', 'dinkel-weiss', 'roggenmehl']

export function findFlourKind(id: string | undefined): FlourKind | undefined {
  return id ? FLOUR_KINDS.find((k) => k.id === id) : undefined
}

/** Next sensible flour to add: the first common one not already in the blend. */
export function nextFlourKind(flours: Pick<FlourPart, 'kind'>[]): FlourKind {
  const used = new Set(flours.map((f) => f.kind))
  const id = ADD_ORDER.find((k) => !used.has(k)) ?? 'weissmehl'
  return findFlourKind(id)!
}

/**
 * Rough starting hydration for a blend: the white-flour base plus each
 * flour's absorption, weighted by its share. Null if no flour in the blend
 * comes from the catalogue (nothing to base a suggestion on).
 */
export function suggestedHydration(flours: FlourPart[]): number | null {
  const total = flours.reduce((s, f) => s + Math.max(0, f.percent || 0), 0)
  if (total <= 0 || !flours.some((f) => findFlourKind(f.kind))) return null
  const extra = flours.reduce(
    (s, f) => s + (Math.max(0, f.percent || 0) / total) * (findFlourKind(f.kind)?.absorption ?? 0),
    0,
  )
  return Math.round(BASE_HYDRATION + extra)
}
