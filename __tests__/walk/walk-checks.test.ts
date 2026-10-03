/**
 * The desk walk's checks, held to their sentences on fixture HTML.
 *
 * `scripts/walk-desks.mjs` opens every menu link as every seated desk
 * and reports what is wrong. A check that misfires sends the founder
 * after a problem that is not there, so each one is tested here.
 */
import { describe, it, expect } from 'vitest'
import {
  checkPage,
  checkNav,
  comparePhoneNav,
  factsFromHtml,
  navFromHtml,
} from '../../scripts/walk-checks.mjs'
import { buildMarkdown, tally } from '../../scripts/walk-report.mjs'

const kinds = (ps: { kind: string }[]) => ps.map((p) => p.kind)

const CLEAN = `<main><h1>Timesheets</h1><p>Helena Marsh, week ending Sep 26, 2026, 40 hours, waiting on you.</p></main>`

describe('the page checks', () => {
  it('a clean page reports no problems', () => {
    expect(checkPage(factsFromHtml(CLEAN))).toEqual([])
  })

  it('an ISO date in visible text is reported as a problem', () => {
    const facts = factsFromHtml('<main><h1>Invoices</h1><p>Due 2026-10-15 for the week of Sep 26.</p></main>')
    const problems = checkPage(facts)
    expect(kinds(problems)).toContain('iso-date')
    expect(problems.find((p) => p.kind === 'iso-date')!.what).toContain('2026-10-15')
  })

  it('an ISO date inside a hidden element is not reported', () => {
    const facts = factsFromHtml('<main><h1>Invoices</h1><p>Due Oct 15, 2026 on the next run.</p><span hidden>2026-10-15</span></main>')
    expect(kinds(checkPage(facts))).not.toContain('iso-date')
  })

  it('a menu link that opens a refusal is reported', () => {
    const facts = factsFromHtml('<main><h1>Payroll</h1><p>You do not have permission to see payroll at Brightmoor Staffing.</p></main>')
    expect(kinds(checkPage(facts))).toContain('refused')
  })

  it('a refusal with figures around it is reported', () => {
    const facts = factsFromHtml(`<main><p>You do not have permission to see payroll here.</p>
      <div><span>Paid this month</span><span>$0</span></div><div><span>Open</span><span>0</span></div>
      <div role="tab">Hours</div><div role="tab">Pay</div></main>`)
    const problems = checkPage(facts)
    expect(kinds(problems)).toContain('refusal-with-figures')
    expect(problems.find((p) => p.kind === 'refusal-with-figures')!.what).toMatch(/2 figures, 2 tabs/)
  })

  it("the app's own denied screen is a refusal but not a refusal with figures", () => {
    const facts = factsFromHtml('<main><p>Not open to you</p><h1>This is the payroll desk</h1><p>Ask an owner.</p></main>')
    const problems = checkPage(facts)
    expect(kinds(problems)).toContain('refused')
    expect(kinds(problems)).not.toContain('refusal-with-figures')
  })

  it("a 403 message the page prints is read as a refusal, in the route's own words", () => {
    const facts = factsFromHtml('<main><h1>Orders</h1><p>Seeing purchase orders needs invoices.read</p></main>', {
      apiFailures: [{ url: '/api/purchase-orders', status: 403, message: 'Seeing purchase orders needs invoices.read' }],
    })
    const problems = checkPage(facts)
    expect(kinds(problems)).toEqual(expect.arrayContaining(['refused', 'api-error', 'raw-code']))
  })

  it('a failed API call on the page is reported with its address and status', () => {
    const facts = factsFromHtml(CLEAN, { apiFailures: [{ url: '/api/ar', status: 500, message: 'boom' }] })
    const p = checkPage(facts).find((x) => x.kind === 'api-error')!
    expect(p.what).toContain('/api/ar')
    expect(p.what).toContain('500')
  })

  it('an uncaught console error is reported once however often it repeats', () => {
    const facts = factsFromHtml(CLEAN, { consoleErrors: ['TypeError: x is undefined', 'TypeError: x is undefined'] })
    expect(kinds(checkPage(facts)).filter((k) => k === 'console-error')).toHaveLength(1)
  })

  it('an error page is reported as broken, not as a refusal', () => {
    const facts = factsFromHtml('<main><h2>Application error: a client-side exception has occurred</h2></main>')
    expect(kinds(checkPage(facts))).toEqual(['error-page'])
  })

  it('a permission key shown to a person is reported', () => {
    const facts = factsFromHtml('<main><h1>Team</h1><p>Aditi holds vendors.manage and payroll.run on this desk.</p></main>')
    const p = checkPage(facts).find((x) => x.kind === 'raw-code')!
    expect(p.what).toContain('vendors.manage')
  })

  it('an underscored code shown to a person is reported', () => {
    const facts = factsFromHtml('<main><h1>Contracts</h1><p>Status: DOCUMENTS_BLOCK for Priya Raman this week.</p></main>')
    expect(checkPage(facts).find((x) => x.kind === 'raw-code')!.what).toContain('DOCUMENTS_BLOCK')
  })

  it('an email address on a reserved domain is not read as a permission key', () => {
    const facts = factsFromHtml('<main><h1>Contacts</h1><p>eleanor.vance@cavanaugh-glassworks.example, the program manager.</p></main>')
    expect(kinds(checkPage(facts))).not.toContain('raw-code')
  })

  it('a button to run payroll is reported on a desk that may not run payroll', () => {
    const facts = factsFromHtml('<main><h1>Payroll</h1><p>Two weeks to pay this period.</p><button>Run payroll</button></main>', { path: '/dashboard/payroll' })
    expect(kinds(checkPage(facts, { permissions: ['payroll.read'] }))).toContain('action-without-permission')
    expect(kinds(checkPage(facts, { permissions: ['payroll.read', 'payroll.run'] }))).not.toContain('action-without-permission')
  })

  it("an owner's seat, which holds every permission, is never told a button is not theirs", () => {
    const facts = factsFromHtml('<main><h1>Payroll</h1><p>Two weeks to pay this period.</p><button>Run payroll</button></main>', { path: '/dashboard/payroll' })
    expect(kinds(checkPage(facts, { permissions: ['*'] }))).not.toContain('action-without-permission')
  })

  it('a page that scrolls sideways at phone width is reported', () => {
    const facts = factsFromHtml(CLEAN, { phone: { scrollWidth: 612, clientWidth: 390 } })
    expect(checkPage(facts).find((x) => x.kind === 'phone-overflow')!.what).toContain('612px')
  })
})

