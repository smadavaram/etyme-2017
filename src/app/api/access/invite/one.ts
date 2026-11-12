/**
 * One invitation, and the email that carries it.
 *
 * Three doors call this file (founder, 2026-11-12): the invitation form,
 * for one address or for several pasted at once, and "Send the invitation
 * again" on a waiting row. Each checks the same things, writes the seat the
 * same way, and sends the same email through the one awaited send
 * (`sendEmailNow` in lib/notify/send-now), so the inviter is never told an
 * email went before it did, and the reason it did not is kept on the row
 * the register reads.
 *
 * The one-time set-password link lives in the mailbox and nowhere else
 * (lib/notify/account-mail): never in a reply, a log, a copied message.
 */
import { prisma } from '@/lib/db'
import { hasPermission, inWords } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { checkInvite } from '@/lib/account-lifecycle'
import { doorOpen, issueSetPassword } from '@/lib/password-door'
import { baseUrl } from '@/lib/signed-link'
import { appUrl } from '@/lib/app-url'
import { recordedBody } from '@/lib/notify/account-mail'
import { sendEmailNow } from '@/lib/notify/send-now'
import { failureFromNote, mailFailureSays } from '@/lib/notify/mail-failure'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { checkDoor, companyPolicy } from '@/lib/identity/read'
import { recordIdentityEvent } from '@/lib/identity/ledger'
import type { EffectiveMode } from '@/lib/identity/policy'
import {
  alreadyInvitedSays, copyInvitation, hasSignedIn, invitedAs, inviteLetter, inviteSays, INVITE_LINK_HOURS, OWNER_DESK,
  type InviteDoor, type InviteMail, type InviteMailState,
} from '@/lib/access-grant'

/** Whether Microsoft or Google sign-in is set up here, read the way lib/auth reads it. */
export function workAccountOn(): boolean {
  return Boolean(
    (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) ||
    (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  )
}

/**
 * The subject every invitation email is written with, and the words the
 * register reads its rows back by: a seat's other emails (a role given
 * before they arrive) carry the same seat and are not invitations.
 */
export const INVITE_TITLE_MARK = ' invited you to '
export const inviteTitle = (inviterName: string, companyName: string) => `${inviterName}${INVITE_TITLE_MARK}${companyName}`

/** Which way in the email offers, from the company's mode and the person. */
export function doorFor(a: { mode: EffectiveMode; hasPassword: boolean; login: string }): InviteDoor {
  // A directory-only company has shut the password door: no set-password
  // link is minted for it at all (second reader, fault 6).
  if (a.mode === 'SSO_ONLY') return 'DIRECTORY'
  if (doorOpen() && a.login && !a.hasPassword) return 'PASSWORD'
  return workAccountOn() ? 'WORK_ACCOUNT' : 'NONE'
}

/** The sentence a company's person reads for a row's email state. Never the provider's words. */
export function whyNotSent(state: string, note: string | null): string | null {
  if (state === 'SENT' || state === 'PENDING') return null
  if (state === 'NOT_CONFIGURED') return mailFailureSays({ kind: 'NOT_SET_UP' })
  if (state === 'DEMO_SKIPPED') return mailFailureSays({ kind: 'DEMO' })
  return mailFailureSays(failureFromNote(note))
}

export interface SentInvitation {
  door: InviteDoor
  mail: InviteMail & { state: InviteMailState }
}

/**
 * Email one seat's invitation, now, and keep how it went on the record.
 * Mints a new set-password link where the door is a password (which kills
 * any older one for the person), sends it only to the address on the
 * person's record, and writes one EMAIL notice on the seat.
 */
export async function sendInvitationMail(a: {
  contextId: string
  person: { id: string; primaryEmail: string; passwordHash: string | null }
  inviterName: string
  company: { id: string; name: string }
  roleName: string | null
  mode: EffectiveMode
  now?: Date
}): Promise<SentInvitation> {
  const now = a.now ?? new Date()
  const email = a.person.primaryEmail
  const login = baseUrl() ? `${baseUrl()}/login` : ''
  const door = doorFor({ mode: a.mode, hasPassword: Boolean(a.person.passwordHash), login })
  const title = inviteTitle(a.inviterName, a.company.name)

  // One door mints the link, and it kills any older one for this person.
  const setPasswordUrl = door === 'PASSWORD' ? await issueSetPassword(a.person.id, INVITE_LINK_HOURS, now) : null
  const letter = inviteLetter({
    door, companyName: a.company.name, roleName: a.roleName,
    setPasswordUrl, loginUrl: login, linkHours: INVITE_LINK_HOURS, workAccount: workAccountOn(),
  })

  const sent = await sendEmailNow({
    to: email,
    subject: title,
    body: letter.link ? [...letter.lines, '', letter.link].join('\n') : letter.lines.join('\n'),
    companyId: a.company.id,
    personId: a.person.id,
  })
  const state: InviteMailState = sent.state
  await prisma.notification.create({
    data: {
      personId: a.person.id, companyId: a.company.id, type: 'SYSTEM', channel: 'EMAIL',
      // Where no email can be sent (or the address is a demo one), the link
      // is kept on the notice so staff can pass it on; sent or failed, it
      // lives in the mailbox only (lib/notify/account-mail).
      title, body: recordedBody(letter.lines, letter.link, state === 'DEMO_SKIPPED' ? 'NOT_CONFIGURED' : state),
      entityId: a.contextId,
      deliveryState: state, deliveryNote: sent.note, deliveredAt: sent.at,
    },
  })
  return {
    door,
    mail: { state, at: sent.at, why: sent.left ? null : mailFailureSays(sent.failure) },
  }
}

/** The newest invitation email per seat, in one read. */
export async function latestInviteMails(contextIds: string[]): Promise<Map<string, InviteMail>> {
  const out = new Map<string, InviteMail>()
  if (contextIds.length === 0) return out
  const rows = await prisma.notification.findMany({
    where: { entityId: { in: contextIds }, channel: 'EMAIL', title: { contains: INVITE_TITLE_MARK } },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, deliveryState: true, deliveryNote: true, deliveredAt: true },
  })
  for (const r of rows) {
    if (!r.entityId || out.has(r.entityId)) continue
    out.set(r.entityId, {
      state: r.deliveryState as InviteMail['state'],
      at: r.deliveryState === 'SENT' ? r.deliveredAt : null,
      why: whyNotSent(r.deliveryState, r.deliveryNote),
    })
  }
  return out
}

