/**
 * A license, asked at the door where a person is put forward.
 *
 * Found by the screen walk of 2026-10-22: a job that needs a license was
 * checked only when the person started. The client read the CV, ran the
 * interviews and made an offer, and the start was then refused for a
 * license nobody had asked about. The start still refuses
 * (`lib/contract-clearance`, unchanged); this says it at submission.
 *
 * ── What the job asks for ────────────────────────────────────────────
 *
 * A job request has no document set of its own. The set that will apply
 * to the line the award writes is read in two places, and both are read
 * here so this door and the start name the same paper:
 *
 *   - the job's title, where it names a licensed occupation — the same
 *     `licensedOccupation` that picks the licensed start packet;
 *   - the client's own orders, where a row asks the worker for a type
 *     the client treats as a license to practice (`credentialKeys`).
 *
 * ── Warn, or block ───────────────────────────────────────────────────
 *
 * Addendum E: BLOCK where legally grounded, WARN, capture a reason,
 * proceed everywhere else. Unlicensed practice is grounded, and the
 * start blocks on it. At submission nobody is practicing yet: a bench
 * nurse often renews or transfers a state license between the offer and
 * the first shift, and refusing every such submission is governance
 * slower than the workaround. So the default here is WARN with a reason,
 * the way work authorization warns at this door.
 *
 * Where the client's own order row says the license blocks
 * (`DocumentRequirement.blocks` true), the client has insisted, by
 * name, and the submission is refused. The shipped type says it blocks
 * too, but that default is the start's rule and is not read as the
 * client insisting at this earlier door. Coordinator's call to reverse
 * in a sentence.
 *
 * Pure. The route reads the rows and passes `now`.
 */
import { nameCredential, type HeldCredential } from '@/lib/document-stages'
import { plainDate } from '@/lib/plain-date'

/** One license this job asks for, and who asked. */
export interface LicenseAsk {
  /** The document type key — PROFESSIONAL_LICENSE, or the client's own. */
  key: string
  /** How it is said in a sentence: "a state nursing license (the state's board of nursing)". */
  said: string
  /** True only where the client's own order says a missing one stops the work. */
  blocks: boolean
  /** Why the job asks: "the job is for a registered nurse", "Talvern Medical's orders require it". */
  because: string
}

/** The reason code an outcome carries. Never free text. */
export type LicenseCode = 'LICENSE_NONE_ON_FILE' | 'LICENSE_LAPSED' | 'LICENSE_NOT_YET'

export type LicenseVerdict =
  | { outcome: 'PASS'; note: string | null }
  | { outcome: 'WARN'; code: LicenseCode; says: string; note: string | null }
  | { outcome: 'BLOCK'; code: LicenseCode; says: string }

/** A credential somebody has actually produced, whatever its dates say. */
const PRODUCED = ['CLEAR', 'CONDITIONAL', 'EXPIRED']

function day(d: Date): string {
  return plainDate(d.toISOString().slice(0, 10))
}

function covers(c: HeldCredential, on: Date): boolean {
  if (c.status === 'EXPIRED') return false
  const floor = c.validFrom ?? c.issuedAt ?? null
  if (floor && floor.getTime() > on.getTime()) return false
  if (c.expiresAt && c.expiresAt.getTime() < on.getTime()) return false
  return true
}

/**
 * Whether this person's license answers what the job asks for, on the
 * day the job starts.
 *
 * Only the first finding is said, worst first: a missing license, then a
 * lapsed one, then one that has not begun. A license that is current on
 * the first day and runs out inside the job is a note, not a warning —
 * the start itself only warns on it — so it needs no reason.
 */
export function licenseAtSubmission(args: {
  personName: string
  asks: LicenseAsk[]
  credentials: HeldCredential[]
  /** The job's first day, or null where nobody set one (today is used). */
  startsOn: Date | null
  /** The job's last day, where its length is known. */
  through: Date | null
  now: Date
}): LicenseVerdict {
  const { personName, asks, now } = args
  if (asks.length === 0) return { outcome: 'PASS', note: null }

  const start = new Date(Math.max((args.startsOn ?? now).getTime(), now.getTime()))
  const startSays = args.startsOn && args.startsOn.getTime() > now.getTime() ? `the job starts on ${day(start)}` : 'today'

  type Finding = { ask: LicenseAsk; code: LicenseCode; says: string }
  const findings: Finding[] = []
  const notes: string[] = []

  for (const ask of asks) {
    const produced = args.credentials.filter((c) => c.type === ask.key && PRODUCED.includes(c.status))

    if (produced.length === 0) {
      findings.push({
        ask,
        code: 'LICENSE_NONE_ON_FILE',
        says: `${personName} has no ${ask.said} on file, and ${ask.because}.`,
      })
      continue
    }

    // The one covering the start ahead of the one running longest: a
    // renewal filed early is held beside the old license, and picking
    // the future one would warn about somebody for being organized.
    const best = produced.slice().sort((a, b) => {
      const ac = covers(a, start) ? 1 : 0
      const bc = covers(b, start) ? 1 : 0
      if (ac !== bc) return bc - ac
      return (b.expiresAt?.getTime() ?? -Infinity) - (a.expiresAt?.getTime() ?? -Infinity)
    })[0]
    const named = nameCredential(best)

    if (covers(best, start)) {
      if (args.through && best.expiresAt && best.expiresAt.getTime() < args.through.getTime()) {
        notes.push(
          `${personName}'s ${named} runs out on ${day(best.expiresAt)}, before the job ends on ${day(args.through)}. ` +
            'They can be put forward; the renewal has to be on file before that day.'
        )
      }
      continue
    }

    const floor = best.validFrom ?? best.issuedAt ?? null
    if (best.status !== 'EXPIRED' && floor && floor.getTime() > start.getTime()) {
      findings.push({
        ask,
        code: 'LICENSE_NOT_YET',
        says: `${personName}'s ${named} does not begin until ${day(floor)}, after ${startSays}.`,
      })
      continue
    }

    findings.push({
      ask,
      code: 'LICENSE_LAPSED',
      says: best.expiresAt
        ? `${personName}'s ${named} ran out on ${day(best.expiresAt)}, before ${startSays}.`
        : `${personName}'s ${named} is marked expired on their own record.`,
    })
  }

  const note = notes.length > 0 ? notes.join(' ') : null
  if (findings.length === 0) return { outcome: 'PASS', note }

  const blocking = findings.find((f) => f.ask.blocks)
  if (blocking) {
    return {
      outcome: 'BLOCK',
      code: blocking.code,
      says: `${blocking.says} The client's order says nobody is put forward for this job without a current one. Get it on file, then put them forward.`,
    }
  }

  const first = findings[0]
  return {
    outcome: 'WARN',
    code: first.code,
    says: `${first.says} The submission can go ahead with a reason; nobody starts without a current license.`,
    note,
  }
}
