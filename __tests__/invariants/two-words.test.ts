import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { domainOf, type DomainKey } from '@/lib/domains'

/**
 * Two words nobody uses: "program office" and "desk".
 *
 * Decided by the founder, 2026-10-14: *"Never use desk and program
 * office — nobody uses those in the real world."* He had said it before
 * and it was not held, because nothing failed when it came back. This is
 * the thing that fails.
 *
 * The firm that runs a client's program is an MSP; the client's own
 * person is the program manager; a desk is the person's role (the AP
 * clerk, HR, Procurement, the hiring manager), or "team" where no role
 * fits. Machine names do not move — `deskHome`, the demo key
 * `programme`, an enum, a route, a file name, a comment — by the same
 * rule that kept `world-nike`: an address is not a word anybody reads.
 *
 * So the guard parses every .ts and .tsx under src and reads only what a
 * person reads: JSX text, and string and template literals that are not
 * an import path, an object key, a class name, a route, a type, a case
 * label or a one-word key. A word inside a comment or an identifier is
 * never seen, because the parser does not hand it over as text.
 *
 * Why a file of its own rather than a fourth case in
 * american-english.test.ts: that test is a regular expression over raw
 * text, and this one needs a parser to tell `deskHome` and a comment from
 * a sentence. And the list below is edited by every domain as it sweeps
 * its own files, so it should not sit in a file about spelling.
 */

const ROOT = process.cwd()


/** The two words, as a person would read them. */
const TWO_WORDS = /\b(program(?:me)?\s+offices?|desks?)\b/i

interface Hit { file: string; line: number; text: string }

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p)
  }
  return out
}

/** A literal with no space in it, all lower case or carrying a machine character, is an address: a key, a slug, a route, a class. */
function isMachine(s: string): boolean {
  const t = s.trim()
  if (t === '') return true
  if (/^\//.test(t) && !/\s/.test(t)) return true // a route
  if (!/\s/.test(t)) {
    // One word. 'Desk' capitalized is a heading; 'desk', 'desk-key', 'deskHome' are machine.
    if (/[-_./:@#=?&[\]{}]/.test(t)) return true
    if (t === t.toLowerCase()) return true
    if (t === t.toUpperCase()) return true
  }
  return false
}

function attrName(node: ts.Node): string | null {
  let n: ts.Node | undefined = node.parent
  while (n && (ts.isJsxExpression(n) || ts.isParenthesizedExpression(n) || ts.isConditionalExpression(n) || ts.isBinaryExpression(n) || ts.isTemplateSpan(n) || ts.isTemplateExpression(n) || ts.isCallExpression(n) || ts.isArrayLiteralExpression(n))) {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText()
      if (/^(cn|clsx|classNames|twMerge)$/.test(callee)) return 'className'
    }
    n = n.parent
  }
  if (n && ts.isJsxAttribute(n)) return n.name.getText()
  return null
}

const MACHINE_ATTRS = new Set(['className', 'class', 'href', 'src', 'key', 'id', 'name', 'htmlFor', 'data-testid', 'action', 'method', 'type', 'rel', 'target', 'style'])
const MACHINE_CALLS = /^(require|import|fetch|router\.push|router\.replace|redirect|revalidatePath|searchParams\.get|params\.get|console\.(log|debug|info|warn|error)|new URL|URLSearchParams|path\.join|join|resolve)$/

function isMachinePosition(node: ts.Node): boolean {
  const p = node.parent
  if (!p) return false
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isImportTypeNode(p.parent ?? p)) return true
  if (ts.isLiteralTypeNode(p)) return true
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isEnumMember(p)) && p.name === node) return true
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true
  if (ts.isCaseClause(p)) return true
  if (ts.isCallExpression(p) && p.arguments[0] === node) {
    const callee = p.expression.getText()
    if (MACHINE_CALLS.test(callee)) return true
  }
  const a = attrName(node)
  if (a && MACHINE_ATTRS.has(a)) return true
  return false
}

function textOf(node: ts.Node): string | null {
  if (ts.isJsxText(node)) return node.text
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((s) => ' x ' + s.literal.text).join('')
  }
  return null
}

