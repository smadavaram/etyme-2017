import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * "We need all tables to keep moving their respective statuses across
 * the app."
 *
 * A scan of every status column against every writer in the code found
 * three tables that stopped: a contract never reached ENDED except by
 * seed, an invitation could never be DECLINED, and a timesheet status
 * called PARTIAL that nothing set. The first two are built here; the
 * third was a word on the schema, and the schema now says what it
 * really is. __integration__/status-ledger.test.ts walks one placement
 * and reads every table at every station.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a contract ends when its last day has passed', () => {
  const JOB = read('src/app/api/cron/end-contracts/route.ts')

  it('runs in the daily job, before the rolloff scan looks for contracts ending soon', () => {
    const daily = read('src/app/api/cron/daily/route.ts')
    expect(daily.indexOf("path: 'end-contracts'")).toBeGreaterThan(0)
    expect(daily.indexOf("path: 'end-contracts'")).toBeLessThan(daily.indexOf("path: 'rolloff-scan'"))
  })

  it('ends both sides of the trade — a buy contract ends with the sell contract it supplies', () => {
    expect(JOB).toContain("prisma.sellContract.findMany({\n        where: { state: 'IN_PROGRESS', endDate: { lt: today } }")
    expect(JOB).toContain("prisma.buyContract.findMany({\n        where: { state: 'IN_PROGRESS', endDate: { lt: today } }")
    expect(JOB).toContain("data: { state: 'ENDED' }")
  })

  it('yesterday is over and today is not: the cutoff is the start of today, in UTC', () => {
    expect(JOB).toContain('const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))')
  })

  it('writes the vendor one line per morning, naming the people, with the reason in words', () => {
    expect(JOB).toContain("action: 'CONTRACTS_ENDED'")
    expect(JOB).toContain('last day ${c.endDate!.toISOString().slice(0, 10)}')
    expect(JOB).toContain('The last day on the contract has passed.')
  })

  it('is guarded the same way as every other job', () => {
    expect(JOB).toContain('if (!cronAuthorized(request))')
  })
})

describe('a supplier can say no to a role', () => {
  const DECLINE = read('src/app/api/invitations/[id]/decline/route.ts')

  it('declining writes the status the table has documented since it existed', () => {
    expect(DECLINE).toContain("data: { status: 'DECLINED' }")
  })

  it('a supplier that already put somebody forward cannot decline; that answer was given', () => {
    expect(DECLINE).toContain("if (invitation.status === 'ACCEPTED')")
    expect(DECLINE).toContain('has already put somebody forward for')
  })

  it('whoever is hiring is told, in the supplier’s words when there are any', () => {
    expect(DECLINE).toContain('[invitation.requirement.ownerId, invitation.requirement.raisedById]')
    expect(DECLINE).toContain('title: `${invitation.toCompany.name} declined ${invitation.requirement.title}`')
    expect(DECLINE).toContain("body: reason ?? 'No reason was given.'")
  })

  it('only staff at the invited firm may answer for it', () => {
    expect(DECLINE).toContain("staffOnly(caller, 'Declining a role')")
    expect(DECLINE).toContain('where: { id, toCompanyId: caller.company!.id }')
  })
})

describe('the schema says only what the code can make true', () => {
  it('a timesheet has four statuses; fewer hours accepted than submitted is a number on the row, not a fifth', () => {
    const schema = read('prisma/schema.prisma')
    expect(schema).toContain('// OPEN · SUBMITTED · APPROVED · REJECTED — fewer hours accepted than submitted is acceptedHours, not a status')
    expect(schema).not.toContain('APPROVED · PARTIAL · REJECTED')
  })
})
