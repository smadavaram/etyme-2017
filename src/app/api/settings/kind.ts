/**
 * Changing what kind of company this is: the reads behind the verdict
 * in lib/company-kind, and the write.
 *
 * The founder's Tapin, 2026-11-02: signed up as "Own company", read the
 * one-person firm's seven links, and had no way to become the bench
 * vendor it is. PATCH /api/settings with `{ type }` comes here.
 */
import { prisma } from '@/lib/db'
import { ensureDefaultRoles } from '@/lib/company-roles'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import { kindWord } from '@/lib/parties'
import { needsVerifiedOwnerAt } from '@/lib/owner-proof'
import {
  KIND_CHOICES, NO_KIND_FACTS, aChoice, choiceByKey, choiceOf, kindChangeVerdict, kindChangedSays,
  type KindChoice, type KindFacts,
} from '@/lib/company-kind'
import type { CompanyKind } from '@prisma/client'

/** A line somebody is working on, or about to: the states the bench reads as papered (lib/bench-filter). */
const LIVE = ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED'] as const
/** A job request nobody can still answer. */
const SHUT = ['FILLED', 'CLOSED', 'CANCELLED', 'ARCHIVED']
/** A person put forward whose answer is in. */
const ANSWERED = ['PLACED', 'NOT_SELECTED', 'REJECTED', 'WITHDRAWN', 'DECLINED']

/** Whether this seat is the company's Owner: its own seat, at this company, holding the Owner role. */
export async function isOwnerSeat(contextId: string, companyId: string): Promise<boolean> {
  const seat = await prisma.context.findFirst({
    where: { id: contextId, companyId, revokedAt: null, role: { name: 'Owner' } },
    select: { id: true },
  })
  return seat !== null
}

/** The Owner's name, for the sentence that sends somebody else to them. */
async function ownerNameOf(companyId: string): Promise<string | null> {
  const seat = await prisma.context.findFirst({
    where: { companyId, revokedAt: null, role: { name: 'Owner' }, ...NOT_THE_SAMPLE_SEAT },
    orderBy: { grantedAt: 'asc' },
    select: { person: { select: { name: true } } },
  })
  return seat?.person.name ?? null
}

/** What on the record depends on this company's type, read once. */
export async function kindFactsOf(companyId: string, ownerId: string, now: Date = new Date()): Promise<KindFacts> {
  const seats = await prisma.context.findMany({
    where: { companyId, revokedAt: null, ...NOT_THE_SAMPLE_SEAT },
    select: { personId: true, person: { select: { name: true } } },
  })
  const seated = [...new Set(seats.map((s) => s.personId))]
  const otherSeats = [...new Map(seats.filter((s) => s.personId !== ownerId).map((s) => [s.personId, s.person.name])).values()]
  const live = { in: [...LIVE] }
  const seatOpen = { revokedAt: null, OR: [{ validTo: null }, { validTo: { gt: now } }] }

  const [ownWork, othersWorkLines, benchAll, benchOthers, sellAll, sellOthers, openJobs, linesAsClient,
    seatsGranted, linesAsPayer, seatsHeld, openSubmissions, benchTurns] = await Promise.all([
    prisma.buyContract.findMany({
      where: { vendorCompanyId: companyId, state: live, candidates: { some: { personId: { in: seated } } } },
      orderBy: { id: 'asc' },
      take: 20,
      select: {
        company: { select: { name: true } },
        candidates: { where: { personId: { in: seated } }, take: 1, select: { person: { select: { name: true } } } },
      },
    }),
    prisma.buyContract.count({
      where: { vendorCompanyId: companyId, state: live, NOT: { candidates: { some: { personId: { in: seated } } } } },
    }),
    prisma.benchListing.count({ where: { companyId, revokedAt: null, state: 'GRANTED' } }),
    prisma.benchListing.count({ where: { companyId, revokedAt: null, state: 'GRANTED', consultant: { personId: { not: ownerId } } } }),
    prisma.sellContract.count({ where: { companyId, state: live } }),
    prisma.sellContract.count({ where: { companyId, state: live, personId: { not: ownerId } } }),
    prisma.requirement.count({ where: { companyId, status: { notIn: SHUT } } }),
    prisma.sellContract.count({ where: { clientCompanyId: companyId, state: live } }),
    prisma.programSeat.count({ where: { clientCompanyId: companyId, ...seatOpen } }),
    prisma.buyContract.count({ where: { companyId, state: live } }),
    prisma.programSeat.count({ where: { officeCompanyId: companyId, ...seatOpen } }),
    prisma.submission.count({ where: { fromCompanyId: companyId, status: { notIn: ANSWERED }, requirement: { status: 'OPEN' } } }),
    prisma.benchHolidaySwitch.count({ where: { companyId, personId: null } }),
  ])

  return {
    ownWorkLines: ownWork.map((l) => ({ buyer: l.company.name, person: l.candidates[0]?.person.name ?? 'somebody seated here' })),
    othersWorkLines,
    otherSeats,
    benchListings: { all: benchAll, others: benchOthers },
    sellLines: { all: sellAll, others: sellOthers },
    openJobs,
    linesAsClient,
    seatsGranted,
    linesAsPayer,
    seatsHeld,
    openSubmissions,
    benchHolidayTurned: benchTurns > 0,
  }
}

