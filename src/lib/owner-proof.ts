/**
 * The first person is an Admin; Owner is earned by proof.
 *
 * The founder, 2026-11-11: "The first user is an admin and not owner.
 * They need to prove domain ownership and personal verification", the way
 * business software that moves money checks a company before it trusts it.
 *
 *  - Whoever signs a company up from 2026-11-12 is seated as Admin. The
 *    company works at once for setup, invitations, jobs and people.
 *  - Owner is earned by two proofs, each recorded with who and when: the
 *    company's **domain** (the DNS proof, or the company's own directory,
 *    set up and signed in through by this person), and the **person** (an
 *    identity-verification provider's result, recorded verbatim with its
 *    name, reference and date; Etyme renders no verdict and keeps no copy
 *    of an identity paper).
 *  - A one-person firm has no domain to prove: its person is its Owner on
 *    the person proof alone.
 *  - Until the company has a verified Owner, the Owner's acts wait, each
 *    refused in one sentence that names the step: paying and bank
 *    details, signing an agreement, the company type, the sign-in mode,
 *    giving access by team or company, and passing ownership.
 *  - **A company formed before this shipped is not gated.** Its Owners
 *    stay Owners and read one skippable checklist item asking for the two
 *    proofs. The cut is a recorded fact on the company,
 *    `ownerProofRequiredAt`, set by the sign-up doors at creation, never a
 *    date written into the code.
 *
 * No identity provider is chosen yet (coordinator's call, reversible in a
 * sentence): a Superadmin records a provider's result for a named person
 * at a named company, logged, and the company's screen says it is waiting.
 */

import { prisma } from '@/lib/db'

type Db = typeof prisma

// ── The acts that wait ───────────────────────────────────────────────

export type GatedAct = 'PAY' | 'BANK' | 'SIGN' | 'COMPANY_TYPE' | 'SIGN_IN_MODE' | 'GIVE_ACCESS' | 'PASS_OWNERSHIP'

/** Each act, said as the start of its refusal. */
export const GATED_ACT_WORDS: Record<GatedAct, string> = {
  PAY: 'Paying a firm',
  BANK: 'Changing bank details',
  SIGN: 'Signing an agreement',
  COMPANY_TYPE: 'Changing the type of company',
  SIGN_IN_MODE: 'Changing how people sign in',
  GIVE_ACCESS: 'Giving access by team or for the whole company',
  PASS_OWNERSHIP: 'Passing ownership',
}

/** Where the step is: the checklist item's own address. */
export const PROVE_OWNERSHIP_HREF = '/dashboard/settings/setup/ownership'
export const PROVE_OWNERSHIP_PLACE = 'Setup → Prove ownership'

export interface GateFacts {
  ownerProofRequiredAt: Date | null
  ownerVerifiedAt: Date | null
}

export type OwnerGate = { ok: true } | { ok: false; says: string; href: string; step: 'OWNERSHIP' }

/** Whether the proof rule applies to this company and is not yet met. */
export function waitsForVerifiedOwner(c: GateFacts): boolean {
  return c.ownerProofRequiredAt !== null && c.ownerVerifiedAt === null
}

/**
 * Pure: may this act go ahead at this company? One sentence that names the
 * step and links to it where it may not. A company formed before the rule
 * (no `ownerProofRequiredAt`) is never refused.
 */
export function needsVerifiedOwner(c: GateFacts & { name?: string | null }, act: GatedAct): OwnerGate {
  if (!waitsForVerifiedOwner(c)) return { ok: true }
  const who = c.name ? `${c.name} has` : 'this company has'
  return {
    ok: false,
    says: `${GATED_ACT_WORDS[act]} waits until ${who} a verified Owner. Prove ownership under ${PROVE_OWNERSHIP_PLACE}.`,
    href: PROVE_OWNERSHIP_HREF,
    step: 'OWNERSHIP',
  }
}

/**
 * The gate, read from the database. Every route that does a gated act
 * calls it before the act and answers its sentence with status 403 and
 * code `OWNER_NOT_VERIFIED`. Money's, contracts' and regulatory's routes
 * call this one function, so they cannot drift apart.
 */
export async function needsVerifiedOwnerAt(companyId: string, act: GatedAct, db: Db = prisma): Promise<OwnerGate> {
  const c = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true, ownerProofRequiredAt: true, ownerVerifiedAt: true },
  })
  if (!c) return { ok: true }
  return needsVerifiedOwner(c, act)
}

/** The refusal body every gated route answers with. */
export function gateRefusal(g: Extract<OwnerGate, { ok: false }>) {
  return { error: { code: 'OWNER_NOT_VERIFIED', message: g.says, href: g.href } }
}

// ── The two proofs ───────────────────────────────────────────────────

export interface ProofFacts {
  kind: string
  /** A domain this company proved by its DNS record, if any. */
  dnsDomain: string | null
  /** This person set up the company's directory and signed in through it. */
  directory: string | null
  /** The provider's confirmed check of this person, if recorded. */
  person: { provider: string; reference: string | null; checkedOn: Date | null; result: string | null } | null
}

