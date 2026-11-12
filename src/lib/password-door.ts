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
 * colleague joins it by invitation only; typing its Etyme address seats
 * nobody (coordinator's ruling, 2026-11-12). Where the email domain is already a verified tenant, the
 * mailbox proof is the same proof a magic link gives, and the person
 * joins that tenant rather than founding a second one: one tenant is one
 * domain name.
 */

import { prisma } from '@/lib/db'
import type { Door } from '@/lib/identity/policy'
import { landingFor } from '@/lib/nav-table'
import { ACCOUNT_MAIL, recordedBody, type AccountMailState } from '@/lib/notify/account-mail'
import { linkWithStaff } from '@/lib/password-words'
import { personNameFor } from '@/lib/company-seats'
import { emit } from '@/lib/events'
import { emailSender } from '@/lib/senders'
import { sendEmailNow } from '@/lib/notify/send-now'
import { appUrl } from '@/lib/supplier-link'
import { createCompany } from '@/lib/company-create'
import { recordAnswers } from '@/lib/setup-checklist-state'
import { signUpAnswers } from '@/lib/setup-fill'
import { typeByKey } from '@/lib/onboarding'
import { decideEntry, domainOfEmail, isConsumerDomain, isPlatformDomain, type ClaimedDomain } from '@/lib/company-domains'
import { knownCountry, knownCurrency, joinedSentence } from '@/lib/setup-steps'
import { seatAsMember } from '@/lib/seat-member'
import { MEMBER_ROLE } from '@/lib/company-defaults'
import { mayClaim } from '@/lib/supplier-list'
import { reservedDomain } from '@/lib/demo-company'
import { possessive } from '@/lib/requisition-approval'
import { sealBlob, openBlob, deploymentSecret } from '@/lib/identity/oidc'
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

/**
 * The company's sign-in policy, at the password door (founder, 2026-11-11).
 * An address on a directory-only company's verified domain is refused here
 * at sign-up, at "send the link again", at reset and at sign-in alike, in
 * the same sentence, the ledger row written first (lib/identity). A join by
 * domain asks the company being joined too: an invite-only company admits
 * nobody that way. It says nothing about whether the address has an
 * account, so it tells a stranger nothing.
 */
async function policyRefusal(email: string, door: Door, targetCompanyId?: string | null): Promise<Answer | null> {
  const { checkDoor } = await import('@/lib/identity/read')
  const v = await checkDoor({ door, email, targetCompanyId: targetCompanyId ?? null, surface: 'WEB' })
  return v.allowed ? null : refuse(v.says, 'email', 403)
}

/**
 * Whether sign-up is open here. Always, since 2026-10-27: where no email
 * can be sent, the confirmation link is kept on the notice for staff to
 * pass on (`recordedBody`, NOT_CONFIGURED), which is the whole point of
 * that rescue. Kept as a function so the pages ask one place.
 */
export function doorOpen(): boolean {
  return true
}

/**
 * Whether an email can leave this deployment. Reset asks this and stays
 * shut without it: a password-reset link held in the database and passed
 * on by hand is a way into somebody's existing account, which a sign-up
 * confirmation is not.
 */
export function mailLeaves(): boolean {
  return emailSender() !== null
}

/** What a person is told once a link is on its way: their mailbox, or staff where no email can leave. */
function toldWhere(email: string): string {
  return mailLeaves() ? checkYourEmail(email) : linkWithStaff(email)
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
 * out where the email left: the token lives in the mailbox and nowhere
 * else. Where no email could be sent, the link is kept on the row for
 * staff to pass on (`recordedBody`).
 */
async function mail(personId: string, to: string, subject: string, lines: string[], link: string | null): Promise<boolean> {
  const body = [...lines, ...(link ? ['', link] : [])].join('\n')
  // One send for every account email (lib/notify/send-now): a refusal keeps
  // the provider's status and cleaned words on the row, where Superadmin's
  // list and /ready read them, and Etyme's staff are told within the hour.
  // Before 2026-11-12 the door kept the thrown message alone, so a refused
  // confirm or reset email was counted and never explained.
  const sent = await sendEmailNow({ to, subject, body, personId, companyId: null })
  const state: AccountMailState = sent.state === 'SENT' ? 'SENT' : sent.state === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'FAILED'
  const note = sent.note
  // Written down so delivery can be checked, and written read: a sign-up
  // or reset email is not a notice for the bell. The mailbox is where the
  // person reads it.
  const at = new Date()
  await prisma.notification.create({
    data: {
      personId, companyId: null, type: ACCOUNT_MAIL, channel: 'EMAIL',
      // The link is cut out once the email left; kept for staff only where
      // no email could be sent (conversation's rule, lib/notify/account-mail).
      title: subject, body: recordedBody(lines, link, state),
      deliveryState: sent.state, deliveryNote: note, deliveredAt: state === 'SENT' ? at : null,
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
/**
 * Every unused link of one kind for a person, spent now, so an old email's
 * link no longer works (2026-11-12: Ending a seat still waiting on its
 * invitation). Nothing is sent and no link is shown.
 */
export async function cancelUnusedLinks(personId: string, purpose: 'VERIFY' | 'RESET', now: Date = new Date()): Promise<void> {
  return supersede(personId, purpose, now)
}

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
    // Marked, so setting the password from it starts her session (2026-10-27).
    data: { personId, purpose: 'RESET', tokenHash, expiresAt: expiresAfter(hours, now), payload: { invitation: true } },
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
    where: {
      personId, revokedAt: null, companyId: { not: null },
      OR: [
        { role: { name: 'Owner' } },
        // A founder under the proof rule (2026-11-12) holds the Admin seat
        // until both proofs stand; the firm is still theirs.
        { role: { name: 'Admin' }, company: { ownerProofRequiredAt: { not: null }, ownerVerifiedAt: null } },
      ],
    },
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
      return { ok: true, says: toldWhere(email) }
    }
    if (firmMade(existing)) {
      await sendVerify(existing, pending, firmAddedYou(await firmThatAdded(existing.id)))
      return { ok: true, says: toldWhere(email) }
    }
    await tellAlreadyHere(existing)
    return { ok: true, says: toldWhere(email) }
  }
  // New, or a sign-up nobody confirmed yet: either way a fresh link goes,
  // and only the newest link works.
  const person = existing ?? (await prisma.person.create({
    data: { primaryEmail: email, name: name || email.split('@')[0] },
    select: { id: true, primaryEmail: true },
  }))
  await sendVerify(person, pending)
  return { ok: true, says: toldWhere(email) }
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

/**
 * The one company a work email joins by signing up: the company that has
 * verified the email's domain and lets people join through it, read by the
 * same rule as the Microsoft and Google doors (`decideEntry`). Never a
 * personal domain, never Etyme's own, never a seeded company, and never a
 * company read off its owners' addresses: a company with no verified domain
 * is joined by invitation only, as every screen says (coordinator's ruling,
 * 2026-11-12, on Tapin: an @etyme.com sign-up had been seated there).
 */
export async function colleagueCompany(rawEmail: unknown): Promise<{ id: string; slug: string; name: string } | null> {
  const email = cleanEmail(rawEmail)
  if (!looksLikeEmail(email) || demoEmail(email)) return null
  const domain = domainOfEmail(email)
  if (!domain || isConsumerDomain(domain) || isPlatformDomain(domain)) return null
  const entry = decideEntry(email, await claims())
  if (entry.action !== 'JOIN' && entry.action !== 'REQUEST') return null
  const c = await prisma.company.findUnique({ where: { id: entry.companyId }, select: { id: true, slug: true, name: true, isDemo: true } })
  return c && !c.isDemo ? { id: c.id, slug: c.slug, name: c.name } : null
}

/**
 * What the sign-up says when the Etyme address typed is a company's
 * already. The same sentence whoever types it, so it never says whether
 * the person's own domain matches anybody at that company.
 */
export function addressTakenSays(address: string): string {
  return `${address}.etyme.com is already taken. To join a company already on Etyme, ask its Owner or Admin for an invitation; to start your own, choose another address.`
}

/** What a confirmed sign-up says where it once would have joined a company with no verified domain. */
export const ASK_FOR_AN_INVITATION = 'Your email is confirmed. To join a company already on Etyme, ask its Owner or Admin for an invitation.'

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
    select: { token: true, email: true, state: true, company: { select: { id: true, name: true, claimedAt: true } } },
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
  const policy = await policyRefusal(email, 'PASSWORD')
  if (policy) return policy
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
    const shut = await policyRefusal(email, 'DOMAIN_JOIN', colleague.id)
    if (shut) return shut
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

  // The address is a company's already. Nobody joins a company by typing
  // its Etyme address: a company with a verified domain is joined by that
  // domain (above), and every other company by invitation only. One
  // sentence for everybody, so it says nothing about who the person is.
  if (held.companies.has(raw)) return refuse(addressTakenSays(raw), 'address')
  const taken = new Set([...held.companies.keys(), ...held.pending])
  const verdict = checkAddress(raw, taken, name)
  if (!verdict.ok) return refuse(verdict.says, 'address')

  return begin(email, personName, {
    kind: 'COMPANY',
    passwordHash: await hashPassword(password),
    personName, name, type: type.key, country, currency, address: raw,
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
  const policy = await policyRefusal(email, 'PASSWORD')
  if (policy) return policy
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
  const policy = (await policyRefusal(email, 'PASSWORD')) ?? (await policyRefusal(email, 'CLAIM_LINK', invite.company.id))
  if (policy) return policy
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
  const policy = await policyRefusal(email, 'PASSWORD')
  if (policy) return policy
  const person = await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true, primaryEmail: true, emailVerifiedAt: true } })
  if (person && !person.emailVerifiedAt) {
    // The newest sign-up's answers travel with the new link.
    const last = await prisma.emailToken.findFirst({
      where: { personId: person.id, purpose: 'VERIFY', usedAt: null },
      orderBy: { createdAt: 'desc' }, select: { payload: true },
    })
    if (last?.payload) await sendVerify(person, last.payload as unknown as Pending)
  }
  return { ok: true, says: toldWhere(email) }
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
  // Before the link is spent or anybody seated: a directory-only company's
  // address is not let in by a link either.
  const shut = await policyRefusal(row!.person.primaryEmail, 'VERIFY_TOKEN')
  if (shut && !shut.ok) return { ok: false, says: shut.says }

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
      // Never the company's own name for a person founding it: the name
      // part of the address stands in (lib/company-seats).
      ...(pending.personName ? { name: personNameFor(pending.personName, person.primaryEmail, pending.kind === 'COMPANY' && !pending.joinCompanyId ? pending.name : null) }
        : pending.kind === 'CANDIDATE' && pending.name ? { name: pending.name } : {}),
    },
  })
  const named = { ...person, name: pending.personName ? personNameFor(pending.personName, person.primaryEmail, pending.kind === 'COMPANY' && !pending.joinCompanyId ? pending.name : null) : person.name }

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
    // Where every other door lands this seat (lib/nav-table, landingFor):
    // a candidate's menu has her own work, so Ask Etyme is pinned on it
    // and its greeting is her week. Her own pages are one click behind it.
    return {
      ok: true, personId: person.id, email: person.primaryEmail,
      landing: landingFor({ kind: null, isConsultant: true }),
      says: 'Your email is confirmed. Ask Etyme opens on your own work.',
    }
  }

  // A colleague of a company that verified their email's domain. Read
  // again on the day the link is pressed: a link sent before the door
  // closed, or before a domain was unverified, joins nobody by an address.
  if (pending.joinCompanyId) {
    const c = await colleagueCompany(person.primaryEmail)
    if (c && c.id === pending.joinCompanyId) return joinAsMember(named, c, `Verified email on a domain ${c.name} owns`)
    return { ok: true, personId: person.id, email: person.primaryEmail, landing: '/start', says: ASK_FOR_AN_INVITATION }
  }

  // The email domain is already a verified tenant: one tenant is one domain.
  // Etyme's own domain is nobody's tenant, so a sign-up on it is made by
  // its Etyme address alone and never asks whose domain it is (Tapin).
  if (isPlatformDomain(domainOfEmail(person.primaryEmail))) return makeCompany(named, pending)
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
  // An invite-only company admits nobody by domain (lib/identity).
  const shut = await policyRefusal(person.primaryEmail, 'DOMAIN_JOIN', company.id)
  if (shut && !shut.ok) {
    return { ok: true, personId: person.id, email: person.primaryEmail, landing: '/start', says: `Your email is confirmed. ${shut.says}` }
  }
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
    // The first person is an Admin; Owner is earned by proof (2026-11-12).
    ownerProofRequired: true,
    claimDomain: false,
    startsSetup: true,
  })
  // Where each answer came from, so the checklist says "From your work
  // email's domain" over a guess and "Typed by" only over what was typed.
  await recordAnswers(made.company.id, person.id, signUpAnswers({
    email: person.primaryEmail, name: made.company.name, country: made.country, currency: made.currency, address: slug,
  }))

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
  | { ok: false; code: 'NO_MATCH' | 'WAIT' | 'UNVERIFIED' | 'DEMO' | 'DIRECTORY_ONLY'; says: string }

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

  // A directory-only company's address never signs in with a password.
  const shut = looksLikeEmail(email) ? await policyRefusal(email, 'PASSWORD') : null
  if (shut && !shut.ok) return { ok: false, code: 'DIRECTORY_ONLY', says: shut.says }

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
  if (!mailLeaves()) return refuse(RESET_SHUT, undefined, 503)
  if (!looksLikeEmail(email)) return refuse('Type your email.', 'email')
  const demo = demoRefusal(email)
  if (demo) return demo
  const policy = await policyRefusal(email, 'PASSWORD')
  if (policy) return policy
  const person = await standing(email)
  if (person && isAccount(person)) {
    await sendReset(person, 'You asked to set a new Etyme password.')
  } else if (person) {
    // Signed up and never confirmed: the confirming link is what they need.
    await resendVerification(email)
  }
  return { ok: true, says: resetAskedSays(email) }
}

