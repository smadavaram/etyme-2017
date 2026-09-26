#!/usr/bin/env node
/**
 * The functional user, automated.
 *
 * CLAUDE.md's own etyme-release agent is described as walking a feature
 * "the way a person would, on the running app" — this is that, run for
 * real, against the real preview, from all three seats: the company
 * hiring, the supplier, and the candidate.
 *
 * What it does, per persona:
 *   1. Opens a fresh, cookie-isolated browser context — nobody's demo
 *      workspace leaks into anybody else's, same as a real visitor.
 *   2. Clicks the real "See it as..." button on the home page. Not a
 *      direct API call — if that button ever breaks, this notices.
 *   3. Reads every link the sidebar actually renders for that persona,
 *      and visits each one.
 *   4. Records, per screen: the HTTP status, any browser console error,
 *      any uncaught page error, whether the page reads as broken (an
 *      error boundary, a Next.js error page, or a body with nothing in
 *      it), and a screenshot.
 *
 * What it will not do: guess. A screen that loads with no errors and
 * visible content is reported as fine even if the content is wrong in a
 * way only a person would catch — layout, wording, whether a number
 * looks right. This finds "broken"; a person still has to judge "right".
 *
 * Usage:
 *   node scripts/walkthrough.mjs
 *   WALKTHROUGH_URL=http://localhost:3100 node scripts/walkthrough.mjs
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.WALKTHROUGH_URL ?? 'https://etyme2040.vercel.app'
const OUT_DIR = process.env.WALKTHROUGH_OUT ?? join(__dirname, '..', 'walkthrough-report')
const SHOTS_DIR = join(OUT_DIR, 'screens')

mkdirSync(SHOTS_DIR, { recursive: true })

/** One entry per demo door on the home page. Label must match exactly —
 *  if a future copy change drops one of these, this script fails loudly
 *  instead of silently skipping a persona. */
const PERSONAS = [
  { key: 'company', label: 'See it as the company →', name: 'The company hiring' },
  { key: 'supplier', label: 'See it as the supplier →', name: 'The supplier' },
  { key: 'candidate', label: 'See it as a candidate →', name: 'The candidate' },
]

/** Phrases that mean the page rendered but is telling on itself. Deliberately
 *  not a bare "500" — a real screen showing "$8,500" would false-positive
 *  on that, and a wrong finding costs more trust than a missed one. */
const BROKEN_MARKERS = [
  'Application error',
  'This page could not be found',
  'Something went wrong',
  'Unhandled Runtime Error',
  'Internal Server Error',
]

/** The real browser binary Chromium ships under, whatever build number
 *  the sandbox image happens to have — resolved once, not pinned. */
