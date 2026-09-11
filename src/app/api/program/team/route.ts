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
 * ── The lead approver ────────────────────────────────────────────────
 *
 * Not a new idea, and deliberately not a new column. An approval rule
 * with no threshold already means "approves whenever a check routes
 * something", which is exactly the escalation point a programme calls
 * its lead. Naming it here rather than modelling it twice keeps one
 * answer to who approves, instead of two that can disagree.
 */
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
        id: true, name: true, rank: true, thresholdAmount: true,
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

  // A rule with no threshold catches whatever routes and matches nothing
  // else. That is the lead, and there should be one — a programme where
  // every rule has a threshold has gaps nobody owns.
  const catchAll = rules.filter((r) => r.thresholdAmount === null)
  const lead = catchAll[0] ?? null

  return NextResponse.json({
    data: {
      company: { id: companyId, name: caller.company.name },
      lead: lead
        ? { ruleId: lead.id, personId: lead.approver.id, name: lead.approver.name }
        : null,
      // Said plainly rather than left to be noticed. Two people who both
      // catch everything will both be asked, every time.
      warnings: [
        ...(catchAll.length === 0
          ? ['No lead approver. Anything a check routes has nobody to go to.']
          : []),
        ...(catchAll.length > 1
          ? [`${catchAll.length} people are set to catch anything routed — they will all be asked.`]
          : []),
        ...(costCentres.some((c) => !c.owner)
          ? ['Some budgets have nobody answerable for them.']
          : []),
      ],
      approvers: rules.map((r) => ({
        id: r.id,
        name: r.name,
        rank: r.rank,
        approver: r.approver,
        department: r.orgUnit,
        // Dollars, matching what the settings route already returns, so
        // two screens do not describe one number in two units.
        thresholdDollars: r.thresholdAmount === null ? null : Number(r.thresholdAmount),
        isLead: r.thresholdAmount === null,
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
        approves: rules.filter((r) => r.approver.id === s.person.id).length,
        owns: costCentres.filter((c) => c.owner?.id === s.person.id).length,
      })),
    },
  })
}
