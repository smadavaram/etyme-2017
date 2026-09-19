import { coverLabel } from '@/lib/document-stages'

/**
 * A supplier's certificate, and a supplier's verdict, as a screen reads them.
 *
 * Two screens were saying different things about the same policy. The
 * compliance page computed a standing and printed "Not started yet" over
 * cover that begins in October; the placement thread printed the stored
 * `status` — "Clear" — over the same row, on the same day the submission
 * door refused it. A product that contradicts itself about the law is one
 * nobody trusts on either answer.
 *
 * So the words live here, once, and any screen showing a certificate
 * reads them from this file rather than inventing its own. The rule the
 * words encode is the one `document-stages` already enforces: cover that
 * has not begun stops work for the same reason lapsed cover does, so it
 * reads in the same tone — and it never says "renew it", because the
 * certificate in the supplier's hand is already the newest one there is.
 */

export interface CoverCertificateRow {
  /** INSURANCE_GL · INSURANCE_WC · INSURANCE_EO · INSURANCE_CYBER */
  type: string
  /** The stored Verification status — a claim about the day somebody filed it. */
  status: string
  /** The day the policy period begins, where the certificate says so. */
  validFrom?: string | null
  expiresAt?: string | null
  /** What `standingOf` computed for today. Wins over the stored status. */
  standing?: string | null
  /** The computed sentence. What a person should actually read. */
  says?: string | null
}

export interface SubVendorCoverVerdict {
  vendor: string
  outcome: 'PASS' | 'WARN' | 'BLOCK'
  says: string
  fix: string | null
}

/** The stored status, in a word. Mirrors the compliance page exactly. */
const STATUS_WORDS: Record<string, string> = {
  CLEAR: 'Clear',
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  FLAGGED: 'Flagged',
  FAILED: 'Failed',
  CONDITIONAL: 'Conditional',
  EXPIRED: 'Expired',
}

/**
 * What a certificate reads as today.
 *
 * The computed standing wins over the stored status, because the stored
 * status is a claim about the day somebody last touched the row.
 */
export function coverStandingLabel(row: CoverCertificateRow): string {
  switch (row.standing) {
    case 'EXPIRED':            return 'Lapsed'
    case 'NOT_YET_VALID':      return 'Not started yet'
    case 'EXPIRING':           return 'Expiring'
    case 'NO_EXPIRY_RECORDED': return 'No expiry recorded'
    default:                   return STATUS_WORDS[row.status] ?? row.status.replace(/_/g, ' ').toLowerCase()
  }
}

/**
 * The tone it deserves.
 *
 * Cover that has not begun carries the blocked tone the same as cover
 * that has run out, because it stops the same thing. Left to the stored
 * status it would have gone gray beside a policy that is fine — two
 * states nobody could tell apart, which is the 2017 display bug in a
 * newer shape.
 */
export function coverStandingChipClass(row: CoverCertificateRow): string {
  if (row.standing === 'EXPIRED' || row.standing === 'NOT_YET_VALID') return 'chip--danger'
  if (row.standing === 'EXPIRING' || row.standing === 'NO_EXPIRY_RECORDED') return 'chip--attention'

  const s = (row.status ?? '').toUpperCase()
  if (['CLEAR', 'APPROVED'].includes(s)) return 'chip--verified'
  if (['EXPIRED', 'FAILED', 'FLAGGED', 'REJECTED', 'BLOCKED'].includes(s)) return 'chip--danger'
  if (['PENDING', 'IN_PROGRESS', 'CONDITIONAL', 'SUBMITTED'].includes(s)) return 'chip--attention'
  return 'chip--passive'
}

const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

/**
 * The date worth showing beside the word.
 *
 * For cover that has not begun, the day it does — a date somebody can act
 * on. For everything else, the day it runs out.
 */
export function coverDateNote(row: CoverCertificateRow): string | null {
  if (row.standing === 'NOT_YET_VALID' && row.validFrom) return `starts ${shortDay(row.validFrom)}`
  if (row.expiresAt) return `exp ${monthYear(row.expiresAt)}`
  return null
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** One certificate, as a chip. The computed sentence is on the hover. */
export function CoverChip({ cover }: { cover: CoverCertificateRow }) {
  const note = coverDateNote(cover)
  return (
    <span className={`chip ${coverStandingChipClass(cover)}`} title={cover.says ?? undefined}>
      {capitalize(coverLabel(cover.type))} · {coverStandingLabel(cover)}
      {note ? ` · ${note}` : ''}
    </span>
  )
}

/** The answer, in the words the compliance page uses for the same question. */
export function coverOutcomeWords(outcome: SubVendorCoverVerdict['outcome']): string {
  if (outcome === 'BLOCK') return 'No — cover does not hold today'
  if (outcome === 'WARN') return 'Yes, with something to chase'
  return 'Yes'
}

export function coverOutcomeChipClass(outcome: SubVendorCoverVerdict['outcome']): string {
  if (outcome === 'BLOCK') return 'chip--danger'
  if (outcome === 'WARN') return 'chip--attention'
  return 'chip--verified'
}

/**
 * The firm below this one, and whether it could put anybody forward today.
 *
 * The same `supplierCoverGate` the submission door calls, so a placement
 * cannot read green on cover that refuses a submission an hour later. Its
 * sentence and its remedy are printed as computed — nothing here composes
 * a string about a policy, because that is how "renew it" reached a
 * screen about cover that has not started.
 */
export function SubVendorCover({ cover }: { cover: SubVendorCoverVerdict | null }) {
  if (!cover) return null
  return (
    <div className="card mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="lbl">Can {cover.vendor} still supply today?</div>
        <span className={`chip ${coverOutcomeChipClass(cover.outcome)}`}>
          {coverOutcomeWords(cover.outcome)}
        </span>
      </div>
      <p
        className={`mt-2 text-[13px] leading-relaxed ${
          cover.outcome === 'BLOCK' ? 'text-etyme-attention' : 'text-etyme-muted'
        }`}
      >
        {cover.says}
        {cover.fix && <span className="text-etyme-ink"> {cover.fix}</span>}
      </p>
    </div>
  )
}
