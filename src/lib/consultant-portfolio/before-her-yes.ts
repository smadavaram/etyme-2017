/**
 * What a firm reads about a person before she says yes (fix list A4,
 * 2026-11-15).
 *
 * A firm that asks somebody onto its bench by an address that already has
 * an account, or that another firm keeps, asks on her own record. Until
 * this, every reader of that record showed the asking firm her own name,
 * headline, skills, place, education, work authorization and free date,
 * before she had said yes. CLAUDE.md: a consultant is shared with nobody
 * beyond the firm until she grants it, and only consented data crosses
 * firms.
 *
 * The rule, one function (`readsOnlyWhatItTyped`):
 *
 *  - Her own seat, a seat at this firm (she works here), or a GRANTED
 *    listing here: the firm reads her record as before.
 *  - Otherwise, where the record's words are the firm's own (she has no
 *    account of her own, and this firm made the record or no other firm
 *    ever listed her), it reads the record as before: every word on it is
 *    one this firm typed.
 *  - Otherwise it reads only what it typed on its own listing: the name
 *    (`firmName`, the name it asked her under, see `nameAskedUnder`; the
 *    address it asked at where the listing predates the column), the
 *    headline, skills, place and note, and the listing's own tier, terms
 *    and consent. Nothing else of hers: not her lowest rate either, and
 *    no refusal may say or hint at it (`floorRefuses`).
 *
 * Every reader of a person by a firm in supply's files goes through
 * `firmReadsAt` and `typedOnly`, and the list's search filters go through
 * `typedOnlyIds`, so a search cannot find her by a field the firm may not
 * read.
 */

import { prisma } from '@/lib/db'
import { hasOwnAccount } from './firm-view'

// ── Pure ────────────────────────────────────────────────────────────────

export interface BeforeYesFacts {
  /** The caller is the person herself. */
  isSubject: boolean
  /** She holds a live seat at this firm: she works here. */
  seatHere: boolean
  /** This firm's live listing's consent, or null where it has none. */
  listingState: string | null
  /** A password, a sign-in or her own seat (`hasOwnAccount`). */
  ownAccount: boolean
  /** This firm's ask made the consultant record (its CONSULTANT_CREATED row). */
  madeHere: boolean
  /** Other firms that ever listed her, taken back or not. */
  otherFirmsEver: number
}

/** Whether every word on her record is one this firm typed. Pure. */
export function wordsAreTheFirms(f: Pick<BeforeYesFacts, 'ownAccount' | 'madeHere' | 'otherFirmsEver'>): boolean {
  return !f.ownAccount && (f.madeHere || f.otherFirmsEver === 0)
}

/** Whether this firm reads only what it typed about her. Pure. */
export function readsOnlyWhatItTyped(f: BeforeYesFacts): boolean {
  if (f.isSubject || f.seatHere) return false
  if (f.listingState === 'GRANTED') return false
  if (f.listingState == null) return false
  return !wordsAreTheFirms(f)
}

export interface TypedListing {
  firmName: string | null
  firmHeadline: string | null
  firmSkills: string[]
  firmLocation: string | null
  firmNotes: string | null
}

/**
 * The name the firm typed: its own on the listing, or, on a listing from
 * before the column, the address it asked at, which it typed too. Pure.
 */
export function nameItTyped(listing: Pick<TypedListing, 'firmName'> | null | undefined, email: string | null): string {
  const typed = listing?.firmName?.trim()
  if (typed) return typed
  return email ?? 'Somebody you asked'
}

/** Everything a firm reads about her before her yes, and nothing else. Pure. */
export function typedOnly(listing: TypedListing | null | undefined, email: string | null) {
  return {
    name: nameItTyped(listing, email),
    headline: listing?.firmHeadline ?? null,
    skills: listing?.firmSkills ?? [],
    location: listing?.firmLocation ?? null,
    notes: listing?.firmNotes ?? null,
    // Her own words are not this firm's to read before her yes.
    own: { headline: null, skills: [] as string[], location: null },
    education: null,
    workAuth: null,
    rateFloor: null,
    availableFrom: null,
    visibility: null,
  }
}