/**
 * What "Forgot your password" answers, whatever happened. The same for an
 * address with an account and one without, so it says nothing about which;
 * and it never claims the email went, because the provider may refuse it
 * after this answer is written (the founder's 2026-11-12 day: Resend refused
 * every send). A refused send is kept on the notice and staff are alerted
 * by the one send; the person is told where to turn if nothing comes.
 */
export function resetAskedSays(email: string): string {
  return `If there is an account for ${email}, a link is on its way. It works for ${RESET_HOURS} hour. If nothing arrives in a few minutes, check your spam folder, then write to support@etyme.com.`
}

export async function resetPassword(token: unknown, password: unknown, now: Date = new Date()): Promise<Answer & { email?: string; invitation?: boolean }> {
  const row = await prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(String(token ?? '')) },
    include: { person: { select: { id: true, primaryEmail: true, emailVerifiedAt: true } } },
  })
  const usable = tokenUsable(row && row.purpose === 'RESET' ? asLink(row) : null, 'RESET', now)
  if (!usable.ok) return refuse(usable.says, 'token', 410)
  if (demoEmail(row!.person.primaryEmail)) return refuse(DEMO_REFUSAL, 'token', 403)
  const policy = await policyRefusal(row!.person.primaryEmail, 'PASSWORD')
  if (policy) return policy

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
  // An invitation's link: she has just proved the mailbox and chosen the
  // password, so the page signs her in with it rather than asking again.
  const invitation = (row!.payload as { invitation?: boolean } | null)?.invitation === true
  return invitation
    ? { ok: true, says: 'Your password is set. Signing you in.', email: row!.person.primaryEmail, invitation: true }
    : { ok: true, says: 'Your password is set. Sign in with it now.', email: row!.person.primaryEmail }
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

