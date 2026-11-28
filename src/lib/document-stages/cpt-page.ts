/**
 * A student's CPT page, as it is recorded: the two facts the start rule
 * for an F-1 student on CPT reads (`workerClassStart`, rules CPT_NONE,
 * CPT_OTHER_EMPLOYER and CPT_OUTSIDE_DATES): the employer the I-20's CPT
 * page names, as the school wrote it, and the dates the school's
 * designated official authorized the training for.
 *
 * Walk 7, 2026-11-08: the route took both and no screen drew either, so
 * a student on CPT could never be started from the screens, the class
 * "the screen cannot reach the rule". One description of the fields is
 * read by the route that refuses without them and drawn by the Visas tab
 * on Compliance, and `every-question-has-a-field.test.ts` holds the two
 * together. Pure.
 *
 * Owned by regulatory.
 */
import { possessive } from '@/lib/requisition-approval'

/** The fields the CPT page is recorded with, in the order the form draws them. */
export const CPT_PAGE_FIELDS = [
  { name: 'employerNamed', label: 'Employer named on the I-20', type: 'text', hint: 'As the school wrote it on the CPT page' },
  { name: 'authorizedFrom', label: 'School authorized from', type: 'date', hint: 'The first day on the CPT page' },
  { name: 'authorizedTo', label: 'School authorized to', type: 'date', hint: 'The last day on the CPT page' },
] as const

export type CptPageField = (typeof CPT_PAGE_FIELDS)[number]['name']

export type CptPageReading =
  | { ok: true; employerNamed: string; from: Date; to: Date }
  | { ok: false; field: CptPageField; message: string }


const dateOf = (v: unknown): Date | null => {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** What the CPT page says, or the one field missing, in a sentence. */
export function readCptPage(body: Record<string, unknown>, personName: string): CptPageReading {
  const employerNamed = typeof body.employerNamed === 'string' ? body.employerNamed.trim() : ''
  if (!employerNamed) {
    return { ok: false, field: 'employerNamed', message: `Say which employer ${possessive(personName)} CPT page names, as the school wrote it.` }
  }
  const from = dateOf(body.authorizedFrom)
  const to = dateOf(body.authorizedTo)
  if (!from || !to) {
    return { ok: false, field: !from ? 'authorizedFrom' : 'authorizedTo', message: 'Give the dates the school authorized the CPT from and to, as printed on the I-20.' }
  }
  if (to.getTime() < from.getTime()) {
    return { ok: false, field: 'authorizedTo', message: 'The CPT cannot end before it starts. Check the dates on the I-20.' }
  }
  return { ok: true, employerNamed, from, to }
}

/** The type a CPT page is kept as among the petitions (`CPT_RECORD` in worker-class-facts). */
export const CPT_PAGE_TYPE = 'F1_CPT'

/**
 * What the Visas tab posts: a petition's three fields, and for a CPT page
 * the fields above as well, so the screen posts exactly what the route
 * reads.
 */
export function petitionBody(form: Record<string, string | undefined>): Record<string, string> {
  const base = { personId: form.personId ?? '', type: form.type ?? '', country: form.country ?? 'US' }
  if ((form.type ?? '').toUpperCase() !== CPT_PAGE_TYPE) return base
  const out: Record<string, string> = { ...base }
  for (const f of CPT_PAGE_FIELDS) out[f.name] = form[f.name] ?? ''
  return out
}
