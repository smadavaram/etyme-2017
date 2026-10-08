/**
 * The password door: sign up, prove the mailbox, sign in, reset.
 *
 * Decided by the founder, 2026-10-08 (CLAUDE.md, "A password door, until
 * the single sign-on keys exist"). The rules are `lib/password`; this is
 * the database and the mail.
 *
 * ── The order things happen in ───────────────────────────────────────
 *
 *   1. Sign-up writes the person (unverified) and a one-time link, and
 *      sends the link. Nothing else. The company's answers wait on the
 *      link, and so does the password hash, so a stranger who types
 *      somebody else's email creates nothing anybody can use.
 *   2. The link is clicked. Only now is the company made (through
 *      `createCompany`, the one way to make a company) or the candidate's
 *      seat and empty profile written, and the person signed in.
 *   3. After that the door is an email and a password, slowed after five
 *      wrong tries, and reset by a one-time link that lives an hour.
 *
 * ── What it never says ───────────────────────────────────────────────
 *
 * Whether an email has an account. Signing up with a registered email
 * answers exactly as a new one does ("Check your email") and the mailbox
 * owner is told they already have an account. A wrong password and an
 * unknown email get one sentence.
 *
 * ── The address and the domain ───────────────────────────────────────
 *
 * A company made here has an Etyme address and no verified domain, so it
 * claims nothing: a Microsoft or Google sign-in on the same domain never
 * joins it that way (`decideEntry` reads verified claims only). A
 * colleague joins by invitation, or by signing up with the same address
 * from the owner's own email domain, and is seated as Member with the
 * owner told. Where the email domain is already a verified tenant, the
 * mailbox proof is the same proof a magic link gives, and the person
 * joins that tenant rather than founding a second one: one tenant is one
 * domain name.
 */

import { prisma } from '@/lib/db'
import { ACCOUNT_MAIL } from '@/lib/notify/account-mail'
import { emit } from '@/lib/events'
import { emailSender } from '@/lib/senders'
import { appUrl } from '@/lib/supplier-link'
import { createCompany } from '@/lib/company-create'
import { typeByKey } from '@/lib/onboarding'
import { decideEntry, domainOfEmail, isConsumerDomain, type ClaimedDomain } from '@/lib/company-domains'
import { knownCountry, knownCurrency, joinedSentence } from '@/lib/setup-steps'
import { seatAsMember } from '@/lib/seat-member'
import { MEMBER_ROLE } from '@/lib/company-defaults'
import { mayClaim } from '@/lib/supplier-list'
import { reservedDomain } from '@/lib/demo-company'
import { possessive } from '@/lib/requisition-approval'
import {
  weakPasswordReason, hashPassword, passwordMatches, newToken, hashToken, expiresAfter, tokenUsable,
  secondsToWait, waitSentence, checkAddress, numberedAddress, cleanEmail, looksLikeEmail,
  NO_MATCH, UNVERIFIED_CODE, unverifiedSentence, checkYourEmail, VERIFY_HOURS, RESET_HOURS,
  SIGNUP_SHUT, RESET_SHUT, DEMO_REFUSAL, CONFIRMED_CODE, ALREADY_CONFIRMED, firmAddedYou, soloFromCandidate,
  memberWelcome, colleagueSentence, demoEmail,
} from '@/lib/password'

// ── What a sign-up waits on ───────────────────────────────────────────

/** Held on the VERIFY link until it is clicked. Never read by anything else. */
interface Pending {
  kind: 'COMPANY' | 'CANDIDATE' | 'CLAIM'
  passwordHash: string
  /** The person's own name, from either form. */
  personName?: string
  /** The company's name on the company form; the person's on a candidate link sent before personName existed. */
  name?: string
  type?: string
  country?: string
  currency?: string
  address?: string
  /** Set when the address belongs to the company of somebody on the same email domain. */
  joinCompanyId?: string
  /** A supplier invitation this sign-up takes, instead of founding a company. */
  claimToken?: string
  /** Set on an older link when a newer one is sent. */
  supersededAt?: string
  /** The email's first line where the person is already on the record, kept so "send it again" says the same. */
  opening?: string
}

export type Answer =
  | { ok: true; says: string }
  | { ok: false; status: number; field?: string; says: string }

const refuse = (says: string, field?: string, status = 422): Answer => ({ ok: false, status, field, says })

/** Whether the door can work at all here: without a sender nobody can prove a mailbox. */
export function doorOpen(): boolean {
  return emailSender() !== null
}

export const DOOR_SHUT = SIGNUP_SHUT

// ── The demo world never gets a password ──────────────────────────────

/**
 * Whether this email may use the password door at all. Null when it may;
 * the refusal when not.
 *
 * Only the address decides. An address on a domain nobody can register
 * (.example, .invalid, .local, a demo.etyme host) is the demo world's,
 * and is opened from the demo page and never with a password. A real
 * address is never demo because of who typed it in: a real person a demo
 * firm added — the seeded Pellwright, or a visitor's sandbox — signs up,
 * resets and signs in like anybody else (sign-up walk, round two, item
 * 34). The rule used to read "only seated at seeded companies" as demo,
 * and that locked a real person out for good.
 */
