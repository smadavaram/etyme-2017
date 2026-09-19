/**
 * A conversation between two companies about a role or a candidate.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * Demand opens. Supply answers.
 *
 * The 2017 build learned this the hard way: the moment a vendor could
 * message a hiring manager, every vendor did, and the manager stopped
 * reading. So the demand side — whoever the candidates go to — is the
 * only side that can start a thread with a firm on the other side of the
 * deal, and it can only start one with a firm that is actually on the
 * deal: invited to the role, cleared for it by Procurement, or already
 * submitting to it. A supplier answers on the thread the client opened,
 * and hears about it when the client writes. It cannot start one, and
 * the refusal says what to do instead: submit, or answer the invitation.
 *
 * "Demand" is a position on a deal, not a kind of company. A prime that
 * posted a role is demand toward its subs, and a client is demand toward
 * the prime. The same function decides both.
 *
 * ── What is here ─────────────────────────────────────────────────────
 *
 * The decisions, and only the decisions. Who may open a thread, who may
 * read one, who hears when somebody writes, and what the notice says.
 * Loading the facts and writing the rows is the route's job
 * (app/api/conversations); notifying is lib/thread-notices. Everything
 * here runs on plain objects so the sentences in
 * __tests__/invariants/threads.test.ts can be read by the founder.
 */

export type ThreadTopic = 'REQUIREMENT' | 'SUBMISSION'

/** A role, as much of it as the rule needs. */
export interface RoleFacts {
  kind: 'REQUIREMENT'
  id: string
  title: string
  /** Who the candidates go to — the payer where one is named, else the company that wrote it. */
  demandCompanyId: string
  /** Every firm on the deal: invited, cleared, or already submitting. */
  supplierIds: string[]
}

/** A candidate put forward, as much as the rule needs. */
export interface CandidateFacts {
  kind: 'SUBMISSION'
  id: string
  roleTitle: string
  candidateName: string
  toCompanyId: string
  fromCompanyId: string
  fromCompanyName: string
}

export type TopicFacts = RoleFacts | CandidateFacts

export interface Firm {
  id: string
  name: string
}

export type OpenVerdict =
  | { ok: true; title: string }
  | {
      ok: false
      code: 'SAME_SIDE' | 'SUPPLY_ANSWERS' | 'NOT_ON_THE_ROLE' | 'NOT_YOURS'
      message: string
    }

/**
 * May `caller` open a thread with `other` about this?
 *
 * Every refusal is a sentence somebody can act on. The codes are for the
 * machine and the tests.
 */
export function whoMayOpen(facts: TopicFacts, caller: Firm, other: Firm): OpenVerdict {
  if (other.id === caller.id) {
    return {
      ok: false,
      code: 'SAME_SIDE',
      message: 'A conversation with your own people is a note. Post it in Discussion, where no supplier reads it.',
    }
  }

  if (facts.kind === 'REQUIREMENT') {
    const isDemand = caller.id === facts.demandCompanyId
    if (!isDemand) {
      if (facts.supplierIds.includes(caller.id)) {
        return {
          ok: false,
          code: 'SUPPLY_ANSWERS',
          message:
            `${other.name} opens the conversation on ${facts.title}; ${caller.name} answers it. ` +
            'Submit a candidate, or answer the invitation, and they hear from you that way.',
        }
      }
      return { ok: false, code: 'NOT_YOURS', message: `${facts.title} is not yours to speak for.` }
    }
    if (!facts.supplierIds.includes(other.id)) {
      return {
        ok: false,
        code: 'NOT_ON_THE_ROLE',
        message:
          `${other.name} has not been asked to work ${facts.title}. ` +
          'Invite them and the conversation opens with the invitation.',
      }
    }
    return { ok: true, title: facts.title }
  }

  // A candidate. The firm that received them speaks first.
  if (caller.id === facts.toCompanyId) {
    if (other.id !== facts.fromCompanyId) {
      return {
        ok: false,
        code: 'NOT_ON_THE_ROLE',
        message: `${facts.candidateName} came from ${facts.fromCompanyName}, not ${other.name}.`,
      }
    }
    return { ok: true, title: `${facts.candidateName} · ${facts.roleTitle}` }
  }
  if (caller.id === facts.fromCompanyId) {
    return {
      ok: false,
      code: 'SUPPLY_ANSWERS',
      message:
        `${other.name} opens the conversation about ${facts.candidateName}; ${caller.name} answers it. ` +
        'Their status and any interview rounds are already yours to read.',
    }
  }
  return { ok: false, code: 'NOT_YOURS', message: `${facts.candidateName} was not submitted to or by you.` }
}

