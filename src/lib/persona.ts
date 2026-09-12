/**
 * Three things decide what somebody sees, and they are not one thing.
 *
 * ── The question this answers ────────────────────────────────────────
 *
 * "As a GSI I have roles that are client type and also vendor type — how
 * do you accommodate both?" And separately: "differentiate between
 * manager and non-manager, not only roles but also persona."
 *
 * Those are the same question asked twice, and the answer is that one
 * field cannot carry it. There are three dimensions and they are
 * independent:
 *
 *   **Side** — what you are doing right now. Infosys is prime to one
 *   client and buys bench from three firms in the same week. The same
 *   person runs both, and a screen showing the buy side and the sell
 *   side at once shows a margin to somebody who is negotiating it.
 *
 *   **Role** — what you are allowed to do. Approve a timesheet, raise a
 *   requisition, read a margin. This already exists.
 *
 *   **Persona** — how far what you are allowed to do reaches. A
 *   recruiter and a recruiting manager both hold `submissions.write`.
 *   The manager sees the team's; the recruiter sees their own.
 *
 * ── Why persona is not just another permission ───────────────────────
 *
 * Because the alternative is minting `submissions.write.own` and
 * `submissions.write.team` and `submissions.write.company`, and then
 * doing it again for every noun in the product. The permission list
 * triples, and every promotion becomes a migration.
 *
 * Role says WHAT. Persona says HOW FAR. Keeping them apart means a
 * promotion is one field, and a new capability is one permission rather
 * than four.
 *
 * ── Why side lives on the context and not on the company ─────────────
 *
 * Because a company is not one thing either. `Company.supplierPosture`
 * already carries where a firm sits when it signs up, and its own
 * comment says the same company is often both. Posture shapes the first
 * screens; side decides what this person is doing this minute. A GSI
 * holds two contexts at one company and switches between them, the way
 * somebody switches between two email accounts.
 */

/** What a context is doing. Not what the company is. */
export type Side = 'BUY' | 'SELL'

/**
 * How far somebody's permissions reach.
 *
 * Deliberately about scope rather than seniority. An owner of a
 * two-person firm and a team lead at a large one may be the same
 * persona, because the question is "whose work may you see", not "how
 * important are you".
 */
export type Persona =
  /** Their own work and nobody else's. */
  | 'INDIVIDUAL'
  /** Their team's work. A recruiting manager, a delivery lead. */
  | 'MANAGER'
  /** A whole practice or business unit. */
  | 'UNIT_HEAD'
  /** The firm. */
  | 'PRINCIPAL'

export type Reach = 'OWN' | 'TEAM' | 'UNIT' | 'COMPANY'

const REACH: Record<Persona, Reach> = {
  INDIVIDUAL: 'OWN',
  MANAGER: 'TEAM',
  UNIT_HEAD: 'UNIT',
  PRINCIPAL: 'COMPANY',
}

export function reachOf(p: Persona): Reach {
  return REACH[p]
}

/**
 * Permissions whose reach a persona must never widen.
 *
 * Some things are not a matter of scope. Being promoted does not make
 * somebody an approver of their own work, and a principal reading every
 * consultant's bank details is a breach whatever their title says.
 *
 * Listed rather than inferred, because "which permissions ignore
 * persona" is a question with a legal answer and not an architectural
 * one.
 */
export const REACH_NEVER_WIDENS = [
  // Segregation of duties. The approver is never the beneficiary,
  // however senior they are.
  'timesheet.approve.own',
  'expense.approve.own',
  'contract.approve.own',
  // Somebody else's bank and tax details are needed by payroll and by
  // nobody else, at any level.
  'person.bank.read',
  'person.tax.read',
]

export interface Actor {
  personId: string
  companyId: string
  side: Side
  persona: Persona
  permissions: string[]
  /** The people whose work a manager may see. Empty for an individual. */
  teamPersonIds?: string[]
  /** The unit they head, where they head one. */
  orgUnitId?: string | null
}

export interface Subject {
  /** Whose work this is. */
  personId?: string | null
  companyId: string
  orgUnitId?: string | null
  /** Which side of the business this record belongs to. */
  side?: Side | null
}

export interface Verdict {
  allowed: boolean
  /** Why, in the words you would use to the person refused. */
  says: string
}

/**
 * Whether this actor may act on this record.
 *
 * Company first, then side, then reach, then the permission. In that
 * order deliberately: a wall breach is a different kind of wrong from a
 * missing permission, and saying "you do not have permission" to
 * somebody looking at another company's data is the wrong answer to the
 * wrong question.
 */