function demoRefusal(email: string): Answer | null {
  return demoEmail(email) ? refuse(DEMO_REFUSAL, 'email', 403) : null
}

// ── Sending a link ────────────────────────────────────────────────────

/**
 * Send one email, and write down that it went.
 *
 * The Notification row carries the subject and a body with the link cut
 * out: the token lives in the mailbox and nowhere else, so neither the
 * database nor a log can open the account.
 */
async function mail(personId: string, to: string, subject: string, lines: string[], link: string | null): Promise<boolean> {
  const sender = emailSender()
  const body = [...lines, ...(link ? ['', link] : [])].join('\n')
  const recorded = lines.join('\n') + (link ? '\n\n[the one-time link was in the email and is not kept]' : '')
  let state = 'NOT_CONFIGURED'
  let note: string | null = 'No email provider set up, so this was recorded and not sent.'
  if (sender) {
    try {
      await sender.send(to, subject, body)
      state = 'SENT'
      note = null
    } catch (e: any) {
      state = 'FAILED'
      note = String(e?.message ?? e).slice(0, 200)
    }
  }
  // Written down so delivery can be checked, and written read: a sign-up
  // or reset email is not a notice for the bell. The mailbox is where the
  // person reads it.
  const at = new Date()
  await prisma.notification.create({
    data: {
      personId, companyId: null, type: ACCOUNT_MAIL, channel: 'EMAIL',
      title: subject, body: recorded,
      deliveryState: state, deliveryNote: note, deliveredAt: state === 'SENT' ? at : null,
      status: 'READ', readAt: at,
    },
  })
  return state === 'SENT'
}

function link(path: string): string {
  return `${appUrl()}${path}`
}

/**
 * Only the newest link for an email works. Sending a new one spends every
 * earlier one of the same purpose, marked so the older link says a newer
 * one was sent rather than that it was used.
 */
async function supersede(personId: string, purpose: 'VERIFY' | 'RESET', now: Date = new Date()): Promise<void> {
  const older = await prisma.emailToken.findMany({
    where: { personId, purpose, usedAt: null },
    select: { id: true, payload: true },
  })
  for (const t of older) {
    await prisma.emailToken.updateMany({
      where: { id: t.id, usedAt: null },
      data: { usedAt: now, payload: { ...((t.payload as object | null) ?? {}), supersededAt: now.toISOString() } },
    })
  }
}

/** The stored row as `tokenUsable` reads it: a superseded link carries the moment it was replaced. */
function asLink(row: { usedAt: Date | null; expiresAt: Date; payload: unknown }) {
  const at = (row.payload as Pending | null)?.supersededAt
  return { usedAt: row.usedAt, expiresAt: row.expiresAt, supersededAt: at ? new Date(at) : null }
}

/**
 * The confirming link, with what the sign-up asked for on it.
 *
 * `opening` is the first line where the person is not new: somebody a
 * firm added is told which firm, and a candidate making their own firm is
 * told what the link makes.
 */
async function sendVerify(person: { id: string; primaryEmail: string }, pending: Pending, opening?: string): Promise<void> {
  const { supersededAt: _old, ...fresh } = pending
  pending = fresh
  opening = opening ?? pending.opening
  await supersede(person.id, 'VERIFY')
  const { token, tokenHash } = newToken()
  await prisma.emailToken.create({
    data: {
      personId: person.id, purpose: 'VERIFY', tokenHash,
      expiresAt: expiresAfter(VERIFY_HOURS), payload: { ...pending, ...(opening ? { opening } : {}) } as any,
    },
  })
  await mail(
    person.id, person.primaryEmail, 'Confirm your email for Etyme',
    [
      opening ?? 'Click the link to confirm your email and finish signing up.',
      `It works once, for ${VERIFY_HOURS} hours.`,
      'If you did not sign up for Etyme, ignore this email. Nothing is created until the link is clicked.',
    ],
    // A claim goes back to its invitation once confirmed (/verify reads `then`).
    link(`/verify/${token}${pending.kind === 'CLAIM' && pending.claimToken ? `?then=/claim/${pending.claimToken}` : ''}`),
  )
}

async function sendReset(person: { id: string; primaryEmail: string }, opening: string): Promise<void> {
  await supersede(person.id, 'RESET')
  const { token, tokenHash } = newToken()
  await prisma.emailToken.create({
    data: { personId: person.id, purpose: 'RESET', tokenHash, expiresAt: expiresAfter(RESET_HOURS) },
  })
  await mail(
    person.id, person.primaryEmail, 'Set your Etyme password',
    [opening, `Click the link to set a new password. It works once, for ${RESET_HOURS} hour.`, 'If you did not ask for this, ignore this email. Your password has not changed.'],
    link(`/reset/${token}`),
  )
}

