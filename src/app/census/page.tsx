import { notFound } from 'next/navigation'

/**
 * `/census` — closed on November 13, 2026.
 *
 * The founder deleted the contractor spend audit from every page on
 * 2026-10-14 ("Does anyone need the audit form? I think it's useless.")
 * and kept this address reachable, linked from nowhere, for thirty days,
 * so a link already sent did not land on a missing page. The thirty days
 * end on November 13, 2026, and the page is gone: the address answers
 * with the ordinary not-found page: one sentence and a link home. There is no list of retired public addresses to redirect
 * from, so none is started for one page.
 *
 * This file stays only because the delivery matrix still names it (rows
 * L3.1.4.5 and L3.1.4.6, the platform's file). Once the architect takes
 * the census paths off those rows, this file, `./flow.tsx` and
 * `lib/census-copy` are deleted by the market, and the folder with them.
 *
 * Owned by etyme-market (`app/census` in `lib/domains.ts`).
 */
export default function CensusPage(): never {
  notFound()
}
