// ═══════════════════════════════════════════════════════════════════════════
// RFQ SETTINGS REGISTRY — the single source of truth for platform configuration.
// ─────────────────────────────────────────────────────────────────────────────
// Every settings panel is DATA: sections → panels → groups → fields. The admin
// UI renders forms from these definitions, the API validates payloads with a
// zod schema derived from the same definitions, defaults come from here, and
// the change-history diff walks them field by field.
//
// Adding a setting = one entry here → form, validation, defaults, history and
// the /api/admin/rfq-settings resolved payload all pick it up.
// ═══════════════════════════════════════════════════════════════════════════

import { z } from 'zod'

// ── Field model ─────────────────────────────────────────────────────────────

export type FieldType =
  | 'toggle'
  | 'select'
  | 'number'
  | 'text'
  | 'multiselect'
  | 'checkboxlist'
  | 'numberlist'
  | 'slider'
  | 'table'

export interface ShowIf {
  field: string
  equals: string | number | boolean
}

interface FieldBase {
  key: string
  label: string
  help?: string
  /** render only when the sibling field holds this value (validation unaffected) */
  showIf?: ShowIf
  /** value cannot be edited in the UI (locked platform invariants) */
  locked?: boolean
}

export interface ToggleField extends FieldBase { type: 'toggle'; default: boolean }
export interface TextField extends FieldBase { type: 'text'; default: string; placeholder?: string }
export interface NumberField extends FieldBase {
  type: 'number'
  default: number
  min?: number
  max?: number
  step?: number
  unit?: string
}
export interface Option { value: string; label: string }
export interface SelectField extends FieldBase { type: 'select'; default: string; options: Option[] }
export interface MultiSelectField extends FieldBase { type: 'multiselect'; default: string[]; options: Option[] }
export interface CheckboxListField extends FieldBase { type: 'checkboxlist'; default: string[]; options: Option[] }
export interface NumberListField extends FieldBase { type: 'numberlist'; default: number[]; min?: number; max?: number; unit?: string }
export interface SliderField extends FieldBase { type: 'slider'; default: number; min: number; max: number; step?: number; unit?: string }
export type TableCellType = 'text' | 'number' | 'select' | 'toggle'
export interface TableColumn {
  key: string
  label: string
  type: TableCellType
  options?: Option[] // for select cells
  placeholder?: string
  width?: string
}
export interface TableRow { [key: string]: string | number | boolean | null }
export interface TableField extends FieldBase {
  type: 'table'
  default: TableRow[]
  columns: TableColumn[]
  /** blank row template inserted by "Add row" */
  newRow: TableRow
  maxRows?: number
}

export type Field =
  | ToggleField
  | TextField
  | NumberField
  | SelectField
  | MultiSelectField
  | CheckboxListField
  | NumberListField
  | SliderField
  | TableField

export interface FieldGroup { title?: string; description?: string; fields: Field[] }
export interface PanelDef {
  key: string
  title: string
  description: string
  groups: FieldGroup[]
}
export interface SectionDef {
  key: string
  title: string
  description: string
  panels: PanelDef[]
}

// ── Scope model ──────────────────────────────────────────────────────────────

export type ScopeType = 'PLATFORM' | 'ORG_TYPE' | 'ORG' | 'CATEGORY' | 'REGION'
export const SCOPE_TYPES: ScopeType[] = ['PLATFORM', 'ORG_TYPE', 'ORG', 'CATEGORY', 'REGION']
export const PLATFORM_SCOPE: { scopeType: ScopeType; scopeId: string } = { scopeType: 'PLATFORM', scopeId: '' }

/** Org types mirrored from the organization taxonomy (orgs carry an industry). */
export const ORG_TYPES: Option[] = [
  { value: 'COMPANY', label: 'Companies' },
  { value: 'BANK', label: 'Banks' },
  { value: 'MFI', label: 'Micro-finance institutions' },
  { value: 'EWALLET', label: 'E-wallets' },
]

export const CURRENCIES: Option[] = [
  { value: 'USD', label: 'USD' },
  { value: 'YER', label: 'YER' },
  { value: 'SAR', label: 'SAR' },
]

export const VERIFICATION_LEVELS: Option[] = [
  { value: 'NONE', label: 'None' },
  { value: 'EMAIL', label: 'Email verified' },
  { value: 'PHONE', label: 'Phone verified' },
  { value: 'KYC', label: 'KYC verified' },
  { value: 'KYB', label: 'KYB verified' },
  { value: 'TRUSTED', label: 'Trusted' },
]

// ═══════════════════════════════════════════════════════════════════════════
// SECTIONS & PANELS
// ═══════════════════════════════════════════════════════════════════════════

