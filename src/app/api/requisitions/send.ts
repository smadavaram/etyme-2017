import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notifyBulk, type NotifyParams } from '@/lib/notify'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import { reportError } from '@/lib/alerts'
import { placeOf } from '@/lib/job-site'
import type { Participant } from '@/lib/threads'
import { jobApart, jobsSentNotice, jobSentThreadLine, toldPerFirm, SEATS_TOLD_PER_FIRM, JOB_BATCH_MS, type JobSentFacts } from './words'

/**
 * Sending a job to suppliers: the invitations, the log, the event, the
 * thread with each firm and the notice to its people.
 *
 * One function, called by the release route
 * (`POST /api/requisitions/:id/distribute`) and by the raise
 * (`POST /api/requisitions`) when a job at a site publishes itself and
 * the hiring manager ticked who it goes to (founder, 2026-10-28, the
 * Sites drawing). Every gate is the caller's: this sends to exactly the
 * firms it is handed, each already checked.
 */

export interface VendorBand {
  companyId: string
  payMin?: number | null
  payMax?: number | null
  message?: string | null
}

export interface JobToSend {
  id: string
  title: string
  companyId: string
  company: { id: string; name: string }
  headcount: number
  location: string | null
  site?: { name: string } | null
  startDate: Date | null
}

export type SendResult = { companyId: string; name: string; status: string; reason?: string }

