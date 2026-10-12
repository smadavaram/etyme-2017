import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { askTheDesk, hasAnyPermission, hasPermission } from '@/lib/permissions'
import { ruleSetFor, setRuleSet } from '@/lib/twin/rule-set'

/**
 * GET /api/twin/rule-set — the numbers the twin's rules run on here.
 * PUT /api/twin/rule-set — a new version { tenureWarnAtDays, hoursTolerancePct, reason }.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Choose a company seat first.' } }, { status: 403 })
  }
  if (!hasAnyPermission(caller.permissions, ['governance.read', 'settings.manage'])) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Reading the twin’s rules', needs: ['governance.read', 'settings.manage'], kind: caller.company.kind, companyName: caller.company.name }) } },
      { status: 403 }
    )
  }
  return NextResponse.json({ data: await ruleSetFor(caller.company.id) })
}

export async function PUT(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Choose a company seat first.' } }, { status: 403 })
  }
  if (caller.isService || !hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Changing the twin’s rules', needs: 'settings.manage', kind: caller.company.kind, companyName: caller.company.name }) } },
      { status: 403 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const pct = Number(body.hoursTolerancePct)
  const out = await setRuleSet({
    companyId: caller.company.id,
    personId: caller.person.id,
    reason: typeof body.reason === 'string' ? body.reason : '',
    tenureWarnAtDays: Array.isArray(body.tenureWarnAtDays) ? body.tenureWarnAtDays.map(Number) : [],
    hoursToleranceBps: Number.isFinite(pct) ? Math.round(pct * 100) : NaN,
  })
  if (!out.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: out.says.join(' '), problems: out.says } }, { status: 422 })
  }
  return NextResponse.json({ data: { version: out.version, note: `Saved as version ${out.version}. Earlier versions are kept.` } })
}
