import { compact as money } from '@/lib/money-display'
import { formatDay } from '@/lib/format-date'

/**
 * The facts of a job request, as the page that decides it reads them.
 * Beside the page so a test can read them without a browser; no
 * database, no clock.
 */

/** "Oct 12, 2026" — a date the way a person says it, never ISO. */
export function day(iso: string | null | undefined): string | null {
  if (!iso) return null
  return formatDay(iso)
}

/**
 * What the job is, before anything about who approved it.
 *
 * The founder opened HCM integration lead and read a title and nothing
 * else: "how can anyone approve such content?" So every fact the row
 * holds is here, in the order somebody deciding would ask — what the
 * work is, the skills, when and for how long, where, the pay, how many,
 * whose need it is and why. A fact the job request does not state says
 * so, rather than leaving a gap that reads as nothing to know.
 */
export function jobFacts(r: any): { label: string; value: string }[] {
  const range =
    r.billMin != null && r.billMax != null ? `${money(r.billMin)}–${money(r.billMax)} an hour`
    : r.billMax != null ? `up to ${money(r.billMax)} an hour`
    : r.billMin != null ? `from ${money(r.billMin)} an hour`
    : null
  const starts = r.startDate ? `Starts ${day(r.startDate)}` : r.neededBy ? `Needed by ${day(r.neededBy)}` : null
  const who = r.owner?.name ?? r.raisedBy?.name ?? null
  const rows: { label: string; value: string | null }[] = [
    { label: 'Starts', value: starts },
    { label: 'How long', value: r.months ? `${r.months} month${r.months === 1 ? '' : 's'}` : null },
    { label: 'Hours a week', value: r.hoursPerWeek ? `${r.hoursPerWeek}` : null },
    { label: 'Where', value: r.location ?? null },
    { label: 'Pay range', value: range },
    { label: 'How many', value: `${r.headcount} ${r.headcount === 1 ? 'person' : 'people'}` },
    { label: 'Hiring manager', value: who },
    // Whoever typed it, always by name where the row knows it. This was
    // shown only when it differed from the hiring manager, so a manager
    // who raised their own request read "Raised by: Not stated" a minute
    // after raising it — a blank that reads as nobody.
    { label: 'Raised by', value: r.raisedBy?.name ?? null },
    { label: 'Team', value: r.orgUnit?.name ?? null },
    { label: 'Cost center', value: r.costCenter ? `${r.costCenter.name} (${r.costCenter.code})` : null },
    { label: 'Budget stated', value: r.budgetCents ? money(r.budgetCents) : null },
  ]
  return rows.map((x) => ({ label: x.label, value: x.value ?? 'Not stated' }))
}


/**
 * What a new job request still has to say before it is raised — the
 * facts the desks check it against, and the ones a person approving it
 * needs to read. Every field was optional but the title, so a job
 * request reached an approver as a title and nothing else.
 *
 * The API still takes a job request with less, because an import or a
 * supplier's own record may; this is the form, asking a manager for what
 * they know.
 */
export function missingForApproval(
  form: {
    title: string; skills: string; billMax: string; months: string; hoursPerWeek: string
    costCenterId: string; description: string; justification: string; location: string
  },
  opts: { costCentersOffered: boolean }
): string[] {
  const out: string[] = []
  if (form.title.trim().length < 3) out.push('the job')
  if (form.description.trim().length === 0) out.push('what the work is')
  if (form.skills.split(',').map((x) => x.trim()).filter(Boolean).length === 0) out.push('the skills it needs')
  if (!(Number(form.billMax) > 0)) out.push('the most you will pay an hour')
  if (!(Number(form.months) > 0)) out.push('how many months')
  if (!(Number(form.hoursPerWeek) > 0)) out.push('the hours a week')
  if (form.location.trim().length === 0) out.push('where the work is')
  if (opts.costCentersOffered && !form.costCenterId) out.push('which budget pays for it')
  if (form.justification.trim().length === 0) out.push('why it is needed')
  return out
}

/** "Say what the work is, the skills it needs and why it is needed." */
export function missingSays(missing: string[]): string | null {
  if (missing.length === 0) return null
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
  return `Say ${list}. The desks check the job against these, and whoever approves it reads them.`
}