function findPreinstalledChrome() {
  const root = '/opt/pw-browsers'
  if (!existsSync(root)) return null
  const dir = readdirSync(root).find((d) => d.startsWith('chromium-'))
  if (!dir) return null
  const bin = join(root, dir, 'chrome-linux', 'chrome')
  return existsSync(bin) ? bin : null
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

async function walkPersona(browser, persona) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(String(err)))

  const screens = []
  const personaErrors = []

  try {
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 45_000 })

    // Two elements can legitimately say this — the hero CTA and the
    // closing-section one further down — .first() picks the hero door,
    // same one a real visitor sees without scrolling.
    const button = page.getByText(persona.label, { exact: true }).first()
    const visible = await button.isVisible().catch(() => false)
    if (!visible) {
      personaErrors.push(`Home page has no button/link that says "${persona.label}" — the door itself is missing.`)
      await context.close()
      return { persona, screens, personaErrors, consoleErrors: [], pageErrors: [] }
    }

    consoleErrors.length = 0
    pageErrors.length = 0
    await button.click()
    // A cold serverless function seeding a whole demo workspace can take
    // real seconds on a live deployment, not just a local one. One retry
    // on the click before calling the door itself broken — a single slow
    // first request is a cold start, not a finding.
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 }).catch(async () => {
      if (!page.url().includes('/dashboard')) {
        await button.click().catch(() => {})
        await page.waitForURL(/\/dashboard/, { timeout: 30_000 }).catch(() => {})
      }
    })

    // Give the dashboard shell a moment to render the sidebar for this
    // persona before reading it — the nav is client-rendered from /api/me.
    await page.waitForTimeout(1500)

    const landedUrl = page.url()
    if (!landedUrl.includes('/dashboard')) {
      personaErrors.push(`Clicking "${persona.label}" never reached a /dashboard page — landed on ${landedUrl}.`)
      await context.close()
      return { persona, screens, personaErrors, consoleErrors: [...consoleErrors], pageErrors: [...pageErrors] }
    }

    // Every link the sidebar actually renders for this persona — not a
    // hardcoded list, so this stays correct as the nav changes.
    const hrefs = await page.$$eval('nav a[href^="/dashboard"]', (as) =>
      [...new Set(as.map((a) => a.getAttribute('href')))]
    )

    if (hrefs.length === 0) {
      personaErrors.push('Landed on a dashboard page, but the sidebar rendered no links at all.')
    }

    for (const href of hrefs) {
      consoleErrors.length = 0
      pageErrors.length = 0
      const url = new URL(href, BASE_URL).toString()

      // 'load', not 'networkidle' — a page that keeps one connection open
      // (polling, a websocket) is not broken, and networkidle would call
      // it a navigation failure for staying open like it is supposed to.
      let status = null
      let navError = null
      try {
        const res = await page.goto(url, { waitUntil: 'load', timeout: 25_000 })
        status = res ? res.status() : null
      } catch (err) {
        navError = String(err.message ?? err)
      }

      // A beat for client-rendered data to arrive after 'load' fires —
      // most of these screens fetch their own data client-side.
      await page.waitForTimeout(1200)

      const bodyText = await page.evaluate(() => document.body.innerText || '').catch(() => '')
      const bodyTrimmed = bodyText.trim()
      const brokenMarker = BROKEN_MARKERS.find((m) => bodyTrimmed.includes(m))
      const looksEmpty = bodyTrimmed.length < 20

      const shotName = `${slug(persona.key)}__${slug(href)}.png`
      await page.screenshot({ path: join(SHOTS_DIR, shotName), fullPage: false }).catch(() => {})

      const ok =
        !navError &&
        (status === null || status < 400) &&
        !brokenMarker &&
        !looksEmpty &&
        consoleErrors.length === 0 &&
        pageErrors.length === 0

      screens.push({
        href,
        url,
        status,
        ok,
        navError,
        brokenMarker: brokenMarker ?? null,
        looksEmpty,
        consoleErrors: [...consoleErrors],
        pageErrors: [...pageErrors],
        screenshot: `screens/${shotName}`,
      })
    }
  } catch (err) {
    personaErrors.push(`Walking this persona threw before it could finish: ${err.message ?? err}`)
  }

  await context.close()
  return { persona, screens, personaErrors, consoleErrors: [], pageErrors: [] }
}

