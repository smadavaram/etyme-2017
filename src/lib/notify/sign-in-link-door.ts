import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { recordAccess, recordRefusal, accessActor, signedInHere } from '@/lib/access-log'
import { issueSetPassword } from '@/lib/password-door'
import { demoEmail, hashToken } from '@/lib/password'
import { sendEmailNow } from '@/lib/notify/send-now'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { baseUrl } from '@/lib/signed-link'
import { ACCOUNT_MAIL, recordedBody, type AccountMailState } from '@/lib/notify/account-mail'
import {
  MAY_HAND_OVER, alreadySignsInRefusal, awaitingYesRefusal, awaitsHerYes, calledOnRow, keptLinkIn, mayNotHandOver, notYours,
  sampleRefusal, sendFirstAction, signInLetter, signInLineSays, signInSubject, tokenOf, isSignInDoorLink, signInDoorLive, signInDoorUntil,
  signInDoorSends, signInDoorPressed, signInDoorRefused, type SignInState,
} from '@/lib/notify/sign-in-link'
import { hasEverCameIn } from '@/lib/notify/came-in'
import { readSignInDoor, signInDoorUrl } from '@/lib/notify/sign-in-door'
import { firmReadsAt, nameItTyped } from '@/lib/consultant-portfolio/before-her-yes'

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

/**
 * Whether this firm employs or lists the person (a seat, a live bench
 * listing, or a pay line that pays them direct), and whether its only tie
 * is an ask she has not said yes to (`awaitsHerYes`). Neither reads her
 * account.
 */
async function tiesHere(companyId: string, personId: string): Promise<{ onBooks: boolean; awaitsYes: boolean }> {
  const [seat, listing, pay] = await Promise.all([
    prisma.context.findFirst({ where: { personId, companyId, type: 'EMPLOYEE', revokedAt: null }, select: { id: true } }),
    prisma.benchListing.findFirst({ where: { companyId, revokedAt: null, consultant: { personId } }, select: { state: true } }),
    prisma.buyContractCandidate.findFirst({
      where: { personId, buyContract: { companyId, vendorCompanyId: null } },
      select: { id: true },
    }),
  ])
  return {
    onBooks: Boolean(seat || listing || pay),
    awaitsYes: awaitsHerYes({ seatHere: Boolean(seat), paysHerDirect: Boolean(pay), listingState: listing?.state ?? null }),
  }
}

/**
 * Whether she came in here: this firm's own fact, never her account
 * elsewhere (2026-11-16). She acted on a seat at this firm in person:
 * every act a seat does is logged with its company, her first opening of
 * the seat an invitation here made included (INVITE_ACCEPTED, written by
 * `markSeatOpened` through the caller check, never by a sign-in elsewhere).
 * Read through `signedInHere` in lib/access-log, the one reader Users &
 * permissions, the invite answer and the caller check read, so a row a
 * twin wrote on her seat's authority, or a sign-in this firm refused, is
 * not her coming in here either. It counted both, so a seat whose twin
 * acted, or whose sign-in the directory refused, read "signs in here"
 * while Users & permissions read "Invited". A week on file is not read:
 * a week can be imported or seeded, and the timesheet does not say who
 * filed it. Whether her address has a password or a Google or Microsoft
 * sign-in anywhere is never read for the line; only the door reads it,
 * at use.
 */
async function signsInHere(companyId: string, personId: string): Promise<boolean> {
  return (await signedInHere(companyId, [personId])).has(personId)
}

/** What the sign-in door keeps on its notice, beside the delivery. */
interface DoorData { signInDoor: true; openedAt: string | null }
const doorData = (d: unknown): DoorData | null =>
  d && typeof d === 'object' && (d as DoorData).signInDoor === true ? (d as DoorData) : null

/**
 * Who the firm reads her as. `called` is the name every sentence on her
 * row uses (`calledOnRow`): her own, or before her yes the name the firm
 * typed, or null where it typed none. `logged` is the name the firm's
 * activity log uses: the same, or the address it asked at. Her own name
 * stays in the letter, which only she reads.
 */
interface Called { called: string | null; logged: string }

type Gate =
  | { ok: true; company: { id: string; name: string }; person: { id: string; name: string; primaryEmail: string }; as: Called; awaitsYes: boolean }
  | { ok: false; status: number; code: string; says: string }

/**
 * Before her yes, on a record whose words are not this firm's, the firm
 * reads only what it typed. One reader decides it (`firmReadsAt`, batch
 * five, the walk of 2026-11-16: the sample-person line read her own
 * first name off her record).
 */
