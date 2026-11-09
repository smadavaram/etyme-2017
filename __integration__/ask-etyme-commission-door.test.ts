import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, freshWorld, prisma } from './harness'
import { POST as askPost } from '@/app/api/conversations/twin/route'

/**
 * Walk 8, item 14 (2026-11-09), on the seeded world through the real route.
 * Marisa Delacroix, Brightmoor's account manager, earns a sales commission
 * from the first of this month, as the award writes it; she asked what she
 * earned last month and was linked to Payroll's Commissions, which refuses
 * her. Her own page is Your commissions, which her sidebar draws.
 */

type Answer = { kind: string; says: string; links?: { label: string; href: string }[] }

describe('Ask Etyme links a commission answer to the page the asker’s own menu offers', () => {
  const emails: Record<string, string> = {}

  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findFirstOrThrow({ where: { name: 'Brightmoor Staffing' }, select: { id: true } })
    for (const name of ['Marisa Delacroix', 'Rosalind Tay', 'Imelda Santoro']) {
      const p = await prisma.person.findFirstOrThrow({ where: { name, contexts: { some: { companyId: firm.id } } }, select: { primaryEmail: true } })
      emails[name] = p.primaryEmail!
    }
    const marisa = await prisma.person.findFirstOrThrow({ where: { primaryEmail: emails['Marisa Delacroix'] }, select: { id: true } })
    const line = await prisma.sellContract.findFirstOrThrow({ where: { companyId: firm.id }, select: { id: true } })
    const now = new Date()
    await prisma.contractCommission.create({
      data: {
        companyId: firm.id, sellContractId: line.id, earnedById: marisa.id, kind: 'SALES', basis: 'SHARE_OF_BILLED', rateBps: 300,
        fromDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), setById: marisa.id, reason: 'Marisa sold the deal',
      },
    })
  }, 240_000)

  const ask = async (name: string, text: string): Promise<Answer> => {
    as(emails[name])
    const r = await json(await askPost(req('POST', '/api/conversations/twin', { text })))
    expect(r.status, text).toBe(200)
    return r.body.data.answer as Answer
  }

  it('an account manager asking what she earned in commission is linked to her own commissions page', async () => {
    const a = await ask('Marisa Delacroix', 'What did I earn in commission last month?')
    expect(a.says).toMatch(/^You have no commission on the record for last month \(/)
    expect(a.links).toEqual([{ label: 'Open Your commissions', href: '/dashboard/my-work/commissions' }])
  })

  it('“Where are my commissions?” opens Your commissions for her, never Payroll’s page', async () => {
    const a = await ask('Marisa Delacroix', 'Where are my commissions?')
    expect(a.links).toEqual([{ label: 'Open Your commissions', href: '/dashboard/my-work/commissions' }])
  })

  it('a seat that runs the firm’s commissions is linked to Payroll’s Commissions', async () => {
    const a = await ask('Rosalind Tay', 'Our commissions this month')
    expect(a.links).toEqual([{ label: 'Open Commissions', href: '/dashboard/payroll/commissions' }])
  })

  it('a seat that earns no commission and reads no payroll is answered with no commission page linked', async () => {
    const a = await ask('Imelda Santoro', 'What did I earn in commission last month?')
    expect(a.says).toMatch(/^You have no commission on the record for last month/)
    expect((a.links ?? []).filter((l) => /commissions/.test(l.href))).toEqual([])
  })
})
