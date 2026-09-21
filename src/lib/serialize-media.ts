import { db } from '@/lib/db'
import type { MediaAsset } from '@prisma/client'
import { mediaUrl } from '@/lib/storage/url'
import type { MediaAssetDTO } from '@/lib/types'

// Serialize a MediaAsset row → DTO with ready-to-use rendition URLs.
// `variants` JSON: { thumb, medium, large, full } storage keys.
export function serializeMediaAsset(asset: MediaAsset): MediaAssetDTO {
  let variants: Record<string, string> = {}
  try {
    variants = asset.variants ? JSON.parse(asset.variants) : {}
  } catch {
    variants = {}
  }
  const url = (role: string) => mediaUrl(variants[role] ?? '')
  return {
    id: asset.id,
    originalName: asset.originalName,
    mime: asset.mime,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    url: url('medium') || url('full'),
    urls: {
      thumb: url('thumb'),
      medium: url('medium'),
      large: url('large'),
      full: url('full'),
    },
    createdAt: asset.createdAt.toISOString(),
  }
}
