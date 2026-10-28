import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as enter } from '@/app/api/onboarding/route'
import { GET as readSetupState } from '@/app/api/onboarding/setup/route'
import { GET as readChecklist, POST as answerItem } from '@/app/api/settings/setup/route'
import { PUT as saveItem } from '@/app/api/settings/setup/[item]/route'
import { POST as readPaper } from '@/app/api/settings/setup/read-paper/route'
import { GET as readSettings } from '@/app/api/settings/route'
import { txt } from '@/app/api/settings/setup/[item]/dns'
import { mayIssueBill, mayPayFirm, mayChasePaper } from '@/lib/setup-gates'
import { verificationRecord } from '@/lib/domains-owned'
import { ITEM_ORDER } from '@/lib/setup-checklist'

/**
 * The admin's setup checklist (founder, 2026-10-22; "Build it",
 * 2026-10-28), walked through the real doors: a new supplier's Owner reads
 * eleven items, skips them, comes back, fills one from a W-9, gives bank
 * details and a domain; a Member is refused; a one-person firm reads
 * seven; the seeded world reads what it already holds.
 */

const OWNER = 'sharath@tapinwalk.co'
const MEMBER = 'priya@tapinwalk.co'

const W9 = `Form W-9
(Rev. March 2024)
Request for Taxpayer Identification Number and Certification
1 Name of entity/individual. An entry is required.
Tapinwalk LLC
5 Address (number, street, and apt. or suite no.). See instructions.
1200 Commerce Street, Suite 400
6 City, state, and ZIP code
Dallas, TX 75202
Employer identification number
12-3456789`

let companyId = ''
let ownerId = ''
const put = (item: string, body: unknown) => saveItem(req('PUT', `/api/settings/setup/${item}`, body), { params: { item } })

