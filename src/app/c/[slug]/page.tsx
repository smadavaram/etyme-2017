import { notFound, permanentRedirect } from 'next/navigation'
import { portfolioOf, movedTo } from '@/lib/portfolio-data'
import type { Portfolio } from '@/lib/consultant-portfolio'

/**
 * A consultant's own page.
 *
 * Every agency they work through has one. The person doing the work had
 * nothing, which is backwards in a market where the person is the product.
 *
 * Three things are deliberate and all three are the point:
 *
 *   It is theirs. Nothing here filters by which agency represents them, so
 *   leaving one changes nothing on this page.
 *
 *   It shows what they did, never who for. "One year six months on an SAP
 *   FICO rollout at a medical device manufacturer" says everything a reader
 *   needs and names nobody who did not agree to be named.
 *
 *   It is off until they turn it on.
 *
 * Rendered on the server so it is fast, indexable and works with
 * JavaScript off — a public page is the one surface where that still
 * matters.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = await portfolioOf(slug)
  if (!p) return { title: 'Not found' }
  return {
    title: `${p.name} — ${p.headline}`,
    description: `${p.intro} ${p.availability}`.trim(),
  }
}

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">
      {children}
    </p>
  )
}

function Rule() {
  return <div className="mt-12 pt-10 border-t border-etyme-rule" />
}

export default async function ConsultantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p: Portfolio | null = await portfolioOf(slug)

  if (!p) {
    // An address they used before still finds them. A portfolio link that
    // has been sitting on a CV for two years should never be dead.
    const now = await movedTo(slug)
    if (now) permanentRedirect(`/c/${now}`)
    notFound()
  }

  const free = p.availability.startsWith('Available now')

  return (
    <div className="min-h-screen bg-etyme-canvas">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <header>
          <Lbl>{p.location ?? 'Contract consultant'}</Lbl>
          <h1 className="font-serif text-5xl text-etyme-ink mt-3 tracking-[-0.02em] text-balance">
            {p.name}
          </h1>
          <p className="text-[19px] text-etyme-ink mt-3 max-w-xl leading-relaxed">{p.headline}</p>
          <p className="text-[15px] text-etyme-muted mt-3 max-w-xl leading-relaxed">{p.intro}</p>

          {/* The first thing anybody wants to know, and the one thing a CV
              never says. */}
          <p
            className={`text-[15px] mt-6 ${free ? 'text-etyme-verified' : 'text-etyme-ink'}`}
          >
            {p.availability}
          </p>
        </header>

        {p.skills.length > 0 && (
          <>
            <Rule />
            <section>
              <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">
                What they work on
              </h2>
              {/* Years are counted from engagements, never claimed. A skill
                  with no number is one they have not been placed on, and
                  that gap is worth a reader seeing rather than hiding. */}
              <p className="text-[13px] text-etyme-muted mt-1">
                Years counted from real engagements, not from a claim.
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                {p.skills.map((s) => (
                  <span
                    key={s.skill}
                    className="px-3 py-1.5 rounded-full bg-etyme-surface border border-etyme-rule
                               text-[13px] text-etyme-ink"
                  >
                    {s.skill}
                    {s.years !== null && (
                      <span className="ml-1.5 text-etyme-faint tabular-nums">{s.years}y</span>
                    )}
                  </span>
                ))}
              </div>
            </section>
          </>
        )}

        <Rule />
        <section>
          <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">Where they have worked</h2>

          {p.engagements.length === 0 ? (
            <p className="text-[15px] text-etyme-muted mt-3 max-w-xl leading-relaxed">
              No engagements through Etyme yet. This fills in from real work as it happens.
            </p>
          ) : (
            <>
              <p className="text-[13px] text-etyme-muted mt-1 max-w-lg">
                {/* No client names anywhere on this page. They agreed to
                    hire somebody, not to appear in their marketing. */}
                By sector. Clients are not named.
              </p>
              <div className="mt-5 space-y-3">
                {p.engagements.map((e, i) => (
                  <div
                    key={i}
                    className="bg-etyme-surface border border-etyme-rule rounded-lg p-4"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-[16px] text-etyme-ink">{e.role}</p>
                      <span className="text-[12px] text-etyme-faint shrink-0 tabular-nums">
                        {e.lasted}
                        {e.current && <span className="text-etyme-verified ml-1.5">now</span>}
                      </span>
                    </div>
                    <p className="text-[13px] text-etyme-muted mt-0.5">
                      {[e.sector, e.location].filter(Boolean).join(' · ')}
                    </p>
                    {e.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {e.skills.slice(0, 8).map((s) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 rounded bg-etyme-canvas text-[12px] text-etyme-muted"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* The BRD's thesis is that a recruiter becomes somebody who
            develops people. This is the consultant's half of that — visible
            evidence of keeping current. */}
        {p.training.length > 0 && (
          <>
            <Rule />
            <section>
              <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">
                What they have been learning
              </h2>
              <div className="mt-5 space-y-2">
                {p.training.map((t) => (
                  <div key={t.title} className="flex items-baseline justify-between gap-4 max-w-lg">
                    <span className="text-[15px] text-etyme-ink">{t.title}</span>
                    <span className="text-[12px] text-etyme-muted tabular-nums shrink-0">{t.when}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {p.verified.length > 0 && (
          <>
            <Rule />
            <section>
              <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">
                Checks that are current
              </h2>
              {/* What passed, never the paperwork behind it. An I-9 is
                  private; the fact of a right to work is not. */}
              <p className="text-[13px] text-etyme-muted mt-1 max-w-lg">
                Recorded on Etyme. The documents themselves stay private.
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                {p.verified.map((v) => (
                  <span
                    key={v}
                    className="px-3 py-1.5 rounded-full bg-etyme-verified/10 text-[13px] text-etyme-verified"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </section>
          </>
        )}

        <footer className="mt-16 pt-8 border-t border-etyme-rule">
          {p.totalYears !== null && (
            <p className="text-[13px] text-etyme-muted">
              {p.totalYears} year{p.totalYears === 1 ? '' : 's'} of contract work counted on Etyme.
            </p>
          )}
          {/* Being here is not a recommendation from us. Implying otherwise
              would make every page on the platform worth less. */}
          <p className="text-[12px] text-etyme-faint mt-2 max-w-lg leading-relaxed">
            Everything counted on this page comes from work recorded on Etyme. It is not a
            recommendation — nothing here is vouched for by us.
          </p>
          <p className="text-[12px] text-etyme-faint mt-4">
            <a href="https://etyme.com" className="hover:text-etyme-ink transition-colors">
              Etyme
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}
