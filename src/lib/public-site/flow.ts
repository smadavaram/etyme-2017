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
  PROGRAM_OFFICE: 'Program office',
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
  return boxes.map((b) => (b.who ? `${ACTOR_LABEL[b.who]}: ${b.t}.` : `${b.t}.`))
}
