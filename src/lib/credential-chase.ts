/**
 * Asking a person for the renewal of the license they practice on.
 *
 * The nightly watcher has reopened a supplier's annual refresh packet
 * since insurance was built: a certificate inside sixty days of lapsing
 * is asked for before anybody notices. A person's license is the same
 * problem with a different owner — the board issues it to the person,
 * the person renews it, and the day it lapses is the day the work stops
 * because `licenseGate` refuses the start.
 *
 * Until today the chase stopped at the person: `reopenFor` in
 * `api/cron/watch` returned early on any verification with a `personId`,
 * on the reasoning that a person's documents belong to a conversation
 * somebody is already having. Nobody was having it. Colleen Byrne's seat
 * said her renewal had been asked for only because `seed-doors` wrote
 * the ask by hand — a prop beside the product rather than the product.
 *
 * So this is the person-side twin of that path, and deliberately the
 * same shape: look, then act, then let the watcher tell whoever can do
 * something. The arithmetic is not here — `credentialsToChase` in
 * `lib/document-stages` decides whether it is time to ask and what the
 * ask says, and it is regulation's. This decides three things that need
 * a database: which rows count as a license at this company, which firm
 * does the chasing, and what the ask becomes.
 *
 * It lives beside `lib/cover-gap` and for the same reason written there:
 * the chase's own plumbing belongs with the chase; the standing of a
 * single document stays with regulation.
 */

import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { credentialsToChase, type CredentialChase, type HeldCredential } from '@/lib/document-stages'
import { credentialKeys, credentialDetail } from '@/lib/contract-clearance'
import { labelFor } from '@/lib/document-type'
import { packetByKey } from '@/lib/packets'
import type { Finding } from '@/lib/watch'

/** The packet the ask is made with. Regulation wrote it; this raises it. */
export const CREDENTIAL_PACKET_KEY = 'CREDENTIAL_RENEWAL'

/** How long the link stays alive. A board takes weeks; so does this. */
const LINK_DAYS = 45

/**
 * A status that means somebody actually produced the document. EXPIRED is
 * in here on purpose: a lapsed license is still a license, and it is the
 * one most worth asking about.
 */
const PRODUCED = ['CLEAR', 'CONDITIONAL', 'EXPIRED']

/** What the desk that hears about it must be able to do about it. */
export const CREDENTIAL_FINDING_NEEDS = 'consultants.write'

/** The kinds this raises, so the watcher can route them without guessing. */
export const CREDENTIAL_KINDS = [
  'CREDENTIAL_EXPIRED',
  'CREDENTIAL_EXPIRING',
  'CREDENTIAL_UNDATED',
] as const

type CredentialRow = {
  id: string
  personId: string | null
  type: string
  status: string
  issuedAt: Date | null
  validFrom: Date | null
  expiresAt: Date | null
  verifiedAt: Date | null
  provider: string | null
  result: unknown
  documentType: { key: string; purpose: string; blocks: boolean; suppliedBy: string | null; label: string } | null
  person: { id: string; name: string; primaryEmail: string } | null
}

const SELECT = {
  id: true,
  personId: true,
  type: true,
  status: true,
  issuedAt: true,
  validFrom: true,
  expiresAt: true,
  verifiedAt: true,
  provider: true,
  // The number and the state, which are the two things a renewal page
  // asks for and the two a refusal has to name.
  result: true,
  documentType: { select: { key: true, purpose: true, blocks: true, suppliedBy: true, label: true } },
  person: { select: { id: true, name: true, primaryEmail: true } },
} as const

/**
 * Whether this company treats the row as a license to practice.
 *
 * The shipped answer is `credentialKeys()` — PROFESSIONAL_LICENSE and
 * nothing else. A client that defines its own blocking credential in its
 * dictionary gets the same treatment on the day it defines it, which is
 * the same rule `contractClearance` reads and is why the dictionary row
 * is asked rather than a list in code.
 */