/**
 * Whether a firm may ask somebody onto its bench by her record's id
 * (`POST /api/bench/listings`; fix list, layer five, a). The door took any
 * id, so a firm could ask, and read the name of, a person it had never
 * met. It knows her where she holds a seat here (it employs her), where it
 * has ever listed her (a listing taken back counts: she is asked again),
 * or where a firm it trades with shows her on its partner bench, which is
 * the one place Ask to represent reads her from. Anybody else is answered
 * as an id that does not exist. Pure.
 */
export function firmKnowsForBench(f: { seatHere: boolean; listedHereEver: boolean; onPartnerBench: boolean }): boolean {
  return f.seatHere || f.listedHereEver || f.onPartnerBench
}

/**
 * The name a firm asks somebody onto its bench under: what it is written as
 * on the listing (`firmName`) and what the log and the answer say.
 *
 *  - Asked again on a listing it holds: the name it typed then, kept; on a
 *    listing from before the column, the address it asked at.
 *  - Otherwise she is somebody it employs, or a partner shows her by name
 *    on its bench with her yes: the name it reads there, written as the
 *    listing's `firmName`, the way Share to a partner's bench writes it
 *    (`/api/bench/share`). So `firmName` is the name this firm asked her
 *    under: one it typed, or one it was already shown with her yes. It is
 *    never a name the firm was not shown. Left empty, the listing would
 *    read her by her address (`nameItTyped`), which a partner's bench
 *    never shows; that would be the new thing shown.
 *
 * Never her own record's name on a record the firm has only an id for.
 * Pure.
 */
export function nameAskedUnder(o: {
  existing: Pick<TypedListing, 'firmName'> | null
  email: string | null
  /** The name the firm reads of her where it employs her or a partner shows her. */
  shownName: string
}): { firmName: string | null; says: string } {
  if (o.existing) {
    const kept = o.existing.firmName?.trim() || null
    return { firmName: kept, says: nameItTyped(o.existing, o.email) }
  }
  return { firmName: o.shownName, says: o.shownName }
}

/**
 * Whether her lowest rate refuses a firm's rate range (the reader of
 * a626b0b18, item 1). Add to bench refused a range under her floor and
 * named the floor, so a firm that reads only what it typed could post
 * lower and lower ranges and read her floor off the answers. A refusal
 * with no figure still moves with her floor: refused below it, saved
 * above it. So before her yes, where the firm does not read her floor,
 * the floor refuses nothing and every range is saved alike; the answer
 * never moves with it. Where the firm reads her floor (she works here,
 * she said yes, or every word on the record is the firm's own), a range
 * under it is refused, as before. Pure.
 */
export function floorRefuses(o: { readsHerFloor: boolean; floor: number | null; max: number | null }): boolean {
  if (!o.readsHerFloor) return false
  return o.floor != null && o.max != null && o.max < o.floor
}

/** The refusal where the firm reads her floor: no figure, her name as the firm reads it. Pure. */
export function belowFloorSays(name: string): string {
  return `The top of that range is below the lowest rate ${name} has said they will take.`
}

/**
 * Where the Candidates list puts its rows (fix list, layer five, i). It
 * sorted every row by her own record's name, so the place of a row the
 * firm reads only as typed hinted at a name it was never shown. Those rows
 * come after the others, by the date asked, newest first. This is the
 * page window over the two runs: how many of each, from where. Pure.
 */
export function askedLastWindow(o: { othersTotal: number; skip: number; limit: number }): {
  others: { skip: number; take: number }
  typed: { skip: number; take: number }
} {
  const skip = Math.max(0, o.skip)
  const limit = Math.max(0, o.limit)
  const othersTake = Math.max(0, Math.min(limit, o.othersTotal - skip))
  return {
    others: { skip: Math.min(skip, o.othersTotal), take: othersTake },
    typed: { skip: Math.max(0, skip - o.othersTotal), take: limit - othersTake },
  }
}

// ── The facts, read once per page ──────────────────────────────────────

