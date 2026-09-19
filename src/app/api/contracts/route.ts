import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { isConsultantSeat } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { generateCycles } from '@/lib/cycle-generator'
import { policyFrom } from '@/lib/cycle-shift'
import { cyclesFor } from '@/lib/cycle-kinds'
import { loadContractHolidays } from '@/lib/holidays'
import { getTemplatePack } from '@/lib/template-packs'
import { payerScope, sellContractScope, buyContractScope } from '@/lib/resolve-client-company'
import { accountFilterFor } from '@/lib/account-walls'
import { andAll } from '@/lib/walls'
import { canAttachPoToBuyContract } from '@/lib/purchase-order'
import { ORDER_HEADER_SELECT, termsFor } from '@/lib/money/order-terms'
import { mayNameCounterparty } from '@/lib/off-system'
import { chooseHeader } from '@/lib/award'
import { HEADER_SELECT, lineTermsFrom } from '../submissions/order-header'

/**
 * POST /api/contracts
 *
 * Creates a SellContract (and optionally a linked BuyContract) with
 * generated cycles from the company's template pack.
 *
 * The old "assignment" was a single record. Now sell and buy are separate:
 *   SellContract — what the vendor bills the client
 *   BuyContract  — what the vendor pays for talent
 *   ContractLink — joins them for profitability tracking
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const {
    // Sell side
    personId,
    companyId,
    clientCompanyId,
    endClientCompanyId,  // optional — the end client if different from paying customer
    workLocationId,      // optional — where the consultant physically works
    engagementId,
    msaId,
    billRate,
    billCurrency,
    startDate,
    endDate,
    // Buy side (optional — creates linked BuyContract)
    payRate,
    payCurrency,
    contractType,
    vendorCompanyId,
    entityId,
    // The PO this company raises to the sub-vendor supplying the person.
    // Null on roughly half of all buy contracts, and it must stay null on
    // every one of them that employs somebody directly.
    buyPurchaseOrderId,
  } = body

  // Validation — sell contract required fields
  if (!personId) return errResponse('personId is required', 'personId')
  if (!companyId) return errResponse('companyId is required', 'companyId')
  if (!clientCompanyId) return errResponse('clientCompanyId is required', 'clientCompanyId')

  // ── Whose contract this is ─────────────────────────────────────────
  //
  // The company, the client, the bill rate and the pay rate all arrived
  // in the request body and none of them was checked against the caller.
  // The route asked only whether somebody was signed in, so any account
  // — a consultant, a visitor on a demo — could write a live sell
  // contract, a buy contract and a master agreement between two firms it
  // had nothing to do with, at rates of its own choosing, and the cycles
  // behind them.
  //
  // A sell contract is raised by the company that bills it. That company
  // is the caller's, or this is not the caller's contract to write.
  if (caller.company?.id !== companyId) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: `A contract is raised by the company that bills it. ${caller.company?.name ?? 'Your company'} cannot write one for another firm.`,
        },
      },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, 'assignments.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Writing a contract needs the assignments.write permission. Ask whoever runs your company\'s access.',
        },
      },
      { status: 403 }
    )
  }
  if (typeof billRate !== 'number' || billRate <= 0) return errResponse('billRate must be a positive number (cents/hr)', 'billRate')
  if (!startDate) return errResponse('startDate is required', 'startDate')

  // ── A purchase order is not raised to your own employee ────────────
  //
  // CLAUDE.md calls this the clearest proof that an order and a contract
  // are different objects, and until now nothing refused it. A W2 buy
  // contract carrying a purchase order puts wages into a commitment
  // ledger, makes the three-way match run against somebody who will never
  // send an invoice, and leaves a worker looking like a supplier in every
  // report downstream — which is the shape of a misclassification
  // finding, not a tidy-up.
  //
  // Checked before anything is written rather than after, because the
  // half-created pair is worse than the refusal.
  if (buyPurchaseOrderId) {
    if (!payRate) {
      return errResponse(
        'A purchase order belongs to a buy contract, and no buy contract is being created here',
        'buyPurchaseOrderId'
      )
    }
    const po = canAttachPoToBuyContract({
      vendorCompanyId: vendorCompanyId ?? null,
      contractType: contractType ?? 'W2',
    })
    if (!po.allowed) {
      return errResponse(po.reason, 'buyPurchaseOrderId')
    }
  }

  // ── A line created under a document is created on its terms ────────
  //
  // The six duplicated fields are read from the header
  // (`lib/money/order-terms`), and the columns on the line stay for now
  // — so a line written here has to agree with its own document from the
  // first second, or the row on the screen and the row in the database
  // say different things until somebody reads the header.
  //
  // Only the rhythm. The dates stay this person's: an order is not a
  // person, and one header covering five people starts before four of
  // them do.
  const buyHeader = buyPurchaseOrderId
    ? await prisma.workOrder.findUnique({
        where: { id: String(buyPurchaseOrderId) },
        select: ORDER_HEADER_SELECT,
      })
    : null
  const buyRhythm = termsFor('BUY', { workOrder: buyHeader })

  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null

  if (isNaN(start.getTime())) return errResponse('Invalid startDate', 'startDate')
  if (end && isNaN(end.getTime())) return errResponse('Invalid endDate', 'endDate')
  if (end && end <= start) return errResponse('endDate must be after startDate', 'endDate')

  // Verify company exists and get template pack
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    // The three shift columns come back with the pack because the cycle
    // dates below are this firm's own operating dates and it says which
    // way they move off a weekend or a holiday.
    select: {
      id: true, name: true, templatePack: true,
      cycleShiftHours: true, cycleShiftPay: true, cycleShiftBill: true,
    },
  })

  if (!company) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Company not found' } },
      { status: 404 }
    )
  }

  // ── The client on the other side of it ─────────────────────────────
  //
  // This is the route a staffing firm uses to put its existing book in,
  // and until now it could not: `clientCompanyId` had to name a company
  // that already existed, and every client it already works with is one
  // that has never heard of us. So a firm that arrives before its clients
  // had no way to record a single placement it was already running.
  //
  // Two things are checked here and neither was before. The client must
  // exist — a foreign-key error is not a sentence anybody can act on —
  // and naming it must be the caller's to do. A firm not on Etyme is a
  // shell and anybody may record their own dealings with it. A firm that
  // *is* here is a tenant with its own desks, and asserting it is your
  // client without anybody there involved is the thing CLAUDE.md refuses
  // under the MSP seat.
  //
  // `endClientCompanyId` is deliberately not checked the same way yet: it
  // is the top of a chain the caller often does not trade with directly,
  // and the rule for it is a different one. Said out loud rather than
  // left looking finished.
  const clientCompany = await prisma.company.findUnique({
    where: { id: clientCompanyId },
    select: { id: true, name: true, claimedAt: true, listedById: true },
  })

  if (!clientCompany) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FOUND',
          message:
            'No company of that id. If the client is not on Etyme, put them on your register first — POST /api/clients with their name — and use the id it gives you.',
          field: 'clientCompanyId',
        },
      },
      { status: 404 }
    )
  }

  const relationshipExists =
    clientCompany.claimedAt == null
      ? true
      : Boolean(
          (await prisma.masterAgreement.findFirst({
            where: { vendorId: companyId, clientId: clientCompanyId },
            select: { id: true },
          })) ??
            (await prisma.counterparty.findFirst({
              where: {
                OR: [
                  { companyId, otherCompanyId: clientCompanyId },
                  { companyId: clientCompanyId, otherCompanyId: companyId },
                ],
              },
              select: { id: true },
            })) ??
            (await prisma.sellContract.findFirst({
              where: { companyId, clientCompanyId },
              select: { id: true },
            })) ??
            (await prisma.requirementInvitation.findFirst({
              where: { toCompanyId: companyId, requirement: { companyId: clientCompanyId } },
              select: { id: true },
            }))
        )

  const naming = mayNameCounterparty({
    callerCompanyId: companyId,
    other: clientCompany,
    relationshipExists,
    as: 'client',
  })
  if (!naming.ok) {
    return NextResponse.json(
      { error: { code: 'NOT_YOURS', message: naming.says, field: 'clientCompanyId' } },
      { status: 403 }
    )
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // ── The paper behind the contract ─────────────────────────────
      //
      // Found by the first end-to-end run against a real database: a
      // contract recorded directly — the "manage my existing work" path
      // every solo tester starts on — got no engagement, and an invoice
      // hangs off the engagement. So the contract could be worked and
      // approved and never billed. The award path already finds or
      // creates the paper; a recorded contract deserves the same.
      //
      // ── What it no longer creates ────────────────────────────────
      //
      // An agreement. This used to invent one — `masterAgreement.create`
      // with nothing signed — so that the engagement had a parent, which
      // satisfied the founder's *"we don't need a master contract"* by
      // writing a contract nobody signed. That is worse than a null: a
      // DRAFT agreement between two firms is a fact about a negotiation,
      // and one appearing because somebody recorded a placement is a
      // fact about nothing. An existing agreement is used where there is
      // one; where there is not, the line has no agreement and says so.
      const msa =
        (msaId
          ? await tx.masterAgreement.findUnique({
              where: { id: msaId },
              select: { id: true, paymentTerms: true },
            })
          : null) ??
        (await tx.masterAgreement.findFirst({
          where: { vendorId: companyId, clientId: clientCompanyId },
          select: { id: true, paymentTerms: true },
        }))

      // The engagement: the named one, then this agreement's, then the
      // one these two firms are already trading under, and only then a
      // new one. Found through the contracts where there is no agreement
      // to look under, because an engagement with no agreement has no
      // other parent.
      const engagement =
        (engagementId
          ? await tx.engagement.findUnique({ where: { id: engagementId }, select: { id: true } })
          : null) ??
        (msa
          ? await tx.engagement.findFirst({ where: { msaId: msa.id }, select: { id: true } })
          : null) ??
        (
          await tx.sellContract.findFirst({
            where: { companyId, clientCompanyId, engagementId: { not: null } },
            orderBy: { createdAt: 'asc' },
            select: { engagement: { select: { id: true } } },
          })
        )?.engagement ??
        (await tx.engagement.create({
          data: {
            msaId: msa?.id ?? null,
            title: `${company.name} — ${clientCompany.name}`,
            invoiceCycle: 'MONTHLY',
          },
          select: { id: true },
        }))

      // ── The document this line goes on ────────────────────────────
      //
      // A purchase order is a header and its lines, so a line goes on
      // the document that is already open between these two firms —
      // found by the same rule the award uses (`chooseHeader`), so a
      // recorded placement and an awarded one land on one document per
      // buyer-and-seller pair rather than two.
      //
      // ── Why this finds and never creates ─────────────────────────
      //
      // The award creates a header because an award IS the moment the
      // commitment is made, with both firms here. Recording a placement
      // you are already running is not that moment: the client's paper
      // exists in somebody's drawer and we cannot quote its number, and
      // a derived reference on a document nobody signed is a number an
      // AP clerk will be asked for and cannot find.
      //
      // The platform already refuses the same thing one route over: a
      // supplier may not raise an order in the name of a client that is
      // here and could have raised it (`POST /api/purchase-orders`).
      // Creating one here would have been that refusal's own shape,
      // written by a different door.
      //
      // So a line with no document says what will attach and where
      // (`describeLine` in `lib/order-naming`), and recording the
      // client's purchase order attaches every running line with none —
      // which is the walk a staffing firm with an existing book actually
      // takes.
      const openOrders = await tx.workOrder.findMany({
        where: { issuedById: clientCompanyId, issuedToId: companyId },
        select: HEADER_SELECT,
      })
      const choice = chooseHeader(openOrders, {
        issuedById: clientCompanyId,
        issuedToId: companyId,
        start,
        end,
      })
      const found = choice.id ? openOrders.find((o) => o.id === choice.id) ?? null : null
      const header = found ? { ...found, raised: false, says: choice.says } : null

      // Joining a document somebody else agreed is not license to
      // rewrite its terms onto the line: the line keeps what the
      // cascade gave it, and every money reader prefers the header
      // anyway (`lib/money/order-terms`).
      const sellRhythm = lineTermsFrom(header, msa?.paymentTerms ?? 30)

      // Create the sell contract — the first line on that document.
      const sellContract = await tx.sellContract.create({
        data: {
          companyId,
          clientCompanyId,
          endClientCompanyId: endClientCompanyId ?? null,
          workLocationId: workLocationId ?? null,
          personId,
          engagementId: engagement.id,
          msaId: msa?.id ?? null,
          workOrderId: header?.id ?? null,
          billRate,
          billCurrency: billCurrency ?? 'USD',
          // Written from the document where this call raised it, so the
          // row and the paper cannot disagree on the day they are made.
          billFrequency: sellRhythm.billFrequency,
          billAnchor: sellRhythm.billAnchor,
          billStraddle: sellRhythm.billStraddle,
          paymentTerms: sellRhythm.paymentTerms,
          state: 'DRAFT',
          startDate: start,
          endDate: end,
        },
      })

      // Optionally create a linked buy contract
      let buyContract = null
      let contractLink = null

      if (payRate && typeof payRate === 'number' && payRate > 0) {
        // The agreement, with this person as its first candidate line.
        // More candidates can be added to the same agreement later.
        buyContract = await tx.buyContract.create({
          data: {
            companyId,
            vendorCompanyId: vendorCompanyId ?? null,
            entityId: entityId ?? null,
            payCurrency: payCurrency ?? 'USD',
            contractType: contractType ?? 'W2',
            workOrderId: buyPurchaseOrderId ?? null,
            // Written from the document where there is one, so the copy
            // on the line cannot disagree with the paper it is on.
            payFrequency: buyRhythm.frequency,
            payAnchor: buyRhythm.anchor,
            payStraddle: buyRhythm.straddle,
            state: 'DRAFT',
            startDate: start,
            endDate: end,
            candidates: {
              create: {
                personId,
                payRate,
                payCurrency: payCurrency ?? 'USD',
                startDate: start,
                endDate: end,
              },
            },
          },
        })

        // Link them for profitability tracking
        contractLink = await tx.contractLink.create({
          data: {
            sellContractId: sellContract.id,
            buyContractId: buyContract.id,
            effectiveFrom: start,
            effectiveTo: end,
          },
        })
      }

      // Generate sell-side cycles from template pack
      let sellCyclesCreated = 0
      if (company.templatePack && end) {
        const pack = getTemplatePack(company.templatePack)
        if (pack) {
          // Only what this contract needs, on the side it belongs to.
          //
          // Every cycle used to land on the sell contract — including the
          // salary and vendor-bill cycles that describe money going out.
          // The payroll screen reads those off the buy contract, where
          // they belong, so its list was always empty and nothing said so.
          // And the pack's day fields were dropped here on the way in,
          // which is why a pack asking for Monday got Friday.
          const bc = buyContract
          const split = cyclesFor(
            bc ? { contractType: bc.contractType, vendorCompanyId: bc.vendorCompanyId } : null,
            pack.cycleDefinitions
          )
          // Both calendars, unioned. A pay day on the client's holiday is
          // as wrong as one on ours.
          const holidays = await loadContractHolidays(
            company.id, sellContract.clientCompanyId, start.getFullYear(), end.getFullYear()
          )

          // Which way this firm's dates move off a day nobody works. Its
          // own answer, not the client's: these are the hours it collects,
          // the invoices it raises and the payroll it runs.
          const options = { policy: policyFrom(company) }

          const generatedCycles = generateCycles(start, end, split.sell, holidays, new Map(), options)

          if (bc && split.buy.length > 0) {
            const buyCycles = generateCycles(start, end, split.buy, holidays, new Map(), options)
            if (buyCycles.length > 0) {
              await tx.cycle.createMany({
                data: buyCycles.map((c) => ({ buyContractId: bc.id, kind: c.kind, dueOn: c.dueOn })),
              })
            }
          }

          if (generatedCycles.length > 0) {
            await tx.cycle.createMany({
              data: generatedCycles.map((c) => ({
                sellContractId: sellContract.id,
                kind: c.kind,
                dueOn: c.dueOn,
              })),
            })
            sellCyclesCreated = generatedCycles.length
          }
        }
      }

      // If endDate is within 8 weeks, create RolloffEvent
      let rolloff = null
      if (end) {
        const eightWeeksOut = new Date(Date.now() + 8 * 7 * 24 * 60 * 60 * 1000)
        if (end <= eightWeeksOut && end > new Date()) {
          rolloff = await tx.rolloffEvent.create({
            data: {
              sellContractId: sellContract.id,
              endDate: end,
              notified: {},
              checklist: {
                knowledgeTransfer: false,
                finalTimesheet: false,
                accessRevocation: false,
                assets: false,
              },
            },
          })
        }
      }

      // AutomationLog
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'CONTRACT_CREATED',
          summary: `A line for person ${personId} at $${billRate}/hr${header ? ` on ${header.number}` : ', not yet on an order'}. ${buyContract ? `The buy line that funds it pays $${payRate}/hr.` : 'No buy line beside it.'} ${sellCyclesCreated} cycles generated.`,
          reason: 'Contract created via API',
          payload: {
            workOrderId: header?.id ?? null,
            sellContractId: sellContract.id,
            buyContractId: buyContract?.id ?? null,
            contractLinkId: contractLink?.id ?? null,
            personId,
            billRate,
            payRate: payRate ?? null,
            contractType: contractType ?? null,
            sellCyclesCreated,
            hasRolloff: !!rolloff,
          },
          reversible: false,
        },
      })

      return { sellContract, buyContract, contractLink, sellCyclesCreated, rolloff, header }
    })

    return NextResponse.json({
      data: {
        // The document the line went on, so the caller is told what was
        // created rather than discovering an order it did not ask for.
        document: result.header
          ? {
              id: result.header.id,
              number: result.header.number,
              sellerNumber: result.header.sellerNumber,
              says: result.header.says,
            }
          : null,
        sellContract: {
          id: result.sellContract.id,
          personId: result.sellContract.personId,
          state: result.sellContract.state,
          billRate: result.sellContract.billRate,
          startDate: result.sellContract.startDate.toISOString(),
          endDate: result.sellContract.endDate?.toISOString() ?? null,
        },
        buyContract: result.buyContract ? {
          id: result.buyContract.id,
          payRate,
          contractType: result.buyContract.contractType,
          state: result.buyContract.state,
        } : null,
        contractLink: result.contractLink ? { id: result.contractLink.id } : null,
        sellCyclesCreated: result.sellCyclesCreated,
        rolloff: result.rolloff ? { id: result.rolloff.id, endDate: result.rolloff.endDate.toISOString() } : null,
        message: result.header
          ? `Recorded on ${result.header.number}, the order already open with ${clientCompany.name}. ` +
            `${result.sellCyclesCreated} cycles${result.rolloff ? ' and a rolloff' : ''}.`
          : `Recorded. No order between you and ${clientCompany.name} yet — record the purchase ` +
            `order they gave you and this line attaches to it. ` +
            `${result.sellCyclesCreated} cycles${result.rolloff ? ' and a rolloff' : ''}.`,
      },
    }, { status: 201 })
  } catch (err: any) {
    reportError('Contract creation failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Contract creation failed' } },
      { status: 500 }
    )
  }
}

/**
 * GET /api/contracts?side=sell|buy
 *
 * Lists sell contracts (default) or buy contracts.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  // Asked once, read on both sides. A consultant sits on a contract
  // rather than holding one, and neither the markup above them nor the
  // pay of anybody beside them is theirs to read.
  const isConsultant = isConsultantSeat(caller)

  const url = request.nextUrl
  const side = url.searchParams.get('side') ?? 'sell'
  const companyId = url.searchParams.get('companyId')
  const state = url.searchParams.get('state')
  const filterPersonId = url.searchParams.get('personId')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  if (side === 'buy') {
    // Scoped to the caller's company — a missing ?companyId= used to mean
    // "every buy contract in the database".
    const scope = buyContractScope(caller)
    if (!scope) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'No company context' } },
        { status: 403 }
      )
    }

    const where: any = { ...scope }
    if (state) where.state = state.toUpperCase()
    // A person is on a buy contract through a candidate line
    if (filterPersonId) where.candidates = { some: { personId: filterPersonId } }

    const [contracts, total] = await Promise.all([
      prisma.buyContract.findMany({
        where,
        include: {
          candidates: {
            include: { person: { select: { id: true, name: true } } },
            orderBy: { startDate: 'asc' },
          },
          vendorCompany: { select: { id: true, name: true } },
          // The document this line is on. A buy line to our own W2 has
          // none and never will — nobody raises a purchase order to an
          // employee — which the screen says rather than leaving blank.
          workOrder: {
            select: {
              id: true, number: true, sellerNumber: true, status: true,
              issuedById: true, issuedToId: true, billToId: true, payerId: true,
            },
          },
          // The master contract this line is tagged to, if the company
          // tagged it. Optional on purpose.
          projectOrder: { select: { id: true, code: true, name: true, status: true } },
          // The sell line it funds — the other half of the pair.
          sellLinks: {
            select: {
              sellContract: {
                select: { id: true, clientCompany: { select: { name: true } } },
              },
            },
            take: 1,
          },
          _count: { select: { buyCycles: true } },
        },
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.buyContract.count({ where }),
    ])

    return NextResponse.json({
      data: {
        contracts: contracts.map((c) => {
          // A consultant is named ON a buy contract; they are not party to
          // it. `buyContractScope` narrows them to the agreements that name
          // them, and then every candidate line on those agreements was
          // mapped out in full — so on a shared contract a consultant read
          // what the agency pays each of their colleagues, and a rate range
          // computed across all of them. Their own line, and no other.
          const visible = isConsultant
            ? c.candidates.filter((cd) => cd.person.id === caller.person.id)
            : c.candidates
          const rates = visible.map((cd) => cd.payRate)
          const single = visible.length === 1 ? visible[0] : null
          return {
            id: c.id,
            side: 'buy' as const,
            // A one-person agreement keeps the familiar shape; a shared one
            // reports headcount and a rate range instead of pretending to a
            // single person or a single rate.
            person: single?.person ?? null,
            headcount: visible.length,
            candidates: visible.map((cd) => ({
              id: cd.id,
              person: cd.person,
              payRate: cd.payRate,
              payCurrency: cd.payCurrency,
              startDate: cd.startDate.toISOString(),
              endDate: cd.endDate?.toISOString() ?? null,
              state: cd.state,
            })),
            vendorCompany: c.vendorCompany,
            // The document, the pair and the tag — raw, because the
            // words for them belong to `lib/order-naming` and the screen
            // reads them from there with the viewer's own side in hand.
            workOrder: c.workOrder,
            masterContract: c.projectOrder,
            pairedWith: c.sellLinks[0]?.sellContract
              ? {
                  id: c.sellLinks[0].sellContract.id,
                  counterpartName: c.sellLinks[0].sellContract.clientCompany.name,
                }
              : null,
            state: c.state,
            contractType: c.contractType,
            payRate: single?.payRate ?? null,
            payRateMin: rates.length > 0 ? Math.min(...rates) : null,
            payRateMax: rates.length > 0 ? Math.max(...rates) : null,
            payCurrency: c.payCurrency,
            startDate: c.startDate.toISOString(),
            endDate: c.endDate?.toISOString() ?? null,
            cycles: c._count.buyCycles,
          }
        }),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    })
  }

  // Default: sell contracts — scoped to whichever side of the placement
  // the caller sits on. A client sees contracts at their sites; a vendor
  // sees the ones they sell.
  const scope = payerScope(caller)
  if (!scope) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No company context' } },
      { status: 403 }
    )
  }

  // Inside a firm that separates its accounts, somebody attached to one
  // sees that account and anything under it. Attached to none means the
  // whole firm, which is how a CFO keeps working after the wall goes up.
  // Which side of the contract this caller owns. A buyer's structure is
  // their departments; a supplier's is their accounts, and they are
  // different companies' org charts.
  const wall = await accountFilterFor(
    caller,
    caller.company?.kind === 'CLIENT' ? 'orgUnitId' : 'deliveryUnitId'
  )

  // AND, never a spread. Both fragments express themselves as OR, and
  // spreading one over the other keeps only the second — which is how a
  // walled manager briefly saw every contract on the platform.
  const where: any = andAll(scope, wall.where)
  if (state) where.state = state.toUpperCase()
  if (filterPersonId) where.personId = filterPersonId

  const [contracts, total] = await Promise.all([
    prisma.sellContract.findMany({
      where,
      include: {
        person: { select: { id: true, name: true } },
        clientCompany: { select: { id: true, name: true } },
        endClientCompany: { select: { id: true, name: true } },
        workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
        engagement: { select: { id: true, title: true } },
        // The document this line is on, and the two ends of it, so the
        // screen can say "purchase order" to the client that raised it
        // and "sales order" to the supplier billing against it.
        workOrder: {
          select: {
            id: true, number: true, sellerNumber: true, status: true, amount: true, currency: true,
            issuedById: true, issuedToId: true, billToId: true, payerId: true,
            _count: { select: { sellContracts: true } },
          },
        },
        projectOrder: { select: { id: true, code: true, name: true, status: true } },
        // The buy line that funds it: who we pay, or nobody where we
        // employ the person and payroll pays them.
        buyLinks: {
          select: {
            buyContract: {
              select: { id: true, contractType: true, vendorCompany: { select: { name: true } } },
            },
          },
          take: 1,
        },
        _count: { select: { timesheets: true, sellCycles: true } },
        rolloff: { select: { id: true, endDate: true, outcome: true } },
      },
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.sellContract.count({ where }),
  ])

  return NextResponse.json({
    data: {
      contracts: contracts.map((c) => ({
        id: c.id,
        side: 'sell' as const,
        // Whose contract this actually is — needed client-side to decide
        // whether the viewer may assign its approver at all.
        companyId: c.companyId,
        personId: c.personId,
        person: c.person,
        clientCompany: c.clientCompany,
        endClientCompany: c.endClientCompany,
        workLocation: c.workLocation,
        engagement: c.engagement ?? null,
        workOrder: c.workOrder
          ? {
              id: c.workOrder.id,
              number: c.workOrder.number,
              sellerNumber: c.workOrder.sellerNumber,
              status: c.workOrder.status,
              issuedById: c.workOrder.issuedById,
              issuedToId: c.workOrder.issuedToId,
              billToId: c.workOrder.billToId,
              payerId: c.workOrder.payerId,
              // A ceiling is money, and a consultant sitting on the line
              // is not a party to the order above it.
              amount: isConsultant ? null : Number(c.workOrder.amount),
              currency: c.workOrder.currency,
              /** How many people are on this document, this one included. */
              lines: c.workOrder._count.sellContracts,
            }
          : null,
        masterContract: c.projectOrder,
        pairedWith: c.buyLinks[0]?.buyContract
          ? {
              id: c.buyLinks[0].buyContract.id,
              // Null where we employ the person: payroll pays that line,
              // and there is no firm below us to name.
              counterpartName: c.buyLinks[0].buyContract.vendorCompany?.name ?? null,
            }
          : null,
        state: c.state,
        // What the client is charged is the supplier's margin seen from the
        // other end, and a consultant reading it can subtract their own pay
        // rate from it. `payerScope` answers a consultant seat with their
        // own contracts — the right rows — and the rows carried the bill
        // rate anyway. Whose rate a caller may read is the same question
        // `/api/placements/[id]` already asks before it renders one.
        billRate: isConsultant ? null : c.billRate,
        billCurrency: isConsultant ? null : c.billCurrency,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate?.toISOString() ?? null,
        timesheets: c._count.timesheets,
        cycles: c._count.sellCycles,
        rolloff: c.rolloff ? { id: c.rolloff.id, endDate: c.rolloff.endDate.toISOString(), outcome: c.rolloff.outcome } : null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      // Said plainly when somebody is seeing less than the whole firm. A
      // total that silently excludes half the company is worse than a
      // smaller one somebody understands.
      scopedTo: wall.note,
    },
  })
}

function errResponse(message: string, field: string) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, field } },
    { status: 422 }
  )
}
