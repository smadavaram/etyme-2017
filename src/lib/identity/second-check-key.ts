import { sealingKey, TOKEN_KEY_ENV } from '@/lib/team-structure/directory/sealed'
import { SECOND_CHECK_KEY_ENV } from '@/lib/identity/second-check-words'

type Env = Record<string, string | undefined>

/**
 * The second check's sealing key (ETYME_SECOND_CHECK_KEY): its text where
 * it is set and is 32 bytes, as base64 or 64 hex characters; null
 * otherwise. Read by the second check and by /ready. Never logged, never
 * returned to a caller.
 */
export function secondCheckKey(env: Env = process.env): string | null {
  const raw = String(env[SECOND_CHECK_KEY_ENV] ?? '').trim()
  return raw && sealingKey({ [TOKEN_KEY_ENV]: raw }) ? raw : null
}
