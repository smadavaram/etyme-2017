/**
 * The record ledger and decision items against Postgres (2026-11-21 → 107).
 * Builds its own small firm, so nothing depends on which seeded row is first.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { writeRecordAction, recordTimeline, usageCount } from '@/lib/record-ledger'
import { openDecision, listDecisions, decideDecision, DECISION_RECORD } from '@/lib/decision-items'

const tag = `rl${Date.now()}`
const w: Record<string, any> = {}

async function person(name: string) {
  return prisma.person.create({ data: { name, primaryEmail: `${name.toLowerCase().replace(/\s/g, '.')}.${tag}@example.invalid` } })
}

beforeAll(async () => {
  await resetDatabase()
  w.firm = await prisma.company.create({ data: { name: `Ledger Firm ${tag}`, slug: `ledger-firm-${tag}`, kind: 'VENDOR' } })
  w.other = await prisma.company.create({ data: { name: `Other Firm ${tag}`, slug: `other-firm-${tag}`, kind: 'VENDOR' } })
  w.entity = await prisma.legalEntity.create({ data: { companyId: w.firm.id, name: 'Ledger Firm LLC', country: 'US', currency: 'USD' } })
  w.otherEntity = await prisma.legalEntity.create({ data: { companyId: w.other.id, name: 'Other Firm LLC', country: 'US', currency: 'USD' } })
  const role = (name: string) => prisma.role.create({ data: { companyId: w.firm.id, name, permissions: [] } })
  w.ownerRole = await role('Owner'); w.amRole = await role('Account Manager')
  w.owner = await person('Dana Owner'); w.am = await person('Ravi Accounts'); w.bystander = await person('Lee Bystander')
  for (const [p, r] of [[w.owner, w.ownerRole], [w.am, w.amRole], [w.bystander, w.amRole]]) {
    await prisma.context.create({ data: { personId: p.id, companyId: w.firm.id, type: 'EMPLOYEE', roleId: r.id } as any })
  }
})

const stamp = () => ({ companyId: w.firm.id, actingEntityId: w.entity.id })

describe('the record ledger and decision items, on the database', () => {
  it('every record action carries the entity, the person and the role she held', async () => {
    const row = await writeRecordAction(prisma, { ...stamp(), recordType: 'Company', recordId: w.firm.id, action: 'NOTED', summary: 'Noted the firm.', personId: w.am.id, heldAs: 'Accounts' })
    expect([row.actingEntityId, row.personId, row.heldAs]).toEqual([w.entity.id, w.am.id, 'Accounts'])
  })

  it('a record action cannot name another company’s legal entity', async () => {
    await expect(writeRecordAction(prisma, { companyId: w.firm.id, actingEntityId: w.otherEntity.id, recordType: 'Company', recordId: w.firm.id, action: 'NOTED', summary: 'x', personId: w.am.id, heldAs: 'Accounts' }))
      .rejects.toThrow(/not one of this company’s own/)
  })

  it('the usage meter counts acts by the agent that drafted them, and never prices them', async () => {
    const from = new Date(Date.now() - 60_000)
    await writeRecordAction(prisma, { ...stamp(), recordType: 'Company', recordId: w.firm.id, action: 'DRAFTED', summary: 'Drafted a chase.', personId: w.am.id, heldAs: 'Accounts', agentKey: 'chase', ruleVersion: '1' })
    const counts = await usageCount(w.firm.id, from, new Date(Date.now() + 60_000))
    expect(counts.find((c) => c.agentKey === 'chase')?.count).toBe(1)
    expect(Object.keys(counts[0]).sort()).toEqual(['agentKey', 'count'])
  })

  it('a decision opened on a past day lists with its owner, its entity and its true age, oldest first', async () => {
    const today = new Date()
    const ten = new Date(Date.now() - 10 * 86_400_000)
    w.newer = await openDecision({ ...stamp(), personId: w.am.id, heldAs: 'Accounts', question: 'Hold the supplier’s pay until the paper arrives?', ownerPersonId: w.owner.id, openedOn: new Date(Date.now() - 2 * 86_400_000), proof: 'Agreed by phone, not recorded yet.' })
    w.older = await openDecision({ ...stamp(), personId: w.am.id, heldAs: 'Accounts', question: 'Approve the rate change?', ownerPersonId: w.am.id, openedOn: ten, proof: 'Rate letter', proofLinks: [{ recordType: 'Company', recordId: w.firm.id }, { recordType: 'LegalEntity', recordId: w.entity.id }] })
    const list = await listDecisions(w.firm.id, { now: today })
    expect(list.map((d) => d.id)).toEqual([w.older.id, w.newer.id])
    expect(list[0]).toMatchObject({ ownerName: 'Ravi Accounts', entityName: 'Ledger Firm LLC', ageDays: 10, state: 'OPEN' })
    expect(list[0].proofLinks).toHaveLength(2)
  })

  it('a decision cannot be opened with a day that has not happened', async () => {
    await expect(openDecision({ ...stamp(), personId: w.am.id, heldAs: 'Accounts', question: 'Q?', ownerPersonId: w.am.id, openedOn: new Date(Date.now() + 3 * 86_400_000), proof: 'P' }))
      .rejects.toThrow(/has not happened/)
  })

  it('only its owner or the firm’s Owner or Admin decides a decision', async () => {
    await expect(decideDecision({ ...stamp(), decisionId: w.newer.id, verdict: 'APPROVE', personId: w.bystander.id, heldAs: 'Accounts' }))
      .rejects.toThrow(/Only the person who owes/)
    const done = await decideDecision({ ...stamp(), decisionId: w.newer.id, verdict: 'APPROVE', personId: w.owner.id, heldAs: 'Owner' })
    expect(done.state).toBe('APPROVED')
  })

  it('a card that only asks to be read is recorded as read, never as approved, in its history line', async () => {
    const read = await openDecision({ ...stamp(), personId: w.am.id, heldAs: 'Accounts', question: 'Weekly census: 2 companies moved between active and dormant. Read the list.', ownerPersonId: w.owner.id, openedOn: new Date(), proof: 'The list.' })
    await decideDecision({ ...stamp(), decisionId: read.id, verdict: 'APPROVE', personId: w.owner.id, heldAs: 'Owner' })
    const yes = await openDecision({ ...stamp(), personId: w.am.id, heldAs: 'Accounts', question: 'Approve the renewal for another year?', ownerPersonId: w.owner.id, openedOn: new Date(), proof: 'Renewal letter.' })
    await decideDecision({ ...stamp(), decisionId: yes.id, verdict: 'APPROVE', personId: w.owner.id, heldAs: 'Owner' })
    const line = async (id: string) => (await prisma.recordAction.findFirstOrThrow({ where: { recordType: 'DecisionItem', recordId: id, action: 'APPROVED' } })).summary
    expect(await line(read.id)).toBe('Read.')
    expect(await line(yes.id)).toBe('Approved.')
  })

  it('a decision sent back stays open and keeps its age', async () => {
    const back = await decideDecision({ ...stamp(), decisionId: w.older.id, verdict: 'SEND_BACK', note: 'Attach the signed letter.', personId: w.am.id, heldAs: 'Accounts' })
    expect(back).toMatchObject({ state: 'OPEN', sentBackReason: 'Attach the signed letter.', sentBackByPersonId: w.am.id })
    expect((await listDecisions(w.firm.id)).find((d) => d.id === w.older.id)?.ageDays).toBe(10)
  })

  it('a decision cannot be rejected or sent back without a reason', async () => {
    await expect(decideDecision({ ...stamp(), decisionId: w.older.id, verdict: 'REJECT', note: '', personId: w.am.id, heldAs: 'Accounts' })).rejects.toThrow(/why it is rejected/)
    await expect(decideDecision({ ...stamp(), decisionId: w.older.id, verdict: 'SEND_BACK', personId: w.am.id, heldAs: 'Accounts' })).rejects.toThrow(/why it is sent back/)
  })

  it('a closed decision cannot be decided again', async () => {
    await decideDecision({ ...stamp(), decisionId: w.older.id, verdict: 'REJECT', note: 'The rate is above the band.', personId: w.owner.id, heldAs: 'Owner' })
    await expect(decideDecision({ ...stamp(), decisionId: w.older.id, verdict: 'APPROVE', personId: w.owner.id, heldAs: 'Owner' })).rejects.toThrow(/already closed/)
  })

  it('opening and every verdict are on the decision’s timeline with the actor’s own stamps', async () => {
    const t = await recordTimeline(w.firm.id, DECISION_RECORD, w.older.id)
    expect(t.map((r) => [r.action, r.person.name, r.heldAs, r.actingEntityId])).toEqual([
      ['OPENED', 'Ravi Accounts', 'Accounts', w.entity.id],
      ['SENT_BACK', 'Ravi Accounts', 'Accounts', w.entity.id],
      ['REJECTED', 'Dana Owner', 'Owner', w.entity.id],
    ])
  })

  it('a legal entity with ledger rows or decisions is never deleted, so no stamp is blanked, and removing the whole company still removes both', async () => {
    await expect(prisma.legalEntity.delete({ where: { id: w.entity.id } })).rejects.toThrow()
    expect(await prisma.recordAction.count({ where: { actingEntityId: w.entity.id } })).toBeGreaterThan(0)
    const gone = await prisma.company.create({ data: { name: `Gone Firm ${tag}`, slug: `gone-firm-${tag}`, kind: 'VENDOR' } })
    const e = await prisma.legalEntity.create({ data: { companyId: gone.id, name: 'Gone Firm LLC', country: 'US', currency: 'USD' } })
    await writeRecordAction(prisma, { companyId: gone.id, actingEntityId: e.id, recordType: 'Company', recordId: gone.id, action: 'NOTED', summary: 'Noted.', personId: w.am.id, heldAs: 'Accounts' })
    await prisma.company.delete({ where: { id: gone.id } })
    expect(await prisma.recordAction.count({ where: { companyId: gone.id } })).toBe(0)
  })
})
