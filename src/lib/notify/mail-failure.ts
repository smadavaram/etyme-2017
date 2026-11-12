/**
 * Why an email did not leave, kept in the provider's own words for Etyme's
 * staff and said in Etyme's words to everybody else.
 *
 * Found by the founder on 2026-11-12, inviting three people to Tapin: each
 * screen said the email "did not go" and nothing more. The sender threw
 * "Resend returned 403" and never read the provider's answer, so the one
 * fact that tells a bad key from a sending domain nobody verified was
 * thrown away before anybody could read it.
 *
 * Three rules this file keeps:
 *
 *   - The provider's words are kept, cleaned. Its answer can echo the
 *     recipient or a key, so any address and anything that looks like a
 *     key is cut out, and at most 300 characters are kept. The key, the
 *     sending address and the recipient are never put in.
 *   - A company's own person never reads the provider's words, its name or
 *     a status code. They read one of four sentences that say what to do.
 *   - The row's note is the one place the status and the words live (no
 *     column of their own), in one shape this file writes and reads back.
 *
 * Pure: no database, no fetch, no environment.
 */
import { NO_MAIL_HERE } from './mail-leaves'

/** The provider an email was handed to. */
export type MailProvider = 'Resend' | 'SendGrid'

/**
 * What kind of failure it was, which decides what a person is told.
 *
 *   REFUSED     the provider answered and said no (a 4xx other than 429)
 *   BUSY        the provider said slow down (429)
 *   DOWN        the provider answered 500 or above, or did not answer
 *   NOT_SET_UP  this deployment has no email sender
 *   DEMO        a reserved demo address; nothing is sent to one, on purpose
 */
export type MailFailureKind = 'REFUSED' | 'BUSY' | 'DOWN' | 'NOT_SET_UP' | 'DEMO'

export interface MailFailure {
  kind: MailFailureKind
  /** The provider's status, or null where it never answered or was never asked. */
  status: number | null
  provider: MailProvider | null
  /** The provider's own message, cleaned. Never shown to a company's people. */
  words: string | null
}

/** The most of the provider's words ever kept. */
export const PROVIDER_WORDS_MAX = 300

const ADDRESS = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[^\s@<>"'(),;:]+/g
const KEY_LIKE = [
  /\bBearer\s+\S+/gi,
  /\bre_[A-Za-z0-9_]{6,}/g,
  /\bSG\.[A-Za-z0-9_\-.]{6,}/g,
  // Any long unbroken run of letters, digits and dashes reads as a secret.
  /\b[A-Za-z0-9_\-]{28,}\b/g,
]

/**
 * The provider's words with every address and anything key-like cut out,
 * whitespace collapsed, at most 300 characters.
 */
export function cleanProviderWords(raw: unknown): string {
  let s = typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
  s = s.replace(ADDRESS, '[address]')
  for (const k of KEY_LIKE) s = s.replace(k, '[hidden]')
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > PROVIDER_WORDS_MAX ? s.slice(0, PROVIDER_WORDS_MAX - 1) + '…' : s
}

/**
 * The provider's own message out of its error body. Resend answers
 * `{ statusCode, name, message }`; SendGrid `{ errors: [{ message }] }`.
 * Anything else is read as plain text.
 */
export function providerMessageOf(body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (typeof b.message === 'string') {
      return cleanProviderWords(typeof b.name === 'string' && !b.message.includes(b.name) ? `${b.name}: ${b.message}` : b.message)
    }
    if (Array.isArray(b.errors)) {
      const first = b.errors.find((e) => e && typeof e === 'object' && typeof (e as any).message === 'string') as any
      if (first) return cleanProviderWords(first.message)
    }
    if (typeof b.error === 'string') return cleanProviderWords(b.error)
    return ''
  }
  return cleanProviderWords(body)
}

/** Which kind a provider's status is. Null means it never answered. */
export function failureKindOf(status: number | null): MailFailureKind {
  if (status === null || status >= 500) return 'DOWN'
  if (status === 429) return 'BUSY'
  return 'REFUSED'
}

