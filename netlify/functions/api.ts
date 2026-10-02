import { getStore } from '@netlify/blobs'
import { handle } from '../../server/api'
import { BlobKV, type BlobStoreLike } from '../../server/store'

export default async (req: Request) => {
  // Strong consistency so a record is visible right after it's saved.
  const store = getStore({ name: 'prozymi', consistency: 'strong' })
  return handle(req, new BlobKV(store as unknown as BlobStoreLike), { secret: process.env.PROZYMI_SECRET })
}

export const config = { path: '/api/*' }
