import { describe, it, expect } from 'vitest'
import {
  readSupplierList, readOne, readNames, companyDomain, nameFromDomain,
  splitLines, listSentence, mayClaim,
  mayBeSentJob, mayBePutForwardTo, offeredToSendOn, supplierDomain, pastedName,
  addButtonSays, PASTED_CONTACT_KIND, lastEngagementOf, NO_WORK_YET_SAYS, namesTold, pasteLogSays,
} from '@/lib/supplier-list'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * A client running contract staff already has twelve suppliers and an
 * MSA with each. Etyme is worth nothing to them until those suppliers
 * are reachable inside it — and asking each vendor to sign up first is
 * asking the client to do our selling for us, one phone call at a time.
 *
 * So they paste the list they already have. These tests are about the
 * shapes that list actually arrives in.
 */

describe('the shapes a vendor list arrives in', () => {
  it('reads a spreadsheet row: company, contact, address', () => {
    const r = readOne('Tecwyn, Ravi Menon, ravi@tecwyn.example', 'ravi@tecwyn.example')
    expect(r.company).toBe('Tecwyn')
    expect(r.contactName).toBe('Ravi Menon')
    expect(r.domain).toBe('tecwyn.example')
  })

  it('reads a signature block, where the person comes first', () => {
    // The order is not fixed, so the legal suffix settles it.
    const r = readOne('Priya Sharma | Veritan Talent Ltd | priya@vertextalent.io', 'priya@vertextalent.io')
    expect(r.company).toBe('Veritan Talent Ltd')
    expect(r.contactName).toBe('Priya Sharma')
  })

  it('reads an Outlook address, where the name is in angle brackets', () => {
    const r = readOne('Brightmoor Staffing <hello@brightmoor.co.uk>', 'hello@brightmoor.co.uk')
    expect(r.company).toBe('Brightmoor Staffing')
  })

  it('falls back to the domain when the line is nothing but an address', () => {
    const r = readOne('accounts@kestrel-consulting.com', 'accounts@kestrel-consulting.com')
    expect(r.company).toBe('Kestrel Consulting')
    expect(r.needs).toEqual([])
  })

  it('treats a lone person’s name as the contact, not the firm, when the domain names the firm', () => {
    const r = readOne('Ravi Menon ravi@tecwyn.example', 'ravi@tecwyn.example')
    expect(r.company).toBe('Tecwyn')
    expect(r.contactName).toBe('Ravi Menon')
  })
})

describe('what it refuses to guess', () => {
  it('will not invent a company from a gmail address', () => {
    // A supplier record called "Ravi Menon" that turns out to be
    // Tecwyn is a mess somebody unpicks by hand later.
    const r = readOne('ravi.menon@gmail.com', 'ravi.menon@gmail.com')
    expect(r.company).toBeNull()
    expect(r.domain).toBeNull()
    expect(r.needs).toEqual(['Personal address — say which firm this is.'])
  })

  it('still takes a personal address when the paste said which firm', () => {
    const r = readOne('Tecwyn, ravi.menon@gmail.com', 'ravi.menon@gmail.com')
    expect(r.company).toBe('Tecwyn')
    expect(r.domain).toBeNull()
    expect(r.needs).toEqual([])
  })

  it('knows the consumer providers apart from a company domain', () => {
    expect(companyDomain('a@yahoo.co.uk')).toBeNull()
    expect(companyDomain('a@outlook.com')).toBeNull()
    expect(companyDomain('a@tecwyn.example')).toBe('tecwyn.example')
  })
})

describe('a name out of a domain', () => {
  it('capitalizes it', () => {
    expect(nameFromDomain('tecwyn.example')).toBe('Tecwyn')
  })

  it('splits a hyphenated one into words', () => {
    expect(nameFromDomain('veritan-talent.example')).toBe('Veritan Talent')
  })
})

describe('splitting the paste', () => {
  it('takes one address per line', () => {
    expect(splitLines('a@x.com\nb@y.com\n\nc@z.com')).toHaveLength(3)
  })

  it('splits an Outlook To: field that arrived as one semicolon-separated string', () => {
    // Otherwise the whole distribution list reads as one supplier with a
    // very strange name.
    const lines = splitLines('a@x.com; b@y.com; c@z.com')
    expect(lines).toHaveLength(3)
  })

  it('leaves a single semicolon alone, because that is punctuation', () => {
    expect(splitLines('Tecwyn; ravi@tecwyn.example')).toHaveLength(1)
  })
})

