import { useCallback, useState } from 'react'

/** Per-device conveniences (last kitchen temperature, usual vessel…). Never needed for correctness. */
export function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`prozymi.${key}`)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

export function writePref(key: string, value: unknown): void {
  try {
    // A half-typed number field is NaN; don't remember that.
    if (typeof value === 'number' && !Number.isFinite(value)) return
    localStorage.setItem(`prozymi.${key}`, JSON.stringify(value))
  } catch {
    /* private mode or storage full */
  }
}

export function usePref<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, fallback))
  const set = useCallback(
    (next: T) => {
      setValue(next)
      writePref(key, next)
    },
    [key],
  )
  return [value, set]
}
