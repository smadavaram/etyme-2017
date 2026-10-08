import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mayAskForDocuments, packetsForKind } from '@/lib/packets'
import { emptyRequestsSays } from '@/app/dashboard/packets/words'
import { rolesFor } from '@/lib/company-defaults'
import { sectionForReader } from '@/lib/page-framing'

/**
 * Document requests was a dead end for a client's compliance officer
 * (tester, 2026-09-30): an empty page explaining what a "packet" is, no
 * button, and "Operate" over a page that sits under Governance.
 */
describe('who may send a document request', () => {
  it('lets a client’s compliance officer ask a supplier for its papers', () => {
    const officer = rolesFor('CLIENT').find((r) => r.name === 'Compliance Officer')!
    expect(officer, 'the client ships a compliance officer').toBeTruthy()
    expect(mayAskForDocuments(officer.permissions as readonly string[])).toBe(true)
  })

  it('does not let a seat that only reads the rules write to a supplier', () => {
    expect(mayAskForDocuments(['governance.read'])).toBe(false)
  })

  it('still lets the desks that manage suppliers or people ask, as before', () => {
    expect(mayAskForDocuments(['vendors.manage'])).toBe(true)
    expect(mayAskForDocuments(['consultants.write'])).toBe(true)
  })
})

describe('what a client is offered to ask for', () => {
  it('offers a client only the sets about a supplier firm, never a contractor’s own documents', () => {
    const { offered, notOffered } = packetsForKind('CLIENT')
    expect(offered.length).toBeGreaterThan(0)
    expect(offered.every((p) => p.subject === 'COMPANY')).toBe(true)
    expect(notOffered.length).toBeGreaterThan(0)
  })

  it('says whose the sets it does not offer are, rather than leaving them missing', () => {
    expect(packetsForKind('CLIENT').notOffered[0].why).toContain('The firm that employs the person asks for these')
  })

  it('offers a supplier every set, as before', () => {
    expect(packetsForKind('VENDOR').notOffered).toHaveLength(0)
  })
})

describe('the Document requests page', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/dashboard/packets/page.tsx'), 'utf8')

  it('sits under Governance, where the menu puts it', () => {
    // The heading is read off the reader's own menu, never typed: a word
    // typed over the page is how it once read "Operate".
    expect(page).toContain("usePageSection('/dashboard/packets')")
    expect(page).not.toMatch(/className="eyebrow">\s*(Governance|Operate|Compliance)\s*</)
    // A client's compliance officer — the desk the tester walked as —
    // reads Governance, the section its menu files the page under.
    const officer = rolesFor('CLIENT').find((r) => r.name === 'Compliance Officer')!
    const asClient = sectionForReader(
      { companyKind: 'CLIENT', permissions: officer.permissions as readonly string[] }, '/dashboard/packets')
    expect(asClient).toBe('Governance')
    // A supplier's menu puts it under its Compliance heading, and the page
    // says so rather than a section that menu does not print over it.
    expect(sectionForReader({ companyKind: 'VENDOR' }, '/dashboard/packets')).toBe('Compliance')
  })

  it('offers a Request documents button when nothing has been asked yet, rather than an explanation', () => {
    expect(emptyRequestsSays(true)).not.toMatch(/packet/i)
    expect(page).toContain('Request documents')
  })

  it('tells a seat that cannot send which desks can', () => {
    expect(emptyRequestsSays(false)).toContain('The compliance desk, or a desk that manages suppliers or people, can.')
  })
})
