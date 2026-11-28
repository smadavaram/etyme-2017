import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { deskOf } from '@/components/shell/sidebar-props'

/**
 * The platform's own pages draw the shared layer (components/ui), the
 * founder's brief of 2026-10-09: one refusal, one loading line, one empty
 * line, one page head, one panel, one number, one chip and one form, so
 * Settings, Import, Setup, Integrations, Contacts, Companies, the check
 * queue and the automation log read like every other screen.
 *
 * Read at source, in the style of the other ui-adoption files: these are
 * client pages with no handler to call.
 */

const read = (f: string) => readFileSync(join(process.cwd(), 'src', f), 'utf8')

/** What ships: comments quote the old markup on purpose. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const fromUi = (src: string, name: string) =>
  new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '@/components/ui(/[a-z-]+)?'`).test(src)

const PAGES: Record<string, string> = {
  'Bench pay': 'app/dashboard/settings/bench-pay/bench-pay.tsx',
  'Setup': 'app/dashboard/onboarding/page.tsx',
  'Integrations': 'app/dashboard/integrations/page.tsx',
  'Contacts': 'app/dashboard/contacts/page.tsx',
  'Companies': 'app/dashboard/companies/page.tsx',
  'Check queue': 'app/dashboard/checks/page.tsx',
  'Automation': 'app/dashboard/automation/page.tsx',
  'Import': 'app/dashboard/data/page.tsx',
}

describe('the platform’s pages draw the shared layer', () => {
  it('Bench pay, Setup, Integrations, Contacts, Companies, the check queue, Automation and Import are their refusal sentence alone, through the one shared refusal', () => {
    for (const [name, f] of Object.entries(PAGES)) {
      const page = code(read(f))
      expect(fromUi(page, 'RefusedState'), name).toBe(true)
      expect(page, name).toMatch(/return <RefusedState says=\{refused\} \/>/)
      expect(page, name).not.toMatch(/text-etyme-muted py-8">\{refused\}<\/p>/)
    }
  })

  it('each of them, and Settings, says what it is opening while it loads, never a bare “Loading…”', () => {
    for (const [name, f] of Object.entries({ ...PAGES, Settings: 'app/dashboard/settings/page.tsx' })) {
      const page = code(read(f))
      expect(fromUi(page, 'LoadingState'), name).toBe(true)
      expect(page, name).toMatch(/<LoadingState (compact )?says="Opening /)
      expect(page, name).not.toMatch(/>Loading…</)
    }
  })

  it('Setup, Integrations, Contacts, Companies, the check queue, Automation, Import, Settings and Bench pay head themselves with the shared page head, its eyebrow read off the reader’s own menu', () => {
    for (const f of ['app/dashboard/onboarding/page.tsx', 'app/dashboard/integrations/page.tsx', 'app/dashboard/contacts/page.tsx',
      'app/dashboard/companies/page.tsx', 'app/dashboard/checks/page.tsx', 'app/dashboard/automation/page.tsx',
      'app/dashboard/data/page.tsx', 'app/dashboard/settings/page.tsx', 'app/dashboard/settings/bench-pay/page.tsx']) {
      const page = code(read(f))
      expect(fromUi(page, 'PageHead'), f).toBe(true)
      expect(page, f).toMatch(/<PageHead\s+eyebrow=\{(section|eyebrow)\}/)
      expect(page, f).not.toMatch(/<h1\b/)
    }
  })

  it('an empty list on Setup, Contacts, the check queue, Automation and Import says what would be there through the shared empty state', () => {
    for (const f of ['app/dashboard/onboarding/page.tsx', 'app/dashboard/contacts/page.tsx', 'app/dashboard/checks/page.tsx',
      'app/dashboard/automation/page.tsx', 'app/dashboard/data/page.tsx']) {
      expect(fromUi(code(read(f)), 'EmptyState'), f).toBe(true)
    }
    expect(read('app/dashboard/checks/page.tsx')).toContain('says="Nothing to review"')
    expect(read('app/dashboard/contacts/page.tsx')).toContain("'Nobody matches that.'")
  })

  it('Settings, Bench pay and Import draw the shared panel and label, and define neither of their own', () => {
    for (const f of ['app/dashboard/settings/page.tsx', 'app/dashboard/settings/bench-pay/bench-pay.tsx', 'app/dashboard/data/page.tsx']) {
      const page = code(read(f))
      for (const n of ['Panel', 'Lbl']) {
        expect(fromUi(page, n), `${f} imports ${n}`).toBe(true)
        expect(page, `${f} defines no ${n}`).not.toMatch(new RegExp(`\\nfunction ${n}\\(`))
      }
    }
  })

  it('Companies, the check queue, Automation and Import count with the shared number, and the check queue’s share nobody has answered is a dash, not a zero', () => {
    for (const f of ['app/dashboard/companies/page.tsx', 'app/dashboard/checks/page.tsx', 'app/dashboard/automation/page.tsx', 'app/dashboard/data/page.tsx']) {
      const page = code(read(f))
      expect(fromUi(page, 'Stat'), f).toBe(true)
      expect(page, f).not.toContain('className="stat-value')
    }
    expect(read('app/dashboard/checks/page.tsx')).toContain('value={q.agreement.percent === null ? null : `${q.agreement.percent}%`}')
  })

  it('Contacts, Companies, Setup, the check queue and Automation draw the shared chip in its five tones, never a hand-written chip class', () => {
    for (const f of ['app/dashboard/contacts/page.tsx', 'app/dashboard/companies/page.tsx', 'app/dashboard/onboarding/page.tsx',
      'app/dashboard/checks/page.tsx', 'app/dashboard/automation/page.tsx']) {
      const page = code(read(f))
      expect(fromUi(page, 'Chip'), f).toBe(true)
      expect(page, f).not.toMatch(/className=\{?[`"]chip chip--/)
      expect(page, f).not.toMatch(/className=\{`chip \$\{/)
    }
  })

  it('Companies and Automation filter with the shared row of chips, one pressed at a time, and Automation’s “Reversible only” is the shared check box', () => {
    for (const f of ['app/dashboard/companies/page.tsx', 'app/dashboard/automation/page.tsx']) {
      const page = code(read(f))
      expect(fromUi(page, 'FilterChips'), f).toBe(true)
      expect(page, f).not.toContain('filter-tab--active')
    }
    expect(code(read('app/dashboard/automation/page.tsx'))).toMatch(/<Check\s+label="Reversible only"/)
  })

  it('Bench pay, Integrations, the check queue and both overtime choices on the placement ask through the shared form: every box under its label, the button saying what it is doing', () => {
    const bench = code(read('app/dashboard/settings/bench-pay/bench-pay.tsx'))
    for (const n of ['Field', 'Input', 'Select', 'SubmitButton', 'FormMessage']) expect(fromUi(bench, n), n).toBe(true)
    expect(bench).not.toMatch(/<select\b|<label>|<Lbl>Share of their pay/)

    const integrations = code(read('app/dashboard/integrations/page.tsx'))
    expect(integrations).not.toMatch(/<select\b|<textarea\b/)

    const checks = code(read('app/dashboard/checks/page.tsx'))
    expect(checks).toMatch(/<Field\s+label="What did it get wrong\?"/)
    expect(checks).toContain('pendingLabel="Saving…"')

    const placement = code(read('app/dashboard/placements/[id]/page.tsx'))
    expect(fromUi(placement, 'Select')).toBe(true)
    expect(placement).not.toMatch(/<select\b|<textarea\b/)
    expect(placement.match(/<SubmitButton type="button" pending=\{busy\} pendingLabel="Saving…" onClick=\{save\}>/g)?.length).toBe(2)
    // The legal floor still sits under the overtime method's reason.
    expect(placement).toContain('A worker the law entitles to overtime is never paid less than the regular-rate premium, whatever is chosen.')
  })
})

describe('a thread’s reply box is the shared form', () => {
  const THREAD = code(read('components/thread.tsx'))

  it('the reply is a labeled box, who sees it said under it as its help line, and a refused send says the route’s sentence under the box', () => {
    for (const n of ['Field', 'Textarea', 'SubmitButton', 'FormMessage']) expect(fromUi(THREAD, n), n).toBe(true)
    expect(THREAD).toContain('help={words.foot}')
    expect(THREAD).toContain('error={err ?? undefined}')
    expect(THREAD).not.toMatch(/<textarea\b/)
  })

  it('the send button says “Sending…” while the message is out and cannot be pressed twice', () => {
    expect(THREAD).toContain('<SubmitButton pending={busy} pendingLabel="Sending…" disabled={text.trim().length === 0}>')
    expect(THREAD).toContain("{withCompany ? 'Send' : 'Post'}")
  })

  it('a thread still opening says so, through the shared loading line', () => {
    expect(THREAD).toContain('<LoadingState compact says="Opening the conversation…" />')
  })
})

describe('the header names the role a desk is held under', () => {
  const office = {
    company: { id: 'kestrel', name: 'Kestrel MSP', slug: 'world-kestrel', kind: 'MSP' as const },
    contextType: 'EMPLOYEE' as const,
    isWorker: false,
    roleName: 'Owner',
    permissions: ['*'],
    seat: { clientId: 'talvern', clientName: 'Talvern Medical', roleName: 'Compliance Officer', permissions: ['compliance.read'] },
  }

  it('a program office at a client’s desk reads the role the client granted it, never its own role at the office', () => {
    expect(deskOf(office).roleName).toBe('Compliance Officer')
    expect(deskOf(office).seatedAtClient).toBe('Talvern Medical')
  })

  it('an office whose seat is revoked, and everybody else, reads their own role', () => {
    expect(deskOf({ ...office, seat: null }).roleName).toBe('Owner')
  })

  it('the header takes the role it prints from the desk, not from the session', () => {
    const header = read('components/shell/header.tsx')
    expect(header).toContain('const { permissions, roleName } = desk')
    expect(header).not.toMatch(/const \{[^}]*\broleName\b[^}]*\} = session/)
  })
})
