import { EtymeLogo } from '@/components/logo'
import {
  DRAFT_BANNER,
  COUNSEL_QUESTIONS,
  LAST_VERIFIED,
  type Section,
} from '@/lib/legal'

/**
 * How all three legal pages are drawn.
 *
 * One renderer, because a terms page that looks different from the
 * privacy page beside it reads as two documents written by two people at
 * two times, which is exactly what a reviewer is checking for.
 *
 * The draft banner is at the top of every one of them and cannot be
 * scrolled past. That is deliberate: these were written by reading code,
 * not by a lawyer, and a reader who mistakes them for reviewed legal
 * text has been misled by the layout.
 */

const PAGES = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/dpa', label: 'Data processing' },
]

function OpenQuestion({ id }: { id: string }) {
  const q = COUNSEL_QUESTIONS.find((c) => c.id === id)
  if (!q) return null
  return (
    <p className="mt-3 border-l-2 border-etyme-attention pl-3 text-[12px] leading-relaxed text-etyme-attention">
      <span className="font-semibold">Open for counsel — </span>
      {q.question}
    </p>
  )
}

function Block({ section }: { section: Section }) {
  return (
    <section className="panel space-y-3">
      <h2 className="font-serif text-[19px] leading-tight tracking-[-0.015em]">
        {section.heading}
      </h2>

      {section.paragraphs.map((p, i) => (
        <p key={i} className="max-w-[68ch] text-[14px] leading-relaxed text-etyme-muted">
          {p}
        </p>
      ))}

      {section.bullets && section.bullets.length > 0 && (
        <ul className="space-y-2 border-t border-etyme-rule pt-3">
          {section.bullets.map((b, i) => (
            <li
              key={i}
              className="max-w-[68ch] pl-4 -indent-4 text-[13px] leading-relaxed text-etyme-muted"
            >
              <span className="text-etyme-faint">— </span>
              {b}
            </li>
          ))}
        </ul>
      )}

      {section.open && <OpenQuestion id={section.open} />}

      {section.provenBy && (
        <p className="font-mono text-[11px] leading-relaxed text-etyme-faint">
          Checked against {section.provenBy}
        </p>
      )}
    </section>
  )
}

export function LegalDocument({
  doc,
  current,
}: {
  doc: { title: string; intro: string; sections: Section[] }
  current: string
}) {
  return (
    <main className="min-h-screen bg-etyme-canvas px-4 py-10 text-etyme-ink">
      <div className="mx-auto max-w-[760px]">
        <a href="/">
          <EtymeLogo />
        </a>

        <nav className="mt-6 flex flex-wrap gap-4">
          {PAGES.map((p) => (
            <a
              key={p.href}
              href={p.href}
              className={
                p.href === current
                  ? 'eyebrow text-etyme-ink'
                  : 'eyebrow text-etyme-faint hover:text-etyme-action'
              }
            >
              {p.label}
            </a>
          ))}
        </nav>

        <header className="mt-6">
          <p className="eyebrow">{DRAFT_BANNER.eyebrow}</p>
          <h1 className="headline-serif mt-2 text-[32px] leading-[1.05]">{doc.title}</h1>
          <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-etyme-muted">
            {doc.intro}
          </p>
        </header>

        <div className="mt-6 rounded-panel border border-etyme-attention bg-etyme-surface p-4">
          <p className="text-[14px] font-semibold leading-snug text-etyme-attention">
            {DRAFT_BANNER.headline}
          </p>
          <p className="mt-2 max-w-[64ch] text-[13px] leading-relaxed text-etyme-muted">
            {DRAFT_BANNER.body}
          </p>
          <p className="mt-2 font-mono text-[11px] text-etyme-faint">
            Code last read end to end on {LAST_VERIFIED}.
          </p>
        </div>

        <div className="mt-6 space-y-5">
          {doc.sections.map((s) => (
            <Block key={s.heading} section={s} />
          ))}
        </div>

        <section className="panel mt-8 space-y-4">
          <div>
            <p className="eyebrow">For counsel</p>
            <h2 className="mt-1 font-serif text-[19px] leading-tight tracking-[-0.015em]">
              What a lawyer has to decide before any of this binds anybody
            </h2>
            <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-etyme-muted">
              Each of these is a question Etyme deliberately did not answer. Under each
              one: what the software does today, stated without a legal conclusion, and
              why an engineer cannot settle it.
            </p>
          </div>

          <ol className="space-y-5 border-t border-etyme-rule pt-4">
            {COUNSEL_QUESTIONS.map((q, i) => (
              <li key={q.id} id={q.id} className="max-w-[68ch]">
                <p className="text-[14px] font-semibold leading-snug">
                  {i + 1}. {q.question}
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

        <footer className="mt-10 border-t border-etyme-rule pt-6">
          <p className="max-w-[68ch] font-mono text-[11px] leading-relaxed text-etyme-faint">
            Etyme is the system of record for contingent workers — the layer between a
            company and every staffing supplier it uses. It runs no bench and places
            nobody.
          </p>
        </footer>
      </div>
    </main>
  )
}
