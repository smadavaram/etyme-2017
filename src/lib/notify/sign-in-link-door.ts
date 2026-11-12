import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { recordAccess, recordRefusal, accessActor } from '@/lib/access-log'
import { issueSetPassword } from '@/lib/password-door'
import { demoEmail, hashToken } from '@/lib/password'
import { sendEmailNow } from '@/lib/notify/send-now'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { baseUrl } from '@/lib/signed-link'
import { ACCOUNT_MAIL, recordedBody, type AccountMailState } from '@/lib/notify/account-mail'
import {
  MAY_HAND_OVER, SIGN_IN_LINK_HOURS, keptLinkIn, mayNotHandOver, notYours, sendFirstAction,
  signInLetter, signInLineSays, signInSubject, tokenOf, type SignInState,
} from '@/lib/notify/sign-in-link'

/**
 * The one door to a sign-in link on a person's row (`lib/notify/sign-in-link`
 * says the rules). Read by `GET` and made by `POST /api/notifications/sign-in-link`.
 *
 * Every answer, refusals included, writes an access-log row before it is
 * returned: whether somebody can sign in is a read of their data.
 */

export interface Caller {
  person: { id: string; name: string }
  company: { id: string; name: string } | null
  context?: { id: string } | null
  permissions: readonly string[]
  readOnly?: boolean
  isService?: boolean
}

export type Answer =
  | { ok: true; data: Line }
  | { ok: false; status: number; code: string; says: string }

export interface Line {
  personId: string
  state: SignInState
  /** Whether a line is drawn at all. */
  show: boolean
  says: string
  note: string | null
  action: string | null
  /** The one-time link, only where no email can leave and it still works. */
  link: string | null
  mail: boolean
}

/** Whether this firm employs or lists the person: a seat, a live bench listing, or a pay line that pays them direct. */
async function onOurBooks(companyId: string, personId: string): Promise<boolean> {
  const [seat, listing, pay] = await Promise.all([
    prisma.context.findFirst({ where: { personId, companyId, type: 'EMPLOYEE', revokedAt: null }, select: { id: true } }),
    prisma.benchListing.findFirst({ where: { companyId, revokedAt: null, consultant: { personId } }, select: { id: true } }),
    prisma.buyContractCandidate.findFirst({
      where: { personId, buyContract: { companyId, vendorCompanyId: null } },
      select: { id: true },
    }),
  ])
  return Boolean(seat || listing || pay)
}

/** Whether the person already signs in: a password, a work-account sign-in, or a seat used once. */
async function hasAccount(personId: string): Promise<boolean> {
  const p = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      passwordHash: true,
      _count: { select: { credentials: true } },
      contexts: { where: { lastUsedAt: { not: null } }, select: { id: true }, take: 1 },
    },
  })
  return Boolean(p && (p.passwordHash || p._count.credentials > 0 || p.contexts.length > 0))
}

type Gate =
  | { ok: true; company: { id: string; name: string }; person: { id: string; name: string; primaryEmail: string } }
  | { ok: false; status: number; code: string; says: string }

async function gate(caller: Caller, personId: string, doing: string): Promise<Gate> {
  if (!caller.company) return { ok: false, status: 403, code: 'NO_COMPANY', says: 'A sign-in link comes from a firm.' }
  const company = caller.company
  const actor = accessActor({ person: caller.person, company, context: caller.context ?? null, readOnly: caller.readOnly })
  const person = personId
    ? await prisma.person.findUnique({ where: { id: personId }, select: { id: true, name: true, primaryEmail: true } })
    : null
  if (!person) return { ok: false, status: 404, code: 'NOT_FOUND', says: 'There is nobody by that id here.' }

  const refuse = async (status: number, code: string, says: string): Promise<Gate> => {
    await recordRefusal([person.id], { ...actor, action: 'PROFILE_VIEW', reason: `Refused ${doing} for ${person.name}: ${says}` })
    return { ok: false, status, code, says }
  }
  if (caller.isService) return refuse(403, 'PERSON_REQUIRED', 'An integration cannot let people in. A person has to decide this.')
  if (!hasPermission(caller.permissions, MAY_HAND_OVER)) return refuse(403, 'FORBIDDEN', mayNotHandOver(company.name))
  if (!(await onOurBooks(company.id, person.id))) return refuse(404, 'NOT_YOURS', notYours(company.name))
  return { ok: true, company, person }
}

/** The last notice this firm wrote for this person's sign-in. */
function lastNotice(companyId: string, personId: string, firmName: string) {
  return prisma.notification.findFirst({
    where: { personId, companyId, type: ACCOUNT_MAIL, title: signInSubject(firmName) },
    orderBy: { createdAt: 'desc' },
    select: { body: true, createdAt: true, deliveryState: true },
  })
}

