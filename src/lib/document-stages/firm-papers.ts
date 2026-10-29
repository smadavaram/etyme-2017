/**
 * A firm's own papers, and the client's look at them reaching the
 * supplier's standing.
 *
 * ── What the Tapin walk found, 2026-10-29 ─────────────────────────────
 *
 * Brightmoor accepted Tapin's certificates of insurance on its Paperwork
 * screen, and the award to Tapin still refused: "the vendor has no
 * general liability and workers' compensation cover on file", said
 * twice. Three things were true at once:
 *
 *   - a paper answered through a document request is kept as a paper of
 *     the firm that asked, about the request's item, not about the
 *     supplier. The examine route read whom it was about off the paper,
 *     found neither a person nor a firm, and so recorded nothing on the
 *     supplier's standing, which is the `Verification` row the award, the
 *     start check (`lib/contract-clearance`) and the nightly watch read;
 *   - accepting the same item from the request itself recorded checks
 *     about a person and nothing about a firm;
 *   - a firm that had asked a supplier for its papers, before any job
 *     went between them, did not count as buying from it, so even a
 *     paper about the firm was examined and not recorded.
 *
 * Now one writer records a supplier's certificate on its standing,
 * whichever door the client accepts it through, and asking a firm for
 * its supplier papers is itself a sign the client buys from it.
 *
 * And a firm with more than one person had nowhere to file its own W-9,
 * insurance and good standing: the block was drawn for a one-person firm
 * only. Its Owner, Admin, HR or Compliance Officer now files them under
 * Company paperwork; nobody examines them but the client that buys.
 *
 * Pure: no database. The routes read the facts and write the rows.
 */

import { hasPermission, type Permission } from '@/lib/permissions'

/** The firm kinds that are a client and nothing else: a client files no supplier papers. */
const ONLY_BUYS = ['CLIENT']

/**
 * Whether this seat may file its firm's own papers (W-9, insurance, good
 * standing, registration).
 *
 * A one-person firm's owner always may: she is the firm. At a firm with
 * a team, the seats that keep the firm's papers: the Owner and an Admin
 * (who run the settings), HR (the firm's own paperwork), and the
 * Compliance Officer. Never a recruiter, the AP clerk or a member: a
 * certificate of insurance is the firm's word to its clients.
 */
export function mayFileFirmPapers(input: {
  companyKind: string | null
  companyName: string
  isOnePersonFirm: boolean
  permissions: readonly string[]
}): { ok: true } | { ok: false; code: 'NOT_A_SUPPLIER' | 'NOT_YOUR_DESK'; message: string } {
  if (input.isOnePersonFirm) return { ok: true }
  if (!input.companyKind || ONLY_BUYS.includes(input.companyKind)) {
    return {
      ok: false, code: 'NOT_A_SUPPLIER',
      message: `${input.companyName} buys from suppliers and is not asked for a W-9 or insurance by anybody here. Your suppliers file theirs.`,
    }
  }
  const holds = (p: string) => hasPermission(input.permissions as Permission[], p as Permission)
  const may =
    holds('settings.manage') ||
    holds('privacy.manage') ||
    (holds('consultants.write') && holds('governance.read'))
  if (!may) {
    return {
      ok: false, code: 'NOT_YOUR_DESK',
      message:
        `${input.companyName}’s W-9, insurance and good standing are filed by the Owner, an Admin, HR or the Compliance Officer. ` +
        `Ask one of them, or whoever runs Users & permissions for one of those roles.`,
    }
  }
  return { ok: true }
}

/** What ties a client to a supplier, read by the route. */
export interface BuyingSigns {
  /** The client sent the supplier a job. */
  invited: boolean
  /** The supplier put somebody forward to the client. */
  submitted: boolean
  /** The supplier sells to the client on a line. */
  onALine: boolean
  /** The client keeps the firm on its register as a supplier, not blocked. */
  onRegisterAsSupplier: boolean
  /** The client asked the firm for its supplier papers through a document request. */
  askedForItsPapers: boolean
}

/**
 * Whether the client buys from this supplier, so its look at the
 * supplier's certificate goes on the supplier's standing.
 *
 * Asking a firm for its insurance is how buying from it begins, so the
 * request counts; a client that has never dealt with a firm in any way
 * records nothing about it.
 */
export function buysFrom(signs: BuyingSigns): boolean {
  return signs.invited || signs.submitted || signs.onALine || signs.onRegisterAsSupplier || signs.askedForItsPapers
}

/**
 * Whom a paper that arrived is about, read once for every door.
 *
 * A paper kept from a document request is about the request's subject: a
 * firm for a supplier set, a person for a submission or a start. Every
 * other paper says it directly.
 */
export type PaperSubject =
  | { kind: 'FIRM'; companyId: string }
  | { kind: 'PERSON'; personId: string }
  | { kind: 'NONE' }

export function paperSubject(input: {
  subjectType: string
  subjectId: string
  /** Where the paper is a request item's answer: the request's subject. */
  packet?: { subjectCompanyId: string | null; subjectPersonId: string | null } | null
  /** The person a contract paper is about, where it is one. */
  contractPersonId?: string | null
}): PaperSubject {
  if (input.subjectType === 'PACKET_ITEM') {
    if (input.packet?.subjectCompanyId) return { kind: 'FIRM', companyId: input.packet.subjectCompanyId }
    if (input.packet?.subjectPersonId) return { kind: 'PERSON', personId: input.packet.subjectPersonId }
    return { kind: 'NONE' }
  }
  if (input.subjectType === 'COMPANY') return { kind: 'FIRM', companyId: input.subjectId }
  if (input.subjectType === 'PERSON') return { kind: 'PERSON', personId: input.subjectId }
  if (input.contractPersonId) return { kind: 'PERSON', personId: input.contractPersonId }
  return { kind: 'NONE' }
}
