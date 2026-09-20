import { EtymeLogo } from '@/components/logo'
import {
  DRAFT_BANNER,
  COUNSEL_QUESTIONS,
  CROSS_LINKS,
  DEFINITIONS,
  HELD,
  LAST_VERIFIED,
  SUB_PROCESSORS,
  SUMMARY,
  sectionId,
  sectionsOf,
  type DocKey,
  type Section,
} from '@/lib/legal'
import { scheduleFor, type Anchor, type ScheduleLine } from '@/lib/retention'

/**
 * How all three legal pages are drawn.
 *
 * One renderer, because a terms page that looks different from the
 * privacy page beside it reads as two documents written by two people at
 * two times, which is exactly what a reviewer is checking for. The three
 * page files hold a title, a description and one call to this; nothing
 * else. They cannot drift apart because there is nothing in them to
 * drift.
 *
 * ── Built for three readers, in this order ───────────────────────────
 *
 * A procurement lead scans for six answers and leaves. Counsel reads the
 * open questions and the section that names the file behind each claim.
 * A CFO wants the fee position and nothing else. So: the six asks in a
 * box at the top, each linking to the section that answers it in full; a
 * numbered contents that stays on the screen while the body scrolls; and
 * facts that line up rendered as a table rather than as run-on bullets.
 *
 * The draft banner is above all of it and cannot be scrolled past. That
 * is deliberate: these were written by reading code, not by a lawyer, and
 * a reader who mistakes them for reviewed legal text has been misled by
 * the layout. It is also the strongest thing on the page — a document
 * that says what it does not yet know is one a reviewer can trust about
 * what it does.
 *
 * ── Phone first ──────────────────────────────────────────────────────
 *
 * 16px gutters, one column, and nothing that can push the page sideways:
 * every table is drawn only at large widths and the same rows are drawn
 * as cards below that, and every machine path is set to wrap anywhere,
 * because `src/app/api/supplier-apply/[token]/route.ts` has no space in
 * it to break at.
 */

interface Page {
  key: DocKey
  href: string
  label: string
}

const PAGES: Page[] = [
  { key: 'terms', href: '/terms', label: 'Terms' },
  { key: 'privacy', href: '/privacy', label: 'Privacy' },
  { key: 'dpa', href: '/dpa', label: 'Data processing' },
]

/**
 * The fourth document, which is not one of the three public pages.
 *
 * The census agreement is drawn by this same component — a lawyer
 * reading it should recognize it as one of our documents rather than as
 * a form — but it is not in the nav of the other three. It is read by
 * somebody who was sent to it, about a census they are about to accept,
 * and a visitor browsing the terms has no census and nothing to accept.
 * Standing on it, the other three are still one click away, because the
 * next question a procurement lead asks is about sub-processors.
 */
const CENSUS_PAGE: Page = {
  key: 'census',
  href: '/legal/census-agreement',
  label: 'Census agreement',
}

/** Long machine paths break anywhere rather than widening the page. */
const WRAP = 'break-words [overflow-wrap:anywhere]'

// ── How long a category is kept, read off the schedule ────────────────

/**
 * The retention line for one `HELD` category, said in a phrase.
 *
 * Exported so the test can read the cell the page actually draws rather
 * than a second copy of the logic written in the test, which would
 * prove only that somebody can write the same mistake twice.
 *
 * Read from `lib/retention`'s schedule rather than written beside the
 * category, so the page cannot state a period the sweep does not use.
 * Where the schedule has no citable minimum this says so: a period
 * invented to fill a cell deletes a record that does not come back.
 */
export function keptFor(category: string): { period: string; cite: string } {
  const line = scheduleFor(category)
  if (!line) {
    return {
      period: 'Not on the schedule',
      cite: 'Nobody has classified this category — that is a gap, not a period.',
    }
  }
  return { period: periodWords(line), cite: citesIn(line.basis) }
}

const YEARS: Record<number, string> = {
  12: 'one year',
  24: 'two years',
  36: 'three years',
  48: 'four years',
}

function span(months: number): string {
  return YEARS[months] ?? `${months} months`
}

