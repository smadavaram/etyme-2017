#!/usr/bin/env node
/**
 * Every page a persona can reach, on a phone.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The founder opened the app on his phone and sent two screenshots: the
 * left edge of every screen cut off, no navigation anywhere, no way to
 * sign out. Four thousand tests were green. None of them had ever laid
 * the page out at 390 pixels, because none of them lays anything out —
 * render-check.mjs opens every page, at 1280 wide.
 *
 * This is render-check at phone width, asking the two questions a phone
 * asks: can I get anywhere from here, and is anything sticking out past
 * the edge of the screen.
 *
 * ── What it checks ───────────────────────────────────────────────────
 *
 * The shell, once per persona:
 *   · the ☰ is on screen and opens a menu with the persona's own
 *     destinations in it
 *   · the header is no wider than the phone
 *   · the bell, the +, the search and the account each open somewhere
 *     inside the screen, not off its right edge
 *   · Sign out is in the menu, and tapping it actually signs out — the
 *     demo cookie goes too, not only NextAuth's
 *
 * Every page, read off the menu as rendered:
 *   · nothing is positioned past the right or left edge of the viewport,
 *     unless it sits inside its own horizontally scrolling container —
 *     a wide table in an overflow-x:auto box is a working surface, not a
 *     defect. Reported by the outermost element that sticks out, which
 *     is the one to fix.
 *   · the page heading is not squeezed into a sliver beside its buttons
 *     — the desktop head row that never stacks
 *   · the page came up at all (status, error overlay, uncaught throw)
 *
 * ── Usage ────────────────────────────────────────────────────────────
 *
 *   node scripts/phone-check.mjs [baseUrl]
 *   PHONE_WIDTH=360 PHONE_OUT=/tmp/phone node scripts/phone-check.mjs
 *   PHONE_PERSONA=CLIENT PHONE_ONLY=/dashboard/invoices node scripts/phone-check.mjs
 *     — one page, one seat, after fixing it; skips the shell and sign-out checks
 *
 * Writes report.json and a screenshot per page under PHONE_OUT
 * (default ./phone-report, git-ignored). Exit 1 on any finding.
 */

import { chromium } from 'playwright'
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const WIDTH = Number(process.env.PHONE_WIDTH ?? 390)
const HEIGHT = 844
const OUT = process.env.PHONE_OUT ?? 'phone-report'
const ONLY = process.env.PHONE_ONLY // a substring of a url, to re-check one page
const PERSONA = process.env.PHONE_PERSONA // one seat (CLIENT, PRIME, CANDIDATE, NIKE-AP), to re-check one

// Resolved rather than pinned: the sandbox image bumps the chromium
// build number and a hard-coded path breaks on the next one.
const CHROME =
  process.env.CHROME ??
  readdirSync('/opt/pw-browsers')
    .filter((d) => /^chromium-\d+$/.test(d))
    .map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)
    .find(existsSync)

mkdirSync(join(OUT, 'screens'), { recursive: true })

/** One demo seat per navigation surface, plus a seeded client desk when
 *  the world has been built (optional: absent world is not a finding). */
const PERSONAS = [
  { seat: 'CLIENT', body: { side: 'CLIENT' } },
  { seat: 'PRIME', body: { side: 'PRIME' } },
  { seat: 'CANDIDATE', body: { side: 'CANDIDATE' } },
  { seat: 'NIKE-AP', body: { as: 'world-nike', desk: 'ap' }, optional: true },
]

/** Pages a stranger opens. */
const PUBLIC = ['/', '/login', '/demo']

const findings = []
const rows = []

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function finding(who, url, why, detail) {
  findings.push({ who, url, why, detail })
  rows.push({ who, url, ok: false, why, detail })
}

/**
 * A heading squeezed into a column beside its buttons.
 *
 * Nothing sticks out, so the overflow check passes — but the page head
 * is a desktop row (title left, actions right) that never stacks, and on
 * a phone the title gets whatever is left after the buttons: "Oxford
 * Corp" on two lines and its subtitle one word per line. The prototype
 * stacks these (.split → column under 900px). Reported when the first
 * heading's column is under two thirds of the row it sits in and the
 * rest of the row is buttons or links.
 */
