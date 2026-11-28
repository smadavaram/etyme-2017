/**
 * The DNS lookup behind lib/notify/sending-domain, in its own file
 * because it reads node:dns and a screen must never import it.
 *
 * A name with no TXT record is ABSENT. Anything else that is not an
 * answer (a timeout, a refused or failed query) is UNANSWERED, so a
 * resolver that is down never reads as a record that is missing.
 */
import { Resolver } from 'node:dns/promises'
import type { Looked } from './sending-domain'

const ABSENT = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN'])

export async function lookUpTxt(name: string): Promise<Looked> {
  const resolver = new Resolver({ timeout: 3000, tries: 1 })
  try {
    const rows = await resolver.resolveTxt(name)
    // A TXT value longer than 255 characters arrives in pieces.
    return { ok: true, values: rows.map((parts) => parts.join('')) }
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? ''
    return { ok: false, why: ABSENT.has(code) ? 'ABSENT' : 'UNANSWERED' }
  }
}
