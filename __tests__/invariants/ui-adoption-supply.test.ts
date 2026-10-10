import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Supply's pages draw the shared layer (components/ui, 2026-10-10), the
 * founder's brief of 2026-10-09: one refusal, one loading line, one
 * panel, one number, one chip, one form and one row of filters, so a
 * screen on the bench reads like every other screen in the product.
 *
 * Read at source: the pages are client components with no handler to
 * call, in the style of signup-round-5-supply.
 */

const read = (f: string) => readFileSync(join(process.cwd(), 'src/app/dashboard', f), 'utf8')

/** What ships: comments quote the old markup on purpose. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const fromUi = (src: string, name: string) =>
  new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '@/components/ui'`).test(src)

describe('supply’s pages draw the shared layer', () => {
  it('Training, Ending soon, Consultants, Supplier scorecards and Our scorecard say a refusal through the one shared refusal, the sentence alone', () => {
    for (const f of ['training/page.tsx', 'rolloff/page.tsx', 'consultants/page.tsx', 'scorecards/page.tsx']) {
      const page = code(read(f))
      expect(fromUi(page, 'RefusedState'), f).toBe(true)
      expect(page, f).toContain('return <RefusedState says={refused} />')
      expect(page, f).not.toContain('text-[14px] text-etyme-muted py-8">{refused}</p>')
    }
    const standing = code(read('my-standing/page.tsx'))
    expect(standing).toContain('return <RefusedState says={error} />')
  })

  it('Scorecards, Your work, Our scorecard, Your page, Your benches, Consultants, Training and Ending soon say what they are opening while they load, never a bare “Loading…”', () => {
    for (const f of ['scorecards/page.tsx', 'my-work/page.tsx', 'my-standing/page.tsx', 'my-page/page.tsx',
      'my-benches/page.tsx', 'consultants/page.tsx', 'training/page.tsx', 'rolloff/page.tsx']) {
      const page = code(read(f))
      expect(fromUi(page, 'LoadingState'), f).toBe(true)
      expect(page, f).toMatch(/<LoadingState says=/)
      expect(page, f).not.toMatch(/>Loading…</)
    }
  })

  it('a worker’s own pages — Your work, your paperwork, Your page and Your benches — draw the shared panel, label and chip, and offer Try again under a failed read', () => {
    const own: Record<string, string[]> = {
      'my-work/page.tsx': ['Lbl', 'Chip', 'ErrorState'],
      'my-work/papers.tsx': ['Chip'],
      'my-page/page.tsx': ['Lbl', 'Panel', 'ErrorState'],
      'my-benches/page.tsx': ['Lbl', 'Panel', 'Chip', 'ErrorState'],
    }
    for (const [f, names] of Object.entries(own)) {
      const page = code(read(f))
      for (const n of names) {
        expect(fromUi(page, n), `${f} imports ${n}`).toBe(true)
        expect(page, `${f} defines no ${n} of its own`).not.toMatch(new RegExp(`\\nfunction ${n}\\(`))
      }
      if (names.includes('ErrorState')) expect(page, f).toContain("label: 'Try again'")
    }
  })

  it('Our bench and Bench profit count with the shared number, and Bench profit still shows a dash where a share cannot be computed', () => {
    for (const f of ['bench/our-bench.tsx', 'bench/bench-profit.tsx']) {
      const page = code(read(f))
      expect(fromUi(page, 'Stat'), f).toBe(true)
      expect(page, f).not.toMatch(/\nfunction Stat\(/)
    }
    expect(code(read('bench/bench-profit.tsx'))).toContain("data.utilization.billingPct == null ? '—'")
  })

  it('the Bench page counts with the shared number and keeps no stat chip of its own, and Add to bench says a failure through the shared form message', () => {
    const bench = code(read('bench/page.tsx'))
    expect(fromUi(bench, 'Stat')).toBe(true)
    expect(fromUi(bench, 'FormMessage')).toBe(true)
    expect(bench).not.toMatch(/\nfunction (Stat|StatChip|Chip)\(/)
    expect(bench).not.toContain('<StatChip')
    expect(bench).toContain('<FormMessage tone="error">{error}</FormMessage>')
    expect(bench).not.toMatch(/\b(bg|text|border)-red-\d{2,3}\b/)
  })

  it('Ending soon marks urgency with the shared chip in the kit’s danger and attention colors, never an off-brand red or amber', () => {
    const rolloff = code(read('rolloff/page.tsx'))
    expect(fromUi(rolloff, 'Chip')).toBe(true)
    expect(rolloff).toContain('<Chip tone="danger">Overdue</Chip>')
    expect(rolloff).toContain('<Chip tone="attention">Urgent — {daysUntilEnd}d</Chip>')
    expect(rolloff).not.toMatch(/\b(?:hover:)?(bg|text|border|border-l)-(red|amber)-\d{2,3}\b/)
  })

  it('“What we need” asks partners through the shared form: every box under its label, and the button says “Saving…” while it sends', () => {
    const panel = code(read('bench/what-we-need.tsx'))
    for (const n of ['Field', 'Input', 'Select', 'SubmitButton', 'FormMessage']) expect(fromUi(panel, n), n).toBe(true)
    expect(panel).toContain('<SubmitButton pending={busy} pendingLabel="Saving…">Ask partners</SubmitButton>')
    expect(panel).not.toMatch(/<input\b|<select\b|<label\b/)
  })

  it('Past contractors and the bench filter with the shared row of chips, one pressed at a time', () => {
    const alumni = code(read('alumni/page.tsx'))
    expect(fromUi(alumni, 'FilterChips')).toBe(true)
    expect(alumni).toContain('<FilterChips<StateFilter>')
    expect(alumni).not.toContain('filter-tab--active')
    const bench = code(read('bench/page.tsx'))
    expect(fromUi(bench, 'FilterChips')).toBe(true)
    expect(bench).toContain('<FilterChips<TierFilter>')
    expect(bench).toContain('<FilterChips<AvailFilter>')
  })

  it('the bench’s own consultant search is the Add to bench picker, not a second search box over the list', () => {
    const bench = code(read('bench/page.tsx'))
    const picker = bench.indexOf('placeholder="Search by name or email…"')
    expect(picker).toBeGreaterThan(-1)
    // It sits inside the Add to bench form, before the page's list is drawn.
    expect(bench.lastIndexOf('<form onSubmit={handleSubmit}', picker)).toBeGreaterThan(-1)
    expect(picker).toBeLessThan(bench.indexOf('<ListSurface'))
  })
})
