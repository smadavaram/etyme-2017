import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { RECORDED_AS_A_CHECK, standsOnACheck } from '@/lib/document-stages/paper-record'
import { RECORDABLE_ABOUT_A_FIRM } from '@/lib/attestation'
import { examinationOf, recordSupplierPaper } from './examination'

/**
 * The record behind every paper already accepted through a request.
 *
 * The founder's tester, 2026-11-03: papers accepted on Paperwork before
 * the one-truth fix read "on file" there and "needed" on the placement,
 * because the acceptance wrote nothing the start reads. This re-reads
 * every accepted item whose standing is a recorded check and has none
 * behind it, and writes the record through the same writer the Accept
 * now uses (`examinationOf`, `recordSupplierPaper`), in the name of the
 * person who accepted it, with the dates they recorded on the paper.
 *
 * What cannot be written is not invented: a background check accepted
 * with no screening company named stays without a verdict, and the
 * report says so by kind, with the sentence the Accept would give today.
 * An NDA or any paper that stands on the paper itself needs nothing: the
 * start reads the accepted item (lib/document-stages/paper-record).
 *
 * Safe to run twice: an item that got its record points at it, and the
 * second run passes it by.
 */
export interface BackfillReport {
  write: boolean
  /** Accepted items with no record behind them, by kind. */
  found: Record<string, number>
  /** Records written, by kind. */
  written: Record<string, number>
  /** Not written, by kind, with how many and the first reason. */
  heldBack: Record<string, { count: number; says: string }>
  /** Accepted papers that stand on the paper itself, which the start already reads. */
  readAsAccepted: number
  says: string
}

const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1 }

export async function backfillAcceptedPapers(opts: { write: boolean; now?: Date; limit?: number }): Promise<BackfillReport> {
  const now = opts.now ?? new Date()
  const items = await prisma.packetItem.findMany({
    where: {
      state: 'ACCEPTED',
      verificationId: null,
      key: { in: [...RECORDED_AS_A_CHECK] },
      packet: { cancelledAt: null },
    },
    select: {
      id: true, key: true, label: true, validUntil: true, reviewedById: true,
      packet: { select: { id: true, companyId: true, subjectPersonId: true, subjectCompanyId: true, company: { select: { name: true } } } },
    },
    orderBy: { id: 'asc' },
    take: opts.limit ?? 5000,
  })
  const readAsAccepted = await prisma.packetItem.count({
    where: { state: 'ACCEPTED', key: { notIn: [...RECORDED_AS_A_CHECK] }, packet: { cancelledAt: null, subjectPersonId: { not: null } } },
  })

  const found: Record<string, number> = {}
  const written: Record<string, number> = {}
  const heldBack: Record<string, { count: number; says: string }> = {}
  const hold = (k: string, says: string) => {
    heldBack[k] = heldBack[k] ? { ...heldBack[k], count: heldBack[k].count + 1 } : { count: 1, says }
  }

  for (const item of items) {
    if (!standsOnACheck(item.key)) continue
    bump(found, item.key)
    if (!opts.write) continue

    const reviewerId = item.reviewedById
    const [reviewer, seat, paper] = await Promise.all([
      reviewerId ? prisma.person.findUnique({ where: { id: reviewerId }, select: { id: true, name: true } }) : null,
      reviewerId
        ? prisma.context.findFirst({
            where: { personId: reviewerId, companyId: item.packet.companyId, revokedAt: null },
            select: { role: { select: { permissions: true } } },
          })
        : null,
      prisma.docInstance.findFirst({
        where: { subjectType: 'PACKET_ITEM', subjectId: item.id },
        select: { validFrom: true, expiresAt: true, edition: true },
      }),
    ])
    if (!reviewer) {
      hold(item.key, 'Nobody is named as having accepted it, so nothing is written in anybody’s name.')
      continue
    }
    const permissions = (seat?.role?.permissions as string[] | undefined) ?? []
    const buyer = {
      companyId: item.packet.companyId,
      companyName: item.packet.company.name,
      personId: reviewer.id,
      personName: reviewer.name,
      holds: (p: string) => hasPermission(permissions, p as never),
      actor: { actorPersonId: reviewer.id, actorCompanyId: item.packet.companyId },
    }
    // What the person recorded on the paper when they accepted it, and nothing more.
    const body: Record<string, unknown> = {
      ...(paper?.validFrom ? { validFrom: paper.validFrom.toISOString().slice(0, 10) } : {}),
      ...(paper?.expiresAt ? { expiresAt: paper.expiresAt.toISOString().slice(0, 10) } : {}),
      ...(paper?.edition ? { edition: paper.edition, formEdition: paper.edition } : {}),
    }

    let result: Awaited<ReturnType<typeof examinationOf>> = null
    if (item.packet.subjectCompanyId) {
      if (!(RECORDABLE_ABOUT_A_FIRM as readonly string[]).includes(item.key)) continue
      const supplier = await prisma.company.findUnique({ where: { id: item.packet.subjectCompanyId }, select: { id: true, name: true } })
      if (!supplier) continue
      result = await recordSupplierPaper({
        buyer, supplier, key: item.key, issuer: null, reference: null,
        validFrom: paper?.validFrom ?? null, expiresAt: paper?.expiresAt ?? item.validUntil, now,
      })
    } else if (item.packet.subjectPersonId) {
      result = await examinationOf({
        packet: { id: item.packet.id, subjectPersonId: item.packet.subjectPersonId, subjectCompanyId: null },
        item: { id: item.id, key: item.key, label: item.label },
        body, validUntil: item.validUntil, now, caller: buyer,
      })
    }

    if (result?.verificationId) {
      await prisma.packetItem.update({ where: { id: item.id }, data: { verificationId: result.verificationId } })
      bump(written, item.key)
    } else {
      hold(item.key, result?.refused?.message ?? result?.says ?? 'Nothing on the paper is enough to record it.')
    }
  }

  const total = Object.values(found).reduce((a, b) => a + b, 0)
  const wrote = Object.values(written).reduce((a, b) => a + b, 0)
  const says = total === 0
    ? 'Every paper accepted through a request already has its record behind it. Nothing to do.'
    : opts.write
      ? `${wrote} of ${total} accepted paper${total === 1 ? '' : 's'} now have the record the start reads; the rest are listed with the reason.`
      : `${total} accepted paper${total === 1 ? '' : 's'} have no record behind them. Send {"write": true} to write what can be written.`
  return { write: opts.write, found, written, heldBack, readAsAccepted, says }
}
