import { describe, it, expect } from 'vitest'
import {
  readSupplierList, readOne, readNames, companyDomain, nameFromDomain,
  splitLines, listSentence, mayClaim,
} from '@/lib/supplier-list'

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
    const r = readOne('Cloudepa Systems, Ravi Menon, ravi@cloudepa.com', 'ravi@cloudepa.com')
    expect(r.company).toBe('Cloudepa Systems')
    expect(r.contactName).toBe('Ravi Menon')
    expect(r.domain).toBe('cloudepa.com')
  })

  it('reads a signature block, where the person comes first', () => {
    // The order is not fixed, so the legal suffix settles it.
    const r = readOne('Priya Sharma | Vertex Talent Ltd | priya@vertextalent.io', 'priya@vertextalent.io')
    expect(r.company).toBe('Vertex Talent Ltd')
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
    const r = readOne('Ravi Menon ravi@cloudepa.com', 'ravi@cloudepa.com')
    expect(r.company).toBe('Cloudepa')
    expect(r.contactName).toBe('Ravi Menon')
  })
})

describe('what it refuses to guess', () => {
  it('will not invent a company from a gmail address', () => {
    // A supplier record called "Ravi Menon" that turns out to be
    // Cloudepa Systems is a mess somebody unpicks by hand later.
    const r = readOne('ravi.menon@gmail.com', 'ravi.menon@gmail.com')
    expect(r.company).toBeNull()
    expect(r.domain).toBeNull()
    expect(r.needs).toEqual(['Personal address — say which firm this is.'])
  })

  it('still takes a personal address when the paste said which firm', () => {
    const r = readOne('Cloudepa Systems, ravi.menon@gmail.com', 'ravi.menon@gmail.com')
    expect(r.company).toBe('Cloudepa Systems')
    expect(r.domain).toBeNull()
    expect(r.needs).toEqual([])
  })

  it('knows the consumer providers apart from a company domain', () => {
    expect(companyDomain('a@yahoo.co.uk')).toBeNull()
    expect(companyDomain('a@outlook.com')).toBeNull()
    expect(companyDomain('a@cloudepa.com')).toBe('cloudepa.com')
  })
})

describe('a name out of a domain', () => {
  it('capitalises it', () => {
    expect(nameFromDomain('cloudepa.com')).toBe('Cloudepa')
  })

  it('splits a hyphenated one into words', () => {
    expect(nameFromDomain('vertex-talent.io')).toBe('Vertex Talent')
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
    expect(splitLines('Cloudepa Systems; ravi@cloudepa.com')).toHaveLength(1)
  })
})

describe('a whole pasted list', () => {
  const paste = `
Supplier contacts — Q3
Cloudepa Systems, Ravi Menon, ravi@cloudepa.com
Vertex Talent Ltd, Priya Sharma, priya@vertextalent.io
Vertex Talent Ltd, Dan Okoro, dan@vertextalent.io
Brightmoor Staffing <hello@brightmoor.co.uk>
ravi@cloudepa.com
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
    expect(r.rows[0].line).toBe('Cloudepa Systems, Ravi Menon, ravi@cloudepa.com')
  })

  it('says plainly when there was nothing in the paste at all', () => {
    expect(listSentence(readSupplierList('just some words'))).toBe(
      'No email addresses in that. Paste a list with one address per line.'
    )
  })

  it('names how many still need a company before anything can be sent', () => {
    const r = readSupplierList('ravi@gmail.com\nsam@yahoo.com\nhello@cloudepa.com')
    expect(listSentence(r)).toMatch(/2 need a company name before you can send\./)
  })
})

describe('working out which field is the firm', () => {
  it('uses the legal suffix where there is one', () => {
    expect(readNames('Ravi Menon\tCloudepa Systems', 'cloudepa.com').company).toBe('Cloudepa Systems')
  })

  it('uses the domain where there is no suffix', () => {
    expect(readNames('Ravi Menon\tCloudepa', 'cloudepa.com').company).toBe('Cloudepa')
  })

  it('takes the first field when neither settles it, because that is how lists are written', () => {
    const n = readNames('Northwind Medical\tDana Whitfield', 'nwm-group.com')
    expect(n.company).toBe('Northwind Medical')
    expect(n.contactName).toBe('Dana Whitfield')
  })
})

describe('who may take possession of a listed supplier', () => {
  it('lets the address that was invited', () => {
    expect(mayClaim('ravi@cloudepa.com', 'ravi@cloudepa.com')).toBe(true)
  })

  it('lets a colleague on the same corporate domain, because that is the ordinary case', () => {
    expect(mayClaim('priya@cloudepa.com', 'ravi@cloudepa.com')).toBe(true)
  })

  it('refuses a stranger holding a forwarded link', () => {
    // A token that hands somebody a company — with its client
    // relationships and its rates — is a door with the key taped to it.
    expect(mayClaim('someone@vertextalent.io', 'ravi@cloudepa.com')).toBe(false)
  })

  it('refuses two consumer addresses, because they are not colleagues', () => {
    expect(mayClaim('a@gmail.com', 'b@gmail.com')).toBe(false)
  })

  it('ignores case and stray spaces, because people paste addresses', () => {
    expect(mayClaim('  Ravi@Cloudepa.com ', 'ravi@cloudepa.com')).toBe(true)
  })
})
