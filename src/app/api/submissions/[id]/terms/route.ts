import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logAccess } from '@/lib/access-log'
import { notify } from '@/lib/notify'
import { holdsContractDesk } from '@/lib/papering'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { localKey } from '@/lib/cycle-generator'
import { loadContractHolidays } from '@/lib/holidays'
import {
  checkStatedTerms, engagementOf, perHour, noDatesBefore, ENGAGEMENT_WORDS, TERMS_PAPER,
} from '@/lib/award/hire-terms'
import { termsOnRecordFor } from '@/lib/award/terms-on-record'
import { placementStatus } from '@/lib/award/placement-status'

/**
 * GET  /api/submissions/:id/terms
 * POST /api/submissions/:id/terms   { action: 'state', engagementType, payRate }   — the firm
 *                                   { action: 'agree' }                           — the person
 *
 * Hop 0: the person and the first firm agree how the person is engaged
 * and what they are paid, before anybody starts.
 *
 * The award writes no pay line where those terms are not on record
 * (`buySide` in lib/award), because a bench listing is consent to be
 * marketed and never consent to be employed. This is where the line is
 * written instead: the firm's contract desk states the terms — employee,
 * independent, or through the person's own company, at a rate above
 * nothing — and the person says yes on their own page. An employee is
 * told, not asked: the firm's word is enough where it already employs
 * them.
 *
 * `:id` is the submission the first firm made — the one at the bottom of
 * any chain, the firm that holds the person. Nobody else reads this:
 * not the client, not a firm further up. The rate here is the person's
 * own pay and is nobody else's business.
 */

type Ctx = { params: Promise<{ id: string }> }

async function load(id: string) {
  const sub = await prisma.submission.findUnique({
    where: { id },
    select: {
      id: true, personId: true, fromCompanyId: true, toCompanyId: true, requirementId: true,
      parentSubmissionId: true,
      person: { select: { name: true, consultant: { select: { ownCompany: { select: { id: true, name: true } } } } } },
      fromCompany: { select: { name: true, templatePack: true } },
      toCompany: { select: { name: true } },
      requirement: { select: { title: true } },
    },
  })
  if (!sub) return null
  const sell = await prisma.sellContract.findFirst({
    where: { companyId: sub.fromCompanyId, personId: sub.personId, requirementId: sub.requirementId },
    select: {
      id: true, state: true, startDate: true, endDate: true, billCurrency: true, clientCompanyId: true,
      buyLinks: {
        select: {
          buyContract: {
            select: {
              id: true, contractType: true, vendorCompanyId: true,
              candidates: { select: { id: true, personId: true, payRate: true } },
              docs: {
                where: { template: { name: TERMS_PAPER } },
                orderBy: { id: 'desc' },
                take: 1,
                select: { id: true, signedAt: true, countersignedAt: true },
              },
            },
          },
        },
      },
    },
  })
  return { sub, sell }
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>

/** The hop 0 line under this placement, where one has been written. */
function payLineOf(l: Loaded) {
  const own = l.sub.person.consultant?.ownCompany?.id ?? null
  const buys = (l.sell?.buyLinks ?? []).map((b) => b.buyContract)
  return buys.find((b) => b.vendorCompanyId === null || b.vendorCompanyId === own) ?? null
}

async function employs(companyId: string, personId: string): Promise<boolean> {
  return (await prisma.context.count({ where: { companyId, personId, type: 'EMPLOYEE', revokedAt: null } })) > 0
}

function refuse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status })
}

/** Who this caller is to these terms: the person, the firm, or nobody. */
function partyOf(caller: { person: { id: string }; company: { id: string } | null }, l: Loaded): 'PERSON' | 'FIRM' | null {
  if (caller.person.id === l.sub.personId) return 'PERSON'
  if (caller.company?.id === l.sub.fromCompanyId) return 'FIRM'
  return null
}

