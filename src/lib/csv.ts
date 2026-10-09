/**
 * Minimal client-side CSV export helpers.
 * Values are escaped per RFC 4180; a UTF-8 BOM is prepended so Excel
 * opens the file with correct encoding. No dependencies.
 */

export type CsvCell = string | number | boolean | null | undefined
export type CsvRow = CsvCell[]

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Quote when the value contains a separator, quote, or line break
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Build a CSV document from rows (first row should be the header). */
export function toCsv(rows: CsvRow[]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

/** Trigger a browser download for the given CSV content. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** yyyy-mm-dd stamp for filenames. */
export function fileStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Parse CSV text into an array of objects keyed by the header row
 * (RFC 4180: quoted fields, "" escapes, CRLF or LF row breaks).
 * A leading UTF-8 BOM (what `toCsv` downloads include) is ignored.
 * Returns [] for empty input or a header-only document.
 */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  row.push(field)
  if (row.length > 1 || row[0] !== '') rows.push(row)

  if (rows.length === 0) return []
  const [header, ...data] = rows
  return data.map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((key, i) => {
      const k = key.trim()
      if (k) obj[k] = r[i] ?? ''
    })
    return obj
  })
}
