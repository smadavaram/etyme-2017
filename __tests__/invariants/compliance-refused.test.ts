import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { complianceRefusal } from '@/lib/walls'
import { complianceSubtitle, complianceView } from '@/app/dashboard/compliance/says'
import { ComplianceRefused } from '@/app/dashboard/compliance/refused'
import { privacyView, privacyHeadline } from '@/app/dashboard/privacy/says'
import { mayTryAgain } from '@/app/dashboard/governance/says'
import { mayWorkBreach } from '@/lib/breach'
import { getNavForKind } from '@/lib/nav-table'
import { rolesFor } from '@/lib/company-defaults'

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
    expect(html).toContain('Compliance overview')
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
    expect(page.indexOf('<StatChip label="Total Entries"')).toBeGreaterThan(refused)
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
    const refused = page.indexOf("if (view.show === 'refused') return (")
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
    const button = page.indexOf('>Try again</button>')
    expect(button).toBeGreaterThan(-1)
    expect(page.lastIndexOf('mayTryAgain(status) && (', button)).toBeGreaterThan(page.indexOf('if (!loading && error) return ('))
  })
})
