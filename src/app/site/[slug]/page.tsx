import { notFound } from 'next/navigation'
import { publicSite, type PublicSite } from '@/lib/public-site'
import type { Measure } from '@/lib/buyer-reputation'

/**
 * A company's public page.
 *
 * The first version was one page of facts for nobody in particular. It was
 * honest and inert — you read it and were done.
 *
 * There is no single audience, so there is no single page. A client or
 * delivery partner is talking to suppliers; a staffing firm is talking to
 * candidates, clients and peer firms at once. Same data underneath,
 * different page, which is the rule CLAUDE.md already sets for the
 * dashboard.
 *
 * Rendered on the server so it is fast, indexable and works with
 * JavaScript off — a public page is the one surface where that still
 * matters.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const site = await publicSite(slug)
  if (!site) return { title: 'Not found' }

  const description =
    site.audience === 'SUPPLIERS'
      ? site.openPositions.length > 0
        ? `${site.openPositions.length} contract position${site.openPositions.length === 1 ? '' : 's'} open to suppliers. ${site.reputation?.worthIt ?? ''}`
        : `${site.name} ${site.does}.`
      : site.comingFree.length > 0
        ? `${site.name} ${site.does}. ${site.comingFreeSummary}`
        : `${site.name} ${site.does}.`

  return { title: `${site.name} — ${site.does}`, description: description.trim() }
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

/**
 * A measure with its confidence attached.
 *
 * Where there is no number, the reason is shown instead of a blank — "only
 * three so far" tells a supplier something a dash does not. And what the
 * measure cannot see is printed under it, because a median that quietly
 * drops the still-waiting cases flatters whoever is slowest.
 */
function Fact({ label, m, basisUnit }: { label: string; m: Measure; basisUnit?: string }) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      <p
        className={`mt-1.5 ${
          m.value === null
            ? 'text-[14px] text-etyme-faint leading-snug'
            : 'font-serif text-2xl text-etyme-ink tracking-[-0.01em]'
        }`}
      >
        {m.said}
      </p>
      {/* How much the number rests on, where that is a meaningful count.
          Tenure has no such count — it is a median across engagements, and
          "across 1" would read as though one person's stay decided it. */}
      {m.value !== null && basisUnit && (
        <p className="text-[12px] text-etyme-muted mt-1">
          across {m.basis} {m.basis === 1 ? basisUnit.replace(/s$/, '') : basisUnit}
        </p>
      )}
      {m.unknown && (
        <p className="text-[12px] text-etyme-attention mt-1.5 max-w-xs leading-snug">{m.unknown}</p>
      )}
    </div>
  )
}

