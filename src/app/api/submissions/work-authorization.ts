/**
 * Work authorization, asked at the door where a person is put forward.
 *
 * Addendum E names work authorization a BLOCK, and it is one — at
 * activation, where nobody starts without it (`lib/contract-clearance`,
 * unchanged). At submission it is a WARN: a bench consultant often has
 * nothing on file until the firm that wins the role completes the I-9,
 * and refusing every such submission is governance slower than the
 * workaround. But it is never silent — the submitter, and the record,
 * are told now what activation will refuse later.
 *
 * What counts as authorization on record is activation's own answer:
 * the same `heldFrom` reading of the person's verifications and the same
 * `AUTHORISATION_KEYS`, so this warning predicts that block and never
 * names a different document.
 *
 * Pure. The route reads the rows and passes `now`.
 */
import { AUTHORISATION_KEYS, heldFrom, type VerificationRow } from '@/lib/contract-clearance'
import { jobRestriction } from '@/lib/checks'
import { plainDate } from '@/lib/plain-date'
import { NEEDS_NO_SPONSOR } from '@/lib/work-authorisation'

export type WorkAuthCode = 'NO_WORK_AUTH' | 'WORK_AUTH_RUNS_OUT' | 'WORK_AUTH_NOT_YET'

export type WorkAuthVerdict = { ok: true } | { ok: false; code: WorkAuthCode; says: string }

function day(d: Date): string {
  return plainDate(d.toISOString().slice(0, 10))
}

export function workAuthAtSubmission(args: {
  personName: string
  rows: VerificationRow[]
  /** The job's first day, or null where nobody set one (today is used). */
  startsOn: Date | null
  now: Date
}): WorkAuthVerdict {
  const { personName, rows, now } = args
  const start = new Date(Math.max((args.startsOn ?? now).getTime(), now.getTime()))
  const startSays = args.startsOn && args.startsOn.getTime() > now.getTime() ? `the job starts on ${day(start)}` : 'today'
  const keys = AUTHORISATION_KEYS as readonly string[]
  const held = heldFrom(rows).filter((h) => keys.includes(h.key) && h.accepted)

  if (held.length === 0) {
    return {
      ok: false,
      code: 'NO_WORK_AUTH',
      says:
        `${personName} has no work authorization on record. The submission goes through, ` +
        'but they cannot start until one is on file.',
    }
  }

  const covers = held.some(
    (h) =>
      (h.validFrom == null || h.validFrom.getTime() <= start.getTime()) &&
      (h.expiresAt == null || h.expiresAt.getTime() > start.getTime())
  )
  if (covers) return { ok: true }

  const runsOut = held.filter((h) => h.expiresAt != null && h.expiresAt.getTime() <= start.getTime())
  if (runsOut.length === held.length) {
    const last = new Date(Math.max(...runsOut.map((h) => h.expiresAt!.getTime())))
    return {
      ok: false,
      code: 'WORK_AUTH_RUNS_OUT',
      says:
        `${personName}'s work authorization on record runs out on ${day(last)}, before ${startSays}. ` +
        'The submission goes through, but they cannot start until a current one is on file.',
    }
  }

  const begins = held
    .filter((h) => h.validFrom != null && h.validFrom.getTime() > start.getTime())
    .map((h) => h.validFrom!.getTime())
  const first = new Date(Math.min(...begins))
  return {
    ok: false,
    code: 'WORK_AUTH_NOT_YET',
    says:
      `${personName}'s work authorization on record does not begin until ${day(first)}, after ${startSays}. ` +
      'The submission goes through, but they cannot start before it begins.',
  }
}

// ── Sponsorship, where the work is done ─────────────────────────────────
//
// Decided by the founder, 2026-11-03 ("Work authorization is checked
// where the work is done"): a person who said she will need sponsorship
// is never interviewed for a US job that offers none. The answer is the
// person's own (`ConsultantProfile.needsSponsorship`, with the day and her
// words); the job's "no sponsorship" is its restriction, read through the
// same `jobRestriction` screening reads. Three outcomes:
//
//  - the job records a lawful basis for offering none: REFUSED, because
//    the basis is legally grounded (Addendum E's BLOCK) and an interview
//    booked past it is three rounds nobody can use;
//  - the job names only people who need no sponsorship, with no basis:
//    WARNED with the same facts, and it goes through (INA §274B: an
//    ungrounded restriction never turns anybody away);
//  - the work is done offshore: nothing is said about US authorization at
//    all, because she is not employed in the US.
//
// "No sponsorship" never turns away somebody who needs none: a person who
// said no, or was never asked, passes here whatever the job says.

export type SponsorshipVerdict =
  | { outcome: 'PASS' }
  | { outcome: 'BLOCK' | 'WARN'; code: 'NEEDS_SPONSORSHIP'; says: string }

/** Whether the job's restriction leaves out everybody who would need a petition. */
function offersNoSponsorship(r: { requires: readonly string[] }): boolean {
  return r.requires.length > 0 && r.requires.every((a) => (NEEDS_NO_SPONSOR as readonly string[]).includes(a))
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

export function sponsorshipAtSubmission(args: {
  personName: string
  /** The person's own answer. Null means nobody asked, never "no". */
  needsSponsorship: boolean | null
  saidAt: Date | null
  quote: string | null
  /** The job's three columns. */
  job: { workAuthRequired: string | null; workAuthBasis: string | null; workAuthCite: string | null }
  /** Where the work is done (`lib/work-country`). Null where it could not be read: read as the site's, the US. */
  work: { country: string; offshore: boolean } | null
}): SponsorshipVerdict {
  const work = args.work ?? { country: 'US', offshore: false }
  if (work.offshore || work.country !== 'US') return { outcome: 'PASS' }
  if (args.needsSponsorship !== true) return { outcome: 'PASS' }
  const r = jobRestriction(args.job.workAuthRequired, args.job.workAuthBasis, args.job.workAuthCite)
  if (!r || !offersNoSponsorship(r)) return { outcome: 'PASS' }
  // A job restricted for another reason (export control, a clearance, a
  // statute) is screening's to decide on the status itself; this sentence
  // is about sponsorship only.
  if (r.basis && r.basis !== 'SPONSORSHIP_UNAVAILABLE') return { outcome: 'PASS' }

  const who = firstName(args.personName)
  const when = args.saidAt ? ` on ${day(args.saidAt)}` : ''
  const own = args.quote?.trim() ? ` ("${args.quote.trim()}")` : ''
  // No pronoun: the record stores none.
  const said = `${who} said${when} they will need sponsorship${own}`

  if (r.basis) {
    const words = r.cite ? `: "${r.cite.replace(/[.\s]+$/, '')}".` : '.'
    return {
      outcome: 'BLOCK',
      code: 'NEEDS_SPONSORSHIP',
      says:
        `${said}; this job offers none${words} ` +
        `${args.personName} is not put forward, so no interview is booked. Ask the client whether it will sponsor, or put forward somebody who needs none.`,
    }
  }
  return {
    outcome: 'WARN',
    code: 'NEEDS_SPONSORSHIP',
    says:
      `${said}; this job names only people who need no sponsorship, and no lawful reason is recorded for it. ` +
      'The submission goes through. Ask the client whether it will sponsor before an interview is booked.',
  }
}
