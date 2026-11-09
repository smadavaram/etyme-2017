import type { RollUp } from './tree'

/**
 * What GET /api/settings/team-structure answers, as types with no
 * database behind them, so the screen reads the same shape the route
 * writes (lib/team-structure/read).
 */

export interface SeatName { contextId: string; name: string; role: string | null }
export interface ContractorName { sellContractId: string; personId: string; name: string; job: string | null; supplier: string; onSite: boolean }

export interface BoxRead {
  id: string
  parentId: string | null
  name: string
  kind: string
  kindWord: string
  position: number | null
  lead: (SeatName & { setBy: string | null; setAt: string | null }) | null
  site: { id: string; name: string; country: string; timeZone: string | null; region: string | null } | null
  people: SeatName[]
  contractors: ContractorName[]
  /** More names than the box carries, where a box is very large. */
  morePeople: number
  moreContractors: number
  roll: RollUp
  line: string
}

export interface TreeRead {
  company: { id: string; name: string; kind: string; accountWalls: boolean }
  /** The company box's lead: its Owner. */
  owner: SeatName | null
  boxes: BoxRead[]
  /** Seats on no box, the company's own list. */
  unplaced: SeatName[]
  /** Every live seat, for the lead and person pickers. */
  seats: SeatName[]
  limitMonths: number | null
  lastChange: { id: string; says: string; by: string | null; at: string; yours: boolean } | null
  /** The people named on the screen, for the access log. */
  contractorPersonIds: string[]
}

