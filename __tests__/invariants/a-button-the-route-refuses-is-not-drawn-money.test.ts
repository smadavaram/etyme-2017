import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expenseDecideRefusal, EXPENSE_DECIDES } from '@/lib/money/expense-decides'
import { extendGate } from '@/app/api/contracts/[id]/extend/gate'
import { WhereItStands, type StandsView } from '@/app/dashboard/expenses/where-it-stands'
import { askSupplierBody } from '@/app/dashboard/invoices/ask-body'

/**
 * A button the route will refuse is never drawn, and a question typed on
 * a money screen is never lost to a refusal.
 *
 * The screen walk, 2026-11-02: Expenses offered "Accept $234.00" to a
 * client's program manager, and the route refused with nothing on the
 * screen; and "Ask the supplier" on Invoice receipts was a browser
 * prompt whose question, refused at an MSP seat, vanished.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const yours = (decidedBy: string | null): StandsView => ({
  state: 'YOURS', line: 'Approved by Techpeple · waiting on you', upToCents: 23_400, notBillableSays: null, decidedBy,
})
const draw = (view: StandsView) =>
  renderToStaticMarkup(createElement(WhereItStands, { view, money: (c: number) => `$${(c / 100).toFixed(2)}`, busy: false, onDecide: async () => true }))

describe('Accept on an expense is drawn only for a seat the route lets decide it', () => {
  it('a seat that approves hours or records payments may decide, and nothing is said in place of the buttons', () => {
    expect(expenseDecideRefusal({ permissions: ['timesheets.approve'], seat: null, companyName: 'Northbend Athletic' }, 'CLIENT')).toBeNull()
    expect(expenseDecideRefusal({ permissions: ['payments.record'], seat: null, companyName: 'Northbend Athletic' }, 'CLIENT')).toBeNull()
    expect(expenseDecideRefusal({ permissions: ['*'], seat: null, companyName: 'Northbend Athletic' }, 'CLIENT')).toBeNull()
  })

  it('a program manager who holds neither is told, in the route’s own sentence, who accepts it', () => {
    const says = expenseDecideRefusal({ permissions: ['requirements.read', 'invoices.read'], seat: null, companyName: 'Northbend Athletic' }, 'CLIENT')
    expect(says).toMatch(/^Accepting an expense before it is paid/)
  })

  it('the row draws Accept and Send back where the reader may decide', () => {
    const html = draw(yours(null))
    expect(html).toContain('Accept $234.00')
    expect(html).toContain('Send back')
  })

  it('the row draws neither where the route would refuse, and says who decides instead', () => {
    const html = draw(yours('Accepting an expense before it is paid is done by the Hiring Manager or the AP Clerk at Northbend Athletic.'))
    expect(html).not.toContain('Accept $234.00')
    expect(html).not.toContain('Send back')
    expect(html).toContain('is done by the Hiring Manager or the AP Clerk')
  })

  it('the accept route refuses with the same answer the list draws by', () => {
    const route = read('src/app/api/expenses/[id]/accept/route.ts')
    expect(route).toMatch(/const refused = expenseDecideRefusal\(desk, caller\.company\?\.kind\)/)
    // The route's own list of who decides is the list the screen draws by.
    expect(route).toContain("const DECIDES: Permission[] = ['timesheets.approve', 'payments.record']")
    expect([...EXPENSE_DECIDES]).toEqual(['timesheets.approve', 'payments.record'])
    const list = read('src/app/api/expenses/route.ts')
    expect(list).toMatch(/const decidedBy = deciding \? expenseDecideRefusal\(deciding, caller\.company\?\.kind\) : null/)
    expect(list).toMatch(/decidedBy: view\.upToCents != null \? decidedBy : null/)
  })
})

describe('a seat invited on a public address reads that its address is why, never "ask the role you hold"', () => {
  it('a public-address seat refused an expense decision is told its address is the reason, and its Owner can move it', () => {
    const says = expenseDecideRefusal(
      { permissions: ['requirements.read'], seat: null, companyName: 'Northbend Athletic', acting: { publicSeat: true } },
      'CLIENT',
    )
    expect(says).toContain('You were invited to Northbend Athletic on a public address')
    expect(says).toContain('An Owner of Northbend Athletic can move you to a company-directory address.')
  })

  it('a seat on a company address refused the same decision still reads who decides it', () => {
    const says = expenseDecideRefusal(
      { permissions: ['requirements.read'], seat: null, companyName: 'Northbend Athletic', acting: { publicSeat: false } },
      'CLIENT',
    )
    expect(says).not.toContain('public address')
  })

  it('the invoice receipt’s Pay and a placement’s lifecycle buttons are refused through the caller-aware sentence', () => {
    const role = readFileSync(join(process.cwd(), 'src/lib/money/receipt-role.ts'), 'utf8')
    const gate = readFileSync(join(process.cwd(), 'src/app/api/contracts/[id]/activate/gate.ts'), 'utf8')
    for (const src of [role, gate]) {
      expect(src).not.toMatch(/askTheDesk\(/)
      expect(src).toContain('refusalFor(')
    }
  })
})

describe('a question to the supplier is typed on the page and kept through a refusal', () => {
  const page = read('src/app/dashboard/invoices/page.tsx')

  it('Invoice receipts asks no question in a browser prompt', () => {
    expect(page).not.toMatch(/window\.prompt\(/)
  })

  it('the question is a field on the row, and a refusal is said under it in the route’s words with the question still there', () => {
    expect(page).toMatch(/<textarea[\s\S]*?value=\{question\}/)
    expect(page).toMatch(/setRefused\(body\.error\?\.message \?\?/)
    expect(page).toMatch(/\{refused && <p [^>]*role="alert">\{refused\}<\/p>\}/)
    // A refusal never clears what was typed.
    const send = page.slice(page.indexOf('async function send('), page.indexOf('return (', page.indexOf('async function send(')))
    expect(send).not.toMatch(/setQuestion\(''\)/)
  })

  it('what the field posts names the job, the supplier and the invoice, with the question as typed', () => {
    expect(askSupplierBody({ requirementId: 'job-1', supplierId: 'brightmoor', number: 'PR-2026-0441', question: '  Which week are the 41.5 hours from? ' })).toEqual({
      topic: 'REQUIREMENT', topicId: 'job-1', withCompanyId: 'brightmoor',
      initialMessage: 'About invoice PR-2026-0441: Which week are the 41.5 hours from?',
    })
  })

  it('every field the thread reads from what the question posts is one the field sends', () => {
    const route = read('src/app/api/conversations/route.ts')
    const m = route.match(/const \{([^}]+)\} = body/)
    const readFields = (m?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    const sent = Object.keys(askSupplierBody({ requirementId: 'j', supplierId: 's', number: 'n', question: 'q' }))
    // A title and the participants are the thread's own to choose; the question needs neither.
    expect(readFields.filter((f) => !sent.includes(f) && !['title', 'participantIds'].includes(f))).toEqual([])
  })
})

describe('Extend is drawn only where the extend route takes this reader’s press', () => {
  const contract = {
    state: 'IN_PROGRESS', companyId: 'brightmoor', clientCompanyId: 'northbend', endClientCompanyId: null,
    company: { name: 'Brightmoor Staffing' }, clientCompany: { name: 'Northbend Athletic' }, endClientCompany: null,
  }
  const seat = (over: Record<string, unknown>) => ({
    context: { type: 'EMPLOYEE' }, company: { id: 'brightmoor', name: 'Brightmoor Staffing', kind: 'VENDOR' },
    permissions: ['assignments.write'], ...over,
  }) as never

  it('a party holding the permission on a running placement may extend it', () => {
    expect(extendGate(seat({}), contract)).toEqual({ ok: true })
  })

  it('a party without the permission is told who extends it, in the route’s own sentence', () => {
    const g = extendGate(seat({ permissions: ['timesheets.read'] }), contract)
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.code).toBe('FORBIDDEN')
  })

  it('a firm that is not a party is told which firms can extend it', () => {
    const g = extendGate(seat({ company: { id: 'stranger', name: 'Veritan Talent', kind: 'VENDOR' } }), contract)
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.says).toBe('Veritan Talent is not a party to this contract. Only Brightmoor Staffing, Northbend Athletic can extend it.')
  })

  it('a finished placement is refused in words, never as its state code', () => {
    const g = extendGate(seat({}), { ...contract, state: 'COMPLETED' })
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.says).toBe('This placement is completed, so it cannot be extended. Only a running or paused placement is.')
  })

  it('the drawer asks the extend route before it draws Extend, and shows the route’s sentence where it will not', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/contracts/page.tsx'), 'utf8')
    expect(page).toContain('fetch(`/api/contracts/${contract.id}/extend`)')
    expect(page).toMatch(/\{extend\?\.may && \(\s*<button\s*onClick=\{\(\) => setShowExtendConfirm\(true\)\}/)
    expect(page).toContain('{extend && !extend.may && extend.says && (')
    const route = readFileSync(join(process.cwd(), 'src/app/api/contracts/[id]/extend/route.ts'), 'utf8')
    expect(route).toContain('export async function GET(')
    expect(route.match(/extendGate\(caller, contract\)/g)?.length).toBe(2)
  })
})
