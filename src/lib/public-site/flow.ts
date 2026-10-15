/**
 * The parts of a flow chart, as data, so a test can read every chart on
 * the public site without rendering it. See `./flow-chart` for why each
 * process opens on one.
 */

/** Who does a step. The four parties the founder named, plus the rules and the books. */
export type Actor = 'CLIENT' | 'SUPPLIER' | 'WORKER' | 'PROGRAM_OFFICE' | 'RULES' | 'BOOKS'

export const ACTOR_LABEL: Record<Actor, string> = {
  CLIENT: 'Client',
  SUPPLIER: 'Supplier',
  WORKER: 'Worker',
  PROGRAM_OFFICE: 'Program manager',
  RULES: 'By rule',
  BOOKS: 'Your books',
}

/** One color per party on every chart, from the brand's chips. */
export const ACTOR_CHIP: Record<Actor, string> = {
  CLIENT: 'chip--action',
  SUPPLIER: 'chip--attention',
  WORKER: 'chip--verified',
  PROGRAM_OFFICE: 'chip--passive',
  RULES: 'chip--passive',
  BOOKS: 'chip--passive',
}

export interface FlowBox {
  /**
   * Who does it. Every box on a step page and a process page names one;
   * a product page's short strip of milestones may leave it out.
   */
  who?: Actor
  /**
   * The person who does it, named by their job ("Hiring manager", "AP
   * clerk"), where the box says more than the party. Drawn in place of
   * the party's label; the party still decides the color. Added
   * 2026-10-15 for the documentation's step pages, whose boxes say who
   * and what (the founder's drawing of the pages cut to one screen).
   */
  role?: string
  /** What happens in this box, in a few words. */
  t: string
}

/**
 * A door into the example program that opens one exact screen at one
 * desk. `as` and `desk` are what `POST /api/demo` takes; `screen` is the
 * page opened once the seat is taken.
 */
export interface DemoTarget {
  as: string
  desk: string
  /** A route under /dashboard. */
  screen: string
  /** Who the reader sits as, said the way the trade says it. */
  seat: string
}

/** The words of a chart, for the guard. */
export function flowWords(boxes: FlowBox[]): string[] {
  return boxes.map((b) => {
    const who = b.role ?? (b.who ? ACTOR_LABEL[b.who] : null)
    return who ? `${who}: ${b.t}.` : `${b.t}.`
  })
}
