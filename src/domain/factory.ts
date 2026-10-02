import { newId } from './recipe'
import { defaultScheduleSettings } from './schedule'
import type { Recipe } from './types'

export function blankRecipe(name: string, flourName: string): Recipe {
  const now = new Date().toISOString()
  const flourId = newId()
  return {
    id: newId(),
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    formula: {
      loaves: 1,
      loafWeight: 900,
      hydration: 72,
      salt: 2,
      levain: 20,
      levainHydration: 100,
      levainFlour: flourId,
      levainFeedRatio: 5,
      yeast: 0,
      flours: [{ id: flourId, name: flourName, percent: 100 }],
      inclusions: [],
    },
    schedule: defaultScheduleSettings(5),
  }
}

/** A copy that belongs to the user: new id, not an example. */
export function copyRecipe(source: Recipe, name: string): Recipe {
  const now = new Date().toISOString()
  const copy = structuredClone(source)
  delete copy.isExample
  return { ...copy, id: newId(), name, createdAt: now, updatedAt: now }
}
