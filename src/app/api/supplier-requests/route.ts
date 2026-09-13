import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { notify } from '@/lib/notify'
import { desksFor, deskPeople } from '@/lib/supplier-desks'
import { applyUrl, sendLink } from '@/lib/supplier-link'
import {
  mayRecommend, mayActAt, newChecklist, readiness, stepsOf, STAGE_WORD,
  type ChecklistItem, type Decision, type Stage, type RequestState,
} from '@/lib/supplier-onboarding'

/**
 * GET  /api/supplier-requests   — firms in the pipeline, where each is, and what this caller may do
 * POST /api/supplier-requests   — recommend one: { name, domain?, contactName?, contactEmail?, reason, skills[] }
 *
 * A recommendation lands on the program office's desk as a decision,
 * and the firm gets a link of its own to apply and upload against while
 * the desks work. Nothing is created for the firm until Procurement
 * says yes.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Supplier requests')
  if (notStaff) return notStaff
  const companyId = caller.company!.id
  const [rows, desks] = await Promise.all([
    prisma.supplierRequest.findMany({ where: { companyId }, orderBy: [{ state: 'asc' }, { createdAt: 'desc' }] }),
    desksFor(companyId),
  ])
  const people = await prisma.person.findMany({
    where: { id: { in: [...new Set(rows.flatMap((r) => [r.recommendedById, r.decidedById].filter((x): x is string => !!x)))] } },
    select: { id: true, name: true },
  })
  const nameOf = new Map(people.map((p) => [p.id, p.name]))
  return NextResponse.json({
    data: {
      requests: rows.map((r) => {
        const checklist = r.checklist as unknown as ChecklistItem[]
        const decisions = (r.decisions as unknown as Decision[]) ?? []
        const stage = r.stage as Stage
        const state = r.state as RequestState
        const verdict = mayActAt({ stage, permissions: caller.permissions, callerId: caller.person.id, recommendedById: r.recommendedById, decisions, desks, firmName: r.name })
        const application = (r.application ?? null) as Record<string, unknown> | null
        return {
          id: r.id, name: r.name, domain: r.domain, contactName: r.contactName, contactEmail: r.contactEmail,
          reason: r.reason, skills: r.skills, state, stage, stageWord: stage === 'DONE' ? STATE_WORD_OF(state) : STAGE_WORD[stage],
          checklist, decisions, steps: stepsOf(stage, state, decisions),
          recommendedBy: nameOf.get(r.recommendedById) ?? 'somebody',
          decidedBy: r.decidedById ? nameOf.get(r.decidedById) ?? null : null,
          decisionNote: r.decisionNote, createdAt: r.createdAt.toISOString(),
          mine: r.recommendedById === caller.person.id,
          mayAct: verdict.ok, whyNot: verdict.ok ? null : verdict.message,
          readiness: readiness(r.name, checklist),
          link: applyUrl(r.token), linkSentAt: r.linkSentAt?.toISOString() ?? null,
          applied: application?.submittedAt ?? null,
          application: application ? { legalName: application.legalName ?? null, experience: application.experience ?? null, references: application.references ?? [], bank: application.bank ?? null, skills: application.skills ?? [] } : null,
        }
      }),
      mayRecommend: mayRecommend(caller.permissions),
      mayDecide: caller.permissions.includes('vendors.manage'),
    },
  })
}

function STATE_WORD_OF(state: RequestState): string {
  return state === 'APPROVED' ? 'Approved' : state === 'DECLINED' ? 'Declined' : 'In review'
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Supplier requests')
  if (notStaff) return notStaff
  if (!mayRecommend(caller.permissions)) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Recommending a supplier is for whoever raises requirements here.' } }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim()
  const reason = String(body?.reason ?? '').trim()
  if (!name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Which firm? A name, at least.', field: 'name' } }, { status: 422 })
  if (!reason) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say why — the program office reads this first.', field: 'reason' } }, { status: 422 })
  const skills: string[] = Array.isArray(body?.skills) ? body.skills.map((x: unknown) => String(x).trim()).filter(Boolean)
    : typeof body?.skills === 'string' ? body.skills.split(/[,;]/).map((x: string) => x.trim()).filter(Boolean) : []
  const contactEmail = typeof body?.contactEmail === 'string' && body.contactEmail.includes('@') ? body.contactEmail.trim().toLowerCase() : null
  const domain = typeof body?.domain === 'string' && body.domain.trim() ? body.domain.trim().toLowerCase() : contactEmail?.split('@')[1] ?? null
  const companyId = caller.company!.id

  const open = await prisma.supplierRequest.findFirst({
    where: { companyId, name: { equals: name, mode: 'insensitive' }, state: { in: ['RECOMMENDED', 'IN_REVIEW'] } },
    select: { id: true },
  })
  if (open) return NextResponse.json({ error: { code: 'ALREADY_RECOMMENDED', message: `${name} is already in the pipeline.` } }, { status: 409 })

  const row = await prisma.supplierRequest.create({
    data: {
      companyId, name, domain, contactEmail, skills,
      contactName: typeof body?.contactName === 'string' && body.contactName.trim() ? body.contactName.trim() : null,
      reason, recommendedById: caller.person.id, checklist: newChecklist() as unknown as object, stage: 'TEAM', decisions: [],
    },
  })

  // The firm gets its link at once, so its side is on file by the time
  // Procurement's desk comes round.
  let delivery: { state: string; note: string } | null = null
  if (contactEmail) {
    delivery = await sendLink({ to: contactEmail, contactName: row.contactName, firmName: name, clientName: caller.company!.name, token: row.token })
    await prisma.supplierRequest.update({ where: { id: row.id }, data: { linkSentAt: new Date() } })
  }

  // The program office hears, in a sentence.
  const desks = await desksFor(companyId)
  for (const personId of (await deskPeople(companyId, 'TEAM', desks)).filter((p) => p !== caller.person.id)) {
    void notify({
      personId, companyId, type: 'SYSTEM', entityId: row.id,
      title: `Supplier recommended — ${name}`,
      body: `${caller.person.name} recommends ${name}${skills.length ? ` for ${skills.join(', ')}` : ''}: ${reason}`,
      data: { href: '/dashboard/suppliers' },
    })
  }

  return NextResponse.json({
    data: {
      request: { id: row.id, stage: row.stage, link: applyUrl(row.token) },
      delivery,
      says: `${name} is with the program office. It walks three desks — program office, HR, Procurement — and becomes a supplier when the last one says yes.${contactEmail ? ` ${name} has been sent a link to supply its paperwork.` : ' Add a contact email and they can be sent a link to supply their paperwork.'}`,
    },
  }, { status: 201 })
}
