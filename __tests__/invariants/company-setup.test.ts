/**
 * A company's own setup is the desk that runs it, not everybody at it.
 *
 * The browser walk of 2026-09-21 signed in as Aditi Ramaswamy, a
 * Validation Engineer at Sundara Systems holding exactly two
 * permissions — `assignments.read` and `timesheets.read` — and asked
 * `/api/settings`. It answered **200**: every role at her employer with
 * the permission list attached to each, who may see outside the firm,
 * the cost centers, and whether a Teams channel is wired up. The same
 * seat was correctly refused on consultants, invoices, purchase orders
 * and profitability.
 *
 * The route said out loud why it was open — "knowing your own company's
 * holiday calendar is not privileged" — and that sentence is true of the
 * calendar and false of the page it sits on. Access architecture is the
 * thing an engineer should have to ask an owner for.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getNavForKind } from '@/components/shell/sidebar'

const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/settings/route.ts'), 'utf8')
const GET = ROUTE.slice(
  ROUTE.indexOf('export async function GET'),
  ROUTE.indexOf('export async function PATCH')
)

describe('a company’s own setup is read by the desk that runs it', () => {
  it('an engineer holding two read permissions cannot read his employer’s roles and permissions', () => {
    expect(GET).toContain("hasPermission(caller.permissions, 'settings.manage')")
  })

  it('the refusal says what is missing and who to ask, not a permission string', () => {
    const refusal = GET.slice(GET.indexOf("'settings.manage'"), GET.indexOf('const companyId'))
    expect(refusal).toContain('Ask whoever runs your access here')
    expect(refusal).not.toContain('needs settings.manage')
  })

  it('reading and changing the setup ask for the same thing', () => {
    // Two gates on one page is how a screen ends up rendering data it
    // will refuse to save.
    const patch = ROUTE.slice(ROUTE.indexOf('export async function PATCH'))
    expect(patch).toContain("hasPermission(caller.permissions, 'settings.manage')")
  })

  it('every menu that offers Settings names the permission the page asks for', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP'] as const) {
      const item = getNavForKind(kind, false)
        .flatMap((s) => s.items)
        .find((i) => i.href === '/dashboard/settings')
      expect(item, `${kind} has no Settings link`).toBeTruthy()
      expect(item!.needs, kind).toEqual(['settings.manage'])
    }
  })

  it('a seat that cannot open Settings is not shown the link', () => {
    const engineer = getNavForKind('GSI', false, {
      permissions: ['assignments.read', 'timesheets.read'],
    }).flatMap((s) => s.items).map((i) => i.href)
    expect(engineer).not.toContain('/dashboard/settings')
  })
})