async function lineFor(company: { id: string; name: string }, person: { id: string; name: string; primaryEmail: string }, readOnly: boolean, now: Date): Promise<Line> {
  const mail = mailLeaves()
  const base = { personId: person.id, mail }
  const draw = (state: SignInState, extra: { at?: Date | null; until?: Date | null; link?: string | null } = {}): Line => {
    const words = signInLineSays({ state, name: person.name, email: person.primaryEmail, at: extra.at, until: extra.until })
    const action = state === 'NONE_YET' && mail ? sendFirstAction() : words.action
    const note = state === 'NONE_YET' && mail ? null : words.note
    return {
      ...base, state, show: state !== 'HAS_ACCOUNT', says: words.says, note,
      // A read-only sample seat never makes or reads a link.
      action: readOnly ? null : action,
      link: readOnly ? null : extra.link ?? null,
    }
  }

  if (await hasAccount(person.id)) return draw('HAS_ACCOUNT')
  if (demoEmail(person.primaryEmail)) return draw('DEMO')

  const last = await lastNotice(company.id, person.id, company.name)
  if (!last) return draw('NONE_YET')

  if (mail) {
    if (last.deliveryState === 'SENT') return draw('SENT', { at: last.createdAt })
    if (last.deliveryState === 'FAILED') return draw('FAILED', { at: last.createdAt })
    // Kept while no email could leave, and email can leave now: send it properly.
    return draw('NONE_YET')
  }

  const link = keptLinkIn(last.body)
  const token = link ? tokenOf(link) : null
  if (!link || !token) return draw('RAN_OUT', { at: last.createdAt })
  const row = await prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { usedAt: true, expiresAt: true, purpose: true, personId: true },
  })
  const live = row && row.purpose === 'RESET' && row.personId === person.id && !row.usedAt && row.expiresAt > now
  return live ? draw('KEPT', { at: last.createdAt, until: row!.expiresAt, link }) : draw('RAN_OUT', { at: last.createdAt })
}

/** GET: what the row says. Logged as a read of the person. */
export async function readSignInLine(caller: Caller, personId: string, now: Date = new Date()): Promise<Answer> {
  const g = await gate(caller, personId, 'reading whether they can sign in')
  if (!g.ok) return g
  const line = await lineFor(g.company, g.person, Boolean(caller.readOnly), now)
  await recordAccess([g.person.id], {
    ...accessActor({ person: caller.person, company: g.company, context: caller.context ?? null, readOnly: caller.readOnly }),
    action: 'PROFILE_VIEW',
    reason: line.link
      ? `Read whether ${g.person.name} can sign in, with the sign-in link kept for ${g.company.name} to hand over.`
      : `Read whether ${g.person.name} can sign in.`,
  })
  return { ok: true, data: line }
}

/** POST: make or renew the link; send it where email can leave. Logged. */
export async function makeSignInLink(caller: Caller, personId: string, now: Date = new Date()): Promise<Answer> {
  const g = await gate(caller, personId, 'making a sign-in link')
  if (!g.ok) return g
  const actor = accessActor({ person: caller.person, company: g.company, context: caller.context ?? null, readOnly: caller.readOnly })
  const first = g.person.name.split(' ')[0]
  if (await hasAccount(g.person.id)) {
    const says = `${first} already signs in to Etyme, so there is no link to make. ${first} can reset a forgotten password from the sign-in page.`
    await recordRefusal([g.person.id], { ...actor, action: 'PROFILE_VIEW', reason: `Refused a sign-in link for ${g.person.name}: an account exists.` })
    return { ok: false, status: 409, code: 'HAS_ACCOUNT', says }
  }
  if (demoEmail(g.person.primaryEmail)) {
    const says = `${g.person.primaryEmail} belongs to the Etyme demo. A demo seat opens only from the demo page, never with a link.`
    await recordRefusal([g.person.id], { ...actor, action: 'PROFILE_VIEW', reason: `Refused a sign-in link for ${g.person.name}: a demo address.` })
    return { ok: false, status: 422, code: 'DEMO', says }
  }

  // The password door's own invitation link: it spends any older link for
  // this person, and setting the password from it signs them in.
  const link = await issueSetPassword(g.person.id, SIGN_IN_LINK_HOURS, now)
  const login = baseUrl() ? `${baseUrl()}/login` : null
  const lines = signInLetter({ name: g.person.name, firmName: g.company.name, loginUrl: login })
  const subject = signInSubject(g.company.name)

  // Awaited, so nothing below says "sent" before the send returned; a
  // refused send keeps the provider's status and words on the row, and
  // Etyme's staff are told (lib/notify/send-now).
  const sent = await sendEmailNow({
    to: g.person.primaryEmail, subject, body: [...lines, '', link].join('\n'),
    companyId: g.company.id, personId: g.person.id,
  }, { now })
  const state: AccountMailState = sent.state === 'DEMO_SKIPPED' ? 'NOT_CONFIGURED' : sent.state
  const note: string | null = sent.note
  // The link stays on the notice only where no email could leave
  // (`recordedBody`); the bell never lists it (`bellShows`).
  await prisma.notification.create({
    data: {
      personId: g.person.id, companyId: g.company.id, type: ACCOUNT_MAIL, channel: 'EMAIL',
      title: subject, body: recordedBody(lines, link, state),
      deliveryState: state, deliveryNote: note, deliveredAt: state === 'SENT' ? now : null,
      status: 'READ', readAt: now,
    },
  })
  await prisma.automationLog.create({
    data: {
      companyId: g.company.id,
      action: 'PERSON_INVITED',
      summary: `${caller.person.name} made a sign-in link for ${g.person.name}` +
        (state === 'SENT' ? ', sent by email.' : state === 'FAILED' ? '; the email did not go.' : ', kept to hand over by hand.'),
      reason: 'A person the firm employs or lists had no way to sign in, so no timesheet could be filed.',
      payload: { personId: g.person.id, delivery: state, byPersonId: caller.person.id },
      // A newer link replaces it, and an unused one runs out on its own.
      reversible: true,
    },
  })
  const line = await lineFor(g.company, g.person, false, now)
  await recordAccess([g.person.id], {
    ...actor, action: 'PROFILE_VIEW',
    reason: `Made a sign-in link for ${g.person.name} (${state === 'NOT_CONFIGURED' ? 'kept to hand over' : state === 'SENT' ? 'sent' : 'send failed'}).`,
  })
  return { ok: true, data: line }
}
