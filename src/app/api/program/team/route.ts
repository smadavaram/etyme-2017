import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'

/**
 * GET /api/program/team — who runs this client's contingent programme.
 *
 * Three facts that belonged together and were kept in three places:
 * who has a seat here, who approves what, and who is answerable for
 * which budget. Setting a programme up meant visiting users, then
 * approval rules, then cost centres, and nothing showed the result as
 * one picture — so "who signs off on Engineering's contractors" had no
 * screen that answered it.
 *
 * ── Three desks, not one chain ───────────────────────────────────────
 *
 * This answered "who approves" with one ranked list, because that was
 * the chain: over a dollar line, a person. It is now three desks with
 * three different questions (src/lib/requisition-approval.ts) — HR reads
 * the role, Procurement reads the suppliers and the rate, and the lead
 * who owns the cost centre gives the one human yes on the money. HR and
 * Procurement are standing desks named per business unit and inherited
 * down the tree, so a desk on Technology answers for Apps.
 *
 * So the screen has to answer three questions, and this route answers
 * them separately: who is HR and who is Procurement for each unit, which
 * rules still sit on the money, and which budgets have nobody answerable
 * for them.
 *
 * ── Why the warnings changed ─────────────────────────────────────────
 *
 * "No lead approver. Anything a check routes has nobody to go to." was
 * true of the old chain and is false of this one: a miss with no desk
 * named clears WITH THE NOTE IN PLAIN SIGHT rather than waiting on
 * nobody. So the warning has to say what actually happens — "requisitions
 * over plan in Apps clear with a note" — and what to do about it. A
 * warning that misdescribes the consequence teaches people to ignore
 * warnings.
 *
 * And it counted HR and Procurement as people "set to catch anything
 * routed", because a desk has no threshold. Three desks read as three
 * duplicated leads.
 */

/** A desk, and the unit it was actually named on. */
interface Desk {
  ruleId: string
  person: { id: string; name: string }
  /** The unit the rule sits on — the same unit, or one above it. */
  from: { id: string; name: string }
  /** True when it was named further up and this unit inherits it. */
  inherited: boolean
}

/**
 * Which HR and which Procurement desk answer for each unit.
 *
 * Nearest wins, walking up the tree: a business unit's own HR partner
 * outranks the one named on the parent, which is the same rule the
 * engine applies when it builds a chain (`deskFor`, by specificity). The
 * walk is here rather than imported because a route file may only export
 * its HTTP handlers; it is lifted and run by
 * __tests__/invariants/requisition-chain-screens.test.ts.
 */
