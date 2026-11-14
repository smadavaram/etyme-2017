import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import {
  stateOf,
  canSuspend,
  canReinstate,
  canRevoke,
  canDeleteOutright,
  type AccessRow,
} from '@/lib/account-lifecycle'
import { possessive } from '@/lib/requisition-approval'
import { hasSignedIn } from '@/lib/access-grant'
import { OWNER_ROLE, clause } from '@/lib/owner-rules'
import { companyPolicy, endSessions } from '@/lib/identity/read'
import { recordIdentityEvent } from '@/lib/identity/ledger'
import { recordRefusal } from '@/lib/access-log'
import { withdrawHistorySays, withdrawVerdict } from '../row-acts'
import { renameSeat } from './rename'
import { pausedReply } from './pause-words'
import { mailLeaves } from '@/lib/notify/mail-leaves'

/**
 * POST   /api/access/:contextId   { action: 'suspend' | 'reinstate' | 'revoke', reason }
 * DELETE /api/access/:contextId   — remove somebody invited who never arrived
 *
 * Taking access away, which could not be done at all.
 *
 * An API key could be revoked, a document share could be revoked, a bench
 * listing could be revoked — a person could not. Somebody left and their
 * seat stayed live until a database edit. It also made the rest of the
 * system dishonest: the access screen reported dormant grants and the
 * watcher chased them, and neither offered any way to act on it.
 *
 * Suspension and revocation are deliberately different. Suspension is for
 * somebody coming back — a leave of absence, a lapsed visa — and keeps
 * their history and their role. Revocation ends it. Using one for the
 * other either loses the thread or leaves a live-looking seat.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contextId: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Who may read what is set by a company, and you are not signed in at one. What is held about you is under Your data.' } },
      { status: 403 }
    )
  }
  const { contextId } = await params
  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')
  const reason = String(body.reason ?? '').trim()

  // Every refusal below is written to the access log, and waited for,
  // before it is sent (security review, 2026-11-12). Its subject is the
  // person whose seat was asked about, wherever the seat is; nothing about
  // them goes into the reply.
  const askedAbout = await prisma.context.findUnique({ where: { id: contextId }, select: { personId: true } })
  const refuse = async (status: number, code: string, message: string) => {
    if (askedAbout) {
      await recordRefusal([askedAbout.personId], {
        actorPersonId: caller.person.id,
        actorCompanyId: caller.company?.id,
        action: action === 'suspend' ? 'ACCESS_SUSPEND' : action === 'reinstate' ? 'ACCESS_REINSTATE' : action === 'rename' ? 'PERSON_RENAME' : 'ACCESS_REVOKE',
        reason: message,
      })
    }
    return NextResponse.json({ error: { code, message } }, { status })
  }

  if (!hasPermission(caller.permissions, 'team.manage')) {
    return refuse(403, 'FORBIDDEN', askTheDesk({
      doing: 'Changing somebody’s access here',
      needs: 'team.manage',
      kind: caller.company?.kind,
      companyName: caller.company?.name,
    }))
  }

  // Rename: the Owner, or an Admin, names the person on a seat (founder,
  // 2026-11-12). The rules and the write are in ./rename, refused in one
  // sentence each and logged before the reply.
  if (action === 'rename') {
    const all = await loadAll(caller.company.id)
    const live = all.filter((r) => !r.revokedAt)
    const target = live.find((r) => r.contextId === contextId)
    if (!target) return refuse(404, 'NOT_FOUND', 'Nobody here with that seat')
    const out = await renameSeat({
      contextId,
      personId: target.personId,
      typed: body.name,
      company: { id: caller.company.id, name: caller.company.name, kind: caller.company.kind },
      actor: { personId: caller.person.id, name: caller.person.name },
      actorIsOwner: live.some((r) => r.personId === caller.person.id && r.isOwner === true && !r.suspendedAt),
      targetIsOwner: target.isOwner === true,
      liveSeats: live.length,
    })
    if (out.kind === 'REFUSED') return refuse(409, 'REFUSED', out.message)
    if (out.kind === 'WRONG_NAME') {
      await recordRefusal([target.personId], { actorPersonId: caller.person.id, actorCompanyId: caller.company.id, action: 'PERSON_RENAME', reason: out.message })
      return NextResponse.json({ error: { code: 'VALIDATION', message: out.message, field: 'name' } }, { status: 422 })
    }
    return NextResponse.json({ data: { message: `Renamed. This seat reads ${out.name} from now on.`, name: out.name } })
  }

  if (!['suspend', 'reinstate', 'revoke'].includes(action)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: "action is 'suspend', 'reinstate', 'revoke' or 'rename'", field: 'action' } },
      { status: 422 }
    )
  }

  // Everybody's seat at this company, because the lockout check needs to
  // know who else could let people in.
  const all = await loadAll(caller.company.id)
  const target = all.find((r) => r.contextId === contextId)
  if (!target) return refuse(404, 'NOT_FOUND', 'Nobody here with that seat')

  const person = await prisma.context.findUnique({
    where: { id: contextId },
    select: { person: { select: { id: true, name: true, primaryEmail: true } }, role: { select: { name: true } } },
  })
  if (!person) return refuse(404, 'NOT_FOUND', 'Nobody here with that seat')

  // Ending or pausing somebody's access is not a thing to do without
  // saying why. The reviewer in six months is rarely the person who did it.
  if (action !== 'reinstate' && !reason) {
    return NextResponse.json(
      {
        error: {
          code: 'REASON_REQUIRED',
          message: action === 'suspend'
            ? 'Say why they are being paused. They can be told, and somebody will ask later.'
            : 'Say why their access is ending. It goes on the record with your name.',
          field: 'reason',
        },
      },
      { status: 422 }
    )
  }

  // Who is acting, by the seat they hold here: an Admin never pauses or
  // ends an Owner; an Owner may pause or end an Admin.
  const actor = { isOwner: all.some((r) => r.personId === caller.person.id && r.isOwner && !r.revokedAt && !r.suspendedAt) }
  const verdict =
    action === 'suspend' ? canSuspend(target, all, actor)
      : action === 'reinstate' ? canReinstate(target, actor)
        : canRevoke(target, all, actor)

  if (!verdict.allowed) return refuse(409, 'REFUSED', verdict.reason)

  const now = new Date()
  const actorId = realPersonId(caller)
  const companyId = caller.company.id
  const companyName = caller.company.name

  // The company's sign-in policy, read before anything changes, so the
  // identity rows below name it and a failed read changes nothing.
  const policy = action === 'reinstate' ? null : (await companyPolicy(companyId)).effective

  await prisma.$transaction(async (tx) => {
    await tx.context.update({
      where: { id: contextId },
      data:
        action === 'suspend'
          ? { suspendedAt: now, suspendedById: actorId, suspendReason: reason }
          : action === 'reinstate'
            ? { suspendedAt: null, suspendedById: null, suspendReason: null }
            : {
                revokedAt: now,
                revokedById: actorId,
                revokeReason: reason,
                // A revoked seat that is also suspended reads as two states
                // at once. Ending it clears the pause.
                suspendedAt: null,
              },
    })
    // Every revoke is an identity event, committed with the seat's ending
    // (founder, 2026-11-11: "membership revoked").
    if (action === 'revoke') {
      await recordIdentityEvent({
        event: 'MEMBERSHIP_REVOKED',
        companyId,
        actorPersonId: actorId,
        subject: { personId: person.person.id },
        policy: policy!,
        surface: 'WEB',
        says: `${caller.person.name} ended ${possessive(person.person.name)} seat at ${companyName}${person.role ? ` (${person.role.name})` : ''}: ${reason}`,
      }, tx)
    }
  })

  // ── Ending a seat that is still waiting cancels its unused link ──────
  //
  // Somebody invited and never signed in holds one thing that still works:
  // the set-password link in the invitation. Ending the seat cancels it
  // too, unless the person still holds a live seat somewhere else, whose
  // own invitation that link may be (an invitation's link replaces any
  // older one, so there is only ever one). The link then says it expired.
  if (action === 'revoke' && stateOf(target) === 'INVITED') {
    const elsewhere = await prisma.context.count({
      where: { personId: person.person.id, revokedAt: null, id: { not: contextId } },
    })
    if (elsewhere === 0) {
      await prisma.emailToken.updateMany({
        where: { personId: person.person.id, purpose: 'RESET', usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      })
    }
  }

  // ── The last live seat anywhere ends every live session ────────────
  //
  // A seat already stops working on the next request, because every
  // request rereads it. But a person whose last live seat on Etyme was
  // just paused or ended has nothing left a session could open, so their
  // sessions end too: the next request from any of them signs in again.
  // A seat elsewhere, including the person's own seat as a worker, keeps
  // the sessions standing, because that seat is still theirs.
  let sessionsEnded = false
  if (action !== 'reinstate') {
    const live = await prisma.context.count({
      where: {
        personId: person.person.id, revokedAt: null, suspendedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    })
    if (live === 0) {
      await endSessions({
        personId: person.person.id,
        actorPersonId: actorId,
        companyId,
        policy: policy!,
        surface: 'WEB',
        says: `${possessive(person.person.name)} last seat was ${action === 'suspend' ? 'paused' : 'ended'} at ${caller.company.name}, so every session they held is ended.`,
      })
      sessionsEnded = true
    }
  }

  const said =
    action === 'suspend' ? `paused ${possessive(person.person.name)} access`
      : action === 'reinstate' ? `put ${person.person.name} back`
        : `ended ${possessive(person.person.name)} access`

  // The action below is spelled out, never assembled. It used to be built by
  // interpolation from the verb, which spells suspend as ACCESS_SUSPENDD, and
  // wrote that to production for as long as this route has existed. Nothing
  // caught it: the check that keeps every logged action named reads literal
  // names out of the `action` field, a template yields none, and "no literal"
  // was indistinguishable from "writes nothing" — so the whole route was
  // skipped. A name built at runtime is a name neither a reader nor a scanner
  // can search for. The rows already carrying the misspelling are corrected by
  // scripts/rename-suspend-action.mjs, which explains why.
  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action:
        action === 'suspend' ? 'ACCESS_SUSPENDED'
        : action === 'reinstate' ? 'ACCESS_REINSTATED'
        : 'ACCESS_REVOKED',
      summary: `${caller.person.name} ${said}${person.role ? ` (${person.role.name})` : ''}`,
      reason: reason || 'Suspension lifted',
      payload: { contextId, personId: person.person.id, action },
      // A pause can be lifted. An ending is a new seat, not an undo.
      reversible: action !== 'revoke',
    },
  })

  // A pause is not an ending, and this tells a subscriber that it is: there
  // is no `access.suspended` in the event registry (src/lib/events.ts, which
  // is etyme-conversation's), so a suspension goes out as a revocation and a
  // webhook receiver acting on it would close somebody's account rather than
  // hold it. Reported rather than fixed here, because the registry is not
  // this domain's to add to.
  void emit({
    type: action === 'reinstate' ? 'access.granted' : 'access.revoked',
    companyId: caller.company.id,
    subjectType: 'Context',
    subjectId: contextId,
    actorPersonId: actorId,
    payload: { action, personId: person.person.id, reason: reason || null },
  })

  // Told, rather than left to discover it by being locked out. A person
  // suspended without explanation assumes it is a fault and files a ticket.
  if (action !== 'revoke') {
    void notify({
      personId: person.person.id,
      companyId: caller.company.id,
      type: 'SYSTEM',
      title: action === 'suspend'
        ? `Your access at ${caller.company.name} is paused`
        : `Your access at ${caller.company.name} is back`,
      body: action === 'suspend'
        ? `${caller.person.name} paused it: ${clause(reason)}. Nothing you have done is lost, and lifting it puts you back exactly where you were.`
        : `${caller.person.name} lifted the pause. You are back with the role you had.`,
      entityId: contextId,
      channel: 'EMAIL',
    })
  }

  return NextResponse.json({
    data: {
      contextId,
      state: action === 'suspend' ? 'SUSPENDED' : action === 'revoke' ? 'REVOKED' : 'ACTIVE',
      person: person.person.name,
      consequences: verdict.consequences,
      sessionsEnded,
      message:
        action === 'suspend'
          ? pausedReply(person.person.name, mailLeaves())
          : action === 'reinstate'
            ? `${person.person.name} is back, with the role they had.`
            : `${person.person.name} cannot sign in here again. Everything they did stays on the record with their name on it.`,
    },
  })
}

/**
 * DELETE — withdraw the invitation of somebody invited who never arrived.
 *
 * Almost never allowed. A person who approved a timesheet or was placed on
 * a contract is part of how those are explained, and deleting them leaves
 * an approval signed by nobody; the refusal then says to end their access,
 * and the page draws End access beside it.
 *
 * The Owner rules hold here as on Pause and End (founder, 2026-11-11 and
 * 2026-11-12): only an Owner withdraws an Owner's invitation, an Admin
 * never, and never so that no Owner is left. Nobody withdraws their own
 * seat. Every refusal is written before it is sent.
 *
 * Only this company's seat is removed. The person row goes too only where
 * this invitation made it and nothing else hangs off it (no seat anywhere,
 * no profile, bench listing, papers, sign-in, password or work), and their
 * links go with it (`EmailToken.personId` cascades). Anybody who was on
 * Etyme before stays, with everything other firms hold about them; their
 * unused link is cancelled where they hold no other live seat.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ contextId: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { contextId } = await params

  // Whose invitation this is, read before any refusal so the refusal's row
  // names them. Only a seat at the caller's own company is ever found.
  const ctx = caller.company
    ? await prisma.context.findFirst({
        where: { id: contextId, companyId: caller.company.id },
        select: {
          id: true, personId: true, lastUsedAt: true, invitedAt: true, revokedAt: true,
          person: {
            select: {
              name: true, primaryEmail: true,
              credentials: { where: { lastUsedAt: { not: null } }, select: { id: true }, take: 1 },
            },
          },
        },
      })
    : null

  const refuse = async (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => {
    if (ctx) {
      await recordRefusal([ctx.personId], {
        actorPersonId: caller.person.id,
        actorCompanyId: caller.company?.id,
        action: 'INVITATION_WITHDRAW',
        reason: message,
      })
    }
    return NextResponse.json({ error: { code, message, ...extra } }, { status })
  }

  if (!caller.company || !hasPermission(caller.permissions, 'team.manage')) {
    return refuse(403, 'FORBIDDEN', askTheDesk({
      doing: 'Withdrawing somebody’s invitation',
      needs: 'team.manage',
      kind: caller.company?.kind,
      companyName: caller.company?.name,
    }))
  }
  if (!ctx) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Nobody here with that seat' } },
      { status: 404 }
    )
  }

  // The Owner rule and the self rule, with the reader as actor: the same
  // verdict the register drew the press from.
  const all = await loadAll(caller.company.id)
  const target = all.find((r) => r.contextId === contextId)!
  const actor = {
    isOwner: all.some((r) => r.personId === caller.person.id && r.isOwner && !r.revokedAt && !r.suspendedAt),
    personId: caller.person.id,
  }
  const may = withdrawVerdict(target, all, actor)
  if (!may.allowed) {
    // A person who has signed in is ended, not withdrawn; say so and keep
    // End. Never for an Owner: End refuses an Owner here too.
    const endInstead = target.hasSignedIn && !target.isOwner
    return refuse(409, endInstead ? 'HAS_HISTORY' : 'REFUSED', may.reason,
      endInstead ? { endInstead: true } : {})
  }

  // Only this company's own records are counted and said (walk, 2026-11-14:
  // a withdrawal was refused with another company's 13 timesheets named).
  // Work elsewhere is not this firm's to learn of, and it does not stop
  // this seat going; the person row below still stays while anybody holds it.
  const here = caller.company.id
  const [approvals, submissions, contracts, timesheets, otherCompanies] = await Promise.all([
    prisma.requirementApproval.count({ where: { approverId: ctx.personId, requirement: { companyId: here } } }),
    prisma.submission.count({ where: { personId: ctx.personId, OR: [{ fromCompanyId: here }, { toCompanyId: here }] } }),
    prisma.sellContract.count({ where: { personId: ctx.personId, OR: [{ companyId: here }, { clientCompanyId: here }] } }),
    prisma.timesheet.count({
      where: {
        personId: ctx.personId,
        sellContract: { OR: [{ companyId: here }, { clientCompanyId: here }, { endClientCompanyId: here }] },
      },
    }),
    prisma.context.count({ where: { personId: ctx.personId, companyId: { not: here } } }),
  ])

  // A seat at another company does not stop this seat going: the person
  // is not ours to delete, but this seat is. So the history is judged with
  // no other company counted, and the person row is removed below only
  // where no seat is left.
  const verdict = canDeleteOutright({
    // An invitation nobody accepted has never been used.
    // A desk change clears the seat's use date, so a sign-in anywhere
    // on Etyme counts too.
    hasSignedIn: hasSignedIn({
      invitedAt: ctx.invitedAt, lastUsedAt: ctx.lastUsedAt,
      everSignedIn: ctx.person.credentials.length > 0,
    }),
    approvals,
    submissions,
    contracts,
    timesheets,
    otherCompanies: 0,
  })

  if (!verdict.allowed) {
    // The sentence already says to end their access; the page keeps End
    // on the row for exactly this answer.
    return refuse(409, 'HAS_HISTORY', withdrawHistorySays({ approvals, submissions, contracts, timesheets }) ?? verdict.reason, { endInstead: true })
  }

  // Only this company's seat goes. The person row goes with it only where
  // this invitation made them and nothing else hangs off them: no seat
  // anywhere, no profile or bench listing, no papers, no sign-in, no
  // password, no work (security review, 2026-11-12). A person who was on
  // Etyme before, a consultant whose papers other firms hold, stays.
  const madeBy = await prisma.automationLog.findFirst({
    where: { companyId: caller.company.id, action: 'PERSON_INVITED', payload: { path: ['contextId'], equals: contextId } },
    orderBy: { at: 'asc' },
    select: { payload: true },
  })
  const createdHere = (madeBy?.payload as { createdPerson?: unknown } | null)?.createdPerson === true
  const now = new Date()
  const personGone = await prisma.$transaction(async (tx) => {
    await tx.context.delete({ where: { id: contextId } })
    if (!createdHere) return false
    // Their unused links go with the person row (cascade).
    const gone = await tx.person.deleteMany({
      where: {
        id: ctx.personId,
        passwordHash: null,
        contexts: { none: {} },
        consultant: { is: null },
        verifications: { none: {} },
        credentials: { none: {} },
        submissions: { none: {} },
        timesheets: { none: {} },
        sellContracts: { none: {} },
      },
    })
    return gone.count > 0
  })
  // Where the person stays and holds no other live seat, the link this
  // invitation sent is cancelled, so it no longer opens anything.
  if (!personGone) {
    const elsewhere = await prisma.context.count({ where: { personId: ctx.personId, revokedAt: null } })
    if (elsewhere === 0) {
      await prisma.emailToken.updateMany({
        where: { personId: ctx.personId, purpose: 'RESET', usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      })
    }
  }

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'INVITATION_WITHDRAWN',
      summary: `${caller.person.name} withdrew the invitation to ${ctx.person.primaryEmail}`,
      reason: 'They never signed in and nothing was attached to them',
      payload: { email: ctx.person.primaryEmail, otherCompanies, personRemoved: personGone },
      reversible: false,
    },
  })

  return NextResponse.json({
    data: {
      removed: ctx.person.primaryEmail,
      // Named by the address only: the record's name of somebody already on
      // Etyme is not the inviter's to learn.
      message: `The invitation to ${ctx.person.primaryEmail} is withdrawn, and its link no longer opens a seat here. If they were meant to be here, use the Invite form above; it makes a new invitation.`,
    },
  })
}

async function loadAll(companyId: string): Promise<AccessRow[]> {
  const rows = await prisma.context.findMany({
    where: { companyId },
    select: {
      id: true, personId: true, roleId: true, lastUsedAt: true, invitedAt: true,
      suspendedAt: true, revokedAt: true,
      role: { select: { permissions: true, name: true } },
      person: { select: { credentials: { where: { lastUsedAt: { not: null } }, select: { id: true }, take: 1 } } },
    },
  })

  return rows.map((r) => ({
    contextId: r.id,
    personId: r.personId,
    // Somebody invited who has never done anything has never arrived.
    hasSignedIn: hasSignedIn({
      invitedAt: r.invitedAt, lastUsedAt: r.lastUsedAt,
      everSignedIn: r.person.credentials.length > 0,
    }),
    roleId: r.roleId,
    rolePermissions: r.role?.permissions ?? [],
    suspendedAt: r.suspendedAt,
    revokedAt: r.revokedAt,
    // Only an Owner acts on an Owner (founder, 2026-11-11 and 11-12).
    isOwner: r.role?.name === OWNER_ROLE,
  }))
}
