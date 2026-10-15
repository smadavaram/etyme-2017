/**
 * The approved legal text, read into sections and blocks.
 *
 * ── Why a parser, and why this small ─────────────────────────────────
 *
 * The three documents were approved as written text. Retyping them into
 * objects by hand is where a word goes missing, and nobody reads three
 * thousand words twice to find which one. So the approved text is held
 * as it was approved (`lib/legal/*-text`) and read here into the shape
 * the page draws.
 *
 * It reads only the handful of forms the drafts use, and nothing else:
 *
 *   > **Notice:** …           the draft notice
 *   # Title                   the document's title
 *   **Effective date:** …     the dates, one per line
 *   ## 7. Heading             a numbered section (or "Annex A — …")
 *   ### 4.1 Heading           a part inside a section
 *   paragraph lines           consecutive lines keep their line breaks
 *   - item / 1. item          a list
 *   | a | b |                 a table, header row first
 *   ---                       a rule, which the page does not draw
 *
 * and two marks inside a line: **strong**, and [square brackets], which
 * in these drafts always mark a point counsel has not decided yet. The
 * page draws a bracket as marked text so a reader sees what is open.
 *
 * `toMarkdown` writes a parsed document back out. The test holds that
 * it gives back the approved text character for character, so a form
 * this parser does not understand fails the build instead of quietly
 * dropping a sentence. No dependency: there is no markdown library in
 * this repository and one is not wanted for four forms.
 */

/** A run of text inside a line. */
export interface Inline {
  text: string
  /** Inside **…**. */
  strong?: boolean
  /** Inside […]: a point counsel has to decide. Includes the brackets. */
  counsel?: boolean
}

/** One line of text, as runs. */
export type Line = Inline[]

export type Block =
  | { kind: 'paragraph'; lines: Line[] }
  | { kind: 'list'; ordered: boolean; start: number; items: Line[] }
  | { kind: 'table'; head: Line[]; rows: Line[][] }
  | { kind: 'subheading'; id: string; text: string }
  | { kind: 'rule' }

export interface LegalSection {
  /** The anchor on the page, from the heading: "7-what-we-do-not-do". */
  id: string
  /** The heading exactly as written: "7. What we do not do". */
  heading: string
  blocks: Block[]
}

export interface LegalDate {
  /** "Effective date" */
  label: string
  value: Line
}

export interface ParsedLegalDocument {
  /** The draft notice above the title, as runs (it opens on **Notice:**). */
  notice: Line
  title: string
  dates: LegalDate[]
  /** Everything between the dates and the first section. */
  intro: Block[]
  sections: LegalSection[]
}

/**
 * A heading's address: lower case, every run of anything that is not a
 * letter or a digit becomes one hyphen. "7. How long we keep it" reads
 * `7-how-long-we-keep-it`; "Annex A — Sub-processors" reads
 * `annex-a-sub-processors`; "4.1 Instructions" reads `4-1-instructions`.
 */
export function anchorOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** A line of text into runs: **strong** and [counsel]. */
export function inline(text: string): Line {
  const out: Line = []
  let strong = false
  let counsel = false
  let buf = ''
  const flush = () => {
    if (buf === '') return
    const run: Inline = { text: buf }
    if (strong) run.strong = true
    if (counsel) run.counsel = true
    out.push(run)
    buf = ''
  }
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('**', i)) {
      flush()
      strong = !strong
      i++
      continue
    }
    if (text[i] === '[' && !counsel) {
      flush()
      counsel = true
      buf = '['
      continue
    }
    if (text[i] === ']' && counsel) {
      buf += ']'
      flush()
      counsel = false
      continue
    }
    buf += text[i]
  }
  flush()
  if (strong) throw new Error(`Unclosed ** in: ${text}`)
  if (counsel) throw new Error(`Unclosed [ in: ${text}`)
  return out
}

/** The plain words of a line, marks removed. */
export function plain(line: Line): string {
  return line.map((r) => r.text).join('')
}

const LIST_ITEM = /^(?:- |(\d+)\. )/
const TABLE_ROW = /^\|.*\|$/
const TABLE_RULE = /^\|(?:\s*-{3,}\s*\|)+$/

function cells(row: string): Line[] {
  return row
    .slice(1, -1)
    .split('|')
    .map((c) => inline(c.trim()))
}

