// Storage namespace primitives (6.6.1) — zero imports, shared by every layer
// (index key scheme, ftp-hosting driver, /api/media guard, vault proxy).
// Kept dependency-free ON PURPOSE to avoid import cycles between the
// adapter files and the registry.

/** Root key segment for the private-vault namespace. */
export const VAULT_KEY_ROOT = 'vault'
export const VAULT_NAMESPACE = 'private-vault'
export const PUBLIC_NAMESPACE = 'public-media'
export type StorageNamespace = typeof VAULT_NAMESPACE | typeof PUBLIC_NAMESPACE

/** True when a storage key lives under the private-vault root. */
export function isVaultKey(key: string): boolean {
  return key === VAULT_KEY_ROOT || key.startsWith(`${VAULT_KEY_ROOT}/`)
}
