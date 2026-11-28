/**
 * The door every paper on a placement carries, by where it stands.
 *
 * The founder's tester on production, 2026-11-08: Noor Rahman, newly
 * placed through CSI, sent her I-9 and her right to work from her own
 * page and read "4 documents are with them, waiting to be checked". No
 * seat could check them: the client's Document requests read "waiting on
 * you 0" (rightly: a client never examines a supplier's worker's I-9),
 * CSI could not find where they had landed, and the background check and
 * drug screen the placement needed read "needed" with nothing on the
 * placement to record what the screening company said. Every paper was a
 * chip with no door.
 *
 * So each paper in the placement's required set is given one door by
 * where it stands, read from the facts the placement already holds:
 *
 *   arrived, not examined   "Check what arrived", at the firm it was sent
 *                           to and only to a seat whose work papers are.
 *                           Anybody else reads where it is: "Arrived at
 *                           CSI, being examined".
 *   a screening company's   "Record the provider's verdict", at the firm
 *   verdict                 that orders it: the screening company's name,
 *                           its reference and the day it reported. Never
 *                           "Ask Noor": she is never sent the report.
 *   a paper she holds       "Ask Noor", at the firm that asks her for it.
 *
 * Pure: the route reads the facts, this decides the door, and the screen
 * draws it without typing a route. A client's seat is never offered a
 * check, a verdict or an ask about a supplier's worker; it reads who has
 * the paper in a sentence.
 */
import { orderedNotCollected, RECORDABLE_ABOUT_A_FIRM } from '@/lib/attestation'
import { holdsPaperworkDesk } from '@/lib/document-request'
import { EMPLOYER_COMPLETES } from '@/lib/document-stages/employer'
import { hasPermission } from '@/lib/permissions'
import type { ExamineNeeds } from '@/lib/document-stages/examine-form'

/** The line the paper is on, as the placement reads it. */
export interface DoorLine {
  /** The sell line: what the verdict route records against. */
  contractId: string
  personId: string
  personName: string
  /** The firm that sells the person's time on this line: the supplier. */
  sellerId: string
  sellerName: string
  /**
   * The firm that employs the person on the chain under this line, where
   * the record says so (`employerOnChain`); null, or `how: 'BOTTOM'`, is
   * a best reading and never moves a door off the seller.
   */
  employer?: { companyId: string; name: string; how: 'EMPLOYEE' | 'PAYROLL' | 'BOTTOM' } | null
}

/** A paper that arrived and nobody has examined, where one did. */
export interface ArrivedPaper {
  /** The `DocInstance` it is kept as: what the examine route takes. */
  paperId: string
  /** The firm it was sent to, whose paperwork team examines it. */
  firmId: string
  firmName: string
  /** What the accept-or-send-back dialog opens with (`ExamineRow`). */
  row: {
    id: string
    template: { name: string }
    subject: string
    subjectType: string
    aboutAFirm: boolean
    fileName: string | null
    examineNeeds: Partial<ExamineNeeds>
  }
}

/** One paper in the required set, as the placement's checklist reads it. */
export interface DoorPaper {
  key: string
  label: string
  /** The checklist's state: ALREADY_HELD · EXPIRING · EXPIRED · NOT_YET_VALID · NEEDED, or WAIVED. */
  state: string
  /** WORKER · SUPPLIER · CUSTOMER · US, where the set says; read from the kind where it does not. */
  owedBy?: string | null
  arrived?: ArrivedPaper | null
}

/** Who is looking. */
export interface DoorCaller {
  companyId: string | null
  permissions: readonly string[]
}

export type PaperDoor =
  | { kind: 'CHECK'; label: 'Check what arrived'; paperId: string; row: ArrivedPaper['row'] }
  | { kind: 'VERDICT'; label: 'Record the provider’s verdict'; contractId: string; personId: string; name: string; checkType: string }
  | { kind: 'ASK'; label: string; contractId: string; personId: string; name: string; documentTypeKey: string; paperLabel: string }

export interface PaperDoors {
  /** The doors this seat may press, at most one. */
  doors: PaperDoor[]
  /** Where the paper is, said to a seat with no door; null where nothing need be said. */
  says: string | null
}

const NOTHING: PaperDoors = { doors: [], says: null }

const first = (name: string) => name.trim().split(/\s+/)[0] || name
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** Whether the paper is about a firm rather than the person: the supplier's own cover, its W-9, an agreement. */
function aboutAFirm(paper: DoorPaper): boolean {
  if (paper.owedBy) return paper.owedBy !== 'WORKER'
  return (RECORDABLE_ABOUT_A_FIRM as readonly string[]).includes(paper.key)
}

/**
 * The firm whose work this person's papers are on this line: the employer
 * where the record names one, else the firm selling her time.
 */
