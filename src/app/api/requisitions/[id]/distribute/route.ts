import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { descendants } from '@/lib/org-tree'
import { mayDistribute } from '@/lib/requisition-approval'
import { seatFor, actingInSeat } from '@/lib/program-seat'
import { reachedOnlyThrough, dealsWith } from '@/app/api/suppliers/direct'
import { siteSuppliers } from '@/lib/sites'
import { mayFillAtSite } from '@/lib/site-rules'
import { sendJobTo, type VendorBand } from '../../send'
import { maySendJob } from '../../who-sends'
import { recordRefusal } from '@/lib/access-log'
import { mayBeSentJob, notYourSupplierSays, SENDS_A_JOB_TO } from '@/lib/supplier-list'
import { isMine } from '@/lib/counterparty'
import { positionsFor } from '@/app/api/companies/positions'

/**
 * POST /api/requisitions/:id/distribute
 *
 * Body: {
 *   vendors: [{ companyId, payMin?, payMax?, message? }],
 *   expiresAt?: ISO date
 * }
 *
 * Puts an approved requisition in front of vendors — the moment demand
 * becomes visible to supply, and the reason a vendor joins at all.
 *
 * CLAUDE.md invariant: "Rate bands live on RequirementInvitation, never on
 * Requirement where a recipient could read another vendor's rate." So the
 * band is given PER VENDOR here, and the response never echoes one
 * vendor's band back to another. A preferred supplier and a one-time
 * supplier are routinely offered different numbers for the same role; a
 * single band applied to everyone throws that away and leaks it besides.
 *
 * Only an approved requisition may be distributed. Without that gate the
 * approval chain decides nothing.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const vendors: VendorBand[] = Array.isArray(body.vendors) ? body.vendors : []

  if (vendors.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'vendors must be a non-empty array', field: 'vendors' } },
      { status: 422 }
    )
  }

  const requisition = await prisma.requirement.findUnique({
    where: { id },
    include: { company: { select: { id: true, name: true, kind: true } }, site: { select: { id: true, name: true, city: true } } },
  })

  if (!requisition) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Job request not found' } },
      { status: 404 }
    )
  }

  // The company that raised it is the only one that may put it to
  // market — or a program office sitting in a seat that company granted,
  // which is the same company's desk held by another firm.
  //
  // Resolved before either gate. Choosing which suppliers see a role is
  // the program office's job by name (`lib/company-defaults` gives
  // `requirements.distribute` to the Program Manager and to Procurement
  // and to nobody else), so an outsourced program office that could not
  // do it could not run the program at all.
  const seat = await seatFor(caller, requisition.companyId)
  const acting = seat ? actingInSeat(caller, seat) : caller

  if (!seat && caller.company?.id !== requisition.companyId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the raising company may distribute this job request' } },
      { status: 403 }
    )
  }

  // A seat over one business unit distributes that unit's roles only.
  if (seat?.orgUnitId && requisition.orgUnitId !== seat.orgUnitId) {
    const units = await prisma.orgUnit.findMany({
      where: { companyId: requisition.companyId },
      select: { id: true, parentId: true },
    })
    const reach = [seat.orgUnitId, ...descendants(units, seat.orgUnitId)]
    if (!requisition.orgUnitId || !reach.includes(requisition.orgUnitId)) {
      return NextResponse.json(
        {
          error: {
            code: 'OUTSIDE_YOUR_SEAT',
            message:
              `${caller.company!.name}'s role at ${requisition.company.name} covers one part of the program, ` +
              'and this job sits outside it.',
          },
        },
        { status: 403 }
      )
    }
  }

  // And within it, only the desk that sends jobs out at this kind of
  // firm. At a client that is the program office: a hiring manager raises
  // the role and deliberately does not choose who sees it, the control
  // that stops work being routed to a friend (lib/company-defaults). At a
  // supplier sending a job down to its sub-vendor it is the account
  // manager or the owner, because a supplier has no program office
  // (`./who-sends`). The refusal names the role that sends there.
  const sends = maySendJob(
    { kind: requisition.company.kind, name: requisition.company.name },
    acting.permissions,
  )
  if (!sends.ok) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: sends.says } },
      { status: 403 }
    )
  }

  // The gate that makes approval mean something.
  if (!mayDistribute(requisition.approvalState)) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_APPROVED',
          message: `Job request is ${requisition.approvalState} — it must be approved before vendors see it`,
        },
      },
      { status: 409 }
    )
  }

  // Each band must be coherent on its own before anything is sent.
  for (const v of vendors) {
    if (!v.companyId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Every vendor entry needs a companyId' } },
        { status: 422 }
      )
    }
    if (v.payMin != null && v.payMax != null && v.payMin > v.payMax) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: `Band for ${v.companyId} has a minimum above its maximum` } },
        { status: 422 }
      )
    }
    // A band above what the client itself will pay is a mistake worth
    // catching before a vendor sources against it.
    if (v.payMax != null && requisition.billMax != null && v.payMax > requisition.billMax) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: `Band for ${v.companyId} exceeds the job request ceiling of $${Math.round(requisition.billMax / 100)}/hr`,
          },
        },
        { status: 422 }
      )
    }
  }

  const vendorIds = [...new Set(vendors.map(v => v.companyId))]

  // Never a firm the raising company reaches only through a prime. That
  // firm is the prime's sub-vendor, whose name is the prime's to keep; a
  // job sent to it is the client going round the prime. The refusal names
  // nobody, so it confirms nothing about a firm the caller should not
  // know is there. A firm with no history here at all is new, not hidden,
  // and stays the program office's call.
  const belowAPrime = await reachedOnlyThrough(requisition.companyId)
  const strangers = vendorIds.filter(v => belowAPrime.has(v))
  if (strangers.length > 0) {
    return NextResponse.json(
      { error: { code: 'NOT_YOUR_SUPPLIER', message: notYourSupplierSays(strangers.length, requisition.company.name) } },
      { status: 403 }
    )
  }
  const [vendorCompanies, registerRows] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: vendorIds } },
      select: { id: true, name: true, kind: true, claimedAt: true, listedById: true },
    }),
    prisma.counterparty.findMany({
      where: { companyId: requisition.companyId, otherCompanyId: { in: vendorIds } },
      select: { otherCompanyId: true, relationship: true },
    }),
  ])
  const vendorMap = new Map(vendorCompanies.map(c => [c.id, { id: c.id, name: c.name }]))

  // ── Only a firm the raising company already deals with ─────────────
  //
  // Review, 2026-11-13: a job sent here writes an invitation with a rate
  // band on the other firm's books and tells its people, and an
  // invitation is one of the facts that make two firms "work together".
  // So a firm named by id that the raising company does not deal with
  // (`dealsWith`: its own register as a supplier or prime, an agreement,
  // the firm's register naming it, an order, a contract, or a job either
  // way) is refused, and refused exactly as an id that is not there: the
  // same sentence, naming nobody, so the answer confirms nothing about a
  // firm the caller does not know. A firm the raising company recorded
  // itself is its own list's to decide (`mayBeSentJob`, below).
  const dealt = await dealsWith(
    requisition.companyId,
    vendorCompanies.filter((c) => !isMine(c, requisition.companyId)).map((c) => c.id),
    SENDS_A_JOB_TO,
  )
  const notDealt = vendorCompanies.filter((c) => !isMine(c, requisition.companyId) && !dealt.has(c.id))
  const unknown = vendorIds.filter((v) => !vendorMap.has(v))
  if (notDealt.length > 0 || unknown.length > 0) {
    const n = notDealt.length + unknown.length
    const says = notYourSupplierSays(n, requisition.company.name)
    if (unknown.length > 0) {
      await recordRefusal([{ companyId: requisition.companyId }], {
        actorPersonId: caller.person.id,
        actorCompanyId: caller.company?.id,
        action: 'CONTRACT_VIEW',
        reason: `Refused to send ${requisition.title} to ${unknown.length === 1 ? 'a company id' : `${unknown.length} company ids`} not on Etyme: ${says}`,
      })
    }
    if (notDealt.length > 0) {
      await recordRefusal(notDealt.map((c) => ({ companyId: c.id })), {
        actorPersonId: caller.person.id,
        actorCompanyId: caller.company?.id,
        action: 'CONTRACT_VIEW',
        reason: `Refused to send ${requisition.title} to ${notDealt.map((c) => c.name).join(', ')}, ${notDealt.length === 1 ? 'a firm' : 'firms'} ${requisition.company.name} does not deal with: ${says}`,
      })
    }
    return NextResponse.json({ error: { code: 'NOT_YOUR_SUPPLIER', message: says, field: 'vendors' } }, { status: 403 })
  }

  // Never a company on the Companies list that holds no position (the
  // neutral Company, 2026-11-12): it is a record, and a job goes to it
  // only once it is extended to Supplier, which writes the register row
  // read here. Decided from the register, never from the Kind: a record
  // given a Kind and no position is still not a supplier (review,
  // 2026-11-13). Only the raising company's own records and companies of
  // Kind not classified are read; every other firm reads as before. The
  // refusal names it and the step, logged first.
  const heldBy = await positionsFor(
    requisition.companyId,
    vendorCompanies.filter((c) => isMine(c, requisition.companyId) || c.kind === 'UNCLASSIFIED'),
  )
  for (const c of vendorCompanies) {
    const may = mayBeSentJob(
      c,
      registerRows.filter((r) => r.otherCompanyId === c.id).map((r) => r.relationship),
      heldBy.get(c.id) ?? null,
    )
    if (!may.ok) {
      // Another firm's record is never named: it is that firm's list.
      const says =
        c.listedById === requisition.companyId
          ? may.says
          : `One of the firms you picked is not a supplier of ${requisition.company.name}, so this job request cannot be sent to it. Send it to the suppliers you buy from.`
      await recordRefusal([{ companyId: c.id }], {
        actorPersonId: caller.person.id,
        actorCompanyId: caller.company?.id,
        action: 'CONTRACT_VIEW',
        reason: `Refused to send ${requisition.title} to ${c.name}: ${says}`,
      })
      return NextResponse.json(
        { error: { code: 'NOT_CLASSIFIED', message: says, field: 'vendors' } },
        { status: 403 }
      )
    }
  }

  // Only the suppliers Procurement cleared. An empty list means it
  // cleared by rule and every approved supplier is eligible; a named
  // list is the go-ahead, and the release cannot widen it.
  const cleared = requisition.clearedSupplierIds ?? []
  if (cleared.length > 0) {
    const notCleared = vendorIds.filter(v => !cleared.includes(v))
    if (notCleared.length > 0) {
      const names = notCleared.map(v => vendorMap.get(v)?.name ?? v).join(', ')
      return NextResponse.json(
        {
          error: {
            code: 'NOT_CLEARED',
            message:
              `${names} ${notCleared.length === 1 ? 'was' : 'were'} not among the suppliers Procurement cleared for this requirement. ` +
              'Ask Procurement to add them, or leave them out.',
          },
        },
        { status: 403 }
      )
    }
  }

  // A job at a site goes only to the firms approved there (founder,
  // 2026-10-28, the Sites drawing). The refusal is the site's own
  // sentence: it names the firm and the site, and says to ask Procurement.
  // A job with no site goes where it always went, every approved supplier.
  // A prime's own copy of a client's job carries the client's site, and
  // the client's site list says nothing about who the prime buys from, so
  // the rule is read only on a site of the company sending the job.
  const atSite = requisition.locationId ? await siteSuppliers(requisition.locationId) : null
  if (atSite && atSite.site.companyId === requisition.companyId) {
    const approved = new Set(atSite.approved.map((f) => f.id))
    for (const vid of vendorIds) {
      const at = mayFillAtSite({
        supplier: { id: vid, name: vendorMap.get(vid)?.name ?? 'That firm' },
        site: atSite.site,
        client: requisition.company.name,
        approved,
        atSite,
      })
      if (!at.ok) {
        return NextResponse.json(
          { error: { code: 'NOT_APPROVED_AT_SITE', message: at.says } },
          { status: 403 }
        )
      }
    }
  }

  // A fortnight unless somebody says otherwise, and never a date that has
  // already passed — an invitation that expires before it is read is a
  // supplier told to bid and refused at the door.
  const expiresAt = body.expiresAt
    ? new Date(body.expiresAt)
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  if (body.expiresAt && (isNaN(expiresAt.getTime()) || expiresAt <= new Date())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'expiresAt must be a date in the future', field: 'expiresAt' } },
      { status: 422 }
    )
  }

  const results = await sendJobTo({ requisition, vendors, vendorMap, expiresAt, caller })
  const sent = results.filter(r => r.status === 'sent')

  return NextResponse.json({
    data: {
      requirementId: id,
      // Deliberately no bands here — the caller supplied them and each
      // vendor learns only its own, when it reads its invitation.
      results,
      summary: {
        sent: sent.length,
        alreadyInvited: results.filter(r => r.status === 'already_invited').length,
        errors: results.filter(r => r.status === 'error').length,
      },
      expiresAt: expiresAt.toISOString(),
      message: sent.length === 1 ? 'Sent to 1 supplier.' : `Sent to ${sent.length} suppliers.`,
    },
  })
}
