import { RefusedState } from '@/components/ui'

/**
 * The compliance page for a reader the route refused: the route's own
 * sentence — which names the desks that do read it — and nothing else.
 *
 * No heading, because a heading over a refusal reads as a page that
 * loaded and is empty; no figures, because a zero is an answer the page
 * has not got; no tabs, because each would open onto the same refusal;
 * no subtitle naming the program, because the reader was not shown whose
 * it is. Drawn by the shared `RefusedState`, whose props are the rule.
 */
export function ComplianceRefused({ says }: { says: string }) {
  return <RefusedState says={says} />
}
