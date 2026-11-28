import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld, as, req, json } from './harness'
import * as recordView from '@/app/api/records/[type]/[id]/route'
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

describe('public-sector proposals: the record view opens a proposal for a seat that may read it', () => {
  const tag = `ps${Date.now()}`
  const w: Record<string, any> = {}
  const rp = (id: string) => ({ params: Promise.resolve({ type: 'Proposal', id }) })
  const open = async (who: any) => { as(who.primaryEmail); return json(await recordView.GET(req('GET', `/api/records/Proposal/${w.proposal.id}`), rp(w.proposal.id))) }
  beforeAll(async () => {
    const firm = (n: string) => prisma.company.create({ data: { name: `${n} ${tag}`, slug: `${n.toLowerCase()}-${tag}`, kind: 'VENDOR' } })
    w.firm = await firm('Bidco'); w.other = await firm('Otherco')
    const role = (companyId: string, name: string, permissions: string[]) => prisma.role.create({ data: { companyId, name, permissions } })
    const person = (n: string) => prisma.person.create({ data: { name: n, primaryEmail: `${n.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid` } })
    const ownerRole = await role(w.firm.id, 'Owner', ['*'])
    const amRole = await role(w.firm.id, 'Account Manager', ['requirements.write', 'consultants.read'])
    const otherRole = await role(w.other.id, 'Owner', ['*'])
    w.owner = await person('Bid Owner'); w.am = await person('Bid Accounts'); w.stranger = await person('Other Owner')
    await prisma.context.create({ data: { personId: w.owner.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: ownerRole.id } as any })
    await prisma.context.create({ data: { personId: w.am.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: amRole.id } as any })
    await prisma.context.create({ data: { personId: w.stranger.id, companyId: w.other.id, type: 'EMPLOYEE', roleId: otherRole.id } as any })
    w.proposal = await prisma.proposal.create({ data: { companyId: w.firm.id, title: `RFP ${tag} staffing`, buyer: 'County Office', createdById: w.owner.id } })
  }, 120_000)

  it('with the plugin off the record view says the plugin is off, and the refusal is on the access log', async () => {
    const before = await prisma.accessLog.count({ where: { action: 'PLUGIN_OFF_REFUSED', allowed: false } })
    const { status, body } = await open(w.owner)
    expect(status).toBe(403)
    expect(body.error.code).toBe('PLUGIN_OFF')
    expect(await prisma.accessLog.count({ where: { action: 'PLUGIN_OFF_REFUSED', allowed: false } })).toBe(before + 1)
  })
  it('with the plugin on, a seat that reads submissions opens the proposal, with its title, its agency and a link to the Proposals page', async () => {
    await prisma.company.update({ where: { id: w.firm.id }, data: { pluginsOn: ['PUBLIC_SECTOR'] } })
    const { status, body } = await open(w.owner)
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ type: 'Proposal', name: `RFP ${tag} staffing` })
    expect(body.data.ownPage).toEqual({ href: '/dashboard/proposals', words: 'Open Proposals' })
    expect(body.data.facts).toEqual(expect.arrayContaining([{ label: 'Agency', value: 'County Office' }, { label: 'State', value: 'Draft' }]))
  })
  it('a seat that does not read submissions is told so, and another firm’s Owner is told it is not on their book', async () => {
    const am = await open(w.am)
    expect(am.status).toBe(403)
    expect(am.body.error.message).toBe('Your seat cannot read submissions.')
    await prisma.company.update({ where: { id: w.other.id }, data: { pluginsOn: ['PUBLIC_SECTOR'] } })
    const other = await open(w.stranger)
    expect(other.status).toBe(403)
    expect(other.body.error.message).toMatch(/not on your firm’s book/)
  })
})
