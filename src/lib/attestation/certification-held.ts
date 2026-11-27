/**
 * Supplier diversity (record 132, plugin 5): when a certification counts as
 * held, and when a bid set aside for one may be called eligible. Pure: no
 * database, no clock of its own (the day is passed in), no model.
 *
 * A certification is an event the certifier recorded, never a judgment
 * Etyme makes. "Held" here means three things are true on the record at
 * once: the Owner set it HELD, a certificate is on file, and its expiry day
 * is not past. Anything short of that is said as what it is. A kind that
 * expires and has no expiry recorded is the fourth state, and it never
 * counts: the 2017 build had an expiry column nothing swept.
 */

export const CERTIFICATION_KINDS = ['MBE', 'WBE', 'EIGHT_A', 'HUBZONE', 'OTHER'] as const
export type CertificationKindKey = (typeof CERTIFICATION_KINDS)[number]
export const CERTIFICATION_STATUSES = ['NOT_HELD', 'APPLIED', 'HELD', 'LAPSED'] as const
export type CertificationStatusKey = (typeof CERTIFICATION_STATUSES)[number]

const KIND_WORDS: Record<Exclude<CertificationKindKey, 'OTHER'>, string> = { MBE: 'MBE', WBE: 'WBE', EIGHT_A: '8(a)', HUBZONE: 'HUBZone' }

/** The name a person says: "8(a)", or the Owner's own name for an OTHER. */
export function kindName(kind: string, otherName?: string | null): string {
  if (kind === 'OTHER') return otherName?.trim() || 'other'
  return KIND_WORDS[kind as keyof typeof KIND_WORDS] ?? kind
}

/** One key per certification: a kind, or an OTHER by its name. */
export function kindKey(kind: string, otherName?: string | null): string {
  return kind === 'OTHER' ? `OTHER:${(otherName ?? '').trim().toLowerCase()}` : kind
}

/** The paper a certificate is, as far as "on file" needs to know. */
export interface CertificatePaper { status: string; signedFileUrl?: string | null; file?: { id: string } | null }

/** Nothing is on file without the file: an uploaded or signed paper that has bytes or a link. */
export function certificateOnFile(doc: CertificatePaper | null | undefined): boolean {
  if (!doc) return false
  if (doc.status !== 'SIGNED' && doc.status !== 'UPLOADED') return false
  return Boolean(doc.file) || Boolean(doc.signedFileUrl)
}

export interface CertificationFact {
  kind: string
  otherName?: string | null
  status: string
  expiresOn: Date | null
  document?: CertificatePaper | null
}

export type HeldState = 'HELD' | 'APPLIED' | 'NOT_HELD' | 'LAPSED' | 'LAPSED_BY_DATE' | 'NO_CERTIFICATE' | 'NO_EXPIRY'

export interface HeldReading { held: boolean; state: HeldState; says: string }

