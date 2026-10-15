import { SiteHeader, SiteFooter } from '@/lib/public-site/frame'
import {
  DRAFT_BANNER,
  COUNSEL_QUESTIONS,
  CENSUS_LINKS,
  CENSUS_SUMMARY,
  DEFINITIONS,
  LAST_VERIFIED,
  sectionId,
  type Section,
} from '@/lib/legal'

/**
 * How the census agreement is drawn.
 *
 * Until 2026-10-15 one component drew all four legal documents. The
 * Privacy Notice, the Terms and the DPA are now published from the text
 * the founder approved and drawn by `app/legal/document`; the census
 * agreement was not part of that approval, so it keeps the layout and
 * the words it had: the draft banner, the six things asked before a
 * file moves, the words used, the six sections, the questions counsel
 * has to answer, and where to go next. Moved here unchanged except that
 * each counsel question no longer lists the sections of the other three
 * documents that waited on it, because those sections are gone; the
 * published documents mark their open points in their own text.
 *
 * Phone first: 16px gutters, one column, and text that breaks anywhere
 * rather than widening the page.
 */

interface Page {
  href: string
  label: string
  current?: boolean
}

/** The agreement first, then the three published documents. */
const NAV: Page[] = [
  { href: '/legal/census-agreement', label: 'Census agreement', current: true },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/dpa', label: 'Data processing' },
]

/** Long words break anywhere rather than widening the page. */
const WRAP = 'break-words [overflow-wrap:anywhere]'

function Block({ section, number }: { section: Section; number: number }) {
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

      {section.provenBy && (
        <p className={`font-mono text-[10.5px] leading-relaxed text-etyme-faint ${WRAP}`}>
          Checked against {section.provenBy}
        </p>
      )}
    </section>
  )
}

export function CensusAgreementDocument({
  doc,
}: {
  doc: { title: string; intro: string; sections: Section[] }
}) {
  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <SiteHeader />
      <main className="px-4 py-8">
        <div className="mx-auto max-w-[1060px]">
          <nav className="flex flex-wrap gap-4" aria-label="Legal documents">
            {NAV.map((p) => (
              <a
                key={p.href}
                href={p.href}
                className={p.current ? 'eyebrow text-etyme-ink' : 'eyebrow text-etyme-faint hover:text-etyme-action'}
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

          <section id="asked-first" className="panel mt-5 scroll-mt-6">
            <p className="eyebrow">Before you read the rest</p>
            <h2 className="mt-1 font-serif text-[20px] leading-tight tracking-[-0.02em]">
              The six things asked first, answered here
            </h2>
            <ul className="mt-4 grid gap-4 border-t border-etyme-rule pt-4 sm:grid-cols-2">
              {CENSUS_SUMMARY.map((line) => (
                <li key={line.ask}>
                  <a
                    href={line.href}
                    className="text-[13px] font-semibold leading-snug text-etyme-action underline underline-offset-2"
                  >
                    {line.ask}
                  </a>
                  <p className={`mt-1 text-[13px] leading-relaxed text-etyme-muted ${WRAP}`}>{line.answer}</p>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-6 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8">
            <nav
              aria-label="Contents"
              className="panel mb-5 self-start lg:sticky lg:top-6 lg:mb-0 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
            >
              <p className="eyebrow">Contents</p>
              <ol className="mt-3 space-y-2">
                {doc.sections.map((s, i) => (
                  <li key={s.heading} className="text-[12.5px] leading-snug">
                    <a href={`#${sectionId(s.heading)}`} className="text-etyme-muted hover:text-etyme-action">
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
                  <Block key={s.heading} section={s} number={i + 1} />
                ))}
              </div>

              <section id="for-counsel" className="panel mt-5 scroll-mt-6 space-y-4">
                <div>
                  <p className="eyebrow">Open for counsel</p>
                  <h2 className="mt-1 font-serif text-[20px] leading-tight tracking-[-0.02em] [text-wrap:balance]">
                    What a lawyer has to decide before any of this binds anybody
                  </h2>
                  <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-etyme-muted">
                    Each of these is a question Etyme deliberately did not answer. Under each one:
                    what the software does today, stated without a legal conclusion, and why an
                    engineer cannot settle it.
                  </p>
                </div>

                <ol className="space-y-5 border-t border-etyme-rule pt-4">
                  {COUNSEL_QUESTIONS.map((q, i) => (
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
                    </li>
                  ))}
                </ol>
              </section>

              <section id="where-to-go-next" className="panel mt-5 scroll-mt-6">
                <p className="eyebrow">Where to go next</p>
                <ul className="mt-3 space-y-3 border-t border-etyme-rule pt-3">
                  {CENSUS_LINKS.map((l) => (
                    <li key={l.href} className="max-w-[68ch]">
                      <a href={l.href} className="text-[13px] font-semibold text-etyme-action underline underline-offset-2">
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
              Census agreement — a draft, last read against the code on {LAST_VERIFIED}. Etyme is the
              system of record for contingent workers: the layer between a company and every
              staffing supplier it uses. It runs no bench and places nobody.
            </p>
          </footer>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
