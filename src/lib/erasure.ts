/**
 * Forgetting somebody, which here means anonymizing them and never
 * deleting the row.
 *
 * ── Why a tombstone and not a delete ─────────────────────────────────
 *
 * `Person` is the hinge of the whole model, and the schema says why
 * beside the column: dropping the row takes the access log with it
 * (`AccessLog.subject` cascades), leaves every approval signed by
 * nobody, and makes an invoice that has already been paid stop footing.
 * `lib/account-lifecycle` has refused an outright delete since it was
 * written, for the same reason.
 *
 * So the record of the work survives and the identity does not. The
 * email becomes `erased-<id>@erased.invalid` — reserved by RFC 2606,
 * unregistrable, and routed nowhere, so a person who asked to be
 * forgotten can never be written to again — and the name becomes "Erased
 * person". Everything that pointed at them goes on pointing at them and
 * now resolves to nobody, which is what anonymization means here.
 *
 * ── The plan is pure and the executor is not ─────────────────────────
 *
 * `planErasure` takes a footprint and returns what will happen to each
 * category, with a sentence. Nothing in it touches a database, so every
 * branch that deletes something is testable. `executeErasure` applies a
 * plan inside one transaction and writes the trail.
 *
 * ── The fates are the schema's, not this file's ──────────────────────
 *
 * `Person.erasedAt`'s doc comment maps every `HELD` category in
 * `lib/legal` to one of four fates, and `lib/retention`'s SCHEDULE
 * carries that map with the periods filled in. This file reads it rather
 * than deciding again, so a category that changes fate changes in one
 * place.
 *
 * `lib/notify/data-rights` has its own FATES table, written by
 * etyme-conversation so the words could be read back before the first
 * column existed. The two agree category by category with one exception,
 * recorded here rather than quietly reconciled: **onboarding paperwork**.
 * The letter calls it kept under a marker; the schema comment puts it
 * under "kept until a statutory period runs, then deleted". This file
 * follows the schema, so a person asking to be forgotten is told their
 * onboarding pack is HELD with a period behind it rather than
 * anonymized. The letter is the friendlier of the two and the schema is
 * the more careful, and where they differ the careful one wins.
 *
 * Owned by etyme-regulatory (`lib/erasure` in `lib/domains.ts`).
 */

import { prisma } from '@/lib/db'
import { HELD } from '@/lib/legal'
import { scheduleFor, verdictFor, type Facts } from '@/lib/retention'
import { logAccess } from '@/lib/access-log'

// ── The tombstone ─────────────────────────────────────────────────────

export interface Tombstone {
  primaryEmail: string
  name: string
}

/**
 * The address nothing can reach and the name nobody is.
 *
 * `.invalid` is reserved by RFC 2606 and cannot be registered, which is
 * the same precedent the seeded demo companies use so that a real
 * employee can never be seated inside a fictional tenant. Keying it on
 * the person id keeps `Person.primaryEmail`'s unique index satisfied
 * however many people are erased.
 */
export function tombstoneFor(personId: string): Tombstone {
  return { primaryEmail: `erased-${personId}@erased.invalid`, name: 'Erased person' }
}

/** Whether an address is a tombstone. Nothing may be sent to one. */
export function isTombstone(email: string | null | undefined): boolean {
  return !!email && email.endsWith('@erased.invalid')
}

// ── The plan ──────────────────────────────────────────────────────────

/** What happens to one category. */
export type Disposition =
  /** Gone, and nothing waits for it. */
  | 'DELETED'
  /** The row stays, the dates and amounts stay, the name comes off. */
  | 'ANONYMIZED'
  /** Kept whole, because somebody is required to keep it. */
  | 'KEPT'
  /** Kept until a statutory period runs, and then deleted. */
  | 'HELD'

export interface PlanLine {
  /** Exactly as `HELD` in `lib/legal` names it. */
  category: string
  disposition: Disposition
  /** What happens, in the person's own words. */
  says: string
  /** The day the held part may go, where one can be counted. Often null. */
  until: Date | null
  /** How many rows this touches, where the footprint counted them. */
  rows: number
}

