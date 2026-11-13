import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { hasPermission, askTheDesk, type Permission } from '@/lib/permissions'
import { recordRefusal } from '@/lib/access-log'
import {
  assessGrant, reviewAccess, sensitivityOf, levelOf, deskLine, waitingLine,
  assessDeskChange, canGiveDesks, OWNER_DESK,
  hasSignedIn, seatPlace, deskChangedNotice, needsDecisionCount, inviteFormWords,
  decisionSeats, decisionParts, figuresFor, FINDING_WORDS, type FigureKey,
} from '@/lib/access-grant'
import { companyPolicy } from '@/lib/identity/read'
import { isSamplePerson } from '@/lib/sample-seat'
import { consoleHome, type CompanyKind } from '@/lib/console-home'
import { formatDay } from '@/lib/format-date'
import { movesAloneAfterPass, ownerMovesOnOwnersPage, type Seat } from '@/lib/owner-rules'
import { passedToSeatBy, landMoveAfterPass } from '@/app/api/settings/owners/act'
import { offersFor } from './row-acts'
import { copyTextFor, latestInviteMails } from './invite/one'
import type { EffectiveMode } from '@/lib/identity/policy'
import { readCompanySeats, peopleOf, countSeats, peopleWords, type SeatState } from '@/lib/company-seats'
import { joinSentenceFor } from '@/lib/join-words'

/**
 * Who may read the access register.
 *
 * ── Why this gate exists ─────────────────────────────────────────────
 *
 * It did not, until a release walk signed the demo cookie for a
 * Validation Engineer at a systems integrator — a seat holding exactly
 * `assignments.read` and `timesheets.read`, somebody who files a
 * timesheet and reads the contract they are on — and asked for this
 * route. It answered 200 with the firm's whole staff list: every
 * colleague by name and work email, the role each holds, and the
 * sensitivity of that role. The same seat was correctly refused by
 * `/api/consultants`, `/api/invoices`, `/api/purchase-orders` and
 * `/api/profitability`. POST here has asked for `settings.manage` since
 * the day it was written. Only the read was open, which is the shape
 * `etyme-money` found across nine AR and AP routes and `desks.ts` found
 * on the do-not-return list: a gate written on the write and never on
 * the read beside it.
 *
 * ── Why `governance.read` and not `settings.manage` ──────────────────
 *
 * Because a list exists to be read by more people than may change it,
 * and because who holds what IS the governance picture — it is the only
 * screen in the product that shows a segregation-of-duties problem
 * before it becomes one. Gating the read on `settings.manage` would
 * leave the Compliance Officer, whose whole job is to be able to answer
 * "who could have done this", locked out of the one page that says so;
 * at a client it would leave the Program Manager, who runs the program,
 * unable to see who is waiting for a seat in it.
 *
 * `governance.read` is held by the desks that audit rather than
 * administer: HR and the Compliance Officer at a supplier; the Program
 * Manager, the Approver, HR and Procurement at a client. Granting stays
 * where it was, on `settings.manage`, which only the Owner and the
 * Admin hold. Read the register, ask somebody else to change it.
 *
 * Named as a constant rather than spelled inline so that the nav item
 * pointing here can be checked against it — `__tests__/invariants/
 * sidebar-nav.test.ts` reads the gate back out of this handler.
 */
const TO_READ: Permission = 'governance.read'

