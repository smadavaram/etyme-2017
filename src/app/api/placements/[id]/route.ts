import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logAccess } from '@/lib/access-log'
import { canReadPayRate, canReadBillRate, canReadMargin } from '@/lib/permissions'
import { descend } from '@/lib/work-chain'
import { ladderFor } from '@/lib/work-chain-read'
import { categoryOf, labelOf } from '@/lib/cycle-kinds'
import { contractClearance } from '@/lib/contract-clearance'

/**
 * GET /api/placements/:id
 *
 * One person, one client, top to bottom — the whole life of a placement
 * in a single answer.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The build had sixty list screens and four things you could open. A
 * vendor could see sets of records and could not follow one placement
 * through its life, which is the only thing anybody actually wants to
 * do: where did this person come from, who sent them, what did we
 * agree, are they cleared to work, did they file their hours, have we
 * been paid, and what did we make.
 *
 * Every one of those facts already existed. None of them was reachable
 * from the others.
 *
 * ── What a placement is here ─────────────────────────────────────────
 *
 * A `SellContract`. It is the row that says this person, at this client,
 * from this date, at this rate — so it is the spine everything else
 * hangs off, and the id in the URL is its id.
 *
 * ── What each viewer is allowed to see ───────────────────────────────
 *
 * Three rules, applied here rather than in the screen, because a screen
 * that filters is a screen somebody can read around.
 *
 *   Only a party may open it at all — the supplier, the payer or the end
 *   client. Anybody else gets 404 rather than 403: confirming that a
 *   placement exists is itself a leak.
 *
 *   Rates follow the field permissions that already exist. A recruiter
 *   deliberately cannot see what a placement earns.
 *
 *   The chain descends and never ascends. A firm sees its own leg and
 *   what it pays the hop below, because that is its own cost. It never
 *   sees what the firm above charges, because that is their margin and
 *   the whole network stops working the day it leaks.
 */

