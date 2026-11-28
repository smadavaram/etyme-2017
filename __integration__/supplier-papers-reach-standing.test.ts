import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as askForPapers, GET as readRequests } from '@/app/api/packets/route'
import { POST as answerRequest } from '@/app/api/packet/[token]/route'
import { POST as examine } from '@/app/api/documents/[id]/examine/route'
import { GET as documentsGet } from '@/app/api/documents/route'
import { GET as myPapers, PUT as putOwn } from '@/app/api/me/papers/route'
import { rolesFor } from '@/lib/company-defaults'
import { checkCover } from '@/lib/worker-classification'

/**
 * The Tapin walk, 2026-10-29. Brightmoor asked Tapin, a bench supplier
 * with a team, for its supplier papers; Tapin answered through the link;
 * Brightmoor accepted both certificates of insurance on its Paperwork
 * screen; and the award to Tapin refused every time, because the paper
 * read as about nobody and nothing reached Tapin's standing.
 *
 * Here the same steps, through the same routes, end at the standing the
 * award reads (`Verification`, through `checkCover`), the same day.
 */

const s: Record<string, any> = {}
const id = (v: string) => ({ params: Promise.resolve({ id: v }) })

function answer(token: string, itemId: string, name: string): NextRequest {
  const f = new FormData()
  f.set('itemId', itemId)
  f.set('file', new File([`%PDF-1.4\n% ${name}\n%%EOF\n`], name, { type: 'application/pdf' }))
  return new NextRequest(`http://localhost:3000/api/packet/${token}`, { method: 'POST', body: f })
}

function ownPaper(fields: Record<string, string>, name: string): NextRequest {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  f.set('file', new File([`%PDF-1.4 ${name}`], name, { type: 'application/pdf' }))
  return new NextRequest('http://localhost:3000/api/me/papers', { method: 'PUT', body: f })
}

function inAYear(): string {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString().slice(0, 10)
}
function aMonthAgo(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
}

/** What the award reads, read the way it reads it. */
async function coverOf(companyId: string, name: string) {
  const certificates = await prisma.verification.findMany({
    where: { companyId, type: { in: ['INSURANCE_GL', 'INSURANCE_WC'] } },
    select: { type: true, expiresAt: true, status: true },
  })
  return checkCover('W2', { certificates, consultantCorpName: null, corpMissing: false, vendorName: name }, new Date())
}