/** What the record stores for a choice: a supplier's posture, none for a client, an MSP or a one-person firm. */
export function storedAs(to: KindChoice): { kind: CompanyKind; supplierPosture: string | null } {
  return { kind: to.kind as CompanyKind, supplierPosture: to.posture }
}

export type KindChangeResult =
  | { ok: true; message: string; kind: string; supplierPosture: string | null; rolesAdded: string[] }
  | { ok: false; status: number; message: string; field?: string }

/**
 * Change the company's type, or refuse in a sentence.
 *
 * Kept: every role and seat, every setup answer, the cycle pack, who may
 * see outside, the Owner's own pages. Added: the roles the new type
 * needs. Moved: the type itself, with who and when, and the public
 * page's words where nobody but the rules ever wrote them, so the page
 * speaks as the new type.
 */
export async function changeCompanyKind(input: {
  companyId: string
  contextId: string
  person: { id: string; name: string }
  type: unknown
  now?: Date
}): Promise<KindChangeResult> {
  const now = input.now ?? new Date()
  const to = choiceByKey(input.type)
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true, kind: true, supplierPosture: true, siteWrittenBy: true },
  })
  if (!company) return { ok: false, status: 404, message: 'This company is not on the record.' }
  if (!to) {
    const choices = KIND_CHOICES.map((c) => c.label).join(', ')
    return { ok: false, status: 422, field: 'type', message: `Choose what kind of company ${company.name} is: ${choices}.` }
  }

  // The proof rule (2026-11-12): at a company formed under it, the type
  // waits for a verified Owner, and the refusal names the step.
  const gate = await needsVerifiedOwnerAt(company.id, 'COMPANY_TYPE')
  if (!gate.ok) return { ok: false, status: 403, message: gate.says, field: 'type' }

  const owner = await isOwnerSeat(input.contextId, company.id)
  const facts = owner ? await kindFactsOf(company.id, input.person.id, now) : null
  const verdict = kindChangeVerdict({
    firm: company.name,
    from: { kind: company.kind, posture: company.supplierPosture },
    to,
    isOwner: owner,
    ownerName: owner ? null : await ownerNameOf(company.id),
    facts: facts ?? NO_KIND_FACTS,
  })
  if (!verdict.ok) return { ok: false, status: verdict.status, message: verdict.says, field: 'type' }

  const was = choiceOf(company.kind, company.supplierPosture)
  const fromWords = was ? aChoice(was) : kindWord(company.kind as CompanyKind).toLowerCase()
  const stored = storedAs(to)

  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: company.id },
      data: {
        ...stored,
        kindSetById: input.person.id,
        kindSetAt: now,
        // Words the rules wrote for the old type are cleared, so the page
        // reads the rules for the new one from the live record; words a
        // person or the model wrote are theirs and stay.
        ...(company.siteWrittenBy === 'RULES' ? { siteTagline: null, siteIntro: null } : {}),
      },
    })
    await tx.automationLog.create({
      data: {
        companyId: company.id,
        action: 'COMPANY_TYPE_CHANGED',
        summary: `${input.person.name} changed ${company.name} from ${fromWords} to ${aChoice(to)}`,
        reason: 'Changed by the Owner in settings',
        payload: {
          from: { kind: company.kind, supplierPosture: company.supplierPosture },
          to: stored,
          byPersonId: input.person.id,
          at: now.toISOString(),
        },
        reversible: true,
      },
    })
    // A one-person firm is its Owner's own company, as sign-up records it
    // (lib/company-create); leaving one keeps the link, because the firm is
    // still theirs and their own pay line still reads it.
    if (stored.kind === 'CONSULTANT_CORP') {
      await tx.consultantProfile.upsert({
        where: { personId: input.person.id },
        update: { ownCompanyId: company.id },
        create: { personId: input.person.id, skills: [], visibility: 'INTERNAL', ownCompanyId: company.id },
      })
    }
  })

  // The roles the new type needs, the way a firm formed before a role
  // existed gets it: added, never a role taken away or a seat moved.
  const roles = await ensureDefaultRoles(company.id, stored.kind)

  return {
    ok: true,
    kind: stored.kind,
    supplierPosture: stored.supplierPosture,
    rolesAdded: roles.added,
    message: kindChangedSays({
      firm: company.name,
      from: { kind: company.kind },
      to,
      rolesAdded: roles.added,
      facts: facts ?? { othersWorkLines: 0, benchHolidayTurned: true },
    }),
  }
}
