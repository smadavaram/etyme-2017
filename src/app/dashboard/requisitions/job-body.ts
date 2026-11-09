import { centsTyped } from './facts'

/**
 * What the job request form posts to the raise (`POST /api/requisitions`),
 * as a pure function of what it draws, so the field contract can fill in
 * every field the form draws, post exactly this, and check it against what
 * the raise reads (`every-question-has-a-field-demand.test.ts`).
 */

/** What the form's fields hold when it is sent. */
export interface JobTyped {
  title: string
  /** "Java, Spring", as typed. */
  skills: string
  /** The site picked, where the company has sites. */
  siteId: string | null
  /** Free text, only where the company has no site. */
  location: string
  /** Where the work is done: ONSITE · HYBRID · REMOTE. The form opens on ONSITE. */
  workMode: string
  /** "Sponsorship": YES or NO. The form opens on YES. */
  sponsorship: string
  /** The firm's own words for its policy, asked only when sponsorship is NO. */
  sponsorshipPolicy: string
  /** The qualification the job asks for, in the manager's words; blank asks none. */
  requiredQualification: string
  /** The suppliers ticked under "Send the job to", where a site is picked; null where none is. */
  sendTo: string[] | null
  headcount: string
  budget: string
  hoursPerWeek: string
  billMin: string
  billMax: string
  months: string
  neededBy: string
  description: string
  justification: string
  costCenterId: string
  ownerId: string | null
  panel: string[]
}

/** The body the form posts. */
export function jobBody(t: JobTyped): Record<string, unknown> {
  return {
    title: t.title.trim(),
    skills: t.skills.split(',').map((s) => s.trim()).filter(Boolean),
    // The site by id; the free text only where the company has no site.
    locationId: t.siteId ?? null,
    location: t.siteId ? null : (t.location.trim() || null),
    // Where the work is done, beside the site: the work country follows it.
    workMode: t.workMode || 'ONSITE',
    // Whether the job offers sponsorship; the policy's words only where it
    // does not, because they are the reason on record when somebody who
    // would need a visa is held back.
    sponsorship: t.sponsorship === 'NO' ? 'NO' : 'YES',
    ...(t.sponsorship === 'NO' ? { sponsorshipPolicy: t.sponsorshipPolicy.trim() } : {}),
    // The qualification it asks for; null asks none. Read by the degree
    // rules as "not what the job asks", which warns and never blocks.
    requiredQualification: t.requiredQualification.trim() || null,
    // Who it goes to. Sent on the raise where the job clears by rule.
    ...(t.sendTo ? { sendTo: [...t.sendTo] } : {}),
    headcount: parseInt(t.headcount, 10) || 1,
    // Rates are entered in dollars and stored in cents.
    budget: centsTyped(t.budget),
    hoursPerWeek: t.hoursPerWeek ? parseInt(t.hoursPerWeek, 10) : null,
    billMin: centsTyped(t.billMin),
    billMax: centsTyped(t.billMax),
    months: t.months ? parseInt(t.months, 10) : null,
    neededBy: t.neededBy || null,
    description: t.description.trim() || null,
    justification: t.justification.trim() || null,
    costCenterId: t.costCenterId || null,
    // Whose need it is, distinct from who typed it.
    ownerId: t.ownerId || null,
    // The panel, so the first interview form opens with the room already in it.
    interviewers: t.panel,
  }
}

/**
 * Every field the raise reads that the form never sends, and why it need
 * not: the raise works it out itself, or another caller sends it.
 */
export const JOB_FIELDS_NOT_SENT: Readonly<Record<string, string>> = {
  orgUnitId: 'The team is read from the budget the job is charged to, or the seat’s own unit.',
  raisedById: 'Who raised it is the person signed in, unless a caller raising for somebody else names them.',
  overtimeAfterHours: 'Straight time unless the role says otherwise; an import or the simulation may send it.',
  overtimeMultiplierBps: 'The overtime multiplier has its default; an import or the simulation may send it.',
}

