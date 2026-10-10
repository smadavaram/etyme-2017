/**
 * One seeded week a client approved by email, with the evidence attached.
 *
 * The founder, 2026-09-30 (CLAUDE.md, "A client may approve by email, and
 * the proof travels down the chain"). So the demo shows it: Helena Marsh's
 * oldest signed week at Northbend Athletic, through Computer Systems and
 * Techpeple, reads "Approved by email: Marcus Oyelaran, <day> — evidence
 * attached". Marcus replied to Computer Systems — the supplier Northbend
 * pays, and the only one it deals with — and Computer Systems forwarded the
 * reply down to Techpeple, whose desk attached it. It applies to both
 * contracts on the chain, so Northbend reads its own contract only, and
 * Computer Systems and Techpeple each open the same email.
 *
 * The email is addressed to Computer Systems, never to Techpeple. Northbend
 * opens this file too, and a sub-vendor's name is the prime's to keep
 * (CLAUDE.md, 2026-09-17): a client writing to a firm it has never heard of
 * would be the leak, and it would not be how the week was really approved.
 *
 * The week was already signed when the world was seeded, as "Marcus signed
 * in Etyme". That is replaced on the ledger the way the ledger allows — the
 * old CLIENT_APPROVAL superseded, never edited, and a new one naming
 * nobody, because the approver signed outside Etyme and the evidence row
 * is what says who. The week's day and hours do not move, so nothing
 * billed or paid on it changes.
 *
 * Idempotent: a week that already carries an approval by email is left.
 */
import { day } from '@/lib/seed-days'
import { prisma as db } from '@/lib/db'
import { approvedByWords, dayOf } from '@/app/api/timesheets/approval-by-email'
import type { World } from '@/lib/seed-programmes'

/**
 * The client's reply, as the file every rung opens. Addressed to `to`, which
 * the caller must make the client's own supplier on the top rung.
 */
export function approvalEmail(a: { approverName: string; approverEmail: string; to: string; period: string; hours: number }): string {
  return (
    `From: ${a.approverName} <${a.approverEmail}>\n` +
    `To: ${a.to}\n` +
    `Subject: Re: Helena Marsh, hours for ${a.period}\n\n` +
    `Approved — ${a.hours} hours for ${a.period}.\n\n${a.approverName}\nNorthbend Athletic`
  )
}

/** The domain Northbend Athletic's people write from in the seeded world. */
export const NORTHBEND_MAIL = 'northbend.example'

export async function seedWeekApproval(world: World): Promise<{ written: boolean }> {
  const client = world.firmBySlug.get('nike')
  const techpeple = world.firmBySlug.get('techpeple')
  const sender = world.seatBySlug.get('techpeple')
  // Who the client actually wrote to: the account desk of the firm it pays.
  const prime = world.seatBySlug.get('computer-systems')
  if (!client || !techpeple || !sender || !prime) return { written: false }

  // Northbend's approvers write from its own domain. Since 2026-10-05 an
  // approval by email names somebody at the client — its domain, a domain
  // it proved, or a person seated there (`approverIsKnownAtClient`) — and
  // the seeded client had no domain at all, so only its seated desks could
  // be named. A reserved name nobody can register (CLAUDE.md, the demo
  // names nobody real), so nobody real can ever sign in through it.
  if (!(await db.companyDomain.findUnique({ where: { domain: NORTHBEND_MAIL }, select: { id: true } }))) {
    await db.companyDomain.create({
      data: { companyId: client.id, domain: NORTHBEND_MAIL, verifiedAt: day(-400), verifiedVia: 'seeded world', joinPolicy: 'REQUEST' },
    })
  }

  const approver = await db.person.findUnique({
    where: { primaryEmail: `${world.prefix}nike-hiring@${world.domain}` },
    select: { name: true, primaryEmail: true },
  })
  const helena = await db.person.findFirst({ where: { name: 'Helena Marsh' }, select: { id: true } })
  if (!approver || !helena) return { written: false }

  // Her weeks are filed on Techpeple's contract to Computer Systems.
  const week = await db.timesheet.findFirst({
    where: {
      personId: helena.id, status: 'APPROVED', clientApprovedAt: { not: null },
      sellContract: { companyId: techpeple.id, OR: [{ endClientCompanyId: client.id }, { clientCompanyId: client.id }] },
    },
    orderBy: { periodStart: 'asc' },
    select: { id: true, sellContractId: true, periodStart: true, periodEnd: true, totalHours: true, clientApprovedAt: true },
  })
  if (!week) return { written: false }

  const now = new Date()
  const period = `${dayOf(week.periodStart, now)} – ${dayOf(week.periodEnd, now)}`
  const email = approvalEmail({ approverName: approver.name, approverEmail: approver.primaryEmail, to: prime.email, period, hours: Number(week.totalHours) })

  const already = await db.weekApproval.findFirst({
    where: { timesheetId: week.id },
    select: { id: true, file: { select: { id: true, bytes: true } } },
  })
  if (already) {
    // A world seeded before 2026-10-03 addressed the reply to Techpeple, which
    // Northbend could read. Readdress that one file, and touch nothing else.
    const f = already.file
    if (f && Buffer.from(f.bytes).toString('utf8').includes(`To: ${sender.email}`)) {
      await db.weekApprovalFile.update({
        where: { id: f.id },
        data: { bytes: Buffer.from(email, 'utf8'), sizeBytes: Buffer.byteLength(email) },
      })
      return { written: true }
    }
    return { written: false }
  }

  // The chain above it: the contract Computer Systems sells to Northbend.
  const above = await db.contractLink.findFirst({
    where: { buyContract: { supplierSellContractId: week.sellContractId } },
    select: { sellContractId: true },
  })
  const scope = above ? [above.sellContractId, week.sellContractId] : [week.sellContractId]

  const old = await db.workAssertion.findFirst({
    where: { timesheetId: week.id, companyId: client.id, role: 'CLIENT_APPROVAL', state: 'LIVE' },
  })
  if (!old) return { written: false }

  const on = week.clientApprovedAt!
  const words = approvedByWords({ approverName: approver.name, on, how: 'EVIDENCE', now })


  await db.$transaction(async (tx) => {
    await tx.workAssertion.update({ where: { id: old.id }, data: { state: 'SUPERSEDED' } })
    const signature = await tx.workAssertion.create({
      data: {
        timesheetId: week.id, companyId: client.id, role: 'CLIENT_APPROVAL',
        hours: old.hours, rateCents: old.rateCents, state: 'LIVE', at: old.at,
        byId: null, auto: false, note: words, supersedesId: old.id,
      },
      select: { id: true },
    })
    await tx.timesheet.update({ where: { id: week.id }, data: { clientApprovedById: null, approvedById: null } })
    await tx.weekApproval.create({
      data: {
        timesheetId: week.id, how: 'EVIDENCE', clientCompanyId: client.id,
        approverName: approver.name, approverEmail: approver.primaryEmail.toLowerCase(),
        sentById: sender.personId, sentByCompanyId: techpeple.id, sentAs: 'SUPPLIER_DESK', sentAt: on,
        evidenceKind: 'EMAIL', approvedOn: on, assertionId: signature.id,
        contracts: { create: scope.map((sellContractId, position) => ({ sellContractId, position })) },
        file: {
          create: {
            fileName: 'approval-email.txt', contentType: 'text/plain; charset=utf-8',
            sizeBytes: Buffer.byteLength(email), bytes: Buffer.from(email, 'utf8'),
          },
        },
      },
    })
  })
  return { written: true }
}
