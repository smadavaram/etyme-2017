/**
 * Whether a message really came from the address it says, and whether
 * that address is somebody seated at the company.
 *
 * The receiving server computes SPF, DKIM and DMARC itself when the
 * message arrives (Resend's `authentication` object); a sender cannot
 * forge those the way they can forge a header. Accepted only when:
 *
 *   - SPF passed, and the envelope sender (Return-Path) is the same
 *     organization as the From address — SPF aligned;
 *   - DKIM passed. Resend reports "gray" where the signing domain does
 *     not match the From domain, so a pass here is already aligned;
 *   - DMARC did not fail.
 *
 * Anything else is dropped. Mail forwarded by a rule that keeps the
 * original sender in From is dropped too, because then the forwarder is
 * not who the message says it is from — that is the cost of the rule, said
 * here so nobody loosens it to make a mail rule work.
 *
 * Pure: no database.
 */
import { sameOrganisation } from '@/lib/registrable-domain'

export type AuthResult = 'pass' | 'fail' | 'gray' | 'processing_failed' | 'unknown'

export interface Authentication {
  spf: string | null | undefined
  dkim: string | null | undefined
  dmarc: string | null | undefined
}

export type SenderVerdict =
  | { ok: true }
  | { ok: false; code: 'SPF_FAILED' | 'DKIM_FAILED' | 'DMARC_FAILED' | 'NOT_ALIGNED' | 'NO_SENDER'; says: string }

/** The bare address out of "Name <a@b.com>", lowercased; null if there is none. */
export function bareAddress(raw: string | null | undefined): string | null {
  if (!raw) return null
  const inner = raw.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? raw.trim()
  const a = inner.trim().toLowerCase()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a) ? a : null
}

export function domainOfAddress(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1).toLowerCase()
}

export function checkSender(input: { from: string | null; returnPath: string | null; auth: Authentication | null }): SenderVerdict {
  const from = bareAddress(input.from)
  if (!from) {
    return { ok: false, code: 'NO_SENDER', says: 'This message names no sender address, so it was dropped.' }
  }
  const auth = input.auth
  const fromDomain = domainOfAddress(from)
  if (!auth || auth.spf !== 'pass') {
    return { ok: false, code: 'SPF_FAILED', says: `This message did not pass SPF for ${fromDomain}, so it may not be from ${from}. It was dropped.` }
  }
  if (auth.dkim !== 'pass') {
    return { ok: false, code: 'DKIM_FAILED', says: `This message was not signed by ${fromDomain} (DKIM), so it may not be from ${from}. It was dropped.` }
  }
  if (auth.dmarc === 'fail') {
    return { ok: false, code: 'DMARC_FAILED', says: `${fromDomain} says mail like this is not its own (DMARC), so it was dropped.` }
  }
  const envelope = bareAddress(input.returnPath)
  if (!envelope || !sameOrganisation(domainOfAddress(envelope), fromDomain)) {
    return {
      ok: false,
      code: 'NOT_ALIGNED',
      says: `This message passed SPF for a domain other than ${fromDomain}, so it is not proven to be from ${from}. It was dropped.`,
    }
  }
  return { ok: true }
}
