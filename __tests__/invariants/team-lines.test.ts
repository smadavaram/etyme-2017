import { describe, it, expect } from 'vitest'
import { isHiddenTeamLine, isTeamLine, topSignerFor, topSignRefusal, printsRate, clientLineWhere, visibleToReader, HIDDEN_TEAM_LINE } from '@/lib/money/team-lines'
import { notAcceptedSays } from '@/lib/money/payroll-rows'

const line = (onSite: boolean | null) => ({
  companyId: 'seller', clientCompanyId: 'client',
  projectOrder: onSite === null ? null : { podProject: { onSite } },
})

describe('which member lines the client never reads', () => {
  it('a member line on a project not marked on site is hidden from the client', () => {
    expect(isHiddenTeamLine(line(false))).toBe(true)
  })
  it('a member line on a project marked on site is not hidden from the client', () => {
    expect(isHiddenTeamLine(line(true))).toBe(false)
  })
  it('an ordinary placement is not a team line and is never hidden', () => {
    expect(isTeamLine(line(null))).toBe(false)
    expect(isHiddenTeamLine(line(null))).toBe(false)
  })
  it('the client filter keeps the reader’s own condition and leaves out hidden member lines', () => {
    expect(clientLineWhere({ clientCompanyId: 'client' })).toEqual({ AND: [{ clientCompanyId: 'client' }, { NOT: HIDDEN_TEAM_LINE }] })
  })
  it('a hidden member line stays readable by the firm that sells it', () => {
    expect(JSON.stringify(visibleToReader({ clientCompanyId: 'client' }, 'seller'))).toContain('"companyId":"seller"')
  })
})

describe('who signs a member’s week at the top', () => {
  it('on outcome work the selling firm signs at the top, not the client', () => {
    expect(topSignerFor(line(false))).toEqual({ side: 'SELLER', companyId: 'seller' })
  })
  it('on site, the client signs at the top as for any contractor on its site', () => {
    expect(topSignerFor(line(true))).toEqual({ side: 'CLIENT', companyId: 'client' })
  })
  it('nobody accepts their own week on a team line', () => {
    expect(topSignRefusal(line(false), { personId: 'p1', companyId: 'seller' }, { personId: 'p1', name: 'Ada' })).toMatch(/Nobody signs their own week/)
  })
  it('a colleague at the selling firm may sign an outcome member’s week', () => {
    expect(topSignRefusal(line(false), { personId: 'p2', companyId: 'seller' }, { personId: 'p1', name: 'Ada' })).toBeNull()
  })
  it('the client may not sign an outcome member’s week, and is told whose it is', () => {
    expect(topSignRefusal(line(false), { personId: 'c1', companyId: 'client' }, { personId: 'p1', name: 'Ada' })).toMatch(/firm that sells the team/)
  })
})

describe('what the payroll row says a member’s week waits for', () => {
  const week = { personName: 'Ada', week: 'Nov 1 – Nov 7, 2026', hours: 40, clientApproved: false, clientName: 'Northbend', employerName: 'Brightmoor' }
  it('on outcome work the row waits only for the selling firm and never names the client', () => {
    const says = notAcceptedSays({ ...week, topIsSeller: true })
    expect(says).toContain('until Brightmoor accepts it')
    expect(says).not.toContain('Northbend')
  })
  it('on any other week the row still waits for the client first', () => {
    expect(notAcceptedSays(week)).toContain('Northbend approves it and Brightmoor accepts it')
  })
})

describe('a team line never prints a rate of zero per hour', () => {
  const team = { ...line(false), billRate: 0 }
  it('the client reads no rate on a team line, on site or not', () => {
    expect(printsRate({ ...line(true), billRate: 9000 }, 'client')).toBe(false)
    expect(printsRate(team, 'client')).toBe(false)
  })
  it('the seller reads no rate while the line carries none', () => {
    expect(printsRate(team, 'seller')).toBe(false)
  })
  it('an ordinary placement prints its rate as before', () => {
    expect(printsRate({ ...line(null), billRate: 9000 }, 'client')).toBe(true)
  })
})
