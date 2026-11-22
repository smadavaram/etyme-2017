import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { PATCH as remitPatch } from '@/app/api/settings/remit-to/route'
import { GET as setupGet } from '@/app/api/settings/setup/route'
import { PUT as setupPut } from '@/app/api/settings/setup/[item]/route'
import { needsVerifiedOwnerAt } from '@/lib/owner-proof'

/**
 * Money's review, 2026-11-16, found two faults where bank details are
 * written, on the seeded world through the real routes:
 *  1. Settings → Payment details cleared the check when the last four or
 *     the routing digits changed, and never saved the new digits;
 *  2. Setup → Bank details wrote the change with no activity log row.
 * Both doors now save what was typed, clear the check through money's one
 * rule (`bankChange`), and write one row (`recordBankWrite`).
 */

const s: Record<string, any> = {}

/** A seat that may change its own firm's payment details, at a firm of `kinds`, holding no other seat. */
async function settingsSeat(kinds: string[], gateOpen: boolean) {
  const seats = await prisma.context.findMany({
    where: { revokedAt: null, company: { kind: { in: kinds as any } }, role: { permissions: { has: 'settings.manage' } } },
    select: { companyId: true, personId: true, person: { select: { primaryEmail: true, name: true } } },
    orderBy: [{ grantedAt: 'asc' }, { id: 'asc' }],
  })
  for (const seat of seats) {
    if (!seat.person.primaryEmail || !seat.companyId) continue
    if ((await prisma.context.count({ where: { personId: seat.personId, revokedAt: null } })) !== 1) continue
    if (gateOpen && !(await needsVerifiedOwnerAt(seat.companyId, 'BANK')).ok) continue
    return { companyId: seat.companyId, email: seat.person.primaryEmail, name: seat.person.name }
  }
  throw new Error(`The seeded world holds no lone settings seat at a ${kinds.join(' or ')}.`)
}

const putBank = (body: object) => setupPut(req('PUT', '/api/settings/setup/bank', body), { params: { item: 'bank' } })
const bankRows = (companyId: string, remitToId: string) =>
  prisma.automationLog.findMany({
    where: { companyId, action: { in: ['REMIT_TO_ADDED', 'REMIT_TO_CHANGED'] }, payload: { path: ['remitToId'], equals: remitToId } },
    select: { action: true, summary: true, reason: true, payload: true, reversible: true },
    orderBy: { at: 'asc' },
  })

