import type { Bake, Recipe, StarterFeeding } from './domain/types'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function request<T>(method: string, path: string, body?: unknown, retries = method === 'GET' ? 1 : 0): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    if (retries > 0) return wait(400).then(() => request<T>(method, path, body, retries - 1))
    throw new ApiError(0, 'offline')
  }
  // Reads are safe to repeat: retry once on a server hiccup (cold start, flaky connection).
  if (res.status >= 500 && retries > 0) return wait(400).then(() => request<T>(method, path, body, retries - 1))
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'server')
  return data as T
}

export type Collection = 'recipes' | 'bakes' | 'starter'
export interface CollectionTypes {
  recipes: Recipe
  bakes: Bake
  starter: StarterFeeding
}

export const api = {
  me: () => request<{ username: string }>('GET', 'auth/me'),
  login: (username: string, password: string) =>
    request<{ username: string }>('POST', 'auth/login', { username, password }),
  register: (username: string, password: string) =>
    request<{ username: string }>('POST', 'auth/register', { username, password }),
  logout: () => request<{ ok: true }>('POST', 'auth/logout'),

  list: <C extends Collection>(c: C) => request<CollectionTypes[C][]>('GET', c),
  create: <C extends Collection>(c: C, item: CollectionTypes[C]) => request<CollectionTypes[C]>('POST', c, item),
  update: <C extends Collection>(c: C, item: CollectionTypes[C]) =>
    request<CollectionTypes[C]>('PUT', `${c}/${item.id}`, item),
  remove: (c: Collection, id: string) => request<{ ok: true }>('DELETE', `${c}/${id}`),

  uploadPhoto: async (blob: Blob): Promise<{ id: string }> => {
    const res = await fetch('/api/photos', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': blob.type },
      body: blob,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'server')
    return data as { id: string }
  },
  deletePhoto: (id: string) => request<{ ok: true }>('DELETE', `photos/${id}`),
  photoUrl: (id: string) => `/api/photos/${id}`,
}

/** Shrink a camera photo to at most `max` px on the long side, as JPEG. */
export async function resizeImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality),
  )
}
