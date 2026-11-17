import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { psqlFile } from './postgres'
import { GUARD_SQL } from './templates'
import { TEST_DB } from './database'

import { GET as ready } from '@/app/api/ready/route'
import { recordSecurityEvent, securityLogGuarded } from '@/lib/identity/security-ledger'
import { bankCheckedBy, mayPayFirm } from '@/lib/setup-gates'

/**
 * Layer 7, slice S0 (record 86): the security log nothing can change, and
 * the bank check each payer makes for itself. On a real Postgres copied
 * from the template, which carries the same guard the deploy applies
 * (prisma/sql/append-only.sql). Made-up firms on reserved domains.
 */

async function refused(sql: string): Promise<string> {
  try {
    await prisma.$executeRawUnsafe(sql)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  return 'the database allowed it'
}

async function firm(name: string, slug: string, kind: 'CLIENT' | 'VENDOR') {
  return prisma.company.create({ data: { name, slug, kind, currency: 'USD', claimedAt: new Date('2026-01-04') } })
}

async function readyEdge() {
  const res = await ready()
  const body = (await res.json()) as { data: { edges: { key: string; state: string; says: string }[] } }
  return body.data.edges.find((e) => e.key === 'security-log')
}

describe('the security log, at the database', () => {
  let id: string

  beforeAll(async () => {
    await resetDatabase()
    const written = await recordSecurityEvent({
      event: 'SECOND_CHECK_PASSED', surface: 'WEB', method: 'PASSKEY',
      says: 'A passkey check passed before a payment run was approved.',
      companyId: 'company-1', actorPersonId: 'person-1', targetKind: 'PaymentRun', targetId: 'run-1',
      facts: { code: '482913', runLines: 3 },
    })
    expect(written).not.toBeNull()
    id = written!
  })

  it('the writer keeps the sentence and the facts, and never the code', async () => {
    const row = await prisma.securityEvent.findUniqueOrThrow({ where: { id } })
    expect(row).toMatchObject({ event: 'SECOND_CHECK_PASSED', surface: 'WEB', method: 'PASSKEY', targetId: 'run-1' })
    expect(row.facts).toEqual({ runLines: 3 })
  })

  it('the security log refuses to change a row once written', async () => {
    expect(await refused(`UPDATE "SecurityEvent" SET "says" = 'nothing happened' WHERE "id" = '${id}'`)).toMatch(/append-only/)
    await expect(prisma.securityEvent.update({ where: { id }, data: { says: 'nothing happened' } })).rejects.toThrow(/append-only/)
    expect((await prisma.securityEvent.findUniqueOrThrow({ where: { id } })).says).toBe('A passkey check passed before a payment run was approved.')
  })

  it('the security log refuses to delete a row, and refuses to be emptied', async () => {
    expect(await refused(`DELETE FROM "SecurityEvent" WHERE "id" = '${id}'`)).toMatch(/append-only/)
    await expect(prisma.securityEvent.deleteMany({})).rejects.toThrow(/append-only/)
    expect(await refused(`TRUNCATE "SecurityEvent"`)).toMatch(/append-only/)
    expect(await prisma.securityEvent.count()).toBe(1)
  })

  it('erasing a person leaves the security log rows about them in place', async () => {
    const p = await prisma.person.create({ data: { name: 'Dana Okafor', primaryEmail: 'dana@harborline-tech.example' } })
    await recordSecurityEvent({ event: 'SECOND_CHECK_ENROLLED', surface: 'WEB', method: 'AUTHENTICATOR_APP', says: 'An authenticator app was added.', actorPersonId: p.id, subjectPersonId: p.id })
    await prisma.person.delete({ where: { id: p.id } })
    expect(await prisma.securityEvent.count({ where: { subjectPersonId: p.id } })).toBe(1)
  })

  it('/ready reads the security log as protected on a database that carries its guard', async () => {
    expect(await securityLogGuarded()).toBe(true)
    expect(await readyEdge()).toMatchObject({ state: 'PROVEN' })
  })

  it('/ready reads the guard as missing where a trigger is gone, and running the guard file again puts it back', async () => {
    // Test-only: the product never turns the guard off (security-ledger.test.ts reads for it).
    await prisma.$executeRawUnsafe(`DROP TRIGGER security_event_never_emptied ON "SecurityEvent"`)
    expect(await securityLogGuarded()).toBe(false)
    expect(await readyEdge()).toMatchObject({ state: 'MISSING' })

    psqlFile(GUARD_SQL, TEST_DB)
    psqlFile(GUARD_SQL, TEST_DB)
    expect(await securityLogGuarded()).toBe(true)
    expect(await refused(`TRUNCATE "SecurityEvent"`)).toMatch(/append-only/)
  })
})

describe('the bank check each payer makes for itself', () => {
  let a: string, b: string, s: string, remitToId: string

  beforeAll(async () => {
    await resetDatabase()
    a = (await firm('Corvale Foods', 'corvale-foods', 'CLIENT')).id
    b = (await firm('Brightwater Mills', 'brightwater-mills', 'CLIENT')).id
    s = (await firm('Northwind Staffing', 'northwind-staffing', 'VENDOR')).id
    remitToId = (await prisma.remitTo.create({
      data: {
        companyId: s, legalName: 'Northwind Staffing LLC', addressLines: ['1 Harbor Way'], country: 'US', isDefault: true,
        bankName: 'Harborline Bank', accountName: 'Northwind Staffing LLC', accountLast4: '6789', routingLast4: '0021',
      },
    })).id
    await prisma.bankCheck.create({
      data: {
        remitToId, payerCompanyId: a, bankName: 'Harborline Bank', accountName: 'Northwind Staffing LLC', accountLast4: '6789', routingLast4: '0021',
        callbackAt: new Date(), callbackNumberSource: 'CONTACT', callbackSpokeWith: 'Accounts at Northwind', callbackOutcome: 'CONFIRMED',
      },
    })
  })

  it('the reader answers per payer: a client’s own check counts for it, and never for another client', async () => {
    expect(await bankCheckedBy(a, s)).toMatchObject({ checked: true, from: 'BANK_CHECK' })
    expect(await bankCheckedBy(b, s)).toEqual({ checked: false, why: 'NOT_CHECKED' })
  })

  it('an old check that names another client never lets this client pay, and the reader says it was another payer’s', async () => {
    await prisma.remitTo.update({ where: { id: remitToId }, data: { verifiedAt: new Date(), verifiedByCompanyId: a } })
    expect(await mayPayFirm(b, s)).toMatchObject({ ok: false, step: 'BANK' })
    expect(await mayPayFirm(a, s)).toEqual({ ok: true })
    expect(await bankCheckedBy(b, s)).toEqual({ checked: false, why: 'ANOTHER_PAYER' })
  })

  it('a change to the account voids the payer’s own check', async () => {
    await prisma.remitTo.update({ where: { id: remitToId }, data: { accountLast4: '1111' } })
    expect(await bankCheckedBy(a, s)).toEqual({ checked: false, why: 'DETAILS_CHANGED' })
  })

  it('one check per payer per set of details: a second check by the same payer is refused by the database', async () => {
    await expect(prisma.bankCheck.create({ data: { remitToId, payerCompanyId: a } })).rejects.toThrow()
  })
})
