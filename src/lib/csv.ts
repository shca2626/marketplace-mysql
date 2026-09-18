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
