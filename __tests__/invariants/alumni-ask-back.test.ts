import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { askBack } from '@/app/api/alumni/ask-back-standing'
import { whoseDeskSays } from '@/app/api/alumni/ask-desk'
import { standingAgainstLimit, ledgerStatus, type SiteLine } from '@/lib/tenure-days'
import { breakInServiceVerdict } from '@/lib/governance'

/**
 * "Ask them back" is offered from the time-limit ledger (Addendum E
 * §E.2.3), and gives the same answer as the ledger and the award.
 *
 * The client in every case: an eighteen-month limit (548 days) and a
 * ninety-day break, unless a case says otherwise.
 */

const DAY = 86_400_000
const NOW = new Date('2026-10-06T12:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * DAY)
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY)
const RULES = { capMonths: 18, breakDays: 90 }
const line = (start: Date, end: Date | null, live: boolean): SiteLine => ({ startDate: start, endDate: end, live })
const ymd = (d: Date) => d.toISOString().slice(0, 10)

describe('ask them back, read off the time-limit ledger', () => {
  it('ask them back is offered only when the ledger reads the person eligible, and shows the eligibility date instead inside a break', () => {
    const lines = [line(ago(790), ago(50), false)]
    const a = askBack(lines, RULES, NOW)
    expect(a.canReengage).toBe(false)
    expect(a.ledgerStatus).toBe('IN_BREAK')
    expect(a.eligibleDate).toBe(ymd(ahead(40)))
    expect(a.eligibleDate).toBe(ymd(standingAgainstLimit(lines, RULES, NOW).eligibleOn!))
    expect(a.reengageBlockReason).toContain('90-day break')
    expect(a.reengageBlockReason).toContain('Nov 15, 2026')
  })

  it('somebody who left under the limit and is still inside the break is shown the day, not a button, because the award would refuse them until then', () => {
    const lines = [line(ago(200), ago(10), false)]
    const a = askBack(lines, RULES, NOW)
    expect(a.canReengage).toBe(false)
    expect(a.eligibleDate).toBe(ymd(ahead(80)))
    const brk = breakInServiceVerdict({
      standing: standingAgainstLimit(lines, RULES, NOW), personName: 'P', clientName: 'C',
      breakDays: 90, now: NOW, ruleId: 'r', enforcementMode: 'BLOCK', description: '',
    })
    expect(brk.outcome).toBe('BLOCK')
  })

  it('somebody who served the break is offered ask them back, even though they were once past the time limit', () => {
    const a = askBack([line(ago(900), ago(100), false)], RULES, NOW)
    expect(a.ledgerStatus).toBe('ELIGIBLE')
    expect(a.canReengage).toBe(true)
    expect(a.eligibleDate).toBeNull()
    expect(a.reengageBlockReason).toBeNull()
  })

  it('somebody past the time limit at a client with no break rule is not offered ask them back and is given no eligibility date', () => {
    const a = askBack([line(ago(800), ago(50), false)], { capMonths: 18, breakDays: null }, NOW)
    expect(a.ledgerStatus).toBe('BREAK_REQUIRED')
    expect(a.canReengage).toBe(false)
    expect(a.eligibleDate).toBeNull()
    expect(a.reengageBlockReason).toMatch(/^Past the limit\./)
    expect(a.reengageBlockReason).toContain('no day on which they may come back')
  })

  it('somebody under the time limit at a client with no break rule is offered ask them back the day after they leave', () => {
    const a = askBack([line(ago(200), ago(1), false)], { capMonths: 18, breakDays: null }, NOW)
    expect(a.canReengage).toBe(true)
  })

  it('somebody on contract here is never offered ask them back, whatever their standing', () => {
    expect(askBack([line(ago(100), ahead(100), true)], RULES, NOW).canReengage).toBe(false)
    expect(askBack([line(ago(700), ahead(30), true)], RULES, NOW).canReengage).toBe(false)
    expect(askBack([line(ahead(10), ahead(100), true)], RULES, NOW).canReengage).toBe(false)
  })

  it('a chain whose lower rung ended while the top rung runs never puts the person in a break on the alumni page', () => {
    const a = askBack([line(ago(300), ago(20), false), line(ago(300), ahead(60), true)], RULES, NOW)
    expect(a.eligibleDate).toBeNull()
    expect(a.reengageBlockReason).toBeNull()
  })

  it('a client with no time limit and no break offers ask them back to anybody who has left', () => {
    expect(askBack([line(ago(2000), ago(1), false)], { capMonths: null, breakDays: null }, NOW).canReengage).toBe(true)
  })

  it('the status sent beside the button is the ledger’s own word for the same person', () => {
    for (const lines of [
      [line(ago(790), ago(50), false)],
      [line(ago(900), ago(100), false)],
      [line(ago(100), ago(5), false)],
      [line(ago(450), ago(95), false)],
    ]) {
      expect(askBack(lines, RULES, NOW).ledgerStatus).toBe(ledgerStatus(standingAgainstLimit(lines, RULES, NOW)))
    }
  })

  it('neither the alumni list nor the ask-back request carries its own copy of the break arithmetic', () => {
    for (const f of ['src/app/api/alumni/route.ts', 'src/app/api/alumni/ask-back/route.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).toContain('askBack(')
      expect(src, f).not.toMatch(/daysSinceEnd|breakDaysPolicy|capDays/)
    }
  })
})

describe('who an ask-back is written for, and who hears it', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/api/alumni/ask-back/route.ts'), 'utf8')

  it('the ask-back request resolves the client the way the alumni list does, never from the body unchecked', () => {
    expect(src).toContain('resolveClientCompany(caller, requestedClientId)')
    expect(src).not.toMatch(/where: \{ id: clientCompanyId \}/)
  })

  it('asking somebody back is for the desk that raises job requests, the same desk that asks for a person by name', () => {
    const desk = readFileSync(join(process.cwd(), 'src/app/api/alumni/ask-desk.ts'), 'utf8')
    expect(desk).toContain("'requirements.write'")
    expect(desk).toContain('permissionsToJudgeBy(caller, seat')
    expect(src).toContain('askDesk(caller, seat, client)')
  })

  it('the alumni list asks the same question as the request before it draws an Ask back button', () => {
    const list = readFileSync(join(process.cwd(), 'src/app/api/alumni/route.ts'), 'utf8')
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/alumni/page.tsx'), 'utf8')
    expect(list).toContain('askBack: await askDesk(caller, seat, clientCompany)')
    expect(page).toContain('person.canReengage && desk && !desk.mayAsk')
  })

  it('the sentence names the client’s desks that may ask, or says whoever raises job requests where none is named', () => {
    expect(whoseDeskSays('Cavanaugh Glassworks', ['Hiring Manager', 'Program Manager', 'Hiring Manager']))
      .toBe('Asking somebody back to Cavanaugh Glassworks is for the Hiring Manager or Program Manager desk, the desk that raises job requests. You can read who worked here before; ask them to put the request in.')
    expect(whoseDeskSays('Cavanaugh Glassworks', [])).toContain('for whoever raises job requests there')
  })

  it('an ask-back is logged as not reversible, because a notice sent to a supplier cannot be unsent', () => {
    expect(src).toContain('reversible: false')
    expect(src).not.toContain('reversible: true')
  })

  it('the ask-back goes to a supplier by the same rule as asking for a person, never to the caller’s own firm', () => {
    expect(src).toContain('askGoesTo(')
    expect(src).not.toMatch(/companyId: caller\.company\?\.id,\s*role:/)
  })
})
