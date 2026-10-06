import { createHmac, randomUUID } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// KYC PROVIDER — the MOCK adapter (Phase 12.4).
//
// Exercises the FULL production path with zero external dependencies:
//
//   dispatch ──submit(minimized payload)──▶ mock adapter
//      │                                        │ opens a case, returns ref
//      │                                        │ (outcome comes from the
//      │                                        │  KycProviderConfig.settings)
//      │◀──SUBMITTED───────────────────────────┘
//      │
//      └──async ~350ms──▶ REAL HTTP POST /api/kyc/webhook/mock with an
//                         HMAC-SHA256 signature (X-Vendora-Signature) — the
//                         same verification path a production provider uses.
//
// Outcomes (per doc type, from config settings JSON):
//   approve  → case.approved webhook after ~350ms
//   reject   → case.rejected webhook after ~350ms
//   error500 → submit() itself THROWS (simulated provider 5xx — dispatch
//              catches → PROVIDER_ERROR → the case enters the manual queue)
//   timeout  → submit() sleeps past the configured timeoutMs and then throws
//              ProviderTimeoutError (dispatch's Promise.race fires first)
//
// No shortcuts through the webhook handler function: every decision travels
// the real HTTP + signature path, so E2E proves the whole pipeline.
// ─────────────────────────────────────────────────────────────────────────────

import { ProviderTimeoutError, type KycProviderAdapter, type KycSubmitInput } from './types'

const DELIVERY_DELAY_MS = 350

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function webhookBaseUrl(input: KycSubmitInput): string {
  const fromSettings = typeof input.settings.webhookUrl === 'string' ? input.settings.webhookUrl : ''
  const base = (fromSettings || process.env.KYC_WEBHOOK_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')
  return base
}

/**
 * The actual delivery: signs `${timestamp}.${nonce}.${rawBody}` with the
 * provider secret and POSTs it to the platform's own webhook endpoint over
 * real HTTP. Fire-and-forget from submit()'s perspective — exactly how an
 * async provider behaves.
 */
async function deliverDecision(
  input: KycSubmitInput,
  secret: string,
  providerCaseRef: string,
  eventType: 'case.approved' | 'case.rejected'
): Promise<void> {
  await sleep(DELIVERY_DELAY_MS)
  const body = JSON.stringify({
    eventId: `evt_${randomUUID()}`,
    eventType,
    caseRef: providerCaseRef,
    decision: { reason: `mock provider ${eventType === 'case.approved' ? 'approved' : 'rejected'} ${input.docType}` },
    ts: Date.now(),
    nonce: randomUUID(),
  })
  const timestamp = String(Date.now())
  const nonce = randomUUID()
  const signature = createHmac('sha256', secret).update(`${timestamp}.${nonce}.${body}`).digest('hex')

  const res = await fetch(`${webhookBaseUrl(input)}/api/kyc/webhook/mock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Vendora-Signature': signature,
      'X-Vendora-Timestamp': timestamp,
      'X-Vendora-Nonce': nonce,
    },
    body,
  })
  if (!res.ok) {
    // Evidence only — the delivery outcome is visible in the webhook-event
    // receive log (KycWebhookEvent rows are written by the receiving route).
    console.error(`[kyc-provider:mock] webhook delivery ${eventType} → HTTP ${res.status}`)
  }
}

export const mockProvider: KycProviderAdapter = {
  key: 'mock',

  async submit(input) {
    const outcome = input.settings.outcome ?? 'approve'
    const providerCaseRef = `mock-${randomUUID().replace(/-/g, '').slice(0, 16)}`

    if (outcome === 'error500') {
      // Simulated provider 5xx while OPENING the case: submit fails, dispatch
      // catches → case PROVIDER_ERROR → the manual queue. Document untouched.
      throw new Error(`mock provider simulated HTTP 500 opening a ${input.docType} case`)
    }

    if (outcome === 'timeout') {
      // Sleep past the configured timeout, then throw. Dispatch's own
      // Promise.race timeout fires at timeoutMs — whichever surfaces first,
      // the case resolves to PROVIDER_ERROR with a timeout errorDetail.
      await sleep(input.timeoutMs + 1500)
      throw new ProviderTimeoutError(input.timeoutMs)
    }

    // approve | reject — schedule the async decision over the REAL signed
    // HTTP webhook path (never short-circuit into the handler function).
    void deliverDecision(input, input.secret, providerCaseRef, outcome === 'approve' ? 'case.approved' : 'case.rejected').catch(
      (err: unknown) => {
        console.error('[kyc-provider:mock] webhook delivery failed:', err instanceof Error ? err.message : err)
      }
    )
    return { providerCaseRef }
  },
}
