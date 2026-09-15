import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { tellThread } from '@/lib/thread-notices'
import type { Participant } from '@/lib/threads'

/**
 * POST /api/people/[id]/ask   { requirementId, note? }
 *
 * The hiring manager wants somebody they starred for a role. Etyme
 * never places anybody, so the ask goes to the supplier who represents
 * them — the firm holding their consent on its bench, else whoever put
 * them forward last — on the thread for that role, and the supplier
 * submits. The consultant hears from their own firm, the way the trade
 * already works.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Asking for a person')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'requirements.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Asking for a person is for whoever raises requirements here.' } }, { status: 403 })
  }
  const companyId = caller.company!.id
  const now = new Date()
  const body = await request.json().catch(() => ({}))
  const requirementId = typeof body?.requirementId === 'string' ? body.requirementId : null
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  if (!requirementId) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Which role? Pick a published requirement.', field: 'requirementId' } }, { status: 422 })

  const [person, requirement, block, subs, listings] = await Promise.all([
    prisma.person.findUnique({ where: { id }, select: { id: true, name: true } }),
    prisma.requirement.findFirst({ where: { id: requirementId, OR: [{ companyId }, { msa: { clientId: companyId } }] }, select: { id: true, title: true, status: true } }),
    prisma.blacklist.findFirst({ where: { companyId, targetType: 'PERSON', targetId: id, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { reason: true } }),
    prisma.submission.findMany({ where: { toCompanyId: companyId, personId: id }, select: { fromCompany: { select: { id: true, name: true } }, requirementId: true }, orderBy: { submittedAt: 'desc' } }),
    prisma.benchListing.findMany({ where: { consultant: { personId: id }, state: 'GRANTED' }, select: { company: { select: { id: true, name: true } } } }),
  ])
  if (!person || (subs.length === 0 && listings.length === 0)) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That person has not been put in front of you.' } }, { status: 404 })
  }
  if (!requirement) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That requirement is not yours.' } }, { status: 404 })
  if (requirement.status !== 'OPEN') {
    return NextResponse.json({ error: { code: 'NOT_PUBLISHED', message: `${requirement.title} is not published, so nobody can be submitted to it yet.` } }, { status: 409 })
  }
  if (block) {
    return NextResponse.json({ error: { code: 'BLOCKED', message: `${person.name} is blocked here — ${block.reason.replace(/\.$/, '')}. Lift the block first.` } }, { status: 409 })
  }
  if (subs.some((s) => s.requirementId === requirementId)) {
    return NextResponse.json({ error: { code: 'ALREADY_SUBMITTED', message: `${person.name} is already submitted to ${requirement.title}. Read them in Submissions.` } }, { status: 409 })
  }

  const firms = new Map<string, { id: string; name: string }>()
  for (const l of listings) firms.set(l.company.id, l.company)
  if (firms.size === 0 && subs[0]) firms.set(subs[0].fromCompany.id, subs[0].fromCompany)

  const me = { id: companyId, name: caller.company!.name }
  const opener: Participant = { personId: caller.person.id, name: caller.person.name, companyId: me.id, joinedAt: now.toISOString() }
  const text = `${me.name} would like to see ${person.name} for ${requirement.title}. Please submit them if they are available.${note ? ` ${note}` : ''}`

  const asked: string[] = []
  for (const firm of firms.values()) {
    let thread = await prisma.conversation.findFirst({ where: { companyId: me.id, withCompanyId: firm.id, topic: 'REQUIREMENT', topicId: requirement.id }, select: { id: true } })
    if (!thread) {
      thread = await prisma.conversation.create({
        data: { companyId: me.id, withCompanyId: firm.id, topic: 'REQUIREMENT', topicId: requirement.id, title: `${requirement.title} — ${firm.name}`, participants: [opener] as unknown as object },
        select: { id: true },
      })
    }
    // Typed and tagged, so the person's page and the dashboard can find
    // the ask again; and the thread rises to the top of Conversations.
    await prisma.message.create({
      data: { conversationId: thread.id, authorId: caller.person.id, body: text, type: 'ASK', metadata: { personId: person.id, personName: person.name, requirementId: requirement.id, roleTitle: requirement.title, supplierId: firm.id, supplierName: firm.name } },
    })
    await prisma.conversation.update({ where: { id: thread.id }, data: { updatedAt: now } })
    void tellThread({ conversationId: thread.id, author: { personId: caller.person.id, name: caller.person.name, companyId: me.id, companyName: me.name }, body: text })
    asked.push(firm.name)
  }

  return NextResponse.json({
    data: {
      asked,
      says: `${asked.join(' and ')} ${asked.length === 1 ? 'has' : 'have'} been asked to put ${person.name} forward for ${requirement.title}. You will see the submission when it lands.`,
    },
  }, { status: 201 })
}