/**
 * The two work questions as the edit form sends them (`PATCH
 * /api/requisitions/:id`, action "edit"), as a pure function of what it
 * draws: where the work is done, always; sponsorship and the policy's
 * words only where the form drew the question, which it does not for a
 * job held back on another recorded basis.
 */
export function editWorkBody(t: {
  workMode: string
  sponsorship: string
  sponsorshipPolicy: string
  /** Set where the job is held back on another basis, so no sponsorship question was drawn. */
  otherBasis: string | null
  /** The qualification the job asks for, as the edit form holds it; absent where the form does not draw it. */
  requiredQualification?: string
}): Record<string, unknown> {
  return {
    workMode: t.workMode || 'ONSITE',
    ...(t.requiredQualification !== undefined ? { requiredQualification: t.requiredQualification.trim() || null } : {}),
    ...(t.otherBasis ? {} : {
      sponsorship: t.sponsorship === 'NO' ? 'NO' : 'YES',
      ...(t.sponsorship === 'NO' ? { sponsorshipPolicy: t.sponsorshipPolicy.trim() } : {}),
    }),
  }
}

/** What the Edit form's fields hold: as it opened, and as it is sent. */
export interface EditTyped {
  title: string
  /** "Java, Spring", as typed. */
  skills: string
  location: string
  headcount: string
  billMin: string
  billMax: string
  months: string
  hoursPerWeek: string
  neededBy: string
  description: string
  justification: string
  panel: string[]
  workMode: string
  sponsorship: string
  sponsorshipPolicy: string
  requiredQualification: string
}

/** Each field as the route reads it, keyed by the name it is sent under. */
function editFields(t: EditTyped, otherBasis: string | null): Record<string, unknown> {
  const whole = (v: string) => (v.trim() === '' ? null : Number(v))
  return {
    title: t.title.trim(),
    skills: t.skills.split(',').map((x) => x.trim()).filter(Boolean),
    location: t.location.trim() || null,
    headcount: Number(t.headcount) || 1,
    // Rates are typed in whole units and stored in cents, through the one reader.
    billMin: centsTyped(t.billMin),
    billMax: centsTyped(t.billMax),
    months: whole(t.months),
    hoursPerWeek: whole(t.hoursPerWeek),
    neededBy: t.neededBy || null,
    description: t.description.trim() || null,
    justification: t.justification.trim() || null,
    // The panel travels with the job, so every interview round starts with it.
    interviewers: t.panel,
    ...editWorkBody({
      workMode: t.workMode, sponsorship: t.sponsorship, sponsorshipPolicy: t.sponsorshipPolicy,
      otherBasis, requiredQualification: t.requiredQualification,
    }),
  }
}

/**
 * What the Edit form posts: only the fields the person changed.
 *
 * Walk 8, 9 November 2026: saving Edit rewrote where the work is and how
 * it is done when nobody touched them. The form posted every field it
 * drew, and two of them did not open on the job's own record: "Where"
 * opened on the site's name, which the route then wrote over the job's
 * own words and told the suppliers about, and "Where is the work done?"
 * opened on on-site wherever the read did not carry it. So the body holds
 * a field only where what the person typed differs from what the form
 * opened on, compared in the shape the route reads (so "40" and "40.00"
 * are one rate), the way the 2026-11-03 edit rule reads a change. The
 * sponsorship and its policy go together, because the policy is the
 * reason on record when sponsorship is not offered.
 */
export function editBody(opened: EditTyped, now: EditTyped, ctx: { otherBasis: string | null }): Record<string, unknown> {
  const before = editFields(opened, ctx.otherBasis)
  const after = editFields(now, ctx.otherBasis)
  const out: Record<string, unknown> = { action: 'edit' }
  const same = (k: string) => JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null)
  for (const k of Object.keys(after)) {
    if (k === 'sponsorship' || k === 'sponsorshipPolicy') continue
    if (!same(k)) out[k] = after[k]
  }
  if ('sponsorship' in after && !(same('sponsorship') && same('sponsorshipPolicy'))) {
    out.sponsorship = after.sponsorship
    if ('sponsorshipPolicy' in after) out.sponsorshipPolicy = after.sponsorshipPolicy
  }
  return out
}
