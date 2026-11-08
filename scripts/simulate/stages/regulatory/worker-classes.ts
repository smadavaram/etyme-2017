/**
 * The start of every award, walked by the person's class of worker (the
 * founder, 2026-11-08: "Include all types of workers: students,
 * international students, visa workers, employment authorization,
 * permanent residents and citizens"). Owned by regulatory.
 *
 * Called by paperwork-and-start for each placement just before the start
 * is pressed. It reads what the start will read (the class rule,
 * lib/document-stages/worker-class, over the copied world through the
 * read-only connection), and where the rule refuses or warns:
 *
 *   - presses the start as the firm's own starter and expects the
 *     refusal in the rule's words (the negative case), counted by class;
 *   - learns where the fix is the firm's to make, through the real
 *     routes as the real seats: the employer records the CPT page the
 *     school endorsed for it, HR records the current card or I-94, the
 *     employer files its own H-1B transfer petition (portability);
 *   - and never learns for an international student with no CPT or OPT,
 *     who was interviewed and is never started for US work.
 *
 * The count goes to `classTally` (stage-tally), which the report reads as
 * "class × started / refused (why)".
 */
import type { Actor, Res } from '../../actors'
import type { Ctx } from '../../stage'
import { classTally, expectAt } from './stage-tally'
import { classOfWorkAuth, workerClassStart, type WorkerClassDecision } from '@/lib/document-stages/worker-class'
import { workerClassFactsFor } from '@/lib/document-stages/worker-class-facts'

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plusDays = (n: number) => new Date(Date.now() + n * DAY)

/** The report's key for a class: supply's names, OTHER where none applies. Pure. */
export function classKey(workAuth: string | null | undefined, workCountry: string): string {
  if (workCountry.toUpperCase() !== 'US') return 'OTHER'
  return classOfWorkAuth(workAuth) ?? 'OTHER'
}

/** The phrase the start's refusal carries, per class rule. Pure. */
export function refusalPhrase(d: WorkerClassDecision): RegExp {
  switch (d.rule) {
    case 'F1_NO_PERMIT': return /may not start US work/
    case 'CPT_NONE': case 'CPT_OTHER_EMPLOYER': case 'CPT_OUTSIDE_DATES': return /CPT/
    case 'PERMIT_LAPSED': return /ran out.*so the work cannot start/
    case 'PERMIT_NOT_BEGUN': return /cannot start before then/
    case 'TN_LAPSED': return /TN admission ran out/
    case 'H1B_OTHER_PETITIONER': return /H-1B was filed by/
    default: return /./
  }
}

/** People in the world per class, counted once per run from the profiles. */
let counted = false
export async function countPeople(ctx: Ctx): Promise<void> {
  if (counted) return
  counted = true
  const rows = await ctx.read.consultantProfile.groupBy({ by: ['workAuth', 'country'], _count: { _all: true } }).catch(() => [])
  const per = new Map<string, number>()
  for (const r of rows as { workAuth: string | null; country: string | null; _count: { _all: number } }[]) {
    const key = classKey(r.workAuth, r.country ?? 'US')
    per.set(key, (per.get(key) ?? 0) + r._count._all)
  }
  for (const [k, n] of per) classTally.people(k, n)
}

export interface ClassWalk {
  key: string
  /** True where the start must not be pressed again: the class may not start US work. */
  stop: boolean
  /** The refusal sentence the route gave, where one came. */
  sentence: string | null
  /** The class rule that spoke, where one did. */
  rule: string | null
  /** What the firm did to clear it, for the walk's list. */
  learned: string | null
}

interface Placement {
  id: string
  personId: string
  personName: string
  supplier: { id: string; slug: string; name: string }
}

/** The owner seat at the firm named, found by its name in the copied world. */
async function ownerOf(ctx: Ctx, name: string | null, fallback: string): Promise<Actor | null> {
  if (name) {
    const firm = await ctx.read.company.findFirst({ where: { name }, select: { slug: true } }).catch(() => null)
    const seat = firm ? ctx.cast.at(firm.slug, 'owner') : null
    if (seat) return seat
  }
  return ctx.cast.at(fallback, 'owner')
}

