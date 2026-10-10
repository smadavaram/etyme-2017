import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The "Change a rate" form is offered only to desks the route allows.
 *
 * A form whose answer the server throws away is the thing CLAUDE.md says
 * never to hand anybody. So the page does not decide who may change a
 * rate: the route lists the lines it would accept from this seat, and the
 * page draws the form only when that list has something in it.
 */
const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/rate-history/page.tsx'), 'utf8')
const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/rate-history/route.ts'), 'utf8')

describe('the form that changes a rate', () => {
  it('asks for the line, the new rate, the day it takes effect and why', () => {
    expect(PAGE).toContain('Change a rate')
    for (const field of ['contractId', 'rate:', 'fromDate', 'reason']) expect(PAGE).toContain(field)
  })

  it('is drawn only when the route has named lines this seat may change', () => {
    expect(PAGE).toMatch(/changeable\.length > 0 && <ChangeRate/)
  })

  it('takes its list from the same rule the route writes by, not from the page', () => {
    expect(ROUTE).toContain('changeableLines(caller)')
    expect(ROUTE).toMatch(/isConsultantSeat\(caller\) \|\| !hasPermission\(caller\.permissions, 'assignments\.write'\)/)
  })
})
