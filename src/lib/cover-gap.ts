/**
 * The weeks nobody is insured.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The nightly chase watched one thing: a certificate about to run out.
 * That is the right warning for the ordinary case and it is silent on
 * the case that actually hurts. A supplier whose cover ran out on the
 * last day of September and whose new policy begins on the eighteenth of
 * October has a certificate on file, a renewal on file, and seventeen
 * days when nobody on any of its sites is insured. Nothing expired that
 * week — the old one expired weeks ago and was answered — so no warning
 * fired, and nobody was asked to cover the gap.
 *
 * The gap is the whole point of the chase. `standingOf` already refuses
 * a policy that has not started, which stops a start; this is what asks
 * for the missing weeks before somebody is standing in them.
 *
 * ── What this is not ─────────────────────────────────────────────────
 *
 * It is not the expiry watch and does not repeat it. Cover running out
 * with nothing filed behind it is `watchVerifications`'s sentence and
 * stays there. This speaks only where two dates on file leave a hole
 * between them, or where the only cover on file has not started yet —
 * the two cases where "renew it" is the wrong instruction, because the
 * renewal is already here.
 *
 * Pure. The cron reads the rows and does the sending; this decides.
 */

import { COVER_THAT_STOPS_WORK, coverLabel } from '@/lib/document-stages'
import type { Finding } from '@/lib/watch'

const DAY = 86_400_000

/** A certificate as the database holds it. */
export interface CoverRow {
  id: string
  companyId: string
  companyName: string
  type: string
  status: string
  issuedAt: Date | null
  /** The day cover begins. Falls back to the day it was issued. */
  validFrom: Date | null
  expiresAt: Date | null
}

/**
 * Only a certificate somebody accepted counts as cover. A check still
 * running is not a policy, and a row marked expired is the supplier's own
 * word that it is not one either.
 */
const A_CERTIFICATE = ['CLEAR', 'CONDITIONAL']

const floorOf = (c: CoverRow): Date | null => c.validFrom ?? c.issuedAt ?? null

const day = (d: Date) => d.toISOString().slice(0, 10)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Where a company's cover has a hole in it.
 *
 * Grouped by kind, because general liability running does not insure the
 * weeks workers' compensation is missing — they are different policies
 * bought from different underwriters and the trade treats them as
 * separate answers.
 *
 * `horizonDays` is the same sixty days the expiry watch uses: far enough
 * ahead that a broker can act, near enough that it is this month's
 * problem rather than a list of everything wrong with next year.
 */
export function coverGaps(rows: CoverRow[], now: Date, horizonDays = 60): Finding[] {
  const out: Finding[] = []

  const groups = new Map<string, CoverRow[]>()
  for (const r of rows) {
    if (!A_CERTIFICATE.includes(r.status)) continue
    const key = `${r.companyId}::${r.type}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }

  for (const certificates of groups.values()) {
    const first = certificates[0]
    const label = coverLabel(first.type)
    const stopsWork = (COVER_THAT_STOPS_WORK as readonly string[]).includes(first.type)

    const coveringToday = certificates.filter((c) => {
      const floor = floorOf(c)
      if (floor && floor.getTime() > now.getTime()) return false
      if (c.expiresAt && c.expiresAt.getTime() < now.getTime()) return false
      return true
    })

    // Sorted by the day cover begins, so "the next one" means the next one.
    const future = certificates
      .filter((c) => {
        const floor = floorOf(c)
        return floor != null && floor.getTime() > now.getTime()
      })
      .sort((a, b) => floorOf(a)!.getTime() - floorOf(b)!.getTime())

    // ── Nothing covers today, and something covers later ──
    //
    // Said separately from "your cover lapsed", because the supplier
    // cannot act on a renewal it has already sent. What is missing is
    // cover for the weeks before the policy it filed begins.
    if (coveringToday.length === 0) {
      const next = future[0]
      // With nothing filed for later either, there is no gap between two
      // dates — there is simply no cover, and the expiry watch says so.
      if (!next) continue
      const starts = floorOf(next)!
      const uncovered = Math.ceil((starts.getTime() - now.getTime()) / DAY)
      out.push({
        kind: 'COVER_NOT_STARTED',
        urgency: stopsWork ? 'BLOCKING' : 'SOON',
        companyId: first.companyId,
        subjectType: 'Verification',
        subjectId: next.id,
        headline: `${first.companyName}: ${label} does not start until ${day(starts)}`,
        detail:
          `${first.companyName} has a ${label} on file and its cover begins on ${day(starts)}, ` +
          `so nobody is insured through them for the next ${plural(uncovered, 'day')}. ` +
          `Renewing is not the ask — the renewal is already here. ` +
          `Ask the broker to bring the start forward, or nobody starts before the cover does.`,
        action: 'REOPEN_PACKET',
        daysUntil: 0,
      })
      continue
    }

    // ── Cover today, and a hole after it ──
    // One certificate with no end date means the cover does not stop, and
    // a gap after something that never ends is not a thing.
    if (coveringToday.some((c) => !c.expiresAt)) continue
    const runsOutOn = coveringToday.reduce(
      (latest, c) => (c.expiresAt!.getTime() > latest.getTime() ? c.expiresAt! : latest),
      new Date(0)
    )

    const daysToLapse = Math.ceil((runsOutOn.getTime() - now.getTime()) / DAY)
    // Beyond the horizon it is next year's problem, and a warning nobody
    // can act on yet is the kind that trains people to ignore warnings.
    if (daysToLapse > horizonDays) continue

    const next = future.find((c) => floorOf(c)!.getTime() > runsOutOn.getTime())
    // Nothing filed for afterwards at all is the expiry watch's sentence,
    // not this one.
    if (!next) continue

    const startsOn = floorOf(next)!
    // Cover beginning the day after the old policy ends is continuous
    // cover, which is what a well-run renewal looks like.
    const gapDays = Math.round((startsOn.getTime() - runsOutOn.getTime()) / DAY) - 1
    if (gapDays <= 0) continue

    out.push({
      kind: 'COVER_GAP',
      urgency: stopsWork && daysToLapse <= 30 ? 'SOON' : 'WORTH_KNOWING',
      companyId: first.companyId,
      subjectType: 'Verification',
      subjectId: next.id,
      headline: `${first.companyName}: ${plural(gapDays, 'day')} with no ${label} from ${day(new Date(runsOutOn.getTime() + DAY))}`,
      detail:
        `${first.companyName}'s ${label} runs out on ${day(runsOutOn)} and the next one on file does not ` +
        `start until ${day(startsOn)}, leaving ${plural(gapDays, 'day')} when nobody is insured through them. ` +
        `Anybody on site in those ${plural(gapDays, 'day')} is uncovered, and nobody new can start in them. ` +
        `Ask the broker for cover for the weeks in between — the renewal itself is already on file.`,
      action: 'REOPEN_PACKET',
      daysUntil: daysToLapse,
    })
  }

  return out
}