function after(anchor: Anchor): string {
  switch (anchor) {
    case 'HIRE':
      return 'the date of hire'
    case 'EMPLOYMENT_END':
      return 'the employment ending'
    case 'LAST_PAID':
      return 'the last money moving on this person'
    case 'LAST_WORKED':
      return 'the last day of the work it is about'
    case 'I9':
      return 'the date of hire, or one year after the employment ends, whichever is later'
    default:
      return ''
  }
}

function periodWords(line: ScheduleLine): string {
  if (line.fate === 'KEPT_IN_FULL') return 'Kept in full'
  if (line.fate === 'DELETED') return 'Deleted on request'
  if (line.fate === 'KEPT_ANONYMIZED') {
    if (line.months === null) return 'Kept, naming nobody'
    return `Kept, naming nobody, until ${span(line.months)} after ${after(line.anchor)}`
  }
  if (line.months === null) {
    return line.anchor === 'I9'
      ? 'Deleted once the I-9 floor has run: three years after the date of hire, or one year after the employment ends, whichever is later'
      : 'No period stated, and nothing is deleted on one'
  }
  return `Deleted ${span(line.months)} after ${after(line.anchor)}`
}

/** The rules cited in a basis, or the honest absence of one. */
function citesIn(basis: string): string {
  const hits = basis.match(/\d+\s+CFR\s+\d+[\w.\-]*(?:\([^()]*\))*/g) ?? []
  const unique = [...new Set(hits.map((h) => h.replace(/[.,]$/, '')))]
  if (unique.length > 0) return unique.join(' · ')
  return 'No federal minimum can be cited'
}

// ── A table, and the same rows as cards on a phone ────────────────────

interface Cell {
  label: string
  node: React.ReactNode
  /** Digits and dates line up. */
  figures?: boolean
  /**
   * Share of the table, as a percentage. Set because the columns are
   * not equal: a category and its examples is a paragraph, and who it
   * is about is two words. Equal thirds made every row four lines tall
   * for the sake of a column reading "Candidates".
   */
  width?: string
}

/**
 * One description of the rows, drawn twice: as a table where there is
 * room for columns, and as cards where there is not. A table that
 * survives a 390px screen by scrolling sideways is a table nobody
 * reads the right-hand half of.
 */