/** The blocks in a run of lines with no heading in it. */
function blocksOf(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    if (line === '---') {
      blocks.push({ kind: 'rule' })
      i++
      continue
    }
    if (line.startsWith('### ')) {
      const text = line.slice(4)
      blocks.push({ kind: 'subheading', id: anchorOf(text), text })
      i++
      continue
    }
    if (TABLE_ROW.test(line)) {
      const head = cells(line)
      if (!TABLE_RULE.test(lines[i + 1] ?? '')) throw new Error(`A table with no rule under its header: ${line}`)
      i += 2
      const rows: Line[][] = []
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        const row = cells(lines[i])
        if (row.length !== head.length) throw new Error(`A row with ${row.length} cells under ${head.length} headings: ${lines[i]}`)
        rows.push(row)
        i++
      }
      blocks.push({ kind: 'table', head, rows })
      continue
    }
    const item = LIST_ITEM.exec(line)
    if (item) {
      const ordered = item[1] !== undefined
      const start = ordered ? Number(item[1]) : 1
      const items: Line[] = []
      let expect = start
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i])
        if (!m || (m[1] !== undefined) !== ordered) break
        if (ordered && Number(m[1]) !== expect) throw new Error(`A numbered list out of order at: ${lines[i]}`)
        items.push(inline(lines[i].slice(m[0].length)))
        expect++
        i++
      }
      blocks.push({ kind: 'list', ordered, start, items })
      continue
    }
    // A paragraph: every line up to a blank one, each kept as its own line.
    const para: Line[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      lines[i] !== '---' &&
      !lines[i].startsWith('#') &&
      !TABLE_ROW.test(lines[i]) &&
      !LIST_ITEM.test(lines[i])
    ) {
      para.push(inline(lines[i]))
      i++
    }
    blocks.push({ kind: 'paragraph', lines: para })
  }
  return blocks
}

const DATE_LINE = /^\*\*([^*]+):\*\* (.*)$/

/** The approved text, read into the shape the page draws. */
export function parseLegal(source: string): ParsedLegalDocument {
  const lines = source.replace(/\n$/, '').split('\n')
  let i = 0
  const skipBlank = () => {
    while (i < lines.length && lines[i].trim() === '') i++
  }

  skipBlank()
  if (!lines[i]?.startsWith('> ')) throw new Error('A legal document opens on its draft notice.')
  const notice = inline(lines[i].slice(2))
  i++
  skipBlank()

  if (!lines[i]?.startsWith('# ')) throw new Error('The draft notice is followed by the title.')
  const title = lines[i].slice(2)
  i++
  skipBlank()

  const dates: LegalDate[] = []
  while (i < lines.length && DATE_LINE.test(lines[i])) {
    const m = DATE_LINE.exec(lines[i])!
    dates.push({ label: m[1], value: inline(m[2]) })
    i++
  }

  const firstSection = lines.findIndex((l, n) => n >= i && l.startsWith('## '))
  const end = firstSection === -1 ? lines.length : firstSection
  const intro = blocksOf(lines.slice(i, end))

  const sections: LegalSection[] = []
  let at = end
  while (at < lines.length) {
    const heading = lines[at].slice(3)
    const next = lines.findIndex((l, n) => n > at && l.startsWith('## '))
    const stop = next === -1 ? lines.length : next
    const id = anchorOf(heading)
    // A part numbered "4.1" is addressed by its number; an unnumbered one
    // ("In place", under Annex B) by its section first, so two annexes
    // could each have one without sharing an address.
    const blocks = blocksOf(lines.slice(at + 1, stop)).map((b) =>
      b.kind === 'subheading' && !/^\d/.test(b.id) ? { ...b, id: `${id}-${b.id}` } : b
    )
    sections.push({ id, heading, blocks })
    at = stop
  }

  return { notice, title, dates, intro, sections }
}

// ── Back out, to prove nothing was lost ───────────────────────────────

function lineOut(line: Line): string {
  let out = ''
  let strong = false
  for (const r of line) {
    // A bracket's own characters are in its text; only ** is a mark.
    if (!!r.strong !== strong) {
      out += '**'
      strong = !strong
    }
    out += r.text
  }
  if (strong) out += '**'
  return out
}

function blockOut(b: Block): string {
  switch (b.kind) {
    case 'rule':
      return '---'
    case 'subheading':
      return `### ${b.text}`
    case 'paragraph':
      return b.lines.map(lineOut).join('\n')
    case 'list':
      return b.items.map((it, n) => (b.ordered ? `${b.start + n}. ` : '- ') + lineOut(it)).join('\n')
    case 'table': {
      const row = (r: Line[]) => `| ${r.map(lineOut).join(' | ')} |`
      return [row(b.head), `|${b.head.map(() => '---').join('|')}|`, ...b.rows.map(row)].join('\n')
    }
  }
}

/**
 * A parsed document written back out as the text it came from. The test
 * compares this to the approved text, so it is the proof the page draws
 * every word that was approved and no other.
 */
export function toMarkdown(doc: ParsedLegalDocument): string {
  const parts: string[] = [`> ${lineOut(doc.notice)}`, `# ${doc.title}`]
  if (doc.dates.length > 0) {
    parts.push(doc.dates.map((d) => `**${d.label}:** ${lineOut(d.value)}`).join('\n'))
  }
  parts.push(...doc.intro.map(blockOut))
  for (const s of doc.sections) {
    parts.push(`## ${s.heading}`, ...s.blocks.map(blockOut))
  }
  return parts.join('\n\n') + '\n'
}