export default async function CompanySite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const site: PublicSite | null = await publicSite(slug)
  if (!site) notFound()

  return (
    <div className="min-h-screen bg-etyme-canvas">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <header>
          <Lbl>{site.locations.length > 0 ? site.locations.join(' · ') : 'Etyme'}</Lbl>
          <h1 className="font-serif text-5xl text-etyme-ink mt-3 tracking-[-0.02em] text-balance">
            {site.name}
          </h1>
          {/* Their words, generated once from their own numbers and
              editable. The facts further down are never generated — they
              are read live, so nothing on this page can go stale. */}
          <p className="text-[19px] text-etyme-ink mt-3 max-w-xl leading-relaxed">
            {site.tagline}
          </p>
          <p className="text-[15px] text-etyme-muted mt-3 max-w-xl leading-relaxed">
            {site.intro}
          </p>
          {site.verifiedDomain && (
            <p className="text-[13px] text-etyme-verified mt-4">Verified as {site.verifiedDomain}</p>
          )}
        </header>

        {site.audience === 'SUPPLIERS' ? (
          <ForSuppliers site={site} />
        ) : (
          <ForTalentAndBuyers site={site} />
        )}

        <footer className="mt-16 pt-8 border-t border-etyme-rule">
          <p className="text-[13px] text-etyme-muted">
            {site.name} has been on Etyme since {site.liveSince}.
          </p>
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

// ── A buyer, talking to suppliers ─────────────────────────────────────

function ForSuppliers({ site }: { site: PublicSite }) {
  const rep = site.reputation

  return (
    <>
      <Rule />
      <section>
        <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">
          {site.headings.openPositions ?? 'Open to any supplier'}
        </h2>

        {site.openPositions.length === 0 ? (
          <p className="text-[15px] text-etyme-muted mt-3 max-w-xl leading-relaxed">
            Nothing open to the network right now. {site.name} works with{' '}
            {rep && rep.suppliers > 0
              ? `${rep.suppliers} supplier${rep.suppliers === 1 ? '' : 's'} they have already chosen`
              : 'suppliers they invite directly'}
            .
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {site.openPositions.map((p) => (
              <div key={p.id} className="bg-etyme-surface border border-etyme-rule rounded-lg p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[16px] text-etyme-ink">{p.title}</p>
                  <span className="text-[12px] text-etyme-faint shrink-0 tabular-nums">
                    open {p.openFor}
                  </span>
                </div>
                <p className="text-[13px] text-etyme-muted mt-0.5">
                  {[p.location, p.heads > 1 ? `${p.heads} people` : null].filter(Boolean).join(' · ')}
                </p>
                {p.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {p.skills.slice(0, 8).map((s) => (
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
            {/* No rates anywhere. What a supplier may charge is agreed per
                supplier for exactly this reason. */}
            <p className="text-[12px] text-etyme-faint pt-1">
              Rates are agreed with each supplier and are not published here.
            </p>
          </div>
        )}
      </section>

      {rep && (
        <>
          <Rule />
          <section>
            <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">
              {site.headings.reputation ?? 'What they are like to work with'}
            </h2>
            {/* The thing no VMS publishes, because every VMS is bought by
                the buyer. It is the buyer's largest cost to a supplier. */}
            <p className="text-[13px] text-etyme-muted mt-1 max-w-lg">
              Counted from what actually happened, not from a survey.
            </p>

            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8 mt-6">
              <Fact label="Time to decide" m={rep.decisionSpeed} basisUnit="decisions" />
              <Fact label="Paying invoices" m={rep.payment} basisUnit="invoices" />
              <Fact label="How long people stay" m={rep.tenure} />
              <div>
                <Lbl>Suppliers working with them</Lbl>
                <p className="font-serif text-2xl text-etyme-ink mt-1.5 tabular-nums">
                  {rep.suppliers}
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {site.credentials.length > 0 && <Credentials site={site} />}
    </>
  )
}

// ── A staffing firm, talking to three people at once ──────────────────

function ForTalentAndBuyers({ site }: { site: PublicSite }) {
  return (
    <>
      {/* Leads with who is coming free. It is the most valuable thing a
          staffing firm knows and the thing it currently tells nobody. */}
      {site.comingFree.length > 0 && (
        <>
          <Rule />
          <section>
            <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">
              {site.headings.comingFree ?? 'Coming free'}
            </h2>
            <p className="text-[15px] text-etyme-muted mt-1.5 max-w-xl leading-relaxed">
              {site.comingFreeSummary}
            </p>

            <div className="mt-5 space-y-2">
              {site.comingFree.slice(0, 8).map((c, i) => (
                <div
                  key={i}
                  className="bg-etyme-surface border border-etyme-rule rounded-lg p-4
                             flex items-baseline justify-between gap-4"
                >
                  <div className="min-w-0">
                    {/* No name. Agreeing to be listed to buyers on the
                        platform is not agreeing to be named on the open
                        internet. */}
                    <p className="text-[15px] text-etyme-ink">{c.headline ?? 'Consultant'}</p>
                    <p className="text-[13px] text-etyme-muted mt-0.5">
                      {[c.location, c.provenAt].filter(Boolean).join(' · ')}
                    </p>
                    {c.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {c.skills.slice(0, 6).map((s) => (
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
                  <span className="text-[13px] text-etyme-ink tabular-nums shrink-0">
                    {c.daysUntilFree === 0 ? 'now' : `${c.daysUntilFree}d`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <Rule />
      <section>
        {site.track.isNew ? (
          <p className="text-[15px] text-etyme-muted max-w-xl leading-relaxed">
            New here — no placements through Etyme yet. Everything on this page is counted from
            what actually happens, so it fills in as they work.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-1 gap-8 sm:grid-cols-3">
            <div>
              <Lbl>Placements</Lbl>
              <p className="font-serif text-4xl text-etyme-ink mt-1 tabular-nums">
                {site.track.placements}
              </p>
              <p className="text-[13px] text-etyme-muted mt-0.5">through Etyme</p>
            </div>
            <div>
              <Lbl>Working now</Lbl>
              <p className="font-serif text-4xl text-etyme-ink mt-1 tabular-nums">
                {site.track.activeNow}
              </p>
              <p className="text-[13px] text-etyme-muted mt-0.5">live contracts</p>
            </div>
            <div>
              <Lbl>Clients</Lbl>
              <p className="font-serif text-4xl text-etyme-ink mt-1 tabular-nums">
                {site.track.clients}
              </p>
              <p className="text-[13px] text-etyme-muted mt-0.5">
                {site.track.clients === 1 ? 'organisation' : 'organisations'}
              </p>
            </div>
          </div>
        )}
      </section>

      {site.skills.length > 0 && (
        <>
          <Rule />
          <section>
            <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">{site.headings.skills ?? 'What they place'}</h2>
            <p className="text-[13px] text-etyme-muted mt-1">
              From the consultants they represent, not from a description.
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              {site.skills.map((s) => (
                <span
                  key={s.skill}
                  className="px-3 py-1.5 rounded-full bg-etyme-surface border border-etyme-rule
                             text-[13px] text-etyme-ink"
                >
                  {s.skill}
                  {s.count > 1 && (
                    <span className="ml-1.5 text-etyme-faint tabular-nums">{s.count}</span>
                  )}
                </span>
              ))}
            </div>
          </section>
        </>
      )}

      {/* For a consultant deciding whether to join their bench. The BRD's
          thesis is that a recruiter becomes somebody who develops people,
          and this is the only visible evidence of whether they do. */}
      {site.training.length > 0 && (
        <>
          <Rule />
          <section>
            <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">
              {site.headings.training ?? 'Training they run'}
            </h2>
            <p className="text-[13px] text-etyme-muted mt-1 max-w-lg">
              Open to consultants on their bench.
            </p>
            <div className="mt-5 space-y-2">
              {site.training.map((t) => (
                <div key={t.title} className="flex items-baseline justify-between gap-4 max-w-lg">
                  <span className="text-[15px] text-etyme-ink">{t.title}</span>
                  <span className="text-[12px] text-etyme-muted tabular-nums shrink-0">
                    {[t.hours ? `${t.hours}h` : null, t.free ? 'free' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {site.credentials.length > 0 && <Credentials site={site} />}
    </>
  )
}

function Credentials({ site }: { site: PublicSite }) {
  return (
    <>
      <Rule />
      <section>
        <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">{site.headings.credentials ?? 'What they hold'}</h2>
        <div className="mt-5 space-y-2">
          {site.credentials.map((c) => (
            <div key={c.what} className="flex items-baseline justify-between gap-4 max-w-md">
              <span className="text-[15px] text-etyme-ink">{c.what}</span>
              {/* A date, so this is a fact with a shelf life rather than a
                  badge that never comes off. */}
              <span className="text-[13px] text-etyme-muted tabular-nums shrink-0">
                {c.until ? `to ${c.until}` : 'held'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
