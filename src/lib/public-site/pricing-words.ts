/**
 * The rate card, as data (records 126 and 127, locked 2026-11-25).
 *
 * Every dollar figure here is read from `lib/money/pricing` and printed
 * through one formatter, so the page cannot say a number the arithmetic
 * does not. The one figure money's module does not hold is consulting
 * at $200 an hour (record 127); it is written once, below, and the
 * test pins it. Usage has no price until the per-tier rates are
 * approved, so the page says that and nothing else about it. Affiliate
 * terms are not on this page (record 129 is not built).
 */

import { PRICES, USAGE_SAYS, editionCharge } from '@/lib/money/pricing'
import type { Block } from './company'

/** Consulting, in cents an hour (record 127). Not in money's module yet. */
export const CONSULTING_HOURLY_CENTS = 20000

/** The one formatter: whole dollars print without cents, every other amount prints both places. Never rounded. */
export function dollars(cents: number): string {
  const whole = Math.trunc(cents / 100)
  const rest = cents % 100
  const head = `$${whole.toLocaleString('en-US')}`
  return rest === 0 ? head : `${head}.${String(rest).padStart(2, '0')}`
}

const starter15 = editionCharge('STARTER', 15)!
const starter3 = editionCharge('STARTER', 3)!

/** "About 15%", from the basis points money holds. */
export const PREPAY_SAYS = `About ${PRICES.prepaidUsageDiscountBp / 100}% off usage when you pay a year ahead. The discount is on usage only.`

export const PRICING_LEDE =
  'What Enterprise contingent workforce management costs, by edition, and what is not priced yet.'

export const PRICING_BLOCKS: Block[] = [
  {
    id: 'editions',
    title: 'Editions',
    items: [
      { t: 'User: free', d: 'A company that places nobody and issues no invoices of its own works inside another company’s record at no charge.' },
      {
        t: 'Starter',
        d: `${dollars(PRICES.starterUnitCents)} per active contractor a month, never less than ${dollars(PRICES.starterFloorCents)} a month. ` +
          `Plus a ${dollars(PRICES.starterPlatformFeeCents)} platform fee each year. ${PRICES.trialDays}-day trial.`,
      },
      {
        t: 'Enterprise',
        d: `Free for ${PRICES.trialDays} days. Then ${dollars(PRICES.enterpriseUnitCents)} per active contractor a month, ` +
          `plus a ${dollars(PRICES.enterprisePlatformFeeCents)} platform fee each year.`,
      },
    ],
    note: 'An active contractor is a person on site under a contract in progress, counted once however many contracts they hold.',
  },
  {
    id: 'examples',
    title: 'Starter, worked out',
    lines: [
      {
        lead: '15 contractors.',
        t: `${dollars(starter15.monthlyCents)} a month, ${dollars(starter15.yearlyContractorCents)} a year, ${dollars(starter15.yearAllInCents)} with the platform fee.`,
      },
      {
        lead: '3 contractors.',
        t: `${dollars(PRICES.starterUnitCents * 3)}, so the ${dollars(starter3.monthlyCents)} monthly floor applies. Plus ${dollars(starter3.platformFeeCents)} a year.`,
      },
    ],
    tone: 'ok',
    note: 'The floor is on the contractor charge only. The platform fee never counts toward it.',
  },
  {
    id: 'usage',
    title: 'Agent actions',
    paragraphs: [USAGE_SAYS, PREPAY_SAYS],
  },
  {
    id: 'consulting',
    title: 'Consulting',
    paragraphs: [`${dollars(CONSULTING_HOURLY_CENTS)} an hour.`],
  },
]
