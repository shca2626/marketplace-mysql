import { createHash } from 'node:crypto'
import { buildAssetKeyBase, getStorage } from './index'

// Document processing pipeline (RFQ attachments + settlement evidence).
// ───────────────────────────────────────────────────────────────────────
// Unlike the image pipeline (webp renditions), documents are stored VERBATIM:
// magic-byte sniffed, size-capped, sha256-deduplicated. The stored key keeps
// its original extension so /api/media can serve the right Content-Type.
// Supported: PDF, DOCX, XLSX, ZIP, CSV, TXT.

export const DOCUMENT_LIMITS = {
  maxBytes: 10 * 1024 * 1024, // 10 MB per document
  maxFilesPerRequest: 6,
} as const

export interface ProcessedDocument {
  /** FULL storage key including extension (documents have no renditions). */
  key: string
  sha256: string
  mime: string
  size: number
  ext: string
}

/** Magic-byte sniffing — never trust the declared Content-Type. */
export function sniffDocument(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length < 4) return null
  // PDF: "%PDF-"
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { ext: '.pdf', mime: 'application/pdf' }
  }
  // ZIP-based office formats (docx / xlsx) and plain zips: "PK\x03\x04"
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    const head = buf.subarray(0, 2000)
    if (head.includes('word/')) return { ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    if (head.includes('xl/')) return { ext: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    return { ext: '.zip', mime: 'application/zip' }
  }
  // Plain text / CSV: heuristic — no NUL bytes, decodes as UTF-8, mostly printable
  const sample = buf.subarray(0, 4096)
  if (!sample.includes(0)) {
    const text = sample.toString('utf8')
    const printable = text.replace(/[^\x20-\x7E\t\n\r]/g, '')
    if (text.length > 0 && printable.length / text.length > 0.9) {
      // CSV heuristic: multiple lines with consistent commas/semicolons
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length >= 2) {
        const firstCommas = (lines[0].match(/[,;]/g) ?? []).length
        if (firstCommas >= 1 && lines.slice(1, 5).every((l) => (l.match(/[,;]/g) ?? []).length === firstCommas)) {
          return { ext: '.csv', mime: 'text/csv' }
        }
      }
      return { ext: '.txt', mime: 'text/plain' }
    }
  }
  return null
}

export async function processDocumentUpload(input: Buffer): Promise<ProcessedDocument> {
  const sniffed = sniffDocument(input)
  if (!sniffed) {
    throw Object.assign(
      new Error('Unsupported document format — use PDF, DOCX, XLSX, ZIP, CSV or TXT'),
      { status: 415 }
    )
  }
  if (input.byteLength > DOCUMENT_LIMITS.maxBytes) {
    throw Object.assign(new Error('Document exceeds the 10 MB limit'), { status: 413 })
  }

  const sha256 = createHash('sha256').update(input).digest('hex')
  const base = buildAssetKeyBase(sha256)
  const key = `${base}${sniffed.ext}`

  const storage = getStorage()
  await storage.put(key, input)

  return { key, sha256, mime: sniffed.mime, size: input.byteLength, ext: sniffed.ext }
}