/**
 * The class's start, negative then positive. Returns what happened; the
 * caller presses the start for every class but the one that may not.
 */
export async function walkClass(
  ctx: Ctx,
  p: Placement,
  seats: { starter: Actor; hr: Actor },
  where: { us: boolean; country: string },
): Promise<ClassWalk> {
  await countPeople(ctx)
  const facts = (await workerClassFactsFor([p.personId], ctx.read as never).catch(() => new Map())).get(p.personId)
  const profile = await ctx.read.consultantProfile.findUnique({ where: { personId: p.personId }, select: { workAuth: true } }).catch(() => null)
  const key = classKey(profile?.workAuth ?? null, where.country)
  classTally.awarded(key)
  const out: ClassWalk = { key, stop: false, sentence: null, rule: null, learned: null }
  if (!facts || !where.us) return out

  const decision = workerClassStart({ ...facts, workCountry: { country: where.country, offshore: !where.us }, on: new Date() })
  if (decision.verdict !== 'BLOCK' && decision.verdict !== 'WARN') return out
  out.rule = decision.rule

  // The negative case: the start pressed, refused in the rule's words.
  const activate = (a: Actor) => a.post(`/api/contracts/${p.id}/activate`, { action: 'activate' })
  const res: Res = await expectAt(ctx, 'hiring', seats.starter, activate, refusalPhrase(decision), { rule: `${key}: ${decision.rule}` })
  out.sentence = res.sentence ?? null
  if (res.ok) {
    classTally.notHeldFor(key, `${decision.rule} did not refuse ${p.personName}'s start (answered ${res.status})`)
    return out
  }

  // The positive case: the firm makes the fix that is its to make.
  const employer = facts.employerName ?? p.supplier.name
  switch (decision.rule) {
    case 'F1_NO_PERMIT':
      out.stop = true
      return out
    case 'CPT_NONE':
    case 'CPT_OTHER_EMPLOYER':
    case 'CPT_OUTSIDE_DATES': {
      const owner = await ownerOf(ctx, facts.employerName, p.supplier.slug)
      const made = owner
        ? await owner.post('/api/compliance/petitions', {
            personId: p.personId, type: 'F1_CPT', country: 'US', employerNamed: employer,
            authorizedFrom: iso(plusDays(-1)), authorizedTo: iso(plusDays(180)),
          })
        : null
      if (made?.ok) out.learned = `the school endorsed CPT for ${employer}, and ${employer} recorded the page`
      break
    }
    case 'PERMIT_LAPSED':
    case 'PERMIT_NOT_BEGUN': {
      const made = await seats.hr.post('/api/compliance/verifications', {
        contractId: p.id, about: 'PERSON', type: 'WORK_PERMIT', issuer: 'U.S. Citizenship and Immigration Services',
        reference: `IOE${Math.abs(p.personId.length * 7919) % 1_000_000_000}`, issuedOn: iso(plusDays(-2)), validFrom: iso(plusDays(-2)), expiresAt: iso(plusDays(400)),
      })
      if (made.ok) out.learned = 'a current card was shown and recorded'
      break
    }
    case 'TN_LAPSED': {
      const made = await seats.hr.post('/api/compliance/verifications', {
        contractId: p.id, about: 'PERSON', type: 'I94', issuer: 'U.S. Customs and Border Protection',
        reference: `I94-${p.personId.slice(-8)}`, issuedOn: iso(plusDays(-2)), expiresAt: iso(plusDays(365)),
      })
      if (made.ok) out.learned = 'a new I-94 in TN status was shown and recorded'
      break
    }
    case 'H1B_OTHER_PETITIONER': {
      const owner = await ownerOf(ctx, facts.employerName, p.supplier.slug)
      const made = owner ? await owner.post('/api/compliance/petitions', { personId: p.personId, type: 'H1B', country: 'US', notes: 'Transfer petition filed; work may begin on filing.' }) : null
      if (made?.ok) out.learned = `${employer} filed its own H-1B petition, and the filing receipt is on the record`
      break
    }
    default:
      break
  }
  if (!out.learned) classTally.notHeldFor(key, `${p.personName}: the firm could not make the fix for ${decision.rule}`)
  return out
}