export function isCredential(row: {
  type: string
  documentType?: { purpose: string; blocks: boolean; suppliedBy: string | null } | null
}): boolean {
  if (credentialKeys().includes(row.type)) return true
  const t = row.documentType
  return !!t && t.purpose === 'COMPLIANCE' && t.blocks && t.suppliedBy === 'CANDIDATE'
}

function heldFrom(rows: CredentialRow[]): HeldCredential[] {
  return rows.map((row): HeldCredential => {
    const detail = credentialDetail(row as any)
    return {
      type: row.type,
      label: row.documentType?.label ?? labelFor(row.type),
      status: row.status,
      issuedAt: row.issuedAt,
      validFrom: row.validFrom,
      expiresAt: row.expiresAt,
      verifiedAt: row.verifiedAt,
      number: detail.number,
      state: detail.state,
      issuer: row.provider,
    }
  })
}

/**
 * The firm that chases a person's license.
 *
 * Whoever is placing them today, because they are the ones a lapse
 * stops — the same rule the insurance chase uses one rung up, where the
 * company that buys from a supplier is the one that asks for its cover.
 * Failing that, the firm whose bench they sit on. A person nobody places
 * and nobody carries is left alone: there is no relationship to chase
 * through, and inventing one would mean a firm emailing a stranger.
 */
async function whoChases(personId: string): Promise<{ id: string; name: string } | null> {
  const live = await prisma.sellContract.findFirst({
    where: { personId, state: { in: ['IN_PROGRESS', 'PAUSED'] } },
    orderBy: { startDate: 'desc' },
    select: { company: { select: { id: true, name: true } } },
  })
  if (live?.company) return live.company

  const seat = await prisma.context.findFirst({
    where: {
      personId,
      revokedAt: null,
      companyId: { not: null },
      type: { in: ['CONSULTANT', 'EMPLOYEE'] },
    },
    orderBy: { grantedAt: 'desc' },
    select: { company: { select: { id: true, name: true } } },
  })
  return seat?.company ?? null
}

/** Said to the desk, in the third person. `chase.says` is said to the person. */
function detailFor(personName: string, chase: CredentialChase): string {
  const where = chase.state ? ` (${chase.state})` : ''
  if (chase.daysLeft === null) {
    return (
      `${personName}'s ${chase.named}${where} is on file with no expiry date against it, and a license ` +
      `expires. Until the date is recorded nobody can say whether ${personName} is licensed today.`
    )
  }
  if (chase.daysLeft < 0) {
    const ago = Math.abs(chase.daysLeft)
    return (
      `${personName}'s ${chase.named}${where} lapsed ${ago} day${ago === 1 ? '' : 's'} ago. Working on a ` +
      `lapsed license is unlicensed practice, so nobody can be started on it until the board renews it.`
    )
  }
  return (
    `${personName}'s ${chase.named}${where} runs out in ${chase.daysLeft} day${chase.daysLeft === 1 ? '' : 's'}. ` +
    `A board takes weeks, so this is the window where the renewal still lands before the work has to stop.`
  )
}

function kindFor(chase: CredentialChase): (typeof CREDENTIAL_KINDS)[number] {
  if (chase.daysLeft === null) return 'CREDENTIAL_UNDATED'
  return chase.daysLeft < 0 ? 'CREDENTIAL_EXPIRED' : 'CREDENTIAL_EXPIRING'
}

/**
 * One chase, as a finding the watcher can order, digest and route.
 *
 * Pure, so the words a desk reads are tested against a fixed date rather
 * than against whatever the seeded world happens to hold tonight.
 */