/** The first instant of the day in UTC: a day, not a moment, is what an expiry is. */
export function dayOf(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function sayDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * The one reader: is this certification held today. An expiry day is
 * valid through that day and lapses the day after.
 */
export function certificationHeldOn(c: CertificationFact, today: Date): HeldReading {
  const name = kindName(c.kind, c.otherName)
  if (c.status === 'LAPSED') return { held: false, state: 'LAPSED', says: `Your ${name} certification has lapsed.` }
  if (c.status === 'APPLIED') return { held: false, state: 'APPLIED', says: `Your ${name} certification is applied for and not held yet.` }
  if (c.status !== 'HELD') return { held: false, state: 'NOT_HELD', says: `Your ${name} certification is not held yet.` }
  if (!certificateOnFile(c.document)) {
    return { held: false, state: 'NO_CERTIFICATE', says: `Your ${name} certification is recorded as held, but its certificate is not on file. Attach the certificate.` }
  }
  if (!c.expiresOn) {
    return { held: false, state: 'NO_EXPIRY', says: `Your ${name} certification has no expiry day recorded, so it is not counted as held. Record the day it expires.` }
  }
  if (dayOf(c.expiresOn) < dayOf(today)) {
    return { held: false, state: 'LAPSED_BY_DATE', says: `Your ${name} certification expired on ${sayDay(c.expiresOn)}.` }
  }
  return { held: true, state: 'HELD', says: `Your ${name} certification is held until ${sayDay(c.expiresOn)}.` }
}

/** A kind is held if any row of that kind qualifies. */
export function heldKeys(rows: readonly CertificationFact[], today: Date): Set<string> {
  const out = new Set<string>()
  for (const r of rows) if (certificationHeldOn(r, today).held) out.add(kindKey(r.kind, r.otherName))
  return out
}

/** Rows set HELD whose expiry day is past: the sweep flips these to LAPSED. */
export function dueToLapse<T extends { status: string; expiresOn: Date | null }>(rows: readonly T[], today: Date): T[] {
  return rows.filter((r) => r.status === 'HELD' && r.expiresOn !== null && dayOf(r.expiresOn) < dayOf(today))
}

export interface SetAside { kind: string | null | undefined; otherName?: string | null }
export interface Eligibility { eligible: boolean; says: string | null }

/**
 * May a bid be marked eligible. An open bid always may. A set-aside bid may
 * only where the firm holds the named certification today. Where not, the
 * sentence says so and says why, in the firm's own terms.
 */
export function setAsideEligibility(setAside: SetAside, rows: readonly CertificationFact[], today: Date): Eligibility {
  if (!setAside.kind) return { eligible: true, says: null }
  const name = kindName(setAside.kind, setAside.otherName)
  const key = kindKey(setAside.kind, setAside.otherName)
  const mine = rows.filter((r) => kindKey(r.kind, r.otherName) === key)
  const head = `This bid is set aside for ${name} firms.`
  if (mine.some((r) => certificationHeldOn(r, today).held)) return { eligible: true, says: null }
  if (setAside.kind === 'OTHER' && !setAside.otherName?.trim()) {
    return { eligible: false, says: `${head} Name the certification it requires.` }
  }
  // The row nearest to held speaks: held-but-incomplete, then applied, then lapsed, then nothing.
  const order: HeldState[] = ['NO_CERTIFICATE', 'NO_EXPIRY', 'LAPSED_BY_DATE', 'APPLIED', 'LAPSED', 'NOT_HELD']
  const readings = mine.map((r) => certificationHeldOn(r, today))
  const best = order.map((s) => readings.find((x) => x.state === s)).find(Boolean)
  return { eligible: false, says: `${head} ${best ? best.says : `Your ${name} certification is not held yet.`}` }
}

/** What the draft may claim: only certifications held today, by name. Never one that is not. */
export function claimableNames(rows: readonly CertificationFact[], today: Date): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    if (!certificationHeldOn(r, today).held) continue
    const k = kindKey(r.kind, r.otherName)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(kindName(r.kind, r.otherName))
  }
  return out
}

// ── What the Owner may record ───────────────────────────────────────

export interface CertificationInput {
  kind: string
  otherName: string | null
  certifier: string | null
  status: string
  number: string | null
  issuedOn: Date | null
  expiresOn: Date | null
  documentId: string | null
}

type Checked<T> = { ok: true; value: T } | { ok: false; says: string }