const money = (cents: number | null | undefined) =>
  cents == null ? null : Math.round(cents) / 100

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const mine = caller.company?.id

  if (!mine) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'You need to belong to a company to open a placement.' } },
      { status: 403 }
    )
  }

  const placement = await prisma.sellContract.findUnique({
    where: { id },
    include: {
      person: {
        select: {
          id: true, name: true, primaryEmail: true,
          consultant: { select: { id: true, skills: true, location: true, workAuth: true } },
        },
      },
      company: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      hiringManager: { select: { id: true, name: true } },
      engagement: { select: { id: true, title: true } },
      purchaseOrder: { select: { id: true, number: true, amount: true, currency: true } },
      // What is due on this contract. The sell side: hours and invoices.
      sellCycles: {
        select: { kind: true, dueOn: true, completedAt: true },
        orderBy: { dueOn: 'asc' },
      },
      requirement: {
        select: {
          id: true, title: true, skills: true, location: true,
          billMin: true, billMax: true, neededBy: true, approvalState: true,
          company: { select: { id: true, name: true } },
        },
      },
      buyLinks: {
        select: {
          effectiveFrom: true, effectiveTo: true,
          buyContract: {
            select: {
              id: true, contractType: true, state: true, payCurrency: true,
              supplierSellContractId: true,
              vendorCompany: { select: { id: true, name: true } },
              // The buy side: pay days and vendor bills. Our own cost,
              // shown only to a viewer who may see what we pay.
              buyCycles: {
                select: { kind: true, dueOn: true, completedAt: true },
                orderBy: { dueOn: 'asc' },
              },
            },
          },
        },
      },
      timesheets: {
        orderBy: { periodStart: 'desc' },
        take: 12,
        select: {
          id: true, periodStart: true, periodEnd: true, totalHours: true, status: true,
          assertions: {
            where: { state: 'LIVE' },
            select: { role: true, hours: true, rateCents: true, companyId: true, at: true, auto: true },
          },
          invoiceLines: { select: { id: true, sellContractId: true, amountCents: true } },
        },
      },
    },
  })

  // A placement that is not ours is a placement that does not exist.
  const isParty =
    placement != null &&
    (placement.companyId === mine ||
      placement.clientCompanyId === mine ||
      placement.endClientCompanyId === mine)

  if (!placement || !isParty) {
    // The refusal is logged too. CLAUDE.md: every read of another
    // person's data writes an AccessLog row, including refusals.
    if (placement) {
      logAccess({
        subjectId: placement.personId,
        actorPersonId: caller.person.id,
        actorCompanyId: mine,
        action: 'CONTRACT_VIEW',
        allowed: false,
        reason: 'Not a party to this placement',
      })
    }
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No placement by that id.' } },
      { status: 404 }
    )
  }

  logAccess({
    subjectId: placement.personId,
    actorPersonId: caller.person.id,
    actorCompanyId: mine,
    action: 'CONTRACT_VIEW',
    allowed: true,
    reason: 'Party to this placement',
  })

  const isSupplier = placement.companyId === mine
  const perms = {
    permissions: caller.permissions,
    isClientOnMsa: placement.clientCompanyId === mine,
  }
  const seeBill = canReadBillRate(perms)
  const seePay = canReadPayRate(perms)
  const seeMargin = canReadMargin(perms)

  // ── How this person reached us ──────────────────────────────────────
  //
  // The submission, and the one below it where somebody sent them on to
  // us. A sub-vendor learns nothing new from this; a prime learns who
  // put the person forward, which they already knew.
  // Matched on the requirement where the contract carries one, and on
  // the parties where it does not.
  //
  // A contract raised outside the award path — imported, back-filled,
  // seeded — has no requirementId, and requiring one meant a placement
  // whose submission plainly exists reported "no submission behind it".
  // The pair (this person, this supplier, this buyer) identifies it
  // without inventing a link that is not there.
  const submission = await prisma.submission.findFirst({
        where: placement.requirementId
          ? { requirementId: placement.requirementId, personId: placement.personId }
          : {
              personId: placement.personId,
              fromCompanyId: placement.companyId,
              toCompanyId: placement.clientCompanyId,
            },
        select: {
          id: true, rate: true, status: true, submittedAt: true, forwardedAt: true,
          checkState: true, screenState: true, requirementId: true,
          fromCompany: { select: { id: true, name: true } },
          toCompany: { select: { id: true, name: true } },
          parentSubmission: {
            select: {
              id: true, rate: true, submittedAt: true,
              fromCompany: { select: { id: true, name: true } },
            },
          },
          interviews: {
            orderBy: { round: 'asc' },
            select: {
              id: true, round: true, stage: true, mode: true, state: true,
              scheduledAt: true, feedback: true, decidedAt: true,
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
      })

  // The band we were given, which is ours alone to read.
  const invitationOn = placement.requirementId ?? submission?.requirementId ?? null
  const invitation = invitationOn
    ? await prisma.requirementInvitation.findFirst({
        where: { requirementId: invitationOn, toCompanyId: mine },
        select: { payMin: true, payMax: true, message: true, expiresAt: true, status: true },
      })
    : null

  // ── The chain, downwards only ───────────────────────────────────────
  const rungs = await ladderFor([placement.id])
  const below = descend(placement.id, rungs).slice(1)
  const ourBuy = placement.buyLinks[0]?.buyContract ?? null
  const seat = ourBuy
    ? await prisma.buyContractCandidate.findFirst({
        where: { buyContractId: ourBuy.id, personId: placement.personId },
        select: { payRate: true, payCurrency: true, startDate: true, endDate: true },
      })
    : null

  // ── Cleared to work ─────────────────────────────────────────────────
  const [personChecks, supplierCover, ourCover] = await Promise.all([
    prisma.verification.findMany({
      where: { personId: placement.personId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, status: true, provider: true, issuedAt: true, expiresAt: true },
    }),
    ourBuy?.vendorCompany
      ? prisma.verification.findMany({
          where: {
            companyId: ourBuy.vendorCompany.id,
            type: { in: ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] },
          },
          select: { id: true, type: true, status: true, expiresAt: true },
        })
      : Promise.resolve([]),
    // The supplier on this contract — the firm that has to be insured
    // for this person to start. Different from supplierCover above,
    // which is the vendor BELOW us where there is one.
    prisma.verification.findMany({
      where: {
        companyId: placement.companyId,
        type: { in: ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] },
      },
      select: { type: true, status: true, issuedAt: true, expiresAt: true, verifiedAt: true },
    }),
  ])

  // ── Money ───────────────────────────────────────────────────────────
  const invoiceLines = await prisma.invoiceLine.findMany({
    where: { sellContractId: placement.id },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      id: true, hours: true, rateCents: true, amountCents: true,
      invoice: { select: { id: true, number: true, status: true, total: true, paid: true, dueAt: true, issuedAt: true } },
    },
  })

  const billedCents = invoiceLines.reduce((n, l) => n + l.amountCents, 0)
  const paidCents = invoiceLines.reduce(
    (n, l) => n + Math.round(Number(l.invoice.paid) * 100 >= l.amountCents ? l.amountCents : 0),
    0
  )
  const hoursAccepted = placement.timesheets.reduce((n, t) => {
    const employer = t.assertions.find((a) => a.role === 'EMPLOYER_ACCEPTANCE')
    const client = t.assertions.find((a) => a.role === 'CLIENT_APPROVAL')
    return n + Number(employer?.hours ?? client?.hours ?? 0)
  }, 0)

  const costCents = seat ? Math.round(hoursAccepted * seat.payRate) : null
  const revenueCents = Math.round(hoursAccepted * placement.billRate)

  // ── What is due, in three words ─────────────────────────────────────
  //
  // Cycles grouped as a person reads them — hours, pay, bill — never as
  // the engine's kind names. Buy-side cycles are our cost and follow the
  // same rule as the pay rate: a viewer who may not see what we pay may
  // not see when we pay it either.
  const now = new Date()
  type Due = { kind: string; label: string; dueOn: string; done: boolean; overdue: boolean }
  const toDue = (c: { kind: string; dueOn: Date; completedAt: Date | null }): Due => ({
    kind: c.kind,
    label: labelOf(c.kind),
    dueOn: c.dueOn.toISOString(),
    done: c.completedAt !== null,
    overdue: c.completedAt === null && c.dueOn < now,
  })
  const sellDue = placement.sellCycles.map(toDue)
  const buyDue = seePay && ourBuy ? (ourBuy.buyCycles ?? []).map(toDue) : []
  const allDue = [...sellDue, ...buyDue].sort((a, b) => a.dueOn.localeCompare(b.dueOn))
  const timeline = {
    hours: allDue.filter((d) => categoryOf(d.kind) === 'HOURS'),
    pay: allDue.filter((d) => categoryOf(d.kind) === 'PAY'),
    bill: allDue.filter((d) => categoryOf(d.kind) === 'BILL'),
    // The next thing anybody has to do on this placement.
    next: allDue.find((d) => !d.done) ?? null,
  }

  // ── The checklist ───────────────────────────────────────────────────
  //
  // What starting this person requires, which of it is held, and what
  // stops the contract going live. The same verdict the activate route
  // gives, computed here so it is visible before anybody presses the
  // button rather than as a refusal after.
  const checklist = contractClearance({
    personName: placement.person.name,
    personVerifications: personChecks,
    supplierName: placement.company.name,
    supplierCertificates: ourCover,
    clientName: placement.clientCompany.name,
    on: now,
  })

  return NextResponse.json({
    data: {
      id: placement.id,
      // ── Who and where ──
      person: {
        id: placement.person.id,
        name: placement.person.name,
        skills: placement.person.consultant?.skills ?? [],
        location: placement.person.consultant?.location ?? null,
        workAuth: placement.person.consultant?.workAuth ?? null,
      },
      supplier: placement.company,
      client: placement.clientCompany,
      endClient: placement.endClientCompany,
      hiringManager: placement.hiringManager,
      engagement: placement.engagement,
      state: placement.state,
      startDate: placement.startDate?.toISOString() ?? null,
      endDate: placement.endDate?.toISOString() ?? null,
      paymentTerms: placement.paymentTerms,
      currency: placement.billCurrency,
      viewer: { isSupplier, seeBill, seePay, seeMargin },

      // ── Station 1 · where the work came from ──
      origin: placement.requirement
        ? {
            id: placement.requirement.id,
            title: placement.requirement.title,
            skills: placement.requirement.skills,
            location: placement.requirement.location,
            raisedBy: placement.requirement.company,
            neededBy: placement.requirement.neededBy?.toISOString() ?? null,
            approvalState: placement.requirement.approvalState,
          }
        : null,
      invitation: invitation
        ? {
            status: invitation.status,
            // Our own band. Never anybody else's — it lives on the
            // invitation for exactly this reason.
            payMin: money(invitation.payMin),
            payMax: money(invitation.payMax),
            message: invitation.message,
          }
        : null,

      // ── Station 2 · how they reached us ──
      submission: submission
        ? {
            id: submission.id,
            status: submission.status,
            rate: seeBill ? money(submission.rate) : null,
            submittedAt: submission.submittedAt?.toISOString() ?? null,
            forwardedAt: submission.forwardedAt?.toISOString() ?? null,
            from: submission.fromCompany,
            to: submission.toCompany,
            checkState: submission.checkState,
            sentOnBy: submission.parentSubmission
              ? {
                  company: submission.parentSubmission.fromCompany,
                  at: submission.parentSubmission.submittedAt?.toISOString() ?? null,
                  // Their asking price is our cost, so we may see it.
                  rate: seePay ? money(submission.parentSubmission.rate) : null,
                }
              : null,
          }
        : null,

      // ── Station 3 · who met them ──
      interviews: (submission?.interviews ?? []).map((i) => ({
        id: i.id,
        round: i.round,
        stage: i.stage,
        mode: i.mode,
        state: i.state,
        scheduledAt: i.scheduledAt?.toISOString() ?? null,
        decidedAt: i.decidedAt?.toISOString() ?? null,
        feedback: i.feedback,
      })),

      // ── Station 4 · what was agreed, on both sides ──
      contracts: {
        sell: {
          id: placement.id,
          billRate: seeBill ? money(placement.billRate) : null,
          state: placement.state,
          purchaseOrder: placement.purchaseOrder
            ? {
                number: placement.purchaseOrder.number,
                amount: Number(placement.purchaseOrder.amount),
                currency: placement.purchaseOrder.currency,
              }
            : null,
        },
        buy: ourBuy
          ? {
              id: ourBuy.id,
              contractType: ourBuy.contractType,
              state: ourBuy.state,
              // Null means we employ them. That is the fact, not a gap.
              vendor: ourBuy.vendorCompany,
              payRate: seePay && seat ? money(seat.payRate) : null,
            }
          : null,
      },

      // ── Station 5 · the chain below us ──
      //
      // How many firms stand between us and the person. Ids only, and
      // only downwards — what sits above is somebody else's margin.
      chain: {
        hopsBelow: below.length,
        weEmployThem: ourBuy?.vendorCompany == null,
      },

      // ── Station 6 · cleared to work ──
      compliance: {
        person: personChecks.map((v) => ({
          type: v.type,
          status: v.status,
          provider: v.provider,
          expiresAt: v.expiresAt?.toISOString() ?? null,
        })),
        supplierCover: supplierCover.map((v) => ({
          type: v.type,
          status: v.status,
          expiresAt: v.expiresAt?.toISOString() ?? null,
        })),
      },

      // ── Station 7 · the hours ──
      timesheets: placement.timesheets.map((t) => {
        const client = t.assertions.find((a) => a.role === 'CLIENT_APPROVAL')
        const employer = t.assertions.find((a) => a.role === 'EMPLOYER_ACCEPTANCE')
        return {
          id: t.id,
          periodStart: t.periodStart.toISOString().slice(0, 10),
          periodEnd: t.periodEnd.toISOString().slice(0, 10),
          hours: Number(t.totalHours),
          status: t.status,
          // Two signatures, shown as two, because in a chain they are
          // almost never the same company.
          clientApproved: client ? { hours: Number(client.hours), at: client.at.toISOString() } : null,
          employerAccepted: employer ? { hours: Number(employer.hours), at: employer.at.toISOString() } : null,
          billedByUs: t.invoiceLines.some((l) => l.sellContractId === placement.id),
        }
      }),

      // ── What is due next, and what stops a start ──
      timeline,
      checklist: {
        outcome: checklist.outcome,
        says: checklist.says,
        fix: checklist.fix,
        items: checklist.items,
        cover: checklist.cover.outcome,
      },

      // ── Station 8 · the money ──
      money: {
        hoursAccepted,
        // Grouped by invoice, not by line.
        //
        // One invoice covering four weeks has four lines, and rendering
        // a row per line showed the same invoice number four times —
        // which reads as four invoices for the same work, the exact
        // thing anybody looking at a billing screen is watching for.
        invoices: [...invoiceLines
          .reduce((acc, l) => {
            const at = acc.get(l.invoice.id) ?? {
              id: l.invoice.id,
              number: l.invoice.number,
              status: l.invoice.status,
              hours: 0,
              amountCents: 0,
              total: Number(l.invoice.total),
              paid: Number(l.invoice.paid),
              dueAt: l.invoice.dueAt.toISOString().slice(0, 10),
              weeks: 0,
            }
            at.hours += Number(l.hours)
            at.amountCents += l.amountCents
            at.weeks += 1
            acc.set(l.invoice.id, at)
            return acc
          }, new Map<string, any>())
          .values()]
          .map((i) => ({ ...i, amount: seeBill ? money(i.amountCents) : null })),
        billed: seeBill ? money(billedCents) : null,
        collected: seeBill ? money(paidCents) : null,
        // Blank rather than a guess. A margin shown as the whole invoice
        // because nobody set a cost is the kind of wrong that looks like
        // good news.
        revenue: seeBill ? money(revenueCents) : null,
        cost: seePay ? money(costCents) : null,
        margin: seeMargin && costCents != null ? money(revenueCents - costCents) : null,
      },
    },
  })
}
