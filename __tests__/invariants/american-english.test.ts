import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
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
const BRITISH = new RegExp(
  '(?<![A-Za-z0-9_\\-./\\[])' +
  '(programmes?|centres?|authoris(?:ation|e|ed|es|ing)|organis(?:ation|ations|e|ed|es|ing)|' +
  'summaris(?:e|ed|es|ing)|normalis(?:ation|e|ed|es|ing)|recognis(?:e|ed|es|ing|able)|' +
  'utilis(?:ation|e|ed|es|ing)|minimis(?:ation|e|ed|es|ing)|judgements?|ageing|labell(?:ed|ing)|' +
  'behaviours?|honour(?:ed|s|ing)?|colours?|favour(?:ite|able|ed|s)?|instalments?|artefacts?|' +
  'defence|offence|licence|grey|catalogue|analys(?:e|ed|ing)|travell(?:ed|ing)|modell(?:ed|ing)|totalled)' +
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

describe('the app speaks American English', () => {
  it('no screen, route, library or seed spells a word the British way', () => {
    const files = walk(join(ROOT, 'src'))
    const hits = files.flatMap(britishIn)
    expect(hits, hits.slice(0, 20).join('\n')).toEqual([])
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
    const demo = readFileSync(join(ROOT, 'src/app/api/demo/route.ts'), 'utf8')
    expect(demo).toContain("'programme'")
    const seed = readFileSync(join(ROOT, 'src/lib/seed-programmes.ts'), 'utf8')
    expect(seed).toContain("key: 'programme'")
  })
})
