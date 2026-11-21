import { seal, unseal, sealingKey, TOKEN_KEY_ENV } from '@/lib/team-structure/directory/sealed'

/**
 * Sensitive numbers: a tax ID, bank details and a social security number
 * (record 99, the founder's rule of 2026-11-18).
 *
 * 1. Masked for everyone, the Owner included. A tax ID or a social
 *    security number shows its last four and dots; bank details show the
 *    bank, the account name and the last four (they are the only bank
 *    facts Etyme stores at all: lib/money/remit-change).
 * 2. Sealed at rest. A tax ID is written as `taxIdSealed` (AES-256-GCM,
 *    the same seal as the directory's token, under its own key,
 *    ETYME_DATA_SEAL_KEY) and `taxIdLast4`. The old `taxId` column is
 *    never written again; scripts/seal-sensitive.ts moves rows written
 *    before the rule. With no key a tax ID is refused in a sentence: a
 *    number we cannot lock is a number we do not keep.
 * 3. The full value leaves the server in one reply only: the reveal route
 *    (`/api/settings/sensitive/reveal`), for an Owner of the company the
 *    number is on, after a fresh second check, logged.
 *
 * Etyme holds no social security number today: no column carries one and
 * the document reader removes any it sees (lib/extract). The mask is here
 * so the first one written is masked by the same reader.
 */

export const DATA_SEAL_KEY_ENV = 'ETYME_DATA_SEAL_KEY'

type Env = Record<string, string | undefined>

/** The columns that may hold a full sensitive value. Read only through this file, the reveal route and the backfill. */
export const PLAIN_SENSITIVE_COLUMNS = ['taxId', 'taxIdSealed'] as const

const asSealEnv = (env: Env): Env => ({ [TOKEN_KEY_ENV]: env[DATA_SEAL_KEY_ENV] })

/** Whether this deployment can seal a sensitive value. Never says the key. */
export function dataSealKeySet(env: Env = process.env): boolean {
  return sealingKey(asSealEnv(env)) !== null
}

export const SAYS_NO_KEY =
  'This Etyme deployment cannot lock a tax ID yet, so it is not saved. The owner of the deployment sets the data key, then type it again.'

import { lastFourOf, masked, isMasked, taxIdShown, hasTaxId } from '@/lib/sensitive-mask'
export { lastFourOf, masked, isMasked, taxIdShown, hasTaxId }

export type SealedTaxId = { taxId: null; taxIdSealed: string | null; taxIdLast4: string | null }

/**
 * The columns to write for a tax ID typed or confirmed: sealed and its
 * last four, the plain column emptied. Null clears all three. Refused in
 * a sentence where the deployment has no data key.
 */
export function taxIdToWrite(plain: string | null, env: Env = process.env): { ok: true; data: SealedTaxId } | { ok: false; says: string } {
  const v = String(plain ?? '').trim()
  if (!v) return { ok: true, data: { taxId: null, taxIdSealed: null, taxIdLast4: null } }
  if (!dataSealKeySet(env)) return { ok: false, says: SAYS_NO_KEY }
  return { ok: true, data: { taxId: null, taxIdSealed: seal(v, asSealEnv(env)), taxIdLast4: lastFourOf(v) } }
}

/**
 * The full tax ID, server side only: the reveal route and the backfill.
 * The sealed value first; the plain column only for a row not yet moved.
 * Null where there is none or the key cannot open it.
 */
export function openTaxId(row: { taxId?: string | null; taxIdSealed?: string | null }, env: Env = process.env): string | null {
  if (row.taxIdSealed) return unseal(row.taxIdSealed, asSealEnv(env))
  return row.taxId?.trim() || null
}

/**
 * A value read off the company's own paper, handed to the screen sealed
 * and bound to the company, so Save can record it without the full number
 * ever being in the reply. Null with no key: the screen asks her to type it.
 */
export function sealForForm(companyId: string, plain: string, env: Env = process.env): string | null {
  if (!dataSealKeySet(env)) return null
  return seal(JSON.stringify({ c: companyId, v: plain }), asSealEnv(env))
}

export function openFromForm(companyId: string, token: unknown, env: Env = process.env): string | null {
  if (typeof token !== 'string' || !token) return null
  const open = unseal(token, asSealEnv(env))
  if (!open) return null
  try {
    const p = JSON.parse(open) as { c?: unknown; v?: unknown }
    return p.c === companyId && typeof p.v === 'string' ? p.v : null
  } catch {
    return null
  }
}

// ── Who may reveal ───────────────────────────────────────────────────

export const SENSITIVE_FIELDS = {
  COMPANY_TAX_ID: 'the company’s tax ID',
  REMIT_TAX_ID: 'the tax ID on these payment details',
} as const
export type SensitiveField = keyof typeof SENSITIVE_FIELDS

export function isSensitiveField(v: unknown): v is SensitiveField {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SENSITIVE_FIELDS, v)
}

/** The subject a second check names for one reveal: the field and the record. */
export const revealSubject = (field: SensitiveField, id: string) => `${field}:${id}`

/**
 * Pure: whether this seat may reveal now. Only an Owner of the company the
 * number is on, as herself. Anybody else is refused in a sentence: asking
 * the Owner for a window is not built yet, and the sentence says so
 * rather than offering a door that does not exist.
 */
export function mayReveal(i: { isOwner: boolean; ownCompany: boolean; asHerself: boolean; companyName: string }): { ok: true } | { ok: false; says: string } {
  if (!i.asHerself) return { ok: false, says: 'A full tax ID is shown only to a person signed in as herself.' }
  if (!i.ownCompany) return { ok: false, says: 'A full tax ID is shown only inside the company it belongs to.' }
  if (!i.isOwner) {
    return {
      ok: false,
      says: `Only an Owner of ${i.companyName} can show the full tax ID. Ask an Owner to read it to you; asking for a time-limited view in Etyme is not built yet.`,
    }
  }
  return { ok: true }
}