async function calledAs(companyId: string, callerPersonId: string, person: { id: string; name: string; primaryEmail: string }): Promise<Called> {
  const profile = await prisma.consultantProfile.findUnique({ where: { personId: person.id }, select: { id: true } })
  const typed = profile
    ? (await firmReadsAt({ companyId, callerPersonId, consultantIds: [profile.id] })).get(profile.id)?.typed ?? null
    : null
  if (!typed) return { called: person.name, logged: person.name }
  // The name it typed, or, where it typed none, the reader's own stand-in
  // (the address it asked at), which no sentence opens with.
  const typedName = typed.name === nameItTyped(null, person.primaryEmail) ? null : typed.name
  return { called: calledOnRow({ ownName: person.name, beforeHerYes: true, typedName }), logged: typed.name }
}

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
  const ties = await tiesHere(company.id, person.id)
  if (!ties.onBooks) return refuse(404, 'NOT_YOURS', notYours(company.name))
  return { ok: true, company, person, as: await calledAs(company.id, caller.person.id, person), awaitsYes: ties.awaitsYes }
}

/** The last notice this firm wrote for this person's sign-in. */
function lastNotice(companyId: string, personId: string, firmName: string) {
  return prisma.notification.findFirst({
    where: { personId, companyId, type: ACCOUNT_MAIL, title: signInSubject(firmName) },
    orderBy: { createdAt: 'desc' },
    select: { id: true, body: true, createdAt: true, deliveryState: true, data: true },
  })
}