/**
 * A one-time link to set a password, for somebody a desk invited.
 *
 * The invite route used to mint its own row; this is the one place a link
 * is made, so an invitation's link also kills any older one for the same
 * person, and the token is returned to go in the email and nowhere else.
 * The /reset/<token> page takes it.
 */
export async function issueSetPassword(personId: string, hours: number, now: Date = new Date()): Promise<string> {
  await supersede(personId, 'RESET', now)
  const { token, tokenHash } = newToken()
  await prisma.emailToken.create({
    data: { personId, purpose: 'RESET', tokenHash, expiresAt: expiresAfter(hours, now) },
  })
  return link(`/reset/${token}`)
}

/**
 * Somebody already holds this account: whoever owns the mailbox is told,
 * and the stranger learns nothing.
 */
async function tellAlreadyHere(person: Standing): Promise<void> {
  await sendReset(person,
    'Somebody tried to sign up for Etyme with this email. You already have an account. Sign in, or set a password with the link below.')
}

/**
 * A person a firm put on the record, who never set a password, never
 * signed in and never confirmed the address. For them sign-up is the
 * first sign-up, not a second one.
 */
const firmMade = (p: Standing) => p.passwordHash === null && p.credentials.length === 0 && p.emailVerifiedAt === null

/** The firm that put a person on the record: the firm on their seat, else the newest bench that lists them. */
async function firmThatAdded(personId: string): Promise<string | null> {
  const seat = await prisma.context.findFirst({
    where: { personId, revokedAt: null, companyId: { not: null } },
    orderBy: { grantedAt: 'desc' }, select: { company: { select: { name: true } } },
  })
  if (seat?.company) return seat.company.name
  const listing = await prisma.benchListing.findFirst({
    where: { consultant: { personId }, revokedAt: null },
    orderBy: { grantedAt: 'desc' }, select: { company: { select: { name: true } } },
  })
  return listing?.company.name ?? null
}

/** Whether the person owns a company here already. A candidate, or somebody a firm added, owns none. */
async function ownsAFirm(personId: string): Promise<boolean> {
  const owner = await prisma.context.findFirst({
    where: { personId, revokedAt: null, companyId: { not: null }, role: { name: 'Owner' } },
    select: { id: true },
  })
  return owner !== null
}

// ── Sign-up ───────────────────────────────────────────────────────────

/** What a person has that makes them an account rather than a pending sign-up. */
async function standing(email: string) {
  return prisma.person.findUnique({
    where: { primaryEmail: email },
    select: {
      id: true, primaryEmail: true, passwordHash: true, emailVerifiedAt: true,
      contexts: { where: { revokedAt: null }, select: { id: true }, take: 1 },
      credentials: { select: { id: true }, take: 1 },
    },
  })
}

type Standing = NonNullable<Awaited<ReturnType<typeof standing>>>
const isAccount = (p: Standing) => p.emailVerifiedAt !== null || p.passwordHash !== null || p.contexts.length > 0

/**
 * Send the link a sign-up waits on, or tell the mailbox it already has an account.
 *
 * Two people who are already on the record still sign up here, and what
 * they typed is kept (sign-up walk, round two, items 33 and 21):
 *
 *   - Somebody a firm added, who never set a password, gets the same
 *     confirming link as a new person, with the firm named. The password
 *     they typed is the one that works once they click it.
 *   - A candidate, or anybody who owns no company yet, signing up a
 *     company gets a link that makes it. Their own password stays: the
 *     form's password must be the one they already use, or the mailbox is
 *     only told it has an account, so a stranger who knows an email
 *     cannot change its password by founding a firm on it.
 */
async function begin(email: string, name: string, pending: Pending, typed?: string): Promise<Answer> {
  const existing = await standing(email)
  if (existing && isAccount(existing)) {
    const founding = pending.kind === 'COMPANY' && !pending.joinCompanyId && pending.name
    if (founding && !(await ownsAFirm(existing.id))
      && (existing.passwordHash === null || (typed !== undefined && (await passwordMatches(existing.passwordHash, typed))))) {
      await sendVerify(existing, pending, soloFromCandidate(pending.name!, existing.passwordHash !== null))
      return { ok: true, says: checkYourEmail(email) }
    }
    if (firmMade(existing)) {
      await sendVerify(existing, pending, firmAddedYou(await firmThatAdded(existing.id)))
      return { ok: true, says: checkYourEmail(email) }
    }
    await tellAlreadyHere(existing)
    return { ok: true, says: checkYourEmail(email) }
  }
  // New, or a sign-up nobody confirmed yet: either way a fresh link goes,
  // and only the newest link works.
  const person = existing ?? (await prisma.person.create({
    data: { primaryEmail: email, name: name || email.split('@')[0] },
    select: { id: true, primaryEmail: true },
  }))
  await sendVerify(person, pending)
  return { ok: true, says: checkYourEmail(email) }
}

