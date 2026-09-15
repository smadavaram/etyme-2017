import { prisma } from '@/lib/db'
import {
  decideSubmission, holdExpiry, live, endBecauseOf, tellThem,
  type Hold, type Verdict,
} from '@/lib/representation'
import { clientLabel } from '@/lib/openings'

/**
 * Taking and giving back a representation hold, against the database.
 *
 * The rules are in representation.ts and are pure. This is the part that
 * touches rows, and it exists separately because two things here are easy
 * to get wrong and expensive to get wrong quietly:
 *
 *   A hold that has run out must never block anybody, even if nothing has
 *   swept it yet. Every read filters on the clock, and taking a hold
 *   clears the stale ones for that person and client first — so
 *   correctness never depends on a cron job having run.
 *
 *   Two vendors must never end up holding the same person at the same
 *   client, including under a race. The unique index on
 *   (personId, holdKey) is what actually guarantees that; this code just
 *   has to not swallow the error when the database says no.
 */

/**
 * The client a hold is keyed to.
 *
 * The end client where it is known, because an MSP and a prime feeding the
 * same site is precisely the case where one person gets submitted twice.
 * Otherwise whoever posted the requirement, which is the best that can
 * honestly be said.
 */
export function clientOf(r: { companyId: string; endClientCompanyId?: string | null }): string {
  return r.endClientCompanyId ?? r.companyId
}

function toHold(row: {
  companyId: string
  clientCompanyId: string | null
  openingId?: string | null
  state: string
  takenAt: Date
  expiresAt: Date
}): Hold {
  return {
    companyId: row.companyId,
    // Blind demand has no client to key on, so the seat stands in for it.
    // The pair is what matters, not which of the two named it.
    clientCompanyId: row.clientCompanyId ?? `opening:${row.openingId ?? 'unknown'}`,
    state: row.state as Hold['state'],
    takenAt: row.takenAt,
    expiresAt: row.expiresAt,
  }
}

/** Every hold on this person at this client — live, lapsed, or asked for. */
export async function holdsAt(personId: string, clientCompanyId: string): Promise<Hold[]> {
  const rows = await prisma.representation.findMany({
    where: { personId, clientCompanyId, state: { in: ['HELD', 'REQUESTED'] } },
    select: { companyId: true, clientCompanyId: true, state: true, takenAt: true, expiresAt: true },
  })
  return rows.map(toHold)
}

/**
 * Whether this vendor may put this person in front of this client.
 *
 * Reads the three things the decision rests on — their listing, their
 * do-not-submit list, and who already holds them — and hands them to the
 * pure rule.
 */
export async function maySubmit(input: {
  personId: string
  companyId: string
  clientCompanyId: string
  now?: Date
}): Promise<Verdict> {
  const now = input.now ?? new Date()

  const [profile, blocked, holds] = await Promise.all([
    prisma.consultantProfile.findUnique({
      where: { personId: input.personId },
      select: {
        listings: {
          where: { companyId: input.companyId },
          select: { revokedAt: true, askFirst: true },
          take: 1,
        },
      },
    }),
    prisma.doNotSubmit.findUnique({
      where: { personId_companyId: { personId: input.personId, companyId: input.clientCompanyId } },
      select: { id: true },
    }),
    holdsAt(input.personId, input.clientCompanyId),
  ])

  return decideSubmission({
    now,
    companyId: input.companyId,
    listing: profile?.listings[0] ?? null,
    blocked: blocked !== null,
    holds,
  })
}

/**
 * Take the hold.
 *
 * Called after the submission is created, not before — a hold on a
 * submission that then failed would keep somebody out of a client's
 * pipeline for a month for nothing.
 *
 * Returns null when somebody else got there first. That is a real outcome
 * rather than an error: two recruiters at different agencies pressing
 * submit in the same second is exactly what this is here to arbitrate, and
 * the loser needs the ordinary refusal, not a stack trace.
 */
export async function takeHold(input: {
  personId: string
  companyId: string
  clientCompanyId: string
  requirementId?: string | null
  now?: Date
}): Promise<{ id: string; expiresAt: Date } | null> {
  const now = input.now ?? new Date()

  // Clear anything that has run out, so a lapsed hold never blocks a real
  // one. Doing it here rather than only in the nightly sweep means the
  // answer is right the moment somebody asks, not the morning after.
  await sweepExpired(input.personId, input.clientCompanyId, now)

  const existing = await prisma.representation.findFirst({
    where: {
      personId: input.personId,
      companyId: input.companyId,
      clientCompanyId: input.clientCompanyId,
      state: 'HELD',
      expiresAt: { gt: now },
    },
    select: { id: true, expiresAt: true },
  })
  if (existing) return existing

  try {
    return await prisma.representation.create({
      data: {
        personId: input.personId,
        companyId: input.companyId,
        clientCompanyId: input.clientCompanyId,
        requirementId: input.requirementId ?? null,
        state: 'HELD',
        takenAt: now,
        expiresAt: holdExpiry(now),
        holdKey: input.clientCompanyId,
      },
      select: { id: true, expiresAt: true },
    })
  } catch (err: unknown) {
    // The unique index did its job: somebody else holds them here.
    if ((err as { code?: string })?.code === 'P2002') return null
    throw err
  }
}