async function lineFor(company: { id: string; name: string }, person: { id: string; name: string; primaryEmail: string }, called: string | null, awaitsYes: boolean, readOnly: boolean, now: Date): Promise<Line> {
  const mail = mailLeaves()
  const base = { personId: person.id, mail }
  const draw = (state: SignInState, extra: { at?: Date | null; until?: Date | null; link?: string | null } = {}): Line => {
    const words = signInLineSays({ state, name: called, email: person.primaryEmail, at: extra.at, until: extra.until })
    const action = state === 'NONE_YET' && mail ? sendFirstAction() : words.action
    const note = state === 'NONE_YET' && mail ? null : words.note
    return {
      ...base, state, show: state !== 'SIGNS_IN_HERE' && state !== 'AWAITING_YES', says: words.says, note,
      // A read-only sample seat never makes or reads a link.
      action: readOnly ? null : action,
      link: readOnly ? null : extra.link ?? null,
    }
  }

  // Before her yes, one answer for every address (`awaitsHerYes`).
  if (awaitsYes) return draw('AWAITING_YES')
  // Her account is never read here: only this firm's own facts.
  if (await signsInHere(company.id, person.id)) return draw('SIGNS_IN_HERE')
  if (demoEmail(person.primaryEmail)) return draw('DEMO')

  const last = await lastNotice(company.id, person.id, company.name)
  if (!last) return draw('NONE_YET')

  // The sign-in door's notice says when it was opened: the same for every
  // address, since the door decides at use and not before.
  const opened = doorData(last.data)?.openedAt ?? null
  if (opened) return draw('OPENED', { at: new Date(opened) })

  if (mail) {
    if (last.deliveryState === 'SENT') return draw('SENT', { at: last.createdAt })
    if (last.deliveryState === 'FAILED') return draw('FAILED', { at: last.createdAt })
    // Kept while no email could leave, and email can leave now: send it properly.
    return draw('NONE_YET')
  }

  const link = keptLinkIn(last.body)
  if (!link) return draw('RAN_OUT', { at: last.createdAt })
  if (isSignInDoorLink(link)) {
    // The newest notice is this one, so only its age decides.
    return signInDoorLive({ madeAt: last.createdAt, isNewest: true, now })
      ? draw('KEPT', { at: last.createdAt, until: signInDoorUntil(last.createdAt), link })
      : draw('RAN_OUT', { at: last.createdAt })
  }
  // A link kept before the sign-in door (2026-11-16): the password door's
  // own, read as it always was, so a kept link loses nothing.
  const token = tokenOf(link)
  if (!token) return draw('RAN_OUT', { at: last.createdAt })
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
  const line = await lineFor(g.company, g.person, g.as.called, g.awaitsYes, Boolean(caller.readOnly), now)
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
  // Before her yes, one refusal for every address (`awaitsHerYes`).
  if (g.awaitsYes) {
    await recordRefusal([g.person.id], { ...actor, action: 'PROFILE_VIEW', reason: `Refused a sign-in link for ${g.person.name}: not yet a yes to the bench invitation.` })
    return { ok: false, status: 409, code: 'AWAITING_HER_YES', says: awaitingYesRefusal() }
  }
  // Her account is never read here (2026-11-16): only whether she came in
  // at this firm, which the firm reads already.
  if (await signsInHere(g.company.id, g.person.id)) {
    const says = alreadySignsInRefusal(g.as.called)
    await recordRefusal([g.person.id], { ...actor, action: 'PROFILE_VIEW', reason: `Refused a sign-in link for ${g.person.name}: already signs in here.` })
    return { ok: false, status: 409, code: 'SIGNS_IN_HERE', says }
  }

  if (demoEmail(g.person.primaryEmail)) {
    const says = sampleRefusal(g.as.called, g.person.primaryEmail)
    await recordRefusal([g.person.id], { ...actor, action: 'PROFILE_VIEW', reason: `Refused a sign-in link for ${g.person.name}: a demo address.` })
    return { ok: false, status: 422, code: 'DEMO', says }
  }
  // One link for every address: the sign-in door, which decides at use
  // whether she signs in or chooses a password (`enterSignInDoor`). Its
  // token names the notice, so the notice is written first.
  const login = baseUrl() ? `${baseUrl()}/login` : null
  const lines = signInLetter({ name: g.person.name, firmName: g.company.name, loginUrl: login })
  const subject = signInSubject(g.company.name)
  const notice = await prisma.notification.create({
    data: {
      personId: g.person.id, companyId: g.company.id, type: ACCOUNT_MAIL, channel: 'EMAIL',
      title: subject, body: lines.join('\n'), createdAt: now,
      data: { signInDoor: true, openedAt: null } satisfies DoorData as any,
      deliveryState: 'PENDING', status: 'READ', readAt: now,
    },
    select: { id: true },
  })
  const link = signInDoorUrl(notice.id)
  if (!link) {
    await prisma.notification.delete({ where: { id: notice.id } })
    await recordRefusal([g.person.id], { ...actor, action: 'PROFILE_VIEW', reason: `Refused a sign-in link for ${g.person.name}: no signing secret is set.` })
    return { ok: false, status: 503, code: 'NO_LINK', says: 'This deployment cannot make sign-in links yet. Ask Etyme support to finish setting it up.' }
  }

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
  await prisma.notification.update({
    where: { id: notice.id },
    data: { body: recordedBody(lines, link, state), deliveryState: state, deliveryNote: note, deliveredAt: state === 'SENT' ? now : null },
  })
  await prisma.automationLog.create({
    data: {
      companyId: g.company.id,
      action: 'PERSON_INVITED',
      // The firm's activity log reads this: the name the firm reads her as.
      summary: `${caller.person.name} made a sign-in link for ${g.as.logged}` +
        (state === 'SENT' ? ', sent by email.' : state === 'FAILED' ? '; the email did not go.' : ', kept to hand over by hand.'),
      reason: 'A person the firm employs or lists had no way to sign in here, so no timesheet could be filed.',
      payload: { personId: g.person.id, delivery: state, byPersonId: caller.person.id },
      // A newer link replaces it, and an unused one runs out on its own.
      reversible: true,
    },
  })
  const line = await lineFor(g.company, g.person, g.as.called, g.awaitsYes, false, now)
  await recordAccess([g.person.id], {
    ...actor, action: 'PROFILE_VIEW',
    reason: `Made a sign-in link for ${g.person.name} (${state === 'NOT_CONFIGURED' ? 'kept to hand over' : state === 'SENT' ? 'sent' : 'send failed'}).`,
  })
  return { ok: true, data: line }
}

// ── The sign-in door, at use ───────────────────────────────────────────

export type DoorRead =
  | { ok: true; firmName: string }
  /** `used`: the link was pressed already and works only once. */
  | { ok: false; firmName: string | null; used: boolean }

type Why = Parameters<typeof signInDoorRefused>[1]

/**
 * The notice a sign-in door link names, if it still works: the newest
 * this firm made for her, younger than `SIGN_IN_LINK_HOURS`, never pressed
 * before, at an address a mailbox uses, for somebody still on this firm's
 * books and not waiting on her yes. Reads only. A refusal says whom the
 * token named, where it named anybody, so a press can be logged against her.
 */
