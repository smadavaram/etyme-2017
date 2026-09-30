import { compact as money } from '@/lib/money-display'

/**
 * The facts of a job request, as the page that decides it reads them.
 * Beside the page so a test can read them without a browser; no
 * database, no clock.
 */

/** "Oct 12, 2026" — a date the way a person says it, never ISO. */
export function day(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
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
    { label: 'Raised by', value: r.raisedBy && r.owner && r.raisedBy.id !== r.owner.id ? r.raisedBy.name : null },
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