/** Live addresses: companies that hold one, and sign-ups still waiting on their link. */
async function addressesHeld(exceptPersonId: string | null): Promise<{ companies: Map<string, string>; pending: Set<string> }> {
  const companies = new Map(
    (await prisma.company.findMany({ select: { slug: true, id: true } })).map((c) => [c.slug, c.id] as const),
  )
  const waiting = await prisma.emailToken.findMany({
    where: { purpose: 'VERIFY', usedAt: null, expiresAt: { gt: new Date() }, ...(exceptPersonId ? { NOT: { personId: exceptPersonId } } : {}) },
    select: { payload: true },
  })
  const pending = new Set(
    waiting.map((t) => (t.payload as any)?.address).filter((a): a is string => typeof a === 'string'),
  )
  return { companies, pending }
}

/** The email domains of the people who own a company. */
async function ownerDomains(companyId: string): Promise<Set<string>> {
  const owners = await prisma.context.findMany({
    where: { companyId, revokedAt: null, role: { name: { in: ['Owner', 'Admin'] } } },
    select: { person: { select: { primaryEmail: true } } },
  })
  return new Set(owners.map((o) => domainOfEmail(o.person.primaryEmail)).filter((d): d is string => !!d))
}

/**
 * The one company a work email belongs at, read off the email domains of
 * its owners. Never a personal domain (a gmail owner of a one-person firm
 * makes no other gmail user a colleague), never a seeded company, and only
 * where exactly one company answers.
 */
export async function colleagueCompany(rawEmail: unknown): Promise<{ id: string; slug: string; name: string } | null> {
  const email = cleanEmail(rawEmail)
  if (!looksLikeEmail(email) || demoEmail(email)) return null
  const domain = domainOfEmail(email)
  if (!domain || isConsumerDomain(domain)) return null
  const seats = await prisma.context.findMany({
    where: {
      revokedAt: null, role: { name: { in: ['Owner', 'Admin'] } },
      person: { primaryEmail: { endsWith: `@${domain}`, mode: 'insensitive' } },
      company: { isDemo: false },
    },
    select: { company: { select: { id: true, slug: true, name: true } } },
  })
  const found = new Map(seats.filter((s) => s.company).map((s) => [s.company!.id, s.company!] as const))
  return found.size === 1 ? [...found.values()][0] : null
}

/**
 * What the sign-up form shows after the email field: whether this email
 * joins a company already here. The answer the domain door gives after a
 * Microsoft or Google sign-in, given before the form asks for a company.
 */
export async function signUpProbe(rawEmail: unknown): Promise<{ joins: null | { address: string; company: string; says: string } }> {
  const c = await colleagueCompany(rawEmail)
  return { joins: c ? { address: c.slug, company: c.name, says: colleagueSentence(c.slug, possessive(c.name)) } : null }
}

/** A supplier invitation that is still open, by its token. */
async function openInvite(token: string) {
  const invite = await prisma.supplierInvite.findUnique({
    where: { token },
    select: { token: true, email: true, state: true, company: { select: { name: true, claimedAt: true } } },
  })
  if (!invite || invite.state !== 'PENDING' || invite.company.claimedAt) return null
  return invite
}

/** An open invitation sent to exactly this email, if there is one. */
async function inviteFor(email: string) {
  const rows = await prisma.supplierInvite.findMany({
    where: { email: { equals: email, mode: 'insensitive' }, state: 'PENDING', company: { claimedAt: null } },
    select: { token: true }, take: 2,
  })
  return rows.length === 1 ? rows[0].token : null
}

export interface CompanySignUp {
  email: unknown
  password: unknown
  /** The person's own name. */
  personName?: unknown
  name: unknown
  type: unknown
  country?: unknown
  currency?: unknown
  address: unknown
}

