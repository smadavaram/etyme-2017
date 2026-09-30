import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { complianceRefusal } from '@/lib/walls'
import { complianceSubtitle, complianceView } from '@/app/dashboard/compliance/says'
import { ComplianceRefused } from '@/app/dashboard/compliance/refused'

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