async function answer(l: Loaded, you: 'PERSON' | 'FIRM', permissions: readonly string[]) {
  const line = payLineOf(l)
  const own = l.sub.person.consultant?.ownCompany ?? null
  const cand = line?.candidates.find((c) => c.personId === l.sub.personId) ?? line?.candidates[0] ?? null
  const paper = line?.docs[0] ?? null
  const employee = await employs(l.sub.fromCompanyId, l.sub.personId)
  const verdict = l.sell ? (await termsOnRecordFor([l.sell.id])).get(l.sell.id) ?? null : null
  const status = l.sell
    ? placementStatus(
        { state: l.sell.state, startDate: l.sell.startDate, endDate: l.sell.endDate, termsOnRecord: verdict?.onRecord ?? false },
        new Date()
      )
    : null
  const type = line ? engagementOf({ contractType: line.contractType, vendorCompanyId: line.vendorCompanyId, ownCompanyId: own?.id ?? null }) : null
  const agreed = !!paper?.signedAt
  return {
    you,
    person: { id: l.sub.personId, name: l.sub.person.name, ownCompany: own },
    firm: { id: l.sub.fromCompanyId, name: l.sub.fromCompany.name },
    // The firm this firm sold to, and the job as this firm knows it.
    soldTo: l.sub.toCompany.name,
    role: l.sub.requirement.title,
    placed: !!l.sell,
    startDate: l.sell?.startDate.toISOString().slice(0, 10) ?? null,
    employee,
    terms: line && cand && cand.payRate > 0
      ? {
          engagementType: type,
          engagementWords: type ? ENGAGEMENT_WORDS[type] : line.contractType,
          payRate: cand.payRate,
          payRateWords: perHour(cand.payRate),
          firmConfirmedAt: paper?.countersignedAt?.toISOString() ?? null,
          personAgreedAt: paper?.signedAt?.toISOString() ?? null,
        }
      : null,
    onRecord: verdict?.onRecord ?? false,
    says: verdict?.says ?? `${l.sub.person.name} is not placed through ${l.sub.fromCompany.name} yet.`,
    waitingOn: verdict?.waitingOn ?? null,
    placement: status,
    may: {
      state: you === 'FIRM' && !!l.sell && holdsContractDesk(permissions) && !agreed,
      agree: you === 'PERSON' && !!paper?.countersignedAt && !agreed,
    },
  }
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const l = await load(id)
  if (!l) return refuse('NOT_FOUND', 'Nothing was found under that link.', 404)

  const you = partyOf(caller, l)
  if (!you) {
    logAccess({
      subjectId: l.sub.personId, actorPersonId: caller.person.id, actorCompanyId: caller.company?.id,
      action: 'CONTRACT_VIEW', allowed: false,
      reason: 'Asked for a person’s own terms with a firm and is neither the person nor the firm',
    })
    return refuse(
      'NOT_A_PARTY',
      `These are the terms between ${l.sub.person.name} and the firm that holds them. Only those two can read them.`,
      403
    )
  }
  if (l.sub.parentSubmissionId) {
    return refuse('NOT_HOP_ZERO', 'These terms are agreed with the firm at the bottom of the chain, not this one.', 409)
  }
  if (you === 'FIRM') {
    logAccess({
      subjectId: l.sub.personId, actorPersonId: caller.person.id, actorCompanyId: caller.company?.id,
      action: 'CONTRACT_VIEW', reason: `Read ${l.sub.person.name}’s own terms of engagement`,
    })
  }
  return NextResponse.json({ data: await answer(l, you, caller.permissions ?? []) })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const l = await load(id)
  if (!l) return refuse('NOT_FOUND', 'Nothing was found under that link.', 404)

  const you = partyOf(caller, l)
  if (!you) {
    return refuse(
      'NOT_A_PARTY',
      `Only ${l.sub.person.name} and ${l.sub.fromCompany.name} agree these terms.`,
      403
    )
  }
  if (l.sub.parentSubmissionId) {
    return refuse('NOT_HOP_ZERO', 'These terms are agreed with the firm at the bottom of the chain, not this one.', 409)
  }
  if (!l.sell) {
    return refuse('NOT_PLACED', `${l.sub.person.name} has not been placed through ${l.sub.fromCompany.name} yet, so there are no terms to agree.`, 409)
  }
  const sell = l.sell
  const line = payLineOf(l)
  const paper = line?.docs[0] ?? null

  // ── The person says yes ────────────────────────────────────────────
  if (body?.action === 'agree') {
    if (you !== 'PERSON') {
      return refuse('NOT_THE_PERSON', `Only ${l.sub.person.name} can agree their own terms.`, 403)
    }
    if (!line || !paper?.countersignedAt) {
      return refuse('NOTHING_OFFERED', `${l.sub.fromCompany.name} has not offered terms yet. You will be told when it does.`, 409)
    }
    if (paper.signedAt) {
      return NextResponse.json({ data: await answer(l, you, caller.permissions ?? []) })
    }
    await prisma.docInstance.update({
      where: { id: paper.id },
      data: { signedAt: new Date(), signedById: caller.person.id, status: 'SIGNED' },
    })
    const desks = await contractDesks(l.sub.fromCompanyId)
    for (const d of desks) {
      await notify({
        personId: d,
        companyId: l.sub.fromCompanyId,
        type: 'CONTRACT',
        channel: 'EMAIL',
        title: `${l.sub.person.name} agreed the terms`,
        body:
          `${l.sub.person.name} agreed your terms for ${l.sub.requirement.title}. ` +
          'The placement can go ahead once the start paperwork clears.',
        entityId: sell.id,
        data: { contractId: sell.id, href: `/dashboard/submissions/${id}/terms` },
      })
    }
    return NextResponse.json({ data: await answer(await load(id) as Loaded, you, caller.permissions ?? []) })
  }

  // ── The firm states the terms ──────────────────────────────────────
  if (body?.action !== 'state') {
    return refuse('WHAT_ACTION', 'Say whether you are stating the terms or agreeing them.', 400)
  }
  if (you !== 'FIRM' || !holdsContractDesk(caller.permissions ?? [])) {
    return refuse(
      'NOT_THE_CONTRACT_DESK',
      `Stating ${l.sub.person.name}’s terms is for the contract desk at ${l.sub.fromCompany.name}.`,
      403
    )
  }
  if (paper?.signedAt) {
    return refuse(
      'ALREADY_AGREED',
      `${l.sub.person.name} has already agreed these terms. A change to their pay goes through the pay line on the placement.`,
      409
    )
  }
  const stated = checkStatedTerms({
    engagementType: body.engagementType,
    payRateCents: typeof body.payRate === 'number' ? body.payRate : Number(body.payRate),
    personName: l.sub.person.name,
    firmName: l.sub.fromCompany.name,
    ownCompany: l.sub.person.consultant?.ownCompany ?? null,
  })
  if (!stated.ok) return refuse(stated.code, stated.says, 422)

  const employee = await employs(l.sub.fromCompanyId, l.sub.personId)
  const holidays = sell.endDate
    ? await loadContractHolidays(l.sub.fromCompanyId, sell.clientCompanyId, sell.startDate.getFullYear(), sell.endDate.getFullYear())
    : new Set<string>()

  await prisma.$transaction(async (tx) => {
    let buyId: string
    if (line) {
      await tx.buyContract.update({
        where: { id: line.id },
        data: { contractType: stated.contractType, vendorCompanyId: stated.vendorCompanyId },
      })
      const cand = line.candidates.find((c) => c.personId === l.sub.personId)
      if (cand) await tx.buyContractCandidate.update({ where: { id: cand.id }, data: { payRate: stated.payRateCents } })
      else {
        await tx.buyContractCandidate.create({
          data: {
            buyContractId: line.id, personId: l.sub.personId, payRate: stated.payRateCents,
            payCurrency: sell.billCurrency, startDate: sell.startDate, endDate: sell.endDate,
          },
        })
      }
      buyId = line.id
    } else {
      const created = await tx.buyContract.create({
        data: {
          companyId: l.sub.fromCompanyId,
          vendorCompanyId: stated.vendorCompanyId,
          contractType: stated.contractType,
          payCurrency: sell.billCurrency,
          state: 'DRAFT',
          startDate: sell.startDate,
          endDate: sell.endDate,
        },
      })
      buyId = created.id
      await tx.buyContractCandidate.create({
        data: {
          buyContractId: buyId, personId: l.sub.personId, payRate: stated.payRateCents,
          payCurrency: sell.billCurrency, startDate: sell.startDate, endDate: sell.endDate,
        },
      })
      await tx.contractLink.create({
        data: { sellContractId: sell.id, buyContractId: buyId, effectiveFrom: sell.startDate, effectiveTo: sell.endDate },
      })
      // The pay dates the award could not write without a pay line. The
      // sell side's are already on the books, and are passed in so they
      // are not written twice.
      const written = await tx.cycle.findMany({ where: { sellContractId: sell.id }, select: { kind: true, dueOn: true } })
      const already = new Map<string, Set<string>>()
      for (const c of written) {
        const days = already.get(c.kind) ?? new Set<string>()
        days.add(localKey(c.dueOn))
        already.set(c.kind, days)
      }
      await writeCyclesFor(tx, {
        sell: { id: sell.id, startDate: sell.startDate, endDate: sell.endDate },
        buy: { id: buyId, contractType: stated.contractType, vendorCompanyId: stated.vendorCompanyId },
        packId: l.sub.fromCompany.templatePack ?? 'US_IT',
        holidays,
        existing: already,
        // Terms stated after the start writes no pay date already gone.
        onlyPeriodsAfter: noDatesBefore(new Date()),
      })
    }

    // The paper both sides sign. An employee is told, not asked, so there
    // is no paper waiting on them: the firm's word, on the line, is the
    // record. Everybody else signs.
    if (!employee) {
      const template =
        (await tx.docTemplate.findFirst({ where: { companyId: l.sub.fromCompanyId, name: TERMS_PAPER }, select: { id: true } })) ??
        (await tx.docTemplate.create({
          data: { companyId: l.sub.fromCompanyId, name: TERMS_PAPER, audience: 'CANDIDATE', needsSignature: true },
          select: { id: true },
        }))
      if (paper) {
        await tx.docInstance.update({
          where: { id: paper.id },
          data: { countersignedAt: new Date(), countersignedById: caller.person.id, note: stated.says, sentAt: new Date(), status: 'SENT' },
        })
      } else {
        await tx.docInstance.create({
          data: {
            templateId: template.id,
            buyContractId: buyId,
            subjectType: 'BUY_CONTRACT',
            subjectId: buyId,
            status: 'SENT',
            sentAt: new Date(),
            countersignedAt: new Date(),
            countersignedById: caller.person.id,
            note: stated.says,
          },
        })
      }
    }
  })

  // The person hears, by email: an offer to say yes to, or — for an
  // employee — what their pay on this job is. Their own rate and nothing
  // about what anybody bills.
  await notify({
    personId: l.sub.personId,
    type: 'CONTRACT',
    channel: 'EMAIL',
    title: employee
      ? `${l.sub.fromCompany.name} set your pay for ${l.sub.requirement.title}`
      : `${l.sub.fromCompany.name} offers you terms for ${l.sub.requirement.title}`,
    body: employee
      ? `${stated.says} You are their employee, so nothing is waiting on you.`
      : `${stated.says} Nothing starts until you agree. Open your terms to say yes.`,
    entityId: sell.id,
    data: { contractId: sell.id, href: `/dashboard/submissions/${id}/terms` },
  })

  return NextResponse.json({ data: await answer((await load(id)) as Loaded, you, caller.permissions ?? []) }, { status: 201 })
}

/** Who at the firm papers contracts — told when the person says yes. */
async function contractDesks(companyId: string): Promise<string[]> {
  const seats = await prisma.context.findMany({
    where: { companyId, revokedAt: null, type: 'EMPLOYEE' },
    select: { personId: true, role: { select: { permissions: true } } },
  })
  return seats.filter((s) => holdsContractDesk(s.role?.permissions ?? [])).map((s) => s.personId)
}