/** How a company knew this person. It decides what its letter says. */
export type Holding = 'EMPLOYER' | 'SUPPLIER' | 'CLIENT'

export interface Holder {
  companyId: string
  companyName: string
  holding: Holding
}

export interface Footprint {
  personId: string
  facts: Facts
  /** Rows per `HELD` category. A category absent or zero is not mentioned. */
  counts: Record<string, number>
  /** Unlifted holds naming this person, in the holder's own words. */
  holds: { reason: string }[]
  /** Who to tell once it has run. */
  holders: Holder[]
}

export interface Plan {
  personId: string
  tombstone: Tombstone
  lines: PlanLine[]
  /** Categories actually held about them, for the letters. */
  categories: string[]
  /** True where a hold stops it. The request goes to HELD, never REFUSED. */
  blocked: boolean
  /**
   * What the person is told when it is blocked: the reason, never the
   * matter reference, which is the holder's own business.
   */
  blockedSays: string | null
  holders: Holder[]
}

const DISPOSITION_OF: Record<string, Disposition> = {
  DELETED: 'DELETED',
  KEPT_ANONYMIZED: 'ANONYMIZED',
  KEPT_IN_FULL: 'KEPT',
  HELD_THEN_DELETED: 'HELD',
}

/**
 * What will happen, category by category, before anything happens.
 *
 * The person is sent this before the cooling period runs, so the parts
 * that will not be deleted are said before the day rather than after it.
 */
export function planErasure(f: Footprint): Plan {
  const held = f.holds.length > 0
  const facts: Facts = {
    ...f.facts,
    underLegalHold: held || f.facts.underLegalHold,
    holdReason: f.holds[0]?.reason ?? f.facts.holdReason ?? null,
  }

  const categories = HELD.map((h) => h.category).filter((c) => (f.counts[c] ?? 0) > 0)
  const lines: PlanLine[] = []

  for (const category of categories) {
    const line = scheduleFor(category)
    const v = verdictFor(category, facts)
    const disposition: Disposition = held
      ? 'HELD'
      : (line ? DISPOSITION_OF[line.fate] : 'KEPT')

    lines.push({
      category,
      disposition,
      says: v.says,
      until: v.until,
      rows: f.counts[category] ?? 0,
    })
  }

  return {
    personId: f.personId,
    tombstone: tombstoneFor(f.personId),
    lines,
    categories,
    blocked: held,
    blockedSays: held
      ? 'A company has asked that these records be kept for now, and gave this reason: ' +
        `${f.holds[0].reason} Nothing has been erased. The request stays open, and it ` +
        'runs by itself the day the last hold is lifted.'
      : null,
    holders: f.holders,
  }
}

/** The categories the plan will actually destroy or blank. */
export function willDelete(plan: Plan): string[] {
  return plan.lines.filter((l) => l.disposition === 'DELETED').map((l) => l.category)
}

/** The categories kept back, with the sentence saying why. */
export function keptBecause(plan: Plan): string[] {
  return plan.lines
    .filter((l) => l.disposition === 'KEPT' || l.disposition === 'HELD')
    .map((l) => l.says)
}

// ── Reading the footprint, and running the plan ───────────────────────

/**
 * Count what is actually held about somebody, by the privacy notice's
 * own categories.
 *
 * Every category the notice names is counted from the model it names, so
 * a category that says it is held and has nothing behind it shows as
 * zero rather than appearing in a letter about nothing.
 */
