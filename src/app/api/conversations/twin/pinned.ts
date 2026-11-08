import { hasPermission, hasAnyPermission } from '@/lib/permissions'
import { CHIPS, paysOut, questionsFor, readAsk, type Party } from './ask'

/**
 * Pinned questions: three saved questions per role at the top of Ask
 * Etyme's column (founder, 2026-11-08, "One app, two tabs"). One press
 * sends the question, exactly as if it were typed.
 *
 * The rule a chip already keeps holds here too: a pinned question is a
 * promise that this seat gets an answer from the record, never a refusal
 * (the walk of 2026-10-22: a hiring manager was offered spend and the time
 * limit and both refused her). So each of the role's three is kept only
 * where the seat's permissions read it, and a gap is filled from the
 * seat's own chips, in their order.
 */

export const PINNED_SHOWN = 3

type May = (p: readonly string[], kind: string | null | undefined) => boolean

/** Each pinned question, with who gets an answer to it. */
const PIN: Record<string, { parties: readonly Party[]; may: May }> = {
  'Which weeks are waiting for us to accept?': { parties: ['FIRM'], may: (p) => hasPermission(p, 'timesheets.approve') },
  'Which bills are unpaid?': { parties: ['FIRM'], may: (p) => hasPermission(p, 'invoices.read') },
  'Who is coming free?': {
    parties: ['FIRM'],
    may: (p) => hasAnyPermission(p, ['consultants.read', 'assignments.write', 'requirements.read', 'utilization.read', 'invoices.read']),
  },
  'Who applied?': { parties: ['CLIENT', 'MSP', 'FIRM'], may: (p) => hasAnyPermission(p, ['requirements.write', 'requirements.read', 'submissions.create']) },
  'Who matches this job?': { parties: ['CLIENT', 'MSP', 'FIRM'], may: (p) => hasAnyPermission(p, ['requirements.write', 'requirements.read']) },
  'What am I paying across suppliers?': { parties: ['CLIENT', 'MSP'], may: (p) => hasPermission(p, 'invoices.read') },
  'Which invoice receipts can I pay?': { parties: ['CLIENT', 'MSP', 'FIRM'], may: (p, k) => paysOut(p, k) },
  'What is on hold, and why?': { parties: ['CLIENT', 'MSP', 'FIRM'], may: () => true },
  'Which weeks are signed and not billed?': { parties: ['FIRM'], may: (p) => hasAnyPermission(p, ['invoices.issue', 'invoices.read']) },
}

/** The founder's three per role, from the drawing of 2026-11-08. */
export const PINNED_BY_ROLE = {
  SUPPLIER: ['Which weeks are waiting for us to accept?', 'Which bills are unpaid?', 'Who is coming free?'],
  HIRING_MANAGER: ['Who applied?', 'Who matches this job?', 'What am I paying across suppliers?'],
  AP_CLERK: ['Which invoice receipts can I pay?', 'What is on hold, and why?', 'Which weeks are signed and not billed?'],
} as const

/** Which of the three lists a seat starts from, by its party and its role's name. */
export function pinnedListFor(party: Party, role: string | null | undefined): readonly string[] | null {
  const r = (role ?? '').trim().toLowerCase()
  if (party === 'FIRM') return PINNED_BY_ROLE.SUPPLIER
  if (party === 'CLIENT' || party === 'MSP') {
    if (r === 'hiring manager') return PINNED_BY_ROLE.HIRING_MANAGER
    if (r === 'ap clerk' || r === 'accounts payable') return PINNED_BY_ROLE.AP_CLERK
  }
  return null
}

/** Two questions are one where the rules read them as one: "Who applied?" and "Who applied for my jobs?". */
function sameAsk(a: string, b: string): boolean {
  return JSON.stringify(readAsk(a)) === JSON.stringify(readAsk(b))
}

/**
 * The three questions pinned for a seat: the role's own, each kept only
 * where this seat gets an answer to it, then the seat's chips in their
 * order. A one-person firm's are her own first three; a worker's are drawn
 * by the screen from her own questions.
 */
export function pinnedFor(seat: { party: Party; role?: string | null; permissions: readonly string[]; companyKind?: string | null }): string[] {
  const own = questionsFor(seat.party, seat.permissions, seat.companyKind)
  const out: string[] = []
  const take = (q: string) => {
    if (out.length < PINNED_SHOWN && !out.some((x) => x === q || sameAsk(x, q))) out.push(q)
  }
  for (const q of pinnedListFor(seat.party, seat.role) ?? []) {
    const pin = PIN[q]
    if (pin && pin.parties.includes(seat.party) && pin.may(seat.permissions, seat.companyKind)) take(q)
  }
  for (const q of own) {
    // A chip is already judged by the same table the chips use.
    const chip = CHIPS.find((c) => c.q === q)
    if (!chip || chip.may(seat.permissions, seat.companyKind)) take(q)
  }
  return out
}
