import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/program',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))

// The eyebrow is the reader's own menu's answer; the menu itself is
// tested in page-framing and sidebar-nav. Here it is the two answers a
// detail page can get: a section, or nothing.
vi.mock('@/components/page-section', () => ({
  usePageSection: (href: string) => (href === '/dashboard/contracts' ? 'Operate' : null),
}))

import { EmptyState, LoadingState, ErrorState, RefusedState } from '@/components/ui/states'
import { Field, Input, SubmitButton, FormMessage } from '@/components/ui/form'
import { Stat, Chip, CHIP_TONES, Panel, PageHead } from '@/components/ui/surface'
import { DetailHead } from '@/components/ui/detail-head'
import { FilterChips } from '@/components/ui/filter-chips'
import { DataTable, defaultSearch, rangeWords } from '@/components/data-table'
import { pillsFor } from '@/components/shell/section-pills'
import { Sidebar } from '@/components/shell/sidebar'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'

/**
 * The shared layer every screen draws — the founder's brief of
 * 2026-10-09: "consistent components", across the product.
 *
 * Every page hand-rolled its own empty line, its own "Loading…", its own
 * refusal paragraph, its own Panel and Stat. These sentences say what the
 * shared ones draw, so a page that adopts one knows what it is getting,
 * and so the one rule that matters most — a refused page is its sentence
 * alone — is held by the primitive and not re-learned per page.
 */

// Children go in as createElement's third argument, which the props
// types (children required) cannot see; the output is what is asserted.
const h = createElement as (...args: any[]) => any
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const html = (el: any) => renderToStaticMarkup(el)

describe('the states a screen is in before it has rows', () => {
  it('an empty list says one sentence, and offers its one action only when the page gives one', () => {
    const bare = html(h(EmptyState, { says: 'Nobody is on site at Northbend Athletic today.' }))
    expect(bare).toContain('Nobody is on site at Northbend Athletic today.')
    expect(bare).not.toContain('<a')
    expect(bare).not.toContain('<button')
    const withOne = html(h(EmptyState, { says: 'No job requests yet.', action: { label: 'Post a job request', href: '/dashboard/requirements?new=1' } }))
    expect(withOne.match(/<a /g)).toHaveLength(1)
    expect(withOne).toContain('Post a job request')
  })

  it('a list still loading says what it is opening, in words, and a screen reader hears it', () => {
    const out = html(h(LoadingState, { says: 'Opening the placement…' }))
    expect(out).toContain('Opening the placement…')
    expect(out).toContain('role="status"')
    expect(out).toContain('aria-live="polite"')
  })

  it('a refused page draws the route’s sentence alone — no heading, no button, no tile beside it', () => {
    const says = 'Expenses is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.'
    const out = html(h(RefusedState, { says }))
    expect(out).toBe(`<p data-state="refused" role="alert" class="max-w-xl py-8 text-[14px] leading-relaxed text-etyme-muted">${says}</p>`)
    expect(out).not.toMatch(/<h\d|<button|<a /)
  })

  it('a refused state takes the sentence and nothing else, so no page can hang a heading or a button on it', () => {
    const src = read('src/components/ui/states.tsx')
    expect(src).toContain('export function RefusedState({ says }: { says: string })')
  })

  it('an error that is not a refusal says what broke, and offers to try again only where the page can', () => {
    const alone = html(h(ErrorState, { says: 'The list could not be read. The server did not answer.' }))
    expect(alone).toContain('role="alert"')
    expect(alone).not.toContain('<button')
    const retry = html(h(ErrorState, { says: 'The list could not be read.', action: { label: 'Try again', onClick: () => {} } }))
    expect(retry).toContain('Try again')
  })
})

