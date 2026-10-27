import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { isStaffSeat } from '@/lib/consultant-portfolio'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'

/**
 * GET /api/submissions/own-people — our own W2s, who need no bench listing
 *
 * ── Why this is separate from the bench ──────────────────────────────
 *
 * `/api/bench` answers "who has agreed to let us market them". This
 * answers "who do we employ", and they are different questions with
 * different consents behind them. A prime, a GSI or an MSP staffs work
 * from both: a sub-vendor's consultant who granted a listing, and its
 * own employee who granted nothing because the employment contract
 * already said it.
 *
 * Without this the carve-out at `POST /api/submissions` would be a rule
 * with no door — the submit form's only source of names is the bench, so
 * an employee could never be picked.
 *
 * ── What this deliberately does not do ───────────────────────────────
 *
 * It does not offer the people who run the firm. A delivery engineer and
 * an accounts payable clerk both hold an EMPLOYEE context, and this used
 * to offer both on the reasoning that nothing separates them — but the
 * record does: the clerk's seat holds desk permissions and the engineer's
 * work shows on contract lines. `./who` reads those two facts; the
 * submit route still accepts any employee.
 *
 * It is the firm's own roster, so no `AccessLog` row is written: these
 * are not another party's people, and logging a firm reading its own
 * payroll would bury the reads that matter.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Our own people')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_COMPANY',
          message: 'A payroll belongs to a company. Sign in at the firm whose people you are staffing.',
        },
      },
      { status: 403 }
    )
  }

  // Live means live. A revoked, suspended or expired seat is somebody
  // this firm no longer employs, and the submit route reads it the same
  // way — a picker that offers a name the door then refuses is worse
  // than one that never offered it.
  const seats = await prisma.context.findMany({
    where: {
      companyId: caller.company.id,
      type: 'EMPLOYEE',
      revokedAt: null,
      suspendedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...NOT_THE_SAMPLE_SEAT,
    },
    select: {
      personId: true,
      person: {
        select: {
          id: true,
          name: true,
          consultant: {
            select: {
              skills: true,
              // A listing granted to THIS firm: work that names them, as the Bench page reads it.
              listings: { where: { companyId: caller.company.id, revokedAt: null, state: 'GRANTED' }, select: { id: true } },
            },
          },
        },
      },
      role: { select: { name: true, permissions: true } },
    },
  })

  // The work, read once for everybody on the payroll: a contract line, a
  // submission or a consultant profile says this is somebody the firm
  // staffs, whatever their seat holds.
  const ids = Array.from(new Set(seats.map((s) => s.personId)))
  //
  // At this firm: a line it sells or a submission it made. A delivery
  // manager once placed by another firm is that firm's history, not
  // somebody this firm staffs (supply's check, 2026-10-06).
  const firmId = caller.company.id
  //
  // Staff are not on the payroll count (onboarding walk, 2026-10-27): the
  // same reading the Bench page makes (`isStaffSeat`, supply's), from the
  // same facts — a contract line it sells or a pay line it runs, papered
  // or past, and a listing granted to it — so the two screens never
  // disagree about who is roster.
  const papered = { in: ['PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED', 'ENDED'] as ('PENDING_VERIFICATION' | 'VERIFIED' | 'IN_PROGRESS' | 'PAUSED' | 'ENDED')[] }
  const [lines, buys] = await Promise.all([
    prisma.sellContract.findMany({ where: { personId: { in: ids }, companyId: firmId, state: papered }, select: { personId: true }, distinct: ['personId'] }),
    prisma.buyContractCandidate.findMany({
      where: { personId: { in: ids }, state: { in: ['ACTIVE', 'ENDED'] }, buyContract: { companyId: firmId, state: papered } },
      select: { personId: true }, distinct: ['personId'],
    }),
  ])
  const works = new Set<string>([...lines, ...buys].map((r) => r.personId))
  const permsOf = new Map<string, string[]>()
  for (const seat of seats) {
    permsOf.set(seat.personId, [...(permsOf.get(seat.personId) ?? []), ...(seat.role?.permissions ?? [])])
  }

  // One row per person. Two seats at one firm — a buy desk and a sell
  // desk — is ordinary and is still one employee.
  const byPerson = new Map<string, { personId: string; name: string; role: string | null; skills: string[] }>()
  for (const seat of seats) {
    if (isStaffSeat({
      permissions: permsOf.get(seat.personId) ?? [],
      listed: (seat.person.consultant?.listings.length ?? 0) > 0,
      lines: works.has(seat.personId) ? [seat.personId] : [],
    })) continue
    const existing = byPerson.get(seat.personId)
    if (existing) {
      if (!existing.role && seat.role?.name) existing.role = seat.role.name
      continue
    }
    byPerson.set(seat.personId, {
      personId: seat.personId,
      name: seat.person.name,
      role: seat.role?.name ?? null,
      skills: seat.person.consultant?.skills ?? [],
    })
  }

  const people = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    data: {
      people,
      // Said once, where the picker can show it, so nobody has to know
      // the rule to use the screen.
      says:
        people.length > 0
          ? 'These are on your payroll. Putting one forward needs no bench listing, and they are told where they went.'
          : 'Nobody is on your payroll here yet. Invite your team, and they can be put forward without a bench listing.',
    },
  })
}
