import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { complianceRefusal } from '@/lib/walls'
import { complianceSubtitle, complianceView } from '@/app/dashboard/compliance/says'
import { ComplianceRefused } from '@/app/dashboard/compliance/refused'
import { TenureRefused } from '@/app/dashboard/tenure/refused'
import { privacyView, privacyHeadline } from '@/app/dashboard/privacy/says'
import { mayTryAgain } from '@/app/dashboard/governance/says'
import { mayWorkBreach } from '@/lib/breach'
import { getNavForKind } from '@/lib/nav-table'
import { rolesFor } from '@/lib/company-defaults'
import { sectionForReader } from '@/lib/page-framing'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { documentSetDoor, SET_OPENED_FROM } from '@/app/dashboard/documents/requirements/says'

/**
 * The browser walk opened /dashboard/compliance as Karthik Menon, a
 * delivery engineer at Teleworld Solutions whose desk does not read it.
 * The refusal sentence was there — under a subtitle reading "verification
 * status at …. Every cleared", six figures reading 0 and five tabs. A
 * zero says "nothing on file". The truth was "not yours to see".
 */

const says = complianceRefusal('Teleworld Solutions', ['Owner'])

describe('a refused compliance page', () => {
  it('a refused compliance page shows the refusal and no figures', () => {
    const html = renderToStaticMarkup(createElement(ComplianceRefused, { says }))
    // Drawn by the shared refused state: the sentence, and no heading over
    // it, because a heading over a refusal reads as a page that loaded.
    expect(html).toContain('data-state="refused"')
    expect(html).not.toContain('<h1')
    expect(html).toContain('Ask the Owner desk at Teleworld Solutions')
    expect(html).not.toMatch(/>\s*0\s*</)
    expect(html).not.toMatch(/Clear rate|Total checks|Evaluations|Policies|Verifications|Classification|Visas/)
  })

  it('a refused compliance page has no subtitle with a gap where the company name should be', () => {
    const html = renderToStaticMarkup(createElement(ComplianceRefused, { says }))
    expect(html).not.toContain('…')
    expect(html).not.toContain('verification status at')
  })

  it('whenever the route refuses, the page is the refusal — whether or not it was still loading', () => {
    expect(complianceView({ loading: false, error: says, hasData: false })).toEqual({ show: 'refused', says })
    expect(complianceView({ loading: true, error: says, hasData: false })).toEqual({ show: 'refused', says })
  })

  it('no figure is drawn while the page is still loading', () => {
    expect(complianceView({ loading: true, error: null, hasData: false })).toEqual({ show: 'loading' })
    expect(complianceView({ loading: false, error: null, hasData: true })).toEqual({ show: 'page' })
  })

  it('the page returns the refusal before it computes a single figure', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/dashboard/compliance/page.tsx'), 'utf8')
    const refused = page.indexOf("if (view.show === 'refused') return <ComplianceRefused")
    const firstFigure = page.indexOf('const health =')
    expect(refused).toBeGreaterThan(-1)
    expect(firstFigure).toBeGreaterThan(refused)
  })
})

describe('the line under the heading', () => {
  it('names the company for a reader who may read the page', () => {
    expect(complianceSubtitle('Northbend Athletic')).toBe(
      'Governance policies, enforcement evaluations, and verification status at Northbend Athletic. ' +
        'Every cleared job request records the basis on which it cleared.'
    )
  })

  it('says the sentence without a gap when no company name is known yet', () => {
    const said = complianceSubtitle(null)
    expect(said).not.toContain('…')
    expect(said).not.toMatch(/ at \./)
    expect(said).not.toMatch(/\.\s*\./)
    expect(said).toContain('verification status. Every cleared job request')
  })
})

/**
 * Round four asked the same question of every page compliance shares a
 * desk with: when the route will not answer, does the page draw anything
 * beside the sentence? Three did — governance offered its team lenses,
 * search and window above the refusal; Paperwork drew "Requests 0" and a
 * form to ask with; the do-not-return list drew "All 0 · Active 0" and
 * "Add somebody". Access, the client pack and Your data already did not.
 */