function renderReport(results) {
  const now = new Date().toISOString()
  const rows = results.flatMap((r) =>
    r.screens.map((s) => ({ persona: r.persona.name, ...s }))
  )
  const totalScreens = rows.length
  const failing = rows.filter((r) => !r.ok)
  const personaFailures = results.flatMap((r) =>
    r.personaErrors.map((e) => ({ persona: r.persona.name, message: e }))
  )

  const escape = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  const rowsHtml = rows
    .map(
      (r) => `
      <tr class="${r.ok ? 'ok' : 'fail'}">
        <td>${escape(r.persona)}</td>
        <td><code>${escape(r.href)}</code></td>
        <td>${r.ok ? 'OK' : 'BROKEN'}</td>
        <td>${r.status ?? '—'}</td>
        <td>${
          [
            r.navError && `navigation failed: ${escape(r.navError)}`,
            r.brokenMarker && `page says "${escape(r.brokenMarker)}"`,
            r.looksEmpty && 'page rendered almost no visible text',
            r.consoleErrors.length && `${r.consoleErrors.length} console error(s): ${escape(r.consoleErrors[0])}`,
            r.pageErrors.length && `${r.pageErrors.length} uncaught error(s): ${escape(r.pageErrors[0])}`,
          ]
            .filter(Boolean)
            .join('<br>') || '—'
        }</td>
        <td><a href="${escape(r.screenshot)}" target="_blank">screenshot</a></td>
      </tr>`
    )
    .join('')

  const personaFailHtml = personaFailures
    .map((f) => `<li><strong>${escape(f.persona)}:</strong> ${escape(f.message)}</li>`)
    .join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Functional walkthrough — ${escape(BASE_URL)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; margin: 0; padding: 32px; background: #F0EEE6; color: #1F1E1D; }
  h1 { font-size: 22px; }
  .meta { color: #6B6862; font-size: 13px; margin-bottom: 24px; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; }
  .stat { background: #FFFFFF; border: 1px solid #E3DFD5; border-radius: 8px; padding: 12px 16px; }
  .stat .n { font-size: 24px; font-weight: 600; }
  .stat.bad .n { color: #C0622E; }
  .stat.good .n { color: #4F6F52; }
  table { width: 100%; border-collapse: collapse; background: #FFFFFF; border: 1px solid #E3DFD5; border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #E3DFD5; font-size: 13px; vertical-align: top; }
  th { background: #FBFAF7; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; color: #6B6862; }
  tr.fail { background: #FBEDEA; }
  code { font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
  .personaFail { background: #FBEDEA; border: 1px solid #C0622E; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; }
</style>
</head>
<body>
  <h1>Functional walkthrough</h1>
  <p class="meta">Against ${escape(BASE_URL)} · ${escape(now)}</p>

  <div class="summary">
    <div class="stat"><div class="n">${totalScreens}</div>screens visited</div>
    <div class="stat good"><div class="n">${totalScreens - failing.length}</div>ok</div>
    <div class="stat bad"><div class="n">${failing.length}</div>broken</div>
  </div>

  ${personaFailHtml ? `<div class="personaFail"><strong>Could not even get into a persona:</strong><ul>${personaFailHtml}</ul></div>` : ''}

  <table>
    <thead><tr><th>Persona</th><th>Screen</th><th>Result</th><th>HTTP</th><th>What's wrong</th><th></th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`
}

async function main() {
  console.log(`Walking ${BASE_URL} as: ${PERSONAS.map((p) => p.name).join(', ')}`)
  // The sandbox ships a pinned Chromium build outside Playwright's own
  // cache; point at it directly rather than let Playwright try to
  // download a version matched to whatever @playwright/test happens to
  // be pinned to in package.json, which can drift from what is on disk.
  const preinstalled = findPreinstalledChrome()
  // Chromium does not pick up HTTPS_PROXY from the environment on its
  // own the way curl/Node's own fetch do — it has to be told explicitly,
  // or every request it makes tries a direct connection this sandbox's
  // network does not allow, and dies a few seconds in.
  // Skip the proxy when the target is local — the sandbox's proxy only
  // speaks HTTPS CONNECT, and a plain-HTTP localhost request through it
  // is refused outright rather than just failing to help.
  const isLocalTarget = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(BASE_URL)
  const proxyServer = isLocalTarget ? null : (process.env.HTTPS_PROXY ?? process.env.https_proxy)
  const browser = await chromium.launch({
    ...(preinstalled ? { executablePath: preinstalled } : {}),
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
  })
  const results = []
  for (const persona of PERSONAS) {
    console.log(`  → ${persona.name}`)
    const result = await walkPersona(browser, persona)
    console.log(`    ${result.screens.length} screens, ${result.screens.filter((s) => !s.ok).length} broken, ${result.personaErrors.length} persona-level problem(s)`)
    results.push(result)
  }
  await browser.close()

  const html = renderReport(results)
  const reportPath = join(OUT_DIR, 'report.html')
  writeFileSync(reportPath, html)

  const jsonPath = join(OUT_DIR, 'report.json')
  writeFileSync(jsonPath, JSON.stringify(results, null, 2))

  const totalBroken = results.reduce((n, r) => n + r.screens.filter((s) => !s.ok).length, 0)
  const totalPersonaFail = results.reduce((n, r) => n + r.personaErrors.length, 0)
  console.log(`\nReport: ${reportPath}`)
  if (totalBroken > 0 || totalPersonaFail > 0) {
    console.log(`${totalBroken} broken screen(s), ${totalPersonaFail} persona-level problem(s).`)
    process.exitCode = 1
  } else {
    console.log('Every screen visited loaded clean.')
  }
}

main().catch((err) => {
  console.error('walkthrough crashed:', err)
  process.exitCode = 1
})
