import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
import { runAllAgents } from '@/lib/agents/runner'
import { registerTimesheetChase } from '@/lib/notify/timesheet-chase-agent'
import { registerReconciliation } from '@/lib/agents/reconciliation'
import { registerPayrollDraft } from '@/lib/agents/payroll-draft'
import { registerConfirmationTracker } from '@/lib/agents/confirmation-tracker'
import { registerCensusKeeper } from '@/lib/agents/census-keeper'
import { registerMatchRanker } from '@/lib/agents/match-ranker'
import { registerInterviewChase } from '@/lib/agents/interview-chase'
import { registerContractsChecklist } from '@/lib/agents/contracts-checklist'
import { registerImmigrationChecklist } from '@/lib/agents/immigration-checklist'
import { registerComplianceWatch } from '@/lib/agents/compliance-watch'
import { registerWeeklySummary } from '@/lib/agents/weekly-summary'
import { registerMoneyOwedChase } from '@/lib/agents/money-owed-chase'
import { registerOutreachBatch } from '@/lib/agents/outreach-batch'
import { registerProposalsAgent } from '@/lib/agents/proposals-agent'

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
  registerConfirmationTracker()
  registerCensusKeeper()
  registerMatchRanker()
  registerInterviewChase()
  registerContractsChecklist()
  registerImmigrationChecklist()
  registerComplianceWatch()
  registerMoneyOwedChase()
  registerWeeklySummary()
  registerOutreachBatch()
  registerProposalsAgent()
  const out = await runAllAgents(new Date())
  return NextResponse.json({ data: { says: out.says, ran: out.ran.length, stopped: out.stopped, broke: out.broke } })
}
