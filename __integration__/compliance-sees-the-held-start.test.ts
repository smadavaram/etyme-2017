import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as compliance } from '@/app/api/compliance/route'
import { GET as tenure } from '@/app/api/tenure/route'
import { GET as packetList, POST as askForPackets } from '@/app/api/packets/route'

/**
 * Northbend Athletic's compliance officer, on the seeded world, walking
 * what a tester walked on 2026-09-30.
 *
 * The dashboard said Ingrid Sørensen could not start without her I-9;
 * the compliance page one click away said "Nothing is outstanding… 100%
 * clear, 0 flagged" and did not list her at all. Brightmoor's liability
 * certificate, twenty days from running out, read "Expiring" in the
 * table under a hundred percent. Kwame Mensah's 740 days against an
 * eighteen-month limit read "100%". And Document requests offered her
 * nothing to press.
 */

const OFFICER = 'world-nike-compliance@demo.etyme.local'

let page: any

beforeAll(async () => {
  await freshWorld()
  as(OFFICER)
  const res = await json(await compliance(req('GET', '/api/compliance')))
  expect(res.body?.error, JSON.stringify(res.body)).toBeUndefined()
  page = res.body.data
}, 120_000)

describe('the compliance officer’s page sees the start the dashboard sees', () => {
  it('lists Ingrid Sørensen as unable to start until her right-to-work papers are on file', () => {
    const ingrid = page.startsHeld.find((s: any) => s.name === 'Ingrid Sørensen')
    expect(ingrid, JSON.stringify(page.startsHeld)).toBeTruthy()
    expect(ingrid.outcome).toBe('BLOCK')
    expect(ingrid.says).toMatch(/I-9/)
  })

  it('puts Ingrid on the people list even though nothing has been recorded about her', () => {
    const names = page.verifications.persons.map((p: any) => p.name)
    expect(names).toContain('Ingrid Sørensen')
  })

  it('knows the reader is the client, so the page speaks about its sites rather than what it is paid on', () => {
    expect(page.viewerIsClient).toBe(true)
  })

  it('flags Brightmoor’s certificate that is running out rather than counting it clear', () => {
    expect(page.health.expiring).toBeGreaterThanOrEqual(1)
    expect(page.health.flagged).toBeGreaterThanOrEqual(1)
    expect(page.health.clear).toBeLessThan(page.health.totalChecks)
    expect(page.health.clearPercentage).toBeLessThan(100)
  })

  it('names the screening company on a background check, or says no company is named, and never a bare clear', () => {
    const checks = page.verifications.persons.flatMap((p: any) => p.checks)
    const background = checks.filter((c: any) => c.type === 'BACKGROUND_CHECK')
    expect(background.length).toBeGreaterThan(0)
    for (const c of background) {
      expect(c.verdict, JSON.stringify(c)).toBeTruthy()
      expect(c.verdict.says).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })

  it('logs the read of the person about to start, like every other person on the page', async () => {
    const ingrid = await prisma.person.findFirstOrThrow({ where: { name: 'Ingrid Sørensen' } })
    let rows = 0
    for (let i = 0; i < 60 && rows === 0; i++) {
      rows = await prisma.accessLog.count({ where: { subjectId: ingrid.id, action: 'COMPLIANCE_CHECK' } })
      if (rows === 0) await new Promise((r) => setTimeout(r, 50))
    }
    expect(rows).toBeGreaterThan(0)
  })
})

describe('the time-limit ledger does not hide an overrun', () => {
  it('reads Kwame Mensah’s 740 days as 135% of the eighteen-month limit, over it by 6 months', async () => {
    as(OFFICER)
    const res = await json(await tenure(req('GET', '/api/tenure')))
    const kwame = res.body.data.people.find((p: any) => p.name === 'Kwame Mensah')
    expect(kwame, 'Kwame is on the ledger').toBeTruthy()
    expect(kwame.cumulativeDays).toBe(740)
    expect(kwame.againstLimit.percent).toBe(135)
    expect(kwame.againstLimit.overBy).toBe('over the limit by 6 months')
  })
})

describe('Document requests is not a dead end for the compliance officer', () => {
  it('lets her ask, and offers her the sets about a supplier firm only', async () => {
    as(OFFICER)
    const res = await json(await packetList(req('GET', '/api/packets')))
    expect(res.body.data.canAsk).toBe(true)
    expect(res.body.data.available.length).toBeGreaterThan(0)
    expect(res.body.data.available.every((p: any) => p.subject === 'COMPANY')).toBe(true)
  })

  it('refuses a client asking a contractor for her own start documents, in a sentence saying whose they are', async () => {
    as(OFFICER)
    const ingrid = await prisma.person.findFirstOrThrow({ where: { name: 'Ingrid Sørensen' } })
    const res = await json(await askForPackets(req('POST', '/api/packets', {
      packetKey: 'CONTRACT_START_W2',
      recipientEmail: 'ingrid@example.com',
      subjectPersonId: ingrid.id,
    })))
    expect(res.status).toBe(403)
    expect(res.body.error.message).toContain('The firm that employs the person asks for these')
  })
})
