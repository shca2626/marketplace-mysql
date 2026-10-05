// ─────────────────────────────────────────────────────────────────────────────
// Yemen geography — shared governorate list (Phase 3 registration doors).
// Single source for the Merchant/Dealer wizard and the financier application.
// ─────────────────────────────────────────────────────────────────────────────

export const YEMEN_GOVERNORATES = [
  "Sana'a",
  'Aden',
  'Taiz',
  'Hodeidah',
  'Ibb',
  'Hadramaut',
  'Dhamar',
  'Hajjah',
  'Other',
] as const

export type YemenGovernorate = (typeof YEMEN_GOVERNORATES)[number]
