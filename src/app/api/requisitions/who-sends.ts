import { hasPermission } from '@/lib/permissions'

/**
 * Who may send a job out to suppliers, by the kind of firm sending it.
 *
 * Pure: no database, so the rule and its sentences are tested alone.
 *
 * At a client the program office chooses which suppliers see a job: the
 * program manager or Procurement (`requirements.distribute`). A hiring
 * manager raises the job and does not choose who sees it, which is the
 * control that stops work being routed to a friend.
 *
 * A supplier firm has no program office. When a prime sends a job it was
 * sent down to its own sub-vendor, it sets what it pays that sub-vendor,
 * so it is the desk that owns the client relationship and the price: the
 * account manager (2026-09-13, "jobs, rates, submissions, and what was
 * billed"), the owner or the admin. The Tapin walk (2026-10-29) found
 * Brightmoor's account manager refused with "the program manager's call",
 * at a firm that has no program manager. A recruiter or HR is still
 * refused, in a sentence naming the role that sends at that kind of firm.
 */

export type SendingKind = 'CLIENT' | 'MSP' | 'VENDOR' | 'GSI' | 'CONSULTANT_CORP' | string

/** A firm that sells: it sends a job down to the firms it buys from. */
function sells(kind: SendingKind): boolean {
  return kind === 'VENDOR' || kind === 'GSI' || kind === 'CONSULTANT_CORP'
}

/** Who sends a job out at this kind of firm, as a person would say it. */
export function whoSends(kind: SendingKind): string {
  switch (kind) {
    case 'CLIENT':
      return 'the program manager or Procurement'
    case 'MSP':
      return 'the program manager or a coordinator'
    case 'GSI':
      return 'the account manager, a delivery manager or the owner'
    default:
      return 'the account manager or the owner'
  }
}

export type SendVerdict = { ok: true } | { ok: false; says: string }

export function maySendJob(
  firm: { kind: SendingKind; name: string },
  permissions: readonly string[],
): SendVerdict {
  if (hasPermission(permissions, 'requirements.distribute')) return { ok: true }
  // At a firm that sells, the desk that owns the job and its price.
  if (sells(firm.kind) && hasPermission(permissions, 'requirements.write') && hasPermission(permissions, 'rates.write')) {
    return { ok: true }
  }
  const who = whoSends(firm.kind)
  const verb = sells(firm.kind) ? 'sends a job down to a sub-vendor' : 'decides which suppliers see a job'
  return {
    ok: false,
    says: `At ${firm.name}, ${who} ${verb}. Ask one of them to send it out.`,
  }
}