export async function footprintFor(personId: string, now = new Date()): Promise<Footprint | null> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, name: true, primaryEmail: true },
  })
  if (!person) return null

  const [
    credentials, profile, resumes, visas, verifications, packets,
    classifications, exempts, sells, buys, timesheets, messages,
    accessLogs, blacklists, doNotSubmits, favorites,
    seats, approvals, requisitions, signedWeeks, deskDecisions,
  ] = await Promise.all([
    prisma.credential.count({ where: { personId } }),
    prisma.consultantProfile.count({ where: { personId } }),
    prisma.resume.count({ where: { personId } }),
    prisma.visaPetition.count({ where: { personId } }),
    prisma.verification.count({ where: { personId } }),
    prisma.documentPacket.count({ where: { subjectPersonId: personId } }),
    prisma.classificationCall.count({ where: { personId } }),
    prisma.exemptAssertion.count({ where: { personId } }),
    prisma.sellContract.count({ where: { personId } }),
    prisma.buyContractCandidate.count({ where: { personId } }),
    prisma.timesheet.count({ where: { personId } }),
    prisma.message.count({ where: { authorId: personId } }),
    prisma.accessLog.count({ where: { subjectId: personId } }),
    prisma.blacklist.count({ where: { targetType: 'PERSON', targetId: personId } }),
    prisma.doNotSubmit.count({ where: { personId } }),
    prisma.favorite.count({ where: { targetType: 'PERSON', targetId: personId } }),
    // The business-user side of the same person. Everybody who signs in
    // holds a seat, and a seat that decided things is the company's own
    // record of its own decisions — so it is counted, and the letter
    // says it is kept under a marker rather than forgotten.
    prisma.context.count({ where: { personId } }),
    prisma.requirementApproval.count({ where: { approverId: personId } }),
    prisma.requirement.count({ where: { raisedById: personId } }),
    prisma.timesheet.count({
      where: { OR: [{ clientApprovedById: personId }, { employerAcceptedById: personId }] },
    }),
    Promise.all([
      prisma.overtimeDecision.count({ where: { decidedById: personId } }),
      prisma.classificationCall.count({ where: { decidedById: personId } }),
      prisma.supplierRequest.count({ where: { decidedById: personId } }),
      prisma.legalHold.count({ where: { placedById: personId } }),
    ]).then((n) => n.reduce((a, b) => a + b, 0)),
  ])

  const counts: Record<string, number> = {
    'Identity and sign-in': 1 + credentials,
    'A consultant own profile': profile,
    'Resumes': resumes,
    'Work authorization and immigration': visas,
    'Checks somebody else ran': verifications,
    'Onboarding paperwork': packets,
    'Positions taken about how somebody is engaged': classifications + exempts,
    'Money about a person': sells + buys + timesheets,
    'Time on site': sells,
    'Bars and preferences': blacklists + doNotSubmits + favorites,
    // Both of these are about a company, not about a person, and the
    // schema says so on `Company.erasedAt`: a firm's own legal and
    // trading records are the firm's and are not erased by a person's
    // request. Counting a person's seat here would put "your company's
    // records" in a consultant's letter about themselves.
    'Company and supplier records': 0,
    'Payment details': 0,
    'Messages': messages,
    'Logs': accessLogs,
    'A seat at a company, and what was decided from it':
      seats + approvals + requisitions + signedWeeks + deskDecisions,
  }

  const holds = await prisma.legalHold.findMany({
    where: { subjectPersonId: personId, liftedAt: null },
    select: { reason: true },
    orderBy: { placedAt: 'asc' },
  })

  // The dates the schedule counts from. A buy contract is where the firm
  // that pays somebody is named, so employment starts and ends there.
  const buyLines = await prisma.buyContractCandidate.findMany({
    where: { personId },
    select: { startDate: true, endDate: true },
    orderBy: { startDate: 'asc' },
  })
  const sellLines = await prisma.sellContract.findMany({
    where: { personId },
    select: { startDate: true, endDate: true },
    orderBy: { startDate: 'asc' },
  })
  const ends = [...buyLines, ...sellLines].map((l) => l.endDate).filter((d): d is Date => !!d)
  const stillOpen = [...buyLines, ...sellLines].some((l) => !l.endDate || l.endDate > now)

  const facts: Facts = {
    now,
    hiredAt: buyLines[0]?.startDate ?? sellLines[0]?.startDate ?? null,
    employmentEndedAt: stillOpen || ends.length === 0
      ? null
      : new Date(Math.max(...ends.map((d) => d.getTime()))),
    lastPaidAt: stillOpen || ends.length === 0
      ? null
      : new Date(Math.max(...ends.map((d) => d.getTime()))),
    underLegalHold: holds.length > 0,
    holdReason: holds[0]?.reason ?? null,
  }

  return { personId, facts, counts, holds, holders: await holdersOf(personId) }
}

