import { describe, it, expect, beforeAll } from 'vitest'
import { req, json, prisma, as } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { licenseGate, credentialsToChase, type HeldCredential } from '@/lib/document-stages'
import { contractClearance, credentialKeys, credentialDetail } from '@/lib/contract-clearance'
import { startPacketFor } from '@/lib/packets'

import { GET as compliance } from '@/app/api/compliance/route'

/**
 * Colleen Byrne's license, walked on the world the demo actually seeds.
 *
 * `__integration__/demo-seats.test.ts` proves the license is on file with
 * a date somebody can chase. This is the other half, and it is the half
 * that was missing: what the date DOES. Her seat says her state license
 * runs out inside the assignment and the renewal has been asked for —
 * and until 2026-09-17 that sentence described a warning that stopped
 * nothing, on the one demo built to show compliance working.
 *
 * A sibling rather than an edit, because that file is somebody else's.
 */

const now = () => new Date()

/** Colleen's real seeded rows, read as the gate reads them. */
async function herCredentials(): Promise<HeldCredential[]> {
  const rows = await prisma.verification.findMany({
    where: {
      person: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' },
      // Whatever this company calls a license to practice. Cast because
      // Prisma types the column as the enum and `credentialKeys` answers
      // for a dictionary a company may have extended past it.
      type: { in: credentialKeys() as any },
    },
  })
  return rows.map((v): HeldCredential => {
    const detail = credentialDetail(v as any)
    return {
      type: v.type,
      label: 'Professional license',
      status: v.status,
      issuedAt: v.issuedAt,
      validFrom: v.validFrom,
      expiresAt: v.expiresAt,
      verifiedAt: v.verifiedAt,
      number: detail.number,
      state: detail.state,
      issuer: v.provider,
    }
  })
}

describe('the travel nurse whose license runs out inside her assignment', () => {
  beforeAll(async () => {
    await seedWorld()
  }, 600_000)

  it('holds a Wisconsin license the system reads as a license to practice, not as a filed document', async () => {
    const creds = await herCredentials()
    expect(creds).toHaveLength(1)
    expect(creds[0].number).toBe('RN 154-882')
    expect(creds[0].state).toBe('WI')
    expect(creds[0].issuer).toBe('Wisconsin Board of Nursing')
  })

  it('is licensed today, and the assignment outlives the license by twenty-five days', async () => {
    const contract = await prisma.sellContract.findFirstOrThrow({
      where: { person: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' } },
    })
    const gate = licenseGate({
      personName: 'Colleen Byrne',
      credentials: await herCredentials(),
      keys: credentialKeys(),
      on: now(),
      through: contract.endDate,
    })
    expect(gate.outcome).toBe('WARN')
    expect(gate.blocking).toHaveLength(0)
    expect(gate.lapsingInside).toHaveLength(1)
    expect(gate.says).toContain('inside the assignment')
    expect(gate.says).toContain('RN 154-882')
  })

  it('cannot be started on the day after her license lapses, and the refusal names Wisconsin', async () => {
    const creds = await herCredentials()
    const dayAfter = new Date(creds[0].expiresAt!.getTime() + 86_400_000)
    const verdict = contractClearance({
      personName: 'Colleen Byrne',
      personVerifications: await prisma.verification.findMany({
        where: { person: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' } },
      }),
      supplierName: 'Halcyon Health Staffing',
      supplierCertificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', expiresAt: new Date(dayAfter.getTime() + 8.64e7 * 90), verifiedAt: dayAfter },
        { type: 'INSURANCE_WC', status: 'CLEAR', expiresAt: new Date(dayAfter.getTime() + 8.64e7 * 90), verifiedAt: dayAfter },
      ],
      clientName: 'Harlow Health',
      role: 'ICU travel nurse — 13 weeks',
      on: dayAfter,
    })
    expect(verdict.outcome).toBe('BLOCK')
    expect(verdict.says).toContain('WI')
    expect(verdict.says).toContain('unlicensed practice')
    expect(verdict.fix).toContain('RN 154-882')
  })

  it('is started through the licensed packet, because a nurse is not a developer', async () => {
    // The role a contract is for lives on the requisition it came from —
    // `SellContract` carries no title of its own — which is where a
    // caller reads it to pick the start packet.
    const contract = await prisma.sellContract.findFirstOrThrow({
      where: { person: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' } },
      include: { requirement: { select: { title: true } } },
    })
    expect(contract.requirement?.title).toBe('ICU travel nurse — 13 weeks')
    expect(startPacketFor(contract.requirement?.title)).toBe('CONTRACT_START_LICENSED')
  })

  it('has a renewal ask on her own page, and the nightly chase would raise the same one', async () => {
    // The seed writes the ask by hand so the seat has something to show.
    // This is the part that matters: the arithmetic behind a nightly
    // chase, run against her real row, wants the same ask — so the seat
    // is describing the system rather than a prop placed beside it.
    const colleen = await prisma.person.findUniqueOrThrow({
      where: { primaryEmail: 'colleen.byrne@seed.etyme.invalid' },
      select: { id: true },
    })
    const asked = await prisma.docInstance.findFirst({
      where: {
        subjectType: 'PERSON',
        subjectId: colleen.id,
        template: { name: { contains: 'renewal' } },
      },
    })
    expect(asked, 'her seat promises a renewal has been asked for').toBeTruthy()
    expect(asked!.status).toBe('SENT')

    const [chase] = credentialsToChase(await herCredentials(), credentialKeys(), now())
    expect(chase, 'a license inside sixty days of lapsing is chased').toBeTruthy()
    expect(chase.state).toBe('WI')
    expect(chase.says).toContain('Wisconsin Board of Nursing')
    expect(chase.daysLeft).toBeLessThanOrEqual(60)
    expect(chase.daysLeft).toBeGreaterThan(0)
  })

  it('shows the client’s compliance desk what is true today, not the status stored on the row', async () => {
    as('world-harlow-health@demo.etyme.local')
    const r = await json(await compliance(req('GET', '/api/compliance')))
    const her = (r.body.data?.verifications?.persons ?? []).find((p: any) => p.name === 'Colleen Byrne')
    expect(her, 'the nurse is on her client’s compliance desk').toBeTruthy()

    const license = her.checks.find((c: any) => c.type === 'PROFESSIONAL_LICENSE')
    expect(license.status, 'the stored status is what somebody last wrote').toBe('CLEAR')
    expect(license.standing, 'the computed standing is what is true today').toBe('EXPIRING')
    expect(license.stopsWork).toBe(true)
    expect(license.licenseState).toBe('WI')
    expect(license.says).toContain('Ask for the renewal now')

    expect(her.license.outcome).toBe('WARN')
    expect(her.license.says).toContain('RN 154-882')
  }, 30_000)

  it('says nothing about a license for a consultant who holds none', async () => {
    as('world-harlow-health@demo.etyme.local')
    const r = await json(await compliance(req('GET', '/api/compliance')))
    const others = (r.body.data?.verifications?.persons ?? []).filter(
      (p: any) => !p.checks.some((c: any) => c.stopsWork)
    )
    for (const person of others) {
      expect(person.license, `${person.name} holds no license, which is an answer rather than a gap`).toBeNull()
    }
  }, 30_000)
})