export interface FirmRead {
  /** Whether this firm reads only what it typed. */
  onlyTyped: boolean
  /** What it reads where it does; null where it reads her record. */
  typed: ReturnType<typeof typedOnly> | null
}

/**
 * For each consultant record named, what this firm reads. With no ids,
 * every record holding a live listing here she has not said yes to: the
 * set the list's search filters must not match on her own fields.
 *
 * Reads counts and this firm's own rows only; nothing about another firm
 * leaves here.
 */
export async function firmReadsAt(
  o: {
    companyId: string
    callerPersonId: string
    consultantIds?: string[]
    /**
     * Read as the firm will read her once its ask is written: a record with
     * no live listing here is read as asked. Add to bench and the public
     * ask read this before they write the listing, so no answer they give
     * says more than the firm will read afterwards.
     */
    asAsked?: boolean
  }
): Promise<Map<string, FirmRead>> {
  const { companyId } = o
  const rows = await prisma.consultantProfile.findMany({
    where: o.consultantIds
      ? { id: { in: o.consultantIds } }
      : { listings: { some: { companyId, revokedAt: null, state: { not: 'GRANTED' } } } },
    select: {
      id: true,
      personId: true,
      person: {
        select: {
          primaryEmail: true,
          passwordHash: true,
          _count: { select: { credentials: true, contexts: { where: { type: 'CONSULTANT', companyId: null } } } },
          contexts: { where: { companyId, revokedAt: null }, select: { id: true }, take: 1 },
        },
      },
      listings: {
        where: { companyId, revokedAt: null },
        select: { state: true, firmName: true, firmHeadline: true, firmSkills: true, firmLocation: true, firmNotes: true },
      },
      _count: { select: { listings: { where: { companyId: { not: companyId } } } } },
    },
  })

  // Which of them this firm's own ask made: only asked where it decides.
  const open = rows.filter((r) => {
    const ownAccount = accountOf(r.person)
    return !ownAccount && r._count.listings > 0
  })
  const made = new Set<string>()
  if (open.length > 0) {
    const logs = await prisma.automationLog.findMany({
      where: {
        companyId,
        action: 'CONSULTANT_CREATED',
        OR: open.map((r) => ({ payload: { path: ['profileId'], equals: r.id } })),
      },
      select: { payload: true },
    })
    for (const l of logs) {
      const id = (l.payload as { profileId?: unknown } | null)?.profileId
      if (typeof id === 'string') made.add(id)
    }
  }

  const out = new Map<string, FirmRead>()
  for (const r of rows) {
    const listing = r.listings[0] ?? null
    const onlyTyped = readsOnlyWhatItTyped({
      isSubject: r.personId === o.callerPersonId,
      seatHere: r.person.contexts.length > 0,
      listingState: listing?.state ?? (o.asAsked ? 'INVITED' : null),
      ownAccount: accountOf(r.person),
      madeHere: made.has(r.id),
      otherFirmsEver: r._count.listings,
    })
    out.set(r.id, { onlyTyped, typed: onlyTyped ? typedOnly(listing, r.person.primaryEmail) : null })
  }
  return out
}

/**
 * The name a firm's log and notice carry when she answers its ask from her
 * own page or her invitation. A yes shares her record with the firm, so it
 * names her own name. A no is not a yes: it names her as the firm reads
 * her, which is what it typed where that is all it reads. Pure.
 */
export function nameOnHerAnswer(o: { said: string; ownName: string; read: FirmRead | null | undefined }): string {
  if (o.said === 'ACCEPT') return o.ownName
  return o.read?.typed?.name ?? o.ownName
}

/** The ids, out of `firmReadsAt`'s answer, this firm reads only its own words about. */
export function typedOnlyIds(reads: Map<string, FirmRead>): string[] {
  return [...reads.entries()].filter(([, r]) => r.onlyTyped).map(([id]) => id)
}

function accountOf(p: { passwordHash: string | null; _count: { credentials: number; contexts: number } }): boolean {
  return hasOwnAccount({ passwordSet: Boolean(p.passwordHash), signIns: p._count.credentials, ownSeats: p._count.contexts })
}
