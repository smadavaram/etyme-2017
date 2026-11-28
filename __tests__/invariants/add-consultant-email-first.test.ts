/**
 * Add consultant, after the fix list of 2026-11-14 (A4): the email is the
 * identifier, so it comes early; a person the firm already keeps is said
 * beside the Email box before the rest is typed, from the firm's own list
 * only; and the pay boxes are the last thing on the form, under one line
 * that says they are optional.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { alreadyKept, type KeptRow } from '@/lib/consultant-portfolio/already-kept'
import { addPath, addRefusalSays } from '@/lib/consultant-portfolio'
import { readAddConsultant } from '@/lib/consultant-portfolio/forms'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = read('src/app/dashboard/consultants/page.tsx')
const MODAL = PAGE.slice(PAGE.indexOf('function AddConsultantModal'), PAGE.indexOf('// ── Consultant Detail Drawer'))
const KEPT_SRC = read('src/lib/consultant-portfolio/already-kept.ts')

const row = (over: Partial<KeptRow> & { consent?: string | null }): KeptRow => ({
  id: 'c1',
  name: 'Mara Quill',
  email: 'mara.quill@northwind-staffing.example',
  standing: over.consent === 'INVITED' ? 'ASKED' : null,
  listings: over.consent === undefined || over.consent === null ? [] : [{ id: 'l1', consent: over.consent }],
  ...over,
})

describe('Add consultant asks for the name and the email before anything else', () => {
  it('the boxes read Full name, then Email, then everything else', () => {
    const name = MODAL.indexOf('Full name *')
    const email = MODAL.indexOf('Email *')
    expect(name).toBeGreaterThan(-1)
    expect(email).toBeGreaterThan(name)
    for (const later of ['>Headline<', 'id="add-skills"', '>Location<', '>Work authorization<', 'id="add-notes"', 'id="add-tier"', 'id="add-terms-type"']) {
      expect(MODAL.indexOf(later), later).toBeGreaterThan(email)
    }
  })

  it('name and email are stacked one above the other at every width, so they never read as first and last name', () => {
    const block = MODAL.slice(MODAL.indexOf('Full name *') - 1200, MODAL.indexOf('Full name *'))
    expect(block).toContain('<div className="space-y-4">')
    expect(block).not.toContain('sm:grid-cols-2')
  })
})

describe('somebody this firm already keeps is said beside the Email box before saving', () => {
  it('an email already on the firm’s bench is flagged before saving, with a way to open her record, and the save asks nobody', () => {
    const m = alreadyKept('mara.quill@northwind-staffing.example', [row({ consent: 'GRANTED' })], true)
    expect(m?.blocks).toBe(true)
    expect(m?.says).toBe('Mara Quill is already on your bench. Nothing needs adding.')
    expect(m?.act).toBe('OPEN')
    expect(m?.actWords).toBe('Open Mara Quill’s record')
    // A blocking match is a refusal at the press, beside the box.
    expect(MODAL).toContain('} else if (match?.blocks) {')
    expect(MODAL).toContain('p.email = match.says')
  })

  it('an email already asked and not answered offers to send the invitation again, by the row’s own Resend', () => {
    const m = alreadyKept('mara.quill@northwind-staffing.example', [row({ consent: 'INVITED' })], true)
    expect(m?.blocks).toBe(true)
    expect(m?.says).toBe('You already asked Mara Quill and are waiting on the answer. Send the invitation again instead.')
    expect(m?.act).toBe('RESEND')
    expect(m?.listingId).toBe('l1')
    expect(m?.actWords).toBe('Send the invitation again')
    expect(PAGE).toContain('onResend={(row, listingId) => { void resend(row, listingId) }}')
  })

  it('a seat that may not send it again is told the invitation is waiting and is offered the record, never a button that fails', () => {
    const m = alreadyKept('mara.quill@northwind-staffing.example', [row({ consent: 'INVITED' })], false)
    expect(m?.act).toBe('OPEN')
    expect(m?.says).toBe('You already asked Mara Quill and are waiting on the answer. Nothing new needs sending.')
  })

  it('an email that said no to the firm’s bench is flagged before saving and says only she can change it', () => {
    const m = alreadyKept('mara.quill@northwind-staffing.example', [row({ consent: 'DECLINED' })], true)
    expect(m?.blocks).toBe(true)
    expect(m?.says).toBe('Mara Quill said no to your bench. Only Mara Quill can change that, from their own page.')
  })

  it('somebody on the firm’s list with no listing here is told she is asked on that same record, and the save goes ahead', () => {
    const m = alreadyKept('mara.quill@northwind-staffing.example', [row({ consent: null })], true)
    expect(m?.blocks).toBe(false)
    expect(m?.says).toBe('Mara Quill is already on your Candidates list. Saving asks them onto your bench on that same record, not a new one.')
  })

  it('the form stops before the press on exactly the three cases the route itself refuses', () => {
    const cases: [string | null, boolean][] = [['GRANTED', true], ['INVITED', true], ['DECLINED', true], [null, false]]
    for (const [consent, blocks] of cases) {
      const m = alreadyKept('mara.quill@northwind-staffing.example', [row({ consent })], true)
      const path = addPath({ profileExists: true, listing: consent ? { state: consent, revokedAt: null } : null })
      expect(m?.blocks, String(consent)).toBe(blocks)
      expect(addRefusalSays(path, 'Mara Quill', 'Northwind Staffing') != null, String(consent)).toBe(blocks)
    }
  })

  it('an address matches whatever its case or spaces, and nothing is said until the address is whole', () => {
    expect(alreadyKept('  Mara.Quill@Northwind-Staffing.EXAMPLE ', [row({ consent: 'GRANTED' })], true)?.blocks).toBe(true)
    expect(alreadyKept('mara.quill@northwind', [row({ consent: 'GRANTED' })], true)).toBeNull()
    expect(alreadyKept('', [row({ consent: 'GRANTED' })], true)).toBeNull()
  })

  it('the check reads only the firm’s own list, and says nothing at all about an address that is not on it', () => {
    expect(alreadyKept('tomas.reyes@harborline-tech.example', [row({ consent: 'GRANTED' })], true)).toBeNull()
    // No lookup: the rows are the page's own list, handed in.
    expect(KEPT_SRC).not.toContain('fetch(')
    expect(KEPT_SRC).not.toContain('prisma')
    expect(PAGE).toContain('kept={consultants}')
    // Never a sentence about an account on Etyme, before the save.
    for (const consent of ['GRANTED', 'INVITED', 'DECLINED', null]) {
      for (const may of [true, false]) {
        const m = alreadyKept('mara.quill@northwind-staffing.example', [row({ consent })], may)
        expect(`${m?.says} ${m?.actWords}`).not.toMatch(/account|Etyme/)
      }
    }
  })
})

describe('the pay boxes are the last thing on Add consultant', () => {
  it('the pay boxes come after every other box, under one line that says they are optional and that she agrees them by saying yes', () => {
    const line = 'If you fill these in, they see them when they are asked and agree them by saying yes.'
    expect(MODAL.split(line).length - 1).toBe(1)
    const heading = MODAL.indexOf('Pay terms (optional)')
    expect(heading).toBeGreaterThan(MODAL.indexOf('id="add-rate-max"'))
    expect(MODAL.indexOf(line)).toBeGreaterThan(heading)
    expect(MODAL.indexOf('id="add-terms-type"')).toBeGreaterThan(MODAL.indexOf(line))
    expect(MODAL.indexOf('id="add-terms-currency"')).toBeLessThan(MODAL.indexOf('savingSays(form.name, mailOn)}'))
    // No input sits after the pay boxes.
    const after = MODAL.slice(MODAL.indexOf('id="add-terms-currency"'), MODAL.indexOf('<button type="submit"'))
    expect(after).not.toContain('<input')
    expect(after).not.toContain('<textarea')
  })
})

describe('no example in a box shows a real-looking person, company or address', () => {
  it('the name and email examples on Add consultant name nobody and use a reserved domain', () => {
    expect(MODAL).toContain('placeholder="First and last name"')
    expect(MODAL).toContain('placeholder="name@company.example"')
    expect(MODAL).toContain('like name@company.example.')
    expect(MODAL).not.toMatch(/jane|acme|Dallas/i)
  })

  it('a worker’s own headline and license boxes name no real company or licensing board', () => {
    expect(read('src/app/dashboard/my-page/page.tsx')).not.toContain('placeholder="SAP')
    expect(read('src/app/dashboard/my-work/papers.tsx')).not.toContain('placeholder="Wisconsin')
  })
})

describe('the form asks for what the route requires', () => {
  it('Add consultant still refuses without a name and a valid email, the two boxes the route requires, each in a sentence beside its box', () => {
    expect(readAddConsultant({ email: 'mara.quill@northwind-staffing.example' })).toMatchObject({ ok: false, field: 'name' })
    expect(readAddConsultant({ name: 'Mara Quill', email: 'mara' })).toMatchObject({ ok: false, field: 'email' })
    expect(MODAL).toContain("p.name = 'A name, so somebody can be told who this is about.'")
    expect(MODAL).toContain("p.email = 'An email — this is how they are invited and how they sign in.'")
    expect(MODAL).toContain('{fieldErrors.name}')
    expect(MODAL).toContain('{fieldErrors.email}')
  })
})

describe('Add consultant at phone width', () => {
  it('somebody the firm already keeps greys Add and ask them, with the reason said right above the button', () => {
    // A press that did nothing and said nothing new (press walk l3a, 2026-11-15).
    expect(MODAL).toContain('disabled={submitting || !!match?.blocks}')
    const says = MODAL.indexOf('<p id="add-blocked-says"')
    const button = MODAL.indexOf("{submitting ? 'Adding…' : form.ownEmployee ? 'Add employee' : 'Add and ask them'}")
    expect(says).toBeGreaterThan(-1)
    expect(says).toBeLessThan(button)
    expect(MODAL.slice(says, says + 120)).toContain('{match.says}')
    expect(MODAL).toContain("aria-describedby={match?.blocks ? 'add-blocked-says' : undefined}")
  })

  it('the form scrolls inside its box, so the pay boxes and Add and ask them are reachable on a phone', () => {
    expect(MODAL).toContain('card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto')
  })
})
