import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ComplianceRefused } from '@/app/dashboard/compliance/refused'
import { TenureRefused } from '@/app/dashboard/tenure/refused'

/**
 * The founder's brief of 2026-10-09: one shell, one table, one form,
 * across the product. The regulatory pages each drew their own Panel,
 * Stat, Chip, label, loading line and refusal paragraph, a few pixels
 * different from the next. They now draw the shared ones from
 * `@/components/ui`, and these sentences hold them there.
 *
 * What did not move: every verdict, every route call, and the rule that
 * a refusal is the route's sentence alone. "Nothing is waiting" is still
 * decided by each page's own `says` helper; the primitives only draw it.
 */

const read = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')
const page = (p: string) => read(`src/app/dashboard/${p}/page.tsx`)

const PAGES = [
  'privacy', 'packets', 'governance', 'documents', 'documents/requirements',
  'compliance', 'access', 'outbound-pack', 'tenure', 'blacklist', 'my-data',
]

describe('the regulatory pages draw the shared layer', () => {
  it('no regulatory page defines its own Panel, Stat, Chip or label any more; each imports them from the shared set', () => {
    for (const p of PAGES) {
      const src = page(p)
      expect(src, p).not.toMatch(/^function (Panel|Stat|StatChip|Chip|Lbl)\b/m)
      expect(src, p).toContain("from '@/components/ui'")
    }
  })

  it('no regulatory page writes "Loading…" by hand; a page still reading says what it is opening, through the shared loading state', () => {
    for (const p of PAGES) {
      expect(page(p), p).not.toMatch(/>\s*Loading…\s*</)
      expect(page(p), p).not.toContain("'Loading…'")
    }
    for (const p of ['privacy', 'packets', 'governance', 'documents', 'documents/requirements', 'compliance', 'access', 'outbound-pack', 'my-data']) {
      expect(page(p), p).toMatch(/<LoadingState[^>]*says="[^"]+…"/)
    }
  })
})

describe('Data requests', () => {
  it('a refused Data requests desk is the shared refused state alone, and each refused list on it is the same sentence-only state', () => {
    const src = page('privacy')
    expect(src).toContain("if (view.show === 'refused') return <RefusedState says={view.says} />")
    expect(src).toContain('<RefusedState says={view.requests.says} />')
    expect(src).toContain('<RefusedState says={view.holds.says} />')
    expect(src).toContain('<RefusedState says={view.incidents.says} />')
    expect(src).not.toMatch(/^function Refused\b/m)
    // The headline is still the page's own helper's, drawn in the page head.
    expect(src).toContain("title={view.headline ?? 'Data requests'}")
  })
})

describe('Document requests', () => {
  it('Document requests counts with the shared stat, asks through the shared form, and offers "Request documents" from the empty state', () => {
    const src = page('packets')
    expect(src).toContain('<Stat label="Waiting on you"')
    expect(src).toContain('<Field label="What you need">')
    expect(src).toContain('<Field label="Send to">')
    expect(src).toContain('<SubmitButton type="button" onClick={ask} pending={busy}')
    expect(src).toContain("action={canAsk && !asking ? { label: 'Request documents', onClick: () => setAsking(true) } : undefined}")
    expect(src).toContain('says={emptyRequestsSays(canAsk)}')
    // A list that would not be read is the sentence alone.
    expect(src).toContain('error ? <RefusedState says={error} />')
  })
})

describe('What is coming', () => {
  it('What is coming filters by team with the shared chips, counts with the shared stat, and draws a refusal alone and a fault with "Try again"', () => {
    const src = page('governance')
    expect(src).toContain('<FilterChips')
    expect(src).toContain('options={TEAMS.map(')
    expect(src).toContain('<Stat label="Will block"')
    expect(src).toContain(": <RefusedState says={error} />")
    expect(src).toContain("<ErrorState says={error} action={{ label: 'Try again', onClick: load }} />")
  })
})

describe('Paperwork and the document set', () => {
  it('Paperwork and the document set refuse through the shared refused state and mark each document’s standing with the shared chip', () => {
    const docs = page('documents')
    expect(docs).toContain('<RefusedState says={unread} />')
    expect(docs).toContain('<Chip tone={tone(r.status)}>')
    const set = page('documents/requirements')
    expect(set).toContain('<RefusedState says={door.says} />')
    expect(set).toContain('<Chip tone={')
    expect(set).toContain('<PageHead eyebrow={section} title="What a document set asks for" />')
  })
})

describe('Compliance overview and Time on site', () => {
  it('a refused compliance or time-on-site page is drawn by the shared refused state: the sentence, no heading, no figure', () => {
    const says = 'Reading the tenure ledger is done by the Owner desk at Northbend Athletic. Ask them for it.'
    for (const C of [ComplianceRefused, TenureRefused]) {
      const html = renderToStaticMarkup(createElement(C, { says }))
      expect(html).toContain('data-state="refused"')
      expect(html).toContain(says)
      expect(html).not.toContain('<h1')
      expect(html).not.toContain('eyebrow')
    }
    expect(page('compliance')).toContain('<PageHead eyebrow={section} title="Compliance overview"')
    expect(page('tenure')).toMatch(/<PageHead\s+eyebrow=\{section\}\s+title="Time on site"/)
  })
})

describe('Users & permissions', () => {
  it('Users & permissions counts with the shared stat, grants a desk through the shared form, and draws a refusal alone and a fault with "Try again"', () => {
    const src = page('access')
    expect(src).toContain('<Stat label="Waiting"')
    expect(src).toContain('<Field label="What can they do?">')
    expect(src).toContain('<Field label="New desk">')
    expect(src).toContain('pending={inviting} pendingLabel="Inviting…"')
    expect(src).toContain('<RefusedState says={refused} />')
    expect(src).toContain("<ErrorState says={error} action={{ label: 'Try again', onClick: load }} />")
  })
})

describe('Screening packs', () => {
  it('Screening packs sends through the shared field, submit and message, filters with the shared chips, and is the sentence alone when refused', () => {
    const src = page('outbound-pack')
    expect(src).toContain('<Field label="Send it to">')
    expect(src).toContain('<Field\n            label="Who is screening us"')
    expect(src).toContain('pendingLabel="Sending…"')
    expect(src).toContain('<FormMessage tone="error">{refusal.message}</FormMessage>')
    expect(src).toContain('<FormMessage tone="ok">{result.message}</FormMessage>')
    expect(src).toContain('<FilterChips<Filter>')
    expect(src).toContain('return <RefusedState says={denied} />')
  })
})

describe('Do-not-return list', () => {
  it('the do-not-return list is headed by the shared page head with "Add somebody" beside it, counts and filters with the shared stat and chips, and is the sentence alone when it cannot be read', () => {
    const src = page('blacklist')
    expect(src).toMatch(/<PageHead\s+eyebrow=\{section\}\s+title="Do-not-return list"/)
    expect(src).toContain('<FilterChips<FilterTab>')
    expect(src).toContain('<Stat label="Total Entries"')
    expect(src).toContain('<RefusedState says={error} />')
    expect(src).not.toContain("filterTab === key\n")
  })
})

describe('Your data', () => {
  it('Your data is headed by the shared page head and says it is reading, or that nothing was asked yet, through the shared states', () => {
    const src = page('my-data')
    expect(src).toMatch(/<PageHead\s+eyebrow=\{section\}\s+title="Your data"/)
    expect(src).toContain('<LoadingState compact says="Reading your record…" />')
    expect(src).toContain('says="You have not asked for anything yet."')
  })
})
