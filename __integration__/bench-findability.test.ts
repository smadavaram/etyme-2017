import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { GET as listConsultants, POST as addConsultant } from '@/app/api/consultants/route'
import { GET as bench } from '@/app/api/bench/route'
import { POST as nudge } from '@/app/api/bench/listings/[id]/nudge/route'
import { readBench, INVITE_LINK_KEPT_SAYS, INVITE_NOT_EMAILED_LOG } from '@/lib/bench-filter'
import { openFromAddress, NOT_ON_THIS_LIST_SAYS } from '@/lib/consultant-portfolio/open-from-link'
import { mailLeaves } from '@/lib/notify/mail-leaves'

/**
 * Fix list, batch four, on the bench, through the real routes: the Bench
 * card of somebody asked leads to her record (C4), the resend row says
 * what the send did (D1), and a bench row on the activity log says the
 * tier in words. Two made-up firms on reserved domains; this deployment
 * sends no email, as every integration run.
 */

const A_OWNER = 'owner@northwind-staffing.example'
const B_OWNER = 'owner@harborline-tech.example'
const WREN = 'wren.abernathy@example.test'
const HANA = 'hana.vos@example.test'
let aId = ''
const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function firm(name: string, slug: string, owner: string, ownerName: string) {
  const c = await prisma.company.create({ data: { name, slug, kind: 'VENDOR', currency: 'USD' } })
  const role = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'], isDefault: true } })
  const p = await prisma.person.create({ data: { name: ownerName, primaryEmail: owner } })
  await prisma.context.create({ data: { personId: p.id, companyId: c.id, roleId: role.id, type: 'EMPLOYEE', grantReason: 'owner' } })
  return c.id
}

const listRows = async () => {
  const r = await json(await listConsultants(req('GET', '/api/consultants')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.consultants as any[]
}

const askedOnBench = async () => {
  const r = await json(await bench(req('GET', '/api/bench?scope=company')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  const reading = readBench(r.body)
  if (!reading.ok) throw new Error(reading.why)
  return reading.asked
}

let addSays = ''

beforeAll(async () => {
  await resetDatabase()
  process.env.NEXTAUTH_SECRET = 'integration-test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  aId = await firm('Northwind Staffing', 'northwind-staffing', A_OWNER, 'Noor Haddad')
  await firm('Harborline Tech', 'harborline-tech', B_OWNER, 'Bram Oduya')

  // Hana has an account of her own, with words of her own.
  const hana = await prisma.person.create({ data: { name: 'Hana Vos', primaryEmail: HANA, passwordHash: 'not-a-real-hash' } })
  await prisma.consultantProfile.create({ data: { personId: hana.id, headline: 'Travel ICU nurse', skills: ['Critical care'], location: 'Tucson' } })

  as(A_OWNER)
  const w = await json(await addConsultant(req('POST', '/api/consultants', { name: 'Wren Abernathy', email: WREN, headline: 'Validation engineer', tier: 'MARKETING' })))
  expect(w.status, JSON.stringify(w.body)).toBe(201)
  addSays = w.body.data.message
  const h = await json(await addConsultant(req('POST', '/api/consultants', { name: 'H. Vos', email: HANA, headline: 'Nurse', tier: 'RETAINED' })))
  expect(h.status, JSON.stringify(h.body)).toBe(201)
}, 180_000)

describe('the Bench card of somebody asked leads to her record', () => {
  it('every name in the Asked list is a record on the firm’s own Candidates list, so the link opens her drawer', async () => {
    as(A_OWNER)
    const asked = await askedOnBench()
    expect(asked.length).toBe(2)
    const list = await listRows()
    for (const a of asked) {
      const opened = openFromAddress(list, a.consultantId)
      expect(opened && 'open' in opened, a.name).toBe(true)
    }
  })

  it('before her yes, the drawer opened from the link holds only what the firm typed', async () => {
    as(A_OWNER)
    const hana = (await askedOnBench()).find((a) => a.name === 'H. Vos')!
    const opened = openFromAddress(await listRows(), hana.consultantId)
    if (!opened || !('open' in opened)) throw new Error('her record did not open')
    expect(opened.open.person.name).toBe('H. Vos')
    expect(opened.open.headline).toBe('Nurse')
    expect(JSON.stringify(opened.open)).not.toMatch(/Hana Vos|Travel ICU nurse|Critical care|Tucson/)
  })

  it('another firm following the same link opens nothing and reads one sentence that names nobody', async () => {
    as(A_OWNER)
    const wren = (await askedOnBench()).find((a) => a.name === 'Wren Abernathy')!
    as(B_OWNER)
    const opened = openFromAddress(await listRows(), wren.consultantId)
    expect(opened).toEqual({ says: NOT_ON_THIS_LIST_SAYS })
    expect(NOT_ON_THIS_LIST_SAYS).not.toMatch(/Wren|Abernathy/)
  })
})

describe('where no email can leave', () => {
  it('Add consultant’s answer says to press Copy link on Bench, never a notice or staff, and returns no link', () => {
    expect(mailLeaves()).toBe(false)
    expect(addSays).toContain(INVITE_LINK_KEPT_SAYS)
    expect(addSays).not.toMatch(/notice|staff|\/bench-invite\//)
  })

  it('the activity log row says who sees them in the Add consultant form’s words, never MARKETING or RETAINED', async () => {
    const rows = await prisma.automationLog.findMany({ where: { companyId: aId }, select: { summary: true } })
    const wren = rows.find((r) => r.summary.includes('Wren Abernathy') && r.summary.includes('bench'))
    const hana = rows.find((r) => r.summary.includes('H. Vos') && r.summary.includes('bench'))
    expect(wren?.summary).toContain('(shown to our partners once they say yes)')
    expect(wren?.summary).toContain(INVITE_NOT_EMAILED_LOG)
    expect(hana?.summary).toContain('(kept to us)')
    for (const r of rows) expect(r.summary).not.toMatch(/MARKETING|RETAINED/)
  })

  it('pressing Resend writes a row that says the email did not go, and the rows before it are not changed', async () => {
    as(A_OWNER)
    const before = await prisma.automationLog.findMany({ where: { companyId: aId }, orderBy: { id: 'asc' }, select: { id: true, summary: true } })
    const wren = (await askedOnBench()).find((a) => a.name === 'Wren Abernathy')!
    const r = await json(await nudge(req('POST', `/api/bench/listings/${wren.listingId}/nudge`, {}), params(wren.listingId)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.sent).toBe(false)
    const row = await prisma.automationLog.findFirstOrThrow({ where: { companyId: aId, action: 'BENCH_INVITATION_RESENT' } })
    expect(row.summary).toBe('Noor Haddad tried to send Wren Abernathy the bench invitation again; the email did not go.')
    const still = await prisma.automationLog.findMany({ where: { id: { in: before.map((b) => b.id) } }, orderBy: { id: 'asc' }, select: { id: true, summary: true } })
    expect(still).toEqual(before)
  })
})
