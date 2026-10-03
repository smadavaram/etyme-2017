import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tellPlaced, awardTellsThePerson } from '@/lib/award'

/**
 * The person placed is told.
 *
 * The award told the client's requisition raiser and the supplier's
 * desks, and the consultant — the one person the placement is about —
 * heard nothing at all.
 */

describe('the person placed is told', () => {
  const told = tellPlaced({ siteName: 'Northbend Athletic', supplierName: 'CloudEPA', roleTitle: 'Demand planning analyst' })

  it('a placed consultant is told where they are placed and through which firm', () => {
    expect(told.title).toBe('You are placed at Northbend Athletic')
    expect(told.body).toBe(
      'You are placed at Northbend Athletic through CloudEPA, for Demand planning analyst. ' +
      'CloudEPA will be in touch about your start date.'
    )
  })

  it('the notice names no rate', () => {
    expect(told.body).not.toMatch(/\$|\/hr|an hour|rate/i)
  })

  it('only the top of a chain tells the person, so a prime settling with its sub-vendor first announces nothing the client has not decided', () => {
    expect(awardTellsThePerson({ sentOnward: false })).toBe(true)
    expect(awardTellsThePerson({ sentOnward: true })).toBe(false)
  })

  it('the award route tells the person it placed, by email, in these words', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/submissions/[id]/award/route.ts'), 'utf8')
    expect(route).toMatch(/tellPlaced\(/)
    expect(route).toMatch(/awardTellsThePerson\(/)
    expect(route).toMatch(/personId: submission\.personId,\s*\n\s*type: 'CONTRACT',\s*\n\s*channel: 'EMAIL'/)
  })
})
