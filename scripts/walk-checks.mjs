/**
 * The checks the desk walk runs on every page, kept apart from the
 * browser so they can be tested on fixture HTML.
 *
 * `scripts/walk-desks.mjs` opens a page as one desk, reads a handful of
 * facts off it (the text a person sees, the menu, the API calls that
 * failed), and hands them here. Everything in this file is pure: facts
 * in, problems out. `__tests__/walk/walk-checks.test.ts` holds the
 * checks to their sentences.
 *
 * A problem is `{ kind, what }`. `kind` is one of the keys of KINDS and
 * `what` is one short line a person can act on.
 */

/** Every kind of problem, and how the report names it. */
export const KINDS = {
  'refused': 'A menu link opens a refusal',
  'refusal-with-figures': 'A refusal with figures or tabs around it',
  'error-page': 'An error page, or a page with nothing on it',
  'api-error': 'The page\'s own API call failed',
  'console-error': 'An error in the browser console',
  'iso-date': 'A machine date (2026-09-30) shown to a person',
  'raw-code': 'A permission key or code shown to a person',
  'nav-empty-heading': 'A menu heading with no links under it',
  'nav-duplicate-label': 'Two menu links with the same name',
  'nav-phone-differs': 'The phone menu differs from the desktop menu',
  'action-without-permission': 'A button for something this desk may not do',
  'phone-overflow': 'The page scrolls sideways on a phone',
  'writes-on-open': 'Opening the page tried to write something (the walk blocked it)',
}

