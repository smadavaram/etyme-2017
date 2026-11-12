import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import {
  hourlyCapSays, INVITES_PER_HOUR, MAX_ADDRESSES_AT_ONCE, OWNER_DESK, parseAddresses, tooManyAtOnceSays,
} from '@/lib/access-grant'
import { checkInviteRole, invitationsThisHour, inviteOne, modeOf, underInviteLock, type Inviter } from './one'

/**
 * POST /api/access/invite   { email, name?, roleId? }
 * POST /api/access/invite   { emails: "a@x.com, b@y.com" | string[], roleId? }
 *
 * The second shape invites several at once, at most twenty, one role for
 * all, and answers one line per address (`inviteOne` in ./one).
 *
 * Making somebody a seat before they have signed in.
 *
 * Anybody on the verified company domain joins by signing in and needs no
 * invitation — that is the whole join-beats-create design, and offering an
 * invitation alongside it would create a second path to the same seat.
 *
 * So this exists for the case the domain rule genuinely cannot cover: a
 * contractor on their own address, somebody at a subsidiary with a
 * different domain, an accountant who needs to see the invoices. An
 * invitation is a hole in the domain rule, punched deliberately, and it
 * says so rather than pretending otherwise.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An invitation comes from a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'team.manage')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          // Who can, not which permission. An invitation lets in a person
          // the domain rule would keep out, so it is the same decision as
          // granting access, and the same people make it.
          message:
            `Only the account owner or an admin at ${caller.company.name} can invite somebody. ` +
            'Ask one of them, or tell the person to sign in with their company email if they have one.',
        },
      },
      { status: 403 }
    )
  }

  const inviter = realPersonId(caller)
  if (!inviter) {
    return NextResponse.json(
      { error: { code: 'PERSON_REQUIRED', message: 'An integration cannot invite people. A person has to decide this.' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))

  // Whether the inviter holds Owner here: only an Owner invites an Owner.
  // Asked only where a role was chosen, the one place it decides anything.
  const mine = body.roleId
    ? await prisma.context.findUnique({ where: { id: caller.context.id }, select: { role: { select: { name: true } } } })
    : null
  const who: Inviter = {
    personId: inviter,
    name: caller.person.name,
    permissions: caller.permissions,
    isOwner: mine?.role?.name === OWNER_DESK,
    company: { id: caller.company.id, name: caller.company.name },
  }

  // A role is optional. Without one they arrive able to see nothing, which
  // is the same as somebody joining on the domain — and is the safe
  // default, because an invitation is already an exception.
  const roleCheck = await checkInviteRole(who, body.roleId)
  if (!roleCheck.ok) {
    return NextResponse.json(
      { error: { code: roleCheck.code, message: roleCheck.message, field: roleCheck.field } },
      { status: roleCheck.status }
    )
  }
  const role = roleCheck.role

  // The company's sign-in mode decides what the email and the copied
  // invitation say (a directory-only company is never sent a password).
  const mode = await modeOf(caller.company.id)

  // ── Several at once (founder, 2026-11-12) ──
  // One role for all of them, each address its own seat and its own
  // checks, one result per address; a refusal on one never stops the rest.
  if (body.emails !== undefined) {
    const { addresses, notAddresses } = parseAddresses(body.emails)
    if (addresses.length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: notAddresses.length ? `${notAddresses[0]} is not a whole address. Type the full address, like name@example.com.` : 'Type the addresses, one per line or separated by commas.', field: 'emails' } },
        { status: 422 }
      )
    }
    if (addresses.length > MAX_ADDRESSES_AT_ONCE) {
      return NextResponse.json(
        { error: { code: 'TOO_MANY', message: tooManyAtOnceSays(addresses.length), field: 'emails' } },
        { status: 422 }
      )
    }
    // A cap per company per hour, counted from the invitation emails sent,
    // read and spent under one lock per company (`underInviteLock`).
    const outcome = await underInviteLock(caller.company.id, async () => {
      const window = await invitationsThisHour(who.company.id)
      if (window.count + addresses.length > INVITES_PER_HOUR) return { kind: 'CAPPED' as const, again: capAgain(window.oldest) }
      const results = []
      for (const address of addresses) {
        // One at a time, awaited, so each refusal's row is written before the next.
        const r = await inviteOne(who, { email: address, reason: body.reason }, role, mode)
        results.push(r.ok
          ? { email: r.email, ok: true, contextId: r.contextId, says: r.says, mail: r.mail, copyText: r.copyText }
          : { email: r.email, ok: false, says: r.message, code: r.code })
      }
      return { kind: 'DONE' as const, results }
    })
    if (outcome.kind === 'CAPPED') return capRefusal(outcome.again)
    const results = outcome.results
    for (const bad of notAddresses) results.push({ email: bad, ok: false, says: 'Not a whole address. Type the full address, like name@example.com.', code: 'VALIDATION' })
    const invited = results.filter((r) => r.ok).length
    return NextResponse.json(
      { data: { results, says: `${invited} of ${results.length} invited.` } },
      { status: 200 }
    )
  }

  // One address is held to the same hourly cap as several.
  const single = await underInviteLock(caller.company.id, async () => {
    const window = await invitationsThisHour(who.company.id)
    if (window.count + 1 > INVITES_PER_HOUR) return { kind: 'CAPPED' as const, again: capAgain(window.oldest) }
    return { kind: 'DONE' as const, r: await inviteOne(who, { email: String(body.email ?? ''), name: body.name, reason: body.reason }, role, mode) }
  })
  if (single.kind === 'CAPPED') return capRefusal(single.again)
  const r = single.r
  if (!r.ok) {
    return NextResponse.json(
      { error: { code: r.code, message: r.message, field: r.field } },
      { status: r.status }
    )
  }

  return NextResponse.json(
    {
      data: {
        // What the inviter is told, from what happened to the email
        // (`inviteSays` in lib/access-grant): never "emailed" before it left.
        says: r.says,
        contextId: r.contextId,
        email: r.email,
        role: r.role,
        state: 'INVITED',
        note: r.note,
        // Whether the email left and when, or why not (`mailLine` draws it).
        mail: r.mail,
        // The ready message for Copy invitation. It holds no link that takes the seat.
        copyText: r.copyText,
        message: r.role
          ? `${r.email} can sign in as ${r.role}. Until they do, they show as invited rather than active.`
          : `${r.email} can sign in. They will see nothing until somebody gives them a role.`,
      },
    },
    { status: 201 }
  )
}

/** When the hour's cap lets the next invitation go: an hour after the oldest one counted. */
function capAgain(oldest: Date | null): Date {
  return new Date((oldest ?? new Date()).getTime() + 3_600_000)
}

/**
 * The hourly refusal. The moment goes as an instant; the screen says it in
 * the reader's zone (`capRefusalSays`). The sentence beside it is for any
 * other caller.
 */
function capRefusal(again: Date) {
  return NextResponse.json(
    { error: { code: 'TOO_MANY_THIS_HOUR', message: hourlyCapSays(again, null), cap: 'HOURLY', again: again.toISOString() } },
    { status: 429 }
  )
}
