import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { runAllAgents } from '@/lib/agents/runner'
import { registerTimesheetChase } from '@/lib/notify/timesheet-chase-agent'
import { registerReconciliation } from '@/lib/agents/reconciliation'
import { registerPayrollDraft } from '@/lib/agents/payroll-draft'

/**
 * GET /api/cron/agents
 *
 * Runs every switched-on agent for every firm, each in its own try, so
 * one failure never stops another (lib/agents/runner). An agent that is
 * off is not run. A failure is a ledger row and an incident.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  registerTimesheetChase()
  registerReconciliation()
  registerPayrollDraft()
  const out = await runAllAgents(new Date())
  return NextResponse.json({ data: { says: out.says, ran: out.ran.length, stopped: out.stopped, broke: out.broke } })
}