describe('the pages beside compliance, when the route will not answer', () => {
  const read = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

  it('a refused "What is coming" page shows the heading and the sentence, and no team lens, search or window above it', () => {
    const page = read('src/app/dashboard/governance/page.tsx')
    const refused = page.indexOf('if (!loading && error) return (')
    expect(refused).toBeGreaterThan(-1)
    expect(page.indexOf('{TEAMS.map(')).toBeGreaterThan(refused)
    expect(page.indexOf('placeholder="Search by person or vendor…"')).toBeGreaterThan(refused)
  })

  it('a Paperwork page whose library could not be read shows the sentence, never "Requests 0" or a form to ask with', () => {
    const page = read('src/app/dashboard/documents/page.tsx')
    const refused = page.indexOf('if (unread) return (')
    expect(refused).toBeGreaterThan(-1)
    expect(page.indexOf('Ask somebody for a document')).toBeGreaterThan(refused)
    expect(page.indexOf('{requests.length}')).toBeGreaterThan(refused)
  })

  it('a do-not-return list that could not be read shows the sentence, never zero counts or "Add somebody"', () => {
    const page = read('src/app/dashboard/blacklist/page.tsx')
    const refused = page.indexOf('if (!loading && error) return (')
    expect(refused).toBeGreaterThan(-1)
    expect(page.indexOf('<Stat label="Total Entries"')).toBeGreaterThan(refused)
    expect(page.indexOf('Add somebody\n')).toBeGreaterThan(refused)
  })

  it('the access register and the client pack already return the refusal on its own', () => {
    expect(read('src/app/dashboard/access/page.tsx')).toContain('if (refused) return (')
    expect(read('src/app/dashboard/outbound-pack/page.tsx')).toContain('if (denied) {')
  })
})

/**
 * Round five found the compliance desk's own page still drawing a
 * confident all-clear where it had no answer. A refused Member read
 * "Nothing is waiting on this desk today", then "Requests 0" and
 * "Holds 0"; Cavanaugh's program manager read "Incidents 0 … Nothing has
 * gone anywhere it should not have" under a refused read; and every
 * reader saw the same all-clear before the first read came back. "What
 * is coming" put "Try again" under its refusal, as if it were a fault.
 */
describe('Data requests, when the routes will not answer or have not answered yet', () => {
  const ok = <T,>(data: T) => ({ data, error: null })
  const no = (error: string) => ({ data: null, error })
  const NOT_YOURS = 'Reading data requests is the compliance desk’s job here.'

  it('a refused desk shows the route’s sentence alone — no "Nothing is waiting", no "Requests 0", no "Holds 0"', () => {
    const v = privacyView({ loading: false, requests: no(NOT_YOURS), holds: no('Holds are not yours.'), incidents: no('Nor these.'), open: 0, urgent: 0 })
    expect(v).toEqual({ show: 'refused', says: NOT_YOURS })
  })

  it('nothing is said about the queue while the first read is still out, not even that nothing is waiting', () => {
    const v = privacyView({ loading: true, requests: ok([]), holds: ok([]), incidents: ok([]), open: 0, urgent: 0 })
    expect(v).toEqual({ show: 'loading' })
  })

  it('"Nothing is waiting on this desk today" is said only after the queue was read and found empty', () => {
    const v = privacyView({ loading: false, requests: ok([]), holds: ok([]), incidents: ok([]), open: 0, urgent: 0 })
    expect(v.show === 'page' && v.headline).toBe('Nothing is waiting on this desk today.')
  })

  it('a refused incidents read is drawn as its sentence, never as "Incidents 0" and an all-clear', () => {
    const v = privacyView({ loading: false, requests: ok([]), holds: ok([]), incidents: no('Reading a security incident is the compliance desk’s job here.'), open: 0, urgent: 0 })
    expect(v.show).toBe('page')
    if (v.show !== 'page') return
    expect(v.incidents).toEqual({ show: 'refused', says: 'Reading a security incident is the compliance desk’s job here.' })
  })

  it('an incidents list read and found empty is the all-clear, because the read succeeded', () => {
    const v = privacyView({ loading: false, requests: ok([]), holds: ok([]), incidents: ok([]), open: 0, urgent: 0 })
    expect(v.show === 'page' && v.incidents).toEqual({ show: 'list', rows: [] })
  })

  it('where only the queue was refused, the page says no headline about it and draws the queue as its sentence', () => {
    const v = privacyView({ loading: false, requests: no(NOT_YOURS), holds: ok([]), incidents: ok([]), open: 0, urgent: 0 })
    expect(v.show).toBe('page')
    if (v.show !== 'page') return
    expect(v.headline).toBeNull()
    expect(v.requests).toEqual({ show: 'refused', says: NOT_YOURS })
  })

  it('the headline counts what is open and what is due inside a day', () => {
    expect(privacyHeadline(1, 0)).toBe('1 request needs you.')
    expect(privacyHeadline(3, 2)).toBe('3 requests need you. 2 are due inside a day.')
  })

  it('the page returns the loading and refused states before it draws a headline, a count or an empty list', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/dashboard/privacy/page.tsx'), 'utf8')
    const loading = page.indexOf("if (view.show === 'loading') return (")
    const refused = page.indexOf("if (view.show === 'refused') return <RefusedState says={view.says} />")
    expect(loading).toBeGreaterThan(-1)
    expect(refused).toBeGreaterThan(loading)
    expect(page.indexOf('{view.headline')).toBeGreaterThan(refused)
    expect(page.indexOf('emptyMessage="Nothing has gone anywhere it should not have."')).toBeGreaterThan(refused)
    expect(page).not.toMatch(/\{(requests|holds|breaches)\.length\}/)
    expect(page.slice(refused, page.indexOf('{view.headline'))).not.toContain('Try again')
  })
})