/** Record that somebody asked, where the person wants to be asked. */
export async function askFor(input: {
  personId: string
  companyId: string
  clientCompanyId: string
  requirementId?: string | null
  now?: Date
}): Promise<{ id: string } | null> {
  const now = input.now ?? new Date()

  const already = await prisma.representation.findFirst({
    where: {
      personId: input.personId,
      companyId: input.companyId,
      clientCompanyId: input.clientCompanyId,
      state: 'REQUESTED',
    },
    select: { id: true },
  })
  if (already) return null

  return prisma.representation.create({
    data: {
      personId: input.personId,
      companyId: input.companyId,
      clientCompanyId: input.clientCompanyId,
      requirementId: input.requirementId ?? null,
      state: 'REQUESTED',
      takenAt: now,
      expiresAt: holdExpiry(now),
      // No hold key. Asking is not holding, and a question must never
      // block another agency from submitting.
      holdKey: null,
    },
    select: { id: true },
  })
}

/**
 * Give a hold back.
 *
 * Clearing holdKey is what frees the client, so it happens in the same
 * write as the state change and never in a separate step somebody could
 * skip.
 */
export async function endHold(
  id: string,
  reason: string,
  by: 'VENDOR' | 'PERSON' | 'SYSTEM' | 'CLIENT',
  state: 'RELEASED' | 'EXPIRED' | 'DECLINED' = 'RELEASED'
): Promise<void> {
  await prisma.representation.updateMany({
    where: { id, endedAt: null },
    data: { state, endedAt: new Date(), endedReason: reason, endedBy: by, holdKey: null },
  })
}

/** Everything this vendor's submission decision did to the person's holds. */
export async function endHoldsForSubmission(input: {
  personId: string
  companyId: string
  clientCompanyId: string
  submissionStatus: string
}): Promise<string | null> {
  const verdict = endBecauseOf(input.submissionStatus)
  if (!verdict.end) return null

  const holds = await prisma.representation.findMany({
    where: {
      personId: input.personId,
      companyId: input.companyId,
      clientCompanyId: input.clientCompanyId,
      state: 'HELD',
    },
    select: { id: true },
  })

  for (const h of holds) await endHold(h.id, verdict.reason, 'CLIENT')
  return holds.length > 0 ? verdict.reason : null
}

/** Retire holds that have run their window. Safe to call at any time. */
export async function sweepExpired(
  personId?: string,
  clientCompanyId?: string,
  now: Date = new Date()
): Promise<number> {
  const result = await prisma.representation.updateMany({
    where: {
      state: 'HELD',
      expiresAt: { lte: now },
      ...(personId ? { personId } : {}),
      ...(clientCompanyId ? { clientCompanyId } : {}),
    },
    data: {
      state: 'EXPIRED',
      endedAt: now,
      endedBy: 'SYSTEM',
      endedReason: 'Thirty days passed with no decision, so the hold went back.',
      holdKey: null,
    },
  })
  return result.count
}

// ── What the person themselves sees ──────────────────────────────────

export interface BenchOfMine {
  listingId: string
  company: string
  companyId: string
  tier: string
  since: string
  askFirst: boolean
  showBeforeFree: boolean
  /** What this agency has actually done with the listing. */
  submissions: number
  holds: { client: string; daysLeft: number; role: string | null; id: string }[]
}

export interface WhoHasMe {
  benches: BenchOfMine[]
  /** Agencies asking permission for a client, waiting on them. */
  asking: { id: string; company: string; client: string; role: string | null; askedAt: string }[]
  /** Clients they have ruled out. */
  notThese: { id: string; company: string; companyId: string; note: string | null }[]
  /** Every submission made in their name, whoever made it. */
  history: {
    company: string
    client: string
    role: string
    when: string
    status: string
    /** Where it went next, or null while it is still with whoever has it. */
    sentOnTo: string | null
  }[]
}

/**
 * Who has me, what have they done with me, and where am I held.
 *
 * The view that has never existed anywhere in this industry. A consultant
 * on ten benches currently has no way to know how many times they have
 * been submitted, to whom, or by which agency — they find out when a
 * client's recruiter says "we already have your CV from somebody else".
 *
 * One person's own data, so nothing here is filtered. It is the exact
 * opposite of every other read in the system, and that is the point.
 */