describe('the menu checks', () => {
  it('a menu heading with no links under it is reported', () => {
    const nav = navFromHtml('<section data-label="Operate"><a href="/dashboard/contracts">Contracts</a></section><section data-label="Grow"></section>')
    expect(checkNav(nav)).toEqual([{ kind: 'nav-empty-heading', what: '"Grow" has no links under it.' }])
  })

  it('the same link label twice in one menu is reported', () => {
    const nav = navFromHtml(`<section data-label="Operate"><a href="/dashboard/documents">Paperwork</a></section>
      <section data-label="You"><a href="/dashboard/me/papers">Paperwork</a></section>`)
    const p = checkNav(nav)
    expect(kinds(p)).toEqual(['nav-duplicate-label'])
    expect(p[0].what).toContain('Operate')
    expect(p[0].what).toContain('You')
  })

  it('a phone menu missing a desktop link is reported', () => {
    const desktop = [{ label: 'Operate', links: [{ label: 'Contracts', href: '/c' }, { label: 'Hours', href: '/h' }] }]
    const phone = [{ label: 'Operate', links: [{ label: 'Contracts', href: '/c' }] }]
    expect(comparePhoneNav(desktop, phone)[0].what).toContain('Operate › Hours')
  })
})

describe('the report', () => {
  const results = [
    {
      party: 'Brightmoor Staffing', kind: 'VENDOR', company: 'world-brightmoor', desk: 'Recruiter', person: 'A. Recruiter',
      nav: [{ label: 'Sell', links: [{ label: 'Submissions', href: '/dashboard/submissions' }] }],
      navProblems: [],
      pages: [
        { label: 'Submissions', path: '/dashboard/submissions', shot: 'a.png', problems: [{ kind: 'iso-date', what: 'Shows 2026-10-01' }] },
        { label: 'Bench', path: '/dashboard/bench', shot: 'b.png', problems: [] },
      ],
    },
  ]

  it('the summary counts desks, pages, screenshots and problems by kind', () => {
    const t = tally(results)
    expect(t).toMatchObject({ desks: 1, pages: 2, shots: 2, byKind: { 'iso-date': 1 } })
  })

  it('a consultant seat is reported under Workers, with the firm that lists them in the desk name', () => {
    const md = buildMarkdown([{ party: 'Brightmoor Staffing', kind: 'WORKER', desk: 'Consultant', person: 'Rosa Delgado', pages: [] }])
    expect(md).toContain('## Workers (consultants)')
    expect(md).toContain('### Consultant listed by Brightmoor Staffing — Rosa Delgado')
  })

  it('the report lists a page with a problem under its party and desk, and leaves clean pages out', () => {
    const md = buildMarkdown(results)
    expect(md).toContain('## Brightmoor Staffing')
    expect(md).toContain('### Recruiter — A. Recruiter')
    expect(md).toContain('`/dashboard/submissions`')
    expect(md).not.toContain('`/dashboard/bench`')
    expect(md).toContain('2 pages from the menu; 1 with no problems.')
  })
})
