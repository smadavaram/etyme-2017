import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importPlan, isOwnEmployeeRow, cellWords, fieldWords } from '@/lib/import-mapper'
import { signUpGuesses, addressFromName } from '@/lib/password-words'
import { signInDoors, signInLine } from '@/lib/readiness'
import { mayAskForSeat, askNotice, askedSentence, noSeatYet } from '@/lib/program-seat'
import { alreadyOnEtyme } from '@/lib/off-system'
import { addressOf } from '@/lib/company-create'

/**
 * The onboarding walk of 2026-10-27, platform's half, as sentences. The
 * database half is __integration__/one-firm-one-tenant.test.ts.
 */

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')

describe('the integrator’s import', () => {
  const rows = [
    { parsed: { name: 'Oluwaseun Adeyemi', contractType: 'W2' } },
    { parsed: { name: 'Marta Lindgren', contractType: 'W2' } },
    { parsed: { name: 'Dev Kapoor', contractType: 'C2C' } },
    { parsed: {} },
  ]

  it('an integrator’s W2 rows import as its own employees, never as a bench listing', () => {
    expect(isOwnEmployeeRow({ contractType: 'W2' }, 'GSI')).toBe(true)
    expect(isOwnEmployeeRow({ contractType: 'W2' }, 'VENDOR')).toBe(true)
    // A client's W2 rows are its suppliers' people, never its own.
    expect(isOwnEmployeeRow({ contractType: 'W2' }, 'CLIENT')).toBe(false)
    // A contract-to-hire is a contractor until the hire.
    expect(isOwnEmployeeRow({ contractType: 'C2H_W2' }, 'GSI')).toBe(false)
    const plan = importPlan(rows, 'GSI')
    expect([plan.employees, plan.contractors, plan.skipped]).toEqual([2, 1, 1])
    expect(plan.says).toContain('2 people go on your payroll as your own employees (W2), with no bench listing')
    expect(plan.says).toContain('nobody outside your firm sees them until each says yes')
    expect(plan.button).toBe('Import 3 people')
  })

  it('the import commits from the page in the trade’s words, never through a browser pop-up', () => {
    const page = src('app/dashboard/import/page.tsx')
    expect(page).not.toMatch(/\bconfirm\(/)
    expect(page).not.toMatch(/window\.(confirm|prompt|alert)\(/)
    expect(page).toContain('fieldWords(f.target)')
    expect(page).toContain('cellWords(f.target')
    expect(page).toContain('Nothing was written. The file stays here until you import it.')
    // No machine word reaches the person.
    expect(page).not.toContain('INTERNAL')
    expect(fieldWords('contractType')).toBe('Contract type')
    expect(fieldWords('startDate')).toBe('Start date')
    expect(cellWords('startDate', '2026-11-02T00:00:00.000Z')).toBe('Nov 2, 2026')
    expect(cellWords('contractType', 'W2')).toBe('W2')
    expect(cellWords('contractType', 'C2C')).toBe('Corp-to-corp')
    expect(cellWords('payRate', 85)).toBe('$85/hr')
    expect(cellWords('skills', ['SAP', 'Kafka'])).toBe('SAP, Kafka')
  })

  it('a file with no name and no email in any row offers nothing to import', () => {
    const plan = importPlan([{ parsed: {} }], 'GSI')
    expect(plan.says).toBe('No row has a name or an email, so nothing can be imported.')
    expect(plan.button).toBe('Nothing to import')
  })
})

describe('sign-up guesses', () => {
  it('the sign-up form suggests the Etyme address, the country and the currency, and a person may change each', () => {
    const g = signUpGuesses('maeve@quarrybrook.co.uk', 'Quarrybrook Staffing')
    expect(g.address).toBe('quarrybrook-staffing')
    expect(g.country).toBe('GB')
    expect(g.currency).toBe('GBP')
    expect(g.says).toContain('We guessed United Kingdom from your web address. Change it if that is wrong.')
    // A personal email says nothing about where a firm is, and says so.
    const p = signUpGuesses('maeve@gmail.com', 'Quarrybrook')
    expect(p.country).toBe('US')
    expect(p.says).toContain('A personal email does not say where you are')
    // The same rule the door checks the address by.
    expect(addressFromName('Óscar & Co. Staffing')).toBe('oscar-co-staffing')

    const form = src('app/(auth)/signup/form.tsx')
    expect(form).toContain('signUpGuesses(email, name)')
    // A guess fills a field until the person touches it, and never after.
    expect(form).toContain('setTouched((t) => ({ ...t, address: true }))')
    expect(form).toContain('setTouched((t) => ({ ...t, country: true }))')
    expect(form).toContain('setTouched((t) => ({ ...t, currency: true }))')
  })
})

describe('/api/health says the truth about signing in', () => {
  it('/api/health names the password door when it works, and says the demo button is the only way in only when it is', () => {
    expect(signInLine(signInDoors({ microsoft: false, google: false, emailLink: false, password: true }))).toBe('Sign-in with password.')
    expect(signInLine(signInDoors({ microsoft: true, google: true, emailLink: false, password: true }))).toBe('Sign-in with Microsoft, Google and password.')
    expect(signInLine(signInDoors({ microsoft: false, google: false, emailLink: false, password: false }))).toContain('the only way in is the demo button')
    const health = src('app/api/health/route.ts')
    expect(health).toContain('signInLine(providers)')
    expect(health).toContain('password: emailSender() !== null')
  })
})

describe('an MSP asks a client for a seat', () => {
  const palliser = { id: 'p', kind: 'MSP', name: 'Palliser MSP' }
  const northbend = { id: 'n', kind: 'CLIENT', name: 'Northbend Athletic' }

  it('an MSP with no seat can ask a client for one from its own first screen', () => {
    expect(mayAskForSeat({ office: palliser, client: northbend, seated: false, openAsk: null }).ok).toBe(true)
    expect(askedSentence({ client: 'Northbend Athletic', office: 'Palliser MSP', again: false, on: 'Oct 27, 2026' }))
      .toBe('Northbend Athletic’s owner and program manager are told that Palliser MSP asked for a seat. Nothing opens until one of them grants it.')
    const n = askNotice({ office: 'Palliser MSP', asker: 'Tomas Reyes', note: 'Your contractor program' })
    expect(n.title).toBe('Palliser MSP asks for a seat in your program')
    expect(n.body).toContain('from Settings, under MSPs')
    const ask = src('components/settings/ask-for-seat.tsx')
    expect(ask).toContain("fetch('/api/seat-requests'")
  })

  it('an ask that cannot mean anything is refused in a sentence', () => {
    const v = (o: Partial<Parameters<typeof mayAskForSeat>[0]>) => mayAskForSeat({ office: palliser, client: northbend, seated: false, openAsk: null, ...o })
    const said = (r: ReturnType<typeof mayAskForSeat>) => (r.ok ? '' : r.says)
    expect(said(v({ office: northbend }))).toContain('runs its own program')
    expect(said(v({ client: null }))).toContain('No client by that name is on Etyme')
    expect(said(v({ client: { id: 'b', kind: 'VENDOR', name: 'Brightmoor Staffing' } }))).toContain('is not a client on Etyme')
    expect(said(v({ seated: true }))).toContain('already sits in Northbend Athletic’s program')
  })

  it('a client grants an MSP a seat from Settings through the one grant route, naming one of its own roles', () => {
    const grant = src('components/settings/grant-seat.tsx')
    expect(grant).toContain("fetch('/api/program/seats'")
    expect(grant).toContain("fetch('/api/roles')")
    expect(grant).toContain('/api/firms?as=MSP&q=')
    expect(grant).not.toMatch(/window\.(confirm|prompt)\(/)
  })

  it('the refusal an MSP reads is one grammatical sentence', () => {
    expect(noSeatYet('Palliser MSP')).not.toContain('a an ')
    expect(noSeatYet('Palliser MSP')).toContain('Ask an owner or the program manager at that client')
  })
})

describe('a firm already on Etyme', () => {
  it('adding a counterparty that is already on Etyme says who they are and how the two records link', () => {
    expect(alreadyOnEtyme({ name: 'Quarrybrook Staffing', slug: 'quarrybrook' }, 'sub-vendor')).toBe(
      'Quarrybrook Staffing is already on Etyme, at quarrybrook.etyme.com, so no copy of them was made. ' +
      'Ask them to add you instead, as their sub-vendor, and your two records link.',
    )
  })

  it('an Etyme address is read however it is typed', () => {
    expect(addressOf('Quarrybrook')).toBe('quarrybrook')
    expect(addressOf('quarrybrook.etyme.com')).toBe('quarrybrook')
    expect(addressOf('https://quarrybrook.etyme.com/jobs')).toBe('quarrybrook')
    expect(addressOf('Quarrybrook Staffing')).toBeNull()
  })
})