describe('one form, everywhere', () => {
  it('a field ties its label, help line and error line to its input, so a screen reader reads all three', () => {
    const out = html(h(Field, { label: 'Work email', help: 'They sign in with this.', error: 'That address is already seated here.' }, h(Input, { type: 'email' })))
    const id = out.match(/<input[^>]*\sid="([^"]+)"/)![1]
    expect(out).toContain(`for="${id}"`)
    const described = out.match(/aria-describedby="([^"]+)"/)![1].split(' ')
    expect(described).toHaveLength(2)
    for (const d of described) expect(out).toContain(`id="${d}"`)
    expect(out).toContain('aria-invalid="true"')
  })

  it('an error under a field is announced and drawn in the danger color; a help line is neither', () => {
    const out = html(h(Field, { label: 'Name', help: 'As it is on their papers.', error: 'A name is needed.' }, h(Input)))
    expect(out).toMatch(/role="alert" class="[^"]*text-etyme-danger[^"]*">A name is needed\./)
    expect(out).not.toMatch(/role="alert"[^>]*>As it is on their papers\./)
    const fine = html(h(Field, { label: 'Name' }, h(Input)))
    expect(fine).not.toContain('aria-invalid')
    expect(fine).not.toContain('aria-describedby')
  })

  it('a submit button says what it is doing while it waits, and cannot be pressed twice', () => {
    const waiting = html(h(SubmitButton, { pending: true, pendingLabel: 'Inviting…' }, 'Invite'))
    expect(waiting).toContain('Inviting…')
    expect(waiting).not.toContain('>Invite<')
    expect(waiting).toContain('disabled=""')
    expect(waiting).toContain('aria-busy="true"')
    const ready = html(h(SubmitButton, {}, 'Invite'))
    expect(ready).not.toContain('disabled')
  })

  it('what a send came back with is announced when it is a refusal and spoken politely when it is a success', () => {
    expect(html(h(FormMessage, { tone: 'error' }, 'Refused.'))).toContain('role="alert"')
    expect(html(h(FormMessage, { tone: 'ok' }, 'Saved.'))).toContain('role="status"')
  })

  it('the shell’s own forms — inviting a teammate, the week, payroll — are drawn with the shared field and submit', () => {
    for (const f of ['src/components/invite-teammate.tsx', 'src/components/settings/week-panel.tsx', 'src/components/settings/payroll-panel.tsx']) {
      const src = read(f)
      expect(src, f).toContain("from '@/components/ui/form'")
      expect(src, f).toContain('<SubmitButton')
      expect(src, f).not.toMatch(/<select\b/)
    }
  })
})