// ── Set a password while signed in (fault 5, 2026-11-12) ──────────────

/**
 * A signed-in person sets a password of their own, or changes it, from
 * the account menu, with no email. Built because the only other way to a
 * password was Forgot your password, which needs mail that was failing,
 * so a person seated by the staff tool and signed in with Google had no
 * credential of Etyme's own to fall back on.
 *
 *  - A first password needs a sign-in in the last fifteen minutes, read
 *    from when the session was signed in (lib/auth `authAt`), so an idle
 *    stolen session cannot plant one. It does not end other sessions: it
 *    adds no way in that the session did not already hold.
 *  - Changing a password needs the current one, slowed after wrong tries
 *    like the sign-in door, and ends every other session the person holds
 *    by raising their session version; this session is carried over by a
 *    sealed ticket the jwt callback checks (`versionAfterOwnChange`).
 *  - Never at a directory-only company's address (the same policy check
 *    the door uses, the refusal's row written first), never for a demo
 *    address, never a weak password.
 *  - The email is marked confirmed only where the session came through
 *    Google or Microsoft, which vouched for it at sign-in (lib/auth
 *    `oauthRefusal`).
 *  - The row is written before the answer, the person is told in the app
 *    and by email where email leaves, and the password is never logged.
 *
 * A password never opens a seat at a directory-only company even when a
 * person holds one there on another address: the seat check reads the
 * door the session came through on every request (`seatRefusal`).
 */