export function may(actor: Actor, permission: string, subject: Subject): Verdict {
  // ── The wall ────────────────────────────────────────────────────────
  if (subject.companyId !== actor.companyId) {
    return {
      allowed: false,
      says: 'That belongs to another company.',
    }
  }

  // ── The side ────────────────────────────────────────────────────────
  //
  // A GSI's buying desk and its selling desk are the same firm and
  // should not be the same screen. Somebody negotiating a rate with a
  // sub-vendor while looking at what the end client pays is the whole
  // reason a bench vendor distrusts a prime.
  if (subject.side && subject.side !== actor.side) {
    return {
      allowed: false,
      says:
        `You are working on the ${actor.side === 'BUY' ? 'buying' : 'selling'} side. ` +
        `That record is on the other one — switch to see it.`,
    }
  }

  if (!actor.permissions.includes(permission)) {
    return { allowed: false, says: `Your role does not include ${permission}.` }
  }

  // ── How far it reaches ──────────────────────────────────────────────
  //
  // Some permissions do not widen with seniority, and this is checked
  // before reach rather than after, because the answer is the same at
  // every level and saying so plainly is better than an argument about
  // scope.
  if (REACH_NEVER_WIDENS.includes(permission)) {
    const mine = subject.personId === actor.personId
    return permission.endsWith('.own')
      ? mine
        ? {
            allowed: false,
            says:
              'You cannot approve your own. Somebody has to be able to say no, ' +
              'and it cannot be the person being paid.',
          }
        : { allowed: true, says: 'Allowed.' }
      : { allowed: true, says: 'Allowed.' }
  }

  const reach = reachOf(actor.persona)

  if (reach === 'COMPANY') return { allowed: true, says: 'Allowed across the firm.' }

  if (reach === 'UNIT') {
    const same = subject.orgUnitId != null && subject.orgUnitId === actor.orgUnitId
    return same || subject.personId === actor.personId
      ? { allowed: true, says: 'Allowed inside your unit.' }
      : {
          allowed: false,
          says: 'That sits outside the practice you run.',
        }
  }

  if (reach === 'TEAM') {
    const mine = subject.personId === actor.personId
    const theirs = subject.personId != null && (actor.teamPersonIds ?? []).includes(subject.personId)
    return mine || theirs
      ? { allowed: true, says: 'Allowed for your team.' }
      : {
          allowed: false,
          says: 'That is somebody else’s, and they are not on your team.',
        }
  }

  // OWN
  return subject.personId === actor.personId
    ? { allowed: true, says: 'Allowed — it is yours.' }
    : {
        allowed: false,
        says:
          'That is somebody else’s work. Your role covers it; your position covers ' +
          'your own only.',
      }
}

// ── Being two things at one company ───────────────────────────────────

export interface Seat {
  contextId: string
  companyId: string
  companyName: string
  side: Side
  persona: Persona
  roleName: string
}

export interface Standing {
  seats: Seat[]
  /** True where this person is both a buyer and a seller at one firm. */
  bothSidesSomewhere: boolean
  says: string
}

/**
 * What a person may act as, and where they hold two hats at one firm.
 *
 * The GSI case, said out loud rather than left for somebody to discover
 * when a margin appears on the wrong screen.
 */
export function standing(seats: Seat[]): Standing {
  const byCompany = new Map<string, Seat[]>()
  for (const s of seats) byCompany.set(s.companyId, [...(byCompany.get(s.companyId) ?? []), s])

  const dual = [...byCompany.values()].filter(
    (rows) => new Set(rows.map((r) => r.side)).size > 1
  )

  if (seats.length === 0) {
    return { seats, bothSidesSomewhere: false, says: 'No company yet.' }
  }

  if (dual.length === 0) {
    return {
      seats,
      bothSidesSomewhere: false,
      says:
        seats.length === 1
          ? `${seats[0].companyName}, ${seats[0].side === 'BUY' ? 'buying' : 'selling'}.`
          : `${seats.length} seats across ${byCompany.size} companies.`,
    }
  }

  const names = dual.map((rows) => rows[0].companyName)
  return {
    seats,
    bothSidesSomewhere: true,
    says:
      `You buy and sell at ${names.join(' and ')}. Those are separate screens on ` +
      `purpose — the rate you pay a sub-vendor and the rate your client pays you ` +
      `should not be on one page while you are negotiating either of them.`,
  }
}

/**
 * The seat to land on when somebody signs in.
 *
 * Never "the most recently granted", which is what happens today and is
 * arbitrary. Where a person holds one seat, that one. Where they hold
 * several, the product asks rather than guessing — landing a GSI's
 * delivery lead on the buying desk because a context was granted last
 * Tuesday is how somebody quotes the wrong number.
 */
export function landOn(seats: Seat[], remembered?: string | null):
  { seat: Seat | null; ask: boolean; says: string } {
  if (seats.length === 0) {
    return { seat: null, ask: false, says: 'Nothing to land on yet.' }
  }

  const known = remembered ? seats.find((s) => s.contextId === remembered) : null
  if (known) return { seat: known, ask: false, says: `Back where you were — ${known.companyName}.` }

  if (seats.length === 1) {
    return { seat: seats[0], ask: false, says: `${seats[0].companyName}.` }
  }

  return {
    seat: null,
    ask: true,
    says:
      `You have ${seats.length} seats. Which one are you working in? ` +
      `We will remember it.`,
  }
}
