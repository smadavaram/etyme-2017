import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { notify } from '@/lib/notify'
import { mayAskToLink, readerReads } from '@/lib/trade-link'

/**
 * The last yes on a firm already on Etyme that has not taken part.
 *
 * A firm on Etyme is never tied to a client from the client's side alone
 * (review, 2026-11-13). Four desks saying yes to a firm is the client's
 * own decision, and it stands: the request reads approved. What it may
 * not do is write an agreement or a register row on a firm that never
 * said yes. So the firm is asked to link, the same ask "Ask them to link"
 * makes from Companies (`lib/trade-link`, `POST /api/trade-links`): one
 * row, read by the firm's own people under Companies, and heard by
 * whoever there keeps the list of companies. On their yes each side gets
 * its register row.
 *
 * The same shape as the trade-link route, kept beside the one caller that
 * makes it from an approval rather than from a person's press: the
 * route's own body is inline, so the ask is written here in its words.
 */

const ASKS = 'vendors.manage'

/** Whoever at the firm may answer an ask to link: the trade-link route's own rule. */
async function answerersAt(companyId: string): Promise<string[]> {
  const seats = await prisma.context.findMany({
    where: { companyId, revokedAt: null, roleId: { not: null } },
    select: { personId: true, role: { select: { permissions: true } } },
  })
  return [...new Set(seats.filter((s) => hasPermission((s.role?.permissions ?? []) as string[], ASKS)).map((s) => s.personId))]
}

export type ApprovalAsk =
  | { state: 'ASKED'; id: string }
  | { state: 'ALREADY_ASKED' }
  | { state: 'THEY_ASKED' }

/**
 * Ask the firm to link as the client's supplier, where nobody asked
 * either way yet. Never a second ask: an open one, either way, is said
 * instead.
 */
export async function askFirmToLink(input: {
  client: { id: string; name: string; kind: string }
  firm: { id: string; name: string; kind: string }
  askedBy: { id: string; name: string }
  firmName: string
}): Promise<ApprovalAsk> {
  const open = await prisma.tradeLinkRequest.findFirst({
    where: {
      answeredAt: null,
      OR: [
        { fromCompanyId: input.client.id, toCompanyId: input.firm.id },
        { fromCompanyId: input.firm.id, toCompanyId: input.client.id },
      ],
    },
    select: { fromCompanyId: true },
  })
  if (open) return open.fromCompanyId === input.client.id ? { state: 'ALREADY_ASKED' } : { state: 'THEY_ASKED' }

  // The walk's four yeses are the client's authority to ask: the approver
  // need not keep the list of companies to have the firm asked.
  const verdict = mayAskToLink({
    asker: input.client, other: input.firm, relationship: 'SUPPLIER', mayManage: true, linked: false, open: null,
  })
  if (!verdict.ok) return { state: 'ALREADY_ASKED' }

  const row = await prisma.tradeLinkRequest.create({
    data: {
      fromCompanyId: input.client.id,
      toCompanyId: input.firm.id,
      relationship: 'SUPPLIER',
      askedById: input.askedBy.id,
      note: `${input.client.name} approved ${input.firmName} as a supplier.`,
    },
    select: { id: true },
  })
  const words = readerReads({
    asker: { name: input.client.name, kind: input.client.kind },
    other: { name: input.firm.name, kind: input.firm.kind },
    relationship: 'SUPPLIER',
    askedBy: input.askedBy.name,
  })
  for (const personId of await answerersAt(input.firm.id)) {
    void notify({
      personId, companyId: input.firm.id, type: 'SYSTEM', channel: 'EMAIL', entityId: row.id,
      title: words.title, body: words.body, data: { href: '/dashboard/companies', tradeLinkId: row.id },
    })
  }
  return { state: 'ASKED', id: row.id }
}

/** What the approver reads, in one sentence: the firm becomes a supplier on its yes. */
export function approvedAskSays(firmName: string, ask: ApprovalAsk): string {
  switch (ask.state) {
    case 'ASKED':
      return `${firmName} is approved. It is on Etyme already, so it was asked to link, and it becomes your supplier on its yes.`
    case 'ALREADY_ASKED':
      return `${firmName} is approved. It is on Etyme already and was asked to link before; it becomes your supplier on its yes.`
    case 'THEY_ASKED':
      return `${firmName} is approved. It is on Etyme already and has asked to link with you: say yes to its ask under Companies and it is your supplier.`
  }
}
