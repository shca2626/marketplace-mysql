import { db } from '@/lib/db'

/**
 * PHASE 4 — catalog settings (PlatformSetting key "catalog").
 *
 * publishReview — gate that routes NEW product publishes (and new offers,
 * and new financier services) into the admin review queue instead of the
 * public catalog:
 *   OFF         no review (Phase 3 behavior — KYC L2 is the only gate)
 *   NEW_SELLERS sellers with zero previously-approved listings are reviewed
 *               (default; established merchants publish instantly)
 *   ALL         every publish is reviewed
 *
 * editReview — whether edits to an already-ACTIVE listing drop it back into
 * the queue (OFF by default; moderation stays reactive there).
 */

export const CATALOG_SETTINGS_KEY = 'catalog'

export type PublishReviewMode = 'OFF' | 'NEW_SELLERS' | 'ALL'
export type EditReviewMode = 'OFF' | 'ALL'

export interface CatalogSettings {
  publishReview: PublishReviewMode
  editReview: EditReviewMode
}

export const DEFAULT_CATALOG_SETTINGS: CatalogSettings = {
  publishReview: 'NEW_SELLERS',
  editReview: 'OFF',
}

const PUBLISH_MODES: PublishReviewMode[] = ['OFF', 'NEW_SELLERS', 'ALL']

export async function getCatalogSettings(): Promise<CatalogSettings> {
  try {
    const row = await db.platformSetting.findUnique({ where: { key: CATALOG_SETTINGS_KEY } })
    if (!row) return { ...DEFAULT_CATALOG_SETTINGS }
    const parsed = JSON.parse(row.value) as Partial<CatalogSettings>
    return {
      publishReview: PUBLISH_MODES.includes(parsed.publishReview as PublishReviewMode)
        ? (parsed.publishReview as PublishReviewMode)
        : DEFAULT_CATALOG_SETTINGS.publishReview,
      editReview: parsed.editReview === 'ALL' ? 'ALL' : 'OFF',
    }
  } catch {
    return { ...DEFAULT_CATALOG_SETTINGS }
  }
}

export async function saveCatalogSettings(patch: Partial<CatalogSettings>): Promise<CatalogSettings> {
  const current = await getCatalogSettings()
  const next: CatalogSettings = {
    publishReview: PUBLISH_MODES.includes(patch.publishReview as PublishReviewMode)
      ? (patch.publishReview as PublishReviewMode)
      : current.publishReview,
    editReview: patch.editReview === 'ALL' ? 'ALL' : patch.editReview === 'OFF' ? 'OFF' : current.editReview,
  }
  await db.platformSetting.upsert({
    where: { key: CATALOG_SETTINGS_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: CATALOG_SETTINGS_KEY, value: JSON.stringify(next) },
  })
  return next
}

/**
 * Does THIS seller's next publish need platform review?
 * A seller is "established" once they own at least one ACTIVE listing or one
 * ACTIVE offer — i.e. something of theirs has already been approved/live.
 */
export async function sellerNeedsPublishReview(sellerId: string): Promise<boolean> {
  const settings = await getCatalogSettings()
  if (settings.publishReview === 'OFF') return false
  if (settings.publishReview === 'ALL') return true
  const [activeProducts, activeOffers] = await Promise.all([
    db.product.count({ where: { sellerId, status: 'ACTIVE' } }),
    db.productOffer.count({ where: { sellerId, status: 'ACTIVE' } }),
  ])
  return activeProducts + activeOffers === 0
}

/**
 * Same rule for a financier institution's services: first service goes
 * through review; once one service is live the institution is established.
 */
export async function financierNeedsServiceReview(financierProfileId: string): Promise<boolean> {
  const settings = await getCatalogSettings()
  if (settings.publishReview === 'OFF') return false
  if (settings.publishReview === 'ALL') return true
  const activeServices = await db.financierService.count({
    where: { financierProfileId, status: 'ACTIVE' },
  })
  return activeServices === 0
}

/** Publication Agreement version + text shown in the seller product form. */
export const PUBLICATION_AGREEMENT_VERSION = '1.0'
export const PUBLICATION_AGREEMENT_TEXT =
  'I confirm I have the legal right to sell this product, that the listing information ' +
  'and any certification documents are accurate, and I accept the Vendora Publication ' +
  `Agreement (v${PUBLICATION_AGREEMENT_VERSION}) — including takedown and account action for counterfeit or misleading listings.`
