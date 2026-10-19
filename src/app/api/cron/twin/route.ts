import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { reportError } from '@/lib/alerts'
import { programsToRun, runTwin, suppliersToRun, tellOnTeams, type RunSummary } from '@/lib/twin/run'
import { runSupplierBills, type SupplierBillRun } from '@/lib/money/supplier-bills-run'

/**
 * GET /api/cron/twin
 *
 * The program manager's twin, once a night, over every client program;
 * then the supplier's twin over every supplier firm, drafting the bills
 * its agreements say are due (money's run, lib/money/supplier-bills-run).
 * Every finding goes through the twin's one door (`act` in
 * lib/twin/ledger), so this route writes nothing itself: the ledger and
 * the automation log are written there, under the role contract.
 *
 * Each supplier firm is then given the same Teams digest a client
 * program is (`tellOnTeams`, conversation's digest). Since 2026-10-19 the
 * digest carries each drafted bill's bill.send question as a card, to
 * whoever may send it, answered with Send bill or Keep it as a draft
 * through `decideApproval` on surface TEAMS; it is sent once, with no
 * second reminder before the bill is due (KNOWN-LIMITS.md, item 21).
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const ran: RunSummary[] = []
  const broke: { companyId: string; why: string }[] = []
  for (const companyId of await programsToRun()) {
    try {
      ran.push(await runTwin(companyId, { surface: 'CRON' }))
    } catch (err) {
      broke.push({ companyId, why: err instanceof Error ? err.message.slice(0, 200) : String(err) })
      await reportError('cron/twin', err, { companyId }).catch(() => undefined)
    }
  }
  const suppliers: (SupplierBillRun & { teamsDigest: RunSummary['teamsDigest'] })[] = []
  for (const companyId of await suppliersToRun()) {
    try {
      const run = await runSupplierBills(companyId, { surface: 'CRON' })
      suppliers.push({ ...run, teamsDigest: await tellOnTeams(companyId) })
    } catch (err) {
      broke.push({ companyId, why: err instanceof Error ? err.message.slice(0, 200) : String(err) })
      await reportError('cron/twin/supplier', err, { companyId }).catch(() => undefined)
    }
  }
  const asked = ran.reduce((n, r) => n + r.outcomes.AWAITING_APPROVAL, 0)
  const done = ran.reduce((n, r) => n + r.outcomes.PERFORMED, 0)
  const drafted = suppliers.reduce((n, r) => n + r.drafted, 0)
  const sendAsked = suppliers.reduce((n, r) => n + r.asked, 0)
  const says =
    `The twin read ${ran.length} program${ran.length === 1 ? '' : 's'}: ${done} done on its own, ${asked} put to a person.` +
    ` Ask Etyme, for suppliers, read ${suppliers.length} firm${suppliers.length === 1 ? '' : 's'}: ${drafted} bill${drafted === 1 ? '' : 's'} drafted, ${sendAsked} put to a person to send.` +
    (broke.length ? ` ${broke.length} could not be read.` : '')
  return NextResponse.json({ data: { ran, suppliers, broke, says } })
}
