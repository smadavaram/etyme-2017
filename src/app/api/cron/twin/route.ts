import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { reportError } from '@/lib/alerts'
import { programManagersAt, programsToRun, runTwin, supplierAuthoritiesAt, suppliersToRun, tellOnTeams, type RunSummary } from '@/lib/twin/run'
import { runSupplierBills, type SupplierBillRun } from '@/lib/money/supplier-bills-run'
import { runSupplierActs, type SupplierActsRun } from '@/lib/twin/supplier-run'
import { BUDGET_MS, inTurns, turnedDaily } from './turns'

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
 * Then, for each supplier firm, its own three acts (2026-10-29,
 * lib/twin/supplier-run): who is coming free, told to its recruiters;
 * the papers a start still needs, asked once; and a bench person matched
 * to a job the firm was sent, put to a recruiter as a question.
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
  // Firms are read a few at a time, against a deadline. One at a time
  // took past the 60-second limit on the 2,000-person world (simulation,
  // 2026-10-21): 17 programs and 289 suppliers, most with nothing to
  // draft, each a round of reads. A firm the deadline cuts off is not
  // read tonight and is counted in the answer; the order turns daily so
  // the same firms are not always the ones left.
  const deadline = Date.now() + BUDGET_MS
  const left: string[] = []
  const programs = turnedDaily(await programsToRun())
  const supplierIds = turnedDaily(await suppliersToRun())
  // Whose authority each firm's twin acts on, read once for every firm
  // (simulation, 2026-11-01): it was read once per program, and twice per
  // supplier, once by the bill run and once by the firm's own acts.
  const [managers, owners] = await Promise.all([programManagersAt(programs), supplierAuthoritiesAt(supplierIds)])
  const suppliers: (SupplierBillRun & { acts: SupplierActsRun | null; teamsDigest: RunSummary['teamsDigest'] })[] = []

  const readProgram = async (companyId: string) => {
    try {
      ran.push(await runTwin(companyId, { surface: 'CRON', authority: managers.get(companyId) }))
    } catch (err) {
      broke.push({ companyId, why: err instanceof Error ? err.message.slice(0, 200) : String(err) })
      await reportError('cron/twin', err, { companyId }).catch(() => undefined)
    }
  }
  const readSupplier = async (companyId: string) => {
    const authority = owners.get(companyId)
    try {
      const run = await runSupplierBills(companyId, { surface: 'CRON', authority })
      // The bills stand whatever the other acts do: a failure there is
      // reported and the firm's bills are still counted.
      const acts = await runSupplierActs(companyId, { surface: 'CRON', authority }).catch(async (err) => {
        broke.push({ companyId, why: err instanceof Error ? err.message.slice(0, 200) : String(err) })
        await reportError('cron/twin/supplier-acts', err, { companyId }).catch(() => undefined)
        return null
      })
      suppliers.push({ ...run, acts, teamsDigest: await tellOnTeams(companyId) })
    } catch (err) {
      broke.push({ companyId, why: err instanceof Error ? err.message.slice(0, 200) : String(err) })
      await reportError('cron/twin/supplier', err, { companyId }).catch(() => undefined)
    }
  }
  // One queue (./turns): the programs first, because they carry the most
  // work, then the suppliers, each taken by whichever worker is free.
  await inTurns(
    [...programs.map((id) => ({ id, program: true })), ...supplierIds.map((id) => ({ id, program: false }))],
    deadline, left,
    (firm) => (firm.program ? readProgram(firm.id) : readSupplier(firm.id)),
  )
  const asked = ran.reduce((n, r) => n + r.outcomes.AWAITING_APPROVAL, 0)
  const done = ran.reduce((n, r) => n + r.outcomes.PERFORMED, 0)
  const drafted = suppliers.reduce((n, r) => n + r.drafted, 0)
  const sendAsked = suppliers.reduce((n, r) => n + r.asked, 0)
  const putForward = suppliers.reduce((n, r) => n + (r.acts?.putForward ?? 0), 0)
  const startAsks = suppliers.reduce((n, r) => n + (r.acts?.startAsks ?? 0), 0)
  const says =
    `The twin read ${ran.length} program${ran.length === 1 ? '' : 's'}: ${done} done on its own, ${asked} put to a person.` +
    ` Ask Etyme, for suppliers, read ${suppliers.length} firm${suppliers.length === 1 ? '' : 's'}: ${drafted} bill${drafted === 1 ? '' : 's'} drafted, ${sendAsked} put to a person to send, ${startAsks} start${startAsks === 1 ? '' : 's'} with papers asked for, ${putForward} bench ${putForward === 1 ? 'person' : 'people'} put to a recruiter.` +
    (broke.length ? ` ${broke.length} could not be read.` : '') +
    (left.length ? ` ${left.length} firm${left.length === 1 ? ' was' : 's were'} not reached before the time limit and will be read on the next run.` : '')
  return NextResponse.json({ data: { ran, suppliers, broke, left, says } })
}