export async function sendJobTo(input: {
  requisition: JobToSend
  vendors: VendorBand[]
  vendorMap: Map<string, { id: string; name: string }>
  expiresAt: Date
  caller: { person: { id: string; name: string } }
  /** The log's reason. Defaults to who sent it and to whom. */
  reason?: (sentNames: string[]) => string
}): Promise<SendResult[]> {
  const { requisition, vendors, vendorMap, expiresAt, caller } = input
  const id = requisition.id

  const results: Array<{ companyId: string; name: string; status: string; reason?: string }> = []

  for (const v of vendors) {
    const company = vendorMap.get(v.companyId)!
    try {
      await prisma.requirementInvitation.create({
        data: {
          requirementId: id,
          fromCompanyId: requisition.companyId,
          toCompanyId: v.companyId,
          payMin: v.payMin ?? null,
          payMax: v.payMax ?? null,
          message: v.message ?? null,
          expiresAt,
          status: 'SENT',
        },
      })
      results.push({ companyId: v.companyId, name: company.name, status: 'sent' })
    } catch (err: any) {
      // Unique on (requirementId, toCompanyId) — re-inviting is a no-op,
      // reported per vendor rather than failing the whole distribution.
      if (err?.code === 'P2002') {
        results.push({ companyId: v.companyId, name: company.name, status: 'already_invited' })
      } else {
        results.push({ companyId: v.companyId, name: company.name, status: 'error', reason: 'Could not send' })
      }
    }
  }

  const sent = results.filter(r => r.status === 'sent')

  await prisma.automationLog.create({
    data: {
      companyId: requisition.companyId,
      action: 'REQUISITION_DISTRIBUTED',
      summary: `${requisition.title} sent to ${sent.length === 1 ? '1 supplier' : `${sent.length} suppliers`}`,
      reason: input.reason
        ? input.reason(sent.map(s => s.name))
        : `Distributed by ${caller.person.name} to ${sent.map(s => s.name).join(', ') || 'nobody'}`,
      payload: {
        requirementId: id,
        // Bands recorded per vendor for audit. This log is company-scoped,
        // so it is visible to the client only — never to a recipient.
        invitations: vendors.map(v => ({
          companyId: v.companyId,
          payMin: v.payMin ?? null,
          payMax: v.payMax ?? null,
        })),
        expiresAt: expiresAt.toISOString(),
      },
      reversible: true,
    },
  })

  // Vendor list only — never the bands. This event is readable by an
  // integration, and a rate band belongs to one recipient.
  void emit({
    type: 'invitation.sent',
    companyId: requisition.companyId,
    subjectType: 'Requirement',
    subjectId: id,
    actorPersonId: caller.person.id,
    payload: {
      title: requisition.title,
      vendorCompanyIds: vendors.map(v => v.companyId),
      sentCount: sent.length,
      expiresAt: expiresAt.toISOString(),
    },
  })

  // ── Each supplier is told, and the job opens a thread with it ────────
  //
  // The job goes to each firm's people who work a job, firm by firm:
  // one cap across every firm let the first firm's seats crowd out the
  // rest. A firm's Owner holds `*`, which is every permission, so the
  // Owner of a small supplier with no account manager hears too — the
  // simulation of 2026-10-20 found 80 sends of 206 told nobody, every
  // one an Owner-run firm.
  //
  // And the send opens the thread across the deal, the same create-or-get
  // the client's "write to the supplier" uses (`app/api/people/[id]/ask`),
  // so the supplier answers on the job rather than starting an email.
  if (sent.length > 0) {
    // The client's other live jobs of this title, so the notice says which
    // one this is: the place, the start, or the job number (`jobApart`).
    const sameTitle = await prisma.requirement.findMany({
      where: {
        companyId: requisition.companyId, title: requisition.title, id: { not: id },
        status: { in: ['OPEN', 'DRAFT'] }, archivedAt: null, mirroredFromId: null,
      },
      select: { id: true, location: true, startDate: true, site: { select: { name: true } } },
    })
    const facts: JobSentFacts = {
      clientName: requisition.company.name,
      title: requisition.title,
      headcount: requisition.headcount,
      location: placeOf(requisition),
      closesAt: expiresAt,
      apart: jobApart(
        { id, location: placeOf(requisition), startDate: requisition.startDate },
        sameTitle.map((o) => ({ id: o.id, location: placeOf(o), startDate: o.startDate }))
      ),
    }
    const opener: Participant = {
      personId: caller.person.id,
      name: caller.person.name,
      companyId: requisition.companyId,
      joinedAt: new Date().toISOString(),
    }
    const threads = new Map<string, string>()
    await Promise.all(
      sent.map(async (s) => {
        try {
          const where = { companyId: requisition.companyId, withCompanyId: s.companyId, topic: 'REQUIREMENT', topicId: id }
          let thread = await prisma.conversation.findFirst({ where, select: { id: true } })
          if (!thread) {
            thread = await prisma.conversation
              .create({
                data: { ...where, title: `${requisition.title} — ${s.name}`, participants: [opener] as unknown as object },
                select: { id: true },
              })
              .catch(async (e: any) => {
                // A second send racing this one made it first; read theirs.
                if (e?.code !== 'P2002') throw e
                return prisma.conversation.findFirstOrThrow({ where, select: { id: true } })
              })
          }
          const note = vendors.find((v) => v.companyId === s.companyId)?.message ?? null
          await prisma.message.create({
            data: { conversationId: thread.id, authorId: caller.person.id, body: jobSentThreadLine({ ...facts, note }), type: 'TEXT' },
          })
          threads.set(s.companyId, thread.id)
        } catch (err) {
          // The invitation stands without its thread; the notice still goes.
          reportError(`The thread for ${requisition.title} with ${s.name} could not be opened:`, err)
        }
      })
    )

    const seats = await prisma.context.findMany({
      where: {
        companyId: { in: sent.map((s) => s.companyId) },
        revokedAt: null,
        role: { permissions: { hasSome: ['requirements.read', '*'] } },
        ...NOT_THE_SAMPLE_SEAT,
      },
      select: { personId: true, companyId: true },
      orderBy: { grantedAt: 'asc' },
    })
    const told = toldPerFirm(seats, SEATS_TOLD_PER_FIRM)

    // A client sending several jobs in one sitting writes one notice per
    // person, not one per job: an unread notice of this client's sent jobs
    // from the last minute takes this job as another line. Its entity stays
    // the first job's; every job it carries is listed under `requirementIds`.
    const job = { requirementId: id, ...facts, closesAt: facts.closesAt.toISOString() }
    const recent = told.length
      ? await prisma.notification.findMany({
          where: {
            personId: { in: told.map((t) => t.personId) }, status: 'UNREAD', type: 'SYSTEM',
            createdAt: { gte: new Date(Date.now() - JOB_BATCH_MS) },
            data: { path: ['kind'], equals: 'JOB_SENT' },
          },
          select: { id: true, personId: true, data: true },
          orderBy: { createdAt: 'desc' },
        })
      : []
    const batchOf = new Map<string, { id: string; jobs: (typeof job)[] }>()
    for (const n of recent) {
      const d = (n.data ?? {}) as { clientCompanyId?: string; jobs?: (typeof job)[] }
      if (d.clientCompanyId !== requisition.companyId || !Array.isArray(d.jobs) || batchOf.has(n.personId)) continue
      if (d.jobs.some((j) => j.requirementId === id)) continue
      batchOf.set(n.personId, { id: n.id, jobs: d.jobs })
    }
    const folded = told.filter((t) => batchOf.has(t.personId))
    const fresh = told.filter((t) => !batchOf.has(t.personId))
    for (const t of folded) {
      const b = batchOf.get(t.personId)!
      const jobs = [...b.jobs, job]
      const said = jobsSentNotice(jobs.map((j) => ({ ...j, closesAt: new Date(j.closesAt) })))
      const before = (recent.find((n) => n.id === b.id)?.data ?? {}) as Record<string, unknown>
      await prisma.notification
        .update({
          where: { id: b.id },
          data: { title: said.title, body: said.body, data: { ...before, jobs, requirementIds: jobs.map((j) => j.requirementId) } as object },
        })
        .catch((err) => reportError(`The notice for ${requisition.title} could not join the batch it was sent with:`, err))
    }

    const said = jobsSentNotice([facts])
    const notifications: NotifyParams[] = fresh.map((r) => {
      const conversationId = r.companyId ? threads.get(r.companyId) ?? null : null
      return {
        personId: r.personId,
        companyId: r.companyId ?? undefined,
        type: 'SYSTEM',
        title: said.title,
        body: said.body,
        entityId: id,
        data: {
          kind: 'JOB_SENT',
          clientCompanyId: requisition.companyId,
          jobs: [job],
          requirementIds: [id],
          requirementId: id,
          ...(conversationId ? { conversationId, href: `/dashboard/conversations?open=${conversationId}` } : {}),
        },
      }
    })
    if (notifications.length > 0) notifyBulk(notifications)
  }

  return results
}
