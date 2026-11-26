import { describe, it, expect, vi } from 'vitest'

const DB = { approvals: [] as any[] }
vi.mock('@/lib/db', () => ({
  prisma: {
    twinApproval: { findMany: vi.fn(async () => DB.approvals) },
    person: { findMany: vi.fn(async () => []) },
    company: { findUnique: vi.fn(async () => ({ name: 'Corvane Packaging' })) },
    context: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
    roleContract: { findFirst: vi.fn(async () => null) },
    notification: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    twinAction: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
  },
}))
vi.mock('@/lib/alerts', () => ({ reportError: vi.fn(async () => undefined) }))
vi.mock('@/lib/access-log', () => ({ logBulkAccess: () => undefined, recordAccess: async () => undefined }))

import { offerArrivedNotice, offerAnsweredNotice, podOfferTitle } from '@/lib/notify/pod-sale-notices'

const card = {
  id: 'appr-pod', needsPermission: 'named.person', selfApprovalReason: null, requestedAt: new Date('2026-11-26T09:00:00Z'),
  twinAction: {
    id: 'e1', action: 'pod.sale.accept', entityType: 'Pod', entityId: 'pod1', ruleCited: 'r', rationale: 'x',
    authorityPersonId: null, companyId: 'c-client', twinKind: 'PROGRAM_MANAGER', actorType: 'PERSON', actorId: 'p-prop',
    onAuthorityOfRole: 'Named acceptor', authorityPerson: null,
    payload: { acceptorPersonId: 'p-acceptor', proposedByPersonId: 'p-prop', sellerName: 'Tapin', projectName: 'Data platform', podId: 'pod1' },
  },
}
const seat = (id: string, permissions: string[]) => ({
  person: { id, name: id }, company: { id: 'c-client', name: 'Corvane Packaging', kind: 'CLIENT' }, permissions,
}) as any
const offer = {
  acceptorPersonId: 'p-acceptor', proposedByPersonId: 'p-prop', clientCompanyId: 'c-client', sellerCompanyId: 'c-tapin',
  approvalId: 'appr-pod', sellerName: 'Tapin', projectName: 'Data platform',
}

describe('a project offered to one named acceptor', () => {
  it('a colleague who holds every permission does not see a card named for someone else', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    DB.approvals = [card]
    expect(await readersFor(seat('p-colleague', ['*']), 'c-client').waiting()).toEqual([])
  })
  it('the named acceptor sees the card even though her role holds no permission for it', async () => {
    const { readersFor } = await import('@/app/api/conversations/twin/read')
    DB.approvals = [card]
    const items = await readersFor(seat('p-acceptor', ['timesheets.read']), 'c-client').waiting()
    expect(items.map((i) => i.approvalId)).toEqual(['appr-pod'])
    expect(items[0].title).toBe('Tapin offers you the project Data platform')
  })
  it('the card reads the offer as the supplier and the project, never a pod or its team name', () => {
    const t = podOfferTitle(card.twinAction.payload)
    expect(t).not.toMatch(/pod|team/i)
  })
  it('the acceptor is told a card arrived, in the words of the offer, in the app only where no email can leave', () => {
    const n = offerArrivedNotice(offer, false)
    expect(n.personId).toBe('p-acceptor')
    expect(n.title).toBe('Tapin offers you the project Data platform')
    expect(n.channel).toBe('IN_APP')
    expect(`${n.title} ${n.body}`).not.toMatch(/pod|email|letter/i)
  })
  it('the acceptor is also emailed where email can leave', () => {
    expect(offerArrivedNotice(offer, true).channel).toBe('EMAIL')
  })
  it('the proposer hears a yes, and hears not now with the reason', () => {
    const yes = offerAnsweredNotice(offer, 'APPROVED', 'Corvane Packaging', null, false)
    expect(yes.personId).toBe('p-prop')
    expect(yes.companyId).toBe('c-tapin')
    expect(yes.title).toBe('Corvane Packaging said yes to Data platform')
    const no = offerAnsweredNotice(offer, 'REJECTED', 'Corvane Packaging', 'Budget is frozen', false)
    expect(no.title).toBe('Corvane Packaging said not now to Data platform')
    expect(no.body).toContain('Budget is frozen')
    expect(`${yes.body} ${no.body}`).not.toMatch(/pod/i)
  })
})
