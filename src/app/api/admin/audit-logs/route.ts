import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/server/guards'
import type { AuditLogDTO } from '@/lib/types'

// JSON-in-text: metadata is stored serialized — parse for the client.
const parseMetadata = (s: string | null): unknown => {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

// GET /api/admin/audit-logs — paginated platform audit trail
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin('audit.view')
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page') ?? 1))
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get('pageSize') ?? 50)))
    const entityType = searchParams.get('entityType')
    const action = searchParams.get('action')
    const actorType = searchParams.get('actorType')

    const where = {
      ...(entityType ? { entityType } : {}),
      ...(action ? { action } : {}),
      ...(actorType ? { actorType } : {}),
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.auditLog.count({ where }),
    ])

    const items: AuditLogDTO[] = logs.map((l) => ({
      id: l.id,
      actorId: l.actorId,
      actorType: l.actorType,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      summary: l.summary,
      metadata: parseMetadata(l.metadata),
      createdAt: l.createdAt.toISOString(),
    }))

    return NextResponse.json({ logs: items, total, page, pageSize })
  } catch (err) {
    console.error('admin audit-logs GET error', err)
    return NextResponse.json({ error: 'Failed to load audit log' }, { status: 500 })
  }
}
