const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let fallbackSequence = 0

export const isUuidV4 = (value) =>
  typeof value === 'string' && UUID_V4_PATTERN.test(value)

const createUuidFromRandomValues = () => {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const createFallbackRuntimeId = () => {
  fallbackSequence += 1
  return `rt-${Date.now().toString(36)}-${fallbackSequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Client-side runtime IDs for UI/session objects.
 * Not for auth tokens, secrets, or server-authoritative entity IDs.
 */
export function createRuntimeId() {
  const cryptoObject = globalThis.crypto

  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID()
  }

  if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
    return createUuidFromRandomValues()
  }

  return createFallbackRuntimeId()
}

export default createRuntimeId