/** How recent a sign-in a first password needs. */
export const FIRST_PASSWORD_MINUTES = 15

export const SIGN_IN_AGAIN_TO_SET = 'Sign in again to set a password.'
export const NOT_YOUR_CURRENT = 'That is not your current password.'
export const PASSWORD_SET_SAYS = 'Your password is set. You can sign in with your email and this password.'
export const PASSWORD_CHANGED_SAYS = 'Your password is changed. Every other place you were signed in is signed out.'

/** What the account menu and the page read about the person's own password. */
export interface OwnPasswordState {
  hasPassword: boolean
  /** False where the address's company signs in through its directory only, or the address is the demo world's. */
  allowed: boolean
  says: string | null
}

/**
 * Whether this person may set a password, and whether they have one. Reads
 * the policy without writing a refusal row: nothing was asked for yet.
 */
export async function ownPasswordState(rawEmail: unknown): Promise<OwnPasswordState> {
  const email = cleanEmail(rawEmail)
  if (!looksLikeEmail(email)) return { hasPassword: false, allowed: false, says: SIGN_IN_AGAIN_TO_SET }
  if (demoEmail(email)) return { hasPassword: false, allowed: false, says: DEMO_REFUSAL }
  const { policyFacts } = await import('@/lib/identity/read')
  const { decideDoor } = await import('@/lib/identity/policy')
  const facts = await policyFacts(email, null)
  const v = decideDoor({ door: 'PASSWORD', email, domainCompany: facts.domainCompany, target: null, issuer: null, publicAddress: facts.publicAddress })
  const person = await prisma.person.findUnique({ where: { primaryEmail: email }, select: { passwordHash: true } })
  return { hasPassword: Boolean(person?.passwordHash), allowed: v.allowed, says: v.allowed ? null : v.says }
}

