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
import { emit } from '@/lib/events'
import { emailSender } from '@/lib/senders'
import { baseUrl } from '@/lib/signed-link'
import { createCompany } from '@/lib/company-create'
import { typeByKey } from '@/lib/onboarding'
import { decideEntry, domainOfEmail, isConsumerDomain, type ClaimedDomain } from '@/lib/company-domains'
import { knownCountry, knownCurrency } from '@/lib/setup-steps'
import { seatAsMember } from '@/lib/seat-member'
import { MEMBER_ROLE } from '@/lib/company-defaults'
import {
  weakPasswordReason, hashPassword, passwordMatches, newToken, hashToken, expiresAfter, tokenUsable,
  secondsToWait, waitSentence, checkAddress, numberedAddress, cleanEmail, looksLikeEmail,
  NO_MATCH, UNVERIFIED_CODE, unverifiedSentence, checkYourEmail, VERIFY_HOURS, RESET_HOURS,
} from '@/lib/password'

// ── What a sign-up waits on ───────────────────────────────────────────

/** Held on the VERIFY link until it is clicked. Never read by anything else. */
interface Pending {
  kind: 'COMPANY' | 'CANDIDATE'
  passwordHash: string
  name?: string
  type?: string
  country?: string
  currency?: string
  address?: string
  /** Set when the address belongs to the company of somebody on the same email domain. */
  joinCompanyId?: string
}

export type Answer =
  | { ok: true; says: string }
  | { ok: false; status: number; field?: string; says: string }

const refuse = (says: string, field?: string, status = 422): Answer => ({ ok: false, status, field, says })

/** Whether the door can work at all here: without a sender nobody can prove a mailbox. */
export function doorOpen(): boolean {
  return emailSender() !== null
}

export const DOOR_SHUT =
  'Sign-up with a password is off on this deployment, because it cannot send the email that confirms your address.'

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
  await prisma.notification.create({
    data: {
      personId, companyId: null, type: 'SYSTEM', channel: 'EMAIL',
      title: subject, body: recorded,
      deliveryState: state, deliveryNote: note, deliveredAt: state === 'SENT' ? new Date() : null,
    },
  })
  return state === 'SENT'
}

function link(path: string): string {
  return `${baseUrl()}${path}`
}

async function sendVerify(person: { id: string; primaryEmail: string }, pending: Pending): Promise<void> {
  const { token, tokenHash } = newToken()
  await prisma.emailToken.create({
    data: {
      personId: person.id, purpose: 'VERIFY', tokenHash,
      expiresAt: expiresAfter(VERIFY_HOURS), payload: pending as any,
    },
  })
  await mail(
    person.id, person.primaryEmail, 'Confirm your email for Etyme',
    [
      'Click the link to confirm your email and finish signing up.',
      `It works once, for ${VERIFY_HOURS} hours.`,
      'If you did not sign up for Etyme, ignore this email. Nothing is created until the link is clicked.',
    ],
    link(`/verify/${token}`),
  )
}

