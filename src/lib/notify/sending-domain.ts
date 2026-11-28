/**
 * The health of the domain Etyme's email is sent from (record 110,
 * 2026-11-22): whether its SPF, DKIM and DMARC records are in DNS.
 *
 * Read by a DNS lookup of the configured sender's domain, on the page's
 * own request. Each record is one of three states, and never a guess:
 *
 *   found                the lookup answered with the record
 *   not found            the lookup answered, and no such record is there
 *   could not be checked the lookup did not answer
 *
 * A record that is found is in DNS. That is all this says: whether a
 * mailbox accepted a letter is the provider's delivery report, which
 * Etyme does not receive yet. No key, token or secret is read or shown.
 */
import { bareAddress } from './mail-door'

export type RecordState = 'found' | 'not found' | 'could not be checked'

export interface DomainCheck {
  record: 'SPF' | 'DKIM' | 'DMARC'
  state: RecordState
  /** The DNS names that were looked up. */
  lookedAt: string[]
  /** One sentence on what to do. */
  says: string
}

export interface SendingDomainHealth {
  /** The domain email is sent from; null where no sender is configured. */
  domain: string | null
  checks: DomainCheck[]
  says: string
}

/** A lookup's answer: the TXT values at a name, that the name has none, or that nobody answered. */
export type Looked = { ok: true; values: string[] } | { ok: false; why: 'ABSENT' | 'UNANSWERED' }

export type LookUp = (name: string) => Promise<Looked>

/** The domain of the configured sender, "Etyme <notify@mail.example>" or the bare address. Pure. */
export function sendingDomain(env: Record<string, string | undefined> = process.env): string | null {
  const address = bareAddress(env.NOTIFY_FROM_EMAIL)
  const at = address.lastIndexOf('@')
  const domain = at > 0 ? address.slice(at + 1).replace(/\.$/, '') : ''
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null
}

/**
 * The DKIM names to look at. A DKIM record sits under a selector the
 * email service chooses, so the names follow the configured service; a
 * deployment that signs under another selector lists it in
 * MAIL_DKIM_SELECTORS, comma-separated. Pure.
 */
export function dkimSelectors(env: Record<string, string | undefined> = process.env): string[] {
  const own = (env.MAIL_DKIM_SELECTORS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9._-]+$/.test(s))
  if (own.length) return own
  return env.RESEND_API_KEY ? ['resend'] : ['s1', 's2']
}

/**
 * The names an SPF record may sit at: the domain itself, and the "send"
 * name under it that an email service uses as the return address. Pure.
 */
export function spfNames(domain: string): string[] {
  return [domain, `send.${domain}`]
}

const HAS: Record<DomainCheck['record'], (v: string) => boolean> = {
  SPF: (v) => /^\s*v=spf1(\s|$)/i.test(v),
  DKIM: (v) => /(^|;)\s*p=[A-Za-z0-9+/=]/.test(v) || /v=DKIM1/i.test(v),
  DMARC: (v) => /^\s*v=DMARC1/i.test(v),
}

/** One record's state from what its lookups answered. Found wins; an unanswered lookup is never "not found". Pure. */
export function stateOf(record: DomainCheck['record'], answers: Looked[]): RecordState {
  if (answers.some((a) => a.ok && a.values.some(HAS[record]))) return 'found'
  if (answers.some((a) => !a.ok && a.why === 'UNANSWERED')) return 'could not be checked'
  return 'not found'
}

const WHAT_IT_IS: Record<DomainCheck['record'], string> = {
  SPF: 'the SPF record, which names who may send for the domain',
  DKIM: 'the DKIM record, which signs each email',
  DMARC: 'the DMARC record, which tells a mailbox what to do with a failed email',
}

/** The one sentence under a record. Pure. */
export function checkSays(record: DomainCheck['record'], state: RecordState, domain: string): string {
  if (state === 'found') return `${record} is in DNS for ${domain}. Nothing to do.`
  if (state === 'could not be checked') return `The DNS lookup did not answer, so ${record} is not known. Open this page again in a few minutes.`
  return `Ask Etyme support to add ${WHAT_IT_IS[record]}, to the DNS of ${domain}.`
}

export const NO_SENDER_SAYS = 'No sender address is set on this deployment, so no email leaves and there is no domain to check.'

/** What the panel says over the three, from their states. Pure. */
export function healthSays(domain: string, checks: Pick<DomainCheck, 'state'>[]): string {
  if (checks.every((c) => c.state === 'found')) return `Email is sent from ${domain}. All three records are in DNS.`
  if (checks.some((c) => c.state === 'not found')) return `Email is sent from ${domain}. A record is missing, so some mailboxes may refuse it or file it as spam.`
  return `Email is sent from ${domain}. Not every record could be checked just now.`
}

/** The health of the sending domain, by the lookups given. */
export async function sendingDomainHealth(lookUp: LookUp, env: Record<string, string | undefined> = process.env): Promise<SendingDomainHealth> {
  const domain = sendingDomain(env)
  if (!domain) return { domain: null, checks: [], says: NO_SENDER_SAYS }
  const names: Record<DomainCheck['record'], string[]> = {
    SPF: spfNames(domain),
    DKIM: dkimSelectors(env).map((s) => `${s}._domainkey.${domain}`),
    DMARC: [`_dmarc.${domain}`],
  }
  const checks = await Promise.all((['SPF', 'DKIM', 'DMARC'] as const).map(async (record): Promise<DomainCheck> => {
    const answers = await Promise.all(names[record].map((n) => lookUp(n).catch((): Looked => ({ ok: false, why: 'UNANSWERED' }))))
    const state = stateOf(record, answers)
    return { record, state, lookedAt: names[record], says: checkSays(record, state, domain) }
  }))
  return { domain, checks, says: healthSays(domain, checks) }
}