export interface OwnPasswordAsk {
  /** The session's own address, read from the session on the server, never from the body. */
  email: unknown
  /** The door the session came through. */
  door: Door | null | undefined
  /** When the session was signed in, in milliseconds. */
  authAt: unknown
  /** The session's version, so the ticket that carries this session over names it. */
  sessionVersion: unknown
  current?: unknown
  password: unknown
}

export type OwnPasswordAnswer =
  | { ok: true; says: string; changed: boolean; refresh: string | null }
  | { ok: false; status: number; field?: string; says: string }

/** The doors that vouched for the address at sign-in. */
const PROVIDER_VOUCHED: ReadonlySet<string> = new Set(['GOOGLE_SOCIAL', 'MICROSOFT_SOCIAL'])

export async function setOwnPassword(ask: OwnPasswordAsk, now: Date = new Date()): Promise<OwnPasswordAnswer> {
  const email = cleanEmail(ask.email)
  if (!looksLikeEmail(email)) return { ok: false, status: 401, says: SIGN_IN_AGAIN_TO_SET }
  const demo = demoRefusal(email)
  if (demo && !demo.ok) return demo
  // A directory-only company's address never holds a password. The
  // refusal's row is written before this returns (lib/identity).
  const shut = await policyRefusal(email, 'PASSWORD')
  if (shut && !shut.ok) return shut

  const person = await prisma.person.findUnique({
    where: { primaryEmail: email },
    select: { id: true, name: true, passwordHash: true, emailVerifiedAt: true, sessionVersion: true },
  })
  if (!person) return { ok: false, status: 401, says: SIGN_IN_AGAIN_TO_SET }

  const pw = String(ask.password ?? '')
  const weak = weakPasswordReason(pw, { email })
  if (weak) return { ok: false, status: 422, field: 'password', says: weak }

  const changing = person.passwordHash !== null
  if (changing) {
    // Wrong current passwords are counted against this person's address,
    // the same counter the sign-in door reads.
    const wait = secondsToWait(await failuresFor(email, null, now), now)
    if (wait > 0) return { ok: false, status: 429, field: 'current', says: waitSentence(wait) }
    if (!(await passwordMatches(person.passwordHash, String(ask.current ?? '')))) {
      await prisma.signInFailure.create({ data: { email, ip: null, at: now, personId: person.id } })
      const after = secondsToWait(await failuresFor(email, null, now), now)
      return { ok: false, status: 422, field: 'current', says: after > 0 ? `${NOT_YOUR_CURRENT} ${waitSentence(after)}` : NOT_YOUR_CURRENT }
    }
  } else {
    const at = Number(ask.authAt)
    if (!Number.isFinite(at) || now.getTime() - at > FIRST_PASSWORD_MINUTES * 60_000 || at > now.getTime() + 60_000) {
      return { ok: false, status: 403, says: SIGN_IN_AGAIN_TO_SET }
    }
  }

  const { policyFacts } = await import('@/lib/identity/read')
  const { effectiveMode } = await import('@/lib/identity/policy')
  const { recordIdentityEvent } = await import('@/lib/identity/ledger')
  const policy = effectiveMode((await policyFacts(email, null)).domainCompany)
  const vouched = PROVIDER_VOUCHED.has(String(ask.door ?? ''))
  const hash = await hashPassword(pw)

  const written = await prisma.$transaction(async (tx) => {
    const p = await tx.person.update({
      where: { id: person.id },
      data: {
        passwordHash: hash,
        ...(vouched && !person.emailVerifiedAt ? { emailVerifiedAt: now } : {}),
        // A change ends every other session; a first password ends none.
        ...(changing ? { sessionVersion: { increment: 1 }, sessionsEndedAt: now, sessionsEndedById: person.id } : {}),
      },
      select: { sessionVersion: true },
    })
    await recordIdentityEvent({
      event: 'PASSWORD_SET',
      companyId: null,
      actorPersonId: person.id,
      subject: { personId: person.id },
      policy,
      surface: 'WEB',
      says: changing
        ? `${person.name} changed their own password while signed in; every other session they held is ended.`
        : `${person.name} set a password of their own while signed in${vouched ? ', on an address their sign-in provider confirmed' : ''}.`,
    }, tx)
    return p
  })
  await prisma.signInFailure.deleteMany({ where: { email } })

  // Told in the app, and by email where email leaves (lib/identity/password-notice).
  const { tellPasswordSet } = await import('@/lib/identity/password-notice')
  await tellPasswordSet(person.id, changing, now)

  const fromSv = Number(ask.sessionVersion ?? 0)
  return {
    ok: true,
    changed: changing,
    says: changing ? PASSWORD_CHANGED_SAYS : PASSWORD_SET_SAYS,
    refresh: changing ? refreshTicket({ email, authAt: Number(ask.authAt), fromSv: Number.isFinite(fromSv) ? fromSv : 0, toSv: written.sessionVersion }, now) : null,
  }
}

