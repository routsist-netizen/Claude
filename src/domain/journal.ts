import { newId } from './recipe'
import type { Schedule } from './schedule'
import type { Bake, Recipe, StarterFeeding } from './types'

/** A journal entry pre-filled from a recipe and its planned schedule. */
export function bakeFromSchedule(recipe: Recipe, schedule: Schedule, kitchenTemp: number, now = new Date()): Bake {
  const stamp = now.toISOString()
  return {
    id: newId(),
    date: schedule.end.toISOString(),
    recipeId: recipe.id,
    recipeName: recipe.name,
    snapshot: structuredClone(recipe.formula),
    kitchenTemp,
    proofMode: recipe.schedule.proofMode,
    steps: schedule.steps.map((s) => ({
      key: s.key,
      plannedStart: s.start.toISOString(),
      plannedMinutes: s.minutes,
    })),
    notes: '',
    rating: null,
    photos: [],
    createdAt: stamp,
    updatedAt: stamp,
  }
}

/** Feed ratio as "1:a:b" relative to the seed. */
export function feedingRatio(f: Pick<StarterFeeding, 'seed' | 'flour' | 'water'>): string {
  if (!(f.seed > 0)) return '–'
  const r = (n: number) => String(Math.round((n / f.seed) * 10) / 10)
  return `1:${r(f.flour)}:${r(f.water)}`
}

/** Minutes from feeding to peak, or null if peak isn't logged. */
export function peakMinutes(f: Pick<StarterFeeding, 'fedAt' | 'peakAt'>): number | null {
  if (!f.peakAt) return null
  const m = (new Date(f.peakAt).getTime() - new Date(f.fedAt).getTime()) / 60_000
  return Number.isFinite(m) && m >= 0 ? Math.round(m) : null
}

export function starterHydration(f: Pick<StarterFeeding, 'flour' | 'water'>): number | null {
  return f.flour > 0 ? Math.round((f.water / f.flour) * 100) : null
}