describe('the admin’s setup checklist', () => {
  beforeAll(async () => {
    await freshWorld()
    as(OWNER)
    const made = await json(await enter(req('POST', '/api/onboarding', { type: 'prime', name: 'Tapinwalk' })))
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    companyId = made.body.data.companyId
    ownerId = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: OWNER } })).id
  })

  it('only the Owner or Admin reads the checklist', async () => {
    as(MEMBER)
    const joined = await json(await enter(req('POST', '/api/onboarding', {})))
    expect(joined.body.data).toMatchObject({ action: 'JOIN', role: 'Member' })
    const refused = await json(await readChecklist(req('GET', '/api/settings/setup')))
    expect(refused.status).toBe(403)
    // Refused at the shared door, in its sentence, before anything is read.
    expect(refused.body.error.message).toBe('Settings is not part of your seat at Tapinwalk. Ask your company’s owner if you need it.')
    const skip = await json(await answerItem(req('POST', '/api/settings/setup', { item: 'TEAM', outcome: 'SKIPPED' })))
    expect(skip.status).toBe(403)
    // And the line on Today is never drawn for them.
    expect((await json(await readSetupState(req('GET', '/api/onboarding/setup')))).body.data.reminder).toBeNull()

    as(OWNER)
    const mine = await json(await readChecklist(req('GET', '/api/settings/setup')))
    expect(mine.status).toBe(200)
    expect(mine.body.data.checklist.rows.map((r: any) => r.key)).toEqual(ITEM_ORDER)
  })

  it('every item can be skipped and the company still works', async () => {
    as(OWNER)
    for (const item of ITEM_ORDER) {
      const r = await json(await answerItem(req('POST', '/api/settings/setup', { item, outcome: 'SKIPPED' })))
      expect(r.status, `${item} ${JSON.stringify(r.body)}`).toBe(200)
    }
    const after = await json(await readChecklist(req('GET', '/api/settings/setup')))
    // The colleague who joined finished Your team another way; the rest read skipped.
    const states = Object.fromEntries(after.body.data.checklist.rows.map((r: any) => [r.key, r.state]))
    expect(states.TEAM).toBe('DONE')
    expect(states.ADDRESSES).toBe('SKIPPED')
    // The company still opens its settings and is refused only the acts that need a skipped answer.
    expect((await json(await readSettings(req('GET', '/api/settings')))).status).toBe(200)
    expect(await mayIssueBill(companyId)).toMatchObject({ ok: false, step: 'ADDRESSES' })
    const rows = await prisma.setupItem.findMany({ where: { companyId } })
    expect(rows.every((r) => r.answeredById === ownerId)).toBe(true)
  })

  it('a skipped item comes back on Today until it is done', async () => {
    as(OWNER)
    const before = (await json(await readSetupState(req('GET', '/api/onboarding/setup')))).body.data.reminder
    expect(before).toMatchObject({ href: '/dashboard/settings/setup', link: 'Complete setup' })
    expect(before.says).toMatch(/^Finish setting up: your company, addresses, /)

    const saved = await json(await put('addresses', {
      legal: { street: '1200 Commerce Street', city: 'Dallas', state: 'TX', postalCode: '75202', country: 'US' },
      billingSameAsLegal: true,
    }))
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const after = (await json(await readSetupState(req('GET', '/api/onboarding/setup')))).body.data.reminder
    expect(after.says).not.toMatch(/addresses/)
    expect(after.says).toMatch(/^Finish setting up: your company, your sites, /)
  })

  it('a bill is refused without a billing address, and the refusal names the step', async () => {
    const fresh = await prisma.company.create({ data: { name: 'No Address Staffing', slug: 'no-address-staffing', kind: 'VENDOR', claimedAt: new Date() } })
    expect(await mayIssueBill(fresh.id)).toEqual({ ok: false, says: 'Add a billing address under Setup → Addresses, then send the bill.', step: 'ADDRESSES' })
    // Tapinwalk gave its legal address, and billing is the same.
    expect(await mayIssueBill(companyId)).toEqual({ ok: true })
  })

  it('a W-9 fills the legal name and address and is confirmed before it is recorded', async () => {
    as(OWNER)
    const read = await json(await readPaper(req('POST', '/api/settings/setup/read-paper', { text: W9 })))
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const values = Object.fromEntries(read.body.data.values.map((v: any) => [v.field, v]))
    expect(values.legalName).toMatchObject({ value: 'Tapinwalk LLC', quote: 'Tapinwalk LLC', label: 'Legal name' })
    expect(values['legal.city'].value).toBe('Dallas')
    expect(values.taxId.value).toBe('12-3456789')
    // Read and shown, never recorded: nothing changed on the company.
    const untouched = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { legalName: true, taxId: true } })
    expect(untouched).toEqual({ legalName: null, taxId: null })
    // The model is off for this company, so nothing left for it.
    expect(await prisma.modelPrompt.count({ where: { companyId } })).toBe(0)

    // The Owner presses Save: now it is recorded, saying it came from the W-9.
    const saved = await json(await put('company', {
      legalName: 'Tapinwalk LLC', taxId: '12-3456789', currency: 'USD',
      sources: { legalName: { source: 'PAPER', quote: 'Tapinwalk LLC' }, taxId: { source: 'PAPER', quote: '12-3456789' } },
    }))
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const co = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { legalName: true, taxId: true } })
    expect(co).toEqual({ legalName: 'Tapinwalk LLC', taxId: '12-3456789' })
    expect(saved.body.data.detail.COMPANY.sources.legalName).toMatch(/^From your W-9: “Tapinwalk LLC”\. Confirmed by /)
  })

  it('an answer records who gave it, when, and where it came from', async () => {
    as(OWNER)
    const start = Date.now()
    const saved = await json(await put('company', {
      legalName: 'Tapinwalk LLC', website: 'https://tapinwalk.co', phone: '+1 214 555 0100',
      sources: { website: { source: 'DOMAIN', quote: OWNER } },
    }))
    expect(saved.status).toBe(200)
    const rows = await prisma.setupAnswer.findMany({ where: { companyId, field: { in: ['website', 'phone', 'legalName'] } } })
    const by = Object.fromEntries(rows.map((r) => [r.field, r]))
    expect(by.website).toMatchObject({ source: 'DOMAIN', quote: OWNER, answeredById: ownerId })
    expect(by.phone).toMatchObject({ source: 'PERSON', quote: null, answeredById: ownerId })
    // Typed again by a person, the legal name now says so.
    expect(by.legalName.source).toBe('PERSON')
    expect(by.website.answeredAt.getTime()).toBeGreaterThanOrEqual(start - 1000)
    const item = await prisma.setupItem.findUniqueOrThrow({ where: { companyId_item: { companyId, item: 'COMPANY' } } })
    expect(item).toMatchObject({ outcome: 'DONE', answeredById: ownerId })
  })

  it('bank details are shown as the bank, the account name and four digits', async () => {
    as(OWNER)
    const saved = await json(await put('bank', { bankName: 'Bellrock Bank', accountName: 'Tapinwalk LLC', accountNumber: '000123456789', routingNumber: '021000021' }))
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const bank = saved.body.data.detail.BANK
    expect(bank.shows).toBe('Bellrock Bank · Tapinwalk LLC · ending 6789')
    expect(bank.standing).toBe('Not checked yet. Each client’s Finance team checks these before it pays you.')
    const row = await prisma.remitTo.findFirstOrThrow({ where: { companyId } })
    expect(row).toMatchObject({ accountLast4: '6789', routingLast4: '0021', enteredById: ownerId, verifiedAt: null })
    expect(JSON.stringify(row)).not.toContain('000123456789')

    // Nobody pays the firm until a paying firm's Finance checks them.
    const client = await prisma.company.findFirstOrThrow({ where: { kind: 'CLIENT', claimedAt: { not: null } }, select: { id: true } })
    expect(await mayPayFirm(client.id, companyId)).toMatchObject({ ok: false, step: 'BANK' })
    await prisma.remitTo.update({ where: { id: row.id }, data: { verifiedAt: new Date(), verifiedByCompanyId: client.id } })
    expect(await mayPayFirm(client.id, companyId)).toEqual({ ok: true })
    // A different bank is checked again.
    await json(await put('bank', { bankName: 'Other Bank', accountName: 'Tapinwalk LLC', accountNumber: '9999' }))
    expect(await mayPayFirm(client.id, companyId)).toMatchObject({ ok: false, step: 'BANK' })
  })

  it('a confirmed paper set is what Etyme may chase, party by party', async () => {
    as(OWNER)
    expect(await mayChasePaper(companyId, 'WORKERS_W2')).toMatchObject({ ok: false, step: 'PAPERS' })
    const read = (await json(await readChecklist(req('GET', '/api/settings/setup')))).body.data
    const w2 = read.detail.PAPERS.sets.find((s: any) => s.party === 'WORKERS_W2')
    const saved = await json(await put('papers', { sets: [{ party: 'WORKERS_W2', items: w2.items.map((i: any) => ({ key: i.key, required: i.required })) }] }))
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body.data.says).toBe('Saved. Confirm the other parties’ papers to finish this item.')
    expect(await mayChasePaper(companyId, 'WORKERS_W2')).toEqual({ ok: true })
    // Work authorization cannot be waived at setup either.
    const i9 = w2.items.find((i: any) => !i.waivable)
    const refused = await json(await put('papers', { sets: [{ party: 'WORKERS_W2', items: [{ key: i9.key, required: false, waivedReason: 'We never ask' }] }] }))
    expect(refused.status).toBe(422)
    expect(refused.body.error.message).toMatch(/cannot be waived/)
  })

  it('a colleague joins by domain only once the domain is verified', async () => {
    as(OWNER)
    const claimed = await json(await put('domain', { action: 'CLAIM', domain: 'tapinwalk-staffing.co' }))
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200)
    const claim = claimed.body.data.detail.DOMAIN.claims.find((c: any) => c.domain === 'tapinwalk-staffing.co')
    expect(claim).toMatchObject({ verified: false })
    expect(claim.record.name).toBe('_etyme-verify.tapinwalk-staffing.co')

    as('lee@tapinwalk-staffing.co')
    const turned = await json(await enter(req('POST', '/api/onboarding', {})))
    expect(turned.body.data?.action ?? turned.body.error?.code).not.toBe('JOIN')
    expect(JSON.stringify(turned.body)).toMatch(/has not verified tapinwalk-staffing\.co yet, so colleagues join by invitation/)

    as(OWNER)
    const row = await prisma.companyDomain.findUniqueOrThrow({ where: { domain: 'tapinwalk-staffing.co' } })
    const record = verificationRecord(row.domain, row.proofToken!)
    const real = txt.resolve
    txt.resolve = async (name: string) => (name === record.name ? [[record.value]] : [])
    try {
      const checked = await json(await put('domain', { action: 'CHECK', id: row.id }))
      expect(checked.body.data.says).toBe('tapinwalk-staffing.co is verified. Colleagues on tapinwalk-staffing.co now join by signing in.')
    } finally {
      txt.resolve = real
    }
    as('lee@tapinwalk-staffing.co')
    const joined = await json(await enter(req('POST', '/api/onboarding', {})))
    expect(joined.body.data).toMatchObject({ action: 'JOIN' })
  })

  it('a one-person firm’s checklist has no team, no sites and no papers for suppliers', async () => {
    as('ines.rocha.setup@gmail.com')
    const made = await json(await enter(req('POST', '/api/onboarding', { type: 'solo', name: 'Rocha Setup LLC' })))
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const read = (await json(await readChecklist(req('GET', '/api/settings/setup')))).body.data
    const keys = read.checklist.rows.map((r: any) => r.key)
    expect(keys).toEqual(['COMPANY', 'ADDRESSES', 'HOW_YOU_WORK', 'PAPERS', 'BANK', 'COMPANIES', 'INTEGRATIONS'])
    expect(read.checklist.intro).toMatch(/^Seven things\./)
    expect(read.detail.PAPERS.sets.map((s: any) => s.party)).toEqual(['CUSTOMERS'])
  })

  it('a seeded client reads every item the seed holds as done, so its Today page asks only for what is missing', async () => {
    const owner = await prisma.context.findFirstOrThrow({
      where: { company: { slug: 'world-nike' }, role: { name: 'Owner' }, revokedAt: null },
      include: { person: true },
    })
    as(owner.person.primaryEmail)
    const read = (await json(await readChecklist(req('GET', '/api/settings/setup', undefined, { 'x-context-id': owner.id })))).body.data
    const states = Object.fromEntries(read.checklist.rows.map((r: any) => [r.key, r.state]))
    for (const k of ['COMPANY', 'ADDRESSES', 'SITES', 'PEOPLE_IN_CHARGE', 'HOW_YOU_WORK', 'PAPERS', 'COMPANIES', 'TEAM']) {
      expect(states[k], k).toBe('DONE')
    }
    expect(read.reminder.says).not.toMatch(/your company|addresses|your sites|papers|the people in charge/)
    expect(read.detail.PEOPLE_IN_CHARGE.duties.map((d: any) => d.duty)).toEqual(['OWNER', 'HR', 'BILLING_CONTACT'])
  })

  it('Aptiva Workforce seats a supplier manager, a coordinator and an AP clerk beside its program manager', async () => {
    const seats = await prisma.context.findMany({
      where: { company: { slug: 'world-aptiva' }, revokedAt: null, role: { name: { in: ['Supplier Manager', 'Coordinator', 'AP Clerk'] } } },
      select: { person: { select: { name: true } }, role: { select: { name: true } } },
    })
    expect(seats.map((s) => `${s.role!.name}: ${s.person.name}`).sort()).toEqual([
      'AP Clerk: Hollis Banerjee', 'Coordinator: Tomasz Wierzbicki', 'Supplier Manager: Delphine Castellanos',
    ])
  })
})
