/**
 * Assembling a detected push (record 135): a firing, the saved segment it is
 * for, the content that fits it, and the words, drafted by rules first. A
 * model may write the words instead, through the gateway by tier, and its
 * draft is used only if it passes the same checks; otherwise the rules'
 * words stand. Assembly sends nothing and writes no letter: `placePush`
 * puts the push in an approved pack or leaves it waiting as a card.
 */
import { prisma } from '@/lib/db'
import { callModel } from '@/lib/model-gateway/call'
import { segmentsOf } from './segment'
import {
  aimsFor, draftByRules, draftRefusal, matchSegment, modelDraftOk, pickContent, type Content, type ContentPool, type Draft, type SavedSegment,
} from './match-rules'
import { QUIET_DAYS, type Detection } from './tripwire-rules'
import { placePush } from './pack'

export const PUSH_SKILL = 'outreach.push'

/** The firm's own courses (with how many people finished each) and its teams, as content to match. */
export async function contentPool(companyId: string): Promise<ContentPool> {
  const courses = await prisma.course.findMany({
    where: { companyId }, select: { id: true, title: true, description: true, trackKey: true, enrollments: { where: { status: 'COMPLETED' }, select: { personId: true } } },
  })
  const pods = await prisma.pod.findMany({ where: { companyId, archivedAt: null }, include: { roles: { include: { _count: { select: { members: true } } } } } })
  return {
    courses: courses.map((c) => ({ id: c.id, title: c.title, description: c.description, trackKey: c.trackKey, completions: new Set(c.enrollments.map((e) => e.personId)).size })),
    pods: pods.filter((p) => p.roles.length > 0).map((p) => ({
      id: p.id, name: p.name, description: p.description, skills: [...new Set(p.roles.flatMap((r) => r.skills.map((s) => s.toLowerCase())))],
      openSeats: p.roles.reduce((a, r) => a + Math.max(0, r.headcount - r._count.members), 0),
    })),
  }
}

export type ModelDrafter = (i: { firm: string; reason: string; content: Content; facts: string[] }) => Promise<Draft | null>

/** The gateway's drafter: a model by tier, never a person's data, or null so the rules write it. Needs the skill registered; until it is, it answers null. */
export function gatewayDrafter(companyId: string, personId: string): ModelDrafter {
  return async (i) => {
    try {
      const got = await callModel({
        companyId, personId, skillKey: PUSH_SKILL, purpose: 'Draft a short plain letter for a detected push, from the firm’s own course or team facts.',
        system: 'Write a short plain business letter in American English. Use only the facts given. No prices, no web addresses, no names of people. Answer as JSON: {"subject": "...", "body": "..."}.',
        prompt: `Firm: ${i.firm}\nWhy now: ${i.reason}\nOffering (${i.content.kind}): ${i.content.title}\nFacts: ${i.facts.join('; ')}`,
        vocab: { keep: [i.firm, i.content.title, ...i.facts] },
        record: { recordType: 'TWIN_LEDGER', recordId: companyId }, maxTokens: 500,
      })
      if (!got.ok) return null
      const parsed = JSON.parse(got.text.slice(got.text.indexOf('{'), got.text.lastIndexOf('}') + 1)) as { subject?: unknown; body?: unknown }
      return typeof parsed.subject === 'string' && typeof parsed.body === 'string' ? { subject: parsed.subject.trim(), body: parsed.body.trim() } : null
    } catch { return null }
  }
}

export interface Assembled { pushId: string; segmentId: string; contentKind: string; drafter: string; where: 'PACK' | 'CARD' | 'NOBODY'; says: string }

/** Assemble every push a firing makes, and place each. Safe to run again: a push is unique to its firing and content. */
export async function assemblePushes(
  firing: { id: string; companyId: string; reason: string }, d: Detection, now: Date,
  deps: { draft?: ModelDrafter | null; segments?: SavedSegment[]; pool?: ContentPool } = {},
): Promise<{ pushes: Assembled[]; notes: string[] }> {
  const firm = await prisma.company.findUniqueOrThrow({ where: { id: firing.companyId }, select: { name: true } })
  const segments = deps.segments ?? (await segmentsOf(firing.companyId)).map((s) => ({ id: s.id, name: s.name, def: s.def }))
  const pool = deps.pool ?? await contentPool(firing.companyId)
  const pushes: Assembled[] = []
  const notes: string[] = []
  for (const aim of aimsFor(d)) {
    const segment = matchSegment(aim.role, d.skills, segments)
    if (!segment) { notes.push(`No saved segment of ${aim.role.toLowerCase()}s fits, so nothing is pushed. Save one under Companies, Outreach.`); continue }
    for (const kind of aim.kinds) {
      const got = pickContent(kind, d.skills, pool, d.page?.pageRef)
      if (!got.ok) { notes.push(got.says); continue }
      const content = got.content
      const proofCount = kind === 'OUTCOME_PROOF' ? pool.courses.find((c) => c.id === content.ref)?.completions : undefined
      let drafter = 'RULES'
      let words = draftByRules(firm.name, d, content, proofCount)
      if (deps.draft) {
        const m = await deps.draft({ firm: firm.name, reason: firing.reason, content, facts: content.facts })
        if (m && modelDraftOk(m, content.facts, [firm.name, ...d.skills])) { words = m; drafter = 'MODEL' }
      }
      const refusal = draftRefusal(words)
      if (refusal) { notes.push(`The drafted letter was not fit to send: ${refusal}`); continue }
      // Tell once: the same content to the same segment, already drafted lately for another firing, is not drafted again.
      const already = await prisma.outreachPush.findFirst({
        where: { companyId: firing.companyId, segmentId: segment.id, contentKind: kind, contentRef: content.ref, firingId: { not: firing.id }, state: { in: ['DRAFTED', 'WAITING', 'QUEUED'] }, createdAt: { gte: new Date(now.getTime() - QUIET_DAYS * 86_400_000) } },
        select: { id: true },
      })
      if (already) { notes.push('The same letter is already drafted for this segment, so it is not drafted twice.'); break }
      const row = await prisma.outreachPush.upsert({
        where: { firingId_contentKind_contentRef: { firingId: firing.id, contentKind: kind, contentRef: content.ref } },
        create: { companyId: firing.companyId, firingId: firing.id, segmentId: segment.id, contentKind: kind, contentRef: content.ref, subject: words.subject, body: words.body, drafter },
        update: {},
      })
      const placed = await placePush(row.id, now)
      pushes.push({ pushId: row.id, segmentId: segment.id, contentKind: kind, drafter: row.drafter, where: placed.where, says: placed.says })
      break // one kind of content per audience for one firing
    }
  }
  return { pushes, notes }
}