describe('who reads the incident list on Data requests', () => {
  const read = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

  it('the menu link and the incidents route ask for the same permission, so a desk offered the page is answered by it', () => {
    const PRIVACY = getNavForKind('CLIENT', false).flatMap((s) => s.items).find((i) => i.href === '/dashboard/privacy')
    expect(PRIVACY?.needs).toEqual(['governance.read'])
    expect(read('src/app/api/breaches/route.ts')).toContain("const TO_READ = 'governance.read'")
  })

  it('a client program manager holds the governance read, so his menu offers Data requests and every list on it answers him', () => {
    const pm = rolesFor('CLIENT').find((r) => r.name === 'Program Manager')
    expect(pm?.permissions).toContain('governance.read')
  })

  it('a company that was in no incident is answered with an empty register, not refused', () => {
    expect(mayWorkBreach({ isStaff: false, hasCompliancePermission: true, companyIsAffected: false }).ok).toBe(true)
  })

  it('a seat without the governance read is still refused the incident register', () => {
    expect(mayWorkBreach({ isStaff: false, hasCompliancePermission: false, companyIsAffected: false }).ok).toBe(false)
  })
})

describe('"What is coming", when its read fails', () => {
  it('a refusal is the sentence alone, with no "Try again" under it', () => {
    expect(mayTryAgain(403)).toBe(false)
  })

  it('an ended session is not offered a retry either, because signing in is the way back', () => {
    expect(mayTryAgain(401)).toBe(false)
  })

  it('a server failure, a busy server or no connection at all is offered "Try again", because a retry can change the answer', () => {
    expect(mayTryAgain(500)).toBe(true)
    expect(mayTryAgain(503)).toBe(true)
    expect(mayTryAgain(429)).toBe(true)
    expect(mayTryAgain(0)).toBe(true)
  })

  it('the page draws "Try again" only where mayTryAgain says so', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/dashboard/governance/page.tsx'), 'utf8')
    // The retry is the shared error state's one action; a refusal is the
    // shared refused state, which takes no action at all.
    const button = page.indexOf("action={{ label: 'Try again', onClick: load }}")
    expect(button).toBeGreaterThan(-1)
    expect(page.lastIndexOf('mayTryAgain(status) ?', button)).toBeGreaterThan(page.indexOf('if (!loading && error) return ('))
    expect(page).toContain(': <RefusedState says={error} />')
  })
})

/**
 * The eyebrow over each of these pages used to be the word "Governance",
 * typed by hand. A reader whose trimmed menu files the page under another
 * heading — Compliance, Oversight, Privacy — read a section their menu
 * does not have. Each page now asks the reader's own menu, and draws no
 * eyebrow while the answer is not known.
 */
describe('the heading over the compliance and governance pages', () => {
  const PAGES = [
    'src/app/dashboard/compliance/page.tsx',
    'src/app/dashboard/tenure/page.tsx',
    'src/app/dashboard/governance/page.tsx',
    'src/app/dashboard/privacy/page.tsx',
    'src/app/dashboard/packets/page.tsx',
    'src/app/dashboard/documents/requirements/page.tsx',
  ]
  const REFUSED = ['src/app/dashboard/compliance/refused.tsx', 'src/app/dashboard/tenure/refused.tsx']
  const typed = /(className="(?:eyebrow|lbl)[^"]*"|<Lbl|className="[^"]*uppercase tracking[^"]*")>\s*Governance\s*</

  it('no compliance or governance page types its heading; each reads it from the reader’s own menu', () => {
    for (const f of [...PAGES, ...REFUSED]) {
      expect(readFileSync(path.join(process.cwd(), f), 'utf8'), f).not.toMatch(typed)
    }
    for (const f of PAGES) {
      expect(readFileSync(path.join(process.cwd(), f), 'utf8'), f).toContain('usePageSection(')
    }
    // The refused screens draw no heading of any kind — no section, no
    // title — only the route's sentence (the shared refused state).
    for (const html of [
      renderToStaticMarkup(createElement(ComplianceRefused, { says })),
      renderToStaticMarkup(createElement(TenureRefused, { says })),
    ]) {
      expect(html).not.toContain('eyebrow')
      expect(html).not.toContain('<h1')
      expect(html).toContain('data-state="refused"')
    }
  })
})

