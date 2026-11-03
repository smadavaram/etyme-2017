/**
 * Who hears that a paper arrived.
 *
 * The second screen walk (2026-11-03) found a worker's own I-9, sent from
 * her page, told to every seat at her employer: nine notices, three of
 * them to fellow engineers with no part in her papers and one to herself.
 * A notice nobody can act on teaches a person to stop reading notices.
 *
 * So a paper a person or a firm files for itself is told to the roles
 * whose work papers are, at the firm that asked, and to nobody else: a
 * seat that may examine it (`holdsPaperworkDesk` in lib/document-request,
 * the permission the examine route checks) and reads the firm's rules
 * (`governance.read`): HR, the compliance officer, the Owner and the
 * Admin. A recruiter or an account manager may open a paper and does not
 * examine one, so is not told every arrival. Where no seat holds both, a
 * firm is not left unheard: every seat that may examine it hears, the
 * fallback, never a refusal. Never the person who sent it, never a
 * colleague who only reads their own work. One notice per seat, through
 * `notifyBulk` like every other batch.
 */
import { prisma } from '@/lib/db'
import { holdsPaperworkDesk } from '@/lib/document-request'

export interface SeatAtFirm {
  personId: string
  permissions: readonly string[] | null | undefined
}

/** How many examining seats one arrival tells, at most: the same cap the old list had. */
export const EXAMINERS_TOLD = 10

/** Whether a seat's work is papers: it may examine one, and it reads the firm's rules. */
export function papersAreTheirWork(permissions: readonly string[] | null | undefined): boolean {
  const held = permissions ?? []
  return holdsPaperworkDesk(held) && (held.includes('*') || held.includes('governance.read'))
}

/**
 * The seats to tell that a paper arrived, without the person who filed
 * it, each person once: the seats whose work is papers, else every seat
 * that may examine one. Pure: the order is the order given.
 */
export function paperExaminers(seats: readonly SeatAtFirm[], filedBy: string | null): string[] {
  const others = seats.filter((s) => s.personId !== filedBy)
  const theirWork = others.filter((s) => papersAreTheirWork(s.permissions))
  const told = theirWork.length ? theirWork : others.filter((s) => holdsPaperworkDesk(s.permissions))
  const out: string[] = []
  for (const s of told) {
    if (!out.includes(s.personId)) out.push(s.personId)
    if (out.length >= EXAMINERS_TOLD) break
  }
  return out
}

/**
 * The people at `companyId` to tell that `filedBy` sent a paper: its
 * examining seats, read from their roles. Never a consultant's own record
 * at the firm, never a seat with no role.
 */
export async function paperExaminersAt(companyId: string, filedBy: string | null): Promise<string[]> {
  const seats = await prisma.context.findMany({
    where: { companyId, revokedAt: null, NOT: { roleId: null }, type: { not: 'CONSULTANT' } },
    select: { personId: true, role: { select: { permissions: true } } },
    orderBy: { id: 'asc' },
  })
  return paperExaminers(seats.map((s) => ({ personId: s.personId, permissions: s.role?.permissions ?? [] })), filedBy)
}
