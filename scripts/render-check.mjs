#!/usr/bin/env node
/**
 * Open every page a persona can reach, and see whether it renders.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * Nearly four thousand tests pass without any of them loading a page.
 * The unit suite tests rules; the integration suite calls route handlers
 * directly. Both are blind to the entire class of bug where the server
 * is right and the screen is broken.
 *
 * That class has shipped twice. `/packet/[token]` and `/reply/[token]`
 * both threw on render — `use(params)` throws on Next 14, where a client
 * component's params is a plain object — and every test passed, because
 * `tsc` believed the annotation and `next build` compiles a client
 * component without rendering it. Found by taking a screenshot.
 *
 * A consultant with an expired session saw "Failed to execute 'json' on
 * 'Response'". Same story: found by looking.
 *
 * ── Why it reads the nav from the page ───────────────────────────────
 *
 * The destinations come out of the rendered sidebar, not from the NAV
 * constants in the source. A list copied from the source drifts from the
 * source; a list read from the DOM is the thing a person can actually
 * click, which is the thing being checked.
 *
 * ── What counts as broken ────────────────────────────────────────────
 *
 * A non-200, Next's error overlay, an error boundary, an uncaught
 * console exception, or a page whose main region is empty. That last one
 * matters: a screen that renders its shell and nothing else passes every
 * other check and is useless to look at.
 *
 *   node scripts/render-check.mjs [baseUrl]
 */

import { chromium } from 'playwright'
import { readdirSync, existsSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3000'
// Resolved rather than pinned: the sandbox image bumps the chromium
// build number and a hard-coded path breaks on the next one.
const CHROME =
  process.env.CHROME ??
  readdirSync('/opt/pw-browsers')
    .filter((d) => /^chromium-\d+$/.test(d))
    .map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)
    .find(existsSync)

/** One demo seat per navigation surface, plus the two that share one. */
const PERSONAS = [
  { seat: 'CLIENT', nav: 'CLIENT_NAV' },
  { seat: 'GSI', nav: 'GSI_NAV' },
  { seat: 'PRIME', nav: 'VENDOR_NAV' },
  { seat: 'MSP', nav: 'VENDOR_NAV (falls through)' },
  { seat: 'CANDIDATE', nav: 'CONSULTANT_NAV' },
]

/** Pages a stranger opens, with a token that is deliberately invalid. */
const PUBLIC = [
  '/', '/packet/not-a-token', '/reply/not-a-token', '/bench-invite/not-a-token',
  '/claim/not-a-token', '/answer/not-a-token',
]

const bad = []
const rows = []
/** Destinations per persona, to catch a harness that authenticated as one user. */
const seen = new Map()

async function check(page, url, who) {
  let consoleError = null
  const onError = (e) => { consoleError ??= String(e.message ?? e).slice(0, 120) }
  page.on('pageerror', onError)

  let status = 0
  try {
    const res = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 45_000 })
    status = res?.status() ?? 0
  } catch (e) {
    page.off('pageerror', onError)
    return note(who, url, 0, `did not load: ${String(e.message).slice(0, 70)}`)
  }
  // Client components fetch after mount; a page judged before that is
  // judged on its loading state.
  await page.waitForTimeout(1200)
  page.off('pageerror', onError)

  const body = await page.evaluate(() => {
    const t = document.body.innerText ?? ''
    const main = document.querySelector('main') ?? document.body
    return {
      text: t.slice(0, 4000),
      mainLength: (main.innerText ?? '').trim().length,
      overlay: Boolean(document.querySelector('nextjs-portal')),
    }
  })

  if (status >= 400) return note(who, url, status, `HTTP ${status}`)
  if (body.overlay) return note(who, url, status, 'Next error overlay')
  if (consoleError) return note(who, url, status, `threw: ${consoleError}`)
  if (/Unhandled Runtime Error|Application error|Something went wrong/i.test(body.text)) {
    return note(who, url, status, 'error boundary')
  }
  // A shell with nothing in it passes every other check and is useless.
  if (body.mainLength < 40) return note(who, url, status, 'renders empty')

  rows.push({ who, url, status, ok: true })
}

function note(who, url, status, why) {
  bad.push({ who, url, status, why })
  rows.push({ who, url, status, ok: false, why })
}

const browser = await chromium.launch({ executablePath: CHROME })

for (const p of PERSONAS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()

  // Seed inside the browser, so the demo cookie lands in this context
  // and no cookie jar has to be carried across.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const seeded = await page.evaluate(async (seat) => {
    const r = await fetch('/api/demo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ side: seat }),
    })
    return r.ok ? await r.json() : { error: await r.text() }
  }, p.seat)

  if (seeded.error) {
    note(p.seat, '/api/demo', 0, `could not seed: ${String(seeded.error).slice(0, 80)}`)
    await ctx.close()
    continue
  }

  await page.goto(`${BASE}${seeded.data?.landing ?? '/dashboard'}`, { waitUntil: 'networkidle' })

  // The destinations as rendered, not as written in the source.
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('nav a[href^="/dashboard"], aside a[href^="/dashboard"]')]
      .map((a) => a.getAttribute('href'))
      .filter((h, i, all) => h && all.indexOf(h) === i)
  )

  console.log(`\n${p.seat} — ${links.length} destinations (${p.nav})`)
  seen.set(p.seat, links.join('|'))
  for (const href of links) await check(page, href, p.seat)
  await ctx.close()
}

// If every persona sees the same navigation, the harness is broken and
// not the app — and a green run then means one persona was checked five
// times. That is exactly what happened the first time this ran, with
// DEV_BYPASS_AUTH set in .env.local overriding every demo cookie, so
// all five arrived as the same company-less user and got the
// consultant's four links.
const distinct = new Set(seen.values())
if (seen.size > 1 && distinct.size === 1) {
  console.error(
    `\nEvery persona saw the same ${[...seen.values()][0].split('|').length} destinations.\n` +
    `That is a broken harness, not a passing app — check DEV_BYPASS_AUTH is unset.\n`
  )
  process.exit(2)
}

// The doors a stranger opens, with no session at all.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
console.log(`\nPUBLIC — ${PUBLIC.length} pages, signed out`)
for (const url of PUBLIC) await check(page, url, 'public')
await ctx.close()
await browser.close()

const total = rows.length
const okCount = rows.filter((r) => r.ok).length
console.log(`\n${'='.repeat(72)}`)
console.log(`${okCount} of ${total} rendered`)
console.log('='.repeat(72))

if (bad.length) {
  console.log(`\n${bad.length} did not:\n`)
  for (const b of bad) console.log(`  ${b.who.padEnd(10)} ${b.url.padEnd(40)} ${b.why}`)
  process.exit(1)
}
console.log('\nEvery page a persona can reach renders with something on it.\n')
