#!/usr/bin/env node
/**
 * Type something on one screen. Check it comes out on another.
 *
 * ── What this adds over render-check ─────────────────────────────────
 *
 * `render-check` opens all 148 pages and asks whether they draw. It
 * cannot tell whether they *work*: a form that posts nothing, a list
 * that never refetches, a field silently dropped between the modal and
 * the table would all pass it.
 *
 * This types into the real form, submits it, navigates somewhere else,
 * and looks for what it typed. Input on one screen, output on another —
 * which is the only definition of "works" a person would accept.
 *
 * ── Why the values are unique per run ────────────────────────────────
 *
 * Every flow invents a name with a timestamp in it. A demo workspace
 * accumulates rows, and asserting on "SAP FICO Consultant" would pass on
 * a row somebody else's run created. Finding the exact string this run
 * typed is the only thing that proves the round trip.
 *
 * ── Why it looks for the value, not for a toast ──────────────────────
 *
 * A success message means the form thought it worked. The row on the
 * next screen means it did.
 *
 *   node scripts/screen-flows.mjs [baseUrl]
 */

import { chromium } from 'playwright'
import { readdirSync, existsSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const CHROME =
  process.env.CHROME ??
  readdirSync('/opt/pw-browsers')
    .filter((d) => /^chromium-\d+$/.test(d))
    .map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)
    .find(existsSync)

const stamp = Date.now().toString().slice(-6)
const results = []

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${detail}`}`)
}

/** A demo workspace of the given seat, in its own browser context. */
async function seatedAs(browser, seat) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const seeded = await page.evaluate(async (s) => {
    const r = await fetch('/api/demo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ side: s }),
    })
    return r.ok ? await r.json() : null
  }, seat)
  if (!seeded) throw new Error(`could not seed a ${seat} workspace`)
  return { ctx, page }
}

/**
 * Fill by the label a person actually reads, not by a test id.
 *
 * Three attempts, and the order records something worth knowing. The
 * first — Playwright's own getByLabel — is the one that *should* work
 * and does not: these forms render the label as a sibling of the input
 *
 *   <div><label>Full name *</label><input ...></div>
 *
 * with no `for` attribute and no wrapping. So nothing associates the two
 * except their position, which means a screen reader announces an
 * unlabelled text box. That is a real accessibility defect and this
 * function falls back around it rather than hiding it.
 */
async function fill(page, label, value) {
  const attempts = [
    () => page.getByLabel(new RegExp(label, 'i')).first(),
    () => page.locator(`label:has-text("${label}") + input, label:has-text("${label}") + textarea`).first(),
    () => page.locator(`div:has(> label:has-text("${label}")) input`).first(),
  ]
  for (const make of attempts) {
    const box = make()
    if (await box.count()) {
      await box.waitFor({ state: 'visible', timeout: 10_000 })
      await box.fill(value)
      return
    }
  }
  throw new Error(`no field found for "${label}"`)
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
}

/** Whether the text is anywhere on the page a person can see. */
const shows = async (page, text) =>
  (await page.evaluate(() => document.body.innerText ?? '')).includes(text)

const browser = await chromium.launch({ executablePath: CHROME })

// ── Flow 1 ───────────────────────────────────────────────────────────
//
// A vendor adds somebody, and the bench knows about it. This also walks
// straight through the consent work: a consultant added today starts
// INVITED, so the bench must say they are not ready to send rather than
// listing them as if they had agreed.
try {
  console.log('\nFlow 1 — add a consultant, find them on the bench')
  const { ctx, page } = await seatedAs(browser, 'BENCH')
  const name = `Screen Test ${stamp}`

  await goto(page, '/dashboard/consultants')
  await page.getByRole('button', { name: 'Add consultant' }).first().click()
  await fill(page, 'Full name', name)
  await fill(page, 'Email', `screen.${stamp}@seed.etyme.invalid`)
  await fill(page, 'Headline', 'SAP FICO Consultant')
  await fill(page, 'Skills', 'SAP FICO, ABAP')
  await fill(page, 'Location', 'Dallas, TX')
  await page.getByRole('button', { name: 'Add consultant' }).last().click()
  await page.waitForTimeout(3000)

  record('the consultant list shows them after adding', await shows(page, name), 'not on the list they were added from')

  await goto(page, '/dashboard/bench')
  record('the bench screen shows them too', await shows(page, name), 'added but absent from the bench')

  // The consent work, seen from the screen rather than the database.
  const text = await page.evaluate(() => document.body.innerText ?? '')
  const invited = /invited|not answered|awaiting|cannot be put forward|pending/i.test(text)
  record('the bench says they have not answered yet', invited, 'listed with no sign consent is outstanding')

  await ctx.close()
} catch (e) {
  record('add a consultant, find them on the bench', false, String(e.message).slice(0, 90))
}

// ── Flow 2 ───────────────────────────────────────────────────────────
try {
  console.log('\nFlow 2 — raise a requirement, find it on the list')
  const { ctx, page } = await seatedAs(browser, 'CLIENT')
  const title = `Screen Req ${stamp}`

  await goto(page, '/dashboard/requirements')
  await page.getByRole('button', { name: 'New requirement' }).first().click()
  await page.waitForTimeout(800)
  const manual = page.getByRole('button', { name: 'Manual entry' })
  if (await manual.count()) await manual.first().click()

  await fill(page, 'Title', title)
  await fill(page, 'Required skills', 'SAP FICO')
  await fill(page, 'Location', 'Dallas, TX')
  await page.getByRole('button', { name: 'Create requirement' }).first().click()
  await page.waitForTimeout(3000)

  record('the requirement list shows it after creating', await shows(page, title), 'created but not on the list')

  await goto(page, '/dashboard/requirements')
  record('and it is still there on a fresh load', await shows(page, title), 'vanished on reload — not persisted')

  await ctx.close()
} catch (e) {
  record('raise a requirement, find it on the list', false, String(e.message).slice(0, 90))
}

// ── Flow 3 ───────────────────────────────────────────────────────────
//
// The search box is the first of the eight things the UX stress test
// says to build before features, and a list that ignores it is worse
// than one without it.
try {
  console.log('\nFlow 3 — search narrows a list to what was typed')
  const { ctx, page } = await seatedAs(browser, 'BENCH')
  await goto(page, '/dashboard/bench')

  const before = await page.evaluate(() => (document.body.innerText.match(/\n/g) ?? []).length)
  const box = page.getByPlaceholder(/Search by name/i).first()
  await box.fill('zzzznotarealconsultantzzzz')
  await page.waitForTimeout(2000)
  const after = await page.evaluate(() => (document.body.innerText.match(/\n/g) ?? []).length)

  record('searching for nothing leaves fewer rows than before', after < before, `${before} lines before, ${after} after`)

  await box.fill('')
  await page.waitForTimeout(2000)
  const restored = await page.evaluate(() => (document.body.innerText.match(/\n/g) ?? []).length)
  record('clearing the search brings them back', restored >= before - 2, `${restored} lines, expected about ${before}`)

  await ctx.close()
} catch (e) {
  record('search narrows a list', false, String(e.message).slice(0, 90))
}

await browser.close()

const ok = results.filter((r) => r.ok).length
console.log(`\n${'='.repeat(70)}`)
console.log(`${ok} of ${results.length} round trips worked`)
console.log('='.repeat(70))
if (ok < results.length) {
  console.log('\nWhat did not:')
  for (const r of results.filter((x) => !x.ok)) console.log(`  ${r.name} — ${r.detail}`)
  process.exit(1)
}
console.log('\nWhat was typed on one screen came out on the next.\n')