/** Words a page uses when it will not show somebody what they asked for. */
export const REFUSAL_PHRASES = [
  /\bnot open to you\b/i,
  /\bnot allowed\b/i,
  /\byou do not have (?:permission|access)\b/i,
  /\byou don['’]t have (?:permission|access)\b/i,
  /\bdoes not have (?:permission|access)\b/i,
  /\bneeds? (?:the )?[a-z]+\.[a-z]+ permission\b/i,
  /\byou need [a-z]+\.[a-z]+\b/i,
  /\bnobody has given you a seat\b/i,
  /\bnot authenticated\b/i,
  /\bis not open to\b/i,
  /\byour seat (?:here )?(?:does not|cannot)\b/i,
]

/** Words that mean the page itself broke rather than refused. */
export const BROKEN_PHRASES = [
  'Application error',
  'This page could not be found',
  'Something went wrong',
  'Unhandled Runtime Error',
  'Internal Server Error',
  '404: This page',
]

export const ISO_DATE = /\b20\d\d-\d\d-\d\d\b/g

/**
 * A permission key: `invoices.read`, `payroll.run`. Every verb a role in
 * lib/company-defaults actually uses, so `vendors.manage` is caught and
 * `acme.example` is not.
 */
export const PERMISSION_KEY =
  /\b[a-z]+\.(?:read|write|run|cost|manage|approve|issue|record|create|rate|distribute|terminate)\b/g

/** SHOUTING_CODES with an underscore, the way an API error code looks. */
export const RAW_CODE = /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g

/**
 * A button that says it creates, records or runs something, and the
 * permission it most likely needs. Best effort: the page is read, never
 * clicked, so this is a guess from the button's words and the page's
 * address. A button this cannot place is not reported.
 */
export const ACTION_PERMISSIONS = [
  { label: /^(?:\+ ?)?(?:new|post|raise|create)\b.*\b(?:job|request|requirement|requisition|role)\b/i, needs: ['requirements.write'] },
  { label: /^(?:\+ ?)?(?:new|raise|create|generate|issue)\b.*\b(?:bill|invoice)\b/i, needs: ['invoices.issue'] },
  { label: /^(?:\+ ?)?(?:new|raise|create)\b.*\b(?:order|po)\b/i, needs: ['invoices.issue'] },
  { label: /^run\b.*\bpayroll\b/i, needs: ['payroll.run'] },
  { label: /^record\b.*\bpayment\b/i, needs: ['payments.record'] },
  { label: /^approve\b/i, path: /timesheet|hours|program/, needs: ['timesheets.approve'] },
  { label: /^(?:\+ ?)?(?:submit|put forward)\b/i, path: /submission|requirement|bench/, needs: ['submissions.create'] },
  { label: /^invite\b.*\b(?:teammate|user|person|colleague)\b/i, needs: ['team.manage'] },
  { label: /^(?:\+ ?)?(?:new|create)\b.*\bcontract\b/i, needs: ['assignments.write'] },
  { label: /^(?:\+ ?)?add\b.*\b(?:supplier|vendor)\b/i, needs: ['vendors.manage'] },
]

function uniq(xs) {
  return [...new Set(xs)]
}

function short(s, n = 90) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/** The sentence around a match, so the report shows where it was. */
function around(text, index, len) {
  const start = Math.max(0, index - 30)
  const end = Math.min(text.length, index + len + 30)
  return short(text.slice(start, end), 80)
}

/**
 * The first refusal sentence in a page's text, or null.
 *
 * A 403 message from the page's own API calls counts when the page
 * prints it: that is the route refusing, said on the screen.
 */
export function refusalIn(text, refusedMessages = []) {
  const t = String(text ?? '')
  for (const m of refusedMessages) {
    const probe = short(m, 60).replace(/…$/, '')
    if (probe.length >= 12 && t.includes(probe)) return short(m)
  }
  for (const re of REFUSAL_PHRASES) {
    const hit = re.exec(t)
    if (hit) return around(t, hit.index, hit[0].length)
  }
  return null
}

/**
 * Checks on one page. `facts` is what the browser read:
 *
 *   mainText       the visible text of <main> (or the body without one)
 *   bodyText       the visible text of the whole page
 *   denied         true when the app drew its own "Not open to you" screen
 *   tabs           how many role="tab" elements are visible
 *   tables         how many tables are visible
 *   figures        how many leaf elements show only a number or an amount
 *   buttons        visible button labels inside <main>
 *   status         the page's own HTTP status
 *   apiFailures    [{ url, status, message }] — /api calls that were 4xx/5xx
 *   consoleErrors  [string]
 *   phone          { scrollWidth, clientWidth } at 390px, or null
 *   writes         ["POST /api/x"] — non-GET requests sent by opening the page
 *
 * `desk` is `{ permissions: string[] }`, or null when unknown.
 *
 * @param {Record<string, any>} facts
 * @param {{ permissions: string[] } | null} [desk]
 * @returns {{ kind: string, what: string }[]}
 */
export function checkPage(facts, desk = null) {
  const problems = []
  const add = (kind, what) => problems.push({ kind, what })
  const main = String(facts.mainText ?? '')
  const body = String(facts.bodyText ?? main)
  const apiFailures = facts.apiFailures ?? []

  // Broken before refused: an error page is its own finding.
  const broken = BROKEN_PHRASES.find((p) => body.includes(p))
  if (broken || (facts.status ?? 200) >= 400) {
    add('error-page', broken ? `The page says "${broken}".` : `The page answered HTTP ${facts.status}.`)
  } else if (!facts.denied && main.trim().length < 20) {
    add('error-page', 'The page shows almost nothing.')
  }

  const refusedMessages = apiFailures.filter((f) => f.status === 401 || f.status === 403).map((f) => f.message).filter(Boolean)
  const refusal = facts.denied ? short(main.split('\n').filter(Boolean).slice(1, 3).join(' ')) || 'Not open to you' : refusalIn(main, refusedMessages)
  if (refusal) {
    add('refused', `The menu offers this page and it refuses: "${refusal}"`)
    const around = []
    if ((facts.figures ?? 0) > 0) around.push(`${facts.figures} figure${facts.figures === 1 ? '' : 's'}`)
    if ((facts.tabs ?? 0) > 0) around.push(`${facts.tabs} tab${facts.tabs === 1 ? '' : 's'}`)
    if ((facts.tables ?? 0) > 0) around.push(`${facts.tables} table${facts.tables === 1 ? '' : 's'}`)
    if (!facts.denied && around.length > 0) {
      add('refusal-with-figures', `Refuses, yet shows ${around.join(', ')} around the refusal.`)
    }
  }

  for (const f of apiFailures) {
    add('api-error', `${f.method ?? 'GET'} ${f.url} answered ${f.status}${f.message ? `: "${short(f.message, 70)}"` : ''}`)
  }
  for (const e of uniq(facts.consoleErrors ?? [])) {
    add('console-error', short(e))
  }

  const dates = uniq([...body.matchAll(ISO_DATE)].map((m) => m[0]))
  if (dates.length > 0) {
    const first = body.search(ISO_DATE)
    add('iso-date', `Shows ${dates.slice(0, 3).join(', ')}${dates.length > 3 ? ` and ${dates.length - 3} more` : ''} — e.g. "${around(body, first, 10)}"`)
  }

  const keys = uniq([...body.matchAll(PERMISSION_KEY)].map((m) => m[0]))
  const codes = uniq([...body.matchAll(RAW_CODE)].map((m) => m[0]))
  if (keys.length > 0) add('raw-code', `Shows the permission key${keys.length === 1 ? '' : 's'} ${keys.slice(0, 4).join(', ')}.`)
  if (codes.length > 0) add('raw-code', `Shows the code${codes.length === 1 ? '' : 's'} ${codes.slice(0, 4).join(', ')}.`)

  // `*` is the owner's seat: every permission.
  if (desk && Array.isArray(desk.permissions) && !desk.permissions.includes('*') && !refusal) {
    const held = new Set(desk.permissions)
    const path = String(facts.path ?? '')
    for (const label of uniq(facts.buttons ?? [])) {
      const rule = ACTION_PERMISSIONS.find((r) => r.label.test(label) && (!r.path || r.path.test(path)))
      if (rule && !rule.needs.some((p) => held.has(p))) {
        add('action-without-permission', `"${short(label, 40)}" is offered; this desk holds none of ${rule.needs.join(', ')}.`)
      }
    }
  }

  for (const w of facts.writes ?? []) {
    add('writes-on-open', `Sent ${w} just by opening; the walk refused to let it through.`)
  }

  if (facts.phone && facts.phone.scrollWidth > facts.phone.clientWidth + 1) {
    add('phone-overflow', `At 390px the page is ${facts.phone.scrollWidth}px wide.`)
  }

  return problems
}

/**
 * Checks on one menu. `nav` is `[{ label, links: [{ label, href }] }]`.
 */
export function checkNav(nav) {
  const problems = []
  const seen = new Map()
  for (const section of nav ?? []) {
    if (!section.links || section.links.length === 0) {
      problems.push({ kind: 'nav-empty-heading', what: `"${section.label}" has no links under it.` })
    }
    for (const link of section.links ?? []) {
      const key = link.label.trim().toLowerCase()
      if (seen.has(key)) {
        problems.push({
          kind: 'nav-duplicate-label',
          what: `"${link.label}" appears twice — under ${seen.get(key)} and under ${section.label}.`,
        })
      } else {
        seen.set(key, section.label)
      }
    }
  }
  return problems
}

/** The phone menu against the desktop one: labels missing from either. */
export function comparePhoneNav(desktop, phone) {
  const flat = (nav) => new Set((nav ?? []).flatMap((s) => (s.links ?? []).map((l) => `${s.label} › ${l.label}`)))
  const a = flat(desktop)
  const b = flat(phone)
  const problems = []
  const missing = [...a].filter((x) => !b.has(x))
  const extra = [...b].filter((x) => !a.has(x))
  if (missing.length) problems.push({ kind: 'nav-phone-differs', what: `Missing on the phone: ${missing.slice(0, 5).join('; ')}` })
  if (extra.length) problems.push({ kind: 'nav-phone-differs', what: `Only on the phone: ${extra.slice(0, 5).join('; ')}` })
  return problems
}

// ── Fixture HTML, for the tests ───────────────────────────────────────
//
// The browser reads facts with the real DOM. The tests have no browser,
// so this reads the same facts off a string, roughly: tags stripped,
// hidden elements ignored only when marked `hidden`. Good enough to hold
// the checks to their sentences; never used on a live page.

function textOf(html) {
  return String(html)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*\bhidden\b[^>]*>[\s\S]*?<\/[a-z0-9]+>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|header|nav)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

export const FIGURE = /^[$€£₹]?\s?-?[\d,]+(?:\.\d+)?\s?[%kKmM]?$/

/**
 * @param {string} html
 * @param {Record<string, any>} [extra]
 * @returns {Record<string, any>}
 */
export function factsFromHtml(html, extra = {}) {
  const s = String(html)
  const mainMatch = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(s)
  const main = mainMatch ? mainMatch[1] : s
  const leaves = [...main.matchAll(/<([a-z0-9]+)[^>]*>([^<]*)<\/\1>/gi)].map((m) => m[2].trim()).filter(Boolean)
  return {
    mainText: textOf(main),
    bodyText: textOf(s),
    denied: /not open to you/i.test(textOf(main).split('\n')[0] ?? ''),
    tabs: (main.match(/role=["']tab["']/gi) ?? []).length,
    tables: (main.match(/<table\b/gi) ?? []).length,
    figures: leaves.filter((t) => FIGURE.test(t)).length,
    buttons: [...main.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)].map((m) => textOf(m[1])).filter(Boolean),
    status: 200,
    apiFailures: [],
    consoleErrors: [],
    phone: null,
    ...extra,
  }
}

export function navFromHtml(html) {
  const sections = []
  for (const m of String(html).matchAll(/<section[^>]*data-label=["']([^"']+)["'][^>]*>([\s\S]*?)<\/section>/gi)) {
    const links = [...m[2].matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((l) => ({ href: l[1], label: textOf(l[2]) }))
    sections.push({ label: m[1], links })
  }
  return sections
}