describe('the surface pieces', () => {
  it('a stat is a label, a serif figure in tabular numbers and an optional line, in ink, clay or green only', () => {
    const out = html(h(Stat, { label: 'On site', value: 12, sub: 'and 3 signed to start' }))
    expect(out).toMatch(/font-serif[^"]*tabular-nums/)
    expect(out).toContain('and 3 signed to start')
    expect(html(h(Stat, { label: 'Spend', value: 1, tone: 'attention' }))).toContain('text-etyme-attention')
    expect(html(h(Stat, { label: 'Clear', value: 1, tone: 'verified' }))).toContain('text-etyme-verified')
  })

  it('a stat nobody can stand behind reads a dash, never a zero', () => {
    const out = html(h(Stat, { label: 'Margin', value: null, sub: 'No pay rate on record.' }))
    expect(out).toContain('—')
    expect(out).not.toMatch(/>0</)
  })

  it('a chip takes one of five tones and nothing else', () => {
    expect([...CHIP_TONES]).toEqual(['action', 'attention', 'verified', 'danger', 'passive'])
    const css = read('src/app/globals.css')
    for (const t of CHIP_TONES) {
      expect(html(h(Chip, { tone: t }, 'x'))).toContain(`chip--${t}`)
      expect(css, t).toContain(`.chip--${t}`)
    }
  })

  it('a panel has a serif title and a line under it, and a page head has an eyebrow only when the menu gives one', () => {
    expect(html(h(Panel, { title: 'Your week', subtitle: 'A week runs Sunday to Saturday.' }))).toMatch(/<h2 class="font-serif[^"]*">Your week<\/h2>/)
    expect(html(h(PageHead, { eyebrow: null, title: 'Contractors' }))).not.toContain('eyebrow')
    expect(html(h(PageHead, { eyebrow: 'Workforce', title: 'Contractors' }))).toContain('>Workforce<')
  })

  it('a detail page is headed by the section its list sits under on the reader’s own menu, a serif title, a line under it and its actions', () => {
    const out = html(h(DetailHead, {
      from: '/dashboard/contracts', back: { href: '/dashboard/contracts', label: 'Contracts' },
      title: 'Helena Marsh', subtitle: 'Data engineer at Northbend Athletic',
      actions: h('button', null, 'Extend'),
    }))
    expect(out).toContain('>Operate<')
    expect(out).toMatch(/<h1 class="headline-serif[^"]*">Helena Marsh<\/h1>/)
    expect(out).toContain('Data engineer at Northbend Athletic')
    expect(out).toContain('Extend')
    expect(out).toContain('href="/dashboard/contracts"')
  })

  it('a detail page whose list is not on the reader’s menu draws no eyebrow rather than a guessed one', () => {
    const out = html(h(DetailHead, { from: '/dashboard/somewhere-else', title: 'Helena Marsh' }))
    expect(out).not.toContain('eyebrow')
  })

  it('the placement and the week pages are headed by it, and refuse and load through the shared states', () => {
    for (const f of ['src/app/dashboard/placements/[id]/page.tsx', 'src/app/dashboard/weeks/[id]/page.tsx']) {
      const src = read(f)
      expect(src, f).toContain('<DetailHead')
      expect(src, f).toContain('if (error) return <RefusedState says={error} />')
      expect(src, f).toContain('<LoadingState says=')
    }
  })
})

describe('the working-surface table', () => {
  type Row = { id: string; name: string; rate: number; skills: string[] }
  const rows: Row[] = [
    { id: '1', name: 'Helena Marsh', rate: 96, skills: ['SQL'] },
    { id: '2', name: 'Kwame Mensah', rate: 110, skills: ['ICU', 'Nursing'] },
  ]
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'rate', label: 'Rate', align: 'right' as const },
    { key: 'skills', label: 'Skills', sortable: false },
  ]
  const table = (more: Record<string, unknown> = {}) =>
    html(h(DataTable<Row>, { columns, data: rows, rowKey: (r: Row) => r.id, ...more }))

  it('every list offers search unless the page says it searches for itself', () => {
    expect(table()).toContain('type="search"')
    expect(table({ searchable: false })).not.toContain('type="search"')
  })

  it('a list whose page wrote no search is searched over the text of its own columns', () => {
    const match = defaultSearch<Row>(columns)
    expect(match(rows[1], 'nursing')).toBe(true)
    expect(match(rows[0], '96')).toBe(true)
    expect(match(rows[0], 'kwame')).toBe(false)
  })

  it('a sortable column says which way it sorts, to the eye and to a screen reader', () => {
    const out = table()
    expect(out.match(/aria-sort="none"/g)).toHaveLength(2)
    expect(out).toMatch(/<th scope="col" class="[^"]*">Skills<\/th>/)
    const src = read('src/components/data-table.tsx')
    expect(src).toContain("aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending')")
  })

  it('bulk selection and CSV export appear only on a list that asks for them', () => {
    const plain = table()
    expect(plain).not.toContain('type="checkbox"')
    expect(plain).not.toContain('Export CSV')
    const asked = table({ selectable: true, bulkActions: () => null, exportName: 'contractors' })
    expect(asked).toContain('type="checkbox"')
    expect(asked).toContain('Export CSV')
  })

  it('a table’s column headings stay in view while its rows scroll', () => {
    const css = read('src/app/globals.css')
    const th = css.slice(css.indexOf('.data-table th {'), css.indexOf('}', css.indexOf('.data-table th {')))
    expect(th).toContain('position: sticky')
    expect(th).toContain('top: 0')
    expect(th).toContain('background: var(--color-surface)')
  })

  it('figures inside the table are tabular, so a column of rates lines up', () => {
    const css = read('src/app/globals.css')
    const td = css.slice(css.indexOf('.data-table td {'), css.indexOf('}', css.indexOf('.data-table td {')))
    expect(td).toContain('font-variant-numeric: tabular-nums')
  })

  it('a refused list draws its sentence alone, with no search box or table around it', () => {
    const out = table({ error: 'Contracts is not part of your seat at Brightmoor Staffing.' })
    expect(out).toContain('data-state="refused"')
    expect(out).not.toContain('type="search"')
    expect(out).not.toContain('<table')
  })

  it('the footer reads as pages: where you are, of how many, and what a search left out', () => {
    expect(rangeWords(2, 20, 143, 143)).toBe('21–40 of 143')
    expect(rangeWords(1, 20, 7, 143)).toBe('1–7 of 7 (filtered from 143)')
    expect(rangeWords(1, 20, 0, 143)).toBe('None')
  })

  it('a row that opens something is reached by Tab and opened by Enter', () => {
    const out = html(h(DataTable<Row>, { columns, data: rows, rowKey: (r: Row) => r.id, onRowClick: () => {} }))
    expect(out.match(/<tr tabindex="0"/g)).toHaveLength(2)
  })

  it('filter chips sit in one row, say their count, and mark the one pressed', () => {
    const out = html(h(FilterChips<'ALL' | 'BLOCKED'>, {
      value: 'ALL', onChange: () => {},
      options: [{ key: 'ALL', label: 'Everyone', count: 12 }, { key: 'BLOCKED', label: 'Blocked', count: 1, warn: true }],
    }))
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(out).toContain('>12<')
    expect(read('src/components/network-view.tsx')).toContain('<FilterChips<NetworkFilter>')
  })
})