export const RFQ_SETTINGS_SECTIONS: SectionDef[] = [
  // ── 1. RFQ MASTER CONTROLS ────────────────────────────────────────────────
  {
    key: 'master',
    title: 'RFQ Master Controls',
    description: 'Who sees quotes before the buyer does, who receives RFQs, and what verification each action requires.',
    panels: [
      {
        key: 'quoteRouting',
        title: 'Quote Routing',
        description: 'Decide whether a seller\u2019s quote goes straight to the buyer or must pass through platform review first.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable quote routing control', type: 'toggle', default: true },
              {
                key: 'mode', label: 'Routing mode', type: 'select', default: 'THRESHOLD',
                options: [
                  { value: 'DIRECT', label: 'Direct — quotes reach the buyer immediately' },
                  { value: 'THRESHOLD', label: 'Review above threshold' },
                  { value: 'NEW_SELLERS', label: 'Review new sellers only' },
                  { value: 'CATEGORY', label: 'Review per category' },
                  { value: 'ALWAYS', label: 'Always review' },
                ],
                showIf: { field: 'enabled', equals: true },
              },
              {
                key: 'thresholdAmount', label: 'Review threshold amount', type: 'number', default: 5000, min: 0, max: 10000000, step: 100, unit: 'currency',
                showIf: { field: 'mode', equals: 'THRESHOLD' },
              },
              { key: 'thresholdCurrency', label: 'Review threshold currency', type: 'select', default: 'USD', options: CURRENCIES, showIf: { field: 'mode', equals: 'THRESHOLD' } },
              { key: 'reviewCategories', label: 'Categories requiring review', type: 'multiselect', default: [], options: [], showIf: { field: 'mode', equals: 'CATEGORY' }, help: 'Populated from the catalog categories.' },
              { key: 'reviewSlaHours', label: 'Review SLA (hours)', type: 'number', default: 24, min: 1, max: 720, showIf: { field: 'enabled', equals: true }, help: 'How long admins have before the queued quote escalates.' },
              { key: 'autoApproveVerified', label: 'Auto-approve if seller is verified', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'autoRejectUnverified', label: 'Auto-reject if seller is unverified', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'notifyAdminOnQueue', label: 'Notify admin when a quote enters the queue', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'distribution',
        title: 'Distribution & Recipients',
        description: 'Control who receives an RFQ when a buyer publishes it, and how recipients are ranked.',
        groups: [
          {
            title: 'Eligibility',
            fields: [
              {
                key: 'mode', label: 'Distribution mode', type: 'select', default: 'FILTERED',
                options: [
                  { value: 'ALL_MATCHING', label: 'All matching sellers' },
                  { value: 'FILTERED', label: 'Filtered by criteria' },
                  { value: 'BUYER_SELECTED', label: 'Buyer selected' },
                  { value: 'HYBRID', label: 'Hybrid' },
                ],
              },
              { key: 'minVerification', label: 'Minimum seller verification level', type: 'select', default: 'EMAIL', options: VERIFICATION_LEVELS },
              { key: 'minRating', label: 'Minimum seller rating', type: 'number', default: 3.5, min: 0, max: 5, step: 0.1, help: 'Sellers below this rating are excluded.' },
              { key: 'maxSellers', label: 'Maximum sellers per RFQ', type: 'number', default: 20, min: 1, max: 500 },
              { key: 'requireSubscription', label: 'Require active subscription', type: 'toggle', default: false },
              { key: 'subscriptionPlans', label: 'Required subscription plans', type: 'multiselect', default: [], options: [
                { value: 'FREE', label: 'Free' }, { value: 'BASIC', label: 'Basic' },
                { value: 'PROFESSIONAL', label: 'Professional' }, { value: 'ENTERPRISE', label: 'Enterprise' },
              ], showIf: { field: 'requireSubscription', equals: true } },
            ],
          },
          {
            title: 'Recipient ranking preferences',
            fields: [
              { key: 'preferLowestPrice', label: 'Prefer lowest price', type: 'toggle', default: true },
              { key: 'preferCommission', label: 'Prefer highest platform commission', type: 'toggle', default: false },
              { key: 'preferFastest', label: 'Prefer fastest responders', type: 'toggle', default: false },
              { key: 'preferLocal', label: 'Prefer local sellers', type: 'toggle', default: true },
              { key: 'localRadiusKm', label: 'Local radius (km)', type: 'number', default: 200, min: 1, max: 5000, showIf: { field: 'preferLocal', equals: true } },
              { key: 'excludeDisputed', label: 'Exclude sellers with open disputes', type: 'toggle', default: true },
              { key: 'excludeSuspended', label: 'Exclude suspended accounts', type: 'toggle', default: true },
            ],
          },
          {
            title: 'Ranking weights (must sum to 100%)',
            description: 'Weighted factors used to order the recipient shortlist.',
            fields: [
              { key: 'weightVerification', label: 'Verification level', type: 'slider', default: 25, min: 0, max: 100, step: 5, unit: '%' },
              { key: 'weightRating', label: 'Seller rating', type: 'slider', default: 20, min: 0, max: 100, step: 5, unit: '%' },
              { key: 'weightCommission', label: 'Commission to platform', type: 'slider', default: 15, min: 0, max: 100, step: 5, unit: '%' },
              { key: 'weightResponseSpeed', label: 'Response speed', type: 'slider', default: 15, min: 0, max: 100, step: 5, unit: '%' },
              { key: 'weightProximity', label: 'Proximity to buyer', type: 'slider', default: 10, min: 0, max: 100, step: 5, unit: '%' },
              { key: 'weightWinRate', label: 'Historical win rate', type: 'slider', default: 15, min: 0, max: 100, step: 5, unit: '%' },
            ],
          },
        ],
      },
      {
        key: 'verification',
        title: 'Verification Requirements',
        description: 'Decide what level of verification each marketplace action requires.',
        groups: [
          {
            title: 'Action requirements',
            fields: [
              { key: 'reqListProducts', label: 'List products', type: 'select', default: 'NONE', options: VERIFICATION_LEVELS },
              { key: 'reqReceiveRfqs', label: 'Receive RFQs', type: 'select', default: 'EMAIL', options: VERIFICATION_LEVELS },
              { key: 'reqSubmitQuotes', label: 'Submit quotes', type: 'select', default: 'EMAIL', options: VERIFICATION_LEVELS },
              { key: 'reqConvertToOrder', label: 'Convert quote to order', type: 'select', default: 'KYB', options: VERIFICATION_LEVELS },
              { key: 'reqApprovePurchases', label: 'Approve purchases (in buyer org)', type: 'select', default: 'KYB', options: VERIFICATION_LEVELS },
            ],
          },
          {
            title: 'Maintenance',
            fields: [
              { key: 'expiryDays', label: 'Verification expiry (days)', type: 'number', default: 365, min: 30, max: 3650 },
              { key: 'reverifyOnMaterialChange', label: 'Re-verify on material change', type: 'toggle', default: true },
              { key: 'adminCanOverride', label: 'Admin can override any verification', type: 'toggle', default: true },
              { key: 'autoSuspendAfterDisputes', label: 'Auto-suspend after N disputes', type: 'number', default: 3, min: 1, max: 50 },
              { key: 'reminderBeforeExpiryDays', label: 'Send reminder before expiry (days)', type: 'number', default: 30, min: 1, max: 180 },
            ],
          },
        ],
      },
    ],
  },

  // ── 2. WORKFLOW FEATURES ──────────────────────────────────────────────────
  {
    key: 'workflow',
    title: 'Workflow Features',
    description: 'The negotiation-to-order machinery: cancellations, disputes, approvals, expiry and stock holds.',
    panels: [
      {
        key: 'cancellation',
        title: 'Cancellation',
        description: 'Define when and how quotes and orders can be cancelled.',
        groups: [
          {
            title: 'Quote cancellation',
            fields: [
              { key: 'enabled', label: 'Enable cancellation', type: 'toggle', default: true },
              {
                key: 'sellerWithdrawUntil', label: 'Seller can withdraw quote until', type: 'select', default: 'BUYER_ACCEPTS',
                options: [
                  { value: 'ANYTIME', label: 'Anytime before buyer decides' },
                  { value: 'BUYER_ACCEPTS', label: 'Buyer accepts' },
                  { value: 'NEVER', label: 'Never (locked once sent)' },
                ],
              },
              {
                key: 'buyerDeclineUntil', label: 'Buyer can decline quote until', type: 'select', default: 'ORDER_CONVERTED',
                options: [
                  { value: 'ANYTIME', label: 'Anytime while open' },
                  { value: 'ORDER_CONVERTED', label: 'Order converted' },
                ],
              },
              { key: 'autoExpireQuotesDays', label: 'Auto-expire quotes after (days)', type: 'number', default: 30, min: 1, max: 365 },
            ],
          },
          {
            title: 'Order cancellation',
            fields: [
              {
                key: 'buyerCancelUntil', label: 'Buyer can cancel until', type: 'select', default: 'PROCESSING_STARTS',
                options: [
                  { value: 'PROCESSING_STARTS', label: 'Processing starts' },
                  { value: 'SHIPPED', label: 'Shipped' },
                  { value: 'DELIVERED', label: 'Delivered' },
                  { value: 'NEVER', label: 'Never' },
                ],
              },
              {
                key: 'sellerCancelUntil', label: 'Seller can cancel until', type: 'select', default: 'PROCESSING_STARTS',
                options: [
                  { value: 'PROCESSING_STARTS', label: 'Processing starts' },
                  { value: 'SHIPPED', label: 'Shipped' },
                  { value: 'NEVER', label: 'Never' },
                ],
              },
              {
                key: 'afterProcessingRequires', label: 'After processing, requires', type: 'select', default: 'ADMIN_APPROVAL',
                options: [
                  { value: 'ADMIN_APPROVAL', label: 'Admin approval' },
                  { value: 'MUTUAL_CONSENT', label: 'Mutual consent' },
                  { value: 'NOT_ALLOWED', label: 'Not allowed' },
                ],
              },
              { key: 'cancellationFeePct', label: 'Cancellation fee (%)', type: 'number', default: 0, min: 0, max: 100, step: 0.5 },
              { key: 'releaseStockOnCancel', label: 'Release stock on cancel', type: 'toggle', default: true },
              { key: 'refundWorkflow', label: 'Refund workflow', type: 'select', default: 'MANUAL', options: [
                { value: 'MANUAL', label: 'Manual' }, { value: 'AUTOMATIC', label: 'Automatic' },
              ] },
            ],
          },
          {
            title: 'General',
            fields: [
              { key: 'requireReason', label: 'Require cancellation reason', type: 'toggle', default: true },
              { key: 'reasons', label: 'Available reasons', type: 'checkboxlist', default: [
                'CHANGED_MIND', 'BETTER_PRICE', 'BUDGET_CUT', 'OUT_OF_STOCK', 'CANNOT_FULFILL', 'OTHER',
              ], options: [
                { value: 'CHANGED_MIND', label: 'Changed mind' }, { value: 'BETTER_PRICE', label: 'Found better price' },
                { value: 'BUDGET_CUT', label: 'Budget cut' }, { value: 'OUT_OF_STOCK', label: 'Out of stock' },
                { value: 'CANNOT_FULFILL', label: 'Cannot fulfill' }, { value: 'OTHER', label: 'Other' },
              ] },
              { key: 'notifyCounterparty', label: 'Notify counterparty', type: 'toggle', default: true },
              { key: 'affectsSellerRating', label: 'Cancellation affects seller rating', type: 'toggle', default: false },
              { key: 'affectsBuyerScore', label: 'Cancellation affects buyer reliability score', type: 'toggle', default: true },
            ],
          },
        ],
      },
      {
        key: 'disputes',
        title: 'Dispute Resolution',
        description: 'How disagreements over delivered work are raised, mediated and closed.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable disputes', type: 'toggle', default: true },
              { key: 'windowDays', label: 'Dispute window after delivery (days)', type: 'number', default: 14, min: 1, max: 180, showIf: { field: 'enabled', equals: true } },
              { key: 'reasons', label: 'Dispute reasons', type: 'checkboxlist', default: [
                'NOT_AS_DESCRIBED', 'DAMAGED', 'LATE_DELIVERY', 'WRONG_QUANTITY', 'QUALITY_ISSUE', 'PAYMENT_NOT_RECEIVED', 'OTHER',
              ], options: [
                { value: 'NOT_AS_DESCRIBED', label: 'Not as described' }, { value: 'DAMAGED', label: 'Damaged' },
                { value: 'LATE_DELIVERY', label: 'Late delivery' }, { value: 'WRONG_QUANTITY', label: 'Wrong quantity' },
                { value: 'QUALITY_ISSUE', label: 'Quality issue' }, { value: 'PAYMENT_NOT_RECEIVED', label: 'Payment not received' },
                { value: 'OTHER', label: 'Other' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'workflow', label: 'Resolution workflow', type: 'select', default: 'ADMIN_MEDIATED', options: [
                { value: 'ADMIN_MEDIATED', label: 'Admin mediated' }, { value: 'AUTO_RESOLVE', label: 'Auto-resolve' },
                { value: 'PEER_REVIEW', label: 'Peer review' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'autoEscalateDays', label: 'Auto-escalate if unresolved (days)', type: 'number', default: 7, min: 1, max: 90, showIf: { field: 'enabled', equals: true } },
              { key: 'allowPartial', label: 'Allow partial resolution', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'outcomes', label: 'Allowed outcomes', type: 'checkboxlist', default: [
                'FULL_REFUND', 'PARTIAL_REFUND', 'REPLACEMENT', 'REPAIR', 'NO_ACTION', 'SELLER_PENALTY',
              ], options: [
                { value: 'FULL_REFUND', label: 'Full refund' }, { value: 'PARTIAL_REFUND', label: 'Partial refund' },
                { value: 'REPLACEMENT', label: 'Replacement' }, { value: 'REPAIR', label: 'Repair' },
                { value: 'NO_ACTION', label: 'No action' }, { value: 'SELLER_PENALTY', label: 'Seller penalty' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'affectsSellerRating', label: 'Dispute affects seller rating', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'affectsVerification', label: 'Dispute affects verification status', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'onlyAdminClose', label: 'Only admin can close dispute', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'buyerCancelOwn', label: 'Buyer can cancel own dispute', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'sellerResponseDays', label: 'Seller response window (days)', type: 'number', default: 3, min: 1, max: 30, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'partialAcceptance',
        title: 'Partial Acceptance',
        description: 'Let buyers award parts of an RFQ — per line, or across multiple sellers.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable partial acceptance', type: 'toggle', default: true },
              {
                key: 'scope', label: 'Partial scope', type: 'select', default: 'PER_LINE',
                options: [
                  { value: 'PER_LINE', label: 'Per line' },
                  { value: 'PER_LINE_PARTIAL_QTY', label: 'Per line + partial quantity' },
                ],
                showIf: { field: 'enabled', equals: true },
              },
              { key: 'multiSellerAward', label: 'Allow multi-seller award', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'minAcceptancePct', label: 'Minimum acceptance percentage', type: 'number', default: 50, min: 1, max: 100, unit: '%', showIf: { field: 'enabled', equals: true } },
              { key: 'orgApprovalRequired', label: 'Buyer org approval required for partial', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'sellerRejectPartial', label: 'Seller can reject partial award', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'sellerRejectionWindowHours', label: 'Seller rejection window (hours)', type: 'number', default: 24, min: 1, max: 720, showIf: { field: 'enabled', equals: true } },
              { key: 'autoDeclineNonSelected', label: 'Auto-decline non-selected lines', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'notifyNonSelected', label: 'Notify non-selected sellers', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'combinedInvoice', label: 'Combined invoice for multi-seller', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'multiLevelApproval',
        title: 'Multi-Level Approval',
        description: 'Approval chains by amount — who signs off on what before a purchase is committed.',
        groups: [
          {
            title: 'Approval levels',
            description: 'Amount bands and the roles that must sign off inside each band. Organizations refine these within the platform frame.',
            fields: [
              { key: 'enabled', label: 'Enable multi-level approval', type: 'toggle', default: true },
              {
                key: 'levels', label: 'Approval levels', type: 'table', default: [
                  { name: 'Manager', fromAmount: 0, toAmount: 10000, roles: 'Org Manager', approvalsNeeded: 1, parallel: false, slaHours: 24, escalateTo: 'Director' },
                  { name: 'Manager + Finance', fromAmount: 10000, toAmount: 100000, roles: 'Org Manager, Org Finance', approvalsNeeded: 2, parallel: true, slaHours: 48, escalateTo: 'Director' },
                  { name: 'Full Chain', fromAmount: 100000, toAmount: null, roles: 'Org Manager, Org Finance, Org CEO', approvalsNeeded: 3, parallel: false, slaHours: 72, escalateTo: 'Platform Admin' },
                ],
                columns: [
                  { key: 'name', label: 'Level name', type: 'text', placeholder: 'Manager', width: 'w-40' },
                  { key: 'fromAmount', label: 'From ($)', type: 'number', placeholder: '0', width: 'w-24' },
                  { key: 'toAmount', label: 'To ($)', type: 'number', placeholder: '∞', width: 'w-24' },
                  { key: 'roles', label: 'Required roles', type: 'text', placeholder: 'Org Manager', width: 'w-48' },
                  { key: 'approvalsNeeded', label: 'Approvals', type: 'number', placeholder: '1', width: 'w-20' },
                  { key: 'parallel', label: 'Parallel', type: 'toggle' },
                  { key: 'slaHours', label: 'SLA (h)', type: 'number', placeholder: '24', width: 'w-20' },
                  { key: 'escalateTo', label: 'Escalate to', type: 'text', placeholder: 'Director', width: 'w-32' },
                ],
                newRow: { name: '', fromAmount: 0, toAmount: null, roles: '', approvalsNeeded: 1, parallel: false, slaHours: 24, escalateTo: '' },
                maxRows: 10,
                showIf: { field: 'enabled', equals: true },
              },
            ],
          },
          {
            title: 'Rules',
            fields: [
              { key: 'requesterSelfApprove', label: 'Requester can self-approve', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'delegationAllowed', label: 'Delegation allowed', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'maxDelegationDays', label: 'Max delegation (days)', type: 'number', default: 14, min: 1, max: 90, showIf: { field: 'enabled', equals: true } },
              { key: 'autoApproveOnSlaBreach', label: 'Auto-approve on SLA breach', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'autoEscalateOnSlaBreach', label: 'Auto-escalate on SLA breach', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'adminCanBypass', label: 'Admin can bypass approval', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'holdStockDuringApproval', label: 'Hold stock during approval', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true }, help: 'Orders awaiting approval keep their stock reserved — no oversell.' },
              { key: 'stockHoldTimeoutHours', label: 'Stock hold timeout (hours)', type: 'number', default: 72, min: 1, max: 720, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'rfqExpiry',
        title: 'RFQ Expiry',
        description: 'Deadlines keep negotiations honest: RFQs close, quotes lapse, everyone gets warned first.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable RFQ expiry', type: 'toggle', default: true },
              { key: 'defaultDays', label: 'Default expiry (days)', type: 'number', default: 14, min: 1, max: 90, showIf: { field: 'enabled', equals: true } },
              { key: 'minDays', label: 'Minimum expiry (days)', type: 'number', default: 1, min: 1, max: 30, showIf: { field: 'enabled', equals: true } },
              { key: 'maxDays', label: 'Maximum expiry (days)', type: 'number', default: 90, min: 1, max: 365, showIf: { field: 'enabled', equals: true } },
              { key: 'buyerOverride', label: 'Buyer can override default', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'remindersSellers', label: 'Remind sellers before expiry (hours)', type: 'numberlist', default: [48, 12], min: 1, max: 336, unit: 'h before', showIf: { field: 'enabled', equals: true } },
              { key: 'remindersBuyer', label: 'Remind buyer before expiry (hours)', type: 'numberlist', default: [24, 6], min: 1, max: 336, unit: 'h before', showIf: { field: 'enabled', equals: true } },
              { key: 'notifyBuyerOnExpiry', label: 'Notify buyer on expiry', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'notifyUnresponded', label: 'Notify unresponded sellers on expiry', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'actionOnExpiry', label: 'Action on expiry', type: 'select', default: 'AUTO_CLOSE', options: [
                { value: 'AUTO_CLOSE', label: 'Auto-close' }, { value: 'AUTO_ARCHIVE', label: 'Auto-archive' },
                { value: 'KEEP_OPEN', label: 'Keep open' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'graceHours', label: 'Grace period (hours)', type: 'number', default: 2, min: 0, max: 72, showIf: { field: 'enabled', equals: true } },
              { key: 'allowExtension', label: 'Allow buyer extension', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'maxExtensions', label: 'Max extensions', type: 'number', default: 2, min: 0, max: 10, showIf: { field: 'allowExtension', equals: true } },
              { key: 'extensionDays', label: 'Extension length (days)', type: 'number', default: 7, min: 1, max: 90, showIf: { field: 'allowExtension', equals: true } },
              { key: 'expiredVisibleBuyer', label: 'Expired RFQs visible to buyer', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'expiredVisibleSellers', label: 'Expired RFQs visible to sellers', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'autoArchiveDays', label: 'Auto-archive after (days)', type: 'number', default: 90, min: 1, max: 730, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'stockHold',
        title: 'Stock Hold',
        description: 'Reserve inventory between quote acceptance and order creation so a better offer can\u2019t steal it.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable stock hold', type: 'toggle', default: true },
              { key: 'holdTrigger', label: 'Hold trigger', type: 'select', default: 'QUOTE_ACCEPTED', options: [
                { value: 'QUOTE_ACCEPTED', label: 'Quote accepted' }, { value: 'ORDER_CREATED', label: 'Order created' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'releaseOn', label: 'Release hold on', type: 'checkboxlist', default: [
                'ORDER_CREATED', 'APPROVAL_REJECTED', 'APPROVAL_TIMEOUT', 'CANCELLED',
              ], options: [
                { value: 'ORDER_CREATED', label: 'Order created' }, { value: 'APPROVAL_REJECTED', label: 'Approval rejected' },
                { value: 'APPROVAL_TIMEOUT', label: 'Approval timeout' }, { value: 'CANCELLED', label: 'Cancelled' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'holdTimeoutHours', label: 'Hold timeout (hours)', type: 'number', default: 72, min: 1, max: 720, showIf: { field: 'enabled', equals: true } },
              { key: 'timeoutAction', label: 'Action on hold timeout', type: 'select', default: 'RELEASE_NOTIFY', options: [
                { value: 'RELEASE_NOTIFY', label: 'Auto-release and notify' }, { value: 'EXTEND', label: 'Extend' },
                { value: 'ESCALATE', label: 'Escalate' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'allowOverlapping', label: 'Allow overlapping holds', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'reserveVariantLevel', label: 'Reserve at variant level', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'reserveWarehouseLevel', label: 'Reserve at warehouse level', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'lowStockThreshold', label: 'Low stock threshold', type: 'number', default: 10, min: 0, max: 10000, showIf: { field: 'enabled', equals: true } },
              { key: 'blockQuotesZeroStock', label: 'Block quotes when stock is zero', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'showStockToBuyer', label: 'Show available stock to buyer', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'adminCanRelease', label: 'Admin can release hold', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'sellerCanRelease', label: 'Seller can release hold', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
    ],
  },

  // ── 3. COMMERCIAL RULES ───────────────────────────────────────────────────
  {
    key: 'commercial',
    title: 'Commercial Rules',
    description: 'Money mechanics: quantity ladders, minimums, ceilings, commission and lead-time commitments.',
    panels: [
      {
        key: 'tieredPricing',
        title: 'Tiered Pricing',
        description: 'Quantity-break ladders on products, auto-applied when sellers quote. Sellers maintain their own tier tables per product.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable tiered pricing', type: 'toggle', default: true },
              { key: 'maxTiers', label: 'Max tiers per product', type: 'number', default: 10, min: 1, max: 20, showIf: { field: 'enabled', equals: true } },
              { key: 'autoApplyInQuote', label: 'Auto-apply tiers in quote', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true }, help: 'Pre-fills the seller quote composer with the matching tier price.' },
              { key: 'sellerCanOverride', label: 'Seller can override tier price', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'buyerSeesTiers', label: 'Buyer can see tier structure', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'showSavings', label: 'Show savings vs base price', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'moq',
        title: 'Minimum Order Quantity',
        description: 'Floor quantities per product — enforced where you want, suggested where you don\u2019t. Sellers set their own MOQ per product.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable MOQ enforcement', type: 'toggle', default: true },
              { key: 'enforcementMode', label: 'Enforcement mode', type: 'select', default: 'BLOCK', options: [
                { value: 'BLOCK', label: 'Block' }, { value: 'WARN', label: 'Warn' },
                { value: 'SELLER_APPROVAL', label: 'Require seller approval' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'scope', label: 'MOQ scope', type: 'select', default: 'PER_PRODUCT', options: [
                { value: 'PER_PRODUCT', label: 'Per product' }, { value: 'PER_CATEGORY', label: 'Per category' },
                { value: 'PER_SELLER', label: 'Per seller' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'allowBelowRequest', label: 'Allow buyer to request below MOQ', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'belowRequiresApproval', label: 'Below-MOQ requests require seller approval', type: 'toggle', default: true, showIf: { field: 'allowBelowRequest', equals: true } },
              { key: 'showToBuyer', label: 'Show MOQ to buyer', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'displayStyle', label: 'MOQ display style', type: 'select', default: 'BADGE', options: [
                { value: 'BADGE', label: 'Badge' }, { value: 'TEXT', label: 'Text' }, { value: 'TOOLTIP', label: 'Tooltip' },
              ], showIf: { field: 'showToBuyer', equals: true } },
              { key: 'blockRfqBelow', label: 'Block RFQ submission below MOQ', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'leadTime',
        title: 'Lead Time & Capacity',
        description: 'Sellers commit to dispatch windows and throughput ceilings; buyers see the promises.',
        groups: [
          {
            fields: [
              { key: 'trackLeadTime', label: 'Track lead time', type: 'toggle', default: true },
              { key: 'trackCapacity', label: 'Track production capacity', type: 'toggle', default: true },
              { key: 'capacityUnit', label: 'Capacity unit', type: 'select', default: 'UNIT', options: [
                { value: 'UNIT', label: 'Unit' }, { value: 'ORDER', label: 'Order' }, { value: 'BATCH', label: 'Batch' },
                { value: 'KG', label: 'Kg' }, { value: 'M2', label: 'm²' },
              ], showIf: { field: 'trackCapacity', equals: true } },
              { key: 'capacityEnforcement', label: 'Capacity enforcement', type: 'select', default: 'WARN', options: [
                { value: 'WARN', label: 'Warn' }, { value: 'BLOCK', label: 'Block' }, { value: 'APPROVAL', label: 'Require approval' },
              ], showIf: { field: 'trackCapacity', equals: true } },
              { key: 'blockIfExceeded', label: 'Block quote if capacity exceeded', type: 'toggle', default: false, showIf: { field: 'trackCapacity', equals: true } },
              { key: 'allowPartialCapacity', label: 'Allow partial capacity quote', type: 'toggle', default: true, showIf: { field: 'trackCapacity', equals: true } },
              { key: 'showLeadTimeToBuyer', label: 'Show lead time to buyer', type: 'toggle', default: true, showIf: { field: 'trackLeadTime', equals: true } },
              { key: 'showCapacityToBuyer', label: 'Show capacity to buyer', type: 'toggle', default: false, showIf: { field: 'trackCapacity', equals: true } },
              { key: 'leadTimeAffectsRanking', label: 'Lead time affects ranking', type: 'toggle', default: true, showIf: { field: 'trackLeadTime', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'priceCeiling',
        title: 'Price Ceiling',
        description: 'Guardrails against opportunistic quoting — absolute or relative to market averages.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable price ceiling', type: 'toggle', default: true },
              { key: 'ceilingType', label: 'Ceiling type', type: 'select', default: 'PCT_CATEGORY_AVG', options: [
                { value: 'FIXED', label: 'Fixed amount' }, { value: 'PCT_MARKET', label: '% above market' },
                { value: 'PCT_CATEGORY_AVG', label: '% above category average' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'ceilingValue', label: 'Ceiling value', type: 'number', default: 50, min: 0, max: 1000000, step: 1, showIf: { field: 'enabled', equals: true }, help: 'Fixed amount, or percentage depending on type.' },
              { key: 'applyPer', label: 'Apply per', type: 'select', default: 'CATEGORY', options: [
                { value: 'CATEGORY', label: 'Category' }, { value: 'PRODUCT', label: 'Product' }, { value: 'SELLER', label: 'Seller' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'blockAbove', label: 'Block quotes above ceiling', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'flagButAllow', label: 'Flag but allow', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'notifyAdminAbove', label: 'Notify admin above ceiling', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'commission',
        title: 'Commission Disclosure',
        description: 'What the platform takes, who pays it, and who sees it.',
        groups: [
          {
            title: 'Model',
            fields: [
              { key: 'enabled', label: 'Enable commission', type: 'toggle', default: true },
              { key: 'model', label: 'Commission model', type: 'select', default: 'PERCENT', options: [
                { value: 'PERCENT', label: '% of order' }, { value: 'FIXED', label: 'Fixed' }, { value: 'TIERED', label: 'Tiered' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'value', label: 'Commission value', type: 'number', default: 2.5, min: 0, max: 100, step: 0.1, unit: '%', showIf: { field: 'enabled', equals: true } },
              { key: 'payer', label: 'Commission payer', type: 'select', default: 'SELLER', options: [
                { value: 'SELLER', label: 'Seller' }, { value: 'BUYER', label: 'Buyer' }, { value: 'BOTH', label: 'Both' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'base', label: 'Commission base', type: 'select', default: 'BEFORE_TAX', options: [
                { value: 'BEFORE_TAX', label: 'Order total before tax' }, { value: 'AFTER_TAX', label: 'After tax' },
                { value: 'SUBTOTAL', label: 'Subtotal only' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'min', label: 'Minimum commission', type: 'number', default: 1, min: 0, max: 10000, step: 0.5, showIf: { field: 'enabled', equals: true } },
              { key: 'max', label: 'Maximum commission', type: 'number', default: 500, min: 0, max: 1000000, step: 5, showIf: { field: 'enabled', equals: true } },
              { key: 'currency', label: 'Currency', type: 'select', default: 'USD', options: CURRENCIES, showIf: { field: 'enabled', equals: true } },
            ],
          },
          {
            title: 'Disclosure',
            fields: [
              { key: 'showBuyer', label: 'Show to buyer', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'showSeller', label: 'Show to seller', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'showOnInvoice', label: 'Show on invoice', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'showOnStatement', label: 'Show on platform statement', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'disclosureTiming', label: 'Disclosure timing', type: 'select', default: 'AFTER_ORDER_CONFIRMED', options: [
                { value: 'AFTER_ORDER_CONFIRMED', label: 'After order confirmed' }, { value: 'ON_QUOTE', label: 'On quote' },
                { value: 'PRE_DEAL', label: 'Pre-deal' }, { value: 'NEVER', label: 'Never' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'waiveIfSubscribed', label: 'Waive if seller subscribed', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'trustedDiscountPct', label: 'Discount for trusted sellers (%)', type: 'number', default: 0, min: 0, max: 100, step: 0.5, showIf: { field: 'enabled', equals: true } },
              { key: 'negotiable', label: 'Can be negotiated', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
            ],
          },
          {
            title: 'Per-category overrides',
            fields: [
              {
                key: 'categoryOverrides', label: 'Category overrides', type: 'table', default: [],
                columns: [
                  { key: 'category', label: 'Category', type: 'text', placeholder: 'Electronics', width: 'w-44' },
                  { key: 'commissionPct', label: 'Commission (%)', type: 'number', placeholder: '2.5', width: 'w-28' },
                ],
                newRow: { category: '', commissionPct: 2.5 },
                maxRows: 20,
                showIf: { field: 'enabled', equals: true },
              },
            ],
          },
        ],
      },
    ],
  },

  // ── 4. PRODUCTIVITY ───────────────────────────────────────────────────────
  {
    key: 'productivity',
    title: 'Productivity',
    description: 'Repeat purchases and reusable request templates.',
    panels: [
      {
        key: 'recurring',
        title: 'Recurring RFQs',
        description: 'Standing purchase schedules — the RFQ re-publishes itself each cycle. Buyers configure their own schedules.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable recurring RFQs', type: 'toggle', default: true },
              { key: 'patterns', label: 'Allowed patterns', type: 'checkboxlist', default: [
                'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'CUSTOM',
              ], options: [
                { value: 'WEEKLY', label: 'Weekly' }, { value: 'BIWEEKLY', label: 'Biweekly' },
                { value: 'MONTHLY', label: 'Monthly' }, { value: 'QUARTERLY', label: 'Quarterly' },
                { value: 'CUSTOM', label: 'Custom' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'maxActivePerBuyer', label: 'Max active recurring per buyer', type: 'number', default: 20, min: 1, max: 200, showIf: { field: 'enabled', equals: true } },
              { key: 'autoPublish', label: 'Auto-publish on schedule', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'autoApprove', label: 'Auto-approve for recurring', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'notifyBeforeHours', label: 'Notify buyer before generation (hours)', type: 'number', default: 24, min: 1, max: 168, showIf: { field: 'enabled', equals: true } },
              { key: 'buyerEditBeforeSend', label: 'Buyer can edit before send', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'buyerSkipCycle', label: 'Buyer can skip one cycle', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'autoCancelEmptyCycles', label: 'Auto-cancel after N empty cycles', type: 'number', default: 3, min: 1, max: 26, showIf: { field: 'enabled', equals: true } },
              { key: 'keepSameRecipients', label: 'Keep same recipients each cycle', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'allowRecipientRefresh', label: 'Allow recipient refresh', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'templates',
        title: 'RFQ Templates',
        description: 'Reusable request blueprints — platform-curated, org-shared, or personal.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable templates', type: 'toggle', default: true },
              { key: 'platformTemplates', label: 'Platform templates', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'orgTemplates', label: 'Org templates', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'userTemplates', label: 'User templates', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'maxPerUser', label: 'Max templates per user', type: 'number', default: 50, min: 1, max: 500, showIf: { field: 'enabled', equals: true } },
              { key: 'maxPerOrg', label: 'Max templates per org', type: 'number', default: 200, min: 1, max: 2000, showIf: { field: 'enabled', equals: true } },
              { key: 'includesRecipients', label: 'Template includes recipients', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'includesTerms', label: 'Template includes terms', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'includesSchedule', label: 'Template includes schedule', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'shareWithinOrg', label: 'Share within org', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'shareAcrossOrgs', label: 'Share across orgs', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'publicTemplates', label: 'Public templates', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'adminCurates', label: 'Admin curates templates', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'versioning', label: 'Template versioning', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'previewBeforeUse', label: 'Preview before use', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
    ],
  },

  // ── 5. TRUST & COMPLIANCE ─────────────────────────────────────────────────
  {
    key: 'trust',
    title: 'Trust & Compliance',
    description: 'Immutable records, spam defense and the trust signals buyers see on every quote.',
    panels: [
      {
        key: 'auditTrail',
        title: 'Audit Trail',
        description: 'Every negotiation event, immutably logged. Retention and export are yours to configure.',
        groups: [
          {
            fields: [
              { key: 'enabled', label: 'Enable audit trail', type: 'toggle', default: true },
              { key: 'immutable', label: 'Immutable audit', type: 'toggle', default: true, locked: true, help: 'Platform invariant — cannot be disabled.' },
              { key: 'retentionYears', label: 'Retention (years)', type: 'number', default: 7, min: 1, max: 30, showIf: { field: 'enabled', equals: true } },
              { key: 'exportFormats', label: 'Export formats', type: 'checkboxlist', default: ['CSV', 'JSON', 'PDF'], options: [
                { value: 'CSV', label: 'CSV' }, { value: 'JSON', label: 'JSON' }, { value: 'PDF', label: 'PDF' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'signatureType', label: 'Signature type', type: 'select', default: 'HMAC_SHA256', options: [
                { value: 'HMAC_SHA256', label: 'HMAC-SHA256' }, { value: 'RSA', label: 'RSA' }, { value: 'NONE', label: 'None' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'externalArchive', label: 'External archive', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
              { key: 'externalEndpoint', label: 'External archive endpoint', type: 'text', default: '', placeholder: 'https://archive.example.com/hook', showIf: { field: 'externalArchive', equals: true } },
            ],
          },
          {
            title: 'Events logged',
            description: 'Core negotiation events are always logged (immutable guarantee).',
            fields: [
              { key: 'logRfqLifecycle', label: 'RFQ created / edited / published', type: 'toggle', default: true, locked: true },
              { key: 'logRecipients', label: 'Recipients added / removed', type: 'toggle', default: true },
              { key: 'logQuotes', label: 'Quote submitted / edited / withdrawn', type: 'toggle', default: true },
              { key: 'logQuoteDecisions', label: 'Quote accepted / rejected', type: 'toggle', default: true },
              { key: 'logMessages', label: 'Messages sent', type: 'toggle', default: true },
              { key: 'logApprovals', label: 'Approval requested / approved / rejected', type: 'toggle', default: true },
              { key: 'logOrders', label: 'Order created / cancelled', type: 'toggle', default: true },
              { key: 'logDisputes', label: 'Dispute raised / resolved', type: 'toggle', default: true },
              { key: 'logStockHolds', label: 'Stock held / released', type: 'toggle', default: true },
            ],
          },
        ],
      },
      {
        key: 'spamPrevention',
        title: 'Spam Prevention',
        description: 'Rate limits, duplicate detection and abuse escalation across the RFQ pipeline.',
        groups: [
          {
            title: 'Rate limits',
            fields: [
              { key: 'enabled', label: 'Enable anti-spam', type: 'toggle', default: true },
              { key: 'maxRfqsBuyerDay', label: 'Max RFQs per buyer per day', type: 'number', default: 50, min: 1, max: 5000, showIf: { field: 'enabled', equals: true } },
              { key: 'maxRfqsOrgDay', label: 'Max RFQs per org per day', type: 'number', default: 200, min: 1, max: 20000, showIf: { field: 'enabled', equals: true } },
              { key: 'maxQuotesSellerDay', label: 'Max quotes per seller per day', type: 'number', default: 100, min: 1, max: 10000, showIf: { field: 'enabled', equals: true } },
              { key: 'maxMessagesThreadDay', label: 'Max messages per thread per day', type: 'number', default: 500, min: 1, max: 10000, showIf: { field: 'enabled', equals: true } },
              { key: 'maxRecipientsPerRfq', label: 'Max recipients per RFQ', type: 'number', default: 100, min: 1, max: 1000, showIf: { field: 'enabled', equals: true } },
            ],
          },
          {
            title: 'Duplicate & pattern detection',
            fields: [
              { key: 'duplicateDetection', label: 'Duplicate content detection', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'suppressIdenticalHours', label: 'Suppress identical RFQs within (hours)', type: 'number', default: 24, min: 1, max: 720, showIf: { field: 'duplicateDetection', equals: true } },
              { key: 'minAccountAgeDays', label: 'Min account age to post (days)', type: 'number', default: 1, min: 0, max: 365, showIf: { field: 'enabled', equals: true } },
              { key: 'requireVerifiedContact', label: 'Require verified contact to quote', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
            ],
          },
          {
            title: 'Enforcement',
            fields: [
              { key: 'rateLimitAction', label: 'Action on rate limit', type: 'select', default: 'BLOCK_NOTIFY', options: [
                { value: 'BLOCK_NOTIFY', label: 'Block and notify' }, { value: 'WARN', label: 'Warn' },
                { value: 'CAPTCHA', label: 'Require CAPTCHA' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'suspiciousAction', label: 'Action on suspicious pattern', type: 'select', default: 'FLAG_REVIEW', options: [
                { value: 'FLAG_REVIEW', label: 'Flag for review' }, { value: 'BLOCK', label: 'Block' }, { value: 'SUSPEND', label: 'Suspend' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'autoSuspendAfterViolations', label: 'Auto-suspend after N violations', type: 'number', default: 3, min: 1, max: 50, showIf: { field: 'enabled', equals: true } },
              { key: 'suspendDurationDays', label: 'Suspend duration (days)', type: 'number', default: 7, min: 1, max: 365, showIf: { field: 'enabled', equals: true } },
              { key: 'captchaUnverified', label: 'CAPTCHA for unverified users', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'sellerRating',
        title: 'Seller Rating in Quotes',
        description: 'The trust signals shown next to every quote a buyer receives.',
        groups: [
          {
            fields: [
              { key: 'show', label: 'Show seller rating in quote', type: 'toggle', default: true },
              { key: 'showStars', label: 'Show star average', type: 'toggle', default: true, showIf: { field: 'show', equals: true } },
              { key: 'showReviewCount', label: 'Show review count', type: 'toggle', default: true, showIf: { field: 'show', equals: true } },
              { key: 'showVerificationBadge', label: 'Show verification badge', type: 'toggle', default: true, showIf: { field: 'show', equals: true } },
              { key: 'showResponseTime', label: 'Show average response time', type: 'toggle', default: true, showIf: { field: 'show', equals: true } },
              { key: 'showWinRate', label: 'Show win rate', type: 'toggle', default: true, showIf: { field: 'show', equals: true } },
              { key: 'showDisputeCount', label: 'Show dispute count', type: 'toggle', default: false, showIf: { field: 'show', equals: true } },
              { key: 'showMemberSince', label: 'Show member since', type: 'toggle', default: true, showIf: { field: 'show', equals: true } },
              { key: 'minReviews', label: 'Minimum reviews to display', type: 'number', default: 3, min: 0, max: 100, showIf: { field: 'show', equals: true } },
              { key: 'sortable', label: 'Rating sortable', type: 'toggle', default: true, showIf: { field: 'show', equals: true } },
              { key: 'sortWeight', label: 'Rating weight in default sort', type: 'slider', default: 20, min: 0, max: 100, step: 5, unit: '%', showIf: { field: 'show', equals: true } },
            ],
          },
        ],
      },
    ],
  },

  // ── 6. PAYMENT METHODS ────────────────────────────────────────────────────
  {
    key: 'payments',
    title: 'Payment Methods',
    description: 'Bank transfer, cash on delivery and the default payment terms offered on quotes.',
    panels: [
      {
        key: 'paymentMethods',
        title: 'Payment Methods',
        description: 'How buyers pay and what proof the platform requires.',
        groups: [
          {
            title: 'Bank transfer',
            fields: [
              { key: 'bankEnabled', label: 'Enable bank transfer', type: 'toggle', default: true },
              { key: 'requireReference', label: 'Require reference number', type: 'toggle', default: true, showIf: { field: 'bankEnabled', equals: true } },
              { key: 'requireReceipt', label: 'Require receipt upload', type: 'toggle', default: true, showIf: { field: 'bankEnabled', equals: true } },
              { key: 'receiptFormats', label: 'Accepted receipt formats', type: 'checkboxlist', default: ['PDF', 'JPG', 'PNG'], options: [
                { value: 'PDF', label: 'PDF' }, { value: 'JPG', label: 'JPG' }, { value: 'PNG', label: 'PNG' },
              ], showIf: { field: 'bankEnabled', equals: true } },
              { key: 'maxReceiptMb', label: 'Max receipt size (MB)', type: 'number', default: 10, min: 1, max: 50, showIf: { field: 'bankEnabled', equals: true } },
              { key: 'adminVerifiesReceipt', label: 'Admin verifies receipt', type: 'toggle', default: true, showIf: { field: 'bankEnabled', equals: true } },
              { key: 'autoMatchReference', label: 'Auto-match reference to order', type: 'toggle', default: true, showIf: { field: 'bankEnabled', equals: true } },
            ],
          },
          {
            title: 'Cash on delivery',
            fields: [
              { key: 'codEnabled', label: 'Enable cash on delivery', type: 'toggle', default: true },
              { key: 'codMaxAmount', label: 'COD max amount', type: 'number', default: 5000, min: 0, max: 1000000, step: 100, showIf: { field: 'codEnabled', equals: true } },
              { key: 'codCurrency', label: 'COD currency', type: 'select', default: 'USD', options: CURRENCIES, showIf: { field: 'codEnabled', equals: true } },
              { key: 'codRequireConfirm', label: 'Require buyer confirmation on COD', type: 'toggle', default: true, showIf: { field: 'codEnabled', equals: true } },
              { key: 'sellerCanDisableCod', label: 'Seller can disable COD', type: 'toggle', default: true, showIf: { field: 'codEnabled', equals: true } },
            ],
          },
          {
            title: 'Payment terms',
            fields: [
              { key: 'defaultTerms', label: 'Default payment terms', type: 'select', default: 'NET-30', options: [
                { value: 'PREPAID', label: 'Prepaid' }, { value: 'NET-15', label: 'NET-15' },
                { value: 'NET-30', label: 'NET-30' }, { value: 'NET-45', label: 'NET-45' }, { value: 'NET-60', label: 'NET-60' },
              ] },
              { key: 'buyerCustomTerms', label: 'Buyer can request custom terms', type: 'toggle', default: true },
              { key: 'sellerApprovesTerms', label: 'Seller approves terms', type: 'toggle', default: true },
            ],
          },
        ],
      },
    ],
  },

  // ── 7. REPORTS ────────────────────────────────────────────────────────────
  {
    key: 'reports',
    title: 'Reports',
    description: 'Performance dashboards and scheduled digests for each side of the marketplace.',
    panels: [
      {
        key: 'sellerReports',
        title: 'Seller Reports',
        description: 'Quote-desk analytics available to seller organizations.',
        groups: [
          {
            title: 'Metrics to display',
            fields: [
              { key: 'enabled', label: 'Enable seller reports', type: 'toggle', default: true },
              { key: 'metrics', label: 'Metrics', type: 'checkboxlist', default: [
                'RFQS_RECEIVED', 'RFQS_RESPONDED', 'RESPONSE_RATE', 'AVG_RESPONSE_TIME', 'QUOTES_SUBMITTED',
                'QUOTES_WON', 'WIN_RATE', 'AVG_QUOTE_VALUE', 'REVENUE_WON', 'LOST_BY_REASON', 'TOP_BUYERS',
                'TOP_CATEGORIES', 'TOP_PRODUCTS',
              ], options: [
                { value: 'RFQS_RECEIVED', label: 'RFQs received' }, { value: 'RFQS_RESPONDED', label: 'RFQs responded' },
                { value: 'RESPONSE_RATE', label: 'Response rate' }, { value: 'AVG_RESPONSE_TIME', label: 'Average response time' },
                { value: 'QUOTES_SUBMITTED', label: 'Quotes submitted' }, { value: 'QUOTES_WON', label: 'Quotes won' },
                { value: 'WIN_RATE', label: 'Win rate' }, { value: 'AVG_QUOTE_VALUE', label: 'Average quote value' },
                { value: 'REVENUE_WON', label: 'Total revenue won' }, { value: 'LOST_BY_REASON', label: 'Lost deals by reason' },
                { value: 'TOP_BUYERS', label: 'Top buyers' }, { value: 'TOP_CATEGORIES', label: 'Top categories' },
                { value: 'TOP_PRODUCTS', label: 'Top products' },
              ], showIf: { field: 'enabled', equals: true } },
            ],
          },
          {
            title: 'Delivery',
            fields: [
              { key: 'timeRanges', label: 'Time ranges available', type: 'checkboxlist', default: ['7D', '30D', '90D', 'YTD', 'CUSTOM'], options: [
                { value: '7D', label: '7 days' }, { value: '30D', label: '30 days' }, { value: '90D', label: '90 days' },
                { value: 'YTD', label: 'Year to date' }, { value: 'CUSTOM', label: 'Custom' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'exportFormats', label: 'Export formats', type: 'checkboxlist', default: ['CSV', 'PDF'], options: [
                { value: 'CSV', label: 'CSV' }, { value: 'PDF', label: 'PDF' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'weeklyEmail', label: 'Weekly email report', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'monthlyEmail', label: 'Monthly email report', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'recipients', label: 'Report recipients', type: 'multiselect', default: ['ORG_OWNER', 'ORG_MANAGER'], options: [
                { value: 'ORG_OWNER', label: 'Org Owner' }, { value: 'ORG_MANAGER', label: 'Org Manager' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'compareCompetitors', label: 'Compare to competitors', type: 'toggle', default: false, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
      {
        key: 'buyerReports',
        title: 'Buyer Reports',
        description: 'Sourcing analytics available to buyer organizations.',
        groups: [
          {
            title: 'Metrics to display',
            fields: [
              { key: 'enabled', label: 'Enable buyer reports', type: 'toggle', default: true },
              { key: 'metrics', label: 'Metrics', type: 'checkboxlist', default: [
                'RFQS_CREATED', 'QUOTES_RECEIVED', 'QUOTES_PER_RFQ', 'AVG_SELLER_RESPONSE', 'SAVINGS_VS_TARGET',
                'TOTAL_SPEND', 'SPEND_BY_CATEGORY', 'SPEND_BY_SELLER', 'TOP_SELLERS', 'APPROVAL_CYCLE_TIME',
                'CANCELLATION_RATE', 'DISPUTE_RATE',
              ], options: [
                { value: 'RFQS_CREATED', label: 'Total RFQs created' }, { value: 'QUOTES_RECEIVED', label: 'Total quotes received' },
                { value: 'QUOTES_PER_RFQ', label: 'Average quotes per RFQ' }, { value: 'AVG_SELLER_RESPONSE', label: 'Average seller response time' },
                { value: 'SAVINGS_VS_TARGET', label: 'Average savings vs target' }, { value: 'TOTAL_SPEND', label: 'Total spend' },
                { value: 'SPEND_BY_CATEGORY', label: 'Spend by category' }, { value: 'SPEND_BY_SELLER', label: 'Spend by seller' },
                { value: 'TOP_SELLERS', label: 'Top sellers by win' }, { value: 'APPROVAL_CYCLE_TIME', label: 'Approval cycle time' },
                { value: 'CANCELLATION_RATE', label: 'Cancellation rate' }, { value: 'DISPUTE_RATE', label: 'Dispute rate' },
              ], showIf: { field: 'enabled', equals: true } },
            ],
          },
          {
            title: 'Delivery',
            fields: [
              { key: 'timeRanges', label: 'Time ranges', type: 'checkboxlist', default: ['7D', '30D', '90D', 'YTD', 'CUSTOM'], options: [
                { value: '7D', label: '7 days' }, { value: '30D', label: '30 days' }, { value: '90D', label: '90 days' },
                { value: 'YTD', label: 'Year to date' }, { value: 'CUSTOM', label: 'Custom' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'exportFormats', label: 'Export formats', type: 'checkboxlist', default: ['CSV', 'PDF', 'EXCEL'], options: [
                { value: 'CSV', label: 'CSV' }, { value: 'PDF', label: 'PDF' }, { value: 'EXCEL', label: 'Excel' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'weeklyEmail', label: 'Weekly email', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'monthlyEmail', label: 'Monthly email', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'recipients', label: 'Recipients', type: 'multiselect', default: ['ORG_OWNER', 'ORG_FINANCE', 'ORG_MANAGER'], options: [
                { value: 'ORG_OWNER', label: 'Org Owner' }, { value: 'ORG_FINANCE', label: 'Org Finance' },
                { value: 'ORG_MANAGER', label: 'Org Manager' },
              ], showIf: { field: 'enabled', equals: true } },
              { key: 'budgetTracking', label: 'Budget tracking', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
              { key: 'costCenterAllocation', label: 'Cost center allocation', type: 'toggle', default: true, showIf: { field: 'enabled', equals: true } },
            ],
          },
        ],
      },
    ],
  },
]

// ═══════════════════════════════════════════════════════════════════════════
// Derived helpers
// ═══════════════════════════════════════════════════════════════════════════

export const RFQ_SETTING_PANELS: Record<string, PanelDef> = Object.fromEntries(
  RFQ_SETTINGS_SECTIONS.flatMap((s) => s.panels.map((p) => [p.key, p]))
)

export function getPanelFields(panelKey: string): Field[] {
  const panel = RFQ_SETTING_PANELS[panelKey]
  if (!panel) return []
  return panel.groups.flatMap((g) => g.fields)
}

export type PanelValue = Record<string, unknown>

/** Defaults for a panel — the shape every stored document merges onto. */
export function panelDefaults(panelKey: string): PanelValue {
  const out: PanelValue = {}
  for (const f of getPanelFields(panelKey)) out[f.key] = structuredClone(f.default)
  return out
}

function fieldSchema(f: Field): z.ZodTypeAny {
  switch (f.type) {
    case 'toggle': return z.boolean()
    case 'text': return z.string().max(512)
    case 'number': {
      let s = z.number()
      if (f.min !== undefined) s = s.min(f.min)
      if (f.max !== undefined) s = s.max(f.max)
      return s
    }
    case 'select': return z.enum(f.options.map((o) => o.value) as [string, ...string[]])
    case 'multiselect':
    case 'checkboxlist': return z.array(z.enum(f.options.map((o) => o.value) as [string, ...string[]]))
    case 'numberlist': return z.array(z.number().min(f.min ?? 0).max(f.max ?? 8760)).max(12)
    case 'slider': return z.number().min(f.min).max(f.max)
    case 'table': {
      const cells: Record<string, z.ZodTypeAny> = {}
      for (const col of f.columns) {
        if (col.type === 'number') cells[col.key] = z.number().nullable()
        else if (col.type === 'toggle') cells[col.key] = z.boolean()
        else if (col.type === 'select' && col.options) cells[col.key] = z.enum(col.options.map((o) => o.value) as [string, ...string[]])
        else cells[col.key] = z.string().max(200)
      }
      return z.array(z.object(cells)).max(f.maxRows ?? 50)
    }
  }
}

/** Zod schema for one panel's stored document (strict: no unknown keys). */
export function panelSchema(panelKey: string): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of getPanelFields(panelKey)) shape[f.key] = fieldSchema(f)
  return z.object(shape).strict()
}

/** Validate + fill missing keys from defaults → complete, safe document. */
export function mergePanelValue(panelKey: string, stored: unknown): PanelValue {
  const base = panelDefaults(panelKey)
  if (!stored || typeof stored !== 'object') return base
  const src = stored as PanelValue
  const out: PanelValue = { ...base }
  for (const key of Object.keys(base)) {
    if (key in src) {
      const field = getPanelFields(panelKey).find((f) => f.key === key)
      if (!field) continue
      const parsed = fieldSchema(field).safeParse(src[key])
      if (parsed.success) out[key] = parsed.data
    }
  }
  return out
}

/** Field-level diff between two panel documents (for change history rows). */
export function diffPanelValue(
  panelKey: string,
  before: PanelValue,
  after: PanelValue
): { field: string; oldValue: string | null; newValue: string | null }[] {
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = []
  const fields = getPanelFields(panelKey)
  for (const f of fields) {
    const a = before[f.key]
    const b = after[f.key]
    const sa = a === undefined || a === null ? null : JSON.stringify(a)
    const sb = b === undefined || b === null ? null : JSON.stringify(b)
    if (sa !== sb) changes.push({ field: f.key, oldValue: sa, newValue: sb })
  }
  return changes
}

/** Human label for a stored field value (history table display). */
export function formatFieldValue(
  panelKey: string,
  fieldKey: string,
  value: string | null
): string {
  if (value === null) return '—'
  const field = getPanelFields(panelKey).find((f) => f.key === fieldKey)
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { return value }
  if (field?.type === 'toggle') return parsed ? 'ON' : 'OFF'
  if (field?.type === 'select') {
    const opt = field.options.find((o) => o.value === parsed)
    if (opt) return opt.label
  }
  if (field?.type === 'multiselect' || field?.type === 'checkboxlist') {
    if (Array.isArray(parsed)) {
      if (field.options.length) {
        return parsed.map((v) => field.options.find((o) => o.value === v)?.label ?? v).join(', ') || 'None'
      }
      return parsed.join(', ') || 'None'
    }
    return String(parsed)
  }
  if (field?.type === 'numberlist') return Array.isArray(parsed) ? parsed.join(', ') : String(parsed)
  if (field?.type === 'table') return Array.isArray(parsed) ? `${parsed.length} row${parsed.length === 1 ? '' : 's'}` : String(parsed)
  return String(parsed)
}