function resolveDesks(
  units: { id: string; name: string; parentId: string | null }[],
  rules: { id: string; kind: string; orgUnitId: string | null; approver: { id: string; name: string } }[]
): Record<string, { hr: Desk | null; procurement: Desk | null }> {
  const byId = new Map(units.map((u) => [u.id, u]))
  const out: Record<string, { hr: Desk | null; procurement: Desk | null }> = {}

  const find = (startId: string, kind: string): Desk | null => {
    // The unit itself, then its parent, then its parent — bounded, because
    // somebody will one day drag a parent under its own child.
    let at: string | null = startId
    const seen: string[] = []
    while (at && seen.length < 32) {
      if (seen.includes(at)) break
      seen.push(at)
      const hit = rules.find((r) => r.kind === kind && r.orgUnitId === at)
      if (hit) {
        const on = byId.get(at)
        return {
          ruleId: hit.id,
          person: hit.approver,
          from: { id: at, name: on?.name ?? 'this unit' },
          inherited: at !== startId,
        }
      }
      at = byId.get(at)?.parentId ?? null
    }
    return null
  }

  for (const u of units) {
    out[u.id] = { hr: find(u.id, 'HR'), procurement: find(u.id, 'PROCUREMENT') }
  }
  return out
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A programme belongs to a company' } },
      { status: 403 }
    )
  }

  // Reading who approves is not the same as changing it. Anybody who can
  // raise a requisition needs to know where the line is; moving the line
  // is settings.manage, enforced on the writes rather than here.
  if (
    !hasPermission(caller.permissions, 'requirements.write') &&
    !hasPermission(caller.permissions, 'settings.manage') &&
    !hasPermission(caller.permissions, 'team.manage')
  ) {
    // A sentence, not a code. The AP clerk at Nike read "needs
    // requirements.write" on a phone and had no idea what to do about
    // it. The code is for the machine; the sentence says who they are
    // not and who can change that.
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            `You are not on the programme team at ${caller.company.name}. ` +
            'Whoever runs the programme can add you.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id

  const [seats, rules, orgUnits, costCentres] = await Promise.all([
    prisma.context.findMany({
      where: { companyId, revokedAt: null, NOT: { roleId: null } },
      orderBy: { grantedAt: 'asc' },
      select: {
        id: true, grantedAt: true, expiresAt: true,
        person: { select: { id: true, name: true, primaryEmail: true } },
        role: { select: { id: true, name: true } },
      },
    }),
    prisma.approvalRule.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ rank: 'asc' }],
      select: {
        id: true, name: true, rank: true, thresholdAmount: true, kind: true,
        orgUnitId: true,
        approver: { select: { id: true, name: true } },
        orgUnit: { select: { id: true, name: true } },
      },
    }),
    prisma.orgUnit.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, kind: true, parentId: true },
    }),
    prisma.costCenter.findMany({
      where: { companyId, isActive: true },
      orderBy: { code: 'asc' },
      select: {
        id: true, code: true, name: true,
        owner: { select: { id: true, name: true } },
        orgUnit: { select: { id: true, name: true } },
        headcountPlans: {
          orderBy: { period: 'desc' }, take: 1,
          select: { period: true, approvedHeads: true, annualBudget: true },
        },
      },
    }),
  ])

  // A rule on the money with no threshold catches whatever routes and
  // matches nothing else — the old "programme lead". A desk has no
  // threshold either, and counting one as a lead is what made three desks
  // read as three duplicated leads.
  const moneyRules = rules.filter((r) => (r.kind ?? 'VALUE') === 'VALUE')
  const catchAll = moneyRules.filter((r) => r.thresholdAmount === null)
  const lead = catchAll[0] ?? null

  const desks = resolveDesks(
    orgUnits.map((u) => ({ id: u.id, name: u.name, parentId: u.parentId })),
    rules.map((r) => ({ id: r.id, kind: r.kind ?? 'VALUE', orgUnitId: r.orgUnitId, approver: r.approver }))
  )

  // Only the units money is actually charged to. A unit with no cost
  // centre has no requisition to route, so warning about it is noise.
  const unitsWithBudgets = orgUnits.filter((u) => costCentres.some((c) => c.orgUnit?.id === u.id))

  return NextResponse.json({
    data: {
      company: { id: companyId, name: caller.company.name },
      lead: lead
        ? { ruleId: lead.id, personId: lead.approver.id, name: lead.approver.name }
        : null,
      // What is missing, and what that means for the next requisition —
      // never the name of the thing that is missing on its own. A miss
      // with no desk named clears with a note rather than waiting on
      // nobody, so the sentence has to say that.
      warnings: [
        ...unitsWithBudgets.flatMap((u) => {
          const d = desks[u.id] ?? { hr: null, procurement: null }
          return [
            ...(d.hr
              ? []
              : [`Requisitions over the plan in ${u.name} clear with a note — name an HR desk for ${u.name}, or for the unit above it.`]),
            ...(d.procurement
              ? []
              : [`Requisitions above the going rate in ${u.name} clear with a note — name a Procurement desk for ${u.name}, or for the unit above it.`]),
          ]
        }),
        ...costCentres
          .filter((c) => !c.owner)
          .map((c) => `${c.code} has nobody answerable for it, so nothing charged to it has a lead to give the final word.`),
        ...(catchAll.length > 1
          ? [`${catchAll.length} rules on the money catch anything that routes — all of them will be asked, every time.`]
          : []),
      ],
      // Who reads the role and who reads the suppliers, per unit. A desk
      // named on a parent answers for everything under it, and says so,
      // rather than being copied onto every leaf.
      desks: orgUnits.map((u) => ({
        unit: { id: u.id, name: u.name, kind: u.kind, parentId: u.parentId },
        hr: desks[u.id]?.hr ?? null,
        procurement: desks[u.id]?.procurement ?? null,
        /** True where money is charged here, so a gap actually bites. */
        charges: costCentres.some((c) => c.orgUnit?.id === u.id),
      })),
      approvers: rules.map((r) => ({
        id: r.id,
        name: r.name,
        rank: r.rank,
        // VALUE sits on the money; HR and PROCUREMENT name a standing
        // desk. Without this the screen cannot tell a threshold from a
        // desk, and showed both as "asked whenever a check routes".
        kind: r.kind ?? 'VALUE',
        approver: r.approver,
        department: r.orgUnit,
        // Dollars, matching what the settings route already returns, so
        // two screens do not describe one number in two units.
        thresholdDollars: r.thresholdAmount === null ? null : Number(r.thresholdAmount),
        isLead: (r.kind ?? 'VALUE') === 'VALUE' && r.thresholdAmount === null,
      })),
      budgets: costCentres.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        owner: c.owner,
        department: c.orgUnit,
        plan: c.headcountPlans[0]
          ? {
              period: c.headcountPlans[0].period,
              approvedHeads: c.headcountPlans[0].approvedHeads,
              annualBudget: Number(c.headcountPlans[0].annualBudget),
            }
          : null,
      })),
      // The teams a rule can be scoped to. A rule on a parent is
      // responsible for everything beneath it, so the whole tree is
      // offered rather than only the units that happen to hold a budget.
      teams: orgUnits.map((u) => ({
        id: u.id, name: u.name, kind: u.kind, parentId: u.parentId,
      })),
      people: seats.map((s) => ({
        contextId: s.id,
        person: s.person,
        role: s.role,
        grantedAt: s.grantedAt?.toISOString() ?? null,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        // What this person does on the programme, rather than what the
        // permission table calls them.
        approves: moneyRules.filter((r) => r.approver.id === s.person.id).length,
        owns: costCentres.filter((c) => c.owner?.id === s.person.id).length,
        // The desks they hold, by the unit they hold them for. "HR for
        // Technology" is what this person does; "approves 2 rules" is not.
        holds: rules
          .filter((r) => r.approver.id === s.person.id && (r.kind ?? 'VALUE') !== 'VALUE')
          .map((r) => ({
            kind: r.kind as 'HR' | 'PROCUREMENT',
            unit: r.orgUnit?.name ?? 'everywhere',
          })),
      })),
    },
  })
}
