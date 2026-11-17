import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { accessActor, recordAccess, recordRefusal, type AccessAction } from '@/lib/access-log'
import { bankCheckReport } from '@/lib/vendor-master-read'
import { oldChecksSummary } from '@/lib/vendor-master'
import { reportError } from '@/lib/alerts'

/**
 * GET /api/superadmin/bank-checks — the old bank checks report, for Etyme's
 * staff only (an address on ETYME_STAFF_EMAILS, read as `caller.staff`).
 * Read only: it writes the staff read's own access row and nothing else,
 * never the carry-over. Names each supplier that would be held, the bank's
 * last four digits and the customers that pay it; never a full number.
 * A refusal is logged and waited for before it is sent; the read is logged
 * before the list is handed over.
 */
const OPEN: AccessAction = 'SUPERADMIN_BANK_CHECK_REPORT' as string as AccessAction
const REFUSED = "This report is for Etyme's staff only."

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.staff || caller.isService) {
    const subject = caller.isService ? (caller.company ? { companyId: caller.company.id } : null) : caller.person.id
    if (subject) {
      await recordRefusal([subject], { ...accessActor(caller), action: OPEN, reason: 'Refused the old bank checks report: not on Etyme\'s staff list.' })
    }
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: REFUSED } }, { status: 403 })
  }
  try {
    const report = await bankCheckReport()
    await recordAccess([caller.person.id], {
      ...accessActor(caller),
      action: OPEN,
      reason: `Read the old bank checks report: ${report.held} suppliers named by company, bank last four digits and paying customers.`,
    })
    return NextResponse.json({ data: { ...report, says: oldChecksSummary(report) } })
  } catch (err) {
    await reportError('superadmin/bank-checks', err).catch(() => undefined)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'The report could not be read just now. Reload to try again.' } }, { status: 500 })
  }
}
