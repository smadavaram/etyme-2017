import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { waitingOnSays } from './words'
import { stageOf } from '@/lib/requisition-stage'
import { emit } from '@/lib/events'
import { ownPriceMedian } from '@/lib/chain-top'
import { unitsReachedBy } from '@/lib/resolve-client-company'
import { whoIsHiring } from './who-is-hiring'
import { sendJobTo } from './send'
import { regionScopeFor } from '@/lib/region-scope'
import { approvedSuppliersOf, siteSuppliers } from '@/lib/sites'
import { mayFillAtSite, notApprovedForCompany } from '@/lib/site-rules'
import { approvedAtWords, raisedSays, sentSays, placeOf } from '@/lib/job-site'
import { reachedOnlyThrough } from '@/app/api/suppliers/direct'
import { reportError } from '@/lib/alerts'
import {
  evaluateRequisition,
  type RuleKind,
  type Seat,
  annualValue,
  type RequisitionFacts,
  type ApprovalRuleFacts,
} from '@/lib/requisition-approval'
import { notifyBulk, type NotifyParams } from '@/lib/notify'
import { ancestry } from '@/lib/org-tree'

/**
 * GET  /api/requisitions   — what this client has open, with its approval state
 * POST /api/requisitions   — a hiring manager raises one
 *
 * The demand side of the marketplace. Until now a Requirement could only be
 * recorded by a vendor against demand it had heard about second-hand; a
 * client had no way to say what it needed. Everything downstream — budget,
 * governance, vendor distribution, the eventual contract's coding — hangs
 * off this object.
 *
 * Addendum E: most requisitions clear without a human. The decision, and the
 * facts behind it, are recorded either way (src/lib/requisition-approval.ts).
 *
 * ── Whose role it is ─────────────────────────────────────────────────
 *
 * The company hiring is the caller's own, unless they sit in a seat a
 * client granted them, in which case it is the client's (`seatedDesk`).
 *
 * It used to be `resolveProgram`, which answered "which client's program
 * may you read" — and for a prime, a GSI or an MSP with no seat that
 * answered "the first client you happen to place somebody at". So a
 * systems integrator opening a role for its own delivery team wrote a
 * requisition with `companyId` set to **its customer's** company: the
 * role, its approval chain and its cost center all landed on somebody
 * else's record. CLAUDE.md is explicit that a prime and a GSI buy as
 * well as sell — and when they buy, they buy for themselves.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const named = request.nextUrl.searchParams.get('clientCompanyId')
  const at = await whoIsHiring(caller, named)
  if (at.error) return at.error
  const { client, seat } = at

  // A seat granted over one business unit reads that unit's roles and
  // none of the others. Null for everybody else, which is the whole
  // program.
  const seatUnits = await unitsReachedBy(seat)

  // Archived rows are off the working list unless asked for. Filed as a
  // date rather than a status, so putting one away never overwrites what
  // actually happened to it — a cancelled requisition that is archived is
  // still cancelled.
  const includeArchived = request.nextUrl.searchParams.get('archived') === 'true'

  const requisitions = await prisma.requirement.findMany({
    where: {
      OR: [
        { companyId: client.id },
        { msa: { clientId: client.id } },
      ],
      ...(seatUnits ? { orgUnitId: { in: seatUnits } } : {}),
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    include: {
      site: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      orgUnit: { select: { id: true, name: true } },
      costCenter: { select: { id: true, code: true, name: true } },
      approvals: {
        include: { approver: { select: { id: true, name: true } } },
        orderBy: { rank: 'asc' },
      },
      _count: { select: { submissions: true, invitations: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    data: {
      client: { id: client.id, name: client.name },
      requisitions: requisitions.map(r => ({
        id: r.id,
        title: r.title,
        skills: r.skills,
        location: placeOf(r),
        site: r.site,
        headcount: r.headcount,
        billMin: r.billMin,
        billMax: r.billMax,
        months: r.months,
        // The edit form asks for it, so the list carries it.
        hoursPerWeek: r.hoursPerWeek,
        neededBy: r.neededBy?.toISOString() ?? null,
        description: r.description,
        justification: r.justification,
        status: r.status,
        approvalState: r.approvalState,
        // Whether it has been put away, and why it was called off. The
        // list could not tell either, so a cancelled requisition read as
        // an ordinary one and an archived one could not be put back.
        archivedAt: r.archivedAt?.toISOString() ?? null,
        cancelReason: r.cancelReason,
        raisedBy: r.raisedBy,
        // Whose need it is, when somebody else raised it; and the suppliers
        // Procurement cleared it for (empty: every approved supplier).
        owner: r.owner,
        clearedSupplierIds: r.clearedSupplierIds,
        interviewers: r.interviewers,
        orgUnit: r.orgUnit,
        costCenter: r.costCenter,
        // Who it waits on, said once here so the card and the job
        // request's own page cannot name two different people.
        waitingOn: waitingOnSays(r.approvals),
        approvals: r.approvals.map(a => ({
          stage: a.stage,
          id: a.id,
          approver: a.approver,
          rank: a.rank,
          outcome: a.outcome,
          reason: a.reason,
          decidedAt: a.decidedAt?.toISOString() ?? null,
        })),
        counts: {
          submissions: r._count.submissions,
          invitations: r._count.invitations,
        },
        createdAt: r.createdAt.toISOString(),
      })),
      summary: {
        // The rows on the working list — the same set the All tab counts
        // (`stageOf`). "All job requests 9" sat beside "All 2" because
        // this counted filled, closed and turned-down rows the tab puts
        // under Archived. The settled ones are counted apart and named.
        total: requisitions.filter(r => stageOf(r) !== 'ARCHIVED').length,
        settled: requisitions.filter(r => stageOf(r) === 'ARCHIVED').length,
        awaitingApproval: requisitions.filter(r => r.approvalState === 'PENDING_APPROVAL').length,
        autoCleared: requisitions.filter(r => r.approvalState === 'AUTO_APPROVED').length,
        open: requisitions.filter(r => r.status === 'OPEN').length,
      },
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  // Resolve the program first, then gate on the desk this caller is
  // actually sitting at. `acting` is the caller under the seat's role
  // where a client has granted one, and the caller themselves where it
  // has not (`lib/program-seat`).
  //
  // This order is the whole fix. Asked the other way round — the
  // caller's own `requirements.write` first — a program office was
  // refused on the client's own program: an MSP's own company has no
  // requisitions of its own to write, so its roles mostly do not carry
  // the permission, and the client's Program Manager role that the seat
  // holds does.
  const at = await whoIsHiring(caller, null)
  if (at.error) return at.error
  const { client, seat, acting } = at

  // Raising a requisition is the hiring manager's act, and only theirs.
  //
  // The line above establishes which client's program this is. It says
  // nothing about the seat, so every desk in the program office could
  // open a requisition: the approver who is meant to decide it, the AP
  // clerk who pays for it, the viewer who reads the program and changes
  // nothing. The role table has always split on this — the hiring
  // manager and the program manager hold `requirements.write`; the
  // approver, the HR partner, the procurement lead, the AP clerk, the
  // compliance officer and the viewer hold only `requirements.read`
  // (`lib/company-defaults`). GET on this same file asked the question
  // and POST did not.
  //
  // It is deliberately not `requirements.distribute`: raising the role
  // and choosing which suppliers see it are two desks on purpose, and
  // the procurement lead who holds the second does not get the first.
  if (!hasPermission(acting.permissions, 'requirements.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_HIRING',
          message:
            `Raising a job request is for whoever is hiring at ${client.name} — ` +
            'a hiring manager or the program manager. Ask them to open the job.',
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json()
  const {
    title, skills, location, headcount, billMin, billMax, months,
    neededBy, justification, costCenterId, orgUnitId, raisedById,
    budget, hoursPerWeek, description,
    overtimeAfterHours, overtimeMultiplierBps,
    // Whose need it is, when somebody raises it on their behalf.
    ownerId: ownerAsked,
    // The site, by id, and the suppliers ticked under "Send the job to"
    // (founder, 2026-10-28, the Sites drawing). Absent `sendTo` sends
    // nothing on the raise, as before; the form always sends it.
    locationId: siteAsked,
    sendTo: sendToAsked,
  } = body

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Title is required (min 3 characters)', field: 'title' } },
      { status: 422 }
    )
  }

  const heads = Number.isInteger(headcount) && headcount > 0 ? headcount : 1

  // ── Gather the facts the decision needs ──

  const costCenter = costCenterId
    ? await prisma.costCenter.findFirst({
        where: { id: costCenterId, companyId: client.id },
        include: {
          headcountPlans: { orderBy: { period: 'desc' }, take: 1 },
          // The lead: whoever owns the budget gives the final word.
          owner: { select: { id: true, name: true } },
          orgUnit: { select: { id: true, name: true } },
        },
      })
    : null

  if (costCenterId && !costCenter) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Cost center not found for this company' } },
      { status: 404 }
    )
  }

  // What is already committed against that cost center, from live contracts.
  let committedHeads = 0
  let committedSpendCents = 0
  if (costCenter) {
    const allocations = await prisma.contractCostAllocation.findMany({
      where: {
        costCenterId: costCenter.id,
        sellContract: { state: { in: ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'] } },
      },
      select: { shareBps: true, sellContract: { select: { billRate: true } } },
    })
    committedHeads = allocations.length
    committedSpendCents = allocations.reduce(
      (sum, a) => sum + Math.round((a.sellContract.billRate * 160 * 12 * a.shareBps) / 10_000),
      0
    )
  }

  // What this client already pays for these skills — the comparison that
  // makes a rate check meaningful rather than an abstract band.
  const skillMedianCents = await medianRateForSkills(client.id, Array.isArray(skills) ? skills : [])

  // A stated budget beats an estimate, and the answer says which it was.
  const value = annualValue({
    budgetCents: Number.isFinite(budget) ? Number(budget) : null,
    billMaxCents: billMax ?? null,
    headcount: heads,
    months: months ?? null,
    hoursPerWeek: Number.isFinite(hoursPerWeek) ? Number(hoursPerWeek) : null,
  })

  const facts: RequisitionFacts = {
    annualValueCents: value.cents,
    valueBasis: value.basis,
    valueSays: value.says,
    headcount: heads,
    billMaxCents: billMax ?? null,
    skillMedianCents,
    months: months ?? null,
    costCenter: costCenter
      ? {
          id: costCenter.id,
          code: costCenter.code,
          approvedHeads: costCenter.headcountPlans[0]?.approvedHeads ?? null,
          committedHeads,
          annualBudgetCents: costCenter.headcountPlans[0]
            ? Math.round(Number(costCenter.headcountPlans[0].annualBudget) * 100)
            : null,
          committedSpendCents,
        }
      : null,
  }

  // ── Which team's work this is ───────────────────────────────────────
  //
  // Taken from the budget when nobody said. A cost center already names
  // the department it funds, so asking twice for something the budget
  // knows is a question with a wrong answer available.
  const team = orgUnitId ?? costCenter?.orgUnitId ?? null

  // ── And who that makes responsible ─────────────────────────────────
  //
  // A rule attached to this team, or to any team above it, or to nobody
  // in particular — which is how indirect procurement and HR sit across
  // Apps, Security, Infrastructure, SaaS and both R&D groups at once
  // while each of those still has its own lead.
  //
  // Two things were wrong here. The match was exact, so a rule on
  // Technology never caught work raised in R&D 1 and had to be copied
  // onto every leaf; OrgUnit has carried a parentId from the first
  // commit and nothing walked it.
  //
  // And `orgUnitId ?? undefined` is not "no team". Prisma drops an
  // undefined filter, so that branch became {} and matched EVERY rule —
  // a requisition naming no team was sent to every team's approver.
  // Since the form has never set one, that was the ordinary path.
  const orgUnits = await prisma.orgUnit.findMany({
    where: { companyId: client.id },
    select: { id: true, parentId: true, name: true },
  })
  const responsible = ancestry(orgUnits, team)

  const ruleRows = await prisma.approvalRule.findMany({
    where: {
      companyId: client.id,
      isActive: true,
      OR: [
        // Company-wide: the central functions.
        { orgUnitId: null },
        // This team and everyone above it. Absent when the work names no
        // team, which leaves the company-wide rules alone rather than
        // everybody.
        ...(responsible.length > 0 ? [{ orgUnitId: { in: responsible } }] : []),
      ],
    },
    include: { approver: { select: { id: true, name: true } } },
    orderBy: { rank: 'asc' },
  })

  const rules: ApprovalRuleFacts[] = ruleRows.map(r => ({
    id: r.id,
    name: r.name,
    approverId: r.approverId,
    approverName: r.approver.name,
    thresholdCents: r.thresholdAmount ? Math.round(Number(r.thresholdAmount) * 100) : null,
    rank: r.rank,
    kind: r.kind as RuleKind,
    // Nearest wins: the unit's own desk over its parent's over the
    // company's. Company-wide is 0; the unit itself is the highest.
    specificity: r.orgUnitId ? responsible.length - responsible.indexOf(r.orgUnitId) : 0,
  }))

  // ── Who ───────────────────────────────────────────────────────────
  //
  // Who typed it, whose need it is, who owns the budget, and who sits
  // above them. The engine decides who is asked; this only finds them.
  const raiser = raisedById ?? caller.person.id
  const owner = typeof ownerAsked === 'string' && ownerAsked ? ownerAsked : raiser
  const lead: Seat | null = costCenter?.owner ? { personId: costCenter.owner.id, name: costCenter.owner.name } : null

  // One level up: the nearest ancestor unit whose cost center is owned
  // by somebody who is neither the raiser nor the owner nor the lead.
  let escalation: Seat | null = null
  const above = responsible.slice(1)
  if (above.length > 0) {
    const owned = await prisma.costCenter.findMany({
      where: { companyId: client.id, orgUnitId: { in: above }, ownerId: { not: null }, isActive: true },
      select: { orgUnitId: true, owner: { select: { id: true, name: true } } },
    })
    for (const unitId of above) {
      const cc = owned.find(c => c.orgUnitId === unitId && c.owner && ![raiser, owner, lead?.personId].includes(c.owner.id))
      if (cc?.owner) { escalation = { personId: cc.owner.id, name: cc.owner.name }; break }
    }
  }

  facts.raisedById = raiser
  facts.ownerId = owner
  facts.lead = lead
  facts.escalation = escalation
  facts.unitName = orgUnits.find(u => u.id === team)?.name ?? costCenter?.orgUnit?.name ?? null

  // A seat scoped to one business unit raises work in that unit and
  // nowhere else. Checked after the team is derived, because the team
  // can come from the cost center rather than from the form, and a
  // check on the field the form sent would have missed exactly that.
  const seatUnits = await unitsReachedBy(seat)
  if (seatUnits && (team === null || !seatUnits.includes(team))) {
    return NextResponse.json(
      {
        error: {
          code: 'OUTSIDE_YOUR_SEAT',
          message:
            `${caller.company!.name}'s role at ${client.name} covers one part of the program, and this job ` +
            `sits outside it. Raise it in a team your seat covers, or ask ${client.name} to widen the seat.`,
        },
      },
      { status: 403 }
    )
  }

  const decision = evaluateRequisition(facts, rules)

  if (decision.state === 'BLOCKED') {
    return NextResponse.json(
      { error: { code: 'BLOCKED', message: decision.summary, checks: decision.checks } },
      { status: 403 }
    )
  }

  // ── Where, and who it goes to ──────────────────────────────────────
  //
  // The site the job is at, by id, from the company's own sites (a seat
  // that reads one region, its region's). The form always names one, the
  // primary site pre-selected. A job raised with none named (an import, an
  // older caller) keeps no site: it reads as the primary site, goes to
  // every approved supplier, and its placement is at the primary site, as
  // every job was before sites ("skipping stops one thing only").
  const asked = typeof siteAsked === 'string' && siteAsked ? siteAsked : null
  const scope = asked ? await regionScopeFor(client.id, seat ? seat.orgUnitId : caller.orgUnitId) : null
  const found = asked
    ? await prisma.companyLocation.findFirst({
        where: { id: asked, companyId: client.id },
        select: { id: true, name: true, city: true },
      })
    : null
  const site = found && (!scope || scope.siteIds.includes(found.id)) ? found : null
  if (asked && !site) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOUR_SITE',
          message: scope
            ? `That site is outside ${scope.label}, the region you hire for. Pick one of its sites.`
            : `That site is not one of ${client.name}'s. Pick one of its sites.`,
          field: 'locationId',
        },
      },
      { status: 422 }
    )
  }

  // Each tick is a firm approved at the site, or, where the site names
  // nobody or there is no site, approved for the company. Refused in the
  // site's own sentence before anything is written.
  const sendTo: string[] | null = Array.isArray(sendToAsked)
    ? [...new Set(sendToAsked.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0))]
    : null
  let sendNames = new Map<string, { id: string; name: string }>()
  if (sendTo && sendTo.length > 0) {
    const [approvedFirms, here, belowAPrime] = await Promise.all([
      approvedSuppliersOf(client.id),
      site ? siteSuppliers(site.id) : Promise.resolve(null),
      reachedOnlyThrough(client.id),
    ])
    const approved = new Set(approvedFirms.map((f) => f.id))
    const names = await prisma.company.findMany({ where: { id: { in: sendTo } }, select: { id: true, name: true } })
    sendNames = new Map(names.map((c) => [c.id, c]))
    for (const vid of sendTo) {
      const firm = { id: vid, name: sendNames.get(vid)?.name ?? 'That firm' }
      const verdict = here
        ? mayFillAtSite({ supplier: firm, site: here.site, client: client.name, approved, atSite: here })
        : approved.has(vid) && !belowAPrime.has(vid)
          ? ({ ok: true } as const)
          : ({ ok: false, says: notApprovedForCompany(firm.name, client.name) } as const)
      if (!verdict.ok) {
        return NextResponse.json(
          { error: { code: 'NOT_APPROVED_AT_SITE', message: verdict.says, field: 'sendTo' } },
          { status: 403 }
        )
      }
    }
  }

  // ── Write it ──

  const requisition = await prisma.$transaction(async (tx) => {
    const req = await tx.requirement.create({
      data: {
        companyId: client.id, // the CLIENT owns this one
        title: title.trim(),
        skills: Array.isArray(skills) ? skills : [],
        // The free text stays, written as the site's name, for the readers
        // that still read it (lib/job-site's `placeOf` reads the site first).
        location: site ? site.name : (typeof location === 'string' && location.trim() ? location.trim() : null),
        locationId: site?.id ?? null,
        billMin: billMin ?? null,
        billMax: billMax ?? null,
        months: months ?? null,
        headcount: heads,
        neededBy: neededBy ? new Date(neededBy) : null,
        description:
          typeof description === 'string' && description.trim() ? description.trim() : null,
        justification: justification ?? null,
        budgetCents: Number.isFinite(budget) && Number(budget) > 0 ? Number(budget) : null,
        hoursPerWeek: Number.isFinite(hoursPerWeek) && Number(hoursPerWeek) > 0 ? Number(hoursPerWeek) : null,
        // Straight time unless the role says otherwise. A rate that
        // multiplies itself because a field was left blank is the kind
        // of error that reaches an invoice before anybody notices.
        overtimeAfterHours:
          Number.isFinite(overtimeAfterHours) && Number(overtimeAfterHours) > 0 ? Number(overtimeAfterHours) : null,
        ...(Number.isFinite(overtimeMultiplierBps) && Number(overtimeMultiplierBps) > 0
          ? { overtimeMultiplierBps: Number(overtimeMultiplierBps) }
          : {}),
        costCenterId: costCenter?.id ?? null,
        orgUnitId: team,
        raisedById: raiser,
        ownerId: owner,
        approvalState: decision.state,
        // Only an approved requisition reaches the market.
        status: decision.state === 'AUTO_APPROVED' ? 'OPEN' : 'DRAFT',
        source: 'MANUAL',
      },
    })

    // Record the chain, one row per desk — the ones cleared by rule as
    // much as the ones asked, so a requisition nobody looked at can still
    // be explained a year later, desk by desk.
    const now = new Date()
    await tx.requirementApproval.createMany({
      data: decision.steps.map(st => ({
        requirementId: req.id,
        approverId: st.approverId,
        rank: st.rank,
        stage: st.stage,
        outcome: st.outcome,
        reason: st.reason,
        decidedAt: st.outcome === 'AUTO_CLEARED' ? now : null,
      })),
    })

    await tx.automationLog.create({
      data: {
        companyId: client.id,
        action: decision.state === 'AUTO_APPROVED' ? 'REQUISITION_AUTO_CLEARED' : 'REQUISITION_ROUTED',
        summary: `${title.trim()} (${heads} head${heads === 1 ? '' : 's'}) — ${decision.summary}`,
        reason: decision.checks.map(c => `${c.code}: ${c.reason}`).join(' · '),
        payload: {
          requirementId: req.id,
          checks: decision.checks as any,
          annualValueCents: value.cents,
          valueBasis: value.basis,
          route: decision.route.map(r => ({ approverId: r.approverId, name: r.approverName })),
        },
        reversible: true,
      },
    })

    return req
  })

  // Emitted after the transaction, not inside it. An event describing a
  // requisition that then failed to commit is a lie an integration would
  // act on.
  void emit({
    type: 'requisition.raised',
    companyId: client.id,
    subjectType: 'Requirement',
    subjectId: requisition.id,
    actorPersonId: caller.person.id,
    payload: {
      title: title.trim(),
      heads,
      annualValueCents: value.cents,
      // Whether it needed a human at all. The headline number for any
      // program is the share that cleared without one.
      autoCleared: decision.state === 'AUTO_APPROVED',
      approverCount: decision.route.length,
    },
  })

  // ── A job that published itself goes to the suppliers ticked ────────
  //
  // Who sees a job is the program's choice, not the hiring manager's
  // (lib/company-defaults). With sites, the program made it per site,
  // under Settings → Sites; the hiring manager only narrows within it, so
  // a job that clears by rule goes out on the raise rather than waiting
  // for somebody to send what the site already says. A job routed for
  // approval goes out from its own page once approved, with the site's
  // suppliers ticked there by default.
  let sentTo: string[] = []
  if (requisition.status === 'OPEN' && sendTo && sendTo.length > 0) {
    try {
      const results = await sendJobTo({
        requisition: {
          id: requisition.id, title: requisition.title, companyId: client.id, company: client,
          headcount: requisition.headcount, location: requisition.location,
          site: site ? { name: site.name } : null, startDate: requisition.startDate,
        },
        vendors: sendTo.map((companyId) => ({ companyId })),
        vendorMap: sendNames,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        caller,
        reason: (names) =>
          `Sent when it cleared by rule, to the suppliers ${caller.person.name} ticked` +
          `${site ? ` ${approvedAtWords(site)}` : ''}: ${names.join(', ') || 'nobody'}`,
      })
      sentTo = results.filter((r) => r.status === 'sent').map((r) => r.name)
    } catch (err) {
      // The job stands; it can still be sent from its own page.
      reportError(`${requisition.title} was raised and could not be sent to its suppliers:`, err)
    }
  }

  // Tell the approvers there is something waiting.
  if (decision.route.length > 0) {
    const notifications: NotifyParams[] = decision.route.map(r => ({
      personId: r.approverId,
      companyId: client.id,
      type: 'SYSTEM',
      title: `Job request needs your approval: ${title.trim()}`,
      body: decision.summary,
      entityId: requisition.id,
      data: { requirementId: requisition.id, checks: decision.checks as any },
    }))
    notifyBulk(notifications)
  }

  return NextResponse.json(
    {
      data: {
        requisition: {
          id: requisition.id,
          title: requisition.title,
          headcount: requisition.headcount,
          approvalState: requisition.approvalState,
          status: requisition.status,
        },
        decision: {
          state: decision.state,
          summary: decision.summary,
          checks: decision.checks,
          route: decision.route.map(r => ({ approverId: r.approverId, name: r.approverName, rank: r.rank })),
          // Desk by desk: what cleared by rule, who is asked, and why.
          steps: decision.steps.map(st => ({
            stage: st.stage, rank: st.rank, approverName: st.approverName, outcome: st.outcome, reason: st.reason,
          })),
        },
        // The figure, and where it came from — so the person reading a
        // routing decision can see whether it rests on their own budget
        // or on an estimate.
        annualValue: value.cents / 100,
        valueBasis: value.basis,
        valueSays: value.says,
        site: site ? { id: site.id, name: site.name } : null,
        sentTo,
        sentSays: sentSays({ open: decision.state === 'AUTO_APPROVED', sentTo, ticked: sendTo?.length ?? 0, site }),
        message: raisedSays({
          open: decision.state === 'AUTO_APPROVED',
          summary: decision.summary,
          sentTo,
          ticked: sendTo?.length ?? 0,
          site,
        }),
      },
    },
    { status: 201 }
  )
}

/**
 * The median hourly rate this client already pays for any of these skills.
 * Comparing against what they actually pay beats an abstract market band,
 * and it reuses the same signal the org view surfaces as rate variance.
 *
 * Its own prices, which means the contracts it is billed on. This asked
 * where the work happens instead, and in a chain every rung names the
 * same site — so the benchmark a hiring manager was shown blended its
 * prime's cost into its own prices and read low by the whole of
 * somebody else's margin. The arithmetic is `ownPriceMedian` in
 * lib/chain-top, shared with the single-requisition reading so the two
 * cannot drift.
 */
async function medianRateForSkills(
  clientId: string,
  skills: string[]
): Promise<number | null> {
  if (skills.length === 0) return null

  const contracts = await prisma.sellContract.findMany({
    where: {
      clientCompanyId: clientId,
      state: { in: ['IN_PROGRESS', 'VERIFIED'] },
    },
    select: {
      clientCompanyId: true,
      billRate: true,
      person: { select: { consultant: { select: { skills: true } } } },
    },
  })

  return ownPriceMedian(
    contracts.map(c => ({
      clientCompanyId: c.clientCompanyId,
      billRate: c.billRate,
      skills: c.person.consultant?.skills ?? [],
    })),
    clientId,
    skills
  )
}
