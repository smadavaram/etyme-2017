import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { nothingScoredSays, onlyHereSays } from '@/lib/scorecard'
import {
  CHOOSE_FIRST_SAYS, CHOOSE_FROM_RESULTS_SAYS, STANDING_WORD, offersSend, readBench, sampleRowSays, whenFree,
} from '@/lib/bench-filter'

/**
 * Batch five, the bench, as a walker pressed it in a browser
 * (2026-11-16). Each sentence below failed before its fix.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const scorecardsRoute = read('src/app/api/vendors/scorecards/route.ts')
const scorecardsPage = read('src/app/dashboard/scorecards/page.tsx')
const concentrationRoute = read('src/app/api/vendors/concentration/route.ts')
const benchPage = read('src/app/dashboard/bench/page.tsx')
const benchRoute = read('src/app/api/bench/route.ts')
const candidatesPage = read('src/app/dashboard/consultants/page.tsx')

describe('Supplier scorecards say what is true where no job went out on Etyme', () => {
  it('a firm with active suppliers and nothing scored reads what fills a scorecard and how many suppliers it has, never "No suppliers yet."', () => {
    const says = nothingScoredSays({ onRegister: 25, active: 25, readsStanding: true })
    expect(says).toBe(
      'No job went to a supplier on Etyme in the last 12 months, so there is nothing to score. ' +
        'Your 25 active suppliers are listed under Standing.'
    )
    expect(says).not.toContain('No suppliers yet')
  })

  it('a seat that cannot read Standing is not pointed there, and is still told how many active suppliers there are', () => {
    expect(nothingScoredSays({ onRegister: 4, active: 4, readsStanding: false })).toBe(
      'No job went to a supplier on Etyme in the last 12 months, so there is nothing to score. You have 4 active suppliers.'
    )
  })

  it('one active supplier is said in the singular', () => {
    expect(nothingScoredSays({ onRegister: 1, active: 1, readsStanding: true })).toContain('Your one active supplier is listed under Standing.')
  })

  it('suppliers on the register with none active still never read "No suppliers yet."', () => {
    expect(nothingScoredSays({ onRegister: 3, active: 0, readsStanding: true })).toBe(
      'No job went to a supplier on Etyme in the last 12 months, so there is nothing to score.'
    )
  })

  it('"No suppliers yet." is said only where the register holds no supplier at all', () => {
    expect(nothingScoredSays({ onRegister: 0, active: 0, readsStanding: true })).toBe('No suppliers yet.')
  })

  it('the line under the heading never says "No suppliers yet." to a firm with suppliers on its register', () => {
    expect(onlyHereSays(0, 25)).not.toContain('No suppliers yet')
    expect(onlyHereSays(0, 0)).toBe('No suppliers yet.')
  })

  it('one scorecard among many suppliers never reads "You have one supplier"', () => {
    expect(onlyHereSays(1, 25)).toContain('One supplier has a scorecard so far, so there is nobody to compare it with yet.')
    expect(onlyHereSays(1, 25)).not.toContain('You have one supplier')
  })

  it('the route says the empty line through nothingScoredSays, counted off the register, and the page passes that count to the heading line', () => {
    expect(scorecardsRoute).toContain('nothingScoredSays({ onRegister, active, readsStanding:')
    expect(scorecardsRoute).not.toContain("'No suppliers yet.'")
    expect(scorecardsPage).toContain('onlyHereSays(loading || error ? null : cards.length, onRegister)')
    expect(scorecardsPage).not.toContain('Nothing to score yet.')
  })

  it('a client’s supply spread falls back to the people on site through each supplier, read by the program reader its home page reads', () => {
    expect(concentrationRoute).toContain("import { programView } from '@/app/api/program/view'")
    expect(concentrationRoute).toContain('if (!sells && bySupplier.size === 0)')
  })
})

describe('Add to bench is never greyed without words', () => {
  it('the Add to bench button is pressable before anybody is chosen, with "Choose somebody first." beside it', () => {
    expect(CHOOSE_FIRST_SAYS).toBe('Choose somebody first.')
    expect(benchPage).not.toContain('disabled={submitting || !selectedConsultant}')
    expect(benchPage).toContain('<button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">')
    expect(benchPage).toContain('{!selectedConsultant && (')
    expect(benchPage).toContain('{CHOOSE_FIRST_SAYS}')
  })

  it('pressing Add to bench with nobody chosen says to choose the person from the search results, and saves nothing', () => {
    expect(CHOOSE_FROM_RESULTS_SAYS).toBe('Choose the person from the search results.')
    const submit = benchPage.slice(benchPage.indexOf('async function handleSubmit'), benchPage.indexOf('const rates = listingRates'))
    expect(submit).toContain('setError(CHOOSE_FROM_RESULTS_SAYS)')
    expect(submit).toContain('return')
  })
})

describe('A sample person on Bench is offered nothing to send', () => {
  it('a sample person is offered neither Resend nor Copy link, and anybody an email can reach is', () => {
    expect(offersSend({ sample: true })).toBe(false)
    expect(offersSend({ sample: false })).toBe(true)
    expect(offersSend({})).toBe(true)
  })

  it('her row says she is a sample person no email can reach, by the name the firm reads, with no address', () => {
    expect(sampleRowSays('Lena Marsh')).toBe('Lena is a sample person. No email can reach them, so there is nothing to send.')
    expect(sampleRowSays('Lena Marsh')).not.toContain('@')
  })

  it('the bench reader carries whether a row is a sample person, as the route said it, and reads anything else as reachable', () => {
    const row = (sample: unknown) => ({
      id: 'l1', consent: 'INVITED', company: { id: 'c', name: 'Northwind Staffing' },
      consultant: { id: 'p1', skills: [], person: { id: 'x1', name: 'Lena Marsh', email: 'lena@northwind-staffing.example' } },
      sample,
    })
    const reading = readBench({ data: { tiers: { RETAINED: [], MARKETING: [] }, asked: [row(true), row(undefined)] } })
    expect(reading.ok).toBe(true)
    expect(reading.asked.map((a) => a.sample)).toEqual([true, false])
  })

  it('the bench route says sample from the one demo-address reader, for her own firm’s rows and the stays that ended', () => {
    expect(benchRoute).toContain("sample: scope !== 'network' && demoEmail(l.consultant.person.primaryEmail ?? '')")
    expect(benchRoute).toContain("sample: demoEmail(l.consultant.person.primaryEmail ?? '')")
  })

  it('every Resend, Ask to renew and Copy link on Bench is drawn only where offersSend says so, and the sample line replaces the sign-in line', () => {
    expect(benchPage).toContain("a.consent === 'INVITED' && writesBench && offersSend(a)")
    expect(benchPage).toContain('writesBench && offersSend(e) &&')
    expect(benchPage).toContain("row.consent === 'INVITED' && !offersSend(row)")
    expect(benchPage).toContain('{sampleRowSays(a.name)}')
    expect(benchPage).toContain("a.consent === 'INVITED' && !a.sample && drawsSignInLine(session.permissions)")
  })
})

describe('One phrase for one state, and the Candidates drawer closes like the Companies drawer', () => {
  it('somebody on a placement reads "On a placement" on Candidates, the words the Bench page reads for the same person', () => {
    expect(STANDING_WORD.ON_A_PROJECT).toBe('On a placement')
    const now = new Date('2030-03-12T12:00:00Z')
    const placed = whenFree({
      lines: [{ startsOn: new Date('2030-01-01T00:00:00Z'), endsOn: new Date('2030-06-30T00:00:00Z'), state: 'IN_PROGRESS' }],
      availableFrom: null, onBenchSince: null, now,
    })
    expect(placed.says.startsWith(STANDING_WORD.ON_A_PROJECT)).toBe(true)
    expect(Object.values(STANDING_WORD)).not.toContain('On a project')
  })

  it('the Candidates drawer closes on Escape, as the Companies drawer does', () => {
    const drawer = candidatesPage.slice(candidatesPage.indexOf('function ConsultantDrawer'), candidatesPage.indexOf('async function fetchActivity'))
    expect(drawer).toContain("if (e.key === 'Escape') onClose()")
    expect(drawer).toContain("window.removeEventListener('keydown', onKey)")
  })
})
