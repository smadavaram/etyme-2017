/**
 * Lead capture, for people who asked.
 *
 * ── Why this is the shape it is ──────────────────────────────────────
 *
 * A CRM here is for people who asked to hear from us. Cold outbound at
 * volume trains a market to filter you, and this product's whole
 * argument is that the industry's noise is the problem — a sequence of
 * eleven emails to somebody who never asked is us becoming the thing we
 * criticise, at our own expense.
 *
 * So the rules are checkable rather than cultural: no consent, no row;
 * a purchased list is refused whole and the refusal says why; a second
 * ask updates what somebody wants instead of making a second of them;
 * and a lead who became a customer stops being courted.
 *
 * The price is deliberately absent. It is decided — free until five real
 * vendors — and no agent invents a number, so nothing in the capture
 * flow may carry one.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SOURCES,
  normalEmail,
  problems,
  looksScripted,
  secondAsk,
  mergeAsk,
  consentVerdict,
  reviewImport,
  conversion,
  stillWaiting,
  mayReadTheList,
  ASK_COPY,
  type OnFile,
} from '@/lib/public-site/leads'
import { check } from '@/lib/positioning'

const at = (iso: string) => new Date(iso)

const ok = {
  email: 'ravi@cloudepa.com',
  name: 'Ravi Menon',
  companyName: 'Cloudepa Systems',
  source: 'HOME_PAGE',
  asked: 'We run 40 contractors through 3 primes and cannot say who is where.',
}

// ── What somebody typed ─────────────────────────────────────────────

describe('An address is quoted back as it was typed, never called invalid', () => {

  it('refuses an address with no @ and shows the person exactly what they typed', () => {
    const p = problems({ ...ok, email: 'ravi.cloudepa.com' })
    expect(p.map((x) => x.field)).toContain('email')
    expect(p[0].says).toContain('"ravi.cloudepa.com"')
    expect(p[0].says.toLowerCase()).not.toContain('invalid')
  })

  it('refuses an address with nothing after the @, and says what is missing', () => {
    const p = problems({ ...ok, email: 'ravi@' })
    expect(p[0].says).toContain('"ravi@"')
    expect(p[0].says.toLowerCase()).toContain('after the @')
  })

  it('asks for an email at all, because a message nobody can answer is not a lead', () => {
    const p = problems({ ...ok, email: '   ' })
    expect(p.map((x) => x.field)).toEqual(['email'])
    expect(p[0].says.toLowerCase()).toContain('write back')
  })

  it('treats Ravi@Cloudepa.COM and ravi@cloudepa.com as the same person', () => {
    expect(normalEmail('  Ravi@Cloudepa.COM ')).toBe('ravi@cloudepa.com')
  })

  it('accepts a message with an address and no words, because the address is the ask', () => {
    expect(problems({ email: 'ravi@cloudepa.com', source: 'HOME_PAGE' })).toEqual([])
  })

  it('refuses a source nobody recognises rather than filing it as other', () => {
    const p = problems({ ...ok, source: 'COLD_LIST' })
    expect(p.map((x) => x.field)).toContain('source')
    expect(p.find((x) => x.field === 'source')!.says).toContain('"COLD_LIST"')
    expect([...SOURCES]).toEqual(['HOME_PAGE', 'DEMO', 'GENERATED_SITE', 'REFERRAL', 'EVENT'])
  })

  it('refuses a first message longer than anybody will read, and says the shorter half is the point', () => {
    const p = problems({ ...ok, asked: 'x'.repeat(2100) })
    expect(p.map((x) => x.field)).toContain('asked')
  })
})

// ── A script, not a person ──────────────────────────────────────────

describe('A scripted burst is caught by a field a person never sees', () => {

  it('drops a submission with the hidden field filled in', () => {
    const v = looksScripted({ honeypot: 'https://buy-backlinks.example', filledInMs: 40000 })
    expect(v.scripted).toBe(true)
    expect(v.says).toContain('never see')
  })

  it('treats a form sent faster than a person could type it as a script', () => {
    expect(looksScripted({ honeypot: '', filledInMs: 300 }).scripted).toBe(true)
  })

  it('lets a slow, thoughtful message through', () => {
    expect(looksScripted({ honeypot: '', filledInMs: 47_000 }).scripted).toBe(false)
  })

  it('does not treat a missing timer as evidence of anything', () => {
    // An old browser, a blocked script, a curl request from somebody
    // real. Absence of data is not a reason to refuse a person.
    expect(looksScripted({ honeypot: '', filledInMs: null }).scripted).toBe(false)
  })

  it('blames the submission rather than the address it came from', () => {
    // Refusing by IP punishes an office behind one address and stops
    // nobody with a proxy. It is theatre, and it hits the wrong people.
    const v = looksScripted({ honeypot: 'x', filledInMs: 10 })
    expect(v.says.toLowerCase()).not.toContain('ip address')
  })
})

// ── Asking twice ────────────────────────────────────────────────────

describe('A second ask updates what somebody wants, and never makes a second of them', () => {

  const onFile: OnFile = {
    id: 'lead_1',
    email: 'ravi@cloudepa.com',
    asked: 'How does the tenure number work?',
    consentAt: at('2026-06-01T09:00:00Z'),
    convertedAt: null,
  }

  it('recognises the same person behind a differently typed address', () => {
    const v = secondAsk({ ...ok, email: ' RAVI@cloudepa.com ' }, onFile, at('2026-08-01T09:00:00Z'))
    expect(v.alreadyOnFile).toBe(true)
    expect(v.says).toContain('already')
  })

  it('keeps what they first said alongside what they said this time', () => {
    const v = secondAsk({ ...ok, asked: 'Can it read our VMS emails?' }, onFile, at('2026-08-01T09:00:00Z'))
    expect(v.asked).toContain('Can it read our VMS emails?')
    expect(v.asked).toContain('How does the tenure number work?')
  })

  it('never wipes an earlier ask with an empty one', () => {
    const v = secondAsk({ email: 'ravi@cloudepa.com', source: 'DEMO' }, onFile, at('2026-08-01T09:00:00Z'))
    expect(v.asked).toBe('How does the tenure number work?')
  })

  it('does not repeat the same sentence back at itself when somebody sends it twice', () => {
    expect(mergeAsk('How does the tenure number work?', 'How does the tenure number work? ')).toBe(
      'How does the tenure number work?'
    )
  })

  it('keeps the day they first asked, because that is when consent was given', () => {
    const v = secondAsk(ok, onFile, at('2026-08-01T09:00:00Z'))
    expect(v.consentAt).toEqual(at('2026-06-01T09:00:00Z'))
  })

  it('records a new person as consenting at the moment they wrote', () => {
    const v = secondAsk(ok, null, at('2026-08-01T09:00:00Z'))
    expect(v.alreadyOnFile).toBe(false)
    expect(v.consentAt).toEqual(at('2026-08-01T09:00:00Z'))
  })
})

// ── No consent, no row ──────────────────────────────────────────────

describe('No consent, no row', () => {

  it('accepts somebody who filled in the form themselves, because that is the asking', () => {
    const v = consentVerdict({
      source: 'HOME_PAGE', consentAt: at('2026-08-01T09:00:00Z'),
      asked: null, whereTheyAsked: 'the form on the home page',
    })
    expect(v.consented).toBe(true)
  })

  it('refuses a row with no moment anybody can point at', () => {
    const v = consentVerdict({ source: 'EVENT', consentAt: null, asked: 'Send me the demo', whereTheyAsked: 'HR Tech, booth 214' })
    expect(v.consented).toBe(false)
    expect(v.says.toLowerCase()).toContain('when')
  })

  it('refuses a row where nobody can say where the person asked', () => {
    const v = consentVerdict({ source: 'REFERRAL', consentAt: at('2026-08-01T09:00:00Z'), asked: 'Intro me', whereTheyAsked: null })
    expect(v.consented).toBe(false)
  })

  it('refuses a name off a list with no words of their own in it', () => {
    const v = consentVerdict({ source: 'EVENT', consentAt: at('2026-08-01T09:00:00Z'), asked: null, whereTheyAsked: 'a spreadsheet' })
    expect(v.consented).toBe(false)
    expect(v.says.toLowerCase()).toContain('words of their own')
  })
})

describe('A purchased list is refused, in the words you would use to whoever bought it', () => {

  const bought = Array.from({ length: 4000 }, (_, i) => ({
    email: `person${i}@somefirm.com`,
    source: 'EVENT',
    asked: null,
    consentAt: null,
    whereTheyAsked: null,
  }))

  it('refuses four thousand people who never asked', () => {
    const v = reviewImport(bought)
    expect(v.accepted).toBeNull()
    expect(v.refused).toBe(true)
  })

  it('says how many of them asked, and it is a number off the rows rather than a guess', () => {
    const v = reviewImport(bought)
    expect(v.says).toContain('4,000')
    expect(v.consented).toBe(0)
  })

  it('says the thing that is actually wrong with it, not that it is against policy', () => {
    const v = reviewImport(bought)
    expect(v.says).toContain('did not ask')
    expect(v.says).toContain('filter')
  })

  it('refuses the whole import rather than the bad rows, so a bought list cannot be laundered by mixing', () => {
    const mixed = [
      ...bought.slice(0, 20),
      {
        email: 'real@firm.com', source: 'EVENT',
        asked: 'Come and show me the tenure ledger',
        consentAt: at('2026-08-01T09:00:00Z'),
        whereTheyAsked: 'HR Tech, booth 214 — she wrote it on the back of a card',
      },
    ]
    const v = reviewImport(mixed)
    expect(v.refused).toBe(true)
    expect(v.accepted).toBeNull()
    expect(v.consented).toBe(1)
  })

  it('accepts an import where every single person asked, and says who they are', () => {
    const real = [
      {
        email: 'asha@terumo.example', source: 'EVENT',
        asked: 'Send me whatever you have on tenure across suppliers',
        consentAt: at('2026-08-01T09:00:00Z'),
        whereTheyAsked: 'HR Tech, booth 214',
      },
      {
        email: 'dan@brightmoor.example', source: 'REFERRAL',
        asked: 'Priya said to email you',
        consentAt: at('2026-08-02T09:00:00Z'),
        whereTheyAsked: 'introduced by Priya at Brightmoor',
      },
    ]
    const v = reviewImport(real)
    expect(v.refused).toBe(false)
    expect(v.accepted).toHaveLength(2)
  })

  it('refuses an empty import rather than reporting a clean one', () => {
    const v = reviewImport([])
    expect(v.refused).toBe(true)
    expect(v.accepted).toBeNull()
  })
})

// ── Once they are a customer ────────────────────────────────────────

describe('Nobody keeps courting a customer', () => {

  const lead: OnFile = {
    id: 'lead_1', email: 'ravi@cloudepa.com', asked: 'How does tenure work?',
    consentAt: at('2026-06-01T09:00:00Z'), convertedAt: null,
  }

  it('marks a lead as converted on the day their company was created', () => {
    const v = conversion(lead, 'co_cloudepa', at('2026-08-10T09:00:00Z'))
    expect(v.update).toEqual({ convertedCompanyId: 'co_cloudepa', convertedAt: at('2026-08-10T09:00:00Z') })
  })

  it('keeps the first conversion date when somebody converts a lead twice', () => {
    const already = { ...lead, convertedAt: at('2026-07-01T09:00:00Z'), convertedCompanyId: 'co_cloudepa' }
    const v = conversion(already, 'co_cloudepa', at('2026-08-10T09:00:00Z'))
    expect(v.update).toBeNull()
    expect(v.says).toContain('1 Jul 2026')
  })

  it('leaves a converted customer out of the list of people still waiting to hear back', () => {
    const waiting = stillWaiting([
      lead,
      { ...lead, id: 'lead_2', email: 'x@y.com', convertedAt: at('2026-07-01T09:00:00Z') },
    ])
    expect(waiting.map((l) => l.id)).toEqual(['lead_1'])
  })

  it('puts the person who has waited longest at the top of that list', () => {
    const waiting = stillWaiting([
      { ...lead, id: 'newer', consentAt: at('2026-08-01T09:00:00Z') },
      { ...lead, id: 'older', consentAt: at('2026-02-01T09:00:00Z') },
    ])
    expect(waiting.map((l) => l.id)).toEqual(['older', 'newer'])
  })
})

// ── Whose list it is ────────────────────────────────────────────────

describe('The list of people who wrote to us is ours, not a tenant’s', () => {

  const staff = { domains: ['etyme.com'], emails: ['smadavaram@gmail.com'] }

  it('lets somebody on our own domain read who has asked', () => {
    expect(mayReadTheList('sri@etyme.com', staff).ok).toBe(true)
  })

  it('lets a named person on another address read it, because founders use personal email', () => {
    expect(mayReadTheList('SMadavaram@gmail.com', staff).ok).toBe(true)
  })

  it('refuses a signed-in customer, and says the people on the list are their competitors', () => {
    const v = mayReadTheList('ravi@cloudepa.com', staff)
    expect(v.ok).toBe(false)
    expect(v.says).toContain('competitors')
  })

  it('refuses somebody who is not signed in at all', () => {
    expect(mayReadTheList(null, staff).ok).toBe(false)
  })
})

// ── What the page promises ──────────────────────────────────────────

const PAGE = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')
const FORM = readFileSync(join(process.cwd(), 'src/app/site/ask.tsx'), 'utf8')
const COPY = Object.values(ASK_COPY).join(' ')

describe('The home page asks a question rather than harvesting an address', () => {

  it('asks for an email and for what they need, and nothing else', () => {
    expect(PAGE).toContain('<Ask')
    expect(COPY.toLowerCase()).toContain('what do you need')
  })

  it('promises a person reads it, which is a promise we can keep', () => {
    expect(COPY.toLowerCase()).toContain('a person reads')
  })

  it('never says subscribe, newsletter, or updates', () => {
    for (const word of ['subscribe', 'newsletter', 'sign up for updates', 'stay in the loop', 'drip']) {
      expect(`${COPY} ${FORM}`.toLowerCase(), word).not.toContain(word)
    }
  })

  it('says what will not happen to the address, because everybody assumes the worst', () => {
    expect(COPY.toLowerCase()).toContain('sequence')
  })

  it('carries no price, because the price is decided elsewhere and no agent invents one', () => {
    // Free until five real vendors, recorded in CLAUDE.md. A number on a
    // capture form is a number somebody would have to take back.
    for (const money of ['$', 'per seat', 'per user', 'per month', 'pricing', 'plan', '/mo']) {
      expect(COPY.toLowerCase(), money).not.toContain(money)
    }
  })

  it('keeps the hidden field out of a screen reader as well as out of sight', () => {
    // A honeypot a blind person fills in is a honeypot that refuses a
    // blind person.
    expect(FORM).toContain('aria-hidden')
    expect(FORM).toContain('tabIndex={-1}')
  })

  it('says nothing that would fail the rules the rest of the page is held to', () => {
    // The words live in the library so a test can read them, which means
    // they are not in the source the positioning guard scans. Checked
    // here instead, against the same rules.
    const rules = check({ hero: [ASK_COPY.heading], body: Object.values(ASK_COPY) }).map((f) => f.rule)
    expect(rules).not.toContain('neutrality')
    expect(rules).not.toContain('never-lead-with-ai')
    expect(rules).not.toContain('horizontal-not-vertical')
  })

  it('says what happens next without inventing a time nobody has measured', () => {
    for (const promise of ['within 24 hours', 'same day', 'immediately', 'instantly']) {
      expect(COPY.toLowerCase(), promise).not.toContain(promise)
    }
  })
})