// ── What the approval was checked against, said once and consistently ──

export interface CheckedBasis {
  basis: 'RECORDED' | 'NOW'
  at: string
  checks: { outcome: string; reason: string; stage?: string; code?: string }[]
}

/**
 * The line above the checks, and the words beside a check that would
 * send the job to a person.
 *
 * The tester read "Cleared automatically · Within plan and under every
 * threshold" in the approval box and, under it, "What it is worth: … is
 * over the limit — needs a person". Both were true and neither said
 * when: the job cleared on the day it was raised, the checks from that
 * day were never recorded, and the ones shown were run again on today's
 * plan, where the estimate now crosses the line. So where the re-run
 * disagrees with a decision already made, the page says the decision
 * stands and the check describes today — never "needs a person" about a
 * job no person will be asked about.
 */
export function checkedSays(checked: CheckedBasis, approvalState: string): { intro: string; routeSuffix: string } {
  const decided = approvalState === 'AUTO_APPROVED' || approvalState === 'APPROVED'
  if (checked.basis === 'RECORDED') {
    return { intro: `As checked on ${day(checked.at)}, when the job request was raised.`, routeSuffix: ' — needs a person' }
  }
  const wouldRoute = checked.checks.some((c) => c.outcome === 'ROUTE')
  if (decided && wouldRoute) {
    return {
      intro:
        'Checked again today, against today’s plan — the checks from when it was raised were not recorded. ' +
        (approvalState === 'AUTO_APPROVED' ? 'It cleared by rule when it was raised, and that stands. ' : 'It was approved, and that stands. ') +
        'Raised today, the line marked ! would go to a person.',
      routeSuffix: ' — would need a person if raised today',
    }
  }
  return {
    intro: 'Checked now, against today’s plan. The checks from when it was raised were not recorded.',
    routeSuffix: decided ? ' — would need a person if raised today' : ' — needs a person',
  }
}

/**
 * A desk's sentence with what the page already said taken out of it.
 *
 * The rule engine writes each desk's reason as "who — why", and the why
 * is the check's own sentence, so a job over the money line printed one
 * long sentence four times in one panel: as the headline, as the check,
 * and inside both money desks' rows. The headline and the check say it;
 * a desk row keeps only its own part — "The final word on Apps' spend",
 * "Technology — over $80k".
 */
export function withoutRepeat(text: string, alreadySaid: string[]): string {
  let out = text ?? ''
  for (const said of alreadySaid.map((x) => (x ?? '').trim()).filter((x) => x.length >= 20)) {
    const at = out.indexOf(said)
    if (at < 0) continue
    out = out.slice(0, at) + out.slice(at + said.length)
  }
  return out
    .replace(/\s*(—|:|-)\s*$/, '')
    .replace(/^\s*(—|:)\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Whether the job is over, and the one sentence that says so at the top.
 *
 * After the award the page went on offering "Send to suppliers" and the
 * matches, said nothing about the job being filled, and showed the rate
 * the supplier asked rather than the one agreed. A filled job says who
 * filled it and at what rate, and offers nothing that would send it out
 * again.
 */
export function filledSays(
  r: { status: string; headcount: number },
  candidates: {
    status: string; person: { name: string }; rate: number; placedRate?: number | null
    /** The day the award wrote the line. Null where no line stands behind the row. */
    placedOn?: string | null
  }[]
): string | null {
  if (r.status !== 'FILLED') return null
  const placed = candidates.filter((c) => c.status === 'PLACED')
  if (placed.length === 0) return 'This job is filled. It goes to no more suppliers.'
  const who = placed.map((c) =>
    `${c.person.name} at ${money(c.placedRate ?? c.rate)}/hr${c.placedOn ? ` on ${day(c.placedOn)}` : ''}`
  )
  const list = who.length === 1 ? who[0] : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}`
  return `Filled by ${list}. It goes to no more suppliers, and everybody else who was put forward has been told.`
}

/** A job that may still be sent out or matched: published and not over. */
export function stillOpen(r: { status: string; archivedAt?: string | null }): boolean {
  return (r.status === 'OPEN' || r.status === 'DRAFT') && !r.archivedAt
}
