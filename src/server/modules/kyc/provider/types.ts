// ─────────────────────────────────────────────────────────────────────────────
// KYC PROVIDER SUBSYSTEM — shared types (Phase 12.4, lastplan v5 §12).
//
// A KycProviderAdapter takes a MINIMIZED payload (data minimization: only the
// fields the document type requires — never the file bytes, never a public
// URL to the vault) and drives a provider-side verification case. Decisions
// come back asynchronously through the signed webhook
// (POST /api/kyc/webhook/[providerKey]) — the adapter's submit() only
// establishes the case and returns the provider's case reference.
//
// FAILURE SEMANTICS (the core contract): any adapter error — HTTP 5xx,
// network failure, or timeout — resolves the case to PROVIDER_ERROR and the
// document STAYS PENDING for manual review. A provider outage can never
// auto-approve (or auto-reject) anything.
// ─────────────────────────────────────────────────────────────────────────────

/** Adapter options persisted on KycProviderConfig.settings (JSON). */
export interface KycProviderSettings {
  /** mock adapter: the simulated provider outcome per doc type (default 'approve'). */
  outcome?: 'approve' | 'reject' | 'error500' | 'timeout'
  /** Optional absolute base URL the mock posts its webhook to (default http://127.0.0.1:3000). */
  webhookUrl?: string
  [key: string]: unknown
}

/** The minimized, per-doc-type payload handed to an adapter (never raw bytes). */
export interface KycSubmitInput {
  /** The KycCase row this submission belongs to (correlation aid). */
  caseId: string
  docType: string
  /** The EXACT minimized field set (see buildMinimizedPayload in dispatch.ts). */
  fields: Record<string, string>
  /** Parsed KycProviderConfig.settings — adapter options live with the config. */
  settings: KycProviderSettings
  /** The configured dispatch timeout — adapters should respect it. */
  timeoutMs: number
  /** The provider's webhook signing secret (resolved by dispatch) — adapters
   *  that call back over HTTP use it to sign their deliveries. */
  secret: string
}

export interface KycSubmitResult {
  /** The provider's own case id — echoed back on every webhook event. */
  providerCaseRef: string
}

export interface KycProviderAdapter {
  /** Stable adapter key ('mock'). Matches the webhook path segment. */
  key: string
  /** Submit a minimized payload; resolves with the provider case reference. */
  submit(input: KycSubmitInput): Promise<KycSubmitResult>
}

/** Raised by dispatch's Promise.race when submit exceeds the configured timeoutMs. */
export class ProviderTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`provider submit timed out after ${timeoutMs}ms`)
    this.name = 'ProviderTimeoutError'
  }
}

/** Webhook body contract — signed with the provider secret, delivered to
 *  POST /api/kyc/webhook/[providerKey]:
 *    signature = HMAC_SHA256(secret, `${X-Vendora-Timestamp}.${X-Vendora-Nonce}.${rawBody}`)
 *  headers: X-Vendora-Signature (hex) · X-Vendora-Timestamp (ms epoch) · X-Vendora-Nonce */
export interface KycWebhookBody {
  /** Provider-declared event id — the idempotency key (unique per provider). */
  eventId: string
  eventType: 'case.approved' | 'case.rejected' | 'case.error' | 'ping'
  /** The providerCaseRef returned by submit() — case correlation. */
  caseRef: string
  decision?: { reason?: string }
  /** Provider-side timestamp (ms epoch) — the signed freshness check uses the
   *  X-Vendora-Timestamp header; this is corroborating evidence. */
  ts: number
  nonce: string
}

/** Result of a webhook delivery as reported to the caller. */
export interface KycWebhookResult {
  status: number
  body: Record<string, unknown>
}
