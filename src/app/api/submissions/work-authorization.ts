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
import { plainDate } from '@/lib/plain-date'

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
