import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { partiesOf, mayBillUnder } from '@/lib/money/invoice-parties'
import { generateBill, BILLABLE_LINE_STATES } from '@/lib/money/bill-generate'
import { billChoiceLabel } from '@/lib/money/bill-choice'
import { waitsOnSays, type BillWaitsInput } from '@/lib/money/nothing-to-bill'
import { desksHolding } from '@/lib/permissions'
import { seatedWhoMay, notYourButton } from '@/lib/refusal-words'
import { seatedRoles } from '@/app/api/contracts/[id]/activate/gate'
import { mayOpen } from '@/lib/nav-table'
import { recordedContactsFor } from '@/lib/week-approval'
import { whoRaisesBillsSays } from '@/lib/money/who-raises-bills'

/**
 * GET /api/invoices/generate — the engagements this firm may bill.
 *
 * ── Why a route and not a filter on the screen ───────────────────────
 *
 * The release walk of 2026-09-21, from the seat Cavanaugh Glassworks
 * granted Aptiva Workforce: Invoices → "+ Generate" → a picker holding
 * an engagement that belongs to a supplier, and a 403 on pressing the
 * button — *"This engagement is Arcadia Tech Group's to bill, not
 * Aptiva Workforce's."*
 *
 * The sentence was right and the picker was the bug. It was built out
 * of `/api/contracts?side=sell`, which answers "what may this seat
 * read" — and a program office sitting at a client's desk may read the
 * client's whole book. Reading is not billing. So a picker built on a
 * read permission offers an office every one of its client's suppliers'
 * deals and lets it press the button on each.
 *
 * This answers the question the button actually asks. It runs the same
 * `mayBillUnder` the POST refuses on, over the same `partiesOf`
 * cascade, so the list and the gate are one rule with one spelling.
 *
 * An empty answer is an answer, and it carries a sentence: a firm with
 * nothing to bill is told why rather than offered a control that will
 * refuse it.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    // The same sentence the button gets, from the same register of
    // which desks actually hold it — two hand-written lists of desks
    // are two lists that drift.
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: await whoRaisesBillsSays(caller),
        },
      },
      { status: 403 }
    )
  }

  // Every engagement with a live line on it that names this firm
  // somewhere. Narrowed to what may actually be billed below; asking
  // the database for "ours" first keeps the page off every engagement
  // in the world.
  // A running line, or an ended one still holding a signed week nobody
  // billed: the generator bills both (`BILLABLE_LINE_STATES`), and a
  // picker that dropped ended placements hid the one bill a firm most
  // needs to raise, for work already done (Karthik Menon's fourteen
  // weeks, the founder's walk of 2026-10-19).
  const engagements = await prisma.engagement.findMany({
    where: {
      sellContracts: {
        some: {
          OR: [
            { state: 'IN_PROGRESS' },
            {
              state: 'ENDED',
              timesheets: {
                some: {
                  assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } },
                  invoiceLines: { none: {} },
                },
              },
            },
          ],
        },
      },
      OR: [
        { msa: { vendorId: caller.company!.id } },
        { workOrders: { some: { issuedToId: caller.company!.id } } },
        { sellContracts: { some: { companyId: caller.company!.id } } },
      ],
    },
    select: {
      id: true,
      title: true,
      msa: {
        select: {
          vendorId: true, clientId: true,
          vendor: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      },
      workOrders: {
        select: {
          number: true,
          issuedById: true, issuedToId: true,
          issuedBy: { select: { id: true, name: true } },
          issuedTo: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
      sellContracts: {
        where: { state: { in: [...BILLABLE_LINE_STATES] } },
        select: {
          companyId: true, clientCompanyId: true,
          company: { select: { id: true, name: true } },
          clientCompany: { select: { id: true, name: true } },
          endClientCompany: { select: { id: true, name: true } },
          // What the choice is called: the person, and the signed weeks
          // not yet on a live bill (lib/money/bill-choice).
          person: { select: { name: true } },
          timesheets: {
            where: {
              assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } },
              // Not on a live bill of this firm's; a rung above or below
              // bills the same week on its own line.
              invoiceLines: { none: { sellContract: { companyId: caller.company!.id }, invoice: { status: { notIn: ['CANCELLED', 'VOID'] } } } },
            },
            select: { periodStart: true, periodEnd: true },
            take: 60,
          },
        },
      },
    },
    // Ties broken by id, so the picker lists the same order on every load.
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
    take: 200,
  })

  const billable = []
  /** Per engagement offered: who is on it, and whether its next bill waits on a step. */
  const steps: Array<{ people: string[]; ownSigned: boolean; id: string }> = []
  for (const e of engagements) {
    const parties = partiesOf({
      agreement: e.msa,
      order: e.workOrders[0] ?? null,
      lines: e.sellContracts,
    })
    if (!mayBillUnder(parties, caller.company).ok) continue

    const clientName =
      e.sellContracts[0]?.endClientCompany?.name ??
      parties.client?.name ??
      null
    // This firm's own lines only: a rung below bills its own.
    const own = e.sellContracts.filter((l) => l.companyId === caller.company!.id)
    billable.push({
      id: e.id,
      title: e.title,
      // "<person> · <week or weeks> · <customer>", the way the trade says
      // which bill it means; never a job title alone.
      label: billChoiceLabel({
        people: own.map((l) => l.person?.name ?? '').filter(Boolean),
        weeks: own.flatMap((l) => l.timesheets.map((t) => ({ start: t.periodStart, end: t.periodEnd }))),
        clientName,
        title: e.title,
      }),
      // Who the bill would go to. The end client where a line names one
      // — that is the firm on the paper — and the customer on the line
      // otherwise. Never a guess: null where nothing says, and the
      // screen prints the engagement's own name alone.
      clientName,
      says: parties.says,
    })
    steps.push({
      id: e.id,
      people: own.map((l) => l.person?.name ?? '').filter(Boolean),
      ownSigned: own.some((l) => l.timesheets.length > 0),
    })
  }

  const waits = await whatTheBillWaitsOn(caller, steps)
  return NextResponse.json({
    data: {
      engagements: billable,
      // Whether anything can be billed now. The Bills page draws its button
      // only where it can, and the same sentence in its place where not.
      canBill: waits.canBill,
      says: waits.says,
      link: waits.link,
    },
  })
}