describe('the shell', () => {
  const client = sidebarPropsFrom({
    loading: false, isWorker: false, permissions: ['*'], contextType: 'EMPLOYEE' as const,
    company: { id: 'c1', name: 'Northbend Athletic', slug: 'world-nike', kind: 'CLIENT' as const },
  } as any)

  it('the active page on the menu is marked by a fill, a bar and aria-current, never by color alone', () => {
    const out = html(h(Sidebar, client))
    const link = out.match(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/)
    expect(link, 'no link on the menu is marked as the page being read').not.toBeNull()
    expect(link![0]).toContain('bg-etyme-action-wash')
    expect(link![0]).toMatch(/absolute left-0[^"]*w-\[2px\]/)
  })

  it('on a phone the current section’s pages sit in a row of pills, in the page, never over it', () => {
    const items = [
      { label: 'Contractors', href: '/dashboard/people', icon: '', group: 'Network' },
      { label: 'Suppliers', href: '/dashboard/suppliers', icon: '', group: 'Network' },
      { label: 'Timesheets', href: '/dashboard/timesheets', icon: '', group: 'Work' },
    ] as any
    expect(pillsFor(items, '/dashboard/people').map((i) => i.label)).toEqual(['Contractors', 'Suppliers'])
    expect(pillsFor(items, '/dashboard/timesheets')).toEqual([])
    const src = read('src/components/shell/section-pills.tsx')
    expect(src).toContain('md:hidden')
    expect(src).not.toMatch(/className="[^"]*\b(fixed|sticky)\b/)
    expect(read('src/app/dashboard/layout.tsx')).toContain('<SectionPills />')
  })

  it('the first Tab on every page can skip the menu and land on the page itself', () => {
    const layout = read('src/app/dashboard/layout.tsx')
    expect(layout).toContain('href="#main"')
    expect(layout).toMatch(/<main className="[^"]*" id="main"/)
  })

  it('keyboard focus is drawn everywhere: one ring in the brand, and no shell control takes it away without a ring of its own', () => {
    const css = read('src/app/globals.css')
    expect(css).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--violet\)/)
    for (const f of ['src/components/shell/header.tsx', 'src/components/shell/sidebar.tsx', 'src/components/shell/mobile-nav.tsx', 'src/components/data-table.tsx', 'src/components/list-surface.tsx']) {
      for (const line of read(f).split('\n').filter((l) => l.includes('focus:outline-none'))) {
        expect(line, f).toMatch(/focus:(border|shadow|ring)/)
      }
    }
  })

  it('the demo banner is one quiet line on the surface, not an alarm', () => {
    const src = read('src/components/demo-banner.tsx')
    expect(src).toContain('bg-etyme-surface')
    expect(src).not.toMatch(/bg-etyme-attention/)
    expect(src).toContain('<DemoChip />')
  })
})