/** Every place in one source where a person would read either word. */
function twoWordsInSource(file: string, src: string): Hit[] {
  if (!TWO_WORDS.test(src)) return []
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const hits: Hit[] = []
  const visit = (node: ts.Node) => {
    const text = textOf(node)
    if (text !== null) {
      // A JSON key quoted inside a sentence ("desk": "ap") is the API's name, not a word.
      const read = text.replace(/"[A-Za-z_][\w-]*"\s*:/g, '')
      if (TWO_WORDS.test(read) && !isMachine(text) && !isMachinePosition(node)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
        hits.push({ file, line, text: text.trim().replace(/\s+/g, ' ').slice(0, 120) })
      }
      if (ts.isTemplateExpression(node)) {
        // The holes may hold literals of their own.
        node.templateSpans.forEach((s) => visit(s.expression))
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

function twoWordsIn(path: string): Hit[] {
  return twoWordsInSource(path.replace(ROOT + '/', ''), readFileSync(path, 'utf8'))
}

/**
 * Files that still say one of the two words to a person, and who owns
 * each. This list may only shrink: a file not on it that offends fails,
 * and a file on it that no longer offends fails too, so it cannot keep a
 * file that was already swept. Taking your own file off the list is how
 * a sweep is recorded.
 *
 * `lib/matrix.ts` is the platform's own and stays on purpose: it is the
 * dated record of what was built and decided, read by the people
 * building it, and rewriting the history it quotes would change the
 * record, the same reason CLAUDE.md keeps its older sections. New rows
 * there follow the rule.
 */
const STILL_TO_SWEEP: Record<string, DomainKey> = {
  // PLATFORM
  'src/lib/matrix.ts': 'PLATFORM',
}

const OWNER_NAMES: Record<string, string> = {
  REGULATORY: 'etyme-regulatory', MONEY: 'etyme-money', CONVERSATION: 'etyme-conversation',
  DEMAND: 'etyme-demand', SUPPLY: 'etyme-supply', MARKET: 'etyme-market', PLATFORM: 'etyme-architect',
}

describe('nobody reads "program office" or "desk"', () => {
  const hits = walk(join(ROOT, 'src')).flatMap(twoWordsIn)
  const offending = new Set(hits.map((h) => h.file))

  it('no file says either word to a person unless it is on the list still being swept', () => {
    const fresh = hits.filter((h) => !(h.file in STILL_TO_SWEEP))
    expect(fresh.map((h) => `${h.file}:${h.line} "${h.text}"`), 'Say MSP, the program manager, the role, or team').toEqual([])
  })

  it('a file on the list still says one of them, so the list holds no file that was already swept', () => {
    const swept = Object.keys(STILL_TO_SWEEP).filter((f) => !offending.has(f))
    expect(swept, 'Swept: take these off STILL_TO_SWEEP').toEqual([])
  })

  it('every file on the list exists and is named with the domain that owns it', () => {
    const wrong = Object.entries(STILL_TO_SWEEP)
      .filter(([f, d]) => !existsSync(join(ROOT, f)) || domainOf(f)?.key !== d)
      .map(([f, d]) => `${f}: listed as ${d}, owned by ${domainOf(f)?.key ?? 'nobody'}`)
    expect(wrong).toEqual([])
  })

  it('the files still to sweep are printed by owner, with how many sentences each holds', () => {
    const byOwner = new Map<string, string[]>()
    for (const [f, d] of Object.entries(STILL_TO_SWEEP)) {
      const n = hits.filter((h) => h.file === f).length
      byOwner.set(d, [...(byOwner.get(d) ?? []), `${f} (${n})`])
    }
    const lines = [...byOwner.entries()].sort().map(([d, fs]) =>
      `${OWNER_NAMES[d] ?? d}: ${fs.length} files, ${hits.filter((h) => STILL_TO_SWEEP[h.file] === d).length} sentences\n  ${fs.sort().join('\n  ')}`)
    console.log(`Still saying "program office" or "desk", by owner:\n${lines.join('\n')}`)
    expect(byOwner.size).toBeGreaterThan(0)
  })

  it('the guard reads the words in JSX text, strings and templates, and leaves identifiers, comments, keys, classes and routes alone', () => {
    const source = [
      "import { deskHome } from '@/lib/desk-home'",
      '// the AP desk reads this comment, and nobody else does',
      "const KEYS = { desk: 'ap', 'Program office': 1, programme: 'programme' }",
      "type Kind = 'desk'",
      "const route = '/dashboard/desk/program-office'",
      "function cls() { return <div className=\"desk-row\" key=\"desk\">{deskHome}</div> }",
      'const json = `POST /api/demo {"as":"world-nike","desk":"ap"} to sit there`',
      "const a = 'Send it to the AP desk.'",
      'const b = `${who} runs the program office`',
      'function c() { return <p>Back to your desk</p> }',
      "const d = { label: 'Desk' }",
    ].join('\n')
    const found = twoWordsInSource('fixture.tsx', source).map((h) => h.text)
    expect(found).toEqual(['Send it to the AP desk.', 'x runs the program office', 'Back to your desk', 'Desk'])
  })
})
