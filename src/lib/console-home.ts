/**
 * Which console a seat opens on.
 *
 * ── Why this is one function ─────────────────────────────────────────
 *
 * There are three doors onto the same question and they had three
 * answers. `/dashboard` redirected for itself, the demo door decided a
 * landing page for itself, and the sidebar decided for itself what its
 * own "Dashboard" link pointed at. Three places, one question, and the
 * browser walk of 2026-09-21 found all three wrong at once:
 *
 *   · An integrator — Teleworld Solutions, Sundara Systems, and a
 *     validation engineer holding two read permissions — opened
 *     `/dashboard` and was shown **Corveldt Aerospace's own program**:
 *     "2 contractors on site through 2 suppliers. $43,680 this month."
 *     Two competing suppliers read the buyer's headcount and its spend,
 *     because `kind === 'GSI'` was in the same list as CLIENT and MSP.
 *     A GSI is a seller. It holds no seat anywhere and it has no
 *     program to open.
 *   · A consultant typing `/dashboard` got the vendor console —
 *     "PIPELINE $0K monthly revenue · ON BENCH 0" — and four refusals
 *     behind it, on a page their own menu does not name.
 *   · A one-person nursing corporation got the same console: a bench of
 *     one, a pipeline of nothing, and a menu of a staffing agency's
 *     departments.
 *
 * So the answer is computed once, here, from four facts, and the three
 * doors read it. A program office is the only firm that opens somebody
 * else's program, and only where that client has granted it a desk
 * (`lib/program-seat`) — never merely because it trades there.
 */

export type CompanyKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'

/** The three consoles this product has. */
export type Console = '/dashboard' | '/dashboard/program' | '/dashboard/my-work'

export interface Reader {
  /** What the firm is on the register. Null for somebody with no firm. */
  kind?: CompanyKind | null
  /** The seat is a CONSULTANT context — on a bench, of no firm. */
  isConsultant?: boolean
  /**
   * This firm holds a live desk in a client's own program office. Only
   * a program office ever does; `seatFor` in lib/program-seat answers it.
   */
  seated?: boolean
}

export interface Verdict {
  href: Console
  /** Why, in a sentence, so a test reads as English and a log can say it. */
  says: string
}

export function consoleHome(reader: Reader): Verdict {
  const { kind, isConsultant = false, seated = false } = reader

  // A person before a firm. Somebody on a bench has a company — that is
  // what a bench is — and is not of it, so the seat type decides and the
  // company never does.
  if (isConsultant || !kind) {
    return {
      href: '/dashboard/my-work',
      says: 'A consultant opens on their own work. The firm’s console is about them, not theirs.',
    }
  }

  // The company of one. She is the person the work is about and the firm
  // that bills for it, and the firm's half is three pages — not a
  // staffing agency's pipeline, bench and commission run.
  if (kind === 'CONSULTANT_CORP') {
    return {
      href: '/dashboard/my-work',
      says: 'A one-person corporation opens on its own work, because its work is the whole book.',
    }
  }

  if (kind === 'CLIENT') {
    return { href: '/dashboard/program', says: 'A client opens on the program it runs.' }
  }

  // A program office runs somebody else's program from a desk that
  // client granted it. Without the desk it has no program to open, and
  // guessing one from a trading relationship is how a supplier ended up
  // reading a buyer's spend.
  if (kind === 'MSP' && seated) {
    return {
      href: '/dashboard/program',
      says: 'A program office opens on the client’s program, because the client granted it that desk.',
    }
  }

  return {
    href: '/dashboard',
    says:
      kind === 'GSI'
        ? 'An integrator sells; it opens on its own book, never on a client’s program.'
        : 'A firm that sells opens on its own book.',
  }
}
