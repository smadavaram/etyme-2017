import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { overtimeOptions } from '@/app/dashboard/timesheets/overtime-words'
import { timeOffOffered, TIME_OFF_NOT_OFFERED_SAYS } from '@/lib/overtime'
import { decide, type Sheet } from '@/lib/auto-approval'
import { matchesFoundSays, matchesTitle } from '@/app/api/requirements/[id]/matches/words'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const base = { hours: 5, rateCents: 13_200, multiplierBps: 15_000, firstName: 'Omar' }

describe('the overtime question speaks for the side answering it', () => {
  it('the side that is billed accepts the hours and reads what is added to its bill', () => {
    const [same, premium] = overtimeOptions({ ...base, side: 'BILLED', timeOffAllowed: false })
    expect(same.title).toBe('Accept them at the usual rate')
    expect(same.detail).toBe('5h × $132 = $660.00 added to what you are billed for the week.')
    expect(premium.title).toBe('Accept them at a premium')
    expect(premium.detail).toBe('5h at the higher rate = $990.00 added to what you are billed for the week.')
  })

  it('the side that pays reads what is added to the week’s pay', () => {
    const [same] = overtimeOptions({ ...base, side: 'PAYS', timeOffAllowed: false })
    expect(same.title).toBe('Pay them at the usual rate')
    expect(same.detail).toMatch(/added to the week’s pay\.$/)
  })

  it('time off in place of overtime pay is never offered by default', () => {
    expect(overtimeOptions({ ...base, side: 'BILLED', timeOffAllowed: false }).map((o) => o.key)).toEqual(['SAME_RATE', 'PREMIUM'])
    expect(overtimeOptions({ ...base, side: 'PAYS', timeOffAllowed: true }).map((o) => o.key)).toContain('TIME_OFF')
  })

  it('time off in lieu is offered only where the law allows comp time and the company chose it', () => {
    expect(timeOffOffered({ compTimeLawful: false, companyAllows: true })).toBe(false)
    expect(timeOffOffered({ compTimeLawful: true, companyAllows: false })).toBe(false)
    expect(timeOffOffered({ compTimeLawful: true, companyAllows: true })).toBe(true)
    expect(TIME_OFF_NOT_OFFERED_SAYS).toContain('29 U.S.C. §207(o)')
  })

  it('the client desks ask as the billed side, and the decisions queue as the side that pays', () => {
    expect(read('src/app/dashboard/timesheets/page.tsx')).toContain('side="BILLED"')
    expect(read('src/app/dashboard/program/page.tsx')).toContain('side="BILLED"')
    expect(read('src/app/dashboard/decisions/page.tsx')).toContain('side="PAYS"')
  })

  it('the approval route refuses time off in lieu before anything is written, and says money through the one formatter', () => {
    const route = read('src/app/api/timesheets/[id]/approve/route.ts')
    expect(route.indexOf("code: 'TIME_OFF_NOT_OFFERED'")).toBeGreaterThan(-1)
    expect(route.indexOf("code: 'TIME_OFF_NOT_OFFERED'")).toBeLessThan(route.indexOf('workAssertion.create'))
    expect(route).not.toContain('${billAmount.toFixed(2)} billable')
  })

  it('the decisions page prints money through the one formatter', () => {
    const page = read('src/app/dashboard/decisions/page.tsx')
    expect(page).not.toContain("toLocaleString('en-US', { minimumFractionDigits")
    expect(page).toContain('amount(Math.round(totalAmount * 100))')
  })
})

describe('silence never signs a flagged week', () => {
  const sheet: Sheet = {
    id: 't1', personName: 'Lucía Fernández', submittedAt: new Date('2026-09-01T00:00:00Z'), totalHours: 44,
    clientApprovedAt: null, anomalyScore: null, anomalyReason: null, windowDays: 3, autoApproves: true,
    clientName: 'Northbend Athletic',
  }
  const now = new Date('2026-09-30T00:00:00Z')

  it('a week that does not fit its contract waits for a person, however long the window has run', () => {
    const d = decide({ ...sheet, flag: '44h claimed on a 40h-a-week job.' }, now)
    expect(d.verdict).toBe('HELD')
    expect(d.says).toBe(
      'Held for a person: 44h claimed on a 40h-a-week job. A week that does not fit its contract is signed with a reason, so it is never approved automatically.'
    )
  })

  it('a plain week past its window is still approved by silence where the agreement allows it', () => {
    expect(decide({ ...sheet, totalHours: 40, flag: null }, now).verdict).toBe('APPROVE')
  })
})

describe('a matching run says how many, with the noun agreeing', () => {
  it('one match is one person, never "1 matching candidates"', () => {
    expect(matchesFoundSays(1, 88)).toBe('1 person matches this job. The best fit scores 88 out of 100.')
    expect(matchesFoundSays(3, 74)).toBe('3 people match this job. The best fit scores 74 out of 100.')
    expect(matchesFoundSays(0, null)).toBe('Nobody matched. Try broader skills or a wider rate range.')
    expect(matchesTitle(1, 'HCM integration lead')).toBe('1 match for “HCM integration lead”')
  })
})

describe('the edit form asks for what the raise form asks for', () => {
  it('editing a job request checks the same required facts before saving', () => {
    const chain = read('src/app/dashboard/requisitions/chain.tsx')
    expect(chain).toMatch(/import \{ missingForApproval, missingSays[^}]*\} from '\.\/facts'/)
    expect(chain).toContain('hoursPerWeek: whole(hoursPerWeek),')
  })
})