describe('a whole pasted list', () => {
  const paste = `
Supplier contacts — Q3
Tecwyn, Ravi Menon, ravi@tecwyn.example
Veritan Talent Ltd, Priya Sharma, priya@vertextalent.io
Veritan Talent Ltd, Dan Okoro, dan@vertextalent.io
Brightmoor Staffing <hello@brightmoor.co.uk>
ravi@tecwyn.example
some note to self
`

  it('counts firms, not addresses, because that is what a client means by suppliers', () => {
    const r = readSupplierList(paste)
    expect(listSentence(r)).toBe(
      '3 suppliers, 4 contacts, 1 repeated, 2 lines with no address.'
    )
  })

  it('keeps two contacts at one firm as two rows', () => {
    const r = readSupplierList(paste)
    expect(r.rows.filter((x) => x.domain === 'vertextalent.io')).toHaveLength(2)
  })

  it('collapses an address pasted twice', () => {
    expect(readSupplierList(paste).duplicates).toBe(1)
  })

  it('reports the lines it could not use rather than swallowing them', () => {
    // A client who pasted forty lines and got twelve suppliers back needs
    // to know where the rest went.
    const r = readSupplierList(paste)
    expect(r.skipped).toEqual(['Supplier contacts — Q3', 'some note to self'])
  })

  it('keeps the original line on every row, so a better reader can be run later', () => {
    const r = readSupplierList(paste)
    expect(r.rows[0].line).toBe('Tecwyn, Ravi Menon, ravi@tecwyn.example')
  })

  it('says plainly when there was nothing in the paste at all', () => {
    expect(listSentence(readSupplierList('just some words'))).toBe(
      'No email addresses in that. Paste a list with one address per line.'
    )
  })

  it('names how many still need a company before anything can be sent', () => {
    const r = readSupplierList('ravi@gmail.com\nsam@yahoo.com\nhello@tecwyn.example')
    expect(listSentence(r)).toMatch(/2 need a company name before you can send\./)
  })
})

describe('working out which field is the firm', () => {
  it('uses the legal suffix where there is one', () => {
    expect(readNames('Ravi Menon\tTecwyn', 'tecwyn.example').company).toBe('Tecwyn')
  })

  it('uses the domain where there is no suffix', () => {
    expect(readNames('Ravi Menon\tTecwyn', 'tecwyn.example').company).toBe('Tecwyn')
  })

  it('takes the first field when neither settles it, because that is how lists are written', () => {
    const n = readNames('Northwind Medical\tDana Whitfield', 'nwm-group.com')
    expect(n.company).toBe('Northwind Medical')
    expect(n.contactName).toBe('Dana Whitfield')
  })
})

describe('who may take possession of a listed supplier', () => {
  it('lets the address that was invited', () => {
    expect(mayClaim('ravi@tecwyn.example', 'ravi@tecwyn.example')).toBe(true)
  })

  it('lets a colleague on the same corporate domain, because that is the ordinary case', () => {
    expect(mayClaim('priya@tecwyn.example', 'ravi@tecwyn.example')).toBe(true)
  })

  it('refuses a stranger holding a forwarded link', () => {
    // A token that hands somebody a company — with its client
    // relationships and its rates — is a door with the key taped to it.
    expect(mayClaim('someone@vertextalent.io', 'ravi@tecwyn.example')).toBe(false)
  })

  it('refuses two consumer addresses, because they are not colleagues', () => {
    expect(mayClaim('a@gmail.com', 'b@gmail.com')).toBe(false)
  })

  it('ignores case and stray spaces, because people paste addresses', () => {
    expect(mayClaim('  Ravi@Tecwyn.Example ', 'ravi@tecwyn.example')).toBe(true)
  })
})

