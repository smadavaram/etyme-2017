import { RefusedState } from '@/components/ui'

/**
 * The time-on-site page for a reader the route refused: the route's own
 * sentence — which names the desk that does read it — and nothing else.
 *
 * No heading, because a heading over a refusal reads as a page that
 * loaded and is empty; no figures, because a zero is an answer the page
 * has not got; no table, no search, no subtitle naming the client,
 * because the reader was not shown whose it is. Drawn by the shared
 * `RefusedState`, whose props are the rule.
 */
export function TenureRefused({ says }: { says: string }) {
  return <RefusedState says={says} />
}