async function liveDoor(token: string, now: Date) {
  const nobody = { ok: false as const, firmName: null, personId: null, why: null }
  const t = readSignInDoor(token)
  if (!t) return nobody
  const notice = await prisma.notification.findUnique({
    where: { id: t.noticeId },
    select: {
      id: true, personId: true, companyId: true, title: true, type: true, createdAt: true, data: true,
    },
  })
  if (!notice || notice.type !== ACCOUNT_MAIL || !notice.companyId || !doorData(notice.data)) return nobody
  const [company, person] = await Promise.all([
    prisma.company.findUnique({ where: { id: notice.companyId }, select: { id: true, name: true } }),
    prisma.person.findUnique({ where: { id: notice.personId }, select: { id: true, primaryEmail: true } }),
  ])
  if (!company || !person) return nobody
  const refused = (why: Why) => ({ ok: false as const, firmName: company.name, personId: person.id, why })
  // Used once already: said first, whatever else is true of it now.
  if (doorData(notice.data)!.openedAt) return refused('USED')
  const newest = await prisma.notification.findFirst({
    where: { personId: notice.personId, companyId: notice.companyId, type: ACCOUNT_MAIL, title: notice.title },
    orderBy: { createdAt: 'desc' }, select: { id: true },
  })
  if (!signInDoorLive({ madeAt: notice.createdAt, isNewest: newest?.id === notice.id, now })) return refused('REPLACED_OR_RAN_OUT')
  if (demoEmail(person.primaryEmail)) return refused('SAMPLE')
  const ties = await tiesHere(company.id, notice.personId)
  if (!ties.onBooks) return refused('NOT_ON_BOOKS')
  if (ties.awaitsYes) return refused('AWAITING_YES')
  return { ok: true as const, firmName: company.name, notice, person }
}

/** GET of the page the link opens: whether it still works, and the firm's name. Never reads her account. */
export async function readSignInDoorPage(token: string, now: Date = new Date()): Promise<DoorRead> {
  const d = await liveDoor(token, now)
  return d.ok ? { ok: true, firmName: d.firmName } : { ok: false, firmName: d.firmName, used: d.why === 'USED' }
}

/**
 * Spend the link: set `openedAt` only where it is still unset, in one
 * statement, so two presses at once cannot both pass. True where this
 * press spent it.
 */
async function spend(noticeId: string, now: Date): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE "Notification"
    SET "data" = jsonb_set("data"::jsonb, '{openedAt}', to_jsonb(${now.toISOString()}::text))
    WHERE "id" = ${noticeId} AND ("data"::jsonb ->> 'openedAt') IS NULL`
  return n === 1
}

/**
 * Continue, pressed on the page (a button, so a mail scanner that opens
 * every link decides nothing). The door decides here, at use, and only
 * here (2026-11-16, after a reader found the firm could choose a password
 * on the account of somebody who signs in by an email link):
 *
 *  - The link is spent first, once and for all, whichever way it goes.
 *    A second press is refused and goes back to the page, which says the
 *    link was used.
 *  - A record anybody has ever used, by any door (`hasEverCameIn`, every
 *    trace the platform keeps), goes to the sign-in page with its address
 *    filled, where she uses her own door. The link a firm holds never sets
 *    a password on it.
 *  - Only a record nobody has ever used is given the password door's own
 *    one-time link to choose a first password, which signs her in when
 *    she has.
 *
 * Every press is logged with her as the subject before the answer goes,
 * as SIGN_IN_LINK_USE, its own name on the access log (2026-11-16; it was
 * filed as PROFILE_VIEW): a refusal through `recordRefusal`, a use
 * through `recordAccess`. No
 * actor is named, since whoever holds the link pressed it, and no row,
 * reply body or notice holds the link, its token, or the one-time link,
 * which goes to her browser as a redirect.
 */
export async function enterSignInDoor(token: string, now: Date = new Date()): Promise<{ ok: true; to: string } | { ok: false }> {
  const d = await liveDoor(token, now)
  if (!d.ok) {
    if (d.personId && d.why) {
      await recordRefusal([d.personId], { action: 'SIGN_IN_LINK_USE', reason: signInDoorRefused(d.firmName, d.why) })
    }
    return { ok: false }
  }
  if (!(await spend(d.notice.id, now))) {
    await recordRefusal([d.person.id], { action: 'SIGN_IN_LINK_USE', reason: signInDoorRefused(d.firmName, 'USED') })
    return { ok: false }
  }
  await recordAccess([d.person.id], { action: 'SIGN_IN_LINK_USE', reason: signInDoorPressed(d.firmName) })
  const way = signInDoorSends({ everCameIn: await hasEverCameIn(d.person.id) })
  if (way === 'SIGN_IN') {
    return { ok: true, to: `/login?email=${encodeURIComponent(d.person.primaryEmail.trim().toLowerCase())}` }
  }
  // An hour: she is at the door now. The password door spends any older link.
  return { ok: true, to: await issueSetPassword(d.person.id, 1, now, d.notice.companyId) }
}
