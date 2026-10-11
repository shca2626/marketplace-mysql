import { db } from '@/lib/db'

/**
 * Gapless human-readable document numbers (RFQ-2025-000001, QTE-2025-000042).
 * Uses a dedicated counter row per prefix inside a transaction so concurrent
 * creates never produce duplicates; the upsert-create race is retried.
 */

export type SequencePrefix = 'RFQ' | 'QTE' | 'DSP' | 'PY' | 'FIN' | 'AGR' | 'ACC' | 'CS' | 'CIV'

export async function nextNumber(prefix: SequencePrefix): Promise<string> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await tx.sequence.upsert({
          where: { key: prefix },
          create: { key: prefix, value: 1 },
          update: { value: { increment: 1 } },
        })
        const seq = await tx.sequence.findUniqueOrThrow({ where: { key: prefix } })
        return `${prefix}-${new Date().getFullYear()}-${String(seq.value).padStart(6, '0')}`
      })
    } catch (err) {
      lastError = err
    }
  }
  throw lastError ?? new Error(`sequence ${prefix} failed`)
}
