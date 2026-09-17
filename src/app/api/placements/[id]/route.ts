import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logAccess } from '@/lib/access-log'
import { canReadPayRate, canReadBillRate, canReadMargin } from '@/lib/permissions'
import { contractSide } from '@/lib/resolve-client-company'
import { descend } from '@/lib/work-chain'
import { ladderFor } from '@/lib/work-chain-read'
import { categoryOf, labelOf } from '@/lib/cycle-kinds'
import { contractClearance } from '@/lib/contract-clearance'
import { standingOf, coverLabel, supplierCoverGate } from '@/lib/document-stages'
import { endClientFilter } from '@/lib/resolve-end-client'
import { mayNameSubVendors, namesForClient, type SeenName } from '@/lib/chain-names'

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
 *
 * ── The buy leg is the supplier's, and is not fetched for anybody else ─
 *
 * A permission is not a position. A client owner holds `*`, so every
 * `canRead…` check in this file passed for them, and the payload carried
 * the supplier's buy contract, the sub-vendor's name, that firm's
 * insurance, what the firm below charged, and the supplier's own cost and
 * margin. The screen hid all of it, which is exactly the fault: a screen
 * that filters is a screen somebody reads around with the network tab.
 *
 * So the side is resolved from three ids before the record is read, and
 * the buy-side queries are only asked on the supplier's own side. For a
 * client seat those rows are not hidden — they are never fetched.
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

  // ── Which side of this placement the caller sits on ─────────────────
  //
  // Three ids, read first. The answer decides what is asked for below,
  // so a client seat's query never names the buy contract at all — and a
  // stranger is refused from this row rather than after the whole
  // placement has been loaded and thrown away.
  const parties = await prisma.sellContract.findUnique({
    where: { id },
    select: {
      personId: true,
      companyId: true,
      clientCompanyId: true,
      endClientCompanyId: true,
    },
  })

  // A placement that is not ours is a placement that does not exist.
  const isParty =
    parties != null &&
    (parties.companyId === mine ||
      parties.clientCompanyId === mine ||
      parties.endClientCompanyId === mine)

  if (!parties || !isParty) {
    // The refusal is logged too. CLAUDE.md: every read of another
    // person's data writes an AccessLog row, including refusals.
    if (parties) {
      logAccess({
        subjectId: parties.personId,
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

  // SUPPLIER, PAYER or END_CLIENT — a position, not a permission. A
  // consultant seat is a party to nobody's commercial record, so it
  // resolves to none of the three and reads the narrowest view.
  const side = contractSide(caller, parties)
  const isSupplier = side === 'SUPPLIER'

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

  // Deleted between the two reads. Vanishingly rare and the same answer
  // either way, rather than a 500 and an incident email about a row that
  // is genuinely gone.
  if (!placement) {
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

  const perms = {
    permissions: caller.permissions,
    isClientOnMsa: placement.clientCompanyId === mine,
  }
  // ── Whose money is on this rung ─────────────────────────────────────
  //
  // A client is a party to every rung of a chain at its own site and to
  // the money of exactly one of them. On any other rung the price is
  // what one of its suppliers charges another, which is the prime's
  // margin one subtraction away — the same thing `lib/chain-top` keeps
  // off every client list, arriving here by id instead of by list.
  //
  // Not blanked: not read. A permission is not a position, and a client
  // owner holds `*`.
  const readsOurMoney = side !== 'END_CLIENT'
  const seeBill = canReadBillRate(perms) && readsOurMoney
  const seePay = canReadPayRate(perms) && readsOurMoney
  const seeMargin = canReadMargin(perms) && readsOurMoney

  // ── Whose name this reader may read ─────────────────────────────────
  //
  // A client is a party to every rung of a chain at its own site, because
  // every rung names it as the place the work is done. So a client seat
  // handed the sub-vendor's leg by id was a party to it and read that
  // firm by name — the same leak the compliance, tenure and alumni lists
  // had, arriving by a different door: a check on the record rather than
  // a filter on a list. END_CLIENT is exactly that position, since a
  // client that is the buyer of this rung reads PAYER instead.
  //
  // Found by hand while building the sweep in
  // `__tests__/invariants/client-facing-names.test.ts`, which does not
  // catch this shape and says so.
  const readsFromBelow = side === 'END_CLIENT'

  const chainRungs = readsFromBelow
    ? await prisma.sellContract.findMany({
        where: { ...endClientFilter(mine), personId: placement.personId },
        select: {
          id: true, personId: true, companyId: true, clientCompanyId: true,
          company: { select: { name: true } },
        },
      })
    : []

  const disclosureTerms = readsFromBelow
    ? await prisma.masterAgreement.findMany({
        where: { clientId: mine },
        select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true },
      })
    : []

  const seenNames = readsFromBelow
    ? namesForClient(
        chainRungs.map((c) => ({
          id: c.id,
          personId: c.personId,
          companyId: c.companyId,
          companyName: c.company.name,
          clientCompanyId: c.clientCompanyId,
        })),
        mine,
        (primeCompanyId: string) => mayNameSubVendors(disclosureTerms, mine, primeCompanyId)
      )
    : new Map<string, SeenName>()

  /** What this reader may call a firm. Its own name for everybody else. */
  const shown = (companyId: string, trueName: string): SeenName =>
    seenNames.get(companyId) ?? {
      companyId, name: trueName, masked: false, through: null,
      phrase: trueName, says: trueName,
    }

  /**
   * A firm on the payload, named or withheld.
   *
   * The id travels either way: a row needs something to hang a
   * certificate on, and a client cannot turn an id into a firm it has no
   * relationship with.
   */
  const firm = <T extends { id: string; name: string }>(c: T | null) => {
    if (!c) return null
    const seen = shown(c.id, c.name)
    return {
      ...c,
      name: seen.name,
      // What to call this firm inside a sentence somebody else writes.
      // "Supplied through Pinnacle" is a cell; "submitted by the firm
      // supplied through Pinnacle" is the sentence, and one string
      // cannot be both.
      phrase: seen.phrase,
      nameWithheld: seen.masked,
      suppliedThrough: seen.through,
    }
  }

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
          parentSubmissionId: true,
          fromCompany: { select: { id: true, name: true } },
          toCompany: { select: { id: true, name: true } },
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

  // Who put this person in front of us, and at what price.
  //
  // The firm below the supplier, and their asking price, which is the
  // supplier's own cost. A client reading this thread was shown both —
  // "CloudEPA put them forward to you" over a rate that is the prime's
  // margin minus one subtraction. Not fetched at all unless the reader
  // is the firm that bought.
  const sentOnBy =
    isSupplier && submission?.parentSubmissionId
      ? await prisma.submission.findUnique({
          where: { id: submission.parentSubmissionId },
          select: {
            id: true, rate: true, submittedAt: true,
            fromCompany: { select: { id: true, name: true } },
          },
        })
      : null

  // ── The chain, downwards only ───────────────────────────────────────
  const rungs = await ladderFor([placement.id])
  const below = descend(placement.id, rungs).slice(1)

  // The buy leg. What the supplier pays, to whom, and when — their own
  // paper on their own side of the trade. A client is a party to the
  // sell contract and to nothing underneath it, so this query is not
  // asked on their behalf and every field derived from it below falls to
  // null on its own: the sub-vendor's name, that firm's insurance, the
  // pay days, the cost and the margin.
  const ourBuy = isSupplier
    ? (
        await prisma.contractLink.findFirst({
          where: { sellContractId: placement.id },
          select: {
            buyContract: {
              select: {
                id: true, contractType: true, state: true, payCurrency: true,
                supplierSellContractId: true,
                vendorCompany: { select: { id: true, name: true } },
                buyCycles: {
                  select: { kind: true, dueOn: true, completedAt: true },
                  orderBy: { dueOn: 'asc' },
                },
              },
            },
          },
        })
      )?.buyContract ?? null
    : null
  const seat = ourBuy
    ? await prisma.buyContractCandidate.findFirst({
        where: { buyContractId: ourBuy.id, personId: placement.personId },
        select: { payRate: true, payCurrency: true, startDate: true, endDate: true },
      })
    : null

  // ── Cleared to work ─────────────────────────────────────────────────
  // Two different firms' certificates, and the names have caused trouble
  // before: `subVendorCertificates` is the cover of the firm BELOW the
  // supplier, fetched only when there is a buy leg to read it from — so
  // empty for every reader but the supplier. `ourCover` is the supplier
  // on this contract, the firm the client actually pays, and the client
  // is entitled to know whether it is insured.
  const [personChecks, subVendorCertificates, ourCover] = await Promise.all([
    prisma.verification.findMany({
      where: { personId: placement.personId },
      orderBy: { createdAt: 'desc' },
      // `validFrom` and `formEdition` were added on 2026-09-16 and have to
      // be selected explicitly or the floor and the edition check read
      // undefined and quietly pass.
      select: {
        id: true, type: true, status: true, provider: true,
        issuedAt: true, validFrom: true, expiresAt: true, formEdition: true,
        backedBy: {
          select: {
            evidence: { select: { type: true, validFrom: true, issuedAt: true, expiresAt: true, status: true } },
          },
        },
      },
    }),
    ourBuy?.vendorCompany
      ? prisma.verification.findMany({
          where: {
            companyId: ourBuy.vendorCompany.id,
            type: { in: ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] },
          },
          // The floor and the day somebody said they had seen it, because
          // this row is not echoed to the screen as a stored status any
          // more — its standing is computed the same way the compliance
          // page computes it.
          select: {
            id: true, type: true, status: true,
            issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true,
          },
        })
      : Promise.resolve([]),
    // The supplier on this contract — the firm that has to be insured
    // for this person to start. Different from subVendorCertificates
    // above, which is the vendor BELOW us where there is one.
    prisma.verification.findMany({
      where: {
        companyId: placement.companyId,
        type: { in: ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] },
      },
      select: { type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true, verifiedAt: true },
    }),
  ])

  // ── Money ───────────────────────────────────────────────────────────
  //
  // The invoices on this rung are between the firm that sold it and the
  // firm that bought it. An end client is neither, so they are not
  // fetched rather than fetched and nulled: `invoice.total` was sent
  // whatever the permissions said.
  const invoiceLines = readsOurMoney
    ? await prisma.invoiceLine.findMany({
        where: { sellContractId: placement.id },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true, hours: true, rateCents: true, amountCents: true,
          invoice: { select: { id: true, number: true, status: true, total: true, paid: true, dueAt: true, issuedAt: true } },
        },
      })
    : []

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
  // Both rules, not one. seePay is a permission — a client owner holds
  // `*` and passes it — and isSupplier is a position. Buy cycles are the
  // supplier's own cost; a client with every permission in the world is
  // still not the supplier, and saw fifty-three pay days it had no
  // business seeing. `ourBuy` is now null off the sell side as well, so
  // this reads belt and braces; both are kept because the position is
  // the rule and the query is the enforcement.
  const buyDue = isSupplier && seePay && ourBuy ? (ourBuy.buyCycles ?? []).map(toDue) : []
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
    personVerifications: personChecks.map((v) => ({
      ...v,
      // What each form was completed from. An I-9 with nothing here is a
      // record that somebody looked, with no record of what they saw.
      backedBy: v.backedBy.map((b) => ({
        key: b.evidence.type,
        inForce:
          (b.evidence.status === 'CLEAR' || b.evidence.status === 'CONDITIONAL') &&
          !((b.evidence.validFrom ?? b.evidence.issuedAt) && (b.evidence.validFrom ?? b.evidence.issuedAt)! > now) &&
          !(b.evidence.expiresAt && b.evidence.expiresAt < now),
      })),
    })),
    // The sentence names the firm the client can actually call about
    // this person, which below its own supplier is the prime.
    supplierName: shown(placement.companyId, placement.company.name).phrase,
    supplierCertificates: ourCover,
    clientName: placement.clientCompany.name,
    on: now,
  })

  // The firm below us, read the same way we read the firm above. Null
  // where we employ the person ourselves, which is a fact rather than a
  // gap and is said as `weEmployThem` in the chain.
  const subVendorCover = ourBuy?.vendorCompany
    ? supplierCoverGate({
        supplierName: ourBuy.vendorCompany.name,
        clientName: placement.clientCompany.name,
        certificates: subVendorCertificates.map((v) => ({
          type: v.type,
          status: v.status,
          issuedAt: v.issuedAt,
          validFrom: v.validFrom,
          expiresAt: v.expiresAt,
          verifiedAt: v.verifiedAt,
        })),
        on: now,
      })
    : null

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
      supplier: firm(placement.company),
      client: placement.clientCompany,
      endClient: placement.endClientCompany,
      hiringManager: placement.hiringManager,
      engagement: placement.engagement,
      state: placement.state,
      startDate: placement.startDate?.toISOString() ?? null,
      endDate: placement.endDate?.toISOString() ?? null,
      paymentTerms: placement.paymentTerms,
      currency: placement.billCurrency,
      // Which side, said out loud, so the screen frames the same facts
      // the way this reader would say them rather than guessing from a
      // permission.
      viewer: { side, isSupplier, seeBill, seePay, seeMargin },

      // ── Station 1 · where the work came from ──
      origin: placement.requirement
        ? {
            id: placement.requirement.id,
            title: placement.requirement.title,
            skills: placement.requirement.skills,
            location: placement.requirement.location,
            raisedBy: firm(placement.requirement.company),
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
            from: firm(submission.fromCompany),
            to: submission.toCompany,
            checkState: submission.checkState,
            // Null for a client seat whatever their permissions, because
            // the firm below the supplier is not their counterparty and
            // its price is not their business.
            sentOnBy: sentOnBy
              ? {
                  company: sentOnBy.fromCompany,
                  at: sentOnBy.submittedAt?.toISOString() ?? null,
                  // Their asking price is our cost, so we may see it.
                  rate: seePay ? money(sentOnBy.rate) : null,
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
      // How many firms stand below this contract is the client's own
      // co-employment question and carries no name. Whether the supplier
      // employs the person or buys them in is read off the buy leg, so
      // off the sell side it is null — unknown, rather than a confident
      // "employs them directly" computed from a row we did not fetch.
      chain: {
        hopsBelow: below.length,
        weEmployThem: isSupplier ? ourBuy?.vendorCompany == null : null,
      },

      // ── Station 6 · cleared to work ──
      compliance: {
        person: personChecks.map((v) => ({
          type: v.type,
          status: v.status,
          provider: v.provider,
          expiresAt: v.expiresAt?.toISOString() ?? null,
        })),
        // The sub-vendor's cover, as standing rather than as the status
        // somebody typed when they filed it. Empty for a client seat:
        // the firm below the supplier has no relationship with them and
        // its paperwork is not theirs to read. The key keeps its name
        // because the supplier's own screen reads it.
        //
        // A stored status is a claim about a past moment. This row said
        // "Clear" over a certificate whose cover begins in October, while
        // the same certificate blocked at activation — the screen and the
        // refusal giving two answers about the same policy. The stored
        // value stays, because it is a fact about the record; what the
        // screen should read is `standing`.
        supplierCover: subVendorCertificates.map((v) => {
          const standing = standingOf(
            {
              key: v.type,
              label: coverLabel(v.type),
              issuedAt: v.issuedAt,
              validFrom: v.validFrom,
              expiresAt: v.expiresAt,
              verifiedAt: v.verifiedAt,
            },
            // Brokers issue cover annually, which is the same window the
            // compliance page and the submission door use.
            { key: v.type, label: coverLabel(v.type), validMonths: 12 },
            now
          )
          return {
            type: v.type,
            status: v.status,
            validFrom: (v.validFrom ?? v.issuedAt)?.toISOString() ?? null,
            expiresAt: v.expiresAt?.toISOString() ?? null,
            standing: standing.standing,
            says: standing.says,
          }
        }),
        // Whether the firm below us could put anybody forward today. The
        // same function the submission door and the compliance page call,
        // so a placement cannot read green on cover that refuses a
        // submission an hour later.
        subVendorCover: subVendorCover
          ? {
              vendor: ourBuy!.vendorCompany!.name,
              outcome: subVendorCover.outcome,
              says: subVendorCover.says,
              fix: subVendorCover.fix,
            }
          : null,
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
        // Both are null off the sell side without asking a permission:
        // the seat that carries the pay rate hangs off the buy leg, and
        // the buy leg is not read for anybody but the supplier. A client
        // owner holds `*`, so the permission alone let the supplier's
        // cost and margin through.
        cost: seePay ? money(costCents) : null,
        margin: seeMargin && costCents != null ? money(revenueCents - costCents) : null,
        // Why it is blank, rather than a screen of dashes somebody
        // raises a ticket about.
        says: readsOurMoney
          ? null
          : 'This leg was arranged by one of your suppliers. What it is billed at is between those two firms — your own rate is on the placement you pay for.',
      },
    },
  })
}
