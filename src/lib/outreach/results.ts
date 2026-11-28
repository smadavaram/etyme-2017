/**
 * What advanced outreach cost and what it brought, for the Owner (record 135).
 *
 * Two figures: the cost per activated tenant and the cost per qualified,
 * consented resume. Each is worked out only from what the ledger holds. A
 * figure whose inputs are missing is null and says what is missing: a plausible
 * wrong number is worse than a blank, because nobody audits good news.
 *
 *   Qualified, consented resume: a person who arrived through the tracked link
 *   of one of the firm's pack letters while signed in as herself, who holds a
 *   standing yes to updates now, and who has a resume on file.
 *
 *   Activated tenant: a company that began using Etyme because of a letter.
 *   Letters carry no sign-up link, so no sign-up is tied to a letter, and this
 *   figure is always null today. The number of companies written to that later
 *   claimed an account is shown beside it, never as a cause.
 */
import { prisma } from '@/lib/db'
import { saidYesToUpdates } from '@/lib/updates-consent'
import { PUSH_SKILL } from './push'

export interface Figure { value: number | null; missing: string | null }
export interface Results {
  /** What the model cost, in millionths of a dollar, or null where it cannot be told. */
  modelCostMicros: number | null
  qualifiedResumes: number
  /** Companies the firm wrote to that claimed an account afterwards. A count, never a cause. */
  claimedAfterLetter: number
  perQualifiedResume: Figure
  perActivatedTenant: Figure
}

export interface ResultsInput {
  runs: number
  pricedRuns: number
  costMicros: number
  qualifiedResumes: number
  claimedAfterLetter: number
}

/** Pure: the two figures, or what is missing for each. */
export function readResults(i: ResultsInput): Results {
  const unpriced = i.runs - i.pricedRuns
  const modelCostMicros = i.runs > 0 && unpriced === 0 ? i.costMicros : null
  let perQualified: Figure
  if (i.qualifiedResumes === 0) perQualified = { value: null, missing: 'No qualified, consented resume has come in yet: nobody has opened a pack letter’s link while signed in, said yes to updates, and held a resume.' }
  else if (i.runs === 0) perQualified = { value: null, missing: 'Nothing in outreach is priced yet. Letters are drafted by rules, which cost no model, and sending and staff time are not metered, so a figure would read as nothing and mean nothing.' }
  else if (unpriced > 0) perQualified = { value: null, missing: `${unpriced} of ${i.runs} model runs have no price on them, so the cost is not known.` }
  else perQualified = { value: Math.round(i.costMicros / i.qualifiedResumes), missing: null }
  return {
    modelCostMicros, qualifiedResumes: i.qualifiedResumes, claimedAfterLetter: i.claimedAfterLetter, perQualifiedResume: perQualified,
    perActivatedTenant: { value: null, missing: 'No sign-up is tied to a letter. Letters carry no sign-up link, so Etyme cannot say which company began because of one. The count beside it is not a cause.' },
  }
}

/** The firm's results, read from the ledger and the model-usage meter. */
export async function resultsOf(companyId: string): Promise<Results> {
  const runs = await prisma.agentRun.findMany({ where: { companyId, OR: [{ agentKey: 'outreach-batch' }, { skillKey: PUSH_SKILL }], tier: { in: ['LOW', 'HIGH'] } }, select: { costMicros: true } })
  const visits = await prisma.outreachVisit.findMany({ where: { companyId, personId: { not: null } }, select: { personId: true }, distinct: ['personId'] })
  const ids = visits.map((v) => v.personId!)
  const people = ids.length ? await prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, updatesYesAt: true, updatesRevokedAt: true, resumes: { where: { deletedAt: null }, select: { id: true }, take: 1 } } }) : []
  const qualified = people.filter((p) => saidYesToUpdates(p) && p.resumes.length > 0).length
  const written = await prisma.outreachLetter.findMany({ where: { companyId, state: { in: ['SENT', 'STOPPED'] }, attempt: { gte: 1 } }, select: { atCompanyId: true, createdAt: true } })
  const first = new Map<string, Date>()
  for (const l of written) if (!first.has(l.atCompanyId) || first.get(l.atCompanyId)! > l.createdAt) first.set(l.atCompanyId, l.createdAt)
  const claimed = first.size ? await prisma.company.findMany({ where: { id: { in: [...first.keys()] }, claimedAt: { not: null } }, select: { id: true, claimedAt: true } }) : []
  const claimedAfter = claimed.filter((c) => c.claimedAt! > first.get(c.id)!).length
  return readResults({
    runs: runs.length, pricedRuns: runs.filter((r) => r.costMicros !== null).length, costMicros: runs.reduce((a, r) => a + (r.costMicros ?? 0), 0),
    qualifiedResumes: qualified, claimedAfterLetter: claimedAfter,
  })
}