function FactTable({ rows }: { rows: { key: string; cells: Cell[] }[] }) {
  const head = rows[0]?.cells ?? []
  return (
    <>
      <table className="hidden w-full table-fixed border-collapse text-left lg:table">
        <thead>
          <tr>
            {head.map((c) => (
              <th
                key={c.label}
                style={c.width ? { width: c.width } : undefined}
                className="eyebrow border-b border-etyme-rule px-2 pb-2 align-bottom"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="align-top">
              {r.cells.map((c) => (
                <td
                  key={c.label}
                  className={`border-b border-etyme-rule px-2 py-3 text-[12.5px] leading-relaxed ${WRAP} ${
                    c.figures ? 'tabular-nums' : ''
                  }`}
                >
                  {c.node}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-3 lg:hidden">
        {rows.map((r) => (
          <li key={r.key} className="rounded-panel border border-etyme-rule bg-etyme-raised p-3">
            {r.cells.map((c, i) => (
              <div key={c.label} className={i === 0 ? '' : 'mt-2'}>
                <p className="eyebrow">{c.label}</p>
                <div
                  className={`mt-1 text-[13px] leading-relaxed ${WRAP} ${
                    c.figures ? 'tabular-nums' : ''
                  }`}
                >
                  {c.node}
                </div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  )
}

function HeldTable({ withProof }: { withProof: boolean }) {
  return (
    <FactTable
      rows={HELD.map((h) => {
        const kept = keptFor(h.category)
        return {
          key: h.category,
          cells: [
            {
              label: 'What it is',
              width: '50%',
              node: (
                <>
                  <span className="font-semibold text-etyme-ink">{h.category}</span>
                  <span className="text-etyme-muted"> — {h.examples}</span>
                  {withProof && (
                    <span className={`mt-1 block font-mono text-[10.5px] text-etyme-faint ${WRAP}`}>
                      {h.provenBy}
                    </span>
                  )}
                </>
              ),
            },
            {
              label: 'About whom',
              width: '14%',
              node: <span className="text-etyme-muted">{h.about}</span>,
            },
            {
              label: 'Kept how long',
              width: '36%',
              figures: true,
              node: (
                <>
                  <span className="text-etyme-ink">{kept.period}</span>
                  <span className="mt-1 block text-[11.5px] text-etyme-faint">{kept.cite}</span>
                </>
              ),
            },
          ],
        }
      })}
    />
  )
}

function SubProcessorTable({ withProof }: { withProof: boolean }) {
  return (
    <FactTable
      rows={SUB_PROCESSORS.map((s) => ({
        key: s.name,
        cells: [
          {
            label: 'Who',
            width: '26%',
            node: (
              <>
                <span className="font-semibold text-etyme-ink">{s.name}</span>
                <span className="mt-1 block">
                  <span className={s.always ? 'chip chip--passive' : 'chip chip--attention'}>
                    {s.always ? 'Every deployment' : 'Only where configured'}
                  </span>
                </span>
                {withProof && (
                  <span className={`mt-1 block font-mono text-[10.5px] text-etyme-faint ${WRAP}`}>
                    {s.provenBy}
                  </span>
                )}
              </>
            ),
          },
          {
            label: 'What for',
            width: '32%',
            node: <span className="text-etyme-muted">{s.purpose}</span>,
          },
          {
            label: 'What reaches it',
            width: '42%',
            node: <span className="text-etyme-muted">{s.reaches}</span>,
          },
        ],
      }))}
    />
  )
}

// ── The body of a document ────────────────────────────────────────────

function OpenQuestion({ id }: { id: string }) {
  const q = COUNSEL_QUESTIONS.find((c) => c.id === id)
  if (!q) return null
  return (
    <p className="border-l-2 border-etyme-attention pl-3 text-[12.5px] leading-relaxed text-etyme-attention">
      <span className="font-semibold">Open for counsel — </span>
      {q.question}{' '}
      <a href={`#${q.id}`} className="underline underline-offset-2">
        Read why it is open
      </a>
      .
    </p>
  )
}

function Block({ section, number, docKey }: { section: Section; number: number; docKey: DocKey }) {
  return (
    <section id={sectionId(section.heading)} className="panel scroll-mt-6 space-y-3">
      <h2 className="font-serif text-[20px] leading-tight tracking-[-0.02em] [text-wrap:balance]">
        <span className="mr-2 font-sans text-[12px] font-semibold tracking-normal text-etyme-faint tabular-nums">
          {number}
        </span>
        {section.heading}
      </h2>

      {section.paragraphs.map((p, i) => (
        <p key={i} className={`max-w-[68ch] text-[14px] leading-relaxed text-etyme-muted ${WRAP}`}>
          {p}
        </p>
      ))}

      {section.table === 'held' && (
        <div className="border-t border-etyme-rule pt-3">
          <HeldTable withProof={docKey === 'privacy'} />
        </div>
      )}

      {section.table === 'sub-processors' && (
        <div className="border-t border-etyme-rule pt-3">
          <SubProcessorTable withProof={docKey === 'privacy'} />
        </div>
      )}

      {section.bullets && section.bullets.length > 0 && (
        <ul className="space-y-2 border-t border-etyme-rule pt-3">
          {section.bullets.map((b, i) => (
            <li
              key={i}
              className={`max-w-[68ch] pl-4 -indent-4 text-[13px] leading-relaxed text-etyme-muted ${WRAP}`}
            >
              <span className="text-etyme-faint">— </span>
              {b}
            </li>
          ))}
        </ul>
      )}

      {section.open && <OpenQuestion id={section.open} />}

      {section.provenBy && (
        <p className={`font-mono text-[10.5px] leading-relaxed text-etyme-faint ${WRAP}`}>
          Checked against {section.provenBy}
        </p>
      )}
    </section>
  )
}

/** Every section across the three documents that waits on one question. */
function waitingOn(id: string): { doc: string; heading: string; href: string }[] {
  return PAGES.flatMap((p) =>
    sectionsOf(p.key)
      .filter((s) => s.open === id)
      .map((s) => ({
        doc: p.label,
        heading: s.heading,
        href: `${p.href}#${sectionId(s.heading)}`,
      }))
  )
}

export function LegalDocument({
  doc,
  docKey,
}: {
  doc: { title: string; intro: string; sections: Section[] }
  docKey: DocKey
}) {
  const current = [...PAGES, CENSUS_PAGE].find((p) => p.key === docKey)!
  const nav = docKey === 'census' ? [CENSUS_PAGE, ...PAGES] : PAGES
  const summary = SUMMARY[docKey]

  return (
    <main className="min-h-screen bg-etyme-canvas px-4 py-8 text-etyme-ink">
      <div className="mx-auto max-w-[1060px]">
        <a href="/" aria-label="Etyme home">
          <EtymeLogo />
        </a>

        <nav className="mt-6 flex flex-wrap gap-4" aria-label="Legal documents">
          {nav.map((p) => (
            <a
              key={p.href}
              href={p.href}
              className={
                p.key === docKey
                  ? 'eyebrow text-etyme-ink'
                  : 'eyebrow text-etyme-faint hover:text-etyme-action'
              }
            >
              {p.label}
            </a>
          ))}
        </nav>

        <header className="mt-5">
          <p className="eyebrow">{DRAFT_BANNER.eyebrow}</p>
          <h1 className="headline-serif mt-2 text-[32px] leading-[1.05] [text-wrap:balance] sm:text-[38px]">
            {doc.title}
          </h1>
          <p className={`mt-3 max-w-[64ch] text-[15px] leading-relaxed text-etyme-muted ${WRAP}`}>
            {doc.intro}
          </p>
        </header>

        {/* The banner, first, because a reader who mistakes a draft for
            reviewed text has been misled by the layout. */}
        <div className="mt-5 rounded-panel border border-etyme-attention bg-etyme-surface p-4">
          <p className="text-[14px] font-semibold leading-snug text-etyme-attention">
            {DRAFT_BANNER.headline}
          </p>
          <p className="mt-2 max-w-[64ch] text-[13px] leading-relaxed text-etyme-muted">
            {DRAFT_BANNER.body}
          </p>
          <p className="mt-2 font-mono text-[11px] text-etyme-faint tabular-nums">
            Code last read end to end on {LAST_VERIFIED}. Open questions:{' '}
            <a href="#for-counsel" className="text-etyme-action underline underline-offset-2">
              {COUNSEL_QUESTIONS.length}, listed in full
            </a>
            .
          </p>
        </div>

        {/* ── The six asks ──────────────────────────────────────────── */}
        <section id="asked-first" className="panel mt-5 scroll-mt-6">
          <p className="eyebrow">Before you read the rest</p>
          <h2 className="mt-1 font-serif text-[20px] leading-tight tracking-[-0.02em]">
            The six things asked first, answered here
          </h2>
          <ul className="mt-4 grid gap-4 border-t border-etyme-rule pt-4 sm:grid-cols-2">
            {summary.map((line) => (
              <li key={line.ask}>
                <a
                  href={line.href}
                  className="text-[13px] font-semibold leading-snug text-etyme-action underline underline-offset-2"
                >
                  {line.ask}
                </a>
                <p className={`mt-1 text-[13px] leading-relaxed text-etyme-muted ${WRAP}`}>
                  {line.answer}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-6 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8">
          {/* ── Contents: a rail on a desktop, a list on a phone ───── */}
          <nav
            aria-label="Contents"
            className="panel mb-5 self-start lg:sticky lg:top-6 lg:mb-0 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
          >
            <p className="eyebrow">Contents</p>
            <ol className="mt-3 space-y-2">
              {doc.sections.map((s, i) => (
                <li key={s.heading} className="text-[12.5px] leading-snug">
                  <a
                    href={`#${sectionId(s.heading)}`}
                    className="text-etyme-muted hover:text-etyme-action"
                  >
                    <span className="mr-1 text-etyme-faint tabular-nums">{i + 1}</span>
                    {s.heading}
                  </a>
                </li>
              ))}
              <li className="border-t border-etyme-rule pt-2 text-[12.5px] leading-snug">
                <a href="#words-used-here" className="text-etyme-muted hover:text-etyme-action">
                  Words used here
                </a>
              </li>
              <li className="text-[12.5px] leading-snug">
                <a href="#for-counsel" className="text-etyme-muted hover:text-etyme-action">
                  Open for counsel
                </a>
              </li>
              <li className="text-[12.5px] leading-snug">
                <a href="#where-to-go-next" className="text-etyme-muted hover:text-etyme-action">
                  Where to go next
                </a>
              </li>
            </ol>
          </nav>

          <div className="min-w-0">
            {/* ── Definitions, once ─────────────────────────────────── */}
            <section id="words-used-here" className="panel scroll-mt-6">
              <p className="eyebrow">Words used here</p>
              <h2 className="mt-1 font-serif text-[20px] leading-tight tracking-[-0.02em]">
                Five words, defined once and not again
              </h2>
              <dl className="mt-3 space-y-2 border-t border-etyme-rule pt-3">
                {DEFINITIONS.map((d) => (
                  <div key={d.term} className="max-w-[68ch] text-[13px] leading-relaxed">
                    <dt className="inline font-semibold text-etyme-ink">{d.term}. </dt>
                    <dd className="inline text-etyme-muted">{d.meaning}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="mt-5 space-y-5">
              {doc.sections.map((s, i) => (
                <Block key={s.heading} section={s} number={i + 1} docKey={docKey} />
              ))}
            </div>

            {/* ── The open questions, as a section a reader can find ─ */}
            <section id="for-counsel" className="panel mt-5 scroll-mt-6 space-y-4">
              <div>
                <p className="eyebrow">Open for counsel</p>
                <h2 className="mt-1 font-serif text-[20px] leading-tight tracking-[-0.02em] [text-wrap:balance]">
                  What a lawyer has to decide before any of this binds anybody
                </h2>
                <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-etyme-muted">
                  Each of these is a question Etyme deliberately did not answer. Under each
                  one: what the software does today, stated without a legal conclusion, why
                  an engineer cannot settle it, and which sections of these three documents
                  are waiting on the answer.
                </p>
              </div>

              <ol className="space-y-5 border-t border-etyme-rule pt-4">
                {COUNSEL_QUESTIONS.map((q, i) => {
                  const waits = waitingOn(q.id)
                  return (
                    <li key={q.id} id={q.id} className="max-w-[68ch] scroll-mt-6">
                      <p className="text-[14px] font-semibold leading-snug">
                        <span className="mr-2 text-etyme-faint tabular-nums">{i + 1}</span>
                        {q.question}
                      </p>
                      <p className="mt-2">
                        <span className="chip chip--attention">Open — nobody has answered it</span>
                      </p>
                      <p className="mt-2 text-[13px] leading-relaxed text-etyme-muted">
                        <span className="text-etyme-faint">What the code does today. </span>
                        {q.whatTheCodeDoes}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-etyme-muted">
                        <span className="text-etyme-faint">Why it is open. </span>
                        {q.whyItIsOpen}
                      </p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-etyme-faint">
                        {waits.length === 0 ? (
                          'No section of these three documents waits on it; it decides what happens next rather than what is written here.'
                        ) : (
                          <>
                            Waiting on it:{' '}
                            {waits.map((w, n) => (
                              <span key={w.href}>
                                {n > 0 && ' · '}
                                <a href={w.href} className="underline underline-offset-2">
                                  {w.doc}: {w.heading}
                                </a>
                              </span>
                            ))}
                          </>
                        )}
                      </p>
                    </li>
                  )
                })}
              </ol>
            </section>

            {/* ── Where a reader goes next ──────────────────────────── */}
            <section id="where-to-go-next" className="panel mt-5 scroll-mt-6">
              <p className="eyebrow">Where to go next</p>
              <ul className="mt-3 space-y-3 border-t border-etyme-rule pt-3">
                {CROSS_LINKS[docKey].map((l) => (
                  <li key={l.href} className="max-w-[68ch]">
                    <a
                      href={l.href}
                      className="text-[13px] font-semibold text-etyme-action underline underline-offset-2"
                    >
                      {l.label}
                    </a>
                    <p className="mt-1 text-[13px] leading-relaxed text-etyme-muted">{l.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <footer className="mt-8 border-t border-etyme-rule pt-6">
          <p className={`max-w-[68ch] font-mono text-[11px] leading-relaxed text-etyme-faint ${WRAP}`}>
            {current.label} — a draft, last read against the code on {LAST_VERIFIED}. Etyme is
            the system of record for contingent workers: the layer between a company and
            every staffing supplier it uses. It runs no bench and places nobody.
          </p>
        </footer>
      </div>
    </main>
  )
}