/**
 * The firms to write to once it has run, and how each knew them.
 *
 * ── A seat is a way of knowing somebody too ──────────────────────────
 *
 * This read contracts and listings only, so a person whose whole
 * relationship with Etyme is a seat — a client's AP clerk, a supplier's
 * account manager, a compliance officer — was erased and **nobody was
 * told**. Their employer's approvals, signed weeks and requisitions
 * quietly stopped naming anybody and the firm whose record it was read
 * nothing about it. Every other holder gets a letter saying its books
 * still add up; the one firm that employs the person got silence.
 *
 * So an EMPLOYEE seat counts as employment, which is what it is. A
 * CONSULTANT seat does not: that firm is already here as a supplier
 * through the listing or the contract, and the employer letter would
 * tell a bench vendor it holds payroll it does not.
 */
export async function holdersOf(personId: string): Promise<Holder[]> {
  const [buys, sells, listings, seats] = await Promise.all([
    prisma.buyContractCandidate.findMany({
      where: { personId },
      select: { buyContract: { select: { companyId: true, company: { select: { name: true } } } } },
    }),
    prisma.sellContract.findMany({
      where: { personId },
      select: {
        companyId: true, company: { select: { name: true } },
        clientCompanyId: true, clientCompany: { select: { name: true } },
      },
    }),
    prisma.benchListing.findMany({
      where: { consultant: { personId }, revokedAt: null },
      select: { companyId: true, company: { select: { name: true } } },
    }),
    prisma.context.findMany({
      where: { personId, type: 'EMPLOYEE', companyId: { not: null } },
      select: { companyId: true, company: { select: { name: true } } },
    }),
  ])

  const out = new Map<string, Holder>()
  // Order matters: an employer hears the employer's letter even where it
  // also listed them, because payroll and the I-9 are the louder fact.
  for (const l of listings) out.set(l.companyId, { companyId: l.companyId, companyName: l.company.name, holding: 'SUPPLIER' })
  for (const s of sells) {
    if (s.clientCompanyId) {
      out.set(s.clientCompanyId, { companyId: s.clientCompanyId, companyName: s.clientCompany?.name ?? 'the client', holding: 'CLIENT' })
    }
    out.set(s.companyId, { companyId: s.companyId, companyName: s.company.name, holding: 'SUPPLIER' })
  }
  for (const b of buys) {
    out.set(b.buyContract.companyId, {
      companyId: b.buyContract.companyId,
      companyName: b.buyContract.company.name,
      holding: 'EMPLOYER',
    })
  }
  for (const c of seats) {
    if (!c.companyId) continue
    out.set(c.companyId, {
      companyId: c.companyId,
      companyName: c.company?.name ?? 'their employer',
      holding: 'EMPLOYER',
    })
  }
  return [...out.values()]
}

export interface ErasureOutcome {
  ran: boolean
  plan: Plan
  /** Why it did not run, where it did not. */
  because: string | null
}

/**
 * Run the plan, inside one transaction, and leave the trail.
 *
 * Order matters in exactly one place and it is the first line:
 * credentials go before anything else, because a live sign-in method for
 * somebody who asked to be forgotten is the one survivor that cannot be
 * defended, and a transaction that fell over halfway through should have
 * failed with the door already locked.
 */