beforeAll(async () => {
  await freshWorld()
  s.firm = await settingsSeat(['VENDOR'], true)
  s.client = await settingsSeat(['CLIENT'], false)
  // The firm's details, checked by a paying firm's Finance, so a change has a check to clear.
  const remit = await prisma.remitTo.findFirst({ where: { companyId: s.firm.companyId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
  s.remitId = remit
    ? remit.id
    : (await prisma.remitTo.create({ data: { companyId: s.firm.companyId, legalName: 'Northwind Staffing LLC', addressLines: [], country: 'US', isDefault: true } })).id
}, 600_000)

const checked = () =>
  prisma.remitTo.update({
    where: { id: s.remitId },
    data: { bankName: 'Harborline Savings', accountName: 'Northwind Staffing LLC', accountLast4: '4410', routingLast4: '0210', verifiedAt: new Date(), verifiedById: null, verifiedByCompanyId: s.client.companyId },
  })

describe('a bank change in Settings → Payment details', () => {
  it('saves the new last four and routing digits, and clears the check on the old ones', async () => {
    await checked()
    as(s.firm.email)
    const res = await json(await remitPatch(req('PATCH', '/api/settings/remit-to', { id: s.remitId, accountLast4: '7731', routingLast4: '0042' })))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.message).toBe('Bank details changed; your client’s Finance checks them again before paying.')
    const row = await prisma.remitTo.findUniqueOrThrow({ where: { id: s.remitId } })
    expect(row).toMatchObject({ accountLast4: '7731', routingLast4: '0042', bankName: 'Harborline Savings', verifiedAt: null, verifiedByCompanyId: null })
  })

  it('writes one activity log row showing the bank, the account name and four digits, never undone from the log', async () => {
    await checked()
    as(s.firm.email)
    const was = (await bankRows(s.firm.companyId, s.remitId)).length
    await json(await remitPatch(req('PATCH', '/api/settings/remit-to', { id: s.remitId, accountLast4: '5582' })))
    const rows = await bankRows(s.firm.companyId, s.remitId)
    expect(rows.length).toBe(was + 1)
    const last = rows[rows.length - 1]!
    expect(last.action).toBe('REMIT_TO_CHANGED')
    expect(last.summary).toBe(`${s.firm.name} changed payment details for ${(await prisma.remitTo.findUniqueOrThrow({ where: { id: s.remitId } })).legalName}: Harborline Savings · Northwind Staffing LLC · ending 5582.`)
    expect(last.reason).toBe('Edited in settings. The bank changed, so the check on it was cleared.')
    expect(last.reversible).toBe(false)
    // No run of digits long enough to be an account number, in anything a
    // person reads on the row. The row's own ids are left out: an id is
    // random, and one that happens to hold five digits is not a bank number.
    expect(JSON.stringify(Object.fromEntries(Object.entries(last).filter(([k]) => !/id$/i.test(k))))).not.toMatch(/\d{5,}/)
  })

  it('refuses a full account number in a sentence, and keeps the details as they were', async () => {
    await checked()
    as(s.firm.email)
    const res = await json(await remitPatch(req('PATCH', '/api/settings/remit-to', { id: s.remitId, accountLast4: '000123457731' })))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toBe('Only the last four digits are stored here. Etyme never holds a full account number — the payment happens in your bank, not in this system.')
    const row = await prisma.remitTo.findUniqueOrThrow({ where: { id: s.remitId } })
    expect(row.accountLast4).toBe('4410')
    expect(row.verifiedAt).not.toBeNull()
  })

  it('is read back in Setup as the bank, the account name and four digits, not checked yet', async () => {
    await checked()
    as(s.firm.email)
    await json(await remitPatch(req('PATCH', '/api/settings/remit-to', { id: s.remitId, isDefault: true, accountLast4: '6610' })))
    const read = await json(await setupGet(req('GET', '/api/settings/setup')))
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body.data.detail.BANK.shows).toBe('Harborline Savings · Northwind Staffing LLC · ending 6610')
    expect(read.body.data.detail.BANK.standing).toBe('Not checked yet. Each client’s Finance team checks these before it pays you.')
  })
})

describe('a bank change in Setup → Bank details', () => {
  it('writes the same activity log row, with only the last four digits of the full number typed', async () => {
    await prisma.remitTo.update({ where: { id: s.remitId }, data: { isDefault: true } })
    await checked()
    as(s.firm.email)
    const was = (await bankRows(s.firm.companyId, s.remitId)).length
    const res = await json(await putBank({ bankName: 'Harborline Credit Union', accountName: 'Northwind Staffing LLC', accountNumber: '000123459904', routingNumber: '021000077' }))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const rows = await bankRows(s.firm.companyId, s.remitId)
    expect(rows.length).toBe(was + 1)
    const last = rows[rows.length - 1]!
    expect(last.action).toBe('REMIT_TO_CHANGED')
    expect(last.summary).toContain(`${s.firm.name} changed payment details for `)
    expect(last.summary).toContain(': Harborline Credit Union · Northwind Staffing LLC · ending 9904.')
    expect(last.reason).toBe('Entered in setup. The bank changed, so the check on it was cleared.')
    expect(last.reversible).toBe(false)
    expect(JSON.stringify(last)).not.toContain('000123459904')
    // No run of digits long enough to be an account number, in anything a
    // person reads on the row. The row's own ids are left out: an id is
    // random, and one that happens to hold five digits is not a bank number.
    expect(JSON.stringify(Object.fromEntries(Object.entries(last).filter(([k]) => !/id$/i.test(k))))).not.toMatch(/\d{5,}/)
    const row = await prisma.remitTo.findUniqueOrThrow({ where: { id: s.remitId } })
    expect(row).toMatchObject({ accountLast4: '9904', routingLast4: '0077', verifiedAt: null })
  })

  it('leaves no row when the same bank is saved again', async () => {
    as(s.firm.email)
    const row = await prisma.remitTo.findUniqueOrThrow({ where: { id: s.remitId } })
    const was = (await bankRows(s.firm.companyId, s.remitId)).length
    const res = await json(await putBank({ bankName: row.bankName, accountName: row.accountName, accountNumber: row.accountLast4, routingNumber: row.routingLast4 }))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect((await bankRows(s.firm.companyId, s.remitId)).length).toBe(was)
  })
})

describe('a client is never asked for bank details', () => {
  it('a client’s setup has no bank item, and one sent anyway is refused in a sentence', async () => {
    as(s.client.email)
    const read = await json(await setupGet(req('GET', '/api/settings/setup')))
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(Object.keys(read.body.data.slugs)).not.toContain('BANK')
    const before = await prisma.remitTo.count({ where: { companyId: s.client.companyId } })
    const res = await json(await putBank({ bankName: 'Harborline Savings', accountName: 'Client Co', accountNumber: '4410' }))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toBe('A client pays its suppliers and is not paid on Etyme, so it has no bank details to give.')
    expect(await prisma.remitTo.count({ where: { companyId: s.client.companyId } })).toBe(before)
  })
})