export function firmThatOwes(line: DoorLine): { companyId: string; name: string } {
  const e = line.employer
  return e && e.how !== 'BOTTOM' ? { companyId: e.companyId, name: e.name } : { companyId: line.sellerId, name: line.sellerName }
}

/**
 * The doors one paper carries for one seat.
 */
export function paperDoorsFor(line: DoorLine, paper: DoorPaper, caller: DoorCaller): PaperDoors {
  const owes = firmThatOwes(line)
  const atOwer = !!caller.companyId && caller.companyId === owes.companyId
  const desk = holdsPaperworkDesk(caller.permissions)
  const label = paper.label || paper.key

  // ── It arrived: whoever it was sent to examines it ─────────────────
  if (paper.arrived) {
    const a = paper.arrived
    if (caller.companyId === a.firmId) {
      return desk
        ? { doors: [{ kind: 'CHECK', label: 'Check what arrived', paperId: a.paperId, row: a.row }], says: null }
        : { doors: [], says: `${cap(label)} arrived. HR or the compliance officer at ${a.firmName} looks at it.` }
    }
    return { doors: [], says: `${cap(label)} arrived at ${a.firmName}, being examined.` }
  }

  if (paper.state === 'ALREADY_HELD' || paper.state === 'WAIVED') return NOTHING
  // The firm's own papers are not this person's, and have their own doors.
  if (aboutAFirm(paper)) return NOTHING

  // ── A screening company's verdict: the firm that orders it records it ──
  if (orderedNotCollected(paper.key)) {
    const may = atOwer && ['consultants.write', 'privacy.manage'].some((p) => hasPermission(caller.permissions, p as never))
    if (may) {
      return {
        doors: [{ kind: 'VERDICT', label: 'Record the provider’s verdict', contractId: line.contractId, personId: line.personId, name: line.personName, checkType: paper.key }],
        says: null,
      }
    }
    return {
      doors: [],
      says: atOwer
        ? `${cap(label)} is ordered from a screening company. HR or the compliance officer at ${owes.name} records what it says.`
        : `${owes.name} orders ${label} from a screening company and records what it says. ${first(line.personName)} is never sent the report.`,
    }
  }

  // ── A paper she holds: the firm that asks her for it asks ──────────
  // An I-9 or a right to work check is the employer's alone to ask for
  // and examine; any other paper about her is asked by the firm whose
  // work her papers are. A client reads who asks.
  if (atOwer && desk) {
    return {
      doors: [{
        kind: 'ASK', label: `Ask ${first(line.personName)}`, contractId: line.contractId, personId: line.personId,
        name: line.personName, documentTypeKey: paper.key, paperLabel: label,
      }],
      says: null,
    }
  }
  if (atOwer) return { doors: [], says: `HR or the compliance officer at ${owes.name} asks ${first(line.personName)} for ${label}.` }
  const employerOnly = (EMPLOYER_COMPLETES as readonly string[]).includes(paper.key)
  return {
    doors: [],
    says: employerOnly
      ? `${owes.name} employs ${first(line.personName)} and completes ${label} with ${first(line.personName)}. It reads here once it is on file.`
      : `${owes.name} asks ${first(line.personName)} for ${label}.`,
  }
}

/**
 * Who examines a paper that arrived at `holder`, as a firm that asked for
 * it reads it. The employer examines an I-9 or a right to work check, and
 * nobody else; a client reading a supplier's worker's paper reads where it
 * is and is never counted as owing a look. Pure.
 */
export function arrivalReads(input: {
  readerCompanyId: string
  holderCompanyId: string
  holderName: string
  key: string | null
  /** The firm that employs the person, where the record says so. */
  employerCompanyId?: string | null
  employerName?: string | null
}): { examinesIt: boolean; says: string | null } {
  const employerOnly = !!input.key && (EMPLOYER_COMPLETES as readonly string[]).includes(input.key)
  if (employerOnly && input.employerCompanyId && input.employerCompanyId !== input.readerCompanyId) {
    return {
      examinesIt: false,
      says: input.holderCompanyId === input.readerCompanyId
        ? `Arrived. ${input.employerName ?? 'The firm that employs them'} employs this person and examines it, never this firm.`
        : `Arrived at ${input.holderName}, being examined.`,
    }
  }
  if (input.holderCompanyId !== input.readerCompanyId) {
    return { examinesIt: false, says: `Arrived at ${input.holderName}, being examined.` }
  }
  return { examinesIt: true, says: null }
}

/** The headline over a firm's Paperwork for a seat whose work papers are. */
export function waitingOnYouSays(count: number): string | null {
  if (count <= 0) return null
  return count === 1
    ? 'One paper arrived and is waiting on you. Open it, then accept it or send it back.'
    : `${count} papers arrived and are waiting on you. Open each one, then accept it or send it back.`
}