function parseDay(v: unknown): Date | null | 'bad' {
  if (v == null || v === '') return null
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'bad'
  const d = new Date(`${v}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? 'bad' : d
}

const text = (v: unknown, max: number): string | null | 'bad' => {
  if (v == null || v === '') return null
  if (typeof v !== 'string' || v.length > max) return 'bad'
  return v.trim() || null
}

/** One sentence per refusal. A held certification needs its certificate and its expiry day, at the door. */
export function checkCertificationInput(body: Record<string, unknown> | null): Checked<CertificationInput> {
  if (!body) return { ok: false, says: 'Send the certification: its kind, status and dates.' }
  if (!(CERTIFICATION_KINDS as readonly string[]).includes(String(body.kind))) {
    return { ok: false, says: 'Pick the certification: MBE, WBE, 8(a), HUBZone, or another one you name.' }
  }
  if (!(CERTIFICATION_STATUSES as readonly string[]).includes(String(body.status))) {
    return { ok: false, says: 'Say where it stands: not held, applied for, held or lapsed.' }
  }
  const otherName = text(body.otherName, 120)
  const certifier = text(body.certifier, 200)
  const number = text(body.number, 120)
  if (otherName === 'bad' || certifier === 'bad' || number === 'bad') return { ok: false, says: 'The name, certifier and number are text of a line or less.' }
  if (body.kind === 'OTHER' && !otherName) return { ok: false, says: 'Name the certification, since it is not MBE, WBE, 8(a) or HUBZone.' }
  const issuedOn = parseDay(body.issuedOn)
  const expiresOn = parseDay(body.expiresOn)
  if (issuedOn === 'bad' || expiresOn === 'bad') return { ok: false, says: 'Say each date as a day, like 2027-01-31, or leave it empty.' }
  if (issuedOn && expiresOn && expiresOn.getTime() < issuedOn.getTime()) return { ok: false, says: 'The expiry day is before the day it was issued. Check both dates.' }
  const documentId = typeof body.documentId === 'string' && body.documentId ? body.documentId : null
  if (body.status === 'HELD') {
    if (!documentId) return { ok: false, says: 'A certification is recorded as held only with its certificate. Attach the certificate first, or record it as applied for.' }
    if (!expiresOn) return { ok: false, says: 'A held certification needs the day it expires. It is only counted as held while it is in date.' }
    if (!certifier) return { ok: false, says: 'A held certification needs the body that certified it.' }
  }
  return { ok: true, value: { kind: String(body.kind), otherName: body.kind === 'OTHER' ? otherName : null, certifier, status: String(body.status), number, issuedOn, expiresOn, documentId } }
}

// ── Ownership facts: the Owner's own attestation ────────────────────

export const OWNERSHIP_FACTS = ['MINORITY_OWNED', 'WOMAN_OWNED', 'VETERAN_OWNED', 'OTHER'] as const
export type OwnershipFact = (typeof OWNERSHIP_FACTS)[number]
export const OWNERSHIP_WORDS: Record<OwnershipFact, string> = {
  MINORITY_OWNED: 'Minority-owned', WOMAN_OWNED: 'Woman-owned', VETERAN_OWNED: 'Veteran-owned', OTHER: 'Other ownership fact',
}

export interface AttestationRow { fact: string; attested: boolean; attestedById: string; attestedAt: Date; note?: string | null }

/** Append-only: the newest row for a fact is the answer, and a withdrawal is a newer row saying no. */
export function currentAttestations<T extends AttestationRow>(rows: readonly T[]): T[] {
  const newest = new Map<string, T>()
  for (const r of rows) {
    const had = newest.get(r.fact)
    if (!had || r.attestedAt.getTime() >= had.attestedAt.getTime()) newest.set(r.fact, r)
  }
  return [...newest.values()]
}

/** The facts the Owner stands behind today, as who and when. Never inferred, never from an agent. */
export function attestedFacts<T extends AttestationRow>(rows: readonly T[]): T[] {
  return currentAttestations(rows).filter((r) => r.attested)
}

export function checkAttestationInput(body: Record<string, unknown> | null): Checked<{ fact: OwnershipFact; attested: boolean; note: string | null }> {
  if (!body || !(OWNERSHIP_FACTS as readonly string[]).includes(String(body.fact))) {
    return { ok: false, says: 'Say which fact you are attesting: minority-owned, woman-owned, veteran-owned or other.' }
  }
  if (typeof body.attested !== 'boolean') return { ok: false, says: 'Say yes, it is true of your firm, or no, to withdraw it.' }
  const note = text(body.note, 500)
  if (note === 'bad') return { ok: false, says: 'The note is text of 500 characters or fewer.' }
  return { ok: true, value: { fact: body.fact as OwnershipFact, attested: body.attested, note } }
}
