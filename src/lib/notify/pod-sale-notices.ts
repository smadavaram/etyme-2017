import { prisma } from '@/lib/db'
import { notify, type NotifyParams } from '@/lib/notify'
import { mailLeaves } from '@/lib/notify/mail-leaves'

/**
 * What is said when a supplier offers a client a project (record 120).
 *
 * The named acceptor is told a card is waiting for her; the supplier's
 * proposer is told her answer, yes or not now. Words are the project's
 * and the supplier's: never "pod", never the team's own name, never a
 * member's name. Email is asked for only where it can leave
 * (`mailLeaves`); where it cannot, the in-app notice stands alone and
 * says nothing about a letter.
 */

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The card's heading, and the acceptor's notice title. Read from the card's own payload. */
export function podOfferTitle(payload: { sellerName?: unknown; projectName?: unknown }): string {
  const seller = text(payload.sellerName) ?? 'A supplier'
  const project = text(payload.projectName) ?? 'a project'
  return `${seller} offers you the project ${project}`
}

export interface PodOffer {
  acceptorPersonId: string
  proposedByPersonId: string
  clientCompanyId: string
  sellerCompanyId: string
  approvalId: string
  sellerName: string
  projectName: string
}

export function offerArrivedNotice(o: PodOffer, mail: boolean = mailLeaves()): NotifyParams {
  return {
    personId: o.acceptorPersonId,
    companyId: o.clientCompanyId,
    type: 'SYSTEM',
    title: podOfferTitle(o),
    body: `${o.sellerName} named you to accept the work on ${o.projectName}. Open Ask Etyme to say yes or not now.`,
    entityId: o.approvalId,
    channel: mail ? 'EMAIL' : 'IN_APP',
    data: { twinApprovalId: o.approvalId, href: '/dashboard' },
  }
}

export function offerAnsweredNotice(o: PodOffer, answer: 'APPROVED' | 'REJECTED', clientName: string, reason: string | null, mail: boolean = mailLeaves()): NotifyParams {
  const yes = answer === 'APPROVED'
  return {
    personId: o.proposedByPersonId,
    companyId: o.sellerCompanyId,
    type: 'SYSTEM',
    title: yes ? `${clientName} said yes to ${o.projectName}` : `${clientName} said not now to ${o.projectName}`,
    body: yes
      ? `${clientName} accepted ${o.projectName}. The project is set up and its deliverables are theirs to accept.`
      : `${clientName} said not now to ${o.projectName}${reason ? `: ${reason}` : ''}. Nothing was sold.`,
    entityId: o.approvalId,
    channel: mail ? 'EMAIL' : 'IN_APP',
    data: { twinApprovalId: o.approvalId, href: '/dashboard' },
  }
}

/** Tell the named acceptor a card arrived. Awaited, never throws. */
export async function tellAcceptor(o: PodOffer): Promise<void> {
  await notify(offerArrivedNotice(o)).catch(() => null)
}

/** Tell the proposer the answer, reading the client's name itself. Awaited, never throws. */
export async function tellProposer(o: PodOffer, answer: 'APPROVED' | 'REJECTED', reason: string | null): Promise<void> {
  const client = await prisma.company.findUnique({ where: { id: o.clientCompanyId }, select: { name: true } }).catch(() => null)
  await notify(offerAnsweredNotice(o, answer, client?.name ?? 'The client', reason)).catch(() => null)
}
