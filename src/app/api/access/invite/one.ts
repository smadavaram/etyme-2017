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
import { signedInHere } from '@/lib/access-log'
import { hasPermission, inWords } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { checkInvite } from '@/lib/account-lifecycle'
import { doorOpen, issueSetPassword } from '@/lib/password-door'
import { baseUrl } from '@/lib/signed-link'
import { appUrl } from '@/lib/app-url'
import { recordedBody } from '@/lib/notify/account-mail'
import { hasEverCameIn } from '@/lib/notify/came-in'
import { sendEmailNow } from '@/lib/notify/send-now'
import { failureFromNote, mailFailureSays } from '@/lib/notify/mail-failure'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { checkDoor, companyPolicy } from '@/lib/identity/read'
import { recordIdentityEvent } from '@/lib/identity/ledger'
import { reportError } from '@/lib/alerts'
import type { EffectiveMode } from '@/lib/identity/policy'
import {
  alreadyInvitedSays, copyInvitation, seatHasSignedIn, invitedAs, inviteLetter, inviteSays, INVITE_LINK_HOURS, OWNER_DESK,
  type InviteDoor, type InviteMail, type InviteMailState,
  countsAgainstCap, MAIL_NOT_GONE,
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

/**
 * Which way in the email offers, from the company's mode and the person.
 * `cameIn` is whether anybody has ever used her record, by any door
 * (`hasEverCameIn` in lib/notify/came-in, 2026-11-16): the one predicate
 * the firm's sign-in link reads too. Only a record nobody has ever used
 * is offered a link to choose a password.
 */
export function doorFor(a: { mode: EffectiveMode; cameIn: boolean; login: string }): InviteDoor {
  // A directory-only company has shut the password door: no set-password
  // link is minted for it at all (second reader, fault 6).
  if (a.mode === 'SSO_ONLY') return 'DIRECTORY'
  // She has a way in already: she signs in as usual, and the letter never
  // carries a link that sets a password on an account somebody has used.
  if (a.cameIn) return 'SIGN_IN'
  if (doorOpen() && a.login) return 'PASSWORD'
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
 * Mints a new set-password link only where the door is a password, which
 * is only for a record nobody has ever used (`hasEverCameIn`); that kills
 * any older one for the person. Sends it only to the address on the
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
  // Whether anybody has ever used her record, by any door: a password, a
  // Google, Microsoft or LinkedIn sign-in, a directory, a first email link,
  // an answer given by link, a seat she used (2026-11-16). One predicate,
  // the one the firm's sign-in link reads (`hasEverCameIn`). Read here, for
  // the letter only she reads, and never said to the firm. A seat invited
  // at an address that signs in elsewhere is offered Send again until she
  // signs in here, so the letter must never carry a link that sets a
  // password on an account somebody has used.
  const cameIn = await hasEverCameIn(a.person.id)
  const door = doorFor({ mode: a.mode, cameIn, login })
  const title = inviteTitle(a.inviterName, a.company.name)

  // One door mints the link, and it kills any older one for this person.
  const setPasswordUrl = door === 'PASSWORD' ? await issueSetPassword(a.person.id, INVITE_LINK_HOURS, now, a.company.id) : null
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
  const mail = { state, at: sent.at, why: sent.left ? null : mailFailureSays(sent.failure) }
  try {
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
  } catch {
    // The send has answered by now: whoever catches this still knows
    // whether the email left, so an email that went is never logged as one
    // that did not.
    throw new InvitationNoticeLost(mail)
  }
  return { door, mail }
}

/**
 * Thrown by `sendInvitationMail` where the email was tried and its notice
 * could not be written. It carries how the send went. It never carries the
 * database's own words, which may hold the letter and its one-time link.
 */
export class InvitationNoticeLost extends Error {
  constructor(readonly mail: InviteMail & { state: InviteMailState }) {
    super('The invitation email was tried, and its notice could not be written.')
    this.name = 'InvitationNoticeLost'
  }
}

/**
 * `sendInvitationMail`, never throwing. A throw before the email was handed
 * over (the set-password link could not be made) is an email that did not
 * go. A throw after it (the notice could not be written) keeps what the
 * send said. Etyme's staff are told either way, with no letter, link or
 * database words in the report.
 */
export async function tryInvitationMail(a: Parameters<typeof sendInvitationMail>[0]): Promise<{ mail: InviteMail & { state: InviteMailState }; threw: boolean }> {
  try {
    return { mail: (await sendInvitationMail(a)).mail, threw: false }
  } catch (err) {
    const lost = err instanceof InvitationNoticeLost
    void reportError(
      lost ? 'An invitation email’s notice could not be written' : 'An invitation email could not be sent',
      `Seat ${a.contextId}${lost ? `; the send said ${err.mail.state}` : '; nothing was sent'}`,
      { personId: a.person.id, companyId: a.company.id },
    )
    return { mail: lost ? err.mail : { state: 'FAILED', at: null, why: null }, threw: true }
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

/**
 * How many invitation emails a seat was sent since a moment, and the
 * oldest of them. Only emails that left are counted (founder, 2026-11-15):
 * a try that did not go is no email, and where no email can leave this
 * deployment at all, nothing counts.
 */
export async function invitationEmailsSince(contextId: string, since: Date): Promise<{ count: number; oldest: Date | null }> {
  if (!mailLeaves()) return { count: 0, oldest: null }
  const rows = await prisma.notification.findMany({
    where: { entityId: contextId, channel: 'EMAIL', title: { contains: INVITE_TITLE_MARK }, createdAt: { gte: since }, deliveryState: { notIn: [...MAIL_NOT_GONE] } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })
  return { count: rows.length, oldest: rows[0]?.createdAt ?? null }
}

/**
 * The invitation emails a company sent in the last hour, and the oldest of
 * them: the one count the hourly cap reads, for one address, for several at
 * once and for Send the invitation again alike (security review,
 * 2026-11-12). Read from the automation log, whose rows belong to the
 * company and survive a withdrawal, so withdrawing invitations never gives
 * the hour back. A copied invitation sends nothing and is not counted.
 */
export async function invitationsThisHour(companyId: string, now: Date = new Date()): Promise<{ count: number; oldest: Date | null }> {
  // Only a try whose email left counts (founder, 2026-11-15): where no
  // email can leave this deployment at all, nothing counts.
  if (!mailLeaves()) return { count: 0, oldest: null }
  const rows = await prisma.automationLog.findMany({
    where: { companyId, action: { in: [...INVITATION_SEND_ACTIONS] }, at: { gte: new Date(now.getTime() - 3_600_000) } },
    orderBy: { at: 'asc' },
    select: { at: true, payload: true },
  })
  // A copied invitation sends nothing, and an email that did not go is no send (`countsAgainstCap`).
  const sends = rows.filter((r) => countsAgainstCap(r.payload))
  return { count: sends.length, oldest: sends[0]?.at ?? null }
}

/** The automation-log names an invitation email is written under, first and again. */
export const INVITATION_SEND_ACTIONS = ['PERSON_INVITED', 'INVITATION_SENT_AGAIN'] as const

/**
 * Run the count and the invitations it allows one company at a time, so two
 * presses at once cannot each read room for sixty and send a hundred and
 * twenty. A Postgres lock held by one transaction for the company; the
 * invitations themselves are written on their own connections inside it,
 * and the next press for the same company waits until this one is done.
 */
export async function underInviteLock<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'access-invite:' + companyId}))`
    return fn()
  }, { maxWait: 30_000, timeout: 180_000 })
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
    },
  })

  // Already waiting on an invitation here: say where to press, rather than
  // the bare refusal (fault 8). Only this company's own seats are named,
  // and whether she came in is this firm's own record, never her account
  // elsewhere (2026-11-16): an address invited here that signs in at
  // another firm is "already invited" until she signs in here, the same
  // answer as an address Etyme has never seen.
  const here = existing?.contexts ?? []
  const cameIn = existing && here.length ? await signedInHere(companyId, [existing.id]) : new Set<string>()
  const waiting = here.find((c) => !seatHasSignedIn({ invitedAt: c.invitedAt ?? null, lastUsedAt: c.lastUsedAt ?? null, signedInHere: cameIn.has(existing!.id) }))
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

  void emit({
    type: 'company.member_joined',
    companyId,
    subjectType: 'Person',
    subjectId: person.id,
    actorPersonId: inviter.personId,
    payload: { email, invited: true, roleName: role?.name ?? null, outsider: check.outsider },
  })

  // ── The record of the invitation, written before the email is tried ──
  //
  // Whatever the send does, the invitation is on the record: withdrawing it
  // reads createdPerson here (it deletes the person only where this
  // invitation made them, never somebody who was on Etyme before; security
  // review, 2026-11-12), and the hourly cap and the activity log read this
  // row. Until the send answers, the row carries no mail state, and a row
  // that cannot say how its email went still counts against the hour
  // (`countsAgainstCap`). Written inside the company's invite lock.
  const logPayload = { contextId: context.id, email, roleId: role?.id ?? null, outsider: check.outsider, act: 'INVITED', createdPerson: !existing }
  const logged = await prisma.automationLog.create({
    data: {
      companyId,
      action: 'PERSON_INVITED',
      summary: `${inviter.name} invited ${email}${role ? ` as ${role.name}` : ' with no role yet'}`,
      // The reason this is worth logging: it is an exception to the rule
      // everything else depends on.
      reason: check.reason,
      payload: logPayload,
      reversible: true,
    },
    select: { id: true },
  })

  // ── The email: always a way in, never only an instruction, and awaited ──
  const sent = await tryInvitationMail({
    contextId: context.id,
    person: { id: person.id, primaryEmail: email, passwordHash: person.passwordHash },
    inviterName: inviter.name,
    company: { id: companyId, name: company?.name ?? inviter.company.name },
    roleName: role?.name ?? null,
    mode,
  })
  // How the email went, so the hourly cap counts only an email that left
  // (founder, 2026-11-15), and a send that threw before the email was handed
  // over is an email that did not go. Still inside the lock, before the next
  // press reads the count. Where this write fails the row keeps no mail
  // state and counts: the cap stays safe where the record cannot say.
  await prisma.automationLog.update({
    where: { id: logged.id },
    data: { payload: { ...logPayload, mail: sent.mail.state } },
  }).catch(() => {
    void reportError('An invitation’s log row could not say how its email went', `Seat ${context.id}`, { companyId })
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
