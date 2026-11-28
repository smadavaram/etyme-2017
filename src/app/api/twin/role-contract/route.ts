import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { mayEditTwin, TWIN_EDITORS } from '@/lib/twin/readers'
import { askTheDesk, hasAnyPermission } from '@/lib/permissions'
import { TWIN_ACTS, twinActsFor } from '@/lib/autonomy'
import { contractFor, setContract, tierIn, twinKindFor } from '@/lib/twin/role-contract'

/**
 * GET /api/twin/role-contract — what this company's twin may do here, act
 * by act, with the version and who set it. A client's twin is the program
 * manager's; a firm that sells people has the supplier's (`twinKindFor`).
 * Only the twin's own acts are listed; another twin's are never here.
 * PUT /api/twin/role-contract — a new version { actsAlone, needsApproval,
 * neverTouches, reason }, by the program manager's desk or the settings desk
 * (TWIN_EDITORS in lib/twin/readers). Never an overwrite; refused in sentences where
 * it would loosen what stays with a person (`checkContract`).
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Choose a company seat first.' } }, { status: 403 })
  }
  if (!hasAnyPermission(caller.permissions, ['governance.read', 'settings.manage'])) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Reading the twin’s role contract', needs: ['governance.read', 'settings.manage'], kind: caller.company.kind, companyName: caller.company.name }) } },
      { status: 403 }
    )
  }
  const kind = twinKindFor(caller.company.kind)
  const contract = await contractFor(caller.company.id, kind)
  return NextResponse.json({
    data: {
      twin: kind,
      version: contract.version,
      isDefault: contract.version === 0,
      acts: twinActsFor(kind).map((a) => ({
        action: a,
        says: TWIN_ACTS[a].says,
        tier: tierIn(contract, a),
        staysWithAPerson: TWIN_ACTS[a].floor,
        movesMoney: TWIN_ACTS[a].money,
        leavesTheCompany: TWIN_ACTS[a].external,
      })),
    },
  })
}

export async function PUT(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Choose a company seat first.' } }, { status: 403 })
  }
  if (caller.isService || !mayEditTwin(caller.permissions)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Changing what the twin may do', needs: [...TWIN_EDITORS], kind: caller.company.kind, companyName: caller.company.name }) } },
      { status: 403 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
  const out = await setContract({
    companyId: caller.company.id,
    kind: twinKindFor(caller.company.kind),
    personId: caller.person.id,
    reason: typeof body.reason === 'string' ? body.reason : '',
    actsAlone: list(body.actsAlone),
    needsApproval: list(body.needsApproval),
    neverTouches: list(body.neverTouches),
  })
  if (!out.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: out.says.join(' '), problems: out.says } }, { status: 422 })
  }
  return NextResponse.json({ data: { version: out.version, note: `Saved as version ${out.version}. Earlier versions are kept.` } })
}
