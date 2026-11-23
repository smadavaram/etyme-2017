/**
 * The match ranker (record 112, chain 2, "Fill it": "Match ranker: bench
 * and candidates ranked against a requirement"). Key `match-ranker`.
 *
 * For each open job the firm raised, and each open job a client sent it,
 * it runs the existing matching code (`runMatchEngine`): rules first, and
 * the model only where the engine's own gate says the model is on and
 * keyed for every firm in the prompt. Otherwise rules only, and it says
 * which ran. Every row it writes is the engine's own: score, factors,
 * basis, confidence and unknowns. A bare score is never kept.
 *
 * The ranked list is what the job's page already shows
 * (`/api/requirements/:id/matches`). The agent adds one card on the
 * decision queue, "N people match <job>", owed to the recruiter, else the
 * account manager, else the Owner, and one ledger row.
 *
 * It submits nobody, asks nobody for consent and sends nothing. Consent
 * before a submission is a person's act: the card points at the job's
 * page, where each row carries the consent ask that already exists.
 *
 * Both Drafts only and On do the same: ranking and a card are preparing,
 * which Drafts only allows. Off, the runner never calls it. One card per
 * job and per count: a card still open is not opened again, and a card
 * already decided is not opened again for the same count.
 */

import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { LedgerRefusal } from '@/lib/record-ledger'
import { openDecision, firmToday } from '@/lib/decision-items'
import { runMatchEngine, type MatchResult } from '@/lib/match-engine'
import { poolFor } from '@/lib/match-pool'
import { ownerForRoles } from '@/lib/money/agent-owners'
import { AGENT_HELD_AS, registerAgent, type AgentContext, type AgentDef } from './runner'

export const MATCH_RANKER = 'match-ranker'
export const MATCH_RANKER_RULE = 'match-ranker-v1'
export const MATCH_RECORD = 'Requirement'
/** Who owes the card: the recruiter, else the account manager, else the Owner. */
export const MATCH_ROLES = ['Recruiter', 'Account Manager'] as const
/** The most jobs one run ranks for one firm, oldest raised first, so the rest wait for tomorrow. */
export const MAX_JOBS_A_RUN = 25
/** How many people the card names. */
export const NAMED_ON_CARD = 5

/** The card's question, in the trade's words. Pure. */
export function cardQuestion(n: number, title: string): string {
  return `${n} ${n === 1 ? 'person matches' : 'people match'} ${title}`
}

export interface CardRow {
  /** Null where the firm has not been given the person's name (a suggestion). */
  name: string | null
  score: number
  confidence: string
  unknowns: string | null
  /** The factor labels that carried most weight, heaviest first. */
  topFactors: string[]
}

/** The labels of the factors that contributed most to a match (the engine's own weight), at most three. Pure. */
export function topFactors(m: Pick<MatchResult, 'factors'>): string[] {
  return [...m.factors].sort((a, b) => b.weight - a.weight).slice(0, 3).map((f) => f.label)
}

/** The proof a person reads on the card: which scorer ran, the ranked names with their reasons, what is unknown, and what to do next. Pure. */
export function cardProof(i: { requirementId: string; title: string; scoredBy: 'MODEL' | 'RULES'; basis: string; total: number; rows: CardRow[] }): string {
  const ran = i.scoredBy === 'MODEL' ? 'Scored by the model, masked, after the rules.' : 'Scored by rules only. The model did not run.'
  const lines = i.rows.slice(0, NAMED_ON_CARD).map((r, k) => {
    const who = r.name ?? 'A person the firm may ask to add'
    const why = r.topFactors.length ? ` Strongest: ${r.topFactors.join(', ')}.` : ''
    const gap = r.unknowns ? ` Not known: ${r.unknowns}` : ''
    return `${k + 1}. ${who}: ${r.score} of 100, ${r.confidence.toLowerCase()} confidence.${why}${gap}`
  })
  const more = i.total > lines.length ? [`${i.total - lines.length} more are on the job’s page.`] : []
  return [
    ran,
    i.basis,
    ...lines,
    ...more,
    `Nobody has been submitted. Consent comes first, and each person has the consent ask on the job’s page: /dashboard/requirements/${i.requirementId}. A person puts them forward.`,
  ].join('\n')
}

/** Whether a new card is due: none for this count yet, and none still open. Pure. */
export function cardDue(latest: { state: string; question: string } | null, question: string): boolean {
  if (!latest) return true
  if (latest.state === 'OPEN') return false
  return latest.question !== question
}