export interface ProofStanding {
  needsDomain: boolean
  domain: { done: boolean; says: string }
  person: { done: boolean; says: string }
  /** Both proofs this company needs stand for this person. */
  complete: boolean
}

/** A one-person firm proves the person only; every other kind proves both. */
export function needsDomainProof(kind: string): boolean {
  return kind !== 'CONSULTANT_CORP'
}

export function proofStanding(f: ProofFacts): ProofStanding {
  const needsDomain = needsDomainProof(f.kind)
  const domainDone = !!(f.dnsDomain || f.directory)
  const domain = !needsDomain
    ? { done: true, says: 'A one-person firm has no domain to prove.' }
    : f.dnsDomain
      ? { done: true, says: `${f.dnsDomain} is proved by its DNS record.` }
      : f.directory
        ? { done: true, says: `Proved by your own directory, ${f.directory}, which you set up and signed in through.` }
        : { done: false, says: 'Prove your domain with one DNS record under Setup → Your domain, or set up your company’s directory under Sign-in and sign in through it.' }
  const person = f.person
    ? {
        done: true,
        says: `${f.person.provider} checked you${f.person.checkedOn ? ` on ${f.person.checkedOn.toISOString().slice(0, 10)}` : ''}${f.person.reference ? `, reference ${f.person.reference}` : ''}${f.person.result ? `: “${f.person.result}”` : ''}.`,
      }
    : { done: false, says: 'Waiting for your identity check. Write to support@etyme.com to ask for one; the provider’s result is recorded here as it gives it.' }
  return { needsDomain, domain, person, complete: (domainDone || !needsDomain) && !!f.person }
}

/** This person's two proofs at this company, read off the record. */
export async function proofFactsAt(companyId: string, personId: string, db: Db = prisma): Promise<ProofFacts> {
  const [c, dns, idp, person] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { kind: true } }),
    db.companyDomain.findFirst({ where: { companyId, verifiedAt: { not: null }, verifiedVia: 'DNS_TXT' }, select: { domain: true } }),
    db.identityProvider.findFirst({
      where: {
        companyId, enabled: true, setById: personId,
        // Signed in through it: the directory vouched for this person.
        externalIdentities: { some: { personId, lastSignInAt: { not: null }, disabledAt: null } },
      },
      select: { label: true, issuer: true },
    }),
    db.ownerProof.findFirst({
      where: { companyId, personId, kind: 'PERSON', confirmed: true },
      orderBy: { recordedAt: 'desc' },
      select: { source: true, reference: true, checkedOn: true, result: true },
    }),
  ])
  return {
    kind: c.kind,
    dnsDomain: dns?.domain ?? null,
    directory: idp ? (idp.label ?? idp.issuer) : null,
    person: person ? { provider: person.source, reference: person.reference, checkedOn: person.checkedOn, result: person.result } : null,
  }
}

// ── What the checklist reads ─────────────────────────────────────────

/** The "Prove ownership" item is done once the company has a verified Owner. */
export function ownershipItemDone(c: { ownerVerifiedAt: Date | null }): boolean {
  return c.ownerVerifiedAt !== null
}

/** The line under the item for a company formed before the rule. */
export const NOT_GATED_LINE = 'Your company was formed before this rule, so nothing waits on it. Completing it means a lost sign-in can be recovered by proof.'

// ── Becoming the Owner ───────────────────────────────────────────────

export type BecomeVerdict = { ok: true; reseat: boolean } | { ok: false; says: string }

/**
 * Pure: may this person press "Become Owner" (or, already an Owner,
 * "Record my proofs")? Under the proof rule the Admin holding both proofs
 * becomes the Owner while the company has none; once it has one, a second
 * Owner comes through Pass ownership on Settings → Owners. At a company
 * formed before the rule, an Owner holding both proofs records them, and
 * nobody is reseated.
 */
export function mayBecomeOwner(input: {
  gate: GateFacts
  standing: ProofStanding
  seatRole: string | null
  seatLive: boolean
  liveOwners: number
  companyName: string
}): BecomeVerdict {
  if (!input.seatLive) return { ok: false, says: `You hold no working seat at ${input.companyName}.` }
  if (!input.standing.complete) {
    const missing = [input.standing.needsDomain && !input.standing.domain.done ? 'the domain' : null, !input.standing.person.done ? 'your identity check' : null].filter(Boolean)
    return { ok: false, says: `Both proofs first: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} still to come.` }
  }
  if (input.seatRole === 'Owner') return { ok: true, reseat: false }
  if (input.gate.ownerProofRequiredAt === null) {
    return { ok: false, says: `${input.companyName} already has its Owners. Ask one of them to pass ownership to you from Settings → Owners.` }
  }
  if (input.liveOwners > 0) {
    return { ok: false, says: `${input.companyName} has a verified Owner. Ask them to add you from Settings → Owners.` }
  }
  return { ok: true, reseat: true }
}