describe('a company on the Companies list that nobody has classified yet', () => {
  const record = { name: 'Corrigan Search Partners', kind: 'UNCLASSIFIED' }

  it('a job is never sent to a company not classified yet until it is extended to Supplier, and the refusal says so', () => {
    expect(mayBeSentJob(record, [])).toEqual({
      ok: false,
      says: 'Corrigan Search Partners is on your Companies list and is not classified yet. Extend it to Supplier first.',
    })
    expect(mayBeSentJob(record, ['CLIENT'])).toMatchObject({ ok: false })
    expect(mayBeSentJob(record, ['SUPPLIER'])).toEqual({ ok: true })
  })

  it('a company of any other Kind is left to the rules that already decide who may be sent a job', () => {
    expect(mayBeSentJob({ name: 'Tecwyn', kind: 'VENDOR' }, [])).toEqual({ ok: true })
    expect(mayBeSentJob({ name: 'Tellisford', kind: 'GSI' }, [])).toEqual({ ok: true })
  })

  it('a person is never put forward to a company not classified yet until it is extended to Customer', () => {
    expect(mayBePutForwardTo(record, [])).toEqual({
      ok: false,
      says: 'Corrigan Search Partners is on your Companies list and is not classified yet. Extend it to Customer first.',
    })
    expect(mayBePutForwardTo(record, ['SUPPLIER'])).toMatchObject({ ok: false })
    expect(mayBePutForwardTo(record, ['CLIENT'])).toEqual({ ok: true })
  })

  it('a pasted or approved supplier is known by the domain typed for it, else by its contact\u2019s address, and a personal address gives it none', () => {
    expect(supplierDomain('northwind-staffing.example', 'desk@other.example')).toBe('northwind-staffing.example')
    expect(supplierDomain('https://www.Harborline-Tech.example/jobs', null)).toBe('harborline-tech.example')
    expect(supplierDomain(null, 'Lead@Saltmarsh-Eng.example')).toBe('saltmarsh-eng.example')
    expect(supplierDomain(null, 'someone@gmail.com')).toBeNull()
    expect(supplierDomain('gmail.com', 'desk@northwind-staffing.example')).toBeNull()
    expect(supplierDomain(null, null)).toBeNull()
  })

  it('a pasted row is saved only under the company name the person saw, and is never given one made from its domain', () => {
    expect(pastedName({ company: '  Northwind   Staffing ' })).toBe('Northwind Staffing')
    expect(pastedName({ company: null })).toBeNull()
    expect(pastedName({ company: '   ' })).toBeNull()
    expect(pastedName({})).toBeNull()
  })

  it('the send-on picker never offers a company not classified yet', () => {
    expect(offeredToSendOn({ notClassified: true })).toBe(false)
    expect(offeredToSendOn({ notClassified: false })).toBe(true)
    expect(offeredToSendOn({})).toBe(true)
  })
})

