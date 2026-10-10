/**
 * First-party conversion counts for the public site. Decided 2026-10-10,
 * on the founder's feedback on the home page brief: measure the audit and
 * the demo without a third-party script.
 *
 * ── What is recorded, and what never is ──────────────────────────────
 *
 * One row per thing a visitor did: which of five things, on which page,
 * under a random id the browser makes for the visit and keeps only for
 * that tab (sessionStorage). No address, no name, no IP address, no
 * browser string, no cookie. A visit id cannot be joined to a person,
 * and that is the point: this counts doors, not people.
 *
 * ── Where it is kept ─────────────────────────────────────────────────
 *
 * In the platform's append-only event log (`Event`), with no company —
 * "a platform-level event that belongs to nobody", which is what a
 * visitor who is not a customer is. Webhooks are delivered per company,
 * so a row with no company reaches no integration. A dedicated table
 * would be cleaner and is a schema request for the architect; until then
 * every row's type starts `market.` so it is one query to find and one
 * to remove.
 *
 * Pure: the route does the database.
 */

/** The five things a visitor can do that the page counts. */
export const MARKET_EVENTS = [
  'audit_cta_clicked',
  'demo_cta_clicked',
  'demo_started',
  'audit_form_started',
  'audit_form_submitted',
] as const
export type MarketEvent = (typeof MARKET_EVENTS)[number]

/** What each one means, for the summary a staff member reads. */
export const MARKET_EVENT_SAYS: Record<MarketEvent, string> = {
  audit_cta_clicked: 'Clicked a spend audit button',
  demo_cta_clicked: 'Clicked a demo button',
  demo_started: 'Took a seat in the demo',
  audit_form_started: 'Started the audit form',
  audit_form_submitted: 'Sent the audit form, and the server stored it',
}

/** The prefix every row's type carries in the event log. */
export const MARKET_TYPE_PREFIX = 'market.'

export interface MarketEventInput {
  event?: unknown
  page?: unknown
  visit?: unknown
}

export interface MarketEventRow {
  event: MarketEvent
  page: string
  visit: string
}

/**
 * The row to write, or the sentence saying why not. A page is a path on
 * this site with no query string, because a query string is where an
 * address or a campaign id would ride in; a visit id is the browser's
 * random hex and nothing else.
 */
export function readMarketEvent(input: MarketEventInput): { ok: true; row: MarketEventRow } | { ok: false; says: string } {
  const event = typeof input.event === 'string' ? input.event : ''
  if (!(MARKET_EVENTS as readonly string[]).includes(event)) {
    return { ok: false, says: `"${event}" is not one of the things this counts: ${MARKET_EVENTS.join(', ')}.` }
  }
  const page = typeof input.page === 'string' ? input.page : ''
  if (!/^\/[A-Za-z0-9/_-]{0,120}$/.test(page)) {
    return { ok: false, says: 'The page is a path on this site, with no query string, such as "/" or "/census".' }
  }
  const visit = typeof input.visit === 'string' ? input.visit : ''
  if (!/^[a-f0-9]{16,64}$/.test(visit)) {
    return { ok: false, says: 'The visit id is the random one the page makes; nothing else is accepted in its place.' }
  }
  return { ok: true, row: { event: event as MarketEvent, page, visit } }
}

export interface MarketSummary {
  /** Since when the counts run. */
  since: string
  /** Distinct visit ids that did anything counted. */
  visits: number
  /** One line per event: how many times, and by how many visits. */
  events: { event: MarketEvent; says: string; times: number; visits: number }[]
  /** The same, page by page. */
  byPage: { page: string; event: MarketEvent; times: number }[]
  /**
   * Of the visits that started the audit form, the share that sent it,
   * in whole percent. Null when nobody started it: no rate from nothing.
   */
  formCompletion: number | null
  /** One sentence a person can read without the table. */
  says: string
}

export function summarize(rows: MarketEventRow[], since: Date): MarketSummary {
  const visits = new Set(rows.map((r) => r.visit))
  const events = MARKET_EVENTS.map((event) => {
    const these = rows.filter((r) => r.event === event)
    return { event, says: MARKET_EVENT_SAYS[event], times: these.length, visits: new Set(these.map((r) => r.visit)).size }
  })
  const pages = new Map<string, number>()
  for (const r of rows) pages.set(`${r.page}\u0000${r.event}`, (pages.get(`${r.page}\u0000${r.event}`) ?? 0) + 1)
  const byPage = [...pages.entries()]
    .map(([k, times]) => {
      const [page, event] = k.split('\u0000')
      return { page, event: event as MarketEvent, times }
    })
    .sort((a, b) => a.page.localeCompare(b.page) || MARKET_EVENTS.indexOf(a.event) - MARKET_EVENTS.indexOf(b.event))
  const started = events.find((e) => e.event === 'audit_form_started')!.visits
  const sent = events.find((e) => e.event === 'audit_form_submitted')!.visits
  const formCompletion = started === 0 ? null : Math.floor((Math.min(sent, started) / started) * 100)
  const when = since.toISOString().slice(0, 10)
  const says =
    visits.size === 0
      ? `Nothing counted since ${when}.`
      : `${visits.size} visit${visits.size === 1 ? '' : 's'} did something counted since ${when}. ` +
        `${sent} sent the audit form` +
        (formCompletion === null ? '.' : `, ${formCompletion}% of the ${started} who started it.`)
  return { since: since.toISOString(), visits: visits.size, events, byPage, formCompletion, says }
}