describe('a supplier’s papers, accepted by the firm that buys, reach the standing the award reads', () => {
  beforeAll(async () => {
    await freshWorld()
    const brightmoor = await prisma.company.findFirstOrThrow({ where: { name: 'Brightmoor Staffing' }, select: { id: true } })
    const owner = await prisma.context.findFirstOrThrow({
      where: { companyId: brightmoor.id, revokedAt: null, role: { name: 'Owner' } },
      select: { person: { select: { primaryEmail: true } } },
    })
    s.buyer = owner.person.primaryEmail

    // Tapin: a bench supplier with a team, new to Etyme, at a reserved address.
    const tapin = await prisma.company.create({ data: { name: 'Tapin Walk', slug: 'tapin-walk', kind: 'VENDOR', domain: 'tapin-walk.invalid' } })
    s.tapin = tapin.id
    const roles = rolesFor('VENDOR')
    const seat = async (name: string, email: string, roleName: string) => {
      const spec = roles.find((r) => r.name === roleName)!
      const role = await prisma.role.create({ data: { companyId: tapin.id, name: spec.name, permissions: spec.permissions as string[] } })
      const person = await prisma.person.create({ data: { name, primaryEmail: email } })
      await prisma.context.create({ data: { personId: person.id, companyId: tapin.id, roleId: role.id, type: 'EMPLOYEE', side: 'SELL', grantReason: 'Seated for the test' } })
      return email
    }
    s.hr = await seat('Hana Rao', 'hana.rao@tapin-walk.invalid', 'HR')
    s.recruiter = await seat('Rafael Ito', 'rafael.ito@tapin-walk.invalid', 'Recruiter')
  }, 240_000)

  it('insurance a client accepted on screen clears the award the same day', async () => {
    as(s.buyer)
    const asked = await json(await askForPapers(req('POST', '/api/packets', {
      packetKey: 'VENDOR_ONBOARDING_US', recipientEmail: 'office@tapin-walk.invalid', subjectCompanyId: s.tapin,
    })))
    expect(asked.status, JSON.stringify(asked.body)).toBeLessThan(300)
    const packet = await prisma.documentPacket.findFirstOrThrow({
      where: { subjectCompanyId: s.tapin }, select: { id: true, token: true, items: { select: { id: true, key: true } } },
    })
    s.packet = packet.id
    const itemOf = (key: string) => packet.items.find((i) => i.key === key)!.id

    // Before anything is accepted, the award refuses, naming the firm.
    expect((await coverOf(s.tapin, 'Tapin Walk')).outcome).toBe('BLOCK')

    // Tapin answers through its link, with no account.
    for (const [key, name] of [['INSURANCE_GL', 'gl.pdf'], ['INSURANCE_WC', 'wc.pdf'], ['W9', 'w9.pdf']] as const) {
      const r = await json(await answerRequest(answer(packet.token, itemOf(key), name), { params: Promise.resolve({ token: packet.token }) }))
      expect(r.status, JSON.stringify(r.body)).toBe(200)
    }

    // Brightmoor's Paperwork lists each answer as Tapin's, asking who issued it.
    as(s.buyer)
    const list = await json(await documentsGet(req('GET', '/api/documents?view=instances')))
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    const rows = list.body.data.instances.filter((i: any) => i.subjectType === 'PACKET_ITEM' && i.subject === 'Tapin Walk')
    expect(rows.length, JSON.stringify(list.body.data.instances.map((i: any) => i.subject))).toBe(3)
    const gl = rows.find((r: any) => /general liability/i.test(r.template.name))
    const wc = rows.find((r: any) => /workers/i.test(r.template.name))
    expect(gl.aboutAFirm).toBe(true)
    expect(gl.examineNeeds).toMatchObject({ start: true, end: true })
    expect(wc.examineNeeds).toMatchObject({ start: true, end: true })

    for (const row of [gl, wc]) {
      const r = await json(await examine(req('POST', `/api/documents/${row.id}/examine`, {
        verdict: 'ACCEPT', validFrom: aMonthAgo(), expiresAt: inAYear(), issuer: 'The Hartford',
      }), id(row.id)))
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      expect(r.body.data.verificationId).toBeTruthy()
      expect(r.body.data.says).toContain('Tapin Walk')
    }

    // The standing the award reads, the same day.
    const cover = await coverOf(s.tapin, 'Tapin Walk')
    expect(cover.outcome, cover.reason).toBe('PASS')
    // And the request agrees with Paperwork: both items accepted, with the row they became.
    const items = await prisma.packetItem.findMany({ where: { packetId: packet.id, key: { in: ['INSURANCE_GL', 'INSURANCE_WC'] } } })
    expect(items.map((i) => i.state)).toEqual(['ACCEPTED', 'ACCEPTED'])
    expect(items.every((i) => i.verificationId && i.validUntil)).toBe(true)
  })

  it('the client’s Document requests page accepts or sends back what arrived', async () => {
    as(s.buyer)
    const before = await json(await readRequests(req('GET', '/api/packets')))
    expect(before.status, JSON.stringify(before.body)).toBe(200)
    const row = before.body.data.packets.find((p: any) => p.id === s.packet)
    // The W-9 is still waiting, with the paper to open and look at.
    const w9 = row.arrived.find((a: any) => a.key === 'W9')
    expect(w9.paperId).toBeTruthy()
    expect(w9.aboutAFirm).toBe(true)
    expect(w9.examineNeeds.edition).toBe(true)

    // Sent back through the same examine route Paperwork uses.
    const back = await json(await examine(req('POST', `/api/documents/${w9.paperId}/examine`, {
      verdict: 'SEND_BACK', reason: 'It is the 2018 edition.',
    }), id(w9.paperId)))
    expect(back.status, JSON.stringify(back.body)).toBe(200)
    const item = await prisma.packetItem.findUniqueOrThrow({ where: { id: w9.itemId } })
    expect(item.state).toBe('REJECTED')
    const after = await json(await readRequests(req('GET', '/api/packets')))
    expect(after.body.data.packets.find((p: any) => p.id === s.packet).arrived.some((a: any) => a.key === 'W9')).toBe(false)
  })

  it('a firm with a team files its own W-9, insurance and good standing from Company paperwork', async () => {
    as(s.hr)
    const view = await json(await myPapers(req('GET', '/api/me/papers?view=own')))
    expect(view.status, JSON.stringify(view.body)).toBe(200)
    expect(view.body.data.teamFirm.id).toBe(s.tapin)
    const firmKeys = view.body.data.menu.filter((m: any) => m.about === 'MY_FIRM').map((m: any) => m.key)
    expect(firmKeys).toEqual(expect.arrayContaining(['W9', 'INSURANCE_GL', 'INSURANCE_WC', 'GOOD_STANDING']))

    const w9 = await json(await putOwn(ownPaper({ key: 'W9', about: 'MY_FIRM', edition: 'Rev. March 2024' }, 'w9.pdf')))
    expect(w9.status, JSON.stringify(w9.body)).toBe(201)
    const gs = await json(await putOwn(ownPaper({ key: 'GOOD_STANDING', about: 'MY_FIRM', validFrom: aMonthAgo(), validUntil: inAYear() }, 'gs.pdf')))
    expect(gs.status, JSON.stringify(gs.body)).toBe(201)
    const filed = await prisma.verification.findUniqueOrThrow({ where: { id: gs.body.data.verificationId } })
    // On the firm's own record, examined by nobody: it clears nothing yet.
    expect([filed.companyId, filed.status]).toEqual([s.tapin, 'PENDING'])

    // A recruiter at the same firm does not file the firm's papers.
    as(s.recruiter)
    const refused = await json(await putOwn(ownPaper({ key: 'W9', about: 'MY_FIRM', edition: 'Rev. March 2024' }, 'w9.pdf')))
    expect(refused.status).toBe(422)
    expect(refused.body.error.message).toContain('Owner, an Admin, HR or the Compliance Officer')

    // The client that buys from Tapin sees the paper Tapin filed and examines it the same way.
    as(s.buyer)
    const list = await json(await documentsGet(req('GET', '/api/documents?view=instances')))
    const kept = list.body.data.instances.find((i: any) => i.id === gs.body.data.docId)
    expect(kept, JSON.stringify(list.body.data.instances.map((i: any) => i.subject))).toBeTruthy()
    expect(kept.subject).toBe('Tapin Walk, filed on its own record')
    const looked = await json(await examine(req('POST', `/api/documents/${kept.id}/examine`, {
      verdict: 'ACCEPT', validFrom: aMonthAgo(), expiresAt: inAYear(), issuer: 'Delaware Division of Corporations',
    }), id(kept.id)))
    expect(looked.status, JSON.stringify(looked.body)).toBe(200)
    const standing = await prisma.verification.findFirst({ where: { companyId: s.tapin, type: 'GOOD_STANDING', status: 'CLEAR' } })
    expect(standing).not.toBeNull()
  })
})