export async function signUpCompany(input: CompanySignUp): Promise<Answer> {
  if (!doorOpen()) return refuse(DOOR_SHUT, undefined, 503)

  const email = cleanEmail(input.email)
  if (!looksLikeEmail(email)) return refuse('Type your work email.', 'email')
  const demo = demoRefusal(email)
  if (demo) return demo
  const personName = String(input.personName ?? '').trim()
  if (!personName) return refuse('Type your name.', 'personName')
  const domain = domainOfEmail(email)
  const personal = !domain || isConsumerDomain(domain)

  // Invited already: confirming takes the invitation's company record and
  // founds no second one. The rest of the form is not needed for that.
  const invited = personal ? null : await inviteFor(email)
  if (invited) return signUpClaim({ token: invited, email, password: input.password, personName })

  // A colleague: the email belongs at a company already here, so the form
  // asked only for a name and a password.
  const colleague = personal ? null : await colleagueCompany(email)
  const typed = String(input.address ?? '').trim().toLowerCase()
  if (colleague && (!typed || typed === colleague.slug)) {
    const password = String(input.password ?? '')
    const weak = weakPasswordReason(password, { email, companyName: colleague.name })
    if (weak) return refuse(weak, 'password')
    return begin(email, personName, {
      kind: 'COMPANY', passwordHash: await hashPassword(password), personName,
      address: colleague.slug, joinCompanyId: colleague.id,
    })
  }

  const type = typeByKey(String(input.type ?? ''))
  if (personal && !type?.personalEmail) {
    return refuse(`Use your work email. A personal address like ${domain ?? 'that'} cannot stand for a company. To sign up as yourself, choose "A candidate", or the one-person company if you work through your own.`, 'email')
  }

  const name = String(input.name ?? '').trim()
  if (!name) return refuse('Type the company name.', 'name')
  if (!type) return refuse('Say what your company does here.', 'type')
  const country = knownCountry(input.country)
  if (!country) return refuse('Choose your country.', 'country')
  const currency = knownCurrency(input.currency)
  if (!currency) return refuse('Choose your currency.', 'currency')

  const password = String(input.password ?? '')
  const weak = weakPasswordReason(password, { email, companyName: name })
  if (weak) return refuse(weak, 'password')

  const existing = await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true } })
  const held = await addressesHeld(existing?.id ?? null)
  const raw = String(input.address ?? '').trim().toLowerCase()

  // The address is a company's already. The owner's colleague, on the
  // owner's own email domain, joins it; anybody else is told it is taken.
  const holder = held.companies.get(raw)
  let joinCompanyId: string | undefined
  if (holder) {
    if (personal || !(await ownerDomains(holder)).has(domain!)) {
      return refuse(`${raw}.etyme.com is already somebody else's. Choose another, or ask that company to invite you.`, 'address')
    }
    joinCompanyId = holder
  } else {
    const taken = new Set([...held.companies.keys(), ...held.pending])
    const verdict = checkAddress(raw, taken, name)
    if (!verdict.ok) return refuse(verdict.says, 'address')
  }

  return begin(email, personName, {
    kind: 'COMPANY',
    passwordHash: await hashPassword(password),
    personName, name, type: type.key, country, currency, address: raw,
    ...(joinCompanyId ? { joinCompanyId } : {}),
  }, password)
}

export async function signUpCandidate(input: { email: unknown; password: unknown; name?: unknown }): Promise<Answer> {
  if (!doorOpen()) return refuse(DOOR_SHUT, undefined, 503)
  const email = cleanEmail(input.email)
  if (!looksLikeEmail(email)) return refuse('Type your email.', 'email')
  const demo = demoRefusal(email)
  if (demo) return demo
  const name = String(input.name ?? '').trim()
  if (!name) return refuse('Type your name.', 'name')
  const password = String(input.password ?? '')
  const weak = weakPasswordReason(password, { email })
  if (weak) return refuse(weak, 'password')
  return begin(email, name, { kind: 'CANDIDATE', passwordHash: await hashPassword(password), personName: name })
}

/**
 * Signing up from a supplier invitation (`/claim/<token>`). Confirming the
 * email takes the invited company's record; nothing new is founded. The
 * seat itself is taken by the claim, exactly as for somebody who signed in
 * with Microsoft or Google: the link page sends the person there signed in.
 */
export async function signUpClaim(input: { token: unknown; email: unknown; password: unknown; personName?: unknown }): Promise<Answer> {
  if (!doorOpen()) return refuse(DOOR_SHUT, undefined, 503)
  const email = cleanEmail(input.email)
  if (!looksLikeEmail(email)) return refuse('Type your work email.', 'email')
  const demo = demoRefusal(email)
  if (demo) return demo
  const personName = String(input.personName ?? '').trim()
  if (!personName) return refuse('Type your name.', 'personName')
  const invite = await openInvite(String(input.token ?? ''))
  if (!invite) return refuse('This invitation is not open any more. Ask whoever sent it for a new one.', 'token', 410)
  if (!mayClaim(email, invite.email)) {
    return refuse(`This invitation was sent to ${invite.email}. Use that address, or another address at the same company.`, 'email')
  }
  const password = String(input.password ?? '')
  const weak = weakPasswordReason(password, { email, companyName: invite.company.name })
  if (weak) return refuse(weak, 'password')
  return begin(email, personName, {
    kind: 'CLAIM', passwordHash: await hashPassword(password), personName, claimToken: invite.token,
  })
}

/** "Send the link again", from the sign-in page. Same answer whoever asks. */
export async function resendVerification(rawEmail: unknown): Promise<Answer> {
  if (!doorOpen()) return refuse(DOOR_SHUT, undefined, 503)
  const email = cleanEmail(rawEmail)
  if (!looksLikeEmail(email)) return refuse('Type your email.', 'email')
  const demo = demoRefusal(email)
  if (demo) return demo
  const person = await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true, primaryEmail: true, emailVerifiedAt: true } })
  if (person && !person.emailVerifiedAt) {
    // The newest sign-up's answers travel with the new link.
    const last = await prisma.emailToken.findFirst({
      where: { personId: person.id, purpose: 'VERIFY', usedAt: null },
      orderBy: { createdAt: 'desc' }, select: { payload: true },
    })
    if (last?.payload) await sendVerify(person, last.payload as unknown as Pending)
  }
  return { ok: true, says: checkYourEmail(email) }
}

// ── The link is clicked ───────────────────────────────────────────────

export type Verified =
  | { ok: true; personId: string; email: string; landing: string; says: string }
  | { ok: false; says: string; code?: typeof CONFIRMED_CODE }