/** The open jobs this firm may rank: the ones it raised and the ones a client sent it, with skills to match on. */
async function jobsToRank(companyId: string) {
  const select = { id: true, title: true, companyId: true, payerCompanyId: true, endClientCompanyId: true, startDate: true, skills: true, createdAt: true, company: { select: { kind: true } } } as const
  const base = { status: 'OPEN', archivedAt: null, skills: { isEmpty: false } } as const
  const [own, sent] = await Promise.all([
    prisma.requirement.findMany({ where: { ...base, companyId }, select, orderBy: { createdAt: 'asc' }, take: MAX_JOBS_A_RUN }),
    prisma.requirement.findMany({ where: { ...base, invitations: { some: { toCompanyId: companyId, status: { in: ['SENT', 'ACCEPTED'] } } } }, select, orderBy: { createdAt: 'asc' }, take: MAX_JOBS_A_RUN }),
  ])
  const seen = new Set<string>()
  return [...own, ...sent].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).slice(0, MAX_JOBS_A_RUN)
}

export async function matchRankerStep(ctx: AgentContext): Promise<void> {
  const { companyId, now } = ctx
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: ctx.agentKey } } })
  if (!sw) return
  const owner = await ownerForRoles(companyId, MATCH_ROLES, now)
  if (!owner) return
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  const entityId = entities.length === 1 ? entities[0].id : null
  const today = await firmToday(companyId, now)

  for (const job of await jobsToRank(companyId)) {
    if (!(await ctx.mayAct())) return // before the engine runs, so a capped agent spends nothing
    // One job failing must not stop the others; the failure is reported, never silent.
    let ran: Awaited<ReturnType<typeof runMatchEngine>>
    try {
      ran = await runMatchEngine(job.id, { limit: 20, viewerCompanyId: companyId, personId: sw.changedById })
    } catch (e) {
      reportError(`Match ranker could not rank "${job.title}":`, e)
      continue
    }
    if (ran.matches.length === 0) continue
    const scoredBy = ran.scoredBy ?? 'RULES'

    const question = cardQuestion(ran.matches.length, job.title)
    const latest = await prisma.decisionItem.findFirst({
      where: { companyId, proofLinks: { array_contains: [{ recordType: MATCH_RECORD, recordId: job.id }] } },
      orderBy: { createdAt: 'desc' }, select: { state: true, question: true },
    })
    if (!cardDue(latest, question)) continue

    // Names only where the firm may read them: a suggestion is never named.
    const suggest = companyId === job.companyId && job.payerCompanyId === null && job.company.kind === 'CLIENT'
    const pool = await poolFor(job, companyId, { suggest })
    const entryOf = new Map(pool.entries.map((e) => [e.personId, e]))
    const rows: CardRow[] = ran.matches.map((m) => ({
      name: entryOf.get(m.personId) && entryOf.get(m.personId)!.reach !== 'SUGGESTION' ? entryOf.get(m.personId)!.name : null,
      score: m.score, confidence: m.confidence, unknowns: m.unknowns, topFactors: topFactors(m),
    }))

    try {
      await openDecision({
        companyId, personId: sw.changedById, heldAs: AGENT_HELD_AS, actingEntityId: entityId,
        question, ownerPersonId: owner, openedOn: today,
        proof: cardProof({ requirementId: job.id, title: job.title, scoredBy, basis: ran.basis, total: ran.matches.length, rows }),
        proofLinks: [{ recordType: MATCH_RECORD, recordId: job.id }],
      }, now)
    } catch (e) {
      if (e instanceof LedgerRefusal) continue
      throw e
    }
    await ctx.act({
      recordType: MATCH_RECORD, recordId: job.id, action: 'MATCHES_RANKED',
      summary: `Ranked ${ran.matches.length} ${ran.matches.length === 1 ? 'person' : 'people'} for ${job.title}, ${scoredBy === 'MODEL' ? 'scored by the model after the rules' : 'by rules only'}. Nobody was submitted: that is a person’s, after consent.`,
    })
  }
}

export const matchRankerAgent: AgentDef = { ruleVersion: MATCH_RANKER_RULE, step: matchRankerStep }

/** Put the step in the runner's registry. Called by the cron route that runs agents. */
export function registerMatchRanker() { registerAgent(MATCH_RANKER, matchRankerAgent) }