/** How many invitation emails a seat was sent since a moment, and the oldest of them. */
export async function invitationEmailsSince(contextId: string, since: Date): Promise<{ count: number; oldest: Date | null }> {
  const rows = await prisma.notification.findMany({
    where: { entityId: contextId, channel: 'EMAIL', title: { contains: INVITE_TITLE_MARK }, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })
  return { count: rows.length, oldest: rows[0]?.createdAt ?? null }
}

/** The ready message for Copy invitation, from the company's mode. No token, ever. */
export function copyTextFor(a: { inviterName: string; companyName: string; roleName: string | null; email: string; mode: EffectiveMode }): string {
  return copyInvitation({ ...a, appUrl: appUrl(), mailLeaves: mailLeaves() })
}

// ── One invitation ─────────────────────────────────────────────────────

export interface Inviter {
  personId: string
  name: string
  permissions: readonly string[]
  /** Whether the inviter holds Owner here: only an Owner invites an Owner. */
  isOwner: boolean
  company: { id: string; name: string }
}

export type InviteRole = { id: string; name: string; permissions: string[] } | null

export type RoleVerdict =
  | { ok: true; role: InviteRole }
  | { ok: false; status: number; code: string; message: string; field: 'roleId' }

/** The role an invitation offers, checked: at this company, not beyond the inviter, Owner only by an Owner. */
export async function checkInviteRole(inviter: Inviter, roleId: unknown): Promise<RoleVerdict> {
  if (!roleId) return { ok: true, role: null }
  const role = await prisma.role.findFirst({
    where: { id: String(roleId), companyId: inviter.company.id },
    select: { id: true, name: true, permissions: true },
  })
  if (!role) return { ok: false, status: 422, code: 'NOT_FOUND', message: 'No such role here.', field: 'roleId' }
  if (role.name === OWNER_DESK && !inviter.isOwner) {
    return { ok: false, status: 422, code: 'BEYOND_YOU', message: 'Only an Owner can invite somebody as an Owner. Pick another role, or ask an Owner.', field: 'roleId' }
  }
  // Nobody hands out more than they hold, on invitation any more than on
  // a key or a grant.
  const beyond = role.permissions.filter((p) => !hasPermission(inviter.permissions, p as any))
  if (beyond.length > 0) {
    return {
      ok: false, status: 422, code: 'BEYOND_YOU', field: 'roleId',
      // What they would be handing over, said rather than keyed.
      message:
        `Somebody on ${role.name} can ${inWords(beyond)} — and you cannot, so you ` +
        `cannot hand it out. Pick a role inside your own, or ask the account owner ` +
        `to seat them.`,
    }
  }
  return { ok: true, role }
}

export type InviteOne =
  | {
      ok: true
      email: string
      contextId: string
      role: string | null
      mail: InviteMail & { state: InviteMailState }
      says: string
      copyText: string
      note: string
    }
  | { ok: false; email: string; status: number; code: string; message: string; field?: string }

/**
 * Invite one address with a role already checked. Every check the address
 * needs is here: a whole address, not already seated here, the company's
 * sign-in policy (whose refusal row is written and waited for before it is
 * returned). A refusal never says whether the address has an account
 * anywhere else: only "already has a seat here", for this company.
 */
export async function inviteOne(inviter: Inviter, input: { email: string; name?: string; reason?: string }, role: InviteRole, mode: EffectiveMode): Promise<InviteOne> {
  const email = String(input.email ?? '').trim().toLowerCase()
  const companyId = inviter.company.id

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { domain: true, name: true } })
  const existing = await prisma.person.findUnique({
    where: { primaryEmail: email },
    select: {
      id: true, name: true, passwordHash: true,
      contexts: {
        where: { companyId, revokedAt: null },
        select: { id: true, invitedAt: true, lastUsedAt: true },
      },
      credentials: { where: { lastUsedAt: { not: null } }, select: { id: true }, take: 1 },
    },
  })

  // Already waiting on an invitation here: say where to press, rather than
  // the bare refusal (fault 8). Only this company's own seats are named.
  const here = existing?.contexts ?? []
  const waiting = here.find((c) => !hasSignedIn({ invitedAt: c.invitedAt ?? null, lastUsedAt: c.lastUsedAt ?? null, everSignedIn: (existing?.credentials?.length ?? 0) > 0 }))
  if (waiting) {
    return { ok: false, email, status: 422, code: 'ALREADY_INVITED', message: alreadyInvitedSays(email), field: 'email' }
  }
  const check = checkInvite(email, company?.domain ?? null, here.length > 0)
  if (!check.ok) return { ok: false, email, status: 422, code: 'CANNOT_INVITE', message: check.reason, field: 'email' }

  // ── The company's sign-in policy, asked before anybody is seated ──
  //
  // A directory-only company seats its people through its own directory,
  // so an address off its own domain is never invited into it (founder,
  // 2026-11-11). A refusal's row is written, and waited for, inside it.
  const policyDoor = await checkDoor({
    door: 'INVITE', email, targetCompanyId: companyId,
    actorPersonId: inviter.personId, subjectPersonId: existing?.id ?? null, surface: 'WEB',
  })
  if (!policyDoor.allowed) {
    return { ok: false, email, status: 403, code: 'DIRECTORY_ONLY', message: policyDoor.says, field: 'email' }
  }

  const now = new Date()
  // The person may already exist — a consultant, or somebody at another
  // company. Inviting them here adds a seat rather than a second account.
  const person = existing
    ? { id: existing.id, name: existing.name, passwordHash: existing.passwordHash }
    : {
        ...(await prisma.person.create({
          data: { primaryEmail: email, name: String(input.name ?? '').trim() || email.split('@')[0] },
          select: { id: true, name: true },
        })),
        passwordHash: null,
      }

  // The seat and its INVITE_SENT row commit together, so a seat never
  // exists without the identity event that made it.
  const context = await prisma.$transaction(async (tx) => {
    const seat = await tx.context.create({
      data: {
        personId: person.id,
        companyId,
        type: 'EMPLOYEE',
        roleId: role?.id ?? null,
        grantedById: inviter.personId,
        invitedAt: now,
        invitedById: inviter.personId,
        // How the seat was made. The limit on a public address at a hybrid
        // company is read from the address and the policy, not from this.
        source: 'INVITE',
        grantReason: input.reason ? String(input.reason).trim() : `Invited by ${inviter.name}`,
      },
      select: { id: true },
    })
    await recordIdentityEvent({
      event: 'INVITE_SENT',
      companyId,
      actorPersonId: inviter.personId,
      subject: { personId: person.id },
      policy: policyDoor.policy,
      surface: 'WEB',
      says: `${inviter.name} invited ${email}${role ? ` as ${role.name}` : ' with no role yet'}.`,
    }, tx)
    return seat
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'PERSON_INVITED',
      summary: `${inviter.name} invited ${email}${role ? ` as ${role.name}` : ' with no role yet'}`,
      // The reason this is worth logging: it is an exception to the rule
      // everything else depends on.
      reason: check.reason,
      payload: { contextId: context.id, email, roleId: role?.id ?? null, outsider: check.outsider, act: 'INVITED' },
      reversible: true,
    },
  })

  void emit({
    type: 'company.member_joined',
    companyId,
    subjectType: 'Person',
    subjectId: person.id,
    actorPersonId: inviter.personId,
    payload: { email, invited: true, roleName: role?.name ?? null, outsider: check.outsider },
  })

  // ── The email: always a way in, never only an instruction, and awaited ──
  const sent = await sendInvitationMail({
    contextId: context.id,
    person: { id: person.id, primaryEmail: email, passwordHash: person.passwordHash },
    inviterName: inviter.name,
    company: { id: companyId, name: company?.name ?? inviter.company.name },
    roleName: role?.name ?? null,
    mode,
  })
  // The reply and its sentence are the same for an address Etyme has never
  // seen and one it knows: no door, no record's name, nothing that says
  // whether the address already holds a password (security review,
  // 2026-11-12). The real door and name are used inside the email only.
  return {
    ok: true,
    email,
    contextId: context.id,
    role: role?.name ?? null,
    mail: sent.mail,
    says: inviteSays({ personName: invitedAs(input.name, email), email, roleName: role?.name ?? null, mail: sent.mail.state, reason: sent.mail.why }),
    copyText: copyTextFor({ inviterName: inviter.name, companyName: company?.name ?? inviter.company.name, roleName: role?.name ?? null, email, mode }),
    note: check.reason,
  }
}

/** The company's sign-in mode, read by the one policy function. */
export async function modeOf(companyId: string): Promise<EffectiveMode> {
  return (await companyPolicy(companyId)).effective
}
