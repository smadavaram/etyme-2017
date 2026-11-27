import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { pluginGate } from '@/lib/plugin-gate'

describe('public-sector proposals: the switch on a real firm', () => {
  beforeAll(async () => { await freshWorld() }, 600_000)
  it('a supplier with the switch off is refused in a sentence naming the plugin', async () => {
    const c = await prisma.company.findFirstOrThrow({ where: { kind: 'VENDOR', NOT: { pluginsOn: { has: 'PUBLIC_SECTOR' } } }, select: { id: true, name: true, kind: true } })
    const res = await pluginGate({ company: c, person: { id: 'p', email: 'x@example.com' }, context: { roleId: null } } as never, 'PUBLIC_SECTOR')
    expect(res?.status).toBe(403)
    const body = await res!.json()
    expect(body.error.code).toBe('PLUGIN_OFF')
    expect(body.error.message).toMatch(/Public-sector proposals is off for/)
  })
  it('a proposal row can hold pieces and is removed with its firm’s record', async () => {
    const c = await prisma.company.findFirstOrThrow({ where: { kind: 'VENDOR' }, select: { id: true } })
    const person = await prisma.person.findFirstOrThrow({ select: { id: true } })
    const p = await prisma.proposal.create({ data: { companyId: c.id, title: 'Test solicitation', createdById: person.id, pieces: { create: [{ kind: 'RATES', label: 'Rate card' }] } }, include: { pieces: true } })
    expect(p.state).toBe('DRAFT')
    expect(p.pieces[0].haveIt).toBe(false)
    await prisma.proposal.delete({ where: { id: p.id } })
    expect(await prisma.proposalPiece.count({ where: { proposalId: p.id } })).toBe(0)
  })
})