/**
 * Sign-up walk, round seven, problems 6 and 7 (the regulatory pages).
 *
 * Paperwork drew its heading over its refusal. The document-set page
 * told Mo, Lee, Sam and Nina to "open this from an order or from a
 * placement", and none of them can open either.
 */
describe('sign-up walk, round seven: Paperwork and the document-set page', () => {
  const read = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')
  const ownerOf = (kind: 'CLIENT' | 'VENDOR' | 'GSI' | 'MSP') =>
    rolesFor(kind).find((r) => r.name === 'Owner')?.permissions ?? []
  const reader = (kind: 'CLIENT' | 'VENDOR' | 'GSI' | 'MSP' | null, permissions: string[], extra: Partial<{ isWorker: boolean; contextType: string }> = {}) =>
    sidebarPropsFrom({
      company: kind ? ({ kind, name: 'Walk Co' } as never) : null,
      contextType: (extra.contextType ?? 'EMPLOYEE') as never,
      loading: false,
      isWorker: extra.isWorker ?? false,
      permissions,
    })
  const opensFrom = (r: ReturnType<typeof reader>) =>
    SET_OPENED_FROM.some((href) => sectionForReader(r, href) !== null)

  it('a refused Paperwork page is the refusal sentence alone, with no heading and no description over it', () => {
    const page = read('src/app/dashboard/documents/page.tsx')
    const refused = page.indexOf('if (unread) return (')
    expect(refused).toBeGreaterThan(-1)
    const branch = page.slice(refused, page.indexOf('return (', refused + 'if (unread) return ('.length))
    expect(branch).toContain('{unread}')
    expect(branch).not.toContain('<h1')
    expect(branch).not.toContain('eyebrow')
    expect(branch).not.toContain('What you ask people')
  })

  it('Paperwork reads its heading off the reader’s own menu, never off the company’s whole menu', () => {
    const page = read('src/app/dashboard/documents/page.tsx')
    expect(page).toContain("usePageSection('/dashboard/documents')")
    expect(page).not.toContain('sectionOfHref(')
  })

  it('a Member at a client with no desk is not told to open a document set from an order or a placement; he reads the refusal sentence', () => {
    const mo = reader('CLIENT', [])
    expect(opensFrom(mo)).toBe(false)
    expect(documentSetDoor({ pending: false, company: 'Northbend Athletic', opensFrom: opensFrom(mo) })).toEqual({
      show: 'refused',
      says: 'A document set is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.',
    })
  })

  it('a desk-less seat at a supplier and a firm’s own worker read the same refusal, never the instruction', () => {
    expect(opensFrom(reader('VENDOR', []))).toBe(false)
    expect(opensFrom(reader('GSI', [], { isWorker: true }))).toBe(false)
    const door = documentSetDoor({ pending: false, company: 'Brightmoor Staffing', opensFrom: false })
    expect(door.show).toBe('refused')
    if (door.show === 'refused') expect(door.says).not.toMatch(/Open this from/)
  })

  it('a candidate at no company is told a document set belongs to a company, and where her own papers are', () => {
    expect(documentSetDoor({ pending: false, company: null, opensFrom: false })).toEqual({
      show: 'refused',
      says: 'A document set belongs to a company’s order or placement, and you are not signed in at a company. Your own papers are under Your paperwork.',
    })
  })

  it('a reader whose menu offers orders, contract lines or the compliance desk is still pointed to an order or a placement', () => {
    for (const kind of ['CLIENT', 'VENDOR', 'GSI', 'MSP'] as const) {
      expect(opensFrom(reader(kind, ownerOf(kind))), kind).toBe(true)
    }
    expect(documentSetDoor({ pending: false, company: 'Walk Co', opensFrom: true })).toEqual({ show: 'pointer' })
  })

  it('nothing is said about a document set while the session is still loading', () => {
    expect(documentSetDoor({ pending: true, company: null, opensFrom: false })).toEqual({ show: 'loading' })
  })

  it('the document-set page returns the refusal before it draws its heading or the instruction', () => {
    const page = read('src/app/dashboard/documents/requirements/page.tsx')
    const refused = page.indexOf("if (door.show === 'refused') return (")
    expect(refused).toBeGreaterThan(-1)
    expect(page.indexOf('What a document set asks for')).toBeGreaterThan(refused)
    expect(page.indexOf('Open this from an order or from a placement')).toBeGreaterThan(refused)
    const start = refused + "if (door.show === 'refused') return (".length
    const branch = page.slice(refused, page.indexOf('return (', start))
    expect(branch).toContain('{door.says}')
    expect(branch).not.toContain('<h1')
  })
})