describe('what the supplier paste and the Suppliers list say are true (walk, 2026-11-15)', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/dashboard/suppliers/page.tsx'), 'utf8')
  const route = readFileSync(join(process.cwd(), 'src/app/api/suppliers/route.ts'), 'utf8')

  it("the paste's button counts the suppliers it adds, not the contacts", () => {
    const rows = [
      { company: 'Harborline Tech', email: 'mara@harborline-tech.example', domain: 'harborline-tech.example' },
      { company: 'Harborline Tech', email: 'ops@harborline-tech.example', domain: 'harborline-tech.example' },
    ]
    expect(addButtonSays(rows)).toBe('Add 1 supplier')
    expect(addButtonSays([...rows, { company: 'Quillmark Talent', email: 'rhea@quillmark.example', domain: 'quillmark.example' }])).toBe('Add 2 suppliers')
    expect(page).toContain("{busy ? 'Adding…' : addButtonSays(rows)}")
    expect(page).not.toMatch(/'contact' : 'contacts'/)
  })

  it('the preview of a paste is drawn inside the import panel, under the paste box, not at the top of the page', () => {
    const panel = page.indexOf('Import the suppliers you already have')
    expect(panel).toBeGreaterThan(0)
    expect(page.indexOf("{/* ── What it made of the paste")).toBeGreaterThan(panel)
    expect(page.indexOf('{pasteSaid && (')).toBeGreaterThan(panel)
  })

  it('a pasted contact is saved under the neutral role, never guessed as Recruiting', () => {
    expect(PASTED_CONTACT_KIND).toBe('OTHER')
    expect(route).toContain('kind: PASTED_CONTACT_KIND')
    expect(route).not.toContain("kind: 'RECRUITING'")
  })

  it('an invitation or a paste is not an engagement: a firm with no work reads none yet', () => {
    const now = new Date('2026-11-15T12:00:00Z')
    expect(lastEngagementOf(0, [null, undefined], now)).toBeNull()
    expect(NO_WORK_YET_SAYS).toBe('No submissions, orders or placements yet.')
    expect(page).toContain('NO_WORK_YET_SAYS')
  })

  it('the latest submission, order or placement that has happened is the last engagement, and people on site make it today', () => {
    const now = new Date('2026-11-15T12:00:00Z')
    const sub = new Date('2026-10-01T00:00:00Z')
    const order = new Date('2026-10-20T00:00:00Z')
    const future = new Date('2026-12-01T00:00:00Z')
    expect(lastEngagementOf(0, [sub, order, future], now)).toBe(order.toISOString())
    expect(lastEngagementOf(2, [sub], now)).toBe(now.toISOString())
  })

  it('an unsigned agreement record never reads as approved by agreement or as an agreement on file', () => {
    expect(page).toContain("{signed(s) ? 'Approved by agreement' : 'Not rated'}")
    expect(page).toContain('const signed = (s: Supplier): boolean => s.agreement && !!s.signedAt')
    expect(page).not.toMatch(/s\.agreement \? 'Approved by agreement'/)
  })

  it('two suppliers of one name are told apart by their domain, and a name nobody shares is left alone', () => {
    const told = namesTold([
      { companyId: 'a', name: 'Harborline Tech', domain: 'harborline-tech.example' },
      { companyId: 'b', name: 'harborline tech', domain: 'quillmark.example' },
      { companyId: 'c', name: 'Harborline Tech', domain: null },
      { companyId: 'd', name: 'Veritan Talent', domain: 'veritantalent.example' },
    ])
    expect(told.get('a')).toBe('Harborline Tech (harborline-tech.example)')
    expect(told.get('b')).toBe('harborline tech (quillmark.example)')
    expect(told.get('c')).toBe('Harborline Tech (no domain yet)')
    expect(told.get('d')).toBe('Veritan Talent')
    for (const f of ['src/app/dashboard/requisitions/page.tsx', 'src/app/dashboard/requisitions/[id]/page.tsx', 'src/app/dashboard/requirements/[id]/page.tsx']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).toContain('s.shownAs ?? s.name')
    }
  })

  it('the refusal for a company not classified yet links to Companies, where its kind is set', () => {
    expect(page).toContain("r?.code === 'NOT_CLASSIFIED'")
    // To the company's own row where it is on the paster's list, else to the list (2026-11-15).
    expect(page).toContain("<Link href={(k.companyId ? companyOpenHref(k.companyId) : '/dashboard/companies') as Route}")
  })

  it('the Activity log row for a paste names who pasted how many suppliers and contacts, and that the invitations were emailed', () => {
    const r = pasteLogSays({ by: 'Avery Hart', suppliers: 2, contacts: 3, invitations: 3, emailed: 3, mailCanLeave: true })
    expect(r.summary).toBe('Avery Hart pasted 2 suppliers and 3 new contacts onto Suppliers')
    expect(r.reason).toBe('Pasted by hand on Suppliers. 3 invitations were emailed.')
  })

  it('the Activity log never says an invitation was emailed where no email can leave', () => {
    const r = pasteLogSays({ by: 'Avery Hart', suppliers: 1, contacts: 1, invitations: 1, emailed: 0, mailCanLeave: false })
    expect(r.reason).toBe('Pasted by hand on Suppliers. 1 invitation was made and not emailed: no email can be sent from here yet.')
    expect(pasteLogSays({ by: 'A', suppliers: 1, contacts: 0, invitations: 0, emailed: 0, mailCanLeave: true }).reason)
      .toBe('Pasted by hand on Suppliers. No invitation was sent: each address had one already.')
    expect(pasteLogSays({ by: 'A', suppliers: 2, contacts: 2, invitations: 2, emailed: 1, mailCanLeave: true }).reason)
      .toBe('Pasted by hand on Suppliers. 1 of 2 invitations were emailed; the others could not be sent.')
    expect(route).toContain('mailCanLeave: mailLeaves()')
  })
})
