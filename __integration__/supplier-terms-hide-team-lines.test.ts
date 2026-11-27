import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { sellPod } from '@/lib/money/pod-sale'
import { orderedOfSupplier, orderedOfEachSupplier } from '@/lib/supplier-desks'

/**
 * Pax, 2026-11-27: the supplier's terms were read from whichever line
 * came first, including a member line of a sold team on outcome work,
 * which the client must never read. The member line here carries a paper
 * that no real line asks for, so it shows if the wrong line is picked.
 */
const s: Record<string, string> = {}
const ONLY_ON_THE_HIDDEN_LINE = 'asked only on a team member line'

describe('the terms a client reads for a supplier never come from a hidden team member line', () => {
  beforeAll(async () => {
    await resetDatabase()
    const client = await prisma.company.create({ data: { name: 'Harrowgate Foods', slug: 'st-client', kind: 'CLIENT', currency: 'USD' } })
    const seller = await prisma.company.create({ data: { name: 'Quillbrook Staffing', slug: 'st-seller', kind: 'VENDOR', currency: 'USD' } })
    const acceptor = await prisma.person.create({ data: { name: 'Imogen Daleford', primaryEmail: 'st-acceptor@client.example' } })
    const cRole = await prisma.role.create({ data: { companyId: client.id, name: 'Program Manager', permissions: ['*'], isDefault: true } })
    await prisma.context.create({ data: { personId: acceptor.id, type: 'CLIENT_CONTACT', companyId: client.id, roleId: cRole.id } })
    const member = await prisma.person.create({ data: { name: 'Ada Quillfeather', primaryEmail: 'ada.st@seed.etyme.invalid' } })
    await prisma.context.create({ data: { personId: member.id, companyId: seller.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Employee' } })
    const pod = await prisma.pod.create({
      data: {
        companyId: seller.id, name: 'Data platform team', pricing: 'RATE_CARD', currency: 'USD',
        roles: { create: [{ title: 'Data engineer', headcount: 1, rateCents: 15_000, sortOrder: 0, members: { create: { personId: member.id } } }] },
      },
      select: { id: true },
    })
    const sold = await prisma.$transaction((tx) => sellPod(tx, {
      podId: pod.id, sellerCompanyId: seller.id, clientCompanyId: client.id, acceptorPersonId: acceptor.id, decidedBy: acceptor.id, projectName: 'Data platform build',
      kind: 'MILESTONE', priceCents: 1_000_000, currency: 'USD',
      deliverables: [{ name: 'Stage 1', amountCents: 1_000_000, dueOn: new Date(Date.now() + 14 * 86_400_000) }],
    }))
    if (!sold.ok) throw new Error(sold.says)
    const hidden = await prisma.sellContract.findFirstOrThrow({
      where: { clientCompanyId: client.id, companyId: seller.id, projectOrder: { is: { podProject: { is: { onSite: false } } } } },
      select: { id: true },
    })
    await prisma.documentRequirement.create({ data: { sellContractId: hidden.id, documentTypeKey: 'TEAM_ONLY_PAPER', owedBy: 'SUPPLIER', required: true, note: ONLY_ON_THE_HIDDEN_LINE } })
    Object.assign(s, { client: client.id, seller: seller.id })
  }, 240_000)

  it('a sold team member line is not the line whose papers are read for one supplier', async () => {
    const items = await orderedOfSupplier(s.client, s.seller)
    expect(items.find((i) => i.note === ONLY_ON_THE_HIDDEN_LINE)).toBeUndefined()
  })

  it('the register, which reads every supplier at once, leaves the hidden line out too', async () => {
    const each = await orderedOfEachSupplier(s.client, [s.seller])
    expect((each.get(s.seller) ?? []).find((i) => i.note === ONLY_ON_THE_HIDDEN_LINE)).toBeUndefined()
  })
})
