/**
 * The generated world's papers (regulatory): every person's and every
 * supplier's paper in every state the rules read, decided by `planPapers`
 * and written by the steps. See `plan.ts` and `seed.ts`.
 *
 * Wiring, for lib/seed-scale/index: `paperSteps(frame, people)` in the
 * papers slot after the people; `paperAfterRatesSteps(people)` after the
 * rates, because the orders its asks hang on are money's. Both size
 * themselves by `scaleSize()` and grow in shares with `sharesFor`, so the
 * wiring passes no size.
 */

export { planPapers, paperCounts, papersSeat, handfulPer, editionOn, retiredOn, asksFor, waiversFor, askIdFor, waiverIdFor, CLIENT_ASKS, CHAIN_ASKS, PROVIDERS, PROVIDER_SAYS } from './plan'
export type { PaperPlan, PaperState } from './plan'
export { paperSteps, paperAfterRatesSteps, paperStepNames, seedPapers, PAPER_SHARES } from './seed'