async function squeezedHeadOf(page) {
  return page.evaluate(() => {
    const h = document.querySelector('main h1, main h2')
    if (!h) return null
    // Walk up to the nearest flex row with more than one child.
    let child = h
    let row = h.parentElement
    while (row && row !== document.body) {
      const cs = getComputedStyle(row)
      if (cs.display === 'flex' && !cs.flexDirection.startsWith('column') && row.children.length > 1) break
      child = row
      row = row.parentElement
    }
    if (!row || row === document.body) return null
    const rw = row.getBoundingClientRect().width
    const cw = child.getBoundingClientRect().width
    if (cw >= rw * 0.66) return null
    const siblings = [...row.children].filter((c) => c !== child)
    const actions = siblings.filter((c) => c.matches('button, a') || c.querySelector('button, a'))
    if (actions.length === 0) return null
    const text = (h.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return `“${text}” has ${Math.round(cw)}px of a ${Math.round(rw)}px row; the rest is ${actions.length} action(s)`
  })
}

/**
 * Elements sticking out past either edge, outermost first, ignoring
 * anything inside a container that scrolls sideways on purpose.
 */
async function overflowOf(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const out = []
    const all = [...document.body.querySelectorAll('*')]
    const describe = (el) => {
      const cls =
        typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\s+/).slice(0, 5).join('.')
          : ''
      const text = (el.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
      return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}${text ? ` “${text}”` : ''}`
    }
    for (const el of all) {
      // The phone sheet and other overlays are off screen by design when shut.
      if (el.closest('[hidden], [aria-hidden="true"]')) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right <= vw + 1 && r.left >= -1) continue
      // Outermost only: an ancestor already on the list explains this one.
      if (out.some((o) => o.el.contains(el))) continue
      // Inside something that scrolls sideways on purpose — a wide table
      // in its own box — is a working surface, not a defect.
      let q = el.parentElement
      let scrolls = false
      while (q && q !== document.body) {
        const ox = getComputedStyle(q).overflowX
        if (ox === 'auto' || ox === 'scroll') { scrolls = true; break }
        q = q.parentElement
      }
      if (scrolls) continue
      out.push({ el, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) })
    }
    return {
      vw,
      docW: document.documentElement.scrollWidth,
      offenders: out.slice(0, 5).map((o) => ({ el: describe(o.el), left: o.left, right: o.right, width: o.width })),
    }
  })
}

async function checkPage(page, url, who) {
  if (ONLY && !url.includes(ONLY)) return
  let threw = null
  const onError = (e) => { threw ??= String(e.message ?? e).slice(0, 120) }
  page.on('pageerror', onError)

  let status = 0
  try {
    const res = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 45_000 })
    status = res?.status() ?? 0
  } catch (e) {
    page.off('pageerror', onError)
    return finding(who, url, 'did not load', String(e.message).slice(0, 80))
  }
  // Client components fetch after mount; judge the page after that.
  await page.waitForTimeout(1200)
  page.off('pageerror', onError)

  await page.screenshot({ path: join(OUT, 'screens', `${slug(who)}--${slug(url) || 'home'}.png`) }).catch(() => {})

  if (status >= 400) return finding(who, url, `HTTP ${status}`)
  if (await page.locator('nextjs-portal').count()) return finding(who, url, 'Next error overlay')
  if (threw) return finding(who, url, 'threw', threw)

  const m = await overflowOf(page)
  if (m.offenders.length) {
    return finding(
      who, url, 'sticks out past the edge of the phone',
      m.offenders.map((o) => `${o.el} [${o.left}..${o.right}, ${o.width}px wide of ${m.vw}]`).join(' | ')
    )
  }
  const squeezed = await squeezedHeadOf(page)
  if (squeezed) return finding(who, url, 'the heading is squeezed beside its actions', squeezed)
  rows.push({ who, url, ok: true })
}

/** The shell, once per persona, on the landing page. */
async function checkShell(page, who) {
  const vw = WIDTH
  const header = page.locator('header').first()
  const headerBox = await header.boundingBox()
  if (!headerBox) finding(who, '(shell)', 'no header rendered')
  else if (headerBox.width > vw + 1) finding(who, '(shell)', 'header wider than the phone', `${Math.round(headerBox.width)}px of ${vw}`)

  const menuButton = page.getByRole('button', { name: 'Open menu' })
  if (!(await menuButton.isVisible().catch(() => false))) {
    finding(who, '(shell)', 'no ☰ — a phone has no way to open the navigation')
    return []
  }

  // The landing page may have its own overflow; that is that page's
  // finding, reported when it is visited. The shell's are only what
  // opening a control adds.
  const baseline = new Set((await overflowOf(page)).offenders.map((x) => x.el))
  const added = (o) => o.offenders.filter((x) => !baseline.has(x.el))

  // Each header control opens inside the screen.
  for (const name of ['Notifications', 'Add new', 'Account', 'Search']) {
    const btn = page.getByRole('button', { name: new RegExp(`^${name}`) }).first()
    if (!(await btn.isVisible().catch(() => false))) { finding(who, '(shell)', `no ${name} button on a phone`); continue }
    await btn.click()
    await page.waitForTimeout(300)
    const o = added(await overflowOf(page))
    if (o.length) finding(who, '(shell)', `${name} opens off the edge of the phone`, o.map((x) => x.el).join(' | '))
    if (name === 'Account') {
      const signOut = page.getByRole('button', { name: 'Sign out' })
      if (!(await signOut.isVisible().catch(() => false))) finding(who, '(shell)', 'the account menu has no Sign out')
    }
    await page.keyboard.press('Escape')
    await page.mouse.click(vw - 4, HEIGHT - 4) // and an outside tap, for the menus that ignore Escape
    await page.waitForTimeout(150)
  }

  await menuButton.click()
  // The sheet slides in over 220ms and a bounding box read mid-slide is
  // off the left edge. Measure it once it has arrived.
  await page.waitForTimeout(500)
  const sheet = page.getByRole('dialog', { name: 'Menu' })
  if (!(await sheet.isVisible().catch(() => false))) {
    finding(who, '(shell)', '☰ opened nothing')
    return []
  }
  const links = await sheet.locator('nav a[href^="/dashboard"]').evaluateAll((as) =>
    as.map((a) => a.getAttribute('href')).filter((h, i, all) => h && all.indexOf(h) === i)
  )
  if (links.length === 0) finding(who, '(shell)', 'the menu opened with no destinations in it')
  if (!(await sheet.getByRole('button', { name: 'Sign out' }).isVisible().catch(() => false))) {
    finding(who, '(shell)', 'the menu has no Sign out')
  }
  const o = added(await overflowOf(page))
  if (o.length) finding(who, '(shell)', 'the open menu sticks out past the phone', o.map((x) => x.el).join(' | '))
  await page.screenshot({ path: join(OUT, 'screens', `${slug(who)}--menu-open.png`) }).catch(() => {})

  // A destination tapped closes the sheet and goes there. The first
  // destination that is not the page we are already on, so the URL has
  // to change for this to pass.
  const here = new URL(page.url()).pathname
  const candidates = await sheet.locator('nav a[href^="/dashboard"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  const targetHref = candidates.find((h) => h && h.split('?')[0] !== here) ?? candidates[0]
  const target = sheet.locator(`nav a[href="${targetHref}"]`).first()
  await target.click()
  await page.waitForURL((u) => u.pathname === targetHref.split('?')[0], { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(300)
  if (await sheet.isVisible().catch(() => false)) finding(who, '(shell)', 'the menu stayed open after a destination was tapped')
  if (targetHref && !page.url().includes(targetHref.split('?')[0])) finding(who, '(shell)', 'tapping a destination did not go there', `${targetHref} → ${page.url()}`)

  return links
}

/** Sign out from the sheet, and prove it took: the demo cookie is gone. */
async function checkSignOut(page, who) {
  await page.getByRole('button', { name: 'Open menu' }).click()
  const sheet = page.getByRole('dialog', { name: 'Menu' })
  await sheet.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL(/\/login/, { timeout: 20_000 }).catch(() => {})
  if (!page.url().includes('/login')) finding(who, '(sign out)', 'Sign out did not reach the login page', page.url())
  const still = await page.evaluate(async () => (await (await fetch('/api/demo')).json()).data?.inDemo)
  if (still) finding(who, '(sign out)', 'signed out, but the demo cookie is still there — one tap and they are back in')
  else rows.push({ who, url: '(sign out)', ok: true })
}

const browser = await chromium.launch({ executablePath: CHROME })

for (const p of PERSONAS) {
  if (PERSONA && p.seat !== PERSONA) continue
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const seeded = await page.evaluate(async (body) => {
    const r = await fetch('/api/demo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return r.ok ? await r.json() : { error: await r.text() }
  }, p.body)

  if (seeded.error) {
    if (p.optional) console.log(`\n${p.seat} — skipped (${String(seeded.error).slice(0, 60)})`)
    else finding(p.seat, '/api/demo', 'could not seed', String(seeded.error).slice(0, 80))
    await ctx.close()
    continue
  }

  await page.goto(`${BASE}${seeded.data?.landing ?? '/dashboard'}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  // Re-checking one page: go straight there, no shell walk.
  const links = ONLY ? [ONLY] : await checkShell(page, p.seat)
  console.log(`\n${p.seat} — ${links.length} destinations at ${WIDTH}px`)
  for (const href of links) await checkPage(page, href, p.seat)
  if (!ONLY) await checkSignOut(page, p.seat)
  await ctx.close()
}

if (!PERSONA) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  console.log(`\nPUBLIC — ${PUBLIC.length} pages, signed out`)
  for (const url of PUBLIC) await checkPage(page, url, 'public')
  await ctx.close()
}
await browser.close()

writeFileSync(join(OUT, 'report.json'), JSON.stringify({ width: WIDTH, base: BASE, rows, findings }, null, 2))

const okCount = rows.filter((r) => r.ok).length
console.log(`\n${'='.repeat(72)}`)
console.log(`${okCount} of ${rows.length} fit a ${WIDTH}px phone`)
console.log('='.repeat(72))

if (findings.length) {
  console.log(`\n${findings.length} did not:\n`)
  for (const f of findings) console.log(`  ${f.who.padEnd(10)} ${f.url.padEnd(38)} ${f.why}${f.detail ? `\n${' '.repeat(50)}${f.detail}` : ''}`)
  process.exit(1)
}
console.log('\nEvery page fits, the menu opens, and Sign out signs out.\n')