export async function whoHasMe(personId: string, now: Date = new Date()): Promise<WhoHasMe> {
  await sweepExpired(personId, undefined, now)

  const [profile, reps, submissions, blocked] = await Promise.all([
    prisma.consultantProfile.findUnique({
      where: { personId },
      select: {
        listings: {
          where: { revokedAt: null },
          select: {
            id: true, companyId: true, tier: true, grantedAt: true,
            askFirst: true, showBeforeFree: true,
            company: { select: { name: true } },
          },
          orderBy: { grantedAt: 'desc' },
        },
      },
    }),
    prisma.representation.findMany({
      where: { personId, state: { in: ['HELD', 'REQUESTED'] } },
      select: {
        id: true, companyId: true, state: true, expiresAt: true, takenAt: true,
        clientCompanyId: true,
        company: { select: { name: true } },
        clientCompany: { select: { name: true } },
        opening: { select: { inferredClient: true } },
        requirement: { select: { title: true } },
      },
    }),
    prisma.submission.findMany({
      where: { personId },
      select: {
        submittedAt: true, status: true,
        forwardedAt: true, forwardedVia: true, forwardedToEmail: true,
        forwardedOn: {
          select: {
            submittedAt: true, status: true,
            toCompany: { select: { name: true } },
          },
        },
        fromCompany: { select: { name: true } },
        toCompany: { select: { name: true } },
        requirement: { select: { title: true, endClientCompany: { select: { name: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    }),
    prisma.doNotSubmit.findMany({
      where: { personId },
      select: { id: true, note: true, companyId: true, company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const heldByCompany = new Map<string, BenchOfMine['holds']>()
  for (const r of reps) {
    if (r.state !== 'HELD' || r.expiresAt <= now) continue
    const list = heldByCompany.get(r.companyId) ?? []
    list.push({
      id: r.id,
      // Blind demand is the ordinary case, so this says what it can rather
      // than showing the person a blank where their client should be.
      client: clientLabel({
        clientName: r.clientCompany?.name,
        inferredClient: r.opening?.inferredClient,
      }),
      role: r.requirement?.title ?? null,
      daysLeft: Math.max(0, Math.ceil((r.expiresAt.getTime() - now.getTime()) / 86_400_000)),
    })
    heldByCompany.set(r.companyId, list)
  }

  const submittedByCompany = new Map<string, number>()
  for (const s of submissions) {
    const name = s.fromCompany.name
    submittedByCompany.set(name, (submittedByCompany.get(name) ?? 0) + 1)
  }

  return {
    benches: (profile?.listings ?? []).map((l) => ({
      listingId: l.id,
      companyId: l.companyId,
      company: l.company.name,
      tier: l.tier,
      since: l.grantedAt.toISOString().slice(0, 10),
      askFirst: l.askFirst,
      showBeforeFree: l.showBeforeFree,
      submissions: submittedByCompany.get(l.company.name) ?? 0,
      holds: heldByCompany.get(l.companyId) ?? [],
    })),
    asking: reps
      .filter((r) => r.state === 'REQUESTED')
      .map((r) => ({
        id: r.id,
        company: r.company.name,
        client: clientLabel({
          clientName: r.clientCompany?.name,
          inferredClient: r.opening?.inferredClient,
        }),
        role: r.requirement?.title ?? null,
        askedAt: r.takenAt.toISOString().slice(0, 10),
      })),
    notThese: blocked.map((b) => ({
      id: b.id,
      companyId: b.companyId,
      company: b.company.name,
      note: b.note,
    })),
    history: submissions.map((s) => {
      // How far it actually got. A status word says what the agency
      // recorded; this says whether the name reached the person who
      // decides, which is the question they are actually asking.
      const onward = s.forwardedOn[0]
      const wentOn = onward
        ? `${onward.toCompany.name} on ${onward.submittedAt.toISOString().slice(0, 10)}`
        : s.forwardedAt
          ? `emailed to ${s.forwardedToEmail ?? 'the client'} on ${s.forwardedAt.toISOString().slice(0, 10)}`
          : null

      return {
        company: s.fromCompany.name,
        client: s.requirement.endClientCompany?.name ?? s.toCompany.name,
        role: s.requirement.title,
        when: s.submittedAt.toISOString().slice(0, 10),
        status: s.status,
        // Null means it is still sitting with whoever received it — which
        // is a fact worth showing rather than hiding behind "submitted".
        sentOnTo: wentOn,
      }
    }),
  }
}

export { live, tellThem }

/**
 * End every hold on this person at this client, whoever has it.
 *
 * Used when the outcome is settled for everybody rather than for one
 * vendor — a placement, most obviously. The ones who lost have plainly
 * stopped trying, and leaving their holds standing would keep the person
 * off the market at a client where they now work.
 */
export async function releaseAllAt(input: {
  personId: string
  clientCompanyId: string
  reason: string
}): Promise<number> {
  const result = await prisma.representation.updateMany({
    where: { personId: input.personId, clientCompanyId: input.clientCompanyId, state: 'HELD' },
    data: {
      state: 'RELEASED',
      endedAt: new Date(),
      endedReason: input.reason,
      endedBy: 'SYSTEM',
      holdKey: null,
    },
  })
  return result.count
}
