import { SiteHeader, SiteFooter } from '@/lib/public-site/frame'
import { LEGAL_PAGES, legalPage, oldAnchorsFor, type LegalKey } from '@/lib/legal/documents'
import type { Block, Line } from '@/lib/legal/parse'

/**
 * How the Privacy Notice, the Terms of Service and the DPA are drawn.
 *
 * The founder read the three drafts and said "Publish" (2026-10-15).
 * Earlier the same day he had said the legal pages are read whole, so
 * this draws them the way a well-run company's legal pages read: the
 * shared header and footer, a row of links between the three, the draft
 * notice first, the title, the dates, the opening paragraph, a short
 * list of the sections, and then every section, open. No folds, no
 * summary box, nothing to click to read the rest.
 *
 * ── What the reader must be able to see ─────────────────────────────
 *
 * Text in square brackets is a point counsel has not decided. It is
 * drawn as marked text on a light wash, so a reader sees at once which
 * sentences are settled and which are not, without a legend. The notice
 * at the top says what the brackets mean.
 *
 * ── Phone first ──────────────────────────────────────────────────────
 *
 * 16px gutters and a text column of about seventy characters. A table
 * is wider than a phone, so it scrolls sideways inside its own box and
 * the page around it never does. Figures in a table line up.
 *
 * ── Addresses ────────────────────────────────────────────────────────
 *
 * Every section has an address read off its heading
 * (`#10-how-long-we-keep-information`), and so does every numbered part
 * inside one (`#4-6-personal-data-breaches`). The addresses the pages
 * had before this text was published are drawn too, at the top of the
 * section that now says the same thing (`OLD_ANCHORS` in
 * `lib/legal/documents`), so a link already sent still lands.
 */

/** The text column, about seventy characters. */
const MEASURE = 'max-w-[70ch]'

/** One line of the approved text: strong runs, and counsel's points marked. */
function Runs({ line }: { line: Line }) {
  return (
    <>
      {line.map((r, i) => {
        let node: React.ReactNode = r.text
        if (r.strong) node = <strong className="font-semibold text-etyme-ink">{node}</strong>
        if (r.counsel) {
          node = (
            <mark
              data-counsel=""
              className="rounded-[3px] bg-etyme-attention-wash px-[3px] text-etyme-ink [box-decoration-break:clone]"
            >
              {node}
            </mark>
          )
        }
        return <span key={i}>{node}</span>
      })}
    </>
  )
}

/** A second address on the same spot, for a link written before 2026-10-15. */
function Aliases({ docKey, id }: { docKey: LegalKey; id: string }) {
  return (
    <>
      {oldAnchorsFor(docKey, id).map((alias) => (
        <span key={alias} id={alias} aria-hidden="true" className="block scroll-mt-6" />
      ))}
    </>
  )
}

function BlockView({ block, docKey }: { block: Block; docKey: LegalKey }) {
  switch (block.kind) {
    case 'rule':
      // The drafts set a rule under the opening paragraph; the contents
      // list and the section headings already do that job on the page.
      return null
    case 'subheading':
      return (
        <>
          <Aliases docKey={docKey} id={block.id} />
          <h3
            id={block.id}
            className="scroll-mt-6 pt-2 text-[15px] font-semibold leading-snug text-etyme-ink"
          >
            {block.text}
          </h3>
        </>
      )
    case 'paragraph':
      return (
        <p className={`${MEASURE} text-[15px] leading-relaxed text-etyme-muted`}>
          {block.lines.map((line, i) => (
            <span key={i}>
              {i > 0 && <br />}
              <Runs line={line} />
            </span>
          ))}
        </p>
      )
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i} className="pl-1">
          <Runs line={item} />
        </li>
      ))
      const cls = `${MEASURE} space-y-1.5 pl-5 text-[15px] leading-relaxed text-etyme-muted`
      return block.ordered ? (
        <ol start={block.start} className={`${cls} list-decimal marker:text-etyme-faint marker:tabular-nums`}>
          {items}
        </ol>
      ) : (
        <ul className={`${cls} list-disc marker:text-etyme-faint`}>{items}</ul>
      )
    }
    case 'table':
      return (
        // The table scrolls inside its own box on a phone; the page does not.
        <div
          role="region"
          aria-label="Table"
          tabIndex={0}
          className="overflow-x-auto rounded-panel border border-etyme-rule bg-etyme-raised"
        >
          <table className="w-full min-w-[34rem] border-collapse text-left text-[13px] leading-relaxed tabular-nums">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="eyebrow border-b border-etyme-rule px-3 pb-2 pt-3 align-bottom"
                  >
                    <Runs line={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="align-top [&:last-child>td]:border-b-0">
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      className={`border-b border-etyme-rule px-3 py-2.5 ${
                        i === 0 ? 'font-medium text-etyme-ink' : 'text-etyme-muted'
                      }`}
                    >
                      <Runs line={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

export function LegalDocument({ docKey }: { docKey: LegalKey }) {
  const doc = legalPage(docKey)

  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <SiteHeader />
      <main className="px-4 py-8 sm:py-12">
        <article className="mx-auto max-w-[46rem]">
          <nav aria-label="Legal documents" className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_PAGES.map((p) => (
              <a
                key={p.key}
                href={p.href}
                aria-current={p.key === docKey ? 'page' : undefined}
                className={
                  p.key === docKey
                    ? 'eyebrow text-etyme-ink underline underline-offset-4'
                    : 'eyebrow text-etyme-faint hover:text-etyme-action'
                }
              >
                {p.short}
              </a>
            ))}
          </nav>

          {/* The draft notice, first: a reader who takes a draft for
              reviewed text has been misled by the layout. */}
          <p
            role="note"
            className={`mt-6 ${MEASURE} rounded-panel border border-etyme-attention-line bg-etyme-attention-wash px-4 py-3 text-[14px] leading-relaxed text-etyme-ink`}
          >
            <Runs line={doc.notice} />
          </p>

          <header className="mt-6">
            <h1 className="headline-serif text-[34px] leading-[1.05] [text-wrap:balance] sm:text-[40px]">
              {doc.title}
            </h1>
            <dl className="mt-4 space-y-1 text-[13px] text-etyme-muted tabular-nums">
              {doc.dates.map((d) => (
                <div key={d.label}>
                  <dt className="inline font-semibold text-etyme-ink">{d.label}: </dt>
                  <dd className="inline">
                    <Runs line={d.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </header>

          <div className="mt-6 space-y-4">
            {doc.intro.map((b, i) => (
              <BlockView key={i} block={b} docKey={docKey} />
            ))}
          </div>

          <nav aria-label="Contents" className="mt-8 border-y border-etyme-rule py-5">
            <p className="eyebrow">Contents</p>
            <ol className="mt-3 space-y-1.5 text-[14px] leading-snug">
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-etyme-muted hover:text-etyme-action">
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Every section, open, in order. */}
          <div className="mt-8 space-y-10">
            {doc.sections.map((s) => (
              <section key={s.id} aria-labelledby={s.id} className="space-y-4">
                <Aliases docKey={docKey} id={s.id} />
                <h2
                  id={s.id}
                  className="scroll-mt-6 font-serif text-[22px] leading-tight tracking-[-0.02em] [text-wrap:balance]"
                >
                  {s.heading}
                </h2>
                {s.blocks.map((b, i) => (
                  <BlockView key={i} block={b} docKey={docKey} />
                ))}
              </section>
            ))}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
