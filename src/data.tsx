import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Collection, type CollectionTypes } from './api'
import { EXAMPLE_RECIPES } from './domain/examples'
import type { Bake, Recipe, StarterFeeding } from './domain/types'

/**
 * All of a user's data, loaded once after login and kept in memory.
 * A home baker has tens of records, not thousands, so this keeps every
 * screen instant and the code simple.
 */
interface DataState {
  loading: boolean
  error: string | null
  recipes: Recipe[]
  bakes: Bake[]
  starter: StarterFeeding[]
  /** User recipes followed by the built-in examples. */
  allRecipes: Recipe[]
  findRecipe: (id: string | undefined | null) => Recipe | undefined
  save: <C extends Collection>(c: C, item: CollectionTypes[C], isNew?: boolean) => Promise<CollectionTypes[C]>
  remove: (c: Collection, id: string) => Promise<void>
}

const Ctx = createContext<DataState | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [bakes, setBakes] = useState<Bake[]>([])
  const [starter, setStarter] = useState<StarterFeeding[]>([])

  useEffect(() => {
    Promise.all([api.list('recipes'), api.list('bakes'), api.list('starter')])
      .then(([r, b, s]) => {
        setRecipes(r.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)))
        setBakes(b)
        setStarter(s)
      })
      .catch((e) => setError(e.code ?? 'server'))
      .finally(() => setLoading(false))
  }, [])

  const apply = useCallback((c: Collection, fn: <T extends { id: string }>(list: T[]) => T[]) => {
    if (c === 'recipes') setRecipes(fn)
    else if (c === 'bakes') setBakes(fn)
    else setStarter(fn)
  }, [])

  const save = useCallback(
    async <C extends Collection>(c: C, item: CollectionTypes[C], isNew = false) => {
      const saved = isNew ? await api.create(c, item) : await api.update(c, item)
      apply(c, (list) => [saved as never, ...list.filter((x) => x.id !== saved.id)])
      return saved
    },
    [apply],
  )

  const remove = useCallback(
    async (c: Collection, id: string) => {
      await api.remove(c, id)
      apply(c, (list) => list.filter((x) => x.id !== id))
    },
    [apply],
  )

  const value = useMemo<DataState>(() => {
    const allRecipes = [...recipes, ...EXAMPLE_RECIPES]
    return {
      loading,
      error,
      recipes,
      bakes,
      starter,
      allRecipes,
      findRecipe: (id) => (id ? allRecipes.find((r) => r.id === id) : undefined),
      save,
      remove,
    }
  }, [loading, error, recipes, bakes, starter, save, remove])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData outside DataProvider')
  return v
}