export function findingFor(
  person: { id: string; name: string },
  companyId: string,
  chase: CredentialChase
): Finding {
  const days = chase.daysLeft
  return {
    kind: kindFor(chase),
    // A lapsed license already stops work — `licenseGate` refuses the
    // start — so it is blocking in the sense this word is used here.
    // One still in date does not stop anything today, however close it is.
    urgency: days !== null && days < 0 ? 'BLOCKING' : days !== null && days <= 14 ? 'SOON' : 'WORTH_KNOWING',
    companyId,
    // The person rather than the row, because the ask is about them and
    // because a renewal arrives as a new row with a new id.
    subjectType: 'Person',
    subjectId: person.id,
    headline:
      days === null
        ? `${person.name}: ${chase.named} has no expiry date on file`
        : days < 0
          ? `${person.name}: ${chase.named} lapsed ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
          : `${person.name}: ${chase.named} runs out in ${days} day${days === 1 ? '' : 's'}`,
    detail: detailFor(person.name, chase),
    action: 'REOPEN_PACKET',
    daysUntil: days,
  }
}

/**
 * Every person whose license is worth saying something about tonight.
 *
 * Reads; decides nothing about who is told. A finding with no firm
 * behind it is dropped rather than raised against an empty company id —
 * `tell` groups by company and a finding nobody owns reaches nobody,
 * which reads as the watcher working when it is not.
 */
export async function lookAtCredentials(now: Date): Promise<Finding[]> {
  const rows = (await prisma.verification.findMany({
    where: {
      personId: { not: null },
      status: { in: PRODUCED as any },
      OR: [
        { type: { in: credentialKeys() as any } },
        {
          documentType: {
            purpose: 'COMPLIANCE',
            blocks: true,
            suppliedBy: 'CANDIDATE',
            archivedAt: null,
          },
        },
      ],
    },
    select: SELECT,
  })) as unknown as CredentialRow[]

  const byPerson = new Map<string, CredentialRow[]>()
  for (const row of rows) {
    if (!row.personId || !row.person) continue
    if (!isCredential(row)) continue
    byPerson.set(row.personId, [...(byPerson.get(row.personId) ?? []), row])
  }

  const out: Finding[] = []

  for (const [personId, theirs] of byPerson) {
    const person = theirs[0].person!
    const keys = [...new Set(theirs.map((r) => r.type))]
    const chases = credentialsToChase(heldFrom(theirs), keys, now)
    if (chases.length === 0) continue

    const chaser = await whoChases(personId)
    if (!chaser) continue

    for (const chase of chases) out.push(findingFor(person, chaser.id, chase))
  }

  return out
}

export interface AskOutcome {
  /** What was done, where something was. */
  done: string | null
  /** Why it could not be, where it could not. Empty when there was nothing to do. */
  because: string | null
  /** The packet, for a caller that wants to say where the link went. */
  packetId?: string
}

/**
 * Ask the person for the renewal.
 *
 * Idempotent on an open request: two licenses running out in the same
 * week produce two findings and one ask, which is the right number. The
 * items come from the chase rather than from `resolveItems`, because a
 * license on file with no expiry date reads as "held and does not
 * expire" to a packet and is exactly the row worth asking about.
 */
export async function askForRenewal(
  input: { personId: string; askingCompanyId: string },
  now: Date
): Promise<AskOutcome> {
  const spec = packetByKey(CREDENTIAL_PACKET_KEY)
  if (!spec) return { done: null, because: 'no credential renewal packet is defined' }

  const person = await prisma.person.findUnique({
    where: { id: input.personId },
    select: { id: true, name: true, primaryEmail: true },
  })
  if (!person) return { done: null, because: null }

  const already = await prisma.documentPacket.findFirst({
    where: {
      companyId: input.askingCompanyId,
      subjectPersonId: person.id,
      packetKey: spec.key,
      completedAt: null,
      cancelledAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true },
  })
  if (already) return { done: null, because: null }

  const rows = (await prisma.verification.findMany({
    where: { personId: person.id, status: { in: PRODUCED as any } },
    select: SELECT,
  })) as unknown as CredentialRow[]
  const theirs = rows.filter(isCredential)
  if (theirs.length === 0) return { done: null, because: null }

  const chases = credentialsToChase(heldFrom(theirs), [...new Set(theirs.map((r) => r.type))], now)
  if (chases.length === 0) return { done: null, because: null }

  const company = await prisma.company.findUnique({
    where: { id: input.askingCompanyId },
    select: { id: true, name: true },
  })
  if (!company) return { done: null, because: null }

  // Somebody to record as having asked. The desk that looks after
  // contractors' paperwork, not the one that looks after suppliers':
  // a license belongs to the person, and `consultants.write` is what the
  // recruiter, the resource manager and HR all hold.
  const creator = await prisma.context.findFirst({
    where: {
      companyId: company.id,
      revokedAt: null,
      role: { permissions: { hasSome: ['*', CREDENTIAL_FINDING_NEEDS] } },
    },
    select: { personId: true },
  })
  if (!creator) {
    return {
      done: null,
      because: `nobody at ${company.name} looks after contractors' paperwork, so there is nobody to record as having asked`,
    }
  }

  const template = spec.items[0]
  const worst = chases[0]

  const packet = await prisma.documentPacket.create({
    data: {
      companyId: company.id,
      packetKey: spec.key,
      label: spec.label,
      purpose: spec.purpose,
      direction: 'COLLECT',
      subjectPersonId: person.id,
      recipientEmail: person.primaryEmail,
      recipientName: person.name,
      token: randomBytes(32).toString('base64url'),
      expiresAt: new Date(now.getTime() + LINK_DAYS * 86_400_000),
      createdById: creator.personId,
      // The chase's own sentence, which is already written to the person
      // holding the license and already names the board and the state.
      reopenedReason: worst.says,
      items: {
        create: chases.map((chase, position) => ({
          key: chase.key,
          label: chase.named,
          hint: template?.hint ?? null,
          required: true,
          position,
          state: 'PENDING',
        })),
      },
    },
    select: { id: true, token: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId: company.id,
      action: 'PACKET_REOPENED',
      summary: `Asked ${person.name} to renew ${chases.length} license${chases.length === 1 ? '' : 's'} — ${worst.named}`,
      reason: worst.says,
      payload: {
        packetId: packet.id,
        subjectPersonId: person.id,
        asked: chases.map((c) => c.key),
        daysLeft: worst.daysLeft,
        state: worst.state,
      },
      // Cancelling the request undoes this entirely.
      reversible: true,
    },
  })

  void emit({
    type: 'packet.requested',
    companyId: company.id,
    subjectType: 'DocumentPacket',
    subjectId: packet.id,
    // Nobody clicked anything.
    actorKind: 'AUTOMATION',
    payload: {
      reopened: true,
      reason: kindFor(worst),
      subjectPersonId: person.id,
      itemCount: chases.length,
    },
  })

  // The person holding the license is the one who can renew it, so they
  // are told as well as the desk — by email, because a license running
  // out is worth leaving the app for, and with the sentence that names
  // the board rather than a document code.
  void notify({
    personId: person.id,
    companyId: company.id,
    type: 'SYSTEM',
    title:
      worst.daysLeft !== null && worst.daysLeft < 0
        ? `Your ${worst.named} has lapsed`
        : `${company.name} needs your ${worst.named}`,
    body: `${worst.says}\n\nSend it here: /packet/${packet.token}`,
    entityId: packet.id,
    channel: 'EMAIL',
  })

  return {
    done: `Asked ${person.name} to renew ${chases.length} license${chases.length === 1 ? '' : 's'}`,
    because: null,
    packetId: packet.id,
  }
}

/**
 * Look and act in one call, for a caller that is not the watcher.
 *
 * The seeded world uses this so the ask on a nurse's seat is one the
 * product raised rather than one the seed typed. Nothing else should
 * need it: the nightly run wants its findings ordered and digested
 * beside everything else, which is `api/cron/watch`'s job.
 */
export async function chaseCredentials(now: Date): Promise<{
  found: number
  asked: string[]
  couldNotAct: string[]
}> {
  const findings = await lookAtCredentials(now)
  const asked: string[] = []
  const couldNotAct: string[] = []

  for (const f of findings) {
    const outcome = await askForRenewal({ personId: f.subjectId, askingCompanyId: f.companyId }, now)
    if (outcome.done) asked.push(outcome.done)
    else if (outcome.because) couldNotAct.push(`${f.headline} — ${outcome.because}`)
  }

  return { found: findings.length, asked, couldNotAct }
}