/**
 * How many engagements one load dry-runs through the generator. Past it
 * the button is drawn as before, and the dialog says the rest when pressed:
 * a firm with that many placements is never told it has nothing to bill
 * from a partial read.
 */
const DRY_RUNS_PER_LOAD = 20

/**
 * Which step this firm's next bill waits on (lib/money/nothing-to-bill,
 * `waitsOnSays`), from facts read here and the one generator's own dry run.
 * Never a second rule for what is billable: an engagement holding a signed
 * week on its own line is billable as the picker already says, and every
 * other engagement is asked of the generator, which writes nothing.
 */
async function whatTheBillWaitsOn(
  caller: CallerContext,
  steps: Array<{ people: string[]; ownSigned: boolean; id: string }>
) {
  const company = caller.company!
  const kind = company.kind
  const billsPlacements = kind !== 'CLIENT' && kind !== 'MSP'

  const engagements: BillWaitsInput['engagements'][number][] = []
  if (!steps.some((s) => s.ownSigned)) {
    if (steps.length > DRY_RUNS_PER_LOAD) {
      engagements.push({ people: [], noHours: null })
    } else {
      const who = { company: { id: company.id, name: company.name, kind }, person: { id: caller.person.id, name: caller.person.name } }
      for (const s of steps) {
        const out = await generateBill(who, { engagementId: s.id }, { dryRun: true })
        engagements.push({
          people: s.people,
          noHours: !out.ok && out.status === 422 && out.body.error.code === 'NO_TIMESHEETS' && out.noHours ? out.noHours : null,
        })
      }
    }
  } else {
    engagements.push({ people: [], noHours: null })
  }

  // The week its approval would be attached on, for a client not on Etyme:
  // where nobody there who approves hours is recorded, the attach is
  // refused (the week page's own rule, `approverIsKnownAtClient`), so the
  // sentence says to add that person first. The same record the week reads.
  const attachOn = engagements.map((e) => e.noHours?.waitingWeek).find((w) => w && !w.clientOnEtyme) ?? null
  if (attachOn) {
    const sheet = await prisma.timesheet.findUnique({
      where: { id: attachOn.id },
      select: {
        person: { select: { primaryEmail: true } },
        sellContract: {
          select: {
            clientCompany: { select: { id: true, name: true, listedById: true } },
            endClientCompany: { select: { id: true, name: true, listedById: true } },
          },
        },
      },
    })
    const top = sheet?.sellContract?.endClientCompany ?? sheet?.sellContract?.clientCompany ?? null
    if (top) {
      const recorded = top.listedById
        ? await recordedContactsFor(top.id, top.listedById, { excludeEmails: [sheet?.person?.primaryEmail] })
        : []
      if (recorded.length === 0) attachOn.noApproverAt = top.name
    }
  }

  const placed = engagements.length === 0 && billsPlacements
    ? await prisma.sellContract.findMany({
        where: { companyId: company.id, state: { not: 'CANCELLED' } },
        select: { state: true, person: { select: { name: true } } },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        take: 200,
      })
    : []

  const mayRecord = hasPermission(caller.permissions, 'assignments.write') && mayOpen('/dashboard/contracts', caller.permissions)
  const mayAttach = hasPermission(caller.permissions, 'timesheets.approve') && mayOpen('/dashboard/weeks/a-week', caller.permissions)
  const seated = !mayRecord || !mayAttach ? (await seatedRoles(company.id)) ?? [] : []
  return waitsOnSays({
    companyName: company.name,
    billsPlacements,
    placed: placed.map((l) => ({
      personName: l.person?.name ?? 'Somebody',
      started: !['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'].includes(l.state),
      paused: l.state === 'PAUSED',
    })),
    runsPrograms: kind === 'MSP',
    engagements,
    mayRecord,
    whoRecords: mayRecord ? null : notYourButton('recording a placement', seatedWhoMay(desksHolding('assignments.write', kind), seated)),
    mayAttach,
    whoAttaches: mayAttach ? null : notYourButton('attaching the client’s approval', seatedWhoMay(desksHolding('timesheets.approve', kind), seated)),
    // Contacts asks for no permission; a seat that sees only its own work is refused it.
    mayAddContact: caller.context.type !== 'CONSULTANT' && mayOpen('/dashboard/contacts', caller.permissions),
  })
}

/**
 * POST /api/invoices/generate
 *
 * BUILD.md §3: "from approved, uninvoiced timesheets"
 *
 * LEGACY_RULES.md §4:
 *   - Invoice numbering: IN_{contract_number}_{sequential_three_digit_padded}
 *   - total_amount = (total_time_in_seconds / 3600) × contract rate
 *   - Guard: cannot generate if time <= 0 or rate <= 0
 *   - Due date: periodEnd + paymentTerms days
 *
 * Groups approved timesheets by engagement, calculates line items per
 * sell contract, then creates one Invoice per engagement covering the period.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: await whoRaisesBillsSays(caller),
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json()
  // One way a bill is made, here and from the supplier's twin
  // (lib/money/bill-generate), so the two can never price a week twice
  // or two ways.
  const out = await generateBill(
    { company: { id: caller.company!.id, name: caller.company!.name, kind: caller.company!.kind }, person: { id: caller.person.id, name: caller.person.name } },
    body ?? {}
  )
  return NextResponse.json(out.body, { status: out.status })
}
