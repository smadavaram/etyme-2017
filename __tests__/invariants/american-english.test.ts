import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * The app is American.
 *
 * Decided 2026-09-13, when the founder asked whether "programme" was
 * spelled correctly. It was — in British and Indian English — and every
 * customer is a US enterprise that runs a contingent workforce
 * *program*, from a *program* office, coded to a cost *center*. A buyer
 * who reads "Programme team" in the nav registers foreign before they
 * register what it does.
 *
 * So no British spelling on a screen. This reads every file that can
 * put words in front of a person and fails on the first one. Machine
 * names are left alone: the demo desk key `programme`, the seeded email
 * `world-nike-programme@`, the file `seed-programmes.ts`, and anything
 * in ALL CAPS — those are addresses, and changing an address strands
 * whoever already holds it.
 */

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// British stems that have an American form in ordinary use. Not
// "cancelled": both spellings are American, and the schema is full of it.
// "cheque" since the screen walk of 2026-11-01, which read "Bank letter or
// voided cheque" on a supplier's document request.
const BRITISH = new RegExp(
  '(?<![A-Za-z0-9_\\-./\\[])' +
  '(programmes?|centres?|authoris(?:ation|e|ed|es|ing)|organis(?:ation|ations|e|ed|es|ing)|' +
  'summaris(?:e|ed|es|ing)|normalis(?:ation|e|ed|es|ing)|recognis(?:e|ed|es|ing|able)|' +
  'utilis(?:ation|e|ed|es|ing)|minimis(?:ation|e|ed|es|ing)|judgements?|ageing|labell(?:ed|ing)|' +
  'behaviours?|honour(?:ed|s|ing)?|colours?|favour(?:ite|able|ed|s)?|instalments?|artefacts?|' +
  'defence|offence|licence|cheques?|grey|catalogue|analys(?:e|ed|ing)|travell(?:ed|ing)|modell(?:ed|ing)|totalled|annualis(?:e|ed|es|ing|ation))' +
  '(?![A-Za-z0-9_\\-:@\\]\\(])',
  'g'
)

/** A match that is the whole of a quoted literal is a key or a slug, not a word somebody reads. */
function isAddress(text: string, start: number, end: number): boolean {
  const before = text[start - 1]
  const after = text[end]
  return "'\"`".includes(before ?? '') && after === before
}

function britishIn(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const hits: string[] = []
  for (const m of text.matchAll(BRITISH)) {
    const word = m[1]
    if (word === word.toUpperCase()) continue // an enum or a constant
    if (isAddress(text, m.index!, m.index! + m[0].length)) continue
    const line = text.slice(0, m.index).split('\n').length
    hits.push(`${file.replace(ROOT + '/', '')}:${line} "${m[0]}"`)
  }
  return hits
}

/**
 * The pages a stranger opens, and the files their words come from: the
 * home page, the marketing site and its doors, a firm's generated page,
 * the demo door and the sign-up and sign-in forms.
 */
const PUBLIC = [
  'src/app/page.tsx', 'src/app/(site)', 'src/app/site', 'src/app/c', 'src/app/demo',
  'src/app/(auth)', 'src/lib/public-site', 'src/lib/site-voice.ts', 'src/lib/password-words.ts',
]

/** The one quoted British word a public file may hold: the demo desk key, which is an address. */
const PUBLIC_ADDRESSES = new Set(['programme'])

/**
 * A public file's British spellings, with no pass for a word quoted whole.
 * A whole quoted word is a key everywhere else, but on a public page it is
 * as often the word a reader reads: `{n === 1 ? 'organisation' : ...}`.
 */
function britishOnAPublicPage(text: string, where: string): string[] {
  const hits: string[] = []
  for (const m of text.matchAll(BRITISH)) {
    const word = m[1]
    if (word === word.toUpperCase()) continue
    if (isAddress(text, m.index!, m.index! + m[0].length) && PUBLIC_ADDRESSES.has(word)) continue
    const line = text.slice(0, m.index).split('\n').length
    hits.push(`${where}:${line} "${m[0]}"`)
  }
  return hits
}

function publicFiles(): string[] {
  return PUBLIC.map((p) => join(ROOT, p)).filter(existsSync).flatMap((p) => (statSync(p).isDirectory() ? walk(p) : [p]))
}

describe('the app speaks American English', () => {
  it('no screen, route, library or seed spells a word the British way', () => {
    const files = walk(join(ROOT, 'src'))
    const hits = files.flatMap(britishIn)
    expect(hits, hits.slice(0, 20).join('\n')).toEqual([])
  })

  it('a word shown on its own on a public page, like the word under a figure, is spelled the American way too', () => {
    // The second Tapin walk (2026-10-31) read the British "organisation"
    // under the Clients figure on a firm's public page. The sentence above
    // let it through as a key, because it stood whole inside quotes. On
    // the pages a stranger opens, only the demo desk key is let through.
    const files = publicFiles()
    expect(files.some((f) => f.endsWith('src/app/site/[slug]/page.tsx'))).toBe(true)
    const hits = files.flatMap((f) => britishOnAPublicPage(readFileSync(f, 'utf8'), f.replace(ROOT + '/', '')))
    expect(hits, hits.slice(0, 20).join('\n')).toEqual([])
    // And the guard sees the shape that slipped through, and lets the key through.
    expect(britishOnAPublicPage("{n === 1 ? 'organisation' : 'organisations'}", 'a page')).toHaveLength(2)
    expect(britishOnAPublicPage("{ desk: 'programme', label: 'Program manager' }", 'a page')).toEqual([])
  })

  it('the roles a client starts with are named the way a US program office names them', () => {
    const defaults = readFileSync(join(ROOT, 'src/lib/company-defaults.ts'), 'utf8')
    expect(defaults).toContain("name: 'Program Manager'")
    expect(defaults).not.toContain("name: 'Programme Manager'")
  })

  it('a role seeded under its British name is renamed on re-seed, not duplicated', () => {
    const seed = readFileSync(join(ROOT, 'src/lib/seed-programmes.ts'), 'utf8')
    expect(seed).toContain('for (const [was, now] of Object.entries(RENAMED_ROLES))')
    expect(seed).toContain('await db.role.updateMany({ where: { companyId: client.id, name: was }, data: { name: now } })')
  })

  it('the machine names that were British stay put, so nobody already seated loses their address', () => {
    // The demo desk key and the seeded email live in the database; the
    // file name is imported in five places. None is read by a person.
    // The desk keys moved out of the demo route into lib/demo-desks on 2026-09-30.
    const demo = readFileSync(join(ROOT, 'src/lib/demo-desks.ts'), 'utf8')
    expect(demo).toContain("'programme'")
    const seed = readFileSync(join(ROOT, 'src/lib/seed-programmes.ts'), 'utf8')
    expect(seed).toContain("key: 'programme'")
  })
})