export interface ThreadSides {
  companyId: string
  withCompanyId: string | null
}

/** Both companies on the thread, and nobody else. */
export function canRead(thread: ThreadSides, companyId: string | null | undefined): boolean {
  if (!companyId) return false
  return thread.companyId === companyId || thread.withCompanyId === companyId
}

/** Which side of the thread this company is, or null when it is not on it. */
export function sideOf(thread: ThreadSides, companyId: string | null | undefined): 'OPENED' | 'ANSWERS' | null {
  if (!companyId) return null
  if (thread.companyId === companyId) return 'OPENED'
  if (thread.withCompanyId === companyId) return 'ANSWERS'
  return null
}

export interface Participant {
  personId: string
  name: string
  companyId?: string | null
  joinedAt?: string
}

/**
 * Who is told when somebody writes.
 *
 * Everybody already on the thread, except whoever wrote. And when the
 * other company has nobody on it yet — the client's first note to a
 * supplier — the supplier's staff, so the note reaches a desk rather
 * than sitting in a thread nobody has opened. Once somebody there
 * answers they are on the thread, and it is theirs from then on.
 */
export function whoHears(input: {
  authorId: string
  authorCompanyId: string
  participants: Participant[]
  /** Staff at the other company, for the first note across. */
  otherSideStaffIds: string[]
}): string[] {
  const { authorId, authorCompanyId, participants, otherSideStaffIds } = input
  const heard = new Set<string>()
  for (const p of participants) if (p.personId !== authorId) heard.add(p.personId)
  const otherSidePresent = participants.some(
    (p) => p.companyId && p.companyId !== authorCompanyId
  )
  if (!otherSidePresent) for (const id of otherSideStaffIds) if (id !== authorId) heard.add(id)
  return [...heard]
}

/** Add the author to the thread if they are not on it; unchanged otherwise. */
export function withAuthor(
  participants: Participant[],
  author: { personId: string; name: string; companyId: string | null },
  now: Date = new Date()
): Participant[] {
  if (participants.some((p) => p.personId === author.personId)) return participants
  return [...participants, { ...author, joinedAt: now.toISOString() }]
}

/**
 * The notice the other side gets. Who wrote, at which firm, about what,
 * and the opening of what they said — the reader is a party to the
 * thread, so the words are theirs to see.
 */
export function messageNotice(input: {
  author: { name: string; companyName: string }
  threadTitle: string | null
  body: string
}): { title: string; body: string } {
  const about = input.threadTitle ? ` on ${input.threadTitle}` : ''
  const said = input.body.trim().replace(/\s+/g, ' ')
  return {
    title: `${input.author.name} at ${input.author.companyName}${about}`,
    body: said.length > 140 ? `${said.slice(0, 139)}…` : said,
  }
}

/** The firms a demand-side reader may open a thread with, on a role. */
export function suppliersOnRole(input: {
  invited: Firm[]
  submittedFrom: Firm[]
  cleared: Firm[]
}): Firm[] {
  const seen = new Map<string, Firm>()
  for (const f of [...input.invited, ...input.submittedFrom, ...input.cleared]) {
    if (!seen.has(f.id)) seen.set(f.id, f)
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}