// ── Carrying this session over a change (the jwt update trigger) ──────

const REFRESH_LABEL = 'own-password-refresh'
/** How long the browser has to carry this session over a change it just made. */
export const REFRESH_SECONDS = 120

/**
 * A sealed ticket naming this session (its address, when it was signed
 * in and the version it held) and the version the change raised it to.
 * Handed back to the browser that changed the password, which hands it to
 * NextAuth's update at once; it opens nothing else and dies in two minutes.
 */
export function refreshTicket(t: { email: string; authAt: number; fromSv: number; toSv: number }, now: Date = new Date()): string | null {
  const own = deploymentSecret()
  return own ? sealBlob({ e: t.email, a: t.authAt, f: t.fromSv, t: t.toSv }, REFRESH_LABEL, REFRESH_SECONDS, own, now.getTime()) : null
}

/**
 * The version a session may carry after its own person changed their
 * password from it, or null. The ticket must name this session exactly,
 * and the version is read again here on the server and must still be the
 * one the change wrote, so a sign-out everywhere after the change is never
 * undone. Never takes a version from the browser.
 */
export async function versionAfterOwnChange(
  token: { email?: unknown; authAt?: unknown; sv?: unknown },
  ticket: unknown,
  now: Date = new Date(),
): Promise<number | null> {
  const own = deploymentSecret()
  if (!own || typeof ticket !== 'string') return null
  const v = openBlob<{ e: string; a: number; f: number; t: number }>(ticket, REFRESH_LABEL, own, now.getTime())
  if (!v) return null
  const email = cleanEmail(token.email)
  if (v.e !== email || v.a !== Number(token.authAt) || v.f !== Number(token.sv ?? 0)) return null
  const { sessionVersionOf } = await import('@/lib/identity/read')
  const current = await sessionVersionOf(email)
  return current === v.t ? current : null
}