export async function executeErasure(
  personId: string,
  opts: { now?: Date; actorPersonId?: string | null; actorCompanyId?: string | null } = {}
): Promise<ErasureOutcome> {
  const now = opts.now ?? new Date()
  const footprint = await footprintFor(personId, now)
  if (!footprint) {
    throw new Error(`No person ${personId} to erase.`)
  }
  const plan = planErasure(footprint)

  // Reading somebody's whole file is a read, and this one is logged even
  // though the person asked for it themselves.
  logAccess({
    subjectId: personId,
    actorPersonId: opts.actorPersonId ?? undefined,
    actorCompanyId: opts.actorCompanyId ?? undefined,
    action: 'ERASURE',
    allowed: !plan.blocked,
    reason: plan.blocked
      ? 'Read in order to erase, and held: an unlifted legal hold names this person.'
      : 'Read in order to erase, on the person’s own request.',
  })

  if (plan.blocked) {
    return { ran: false, plan, because: plan.blockedSays }
  }

  const tombstone = plan.tombstone

  // Read before anything is written: the address is what finds a
  // signature that carries this person's name as text rather than as a
  // link, and after the tombstone it finds nothing.
  const was = await prisma.person.findUniqueOrThrow({
    where: { id: personId },
    select: { primaryEmail: true },
  })

  await prisma.$transaction(async (tx) => {
    // 1. The door, first.
    await tx.credential.deleteMany({ where: { personId } })

    // 2. Their own marketing of themselves. Bench listings cascade off
    //    the profile, which is what closes them at every supplier.
    await tx.consultantProfile.deleteMany({ where: { personId } })

    // 3. Resumes. One never sent goes; one already sent keeps its row
    //    with the bytes and the text cleared, because it is in the
    //    receiving company's records and Etyme cannot unsend it — which
    //    is what the privacy notice already promises.
    const sent = await tx.submission.findMany({
      where: { resume: { personId } },
      select: { resumeId: true },
    })
    const sentIds = [...new Set(sent.map((s) => s.resumeId).filter((id): id is string => !!id))]
    await tx.resume.updateMany({
      where: { id: { in: sentIds } },
      data: { bytes: null, url: null, textExtract: null, fileName: 'erased', label: 'Erased' },
    })
    await tx.resume.deleteMany({ where: { personId, id: { notIn: sentIds.length > 0 ? sentIds : ['—'] } } })

    // 4. Bars and preferences. A bar on somebody nobody can name goes on
    //    refusing them forever, which is worse than losing the bar.
    await tx.blacklist.deleteMany({ where: { targetType: 'PERSON', targetId: personId } })
    await tx.doNotSubmit.deleteMany({ where: { personId } })
    await tx.favorite.deleteMany({ where: { targetType: 'PERSON', targetId: personId } })

    // 4b. A signature on an agreement carries a name as **text**, not as
    //     a link to this row, so the tombstone does not reach it: a
    //     person who asked to be forgotten went on being named, in full,
    //     with their work email beside it, on every agreement they put
    //     their name to. The paper itself is outside Etyme and cannot be
    //     rewritten; what is here is the record of it, and the record
    //     keeps everything that proves the agreement was executed — the
    //     title that speaks to authority, the date on the paper, how it
    //     was signed and the attestation word for word — while the
    //     identity goes, which is exactly what a marker is.
    const signed = await tx.agreementSignature.findMany({
      where: { OR: [{ attestedById: personId }, { signerEmail: was.primaryEmail }] },
      select: { id: true },
    })
    if (signed.length > 0) {
      await tx.agreementSignature.updateMany({
        where: { id: { in: signed.map((r) => r.id) } },
        data: { signerName: tombstone.name, signerEmail: null },
      })
    }

    // 5. The tombstone. Everything else on this person goes on pointing
    //    at this row and now resolves to nobody — which is what keeps the
    //    days on site, the signed weeks and the paid invoices intact.
    await tx.person.update({
      where: { id: personId },
      data: {
        name: tombstone.name,
        primaryEmail: tombstone.primaryEmail,
        timezone: null,
        erasedAt: now,
      },
    })

    // 6. One automation row per company whose records changed, because an
    //    automation log is read per company and each firm is owed the
    //    record of what happened inside its own book.
    const companyIds = [...new Set(plan.holders.map((h) => h.companyId))]
    for (const companyId of companyIds) {
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'ERASURE_COMPLETE',
          summary:
            'Somebody asked to be forgotten and the request ran. Their identity is a ' +
            'tombstone; the hours, the amounts and the days on site in your records are ' +
            'unchanged and now name nobody.',
          reason:
            'The cooling period passed with no legal hold standing in the way. ' +
            'Erasure here is anonymization: nothing is deleted that a book depends on, ' +
            'and nothing puts back what was.',
          payload: {
            personId,
            deleted: willDelete(plan),
            kept: plan.lines.filter((l) => l.disposition !== 'DELETED').map((l) => l.category),
          },
          reversible: false,
        },
      })
    }
  })

  return { ran: true, plan, because: null }
}
