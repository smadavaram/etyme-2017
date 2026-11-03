import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Walk 3, fault M2: Helena Marsh's approved week had no bill section on
 * its own page, so the firm that bills it had to find the week again on
 * Timesheets. The week's page now draws money's one component, which
 * reads the week's bill from the money route and draws nothing where the
 * reader's firm bills nothing on the week.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe("the week's own page and its bill", () => {
  it("the week's own page draws Bill this week where the reader bills the week, from money's one component", () => {
    const page = read('src/app/dashboard/weeks/[id]/page.tsx')
    expect(page).toContain("import { BillThisWeek } from '@/app/dashboard/invoices/bill-this-week'")
    expect(page).toContain('<BillThisWeek timesheetId={id} />')
    // No second computation of the bill on the week's page.
    expect(page).not.toMatch(/fetch\(`\/api\/contracts\/weeks\//)
    const part = read('src/app/dashboard/invoices/bill-this-week.tsx')
    expect(part).toContain('if (!view) return null')
    expect(part).toContain('view.mayBill &&')
  })
})