async function claims(): Promise<ClaimedDomain[]> {
  const rows = await prisma.companyDomain.findMany({
    select: { domain: true, companyId: true, verifiedAt: true, joinPolicy: true, company: { select: { name: true } } },
  })
  return rows.map((r) => ({
    domain: r.domain, companyId: r.companyId, companyName: r.company.name,
    verified: r.verifiedAt !== null, joinPolicy: r.joinPolicy as ClaimedDomain['joinPolicy'],
  }))
}

/**
 * Prove the mailbox, then make what the sign-up asked for.
 *
 * Used once: a second click finds the link spent. Every other VERIFY link
 * for the person dies with it, so an older sign-up's answers cannot be
 * replayed after the first was made.
 */
export async function verifyEmail(token: string, now: Date = new Date()): Promise<Verified> {
  const row = await prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(String(token ?? '')) },
    include: { person: { select: { id: true, name: true, primaryEmail: true, emailVerifiedAt: true, passwordHash: true } } },
  })
  const usable = tokenUsable(row && row.purpose === 'VERIFY' ? asLink(row) : null, 'VERIFY', now)
  // Clicked again once the account is confirmed: nothing is wrong, sign in.
  if (!usable.ok && usable.reason !== 'UNKNOWN' && row!.person.emailVerifiedAt) {
    return { ok: false, code: CONFIRMED_CODE, says: ALREADY_CONFIRMED }
  }
  if (!usable.ok) return { ok: false, says: usable.says }
  if (demoEmail(row!.person.primaryEmail)) return { ok: false, says: DEMO_REFUSAL }

  // Spent first, and only if nobody else spent it in the same instant.
  const spent = await prisma.emailToken.updateMany({ where: { id: row!.id, usedAt: null }, data: { usedAt: now } })
  if (spent.count === 0) {
    return row!.person.emailVerifiedAt
      ? { ok: false, code: CONFIRMED_CODE, says: ALREADY_CONFIRMED }
      : { ok: false, says: 'This link was already used. Sign up again with the same email and we send a new one.' }
  }
  await prisma.emailToken.updateMany({ where: { personId: row!.personId, purpose: 'VERIFY', usedAt: null }, data: { usedAt: now } })

  const person = row!.person
  const pending = row!.payload as unknown as Pending
  await prisma.person.update({
    where: { id: person.id },
    data: {
      emailVerifiedAt: person.emailVerifiedAt ?? now,
      // A password the person already uses stays theirs: a link that
      // founds a firm for a candidate never changes how they sign in.
      passwordHash: person.passwordHash ?? pending.passwordHash,
      // The person's own name, from the form. A candidate link sent before
      // the form carried personName has the name in `name`.
      ...(pending.personName ? { name: pending.personName }
        : pending.kind === 'CANDIDATE' && pending.name ? { name: pending.name } : {}),
    },
  })
  const named = { ...person, name: pending.personName || person.name }

  // From a supplier invitation: the claim seats them; nothing is founded here.
  if (pending.kind === 'CLAIM' && pending.claimToken) {
    return {
      ok: true, personId: person.id, email: person.primaryEmail, landing: `/claim/${pending.claimToken}`,
      says: 'Your email is confirmed. Take your company\'s record on the next page.',
    }
  }

  // Already seated somewhere: a company sign-up still makes the company
  // where the person owns none yet — a candidate becoming a one-person
  // firm, or somebody a firm added founding their own (item 21).
  const already = await prisma.context.findFirst({ where: { personId: person.id, revokedAt: null }, select: { id: true } })
  const founds = pending.kind === 'COMPANY' && !(await ownsAFirm(person.id))
  if (already && !founds) {
    return { ok: true, personId: person.id, email: person.primaryEmail, landing: '/start', says: 'Your email is confirmed.' }
  }

  if (pending.kind === 'CANDIDATE') {
    await prisma.context.create({ data: { personId: person.id, type: 'CONSULTANT' } })
    // Created empty rather than waiting for the first edit, the same as
    // the consumer-domain path: without a row the portal has nothing to open.
    await prisma.consultantProfile.upsert({
      where: { personId: person.id }, update: {},
      create: { personId: person.id, skills: [], visibility: 'INTERNAL' },
    })
    return { ok: true, personId: person.id, email: person.primaryEmail, landing: '/dashboard/my-work', says: 'Your email is confirmed. This is your own page.' }
  }

  // A colleague naming their company's address from the owner's domain.
  if (pending.joinCompanyId) {
    const c = await prisma.company.findUnique({ where: { id: pending.joinCompanyId }, select: { id: true, name: true } })
    if (c) return joinAsMember(named, c, `Signed up with ${pending.address}.etyme.com from the owner's email domain`)
  }

  // The email domain is already a verified tenant: one tenant is one domain.
  const entry = decideEntry(person.primaryEmail, await claims())
  if (entry.action === 'JOIN' || entry.action === 'REQUEST') {
    return joinAsMember(named, { id: entry.companyId, name: entry.companyName }, `Verified email on ${entry.domain}, which this company owns`)
  }
  if (entry.action === 'REFUSE') {
    return { ok: true, personId: person.id, email: person.primaryEmail, landing: '/start', says: entry.message }
  }

  return makeCompany(named, pending)
}

