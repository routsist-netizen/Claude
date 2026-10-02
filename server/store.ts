/**
 * Tiny key-value abstraction over Netlify Blobs, so the API can be tested
 * with an in-memory store.
 */
export interface Binary {
  data: ArrayBuffer
  contentType: string
}

export interface KV {
  getJSON<T>(key: string): Promise<T | null>
  /** Returns false if `onlyIfNew` was set and the key already existed. */
  setJSON(key: string, value: unknown, opts?: { onlyIfNew?: boolean }): Promise<boolean>
  getBinary(key: string): Promise<Binary | null>
  setBinary(key: string, data: ArrayBuffer, contentType: string): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

export class MemoryKV implements KV {
  private map = new Map<string, { json?: string; bin?: Binary }>()

  async getJSON<T>(key: string): Promise<T | null> {
    const v = this.map.get(key)
    return v?.json !== undefined ? (JSON.parse(v.json) as T) : null
  }
  async setJSON(key: string, value: unknown, opts?: { onlyIfNew?: boolean }) {
    if (opts?.onlyIfNew && this.map.has(key)) return false
    this.map.set(key, { json: JSON.stringify(value) })
    return true
  }
  async getBinary(key: string) {
    return this.map.get(key)?.bin ?? null
  }
  async setBinary(key: string, data: ArrayBuffer, contentType: string) {
    this.map.set(key, { bin: { data, contentType } })
  }
  async delete(key: string) {
    this.map.delete(key)
  }
  async list(prefix: string) {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort()
  }
}

/** Minimal structural type for a Netlify Blobs store (avoids importing it here). */
export interface BlobStoreLike {
  get(key: string, opts: { type: 'json' }): Promise<unknown>
  getWithMetadata(
    key: string,
    opts: { type: 'arrayBuffer' },
  ): Promise<{ data: ArrayBuffer; metadata: Record<string, unknown> } | null>
  set(key: string, data: ArrayBuffer, opts?: { metadata?: Record<string, unknown> }): Promise<unknown>
  setJSON(key: string, data: unknown, opts?: { onlyIfNew?: boolean }): Promise<{ modified: boolean }>
  delete(key: string): Promise<void>
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>
}

export class BlobKV implements KV {
  constructor(private store: BlobStoreLike) {}

  async getJSON<T>(key: string) {
    return ((await this.store.get(key, { type: 'json' })) as T | null) ?? null
  }
  async setJSON(key: string, value: unknown, opts?: { onlyIfNew?: boolean }) {
    const res = await this.store.setJSON(key, value, opts?.onlyIfNew ? { onlyIfNew: true } : undefined)
    return res?.modified ?? true
  }
  async getBinary(key: string) {
    const res = await this.store.getWithMetadata(key, { type: 'arrayBuffer' })
    if (!res) return null
    return { data: res.data, contentType: String(res.metadata?.contentType ?? 'application/octet-stream') }
  }
  async setBinary(key: string, data: ArrayBuffer, contentType: string) {
    await this.store.set(key, data, { metadata: { contentType } })
  }
  async delete(key: string) {
    await this.store.delete(key)
  }
  async list(prefix: string) {
    const { blobs } = await this.store.list({ prefix })
    return blobs.map((b) => b.key)
  }
}
