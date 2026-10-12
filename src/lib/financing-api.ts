import { NextResponse, type NextRequest } from 'next/server'
import { FinancingServiceError } from '@/server/modules/financing/types'
import { FinancingError, GateBlockedError } from '@/server/modules/financing/shared'

/**
 * Route-layer helpers for the financing API surface (FIN-4).
 * ────────────────────────────────────────────────────────────
 * Mirrors how existing routes map OrgServiceError / RfqServiceError:
 * a FinancingServiceError (route payloads) or FinancingError (domain
 * services — includes typed 403 permission denials) carries its HTTP
 * status and maps 1:1 onto the response; anything else is logged and
 * surfaces as a generic 500.
 */

export function financingError(err: unknown, action: string): NextResponse {
  if (err instanceof FinancingServiceError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  if (err instanceof GateBlockedError) {
    return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status })
  }
  if (err instanceof FinancingError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error(`financing api: failed to ${action}`, err)
  return NextResponse.json({ error: `Failed to ${action}` }, { status: 500 })
}

/**
 * Parse a JSON request body; an empty body becomes {} (several financing
 * actions take no payload), malformed JSON is a 400 — never a 500.
 */
export async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new FinancingServiceError('A valid JSON body is required', 400)
  }
}