/**
 * The note kept on the notice row: the status and the words in one shape
 * `failureFromNote` reads back. "Resend answered 403: The domain is not
 * verified." or "Resend did not answer: fetch failed".
 */
export function failureNote(f: Pick<MailFailure, 'provider' | 'status' | 'words'>): string {
  const who = f.provider ?? 'The email sender'
  const words = f.words ? cleanProviderWords(f.words) : ''
  const head = f.status === null ? `${who} did not answer` : `${who} answered ${f.status}`
  return words ? `${head}: ${words}` : head
}

const NOTE_ANSWERED = /^(Resend|SendGrid) answered (\d{3})(?::\s?([\s\S]*))?$/
const NOTE_SILENT = /^(Resend|SendGrid) did not answer(?::\s?([\s\S]*))?$/
// Rows written before 2026-11-12 said only the status.
const NOTE_OLD = /^(Resend|SendGrid) returned (\d{3})$/

/**
 * A failure back out of a row's note, for Etyme's staff list. A note in
 * none of the shapes above (a broken Teams link, a row that could not be
 * written) is kept as words with no status.
 */
export function failureFromNote(note: string | null | undefined): MailFailure {
  const n = (note ?? '').trim()
  let m = NOTE_ANSWERED.exec(n)
  if (m) {
    const status = Number(m[2])
    return { kind: failureKindOf(status), status, provider: m[1] as MailProvider, words: m[3]?.trim() || null }
  }
  m = NOTE_OLD.exec(n)
  if (m) {
    const status = Number(m[2])
    return { kind: failureKindOf(status), status, provider: m[1] as MailProvider, words: null }
  }
  m = NOTE_SILENT.exec(n)
  if (m) return { kind: 'DOWN', status: null, provider: m[1] as MailProvider, words: m[2]?.trim() || null }
  return { kind: 'DOWN', status: null, provider: null, words: n ? cleanProviderWords(n) : null }
}

/**
 * The sentence a company's own person reads. Never the provider's words,
 * its name or a status code: those are for Etyme's staff.
 */
export function mailFailureSays(f: Pick<MailFailure, 'kind'>): string {
  switch (f.kind) {
    case 'REFUSED':
      return 'Etyme’s email sender refused it, so nothing was sent. Etyme has been told.'
    case 'BUSY':
      return 'Etyme’s email sender is busy. Try again in a few minutes.'
    case 'DOWN':
      return 'Etyme’s email sender did not answer. Try again in a few minutes.'
    case 'NOT_SET_UP':
      return `${NO_MAIL_HERE}.`
    case 'DEMO':
      return 'This is a demo address, so no email went to it.'
  }
}

/**
 * An address shown to Etyme's staff: its first letter and its domain,
 * "s…@etyme.com". Nothing else of the local part.
 */
export function maskAddress(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  return `${email[0]}…@${email.slice(at + 1).toLowerCase()}`
}

/**
 * What the email sender throws when the provider said no or never
 * answered. Its message is the row's note (`failureNote`), so a caller
 * that only keeps `err.message` still keeps the status and the words.
 * It never holds the key, the sending address or the recipient.
 */
export class MailRefused extends Error {
  readonly status: number | null
  readonly providerName: MailProvider
  readonly providerMessage: string
  readonly kind: MailFailureKind

  constructor(providerName: MailProvider, status: number | null, providerMessage: string) {
    const words = cleanProviderWords(providerMessage)
    super(failureNote({ provider: providerName, status, words }))
    this.name = 'MailRefused'
    this.status = status
    this.providerName = providerName
    this.providerMessage = words
    this.kind = failureKindOf(status)
  }

  get failure(): MailFailure {
    return { kind: this.kind, status: this.status, provider: this.providerName, words: this.providerMessage || null }
  }
}

/** Whether a thrown thing is the sender's refusal (by shape, so a copy across bundles still counts). */
export function isMailRefused(err: unknown): err is MailRefused {
  return err instanceof MailRefused
    || (Boolean(err) && typeof err === 'object' && (err as any).name === 'MailRefused' && 'providerName' in (err as any))
}