/**
 * GET  /api/access — who has what here, and what is worth attention
 * POST /api/access — grant somebody a role
 *
 * The path a joiner is waiting on. Someone signed in on a verified company
 * domain, got a seat and no permissions, and this is where a colleague
 * decides what they may do.
 *
 * Every grant ends on a date. Renewing is a click, forgetting is safe.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The access register')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Who may read what is set by a company, and you are not signed in at one. What is held about you is under Your data.' } },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, TO_READ)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading who holds which seat here',
            needs: TO_READ,
            kind: caller.company.kind,
            companyName: caller.company.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const contexts = await prisma.context.findMany({
    where: { companyId: caller.company.id, revokedAt: null },
    include: {
      person: {
        select: {
          id: true, name: true, primaryEmail: true,
          // Any sign-in anywhere on Etyme. The seat's own use date is
          // cleared by a desk change, so it cannot answer this alone.
          credentials: { where: { lastUsedAt: { not: null } }, select: { id: true }, take: 1 },
        },
      },
      role: { select: { id: true, name: true, permissions: true } },
    },
    orderBy: { grantedAt: 'desc' },
  })

  const now = new Date()

  // ── The figures, from the one reader of seats (founder, 2026-11-12) ──
  // Users & permissions, Settings and Team structure counted a company's
  // people from three queries and disagreed by one. Every figure here is
  // now read through lib/company-seats, so the same company reads the same
  // numbers on every screen: its people (not a consultant on its books,
  // not the shared sample seat), each once, as with access, invited (never
  // signed in) or paused. The sample seat is nobody, so it is not listed
  // either; a consultant's seat is still listed, marked, and not counted.
  const [seats, joins] = await Promise.all([
    readCompanySeats(caller.company.id),
    joinSentenceFor(caller.company.id),
  ])
  const seatOf = new Map(seats.map(s => [s.contextId, s]))
  const isSample = (id: string) => seatOf.get(id)?.isSample === true
  const isConsultant = (id: string) => seatOf.get(id)?.isPerson === false
  const counts = countSeats(peopleOf(seats))
  const consultantsListed = seats.filter(s => !s.isPerson && !s.isSample).length
  const peopleSays = peopleWords(counts) + (consultantsListed
    ? ` Also listed: ${consultantsListed} ${consultantsListed === 1 ? 'consultant' : 'consultants'} on your books, not counted among your people.`
    : '')

  // An invitation is not access, whatever desk it carries. A seat with no
  // desk, or whose person has never signed in, waits; the rest have access.
  const signedInOf = (c: (typeof contexts)[number]) => hasSignedIn({
    invitedAt: c.invitedAt,
    lastUsedAt: c.lastUsedAt,
    everSignedIn: c.person.credentials.length > 0,
  })
  const listed = contexts.filter(c => !isSample(c.id))
  const withAccess = listed.filter(c => seatPlace({ roleName: c.role?.name ?? null, signedIn: signedInOf(c) }) === 'WITH_ACCESS')
  const waiting = listed.filter(c => seatPlace({ roleName: c.role?.name ?? null, signedIn: signedInOf(c) }) === 'WAITING')
  // The address each person signs in with, under their name on every row
  // (founder, 2026-11-12: people with access hid it while people waiting
  // showed it). This register is read only on governance.read, the desks
  // that audit who holds what. The shared sample seat's reserved address
  // is never shown: it is nobody's address.
  const emailOf = (email: string | null | undefined): string | null =>
    email && email.trim() && !isSamplePerson(email) ? email : null
  // The person's name as the one reader says it: never the company's own
  // name (a seat named "Tapin" at Tapin reads as the name in its address).
  const personOf = (c: (typeof contexts)[number]) => ({ id: c.person.id, name: seatOf.get(c.id)?.name ?? c.person.name, primaryEmail: emailOf(c.person.primaryEmail) })
  const emailByContext = new Map(contexts.map(c => [c.id, emailOf(c.person.primaryEmail)]))

  const review = reviewAccess(
    withAccess
      .map(c => ({
        contextId: c.id,
        personName: seatOf.get(c.id)?.name ?? c.person.name,
        roleName: c.role!.name,
        permissions: c.role!.permissions,
        grantedAt: c.grantedAt,
        expiresAt: c.expiresAt,
        lastUsedAt: c.lastUsedAt,
      })),
    now
  )

  // ── The figures, and the rows each one counts (founder, 2026-11-12) ──
  // A figure is a door to exactly the rows it counted, so each row carries
  // the figure its seat is counted under, read from the same seat states
  // the figures are, and whether it is one of the decisions. A consultant
  // is never counted, so the decisions are read over the company's own
  // people only, and the figure and its filter are the same set.
  const FIGURE_OF: Record<SeatState, FigureKey> = {
    WITH_ACCESS: 'with-access', INVITED: 'invited', WAITING_FOR_ROLE: 'waiting-for-role', PAUSED: 'paused',
  }
  const figureOf = (id: string): FigureKey | null => {
    const seat = seatOf.get(id)
    return seat ? FIGURE_OF[seat.state] : null
  }
  const ownReview = review.filter(r => !isConsultant(r.contextId))
  const ownWithAccess = withAccess.filter(c => !isConsultant(c.id)).map(c => ({ contextId: c.id, roleName: c.role!.name }))
  const decisions = decisionSeats(ownReview, ownWithAccess)
  const parts = decisionParts(ownReview, ownWithAccess)
  const findingsOf = (id: string) => review.filter(r => r.contextId === id).map(r => ({ words: FINDING_WORDS[r.finding], detail: r.detail }))

  // Whether the reader holds Owner, so the desk picker offers Owner only
  // to an Owner. The route refuses the same thing on POST.
  const mine = contexts.find(c => c.id === caller.context.id)
  const actorIsOwner = mine?.role?.name === OWNER_DESK

  // Pause, Reinstate and End, per row, for this reader: the same verdicts
  // POST /api/access/:contextId gives (lib/account-lifecycle `rowActs`),
  // so the page draws a press only where the route would take it. An
  // Admin is never offered Pause or End on an Owner; the last Owner is
  // never offered either.
  const offers = offersFor(
    contexts.map(c => ({
      contextId: c.id,
      personId: c.personId,
      hasSignedIn: signedInOf(c),
      roleId: c.roleId,
      rolePermissions: c.role?.permissions ?? [],
      suspendedAt: c.suspendedAt,
      revokedAt: c.revokedAt,
      isOwner: c.role?.name === OWNER_DESK,
      invited: c.invitedAt !== null,
    })),
    { isOwner: actorIsOwner && !mine?.suspendedAt, personId: caller.person.id },
    hasPermission(caller.permissions, 'team.manage'),
  )
  const actsOf = (id: string) => offers.get(id)!

  // The invitation form's words, from the company's own sign-in policy,
  // read by the one policy function. Sent only to a reader who may invite:
  // how a company signs its people in is not a thing to hand an auditor
  // who cannot act on it.
  const mayInvite = hasPermission(caller.permissions, 'team.manage')
  let inviteForm: ReturnType<typeof inviteFormWords> | null = null
  let mode: EffectiveMode = 'OPEN'
  if (mayInvite) {
    const [read, co] = await Promise.all([
      companyPolicy(caller.company.id),
      prisma.company.findUnique({ where: { id: caller.company.id }, select: { domain: true, domainVerified: true } }),
    ])
    mode = read.effective
    inviteForm = inviteFormWords({
      policy: read.policy,
      domain: co?.domainVerified ? co.domain : null,
      oneFirm: caller.company.kind === 'CONSULTANT_CORP',
    })
  }

  // Each waiting invitation's newest email, read once for every row
  // (founder, 2026-11-12): whether it left and when, or why not, in
  // Etyme's words. And the ready message Copy invitation puts on the
  // clipboard, which holds no link that takes the seat. Both only for a
  // reader who may act on the row.
  const invitedWaiting = waiting.filter(c => c.invitedAt !== null && actsOf(c.id).copy)
  const mails = await latestInviteMails(invitedWaiting.map(c => c.id))
  const inviterIds = [...new Set(invitedWaiting.map(c => c.invitedById).filter((id): id is string => Boolean(id)))]
  const inviters = inviterIds.length
    ? new Map((await prisma.person.findMany({ where: { id: { in: inviterIds } }, select: { id: true, name: true } })).map(p => [p.id, p.name]))
    : new Map<string, string>()
  const inviteOf = (c: (typeof contexts)[number]) => {
    if (c.invitedAt === null || !actsOf(c.id).copy) return {}
    const email = emailOf(c.person.primaryEmail)
    return {
      mail: mails.get(c.id) ?? null,
      copyText: email ? copyTextFor({
        inviterName: (c.invitedById && inviters.get(c.invitedById)) || caller.person.name,
        companyName: caller.company!.name,
        roleName: c.role?.name ?? null,
        email,
        mode,
      }) : null,
    }
  }

  return NextResponse.json({
    data: {
      // People who joined on the domain and have no desk yet. This is
      // the queue that matters — somebody is sitting there unable to work.
      //
      // An invitation is not a sign-in: somebody invited who never came
      // in reads "Invited today, not yet signed in", and "joined" is said
      // only of a seat that has been used. Signed in is the rule the
      // withdraw route already uses: never invited, or used since.
      waitingForAccess: waiting.map(c => {
        // Counted from the invitation where there was one: a desk given
        // before they came in moves grantedAt, not the day they were asked.
        const since = c.invitedAt ?? c.grantedAt
        const waitingDays = Math.floor((now.getTime() - since.getTime()) / 86_400_000)
        const invited = c.invitedAt !== null
        const signedIn = signedInOf(c)
        return {
          contextId: c.id,
          person: personOf(c),
          joinedAt: c.grantedAt.toISOString(),
          waitingDays,
          invited,
          signedIn,
          // The desk they will have when they come in, or null.
          role: c.role?.name ?? null,
          roleId: c.role?.id ?? null,
          // A consultant on the firm's books: listed so a seat can be acted
          // on, and never counted among the company's people.
          consultant: isConsultant(c.id),
          figure: figureOf(c.id),
          decision: decisions.has(c.id),
          said: waitingLine({ invited, signedIn, days: waitingDays, desk: c.role?.name ?? null }),
          // A seat may be given an end day before they come in.
          expiresAt: c.expiresAt?.toISOString() ?? null,
          acts: actsOf(c.id),
          ...inviteOf(c),
        }
      }),
      people: withAccess.map(c => ({
        contextId: c.id,
        person: personOf(c),
        role: c.role!.name,
        roleId: c.role!.id,
        // "Member · give them a role" for the seat everybody arrives on.
        line: deskLine(c.role!.name),
        consultant: isConsultant(c.id),
        figure: figureOf(c.id),
        decision: decisions.has(c.id),
        // What the review found on this seat, in words, said on the row
        // while "Needs a decision" filters the list.
        findings: findingsOf(c.id),
        sensitivity: sensitivityOf(c.role!.permissions),
        // The level in words and why, read off the role's own permissions
        // (founder, 2026-11-12: the role and the level are one system).
        level: levelOf(c.role!.name, c.role!.permissions),
        grantedAt: c.grantedAt.toISOString(),
        expiresAt: c.expiresAt?.toISOString() ?? null,
        lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
        reason: c.grantReason,
        // A paused seat says so on its row, with why.
        pausedReason: c.suspendedAt ? c.suspendReason ?? null : null,
        acts: actsOf(c.id),
      })),
      // Only what needs a decision. A review that lists everybody is a
      // review nobody reads.
      review: review.map(r => ({ ...r, findingWords: FINDING_WORDS[r.finding], personEmail: emailByContext.get(r.contextId) ?? null })),
      // What this reader may actually do here, so the screen does not
      // offer a form the route will refuse. Reading opened up on
      // governance.read; granting and inviting did not move.
      canGrant: hasPermission(caller.permissions, 'settings.manage'),
      actorIsOwner,
      canInvite: mayInvite,
      // Absent for a reader who cannot invite (see above).
      ...(inviteForm ? { invite: inviteForm } : {}),
      whyNotGrant: hasPermission(caller.permissions, 'settings.manage') ? null : askTheDesk({
        doing: 'Giving somebody a seat here',
        needs: 'settings.manage',
        kind: caller.company.kind,
        companyName: caller.company.name,
      }),
      whyNotInvite: hasPermission(caller.permissions, 'team.manage') ? null : askTheDesk({
        doing: 'Inviting a colleague',
        needs: 'team.manage',
        kind: caller.company.kind,
        companyName: caller.company.name,
      }),
      // `/api/why` asks for the same permission, and says why somebody
      // else cannot see something — their role, their account, their
      // company's settings. Its own sentence, because "inviting a
      // colleague" is not what the reader was trying to do.
      whyNotExplain: hasPermission(caller.permissions, 'team.manage') ? null : askTheDesk({
        doing: 'Working out why a colleague cannot see something',
        needs: 'team.manage',
        kind: caller.company.kind,
        companyName: caller.company.name,
      }),
      // How people join this company, in one sentence read off what the
      // doors do (lib/join-words), or null for a one-person firm. It
      // replaces the fixed line that said everybody on the email domain
      // joins at once as Member, which was true only of a verified domain
      // set to join at once.
      joins,
      summary: {
        // The headline, from the one reader: "6 people: 3 with access ·
        // 3 invited". The same words Settings and Team structure say.
        peopleSays,
        // The company's people in each state (lib/company-seats). A Member
        // with no role who has signed in has access and is counted here;
        // the list still shows them under "Waiting for access" with "no
        // role yet", and "Needs a decision" counts them.
        withAccess: counts.withAccess,
        invited: counts.invited,
        waitingForRole: counts.waitingForRole,
        paused: counts.paused,
        // The rows under "Waiting for access": invited, or in with no role.
        waiting: waiting.length,
        // Every review finding plus every Member waiting for a desk: a
        // Member reads "give them a role" on the list, so it is counted.
        // The company's own people only: a consultant is never counted.
        needsAttention: needsDecisionCount(ownReview, ownWithAccess),
        // Each figure with the line under it, zeros left out except With
        // access (lib/access-grant `figureWords`). A figure's number is
        // the number of rows whose `figure` (or `decision`) it names.
        figures: figuresFor(counts, decisions.size, parts),
        expired: review.filter(r => r.finding === 'EXPIRED').length,
        dormant: review.filter(r => r.finding === 'DORMANT').length,
      },
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Who may read what is set by a company, and you are not signed in at one. What is held about you is under Your data.' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { contextId, roleId, days, reason } = body

  // A refusal about a seat is written, and waited for, before it is sent
  // (security review, 2026-11-12), naming the person whose seat was asked
  // about wherever it is; nothing about them goes into the reply.
  const refuseAbout = async (message: string) => {
    const asked = typeof contextId === 'string'
      ? await prisma.context.findUnique({ where: { id: contextId }, select: { personId: true } })
      : null
    if (asked) await recordRefusal([asked.personId], { actorPersonId: caller.person.id, actorCompanyId: caller.company!.id, action: 'DESK_CHANGE', reason: message })
  }

  if (!hasPermission(caller.permissions, 'settings.manage')) {
    const message = askTheDesk({
      doing: 'Giving somebody a seat here',
      needs: 'settings.manage',
      kind: caller.company.kind,
      companyName: caller.company.name,
    })
    await refuseAbout(message)
    return NextResponse.json({ error: { code: 'FORBIDDEN', message } }, { status: 403 })
  }

  const target = await prisma.context.findFirst({
    where: { id: contextId, companyId: caller.company.id, revokedAt: null },
    include: {
      person: { select: { id: true, name: true } },
      role: { select: { name: true, permissions: true } },
    },
  })
  if (!target) {
    await refuseAbout('That person is not at this company')
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That person is not at this company' } },
      { status: 404 }
    )
  }

  // An end day is a day after today. The page's "Ends on" field turns a
  // calendar day into days and refuses a past one before it is sent; this
  // is the same rule for any other caller.
  if (days !== null && days !== undefined && days !== '' && !(Number.isInteger(Number(days)) && Number(days) >= 1)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Pick a day after today. Access cannot end on a day that has already begun.', field: 'days' } },
      { status: 422 }
    )
  }

  const role = await prisma.role.findFirst({
    where: { id: roleId, companyId: caller.company.id },
    select: { id: true, name: true, permissions: true },
  })
  if (!role) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such role at this company' } },
      { status: 404 }
    )
  }

  // ── Changing a desk, not only giving a first one ──
  // The same POST gives a waiting person their first desk and moves a
  // seated person to another, so the rules for moving sit here too: Owner
  // only by an Owner, an Owner's desk changed only by an Owner, and never
  // the last person who can give desks moved off it.
  const actor = await prisma.context.findUnique({
    where: { id: caller.context.id },
    select: { role: { select: { name: true } } },
  })

  // ── An Owner is moved off Owner only under Settings → Owners ──
  // (founder, 2026-11-11 and 2026-11-12): moving an Owner needs another
  // Owner's yes, which this route has no card for. The one exception is
  // the Owner who took over by a pass moving the previous Owner to Admin
  // (lib/owner-rules `movesAloneAfterPass`), written by the same function
  // Settings → Owners uses, so it is recorded and the previous Owner told.
  if (target.role?.name === OWNER_DESK && role.name !== OWNER_DESK) {
    const seatOf = (id: string, personId: string, name: string, roleName: string | null, live: boolean): Seat => ({ contextId: id, personId, name, roleName, live })
    const me = seatOf(caller.context.id, caller.person.id, caller.person.name, actor?.role?.name ?? null, true)
    const them = seatOf(target.id, target.personId, target.person.name, OWNER_DESK, !target.suspendedAt)
    const alone = me.roleName === OWNER_DESK && movesAloneAfterPass({
      actor: me, subject: them, toRoleName: role.name, passedToActorBy: await passedToSeatBy(caller.company.id, caller.context.id),
    })
    const why = String(reason ?? '').trim().slice(0, 500)
    if (alone && why) {
      const says = await landMoveAfterPass({
        company: { id: caller.company.id, name: caller.company.name },
        actor: { personId: caller.person.id, name: caller.person.name },
        subject: { personId: target.personId, name: target.person.name, contextId: target.id },
        reason: why,
      })
      return NextResponse.json({ data: { message: says } })
    }
    const message = alone ? 'Say why, in a sentence. It is kept beside the change with your name.' : ownerMovesOnOwnersPage(target.person.name)
    // Written, and waited for, before the refusal is sent (security review, 2026-11-12).
    await recordRefusal([target.personId], { actorPersonId: caller.person.id, actorCompanyId: caller.company.id, action: 'DESK_CHANGE', reason: message })
    return NextResponse.json(
      { error: { code: 'DESK_REFUSED', message, href: '/dashboard/settings/owners' } },
      { status: 422 }
    )
  }
  const othersWhoCanGiveDesks = await prisma.context.count({
    where: {
      companyId: caller.company.id,
      revokedAt: null,
      suspendedAt: null,
      id: { not: target.id },
      role: { permissions: { hasSome: ['*', 'settings.manage'] } },
    },
  })
  const move = assessDeskChange({
    fromRole: target.role?.name ?? null,
    toRole: role.name,
    actorIsOwner: actor?.role?.name === OWNER_DESK,
    fromCanGiveDesks: canGiveDesks(target.role?.permissions ?? []),
    toCanGiveDesks: canGiveDesks(role.permissions),
    othersWhoCanGiveDesks,
    personName: target.person.name,
  })
  if (!move.allowed) {
    await recordRefusal([target.personId], { actorPersonId: caller.person.id, actorCompanyId: caller.company.id, action: 'DESK_CHANGE', reason: move.says })
    return NextResponse.json(
      { error: { code: 'DESK_REFUSED', message: move.says } },
      { status: 422 }
    )
  }

  // How many other live accounts here could grant access, if this one went.
  const otherCritical = await prisma.context.count({
    where: {
      companyId: caller.company.id,
      revokedAt: null,
      id: { not: target.id },
      role: { permissions: { hasSome: ['*', 'settings.manage'] } },
    },
  })

  const decision = assessGrant({
    roleName: role.name,
    permissions: role.permissions,
    requestedDays: days === null || days === undefined || days === '' ? null : Number(days),
    reason: String(reason ?? ''),
    selfGranted: target.personId === caller.person.id,
    otherHoldersOfCritical: otherCritical,
  })

  if (!decision.allowed) {
    await recordRefusal([target.personId], { actorPersonId: caller.person.id, actorCompanyId: caller.company.id, action: 'DESK_CHANGE', reason: decision.summary })
    return NextResponse.json(
      {
        error: {
          code: 'GRANT_REFUSED',
          message: decision.summary,
          checks: decision.checks.filter(c => c.outcome === 'BLOCK'),
        },
      },
      { status: 422 }
    )
  }

  const expiresAt = decision.expiresInDays === null
    ? null
    : new Date(Date.now() + decision.expiresInDays * 86_400_000)

  await prisma.context.update({
    where: { id: target.id },
    data: {
      roleId: role.id,
      grantedById: caller.person.id,
      grantedAt: new Date(),
      expiresAt,
      grantReason: String(reason).trim(),
      // Reset on every grant. A renewal that inherits the old usage date
      // would report the access as active when nobody has touched it.
      lastUsedAt: null,
    },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'ACCESS_GRANTED',
      summary: `${caller.person.name} gave ${target.person.name} ${role.name}${target.role ? ` (was ${target.role.name})` : ''}${expiresAt ? ` until ${formatDay(expiresAt)}` : ''}`,
      reason: String(reason).trim(),
      payload: {
        contextId: target.id,
        roleId: role.id,
        sensitivity: decision.sensitivity,
        expiresAt: expiresAt?.toISOString() ?? null,
        fromRole: target.role?.name ?? null,
        notes: decision.checks.filter(c => c.outcome === 'WARN').map(c => c.reason),
      },
      reversible: true,
    },
  })

  void emit({
    type: 'access.granted',
    companyId: caller.company.id,
    subjectType: 'Context',
    subjectId: target.id,
    actorPersonId: caller.person.id,
    payload: {
      personId: target.person.id,
      roleId: role.id,
      roleName: role.name,
      sensitivity: decision.sensitivity,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  })

  // The other half of the join notification. Somebody has been waiting,
  // and an access grant they are never told about is one they find by
  // trying the page again on a hunch.
  //
  // Email as well as in the app (round two of the sign-up walk, 14): a
  // Member waiting on a desk is not sitting in the app refreshing it. One
  // notice on the normal path, so the in-app row and the email are the
  // same words, and the link opens the page the new desk lands on.
  const notice = deskChangedNotice({
    roleName: role.name,
    companyName: caller.company.name,
    expiresAt,
    landing: consoleHome({
      kind: (caller.company.kind ?? null) as CompanyKind | null,
      permissions: role.permissions,
    }).href,
  })
  void notify({
    personId: target.person.id,
    companyId: caller.company.id,
    type: 'SYSTEM',
    channel: 'EMAIL',
    title: notice.title,
    body: notice.body,
    entityId: target.id,
    data: { href: notice.href },
  })

  return NextResponse.json(
    {
      data: {
        contextId: target.id,
        person: target.person.name,
        role: role.name,
        sensitivity: decision.sensitivity,
        expiresAt: expiresAt?.toISOString().slice(0, 10) ?? null,
        notes: decision.checks.filter(c => c.outcome === 'WARN').map(c => c.reason),
        message: expiresAt
          ? `${target.person.name} can now work as ${role.name}. This ends on ${formatDay(expiresAt)} unless renewed.`
          : `${target.person.name} has read-only access with no end date.`,
      },
    },
    { status: 201 }
  )
}
