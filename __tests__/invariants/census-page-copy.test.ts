import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PUBLIC_PAGES } from '@/lib/public-site/pages'
import { everyFrameLink } from '@/lib/public-site/nav'
import { FOOTER_LINKS, DOORS } from '@/lib/public-site/skeleton-words'

/**
 * `/census` closed on November 13, 2026.
 *
 * The founder deleted the contractor spend audit from every page on
 * 2026-10-14 and kept its page reachable, linked from nowhere, for thirty
 * days. This file held the page's words to the software's own until then;
 * now it holds that the page is gone and that nothing public offers it.
 * It stays because the delivery matrix names it until the census rows are
 * taken off; the copy tests left with the page.
 */

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every source file a public page is drawn from: the site's words and route files. */
function publicSources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(join(root, dir))) {
      const p = `${dir}/${name}`
      if (statSync(join(root, p)).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(name)) out.push(p)
    }
  }
  walk('src/lib/public-site')
  walk('src/app/(site)')
  // The first-party counts are read by Etyme staff only, never drawn on a
  // page, and keep the audit's event names because rows already written
  // carry them.
  return out.filter((f) => f !== 'src/lib/public-site/market-events.ts').concat(['src/app/page.tsx', 'src/app/demo/page.tsx', 'src/app/layout.tsx'])
}

describe('The contractor census page has closed', () => {

  it('the census address shows the ordinary not-found page, with no form, no header and no copy of its own', () => {
    const page = code(read('src/app/census/page.tsx'))
    expect(page).toMatch(/notFound\(\)/)
    expect(page).not.toMatch(/CensusFlow|census-copy|SiteHeader|<form|<input|metadata/)
  })

  it('no public page is registered at the census address', () => {
    expect(PUBLIC_PAGES.some((p) => p.route === '/census' || p.routeFile.startsWith('src/app/census/'))).toBe(false)
  })

  it('no public page, footer or door links to the census or offers an audit', () => {
    expect(everyFrameLink().filter((h) => h.startsWith('/census'))).toEqual([])
    expect(JSON.stringify([FOOTER_LINKS, DOORS])).not.toMatch(/\/census|audit/i)
    const audit = /href[=:]\s*[{'\"`]*\/census|GET_THE_AUDIT|spend audit|free audit|get your contractor/i
    for (const f of publicSources()) expect(code(read(f)), f).not.toMatch(audit)
  })
})
