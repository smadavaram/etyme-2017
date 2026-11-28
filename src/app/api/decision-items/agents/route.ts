import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { firmLedger, usageCount, payrollRowsHiddenSays, PAYROLL_LEDGER_READS } from '@/lib/record-ledger'
import { prisma } from '@/lib/db'
import { agentByWords, BASELINE_LINES, LEDGER_IS_FOR, agentRows, dayAround, recordViewHref, mayOpenRecordKind } from '@/lib/decision-queue'
import { NOTE_ACTIONS, mayChangeSwitch, readSwitchAsk, setSwitch } from '@/lib/agents/switch'
import { CHASE_AGENT_KEYS, chaseNumbersFrom, readChaseNumbers, setChaseNumbers } from '@/lib/agents/chase-numbers'
import { openTasks, OUTREACH_SETTINGS_HREF } from '@/lib/agents/tasks'
import { latestThisWeek, proposedDefaults, stoppedSays } from '@/lib/agents/control-view'
import { queueSeat, refused, refusalOf } from '../door'

/**
 * GET /api/decision-items/agents?page=N — agent control and the firm's ledger (A5)
 *
 * Record 107, Flow A. Each of the six agents reads "Not enabled", its
 * acts today counted from the ledger (`usageCount`), its meter a count of
 * actions and its cap "Not set"; no switch is offered that would do
 * nothing. The margin line is said only to a seat that reads margin.
 * Under them the firm's whole ledger, newest first, a page at a time,
 * read only by the Owner, an Admin, or a seat that reads the activity log
 * (`governance.read`); any other seat reads the agents and the baseline.
 * A row on a payroll record states amounts, so it is read only by a seat
 * that reads payroll: for any other reader those rows are left out at the
 * query, and one sentence says how many.
 */

export async function GET(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const { from, to } = dayAround(new Date())
  const page = Number(request.nextUrl.searchParams.get('page') ?? '1')
  const readsLedger = seat.ownerOrAdmin || hasPermission(seat.caller.permissions, 'governance.read')
  const readsPayroll = hasPermission(seat.caller.permissions, PAYROLL_LEDGER_READS)
  const [counts, switches, tasks, ledger] = await Promise.all([
    usageCount(seat.companyId, from, to), prisma.agentSwitch.findMany({ where: { companyId: seat.companyId } }),
    openTasks(seat.companyId), readsLedger ? firmLedger(seat.companyId, page, undefined, { readsPayroll }) : null,
  ])
  // The meter counts acts; a line that says why an agent did nothing is not one.
  const notes = await prisma.recordAction.groupBy({ by: ['agentKey'], where: { companyId: seat.companyId, createdAt: { gte: from, lt: to }, agentKey: { not: null }, action: { in: [...NOTE_ACTIONS] } }, _count: { _all: true } })
  const acts = counts.map((c) => ({ ...c, count: c.count - (notes.find((n) => n.agentKey === c.agentKey)?._count._all ?? 0) }))
  const lines: string[] = [BASELINE_LINES.billing]
  if (hasPermission(seat.caller.permissions, 'margin.read')) lines.push(BASELINE_LINES.margin)
  const thisWeek = await latestThisWeek(seat.companyId)
  const rows = agentRows(acts, switches)
  return NextResponse.json({
    data: {
      lines,
      thisWeek: thisWeek ? { at: thisWeek.at, says: thisWeek.says } : null,
      proposedDefaults: proposedDefaults().map((d) => ({ ...d, name: rows.find((r) => r.key === d.agentKey)?.name ?? (d.agentKey === 'weekly-summary' ? 'Weekly summary' : d.agentKey) })),
      canSwitch: mayChangeSwitch(seat.roleName) === null,
      entities: seat.entities,
      agents: rows.map((r) => ({ ...r, chaseNumbers: CHASE_AGENT_KEYS.includes(r.key) ? chaseNumbersFrom(switches.find((s) => s.agentKey === r.key)?.chasePlan) : null })),
      tasks: tasks.map((t) => {
        const a = rows.find((r) => r.key === t.agentKey)
        return { ...t, stopped: stoppedSays(t.state, a?.switchState ?? 'OFF', a?.name ?? t.agentKey) ?? t.paused, pausedHref: t.paused && seat.roleName === 'Owner' ? OUTREACH_SETTINGS_HREF : null }
      }),
      ledgerHidden: ledger ? null : LEDGER_IS_FOR,
      ledger: !ledger ? null : {
        page: ledger.page, pages: ledger.pages, total: ledger.total,
        payrollHidden: payrollRowsHiddenSays(ledger.hidden),
        rows: ledger.rows.map((r) => ({
          id: r.id, at: r.createdAt, summary: r.summary, entityName: r.actingEntity?.name ?? null,
          by: r.agentKey ? agentByWords(r.agentKey, r.person.name) : r.person.name, heldAs: r.heldAs,
          // A row names its record only where this seat may open it; elsewhere the summary stands alone.
          href: mayOpenRecordKind(r.recordType, seat.caller.permissions) ? recordViewHref(r.recordType, r.recordId) : null,
        })),
      },
    },
  })
}

/**
 * PATCH /api/decision-items/agents — { agentKey, state: 'OFF' | 'DRAFT_ONLY' | 'ON', dailyCap?, actingEntityId }
 *
 * The Owner alone switches an agent or sets its daily cap (an Admin may
 * not); the change is a row on the record ledger. Off stops the agent's
 * next run and any send of a running task at once.
 */
export async function PATCH(request: NextRequest) {
  const { seat, error } = await queueSeat(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  if (body && typeof body === 'object' && 'chaseNumbers' in body) {
    // A chase's letters and spacing: the Owner's alone, each change on the ledger.
    const owner = mayChangeSwitch(seat.roleName)
    if (owner) return refused(403, owner)
    const num = readChaseNumbers(typeof body.agentKey === 'string' ? body.agentKey : '', body.chaseNumbers)
    if (!num.ok) return refused(422, num.says, num.field)
    const entity = typeof body.actingEntityId === 'string' && body.actingEntityId.trim() ? body.actingEntityId.trim() : seat.entities.length === 1 ? seat.entities[0].id : null
    if (seat.entities.length > 1 && !entity) return refused(422, 'This company has legal entities. Choose which one this change is made for.', 'actingEntityId')
    try {
      const row = await setChaseNumbers({ companyId: seat.companyId, agentKey: body.agentKey, roleName: seat.roleName, personId: seat.personId, heldAs: seat.heldAs, actingEntityId: entity, numbers: num.numbers })
      return NextResponse.json({ data: { agentKey: row.agentKey, chaseNumbers: num.numbers } })
    } catch (e) {
      return refusalOf(e)
    }
  }
  const who = mayChangeSwitch(seat.roleName)
  if (who) return refused(403, who)
  // A firm with one legal entity is not asked which: the change is made for it. Several, and she chooses.
  const asked = typeof body?.actingEntityId === 'string' && body.actingEntityId.trim() ? body : { ...body, actingEntityId: seat.entities.length === 1 ? seat.entities[0].id : null }
  const read = readSwitchAsk(typeof body?.agentKey === 'string' ? body.agentKey : '', asked, seat.entities.length > 1)
  if (!read.ok) return refused(422, read.says, read.field)
  try {
    const row = await setSwitch({ companyId: seat.companyId, agentKey: body.agentKey, roleName: seat.roleName, personId: seat.personId, heldAs: seat.heldAs, ask: read.ask })
    return NextResponse.json({ data: { agentKey: row.agentKey, state: row.state, dailyCap: row.dailyCap } })
  } catch (e) {
    return refusalOf(e)
  }
}
