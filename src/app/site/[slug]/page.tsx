import { notFound } from 'next/navigation'
import { publicSite, type PublicSite } from '@/lib/public-site'

/**
 * A company's public page.
 *
 * The ninety-second promise, finally kept. `siteLiveAt` has been set at
 * sign-up since the beginning and nothing was ever served on it, so the
 * subdomain a company was given led nowhere.
 *
 * Rendered on the server so it is fast, indexable, and works with
 * JavaScript off — a public page is the one surface where that still
 * matters. It reads the database directly rather than fetching its own
 * API: a server component calling its own HTTP endpoint doubles the
 * latency and breaks the moment the public hostname does not resolve from
 * inside the container.
 *
 * The design question is what a staffing firm can honestly say about
 * itself on day one, with no placements. The answer is what it does, where,
 * and what it holds — and where there is no track record yet, saying so
 * rather than showing a zero dressed up as a milestone.
 */

type Site = PublicSite

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const site = await publicSite(slug)
  if (!site) return { title: 'Not found' }
  return {
    title: `${site.name} — ${site.does}`,
    description: site.track.isNew
      ? `${site.name} ${site.does}.`
      : `${site.name} ${site.does}. ${site.track.placements} placement${site.track.placements === 1 ? '' : 's'} across ${site.track.clients} client${site.track.clients === 1 ? '' : 's'}.`,
  }
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{label}</p>
      <p className="font-serif text-4xl text-etyme-ink mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-[13px] text-etyme-muted mt-0.5">{sub}</p>}
    </div>
  )
}

export default async function CompanySite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const site: Site | null = await publicSite(slug)
  if (!site) notFound()

  return (
    <div className="min-h-screen bg-etyme-canvas">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <header>
          <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">
            {site.locations.length > 0 ? site.locations.join(' · ') : 'Etyme'}
          </p>
          <h1 className="font-serif text-5xl text-etyme-ink mt-3 tracking-[-0.02em] text-balance">
            {site.name}
          </h1>
          <p className="text-[19px] text-etyme-muted mt-3 max-w-xl leading-relaxed">
            {site.name} {site.does}.
          </p>

          {site.verifiedDomain && (
            <p className="text-[13px] text-etyme-verified mt-4">
              Verified as {site.verifiedDomain}
            </p>
          )}
        </header>

        {/* What they have actually done — counted, never claimed. */}
        <section className="mt-14 pt-10 border-t border-etyme-rule">
          {site.track.isNew ? (
            <p className="text-[15px] text-etyme-muted max-w-xl leading-relaxed">
              New here — no placements through Etyme yet. Everything on this page is counted
              from what actually happens, so it fills in as they work.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-8">
              <Stat label="Placements" value={site.track.placements} sub="through Etyme" />
              <Stat label="Working now" value={site.track.activeNow} sub="live contracts" />
              <Stat
                label="Clients"
                value={site.track.clients}
                sub={site.track.clients === 1 ? 'organisation' : 'organisations'}
              />
            </div>
          )}
        </section>

        {site.skills.length > 0 && (
          <section className="mt-12 pt-10 border-t border-etyme-rule">
            <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">
              What they place
            </h2>
            {/* Taken from the people on their bench rather than from
                anything they typed about themselves. */}
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
        )}

        {site.credentials.length > 0 && (
          <section className="mt-12 pt-10 border-t border-etyme-rule">
            <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]">
              What they hold
            </h2>
            <div className="mt-5 space-y-2">
              {site.credentials.map((c) => (
                <div key={c.what} className="flex items-baseline justify-between gap-4 max-w-md">
                  <span className="text-[15px] text-etyme-ink">{c.what}</span>
                  {/* A date, so this is a fact with a shelf life rather
                      than a badge that never comes off. */}
                  <span className="text-[13px] text-etyme-muted tabular-nums shrink-0">
                    {c.until ? `to ${c.until}` : 'held'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-16 pt-8 border-t border-etyme-rule">
          <p className="text-[13px] text-etyme-muted">
            {site.name} has been on Etyme since {site.liveSince}.
          </p>
          {/* Public site and private network are different things. Being
              here is not a recommendation from us, and implying otherwise
              would make every page on the platform worth less. */}
          <p className="text-[12px] text-etyme-faint mt-2 max-w-lg leading-relaxed">
            {site.inNetwork
              ? 'They are visible to other companies on Etyme. Everything counted above comes from work recorded on the platform.'
              : 'This page is public. It is not a recommendation — the numbers are counted from work recorded on Etyme, and nothing here is vouched for by us.'}
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
