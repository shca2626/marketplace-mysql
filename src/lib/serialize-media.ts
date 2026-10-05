import type { MediaAsset } from '@prisma/client'
import { mediaUrl } from '@/lib/storage/url'
import { VAULT_NAMESPACE } from '@/lib/storage/namespace'
import type { MediaAssetDTO } from '@/lib/types'

// Serialize a MediaAsset row → DTO with ready-to-use rendition URLs.
// `variants` JSON: { thumb, medium, large, full } storage keys.
//
// 6.6 — VAULT-AWARE: assets in the private-vault namespace get NO URLs
// (empty strings): there is no public path to them, ever. The UI fetches a
// one-time authenticated proxy URL via POST /api/documents/:id/access and
// the `namespace` field tells it which mode it is in.
export function serializeMediaAsset(asset: MediaAsset): MediaAssetDTO {
  let variants: Record<string, string> = {}
  try {
    variants = asset.variants ? JSON.parse(asset.variants) : {}
  } catch {
    variants = {}
  }
  const isVault = asset.namespace === VAULT_NAMESPACE

  if (isVault) {
    return {
      id: asset.id,
      originalName: asset.originalName,
      mime: asset.mime,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      url: '',
      urls: { thumb: '', medium: '', large: '', full: '' },
      namespace: 'private-vault',
      createdAt: asset.createdAt.toISOString(),
    }
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
    namespace: 'public-media',
    createdAt: asset.createdAt.toISOString(),
  }
}
