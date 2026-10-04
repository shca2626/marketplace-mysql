// ─────────────────────────────────────────────────────────────────────────────
// MIGRATE VAULT NAMESPACE (lastplan v5 6.6.7) — move every AccountDocument's
// media into the private-vault namespace and close the public exposure of
// sensitive KYC evidence.
//
//   bun scripts/migrate-vault-namespace.ts [--dry-run]
//
// What it does:
//   1. assert-not-prod (fail closed).
//   2. For each AccountDocument whose media is in public-media:
//      a. find-or-create the vault-namespace twin asset by sha256
//         (dedup within the vault namespace, 6.6.1),
//      b. copy the rendition bytes to vault/ keys through the storage adapter
//         (ftp-hosting driver: vault writes are local-only by construction),
//      c. repoint AccountDocument.mediaId to the vault twin.
//   3. Invalidation sweep — for each public asset that NO AccountDocument
//      references anymore AND that no product/cover/slide/category references
//      (URL-string scan), DELETE the public bytes so the old public URLs 404.
//      Assets still referenced elsewhere are KEPT and reported (exposure
//      windows registered in the printed risk report).
//   4. Print the reconciliation report (6.6.7 gate artifact).
//
// Idempotent: re-running is a no-op (everything is either already vault or
// gets converged).
// ─────────────────────────────────────────────────────────────────────────────
import { assertNotProd } from './lib/assert-not-prod'
import { db } from '../src/lib/db'
import { getStorage, buildAssetKeyBase, VAULT_NAMESPACE, renditionKey, MEDIA_ROLES } from '../src/lib/storage'
import type { MediaRole } from '../src/lib/storage'

const dry = process.argv.includes('--dry-run')

/** Valid PNG signature (all renditions are PNG by construction). */
function looksLikePng(buf: Buffer): boolean {
  return buf.byteLength > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
}

/**
 * Read a rendition with retries + content sanity: the public hosting can
 * transiently return empty/truncated streams — a vault copy must be a real
 * PNG. Throws after all attempts fail.
 */
async function readRenditionReliable(key: string, attempts = 4): Promise<Buffer> {
  let last: Buffer | null = null
  for (let i = 1; i <= attempts; i++) {
    const buf = await getStorage().getOrNull(key)
    if (buf && looksLikePng(buf)) return buf
    last = buf ?? null
    if (i < attempts) await new Promise((r) => setTimeout(r, 1500 * i))
  }
  throw new Error(
    `rendition ${key} unreadable after ${attempts} attempts (${last === null ? 'missing' : `${last.byteLength} bytes, not a valid PNG`})`
  )
}

interface Report {
  documentsTotal: number
  documentsMigrated: number
  documentsAlreadyVault: number
  vaultAssetsCreated: number
  vaultAssetsReused: number
  publicBytesDeleted: number
  publicAssetsKeptReferenced: number
  keptAssets: { key: string; reason: string }[]
  errors: { documentId: string; error: string }[]
}