async function sendReset(person: { id: string; primaryEmail: string }, opening: string): Promise<void> {
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

/** Somebody already holds this account: whoever owns the mailbox is told, and the stranger learns nothing. */
async function tellAlreadyHere(person: { id: string; primaryEmail: string }): Promise<void> {
  await sendReset(person, 'Somebody tried to sign up for Etyme with this email. You already have an account. Sign in, or set a password with the link below.')
}

// ── Sign-up ───────────────────────────────────────────────────────────

/** What a person has that makes them an account rather than a pending sign-up. */
async function standing(email: string) {
  return prisma.person.findUnique({
    where: { primaryEmail: email },
    select: {
      id: true, primaryEmail: true, passwordHash: true, emailVerifiedAt: true,
      contexts: { where: { revokedAt: null }, select: { id: true }, take: 1 },
    },
  })
}

type Standing = NonNullable<Awaited<ReturnType<typeof standing>>>
const isAccount = (p: Standing) => p.emailVerifiedAt !== null || p.passwordHash !== null || p.contexts.length > 0

async function begin(email: string, name: string, pending: Pending): Promise<Answer> {
  const existing = await standing(email)
  if (existing && isAccount(existing)) {
    await tellAlreadyHere(existing)
    return { ok: true, says: checkYourEmail(email) }
  }
  // New, or a sign-up nobody confirmed yet: either way a fresh link goes,
  // and the earlier one still works until its day is up.
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

export interface CompanySignUp {
  email: unknown
  password: unknown
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
  const domain = domainOfEmail(email)
  if (!domain || isConsumerDomain(domain)) {
    return refuse(`Use your work email. A personal address like ${domain ?? 'that'} cannot stand for a company. To sign up as yourself, choose "A candidate".`, 'email')
  }

  const name = String(input.name ?? '').trim()
  if (!name) return refuse('Type the company name.', 'name')
  const type = typeByKey(String(input.type ?? ''))
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
    if (!(await ownerDomains(holder)).has(domain)) {
      return refuse(`${raw}.etyme.com is already somebody else's. Choose another, or ask that company to invite you.`, 'address')
    }
    joinCompanyId = holder
  } else {
    const taken = new Set([...held.companies.keys(), ...held.pending])
    const verdict = checkAddress(raw, taken)
    if (!verdict.ok) return refuse(verdict.says, 'address')
  }

  return begin(email, '', {
    kind: 'COMPANY',
    passwordHash: await hashPassword(password),
    name, type: type.key, country, currency, address: raw,
    ...(joinCompanyId ? { joinCompanyId } : {}),
  })
}

export async function signUpCandidate(input: { email: unknown; password: unknown; name?: unknown }): Promise<Answer> {
  if (!doorOpen()) return refuse(DOOR_SHUT, undefined, 503)
  const email = cleanEmail(input.email)
  if (!looksLikeEmail(email)) return refuse('Type your email.', 'email')
  const password = String(input.password ?? '')
  const weak = weakPasswordReason(password, { email })
  if (weak) return refuse(weak, 'password')
  const name = String(input.name ?? '').trim()
  return begin(email, name, { kind: 'CANDIDATE', passwordHash: await hashPassword(password), ...(name ? { name } : {}) })
}

/** "Send the link again", from the sign-in page. Same answer whoever asks. */
export async function resendVerification(rawEmail: unknown): Promise<Answer> {
  const email = cleanEmail(rawEmail)
  if (!looksLikeEmail(email)) return refuse('Type your email.', 'email')
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
  | { ok: false; says: string }

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
    include: { person: { select: { id: true, name: true, primaryEmail: true, emailVerifiedAt: true } } },
  })
  const usable = tokenUsable(row && row.purpose === 'VERIFY' ? row : null, 'VERIFY', now)
  if (!usable.ok) return { ok: false, says: usable.says }

  // Spent first, and only if nobody else spent it in the same instant.
  const spent = await prisma.emailToken.updateMany({ where: { id: row!.id, usedAt: null }, data: { usedAt: now } })
  if (spent.count === 0) return { ok: false, says: 'This link was already used. Sign up again with the same email and we send a new one.' }
  await prisma.emailToken.updateMany({ where: { personId: row!.personId, purpose: 'VERIFY', usedAt: null }, data: { usedAt: now } })

  const person = row!.person
  const pending = row!.payload as unknown as Pending
  await prisma.person.update({
    where: { id: person.id },
    data: {
      emailVerifiedAt: person.emailVerifiedAt ?? now,
      passwordHash: pending.passwordHash,
      ...(pending.kind === 'CANDIDATE' && pending.name ? { name: pending.name } : {}),
    },
  })

  const already = await prisma.context.findFirst({ where: { personId: person.id, revokedAt: null }, select: { id: true } })
  if (already) {
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
    if (c) return joinAsMember(person, c, `Signed up with ${pending.address}.etyme.com from the owner's email domain`)
  }

  // The email domain is already a verified tenant: one tenant is one domain.
  const entry = decideEntry(person.primaryEmail, await claims())
  if (entry.action === 'JOIN' || entry.action === 'REQUEST') {
    return joinAsMember(person, { id: entry.companyId, name: entry.companyName }, `Verified email on ${entry.domain}, which this company owns`)
  }
  if (entry.action === 'REFUSE') {
    return { ok: true, personId: person.id, email: person.primaryEmail, landing: '/start', says: entry.message }
  }

  return makeCompany(person, pending)
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
    ok: true, personId: person.id, email: person.primaryEmail, landing: '/start',
    says: `You are in ${company.name} as ${MEMBER_ROLE}. You can see your own work now. An owner there gives you a desk.`,
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
      summary: `${made.company.name} joined Etyme as ${type.label.toLowerCase()}`,
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
  | { ok: false; code: 'NO_MATCH' | 'WAIT' | 'UNVERIFIED'; says: string }

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
  if (!looksLikeEmail(email)) return refuse('Type your email.', 'email')
  if (!doorOpen()) return refuse(DOOR_SHUT.replace('Sign-up', 'Resetting a password'), undefined, 503)
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
  const usable = tokenUsable(row && row.purpose === 'RESET' ? row : null, 'RESET', now)
  if (!usable.ok) return refuse(usable.says, 'token', 410)

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