async function joinAsMember(
  person: { id: string; name: string; primaryEmail: string },
  company: { id: string; name: string },
  reason: string,
): Promise<Verified> {
  await seatAsMember(person.id, company.id)
  await prisma.automationLog.create({
    data: {
      companyId: company.id, action: 'COLLEAGUE_JOINED',
      summary: `${person.name} joined as ${MEMBER_ROLE} by signing up with a password`,
      reason, payload: { personId: person.id, email: person.primaryEmail, role: MEMBER_ROLE, door: 'PASSWORD' },
      reversible: true,
    },
  })
  return {
    ok: true, personId: person.id, email: person.primaryEmail, landing: '/start?welcome=1',
    says: memberWelcome(company.name),
  }
}

async function makeCompany(person: { id: string; name: string; primaryEmail: string }, pending: Pending): Promise<Verified> {
  const type = typeByKey(pending.type ?? '')!
  const taken = new Set((await prisma.company.findMany({ select: { slug: true } })).map((c) => c.slug))
  const wanted = pending.address!
  // Held for the day the link lived, so this is the rare case of two
  // sign-ups for one name in the same minute. Numbered and said, never refused.
  const slug = taken.has(wanted) ? numberedAddress(wanted, taken) : wanted

  const made = await createCompany({
    name: pending.name!,
    kind: type.kind as any,
    slug,
    // No verified domain: the address is the tenant until the company
    // proves a domain through the claim flow in settings.
    domain: null,
    country: pending.country ?? null,
    currency: pending.currency ?? null,
    posture: type.posture,
    byPersonId: person.id,
    seatAsOwner: true,
    claimDomain: false,
    startsSetup: true,
  })

  await prisma.automationLog.create({
    data: {
      companyId: made.company.id, action: 'COMPANY_CREATED',
      summary: joinedSentence(made.company.name, type.kind, type.posture),
      reason: `Signed up with a password and confirmed ${person.primaryEmail}`,
      payload: { companyId: made.company.id, kind: type.kind, posture: type.posture, slug, door: 'PASSWORD' },
      reversible: false,
    },
  })
  void emit({
    type: 'company.created', companyId: made.company.id, subjectType: 'Company', subjectId: made.company.id,
    actorPersonId: person.id,
    payload: { name: made.company.name, slug, kind: made.company.kind, posture: made.company.supplierPosture, domain: null },
  })

  return {
    ok: true, personId: person.id, email: person.primaryEmail, landing: '/start?welcome=1',
    says: slug === wanted
      ? `Your email is confirmed. ${made.company.name} is live at ${slug}.etyme.com.`
      : `Your email is confirmed. ${wanted}.etyme.com was taken a moment ago, so ${made.company.name} is at ${slug}.etyme.com. You can change it in Settings.`,
  }
}

// ── Signing in ────────────────────────────────────────────────────────

export type SignIn =
  | { ok: true; personId: string; email: string; name: string }
  | { ok: false; code: 'NO_MATCH' | 'WAIT' | 'UNVERIFIED' | 'DEMO'; says: string }

async function failuresFor(email: string, ip: string | null, now: Date) {
  const since = new Date(now.getTime() - 15 * 60 * 1000)
  const [byEmail, byIp] = await Promise.all([
    prisma.signInFailure.findMany({ where: { email, at: { gte: since } }, select: { at: true } }),
    ip ? prisma.signInFailure.findMany({ where: { ip, at: { gte: since } }, select: { at: true } }) : Promise.resolve([]),
  ])
  return { byEmail: byEmail.map((r) => r.at), byIp: byIp.map((r) => r.at) }
}

/**
 * An email and a password, checked.
 *
 * The answer for an unknown email and for a wrong password is the same
 * sentence and takes the same time. A wait is said with its seconds. An
 * address nobody confirmed is refused with a sentence the page reads to
 * offer the link again — and only once the password is right, so it says
 * nothing a stranger could not already learn.
 */