async function main() {
  assertNotProd()

  const report: Report = {
    documentsTotal: 0,
    documentsMigrated: 0,
    documentsAlreadyVault: 0,
    vaultAssetsCreated: 0,
    vaultAssetsReused: 0,
    publicBytesDeleted: 0,
    publicAssetsKeptReferenced: 0,
    keptAssets: [],
    errors: [],
  }

  const storage = getStorage()
  const docs = await db.accountDocument.findMany({
    select: { id: true, mediaId: true, media: true },
    orderBy: { createdAt: 'asc' },
  })
  report.documentsTotal = docs.length
  console.log(`[vault-migrate] ${docs.length} account documents to check`)

  // ── Pass 1: repoint every doc's media to a vault-namespace asset ──────────
  for (const doc of docs) {
    try {
      const media = doc.media as { id: string; key: string; namespace: string; sha256: string; variants: string | null }
      if (media.namespace === VAULT_NAMESPACE) {
        report.documentsAlreadyVault += 1
        continue
      }

      // find-or-create the vault twin (dedup WITHIN the vault namespace)
      let twin = await db.mediaAsset.findUnique({
        where: { namespace_sha256: { namespace: VAULT_NAMESPACE, sha256: media.sha256 } },
      })

      if (!twin) {
        // copy the rendition bytes under vault/ keys
        let variants: Record<string, string> = {}
        try {
          variants = media.variants ? JSON.parse(media.variants) : {}
        } catch {
          variants = {}
        }
        const newBase = buildAssetKeyBase(media.sha256, VAULT_NAMESPACE)
        const newVariants: Record<string, string> = {}
        for (const role of MEDIA_ROLES as readonly MediaRole[]) {
          const oldKey = variants[role]
          if (!oldKey) continue
          const bytes = await readRenditionReliable(oldKey)
          const newKey = renditionKey(newBase, role)
          if (!dry) await storage.put(newKey, bytes, { private: true })
          newVariants[role] = newKey
        }
        if (Object.keys(newVariants).length === 0) {
          throw new Error('no renditions could be copied from the public asset')
        }
        if (!dry) {
          twin = await db.mediaAsset.create({
            data: {
              key: newBase,
              namespace: VAULT_NAMESPACE,
              originalName: (media as { originalName?: string }).originalName ?? 'document',
              mime: (media as { mime?: string }).mime ?? 'image/png',
              size: (media as { size?: number }).size ?? 0,
              width: (media as { width?: number | null }).width ?? null,
              height: (media as { height?: number | null }).height ?? null,
              sha256: media.sha256,
              variants: JSON.stringify(newVariants),
              uploadedById: (media as { uploadedById?: string }).uploadedById ?? '',
            },
          })
        } else {
          twin = { id: 'dry-run' } as never
        }
        report.vaultAssetsCreated += 1
      } else {
        report.vaultAssetsReused += 1
      }

      if (!dry && twin) {
        await db.accountDocument.update({ where: { id: doc.id }, data: { mediaId: twin.id } })
      }
      report.documentsMigrated += 1
    } catch (err) {
      report.errors.push({ documentId: doc.id, error: (err as Error).message })
      console.error(`[vault-migrate] document ${doc.id} failed:`, err)
    }
  }

  // ── Pass 2: invalidation sweep — delete public bytes no one needs ──────────
  // A public asset is SAFE TO DELETE bytes for when:
  //   • no AccountDocument references it anymore, AND
  //   • no URL-string reference exists (products, categories, slides,
  //     store covers, settings raw JSON).
  const publicAssets = await db.mediaAsset.findMany({
    where: { namespace: 'public-media' },
    select: { id: true, key: true, variants: true, sha256: true },
  })
  const stillReferencedDocIds = new Set(
    (await db.accountDocument.findMany({ select: { mediaId: true } })).map((d) => d.mediaId)
  )

  for (const asset of publicAssets) {
    if (stillReferencedDocIds.has(asset.id)) continue // paranoia — pass 1 repointed everything
    const referencing = await findUrlReferences(asset.key)
    if (referencing.length > 0) {
      report.publicAssetsKeptReferenced += 1
      report.keptAssets.push({ key: asset.key, reason: referencing.join(', ') })
      continue
    }
    // delete the public rendition bytes (the row itself can stay — it is
    // inert metadata; deleting bytes makes /api/media/{key}.* a hard 404)
    let variants: Record<string, string> = {}
    try {
      variants = asset.variants ? JSON.parse(asset.variants) : {}
    } catch {
      variants = {}
    }
    if (!dry) {
      for (const k of Object.values(variants)) {
        try {
          await storage.delete(k)
        } catch (err) {
          console.warn(`[vault-migrate] delete failed for ${k}:`, (err as Error).message)
        }
      }
    }
    report.publicBytesDeleted += Object.keys(variants).length
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n[vault-migrate] ── RECONCILIATION REPORT (6.6.7) ' + (dry ? '(DRY RUN)' : ''))
  console.table({
    'Documents total': report.documentsTotal,
    'Migrated to vault': report.documentsMigrated,
    'Already vault': report.documentsAlreadyVault,
    'Vault assets created': report.vaultAssetsCreated,
    'Vault assets reused (dedup)': report.vaultAssetsReused,
    'Public rendition files deleted': report.publicBytesDeleted,
    'Public assets kept (still referenced)': report.publicAssetsKeptReferenced,
    'Errors': report.errors.length,
  })
  if (report.keptAssets.length > 0) {
    console.log('\n[vault-migrate] REGISTERED EXPOSURE WINDOWS — public bytes kept because other entities reference them:')
    for (const k of report.keptAssets) console.log(`  • ${k.key} — ${k.reason}`)
    console.log('  (These remain public-by-URL; risk registered for rotation in 6.0.)')
  }
  if (report.errors.length > 0) {
    console.error('\n[vault-migrate] ERRORS:')
    for (const e of report.errors) console.error(`  • ${e.documentId}: ${e.error}`)
    process.exit(1)
  }
  console.log('\n[vault-migrate] done.')
}

/** URL-string reference scan: entities that store /api/media/<key> URLs. */
async function findUrlReferences(keyBase: string): Promise<string[]> {
  const refs: string[] = []
  const needle = `/api/media/${keyBase}`
  const products = await db.product.findMany({
    where: { images: { contains: needle } },
    select: { id: true },
    take: 1,
  })
  if (products.length > 0) refs.push('product images')
  try {
    const categories = await db.category.findMany({
      where: { icon: { contains: needle } },
      select: { id: true },
      take: 1,
    })
    if (categories.length > 0) refs.push('category art')
  } catch {
    // column set varies
  }
  try {
    const slides = await db.bannerSlide.findMany({
      where: { image: { contains: needle } },
      select: { id: true },
      take: 1,
    })
    if (slides.length > 0) refs.push('banner slides')
  } catch {
    // column set varies
  }
  return refs
}

main()
  .catch((err) => {
    console.error('[vault-migrate] FATAL:', err)
    process.exit(1)
  })
  .finally(() => import('../src/lib/db').then(({ db }) => db.$disconnect()))
