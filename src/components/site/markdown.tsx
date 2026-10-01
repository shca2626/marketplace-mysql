import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Markdown-lite renderer (server component — zero client JS).
 * Supports: ## / ### headings, - lists, 1. lists, > quotes, **bold**,
 * `code`, paragraphs. Everything the DB content uses — nothing more.
 */

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  // **bold** and `code` — split into tokens
  const parts: React.ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-b${i++}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      )
    } else {
      parts.push(
        <code key={`${keyPrefix}-c${i++}`} className="rounded bg-muted px-1.5 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function Markdown({ body, className, dark = false }: { body: string; className?: string; dark?: boolean }) {
  const lines = body.split('\n')
  const nodes: React.ReactNode[] = []
  let listBuffer: string[] = []
  let listOrdered = false
  let key = 0

  const flushList = () => {
    if (listBuffer.length === 0) return
    const Tag = listOrdered ? 'ol' : 'ul'
    nodes.push(
      <Tag
        key={`l${key++}`}
        className={cn(
          'my-5 space-y-2.5 pl-1',
          dark ? 'text-zinc-300' : 'text-muted-foreground',
        )}
      >
        {listBuffer.map((item, i) => (
          <li key={i} className="flex gap-3">
            {listOrdered ? (
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
                {i + 1}
              </span>
            ) : (
              <span aria-hidden className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
            )}
            <span className="min-w-0 text-[15px] leading-relaxed">{inline(item, `li${key}-${i}`)}</span>
          </li>
        ))}
      </Tag>,
    )
    listBuffer = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushList()
      continue
    }
    if (line.startsWith('### ')) {
      flushList()
      nodes.push(
        <h3 key={`h${key++}`} className={cn('mb-2 mt-8 text-lg font-semibold', dark ? 'text-zinc-100' : 'text-foreground')}>
          {inline(line.slice(4), `h${key}`)}
        </h3>,
      )
      continue
    }
    if (line.startsWith('## ')) {
      flushList()
      nodes.push(
        <h2 key={`h${key++}`} className={cn('mb-3 mt-10 text-xl font-bold tracking-tight sm:text-2xl', dark ? 'text-zinc-50' : 'text-foreground')}>
          {inline(line.slice(3), `h${key}`)}
        </h2>,
      )
      continue
    }
    if (line.startsWith('> ')) {
      flushList()
      nodes.push(
        <blockquote
          key={`q${key++}`}
          className={cn(
            'my-6 rounded-r-xl border-l-2 py-1 pl-5 pr-3 text-[15px] italic leading-relaxed',
            dark ? 'border-amber-400/60 bg-amber-400/[0.06] text-zinc-300' : 'border-primary/60 bg-primary/[0.05] text-foreground/80',
          )}
        >
          {inline(line.slice(2), `q${key}`)}
        </blockquote>,
      )
      continue
    }
    if (/^[-*] /.test(line)) {
      if (listOrdered) flushList()
      listOrdered = false
      listBuffer.push(line.slice(2))
      continue
    }
    if (/^\d+\. /.test(line)) {
      if (!listOrdered) flushList()
      listOrdered = true
      listBuffer.push(line.replace(/^\d+\. /, ''))
      continue
    }
    flushList()
    nodes.push(
      <p key={`p${key++}`} className={cn('my-4 text-[15px] leading-relaxed', dark ? 'text-zinc-300' : 'text-muted-foreground')}>
        {inline(line, `p${key}`)}
      </p>,
    )
  }
  flushList()

  return <div className={cn('max-w-none', className)}>{nodes}</div>
}
