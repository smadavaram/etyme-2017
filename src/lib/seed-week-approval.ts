/**
 * One seeded week a client approved by email, with the evidence attached.
 *
 * The founder, 2026-09-30 (CLAUDE.md, "A client may approve by email, and
 * the proof travels down the chain"). So the demo shows it: Helena Marsh's
 * oldest signed week at Northbend Athletic, through Computer Systems and
 * CloudEPA, reads "Approved by email: Marcus Oyelaran, <day> — evidence
 * attached". CloudEPA's desk attached Marcus's reply; it applies to both
 * contracts on the chain, so Northbend reads its own contract only, and
 * Computer Systems and CloudEPA each open the same email.
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
import { prisma as db } from '@/lib/db'
import { approvedByWords, dayOf } from '@/app/api/timesheets/approval-by-email'
import type { World } from '@/lib/seed-programmes'

export async function seedWeekApproval(world: World): Promise<{ written: boolean }> {
  const client = world.firmBySlug.get('nike')
  const cloudepa = world.firmBySlug.get('cloudepa')
  const sender = world.seatBySlug.get('cloudepa')
  if (!client || !cloudepa || !sender) return { written: false }

  const approver = await db.person.findUnique({
    where: { primaryEmail: `${world.prefix}nike-hiring@${world.domain}` },
    select: { name: true, primaryEmail: true },
  })
  const helena = await db.person.findFirst({ where: { name: 'Helena Marsh' }, select: { id: true } })
  if (!approver || !helena) return { written: false }

  // Her weeks are filed on CloudEPA's contract to Computer Systems.
  const week = await db.timesheet.findFirst({
    where: {
      personId: helena.id, status: 'APPROVED', clientApprovedAt: { not: null },
      sellContract: { companyId: cloudepa.id, OR: [{ endClientCompanyId: client.id }, { clientCompanyId: client.id }] },
    },
    orderBy: { periodStart: 'asc' },
    select: { id: true, sellContractId: true, periodStart: true, periodEnd: true, totalHours: true, clientApprovedAt: true },
  })
  if (!week) return { written: false }
  if (await db.weekApproval.findFirst({ where: { timesheetId: week.id }, select: { id: true } })) return { written: false }

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
  const now = new Date()
  const words = approvedByWords({ approverName: approver.name, on, how: 'EVIDENCE', now })
  const period = `${dayOf(week.periodStart, now)} – ${dayOf(week.periodEnd, now)}`
  const email =
    `From: ${approver.name} <${approver.primaryEmail}>\n` +
    `To: ${sender.email}\n` +
    `Subject: Re: Helena Marsh, hours for ${period}\n\n` +
    `Approved — ${Number(week.totalHours)} hours for ${period}.\n\n${approver.name}\nNorthbend Athletic`

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
        sentById: sender.personId, sentByCompanyId: cloudepa.id, sentAs: 'SUPPLIER_DESK', sentAt: on,
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
