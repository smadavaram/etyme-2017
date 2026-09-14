/**
 * The eight positions anybody can hold on a deal, in one place.
 *
 * ── Why this is code and not a document ──────────────────────────────
 *
 * The same reason `lib/matrix` is code: a page describing what is true
 * is wrong within a month; a test is wrong for exactly one commit.
 *
 * The app kept being built for two parties — a vendor selling and a
 * client buying — and then bent, screen by screen, when a third turned
 * up. `kind === 'CLIENT' || kind === 'MSP'` decided who had contacts,
 * which left a GSI and a prime with an empty page. A rate was read at
 * the wrong rung of a chain because the code knew "supplier" and not
 * "the supplier this client pays". Each was a separate fix to a
 * separate screen, and each was the same mistake: a position on a deal
 * treated as a property of a firm.
 *
 * So the positions are named once, here, with what each does, and
 * `__integration__/party-uniform.test.ts` asks the same ten questions
 * of every one of them against the real routes. A station that behaves
 * for a client and not for a GSI fails on the commit that breaks it.
 *
 * ── Position is not kind ─────────────────────────────────────────────
 *
 * A firm's `CompanyKind` is what it is on the register. Its position is
 * what it is on this deal. One VENDOR is a prime on Monday and a sub on
 * Tuesday, on two deals running at once, and the product has to be
 * right both times. Never store a position on a company; read it from
 * the deal.
 */

import type { CompanyKind } from '@prisma/client'

export type Party =
  | 'CLIENT'
  | 'MSP'
  | 'GSI'
  | 'PRIME'
  | 'SUB'
  | 'BENCH_VENDOR'
  | 'SOLOPRENEUR'
  | 'CANDIDATE'

export interface Position {
  party: Party
  /** What a person at this firm would call it, on a screen. */
  word: string
  /** What it is on the register, or null for a person with no firm. */
  kind: CompanyKind | null
  /** Does it buy somebody's time? */
  buys: boolean
  /** Does it supply somebody's time? */
  supplies: boolean
  /** Does work happen on its own sites, under its own managers? */
  hosts: boolean
  /** One sentence: what this position is for. */
  says: string
}

export const PARTIES: readonly Position[] = [
  {
    party: 'CLIENT',
    word: 'Client',
    kind: 'CLIENT',
    buys: true,
    supplies: false,
    hosts: true,
    says: 'Buys the work, signs the hours, pays what came through the match, and carries the tenure.',
  },
  {
    party: 'MSP',
    word: 'Program office',
    kind: 'MSP',
    buys: true,
    supplies: false,
    hosts: false,
    says: 'Runs the program for the client: chooses which suppliers see a role, and never supplies one itself.',
  },
  {
    party: 'GSI',
    word: 'Integrator',
    kind: 'GSI',
    buys: true,
    supplies: true,
    hosts: false,
    says: 'Delivers a statement of work with its own people and bought ones, so it buys and supplies at once.',
  },
  {
    party: 'PRIME',
    word: 'Prime supplier',
    kind: 'VENDOR',
    buys: true,
    supplies: true,
    hosts: false,
    says: 'Holds the agreement with the client and buys from subs beneath it; the client pays it and nobody else.',
  },
  {
    party: 'SUB',
    word: 'Sub-supplier',
    kind: 'VENDOR',
    buys: true,
    supplies: true,
    hosts: false,
    says: 'Holds the paper on a person it may not have sourced, and invoices the prime, never the client.',
  },
  {
    party: 'BENCH_VENDOR',
    word: 'Bench supplier',
    kind: 'VENDOR',
    buys: false,
    supplies: true,
    hosts: false,
    says: 'Sourced the person and holds their consent to be put forward; furthest from the money.',
  },
  {
    party: 'SOLOPRENEUR',
    word: 'Own company',
    kind: 'CONSULTANT_CORP',
    buys: false,
    supplies: true,
    hosts: false,
    says: 'The consultant’s own limited company: it signs, invoices and insures, and supplies exactly one person — itself.',
  },
  {
    party: 'CANDIDATE',
    word: 'Consultant',
    kind: null,
    buys: false,
    supplies: false,
    hosts: false,
    says: 'The person. Files their own week, answers for themselves, and is never a party to anybody’s contract but their own.',
  },
]

export const position = (p: Party): Position => PARTIES.find((x) => x.party === p)!

/** Everybody who pays for somebody's time. */
export const buyers = (): readonly Position[] => PARTIES.filter((p) => p.buys)

/** Everybody who can be asked for a person. */
export const suppliers = (): readonly Position[] => PARTIES.filter((p) => p.supplies)

/**
 * Which positions a firm of this kind can hold.
 *
 * A VENDOR is three of them and the deal decides which; this answers
 * "could it be", never "it is". Asking a company what it is on a deal
 * without the deal in hand is the bug this file exists to stop.
 */
export function positionsOpenTo(kind: CompanyKind): Party[] {
  return PARTIES.filter((p) => p.kind === kind).map((p) => p.party)
}
