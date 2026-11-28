/**
 * The disk half of the map: the sentences a test file holds, read from
 * the file itself, and how many files under src have an owner.
 *
 * The founder cannot read code. He reads test names to confirm somebody
 * built what he meant, so the map shows them beside the row they prove.
 * They are read off the file rather than typed anywhere else, because a
 * second copy of a test's name is a copy that goes stale the first time
 * somebody rewords the test.
 *
 * Two halves. `sentencesIn` is pure and takes a file's text. `readSentences`
 * and `testFilesOnDisk` touch the disk, and are called by the map page while
 * it is built — never on a request, because a deployment carries no test
 * files. Neither reads the database.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { domainOf, isShared } from '@/lib/domains'

/** The two folders a test can live in. */
export const TEST_ROOTS = ['__tests__', '__integration__'] as const

/**
 * Every `it('…')` and `test('…')` sentence in a file, in the order written.
 *
 * Quoted with ', " or `. A template sentence keeps its `${…}` as written,
 * because the founder reads that too and it is honest about being a
 * pattern rather than one case. `describe` is a heading, not a sentence.
 */
export function sentencesIn(source: string): string[] {
  const out: string[] = []
  const re = /(?:^|[^\w.$])(?:it|test)(?:\.(?:skip|only|todo|concurrent|fails|sequential))?(?:\.each\([^)]*\))?\(\s*(['"`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const raw = m[2]
    const text = raw
      .replace(/\\(['"`\\])/g, '$1')
      .replace(/\\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) out.push(text)
  }
  return out
}

/** Every test file under the two roots, repo-relative, sorted. */
export function testFilesOnDisk(root: string = process.cwd()): string[] | null {
  const out: string[] = []
  let found = false
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.test\.tsx?$/.test(name)) out.push(relative(root, full).split('\\').join('/'))
    }
  }
  for (const r of TEST_ROOTS) {
    const dir = join(root, r)
    if (existsSync(dir)) { found = true; walk(dir) }
  }
  // Null, not an empty list: "no test folders here" is a different answer
  // from "no tests", and the map says which.
  return found ? out.sort() : null
}

/** The sentences in each named file. A file that is not there maps to null. */
export function readSentences(paths: string[], root: string = process.cwd()): Record<string, string[] | null> {
  const out: Record<string, string[] | null> = {}
  for (const p of paths) {
    const full = join(root, p)
    out[p] = existsSync(full) ? sentencesIn(readFileSync(full, 'utf8')) : null
  }
  return out
}

/**
 * How many files under src have an owner in lib/domains, counted on disk.
 * Null where src is not there to count, rather than a zero that reads as
 * "nothing is owned".
 */
export function ownedFilesOnDisk(root: string = process.cwd()): number | null {
  const src = join(root, 'src')
  if (!existsSync(src)) return null
  let n = 0
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(name)) {
        const rel = relative(root, full).split('\\').join('/')
        if (domainOf(rel) || isShared(rel)) n++
      }
    }
  }
  walk(src)
  return n
}