export async function checkPassword(rawEmail: unknown, password: unknown, ip: string | null, now: Date = new Date()): Promise<SignIn> {
  const email = cleanEmail(rawEmail)
  const pw = String(password ?? '')

  // The demo world is opened from the demo page and never with a password.
  if (demoEmail(email)) return { ok: false, code: 'DEMO', says: DEMO_REFUSAL }

  const wait = secondsToWait(await failuresFor(email, ip, now), now)
  if (wait > 0) return { ok: false, code: 'WAIT', says: waitSentence(wait) }

  const person = looksLikeEmail(email)
    ? await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true, name: true, primaryEmail: true, passwordHash: true, emailVerifiedAt: true } })
    : null

  if (person && person.passwordHash && (await passwordMatches(person.passwordHash, pw))) {
    if (!person.emailVerifiedAt) return { ok: false, code: 'UNVERIFIED', says: unverifiedSentence(email) }
    await recordSignIn(person.id, email, now)
    await prisma.signInFailure.deleteMany({ where: { email } })
    return { ok: true, personId: person.id, email, name: person.name }
  }

  // Not confirmed yet: the password is on the waiting link, not the person.
  if (person && !person.emailVerifiedAt && !person.passwordHash) {
    const waiting = await prisma.emailToken.findMany({
      where: { personId: person.id, purpose: 'VERIFY', usedAt: null, expiresAt: { gt: now } },
      select: { payload: true },
    })
    for (const t of waiting) {
      if (await passwordMatches((t.payload as any)?.passwordHash, pw)) {
        return { ok: false, code: 'UNVERIFIED', says: unverifiedSentence(email) }
      }
    }
  } else if (!person || !person.passwordHash) {
    await passwordMatches(null, pw) // the same time a real check takes
  }

  await prisma.signInFailure.create({ data: { email, ip, at: now, personId: person?.id ?? null } })
  const after = secondsToWait(await failuresFor(email, ip, now), now)
  return after > 0 ? { ok: false, code: 'WAIT', says: `${NO_MATCH} ${waitSentence(after)}` } : { ok: false, code: 'NO_MATCH', says: NO_MATCH }
}

/** A sign-in that happened, so `/ready` can count it. */
export async function recordSignIn(personId: string, email: string, now: Date = new Date()): Promise<void> {
  await prisma.credential.upsert({
    where: { provider_providerId: { provider: 'PASSWORD', providerId: email } },
    update: { lastUsedAt: now, personId },
    create: { personId, provider: 'PASSWORD', providerId: email, email, lastUsedAt: now },
  })
}

/** The string NextAuth carries back to the page for an unconfirmed address. */
export function unverifiedError(email: string): string {
  return `${UNVERIFIED_CODE}:${unverifiedSentence(email)}`
}

// ── Reset ─────────────────────────────────────────────────────────────

export async function requestReset(rawEmail: unknown): Promise<Answer> {
  const email = cleanEmail(rawEmail)
  if (!doorOpen()) return refuse(RESET_SHUT, undefined, 503)
  if (!looksLikeEmail(email)) return refuse('Type your email.', 'email')
  const demo = demoRefusal(email)
  if (demo) return demo
  const person = await standing(email)
  if (person && isAccount(person)) {
    await sendReset(person, 'You asked to set a new Etyme password.')
  } else if (person) {
    // Signed up and never confirmed: the confirming link is what they need.
    await resendVerification(email)
  }
  return { ok: true, says: `If there is an account for ${email}, we sent a link. It works for ${RESET_HOURS} hour.` }
}

export async function resetPassword(token: unknown, password: unknown, now: Date = new Date()): Promise<Answer & { email?: string }> {
  const row = await prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(String(token ?? '')) },
    include: { person: { select: { id: true, primaryEmail: true, emailVerifiedAt: true } } },
  })
  const usable = tokenUsable(row && row.purpose === 'RESET' ? asLink(row) : null, 'RESET', now)
  if (!usable.ok) return refuse(usable.says, 'token', 410)
  if (demoEmail(row!.person.primaryEmail)) return refuse(DEMO_REFUSAL, 'token', 403)

  const pw = String(password ?? '')
  const weak = weakPasswordReason(pw, { email: row!.person.primaryEmail })
  if (weak) return refuse(weak, 'password')

  const spent = await prisma.emailToken.updateMany({ where: { id: row!.id, usedAt: null }, data: { usedAt: now } })
  if (spent.count === 0) return refuse('This link was already used. Ask for a new one on the reset page.', 'token', 410)

  await prisma.person.update({
    where: { id: row!.personId },
    // The link was opened from the mailbox, which proves it as well as a verify link does.
    data: { passwordHash: await hashPassword(pw), emailVerifiedAt: row!.person.emailVerifiedAt ?? now },
  })
  await prisma.signInFailure.deleteMany({ where: { email: row!.person.primaryEmail } })
  return { ok: true, says: 'Your password is set. Sign in with it now.', email: row!.person.primaryEmail }
}

/**
 * Whether a reset link still works, asked when the page opens and before
 * anything is typed (sign-up walk, round two, item 43). A used, replaced,
 * expired or made-up link says so at once, the way a verify link does,
 * rather than after somebody has chosen a password. Reads only: opening
 * the page never spends the link, so a mail scanner cannot either.
 */
export async function resetLinkState(token: unknown, now: Date = new Date()): Promise<{ ok: true } | { ok: false; says: string }> {
  const row = await prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(String(token ?? '')) },
    include: { person: { select: { primaryEmail: true } } },
  })
  const usable = tokenUsable(row && row.purpose === 'RESET' ? asLink(row) : null, 'RESET', now)
  if (!usable.ok) return { ok: false, says: usable.says }
  if (demoEmail(row!.person.primaryEmail)) return { ok: false, says: DEMO_REFUSAL }
  return { ok: true }
}
