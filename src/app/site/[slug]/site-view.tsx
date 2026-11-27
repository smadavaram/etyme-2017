import type { ReactNode } from 'react'
import type { PublicSite } from '@/lib/public-site'
import type { Measure } from '@/lib/buyer-reputation'
import { JOIN_BENCH_COPY } from '@/lib/public-site/join-bench'
import { formatDayLong } from '@/lib/format-date'
import { FIRM_ASK_COPY, freeSays, telHref } from '@/lib/public-site/firm-page'
import { orderFor, layoutOf, styleOf, type SectionKey, type SiteLook } from '@/lib/public-site/site-look'
import { JoinBench } from './join-bench'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { Ask } from '../ask'

/**
 * A company's public page, drawn by the one engine (record 111).
 *
 * The sections are decided by the record: what the firm is, what it set, what
 * people agreed to show. The template (record 79) only orders and frames
 * them, and the branding only colors and sets type. Nothing here is a build
 * for one tenant. Rendered on the server, so it is fast, indexable and works
 * with JavaScript off.
 *
 * A person is never printed unless the Owner opted in: the contact block
 * prints only what `site.contact` carries, and that carries a name only after
 * the opt-in (`firmContact`).
 */

function Lbl({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">
      {children}
    </p>
  )
}

type Styled = { look: SiteLook }

function H2({ look, children }: Styled & { children: ReactNode }) {
  return (
    <h2 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]" style={styleOf(look).heading}>
      {children}
    </h2>
  )
}

function Chip({ look, children, round }: Styled & { children: ReactNode; round?: boolean }) {
  const accent = styleOf(look).accent
  return (
    <span
      className={
        round
          ? 'px-3 py-1.5 rounded-full bg-etyme-surface border border-etyme-rule text-[13px] text-etyme-ink'
          : 'px-2 py-0.5 rounded bg-etyme-canvas text-[12px] text-etyme-muted'
      }
      style={accent ? { color: accent } : undefined}
    >
      {children}
    </span>
  )
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
        <p className="text-[12px] text-etyme-attention mt-1.5 max-w-xs leading-relaxed">{m.unknown}</p>
      )}
    </div>
  )
}

/** The sections this record has, as nodes. The same for every template. */
function sectionsOf(site: PublicSite): Partial<Record<SectionKey, ReactNode>> {
  const look = site.look
  const rep = site.reputation
  const out: Partial<Record<SectionKey, ReactNode>> = {}

  if (site.audience === 'SUPPLIERS') {
    out.openPositions = (
      <>
        <H2 look={look}>{site.headings.openPositions ?? 'Open to any supplier'}</H2>
        {site.openPositions.length === 0 ? (
          <p className="text-[15px] text-etyme-muted mt-3 max-w-xl leading-relaxed">
            Nothing open to any supplier right now. {site.name} works with{' '}
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
                  <span className="text-[12px] text-etyme-faint shrink-0 tabular-nums">open {p.openFor}</span>
                </div>
                <p className="text-[13px] text-etyme-muted mt-0.5">
                  {[p.location, p.heads > 1 ? `${p.heads} people` : null].filter(Boolean).join(' · ')}
                </p>
                {p.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {p.skills.slice(0, 8).map((s) => (
                      <Chip key={s} look={look}>{s}</Chip>
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
      </>
    )

    if (rep) {
      out.reputation = (
        <>
          <H2 look={look}>{site.headings.reputation ?? 'What they are like to work with'}</H2>
          {/* The thing no VMS publishes, because every VMS is bought by
              the buyer. It is the buyer's largest cost to a supplier. */}
          <p className="text-[13px] text-etyme-muted mt-1 max-w-lg">
            Counted from what actually happened, not from a survey.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8 mt-6">
            <Fact label="Time to decide" m={rep.decisionSpeed} basisUnit="decisions" />
            <Fact label="Paying bills" m={rep.payment} basisUnit="bills" />
            <Fact label="How long people stay" m={rep.tenure} />
            <div>
              <Lbl>Suppliers working with them</Lbl>
              <p className="font-serif text-2xl text-etyme-ink mt-1.5 tabular-nums">{rep.suppliers}</p>
            </div>
          </div>
        </>
      )
    }
  } else {
    // Leads with who is coming free. It is the most valuable thing a
    // staffing firm knows and the thing it currently tells nobody.
    if (site.comingFree.length > 0) {
      out.comingFree = (
        <>
          <H2 look={look}>{site.headings.comingFree ?? 'Coming free'}</H2>
          <p className="text-[15px] text-etyme-muted mt-1.5 max-w-xl leading-relaxed">{site.comingFreeSummary}</p>
          <div className="mt-5 space-y-2">
            {site.comingFree.slice(0, 8).map((c, i) => (
              <div
                key={i}
                className="bg-etyme-surface border border-etyme-rule rounded-lg p-4 flex items-baseline justify-between gap-4"
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
                        <Chip key={s} look={look}>{s}</Chip>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[13px] text-etyme-ink tabular-nums shrink-0">{freeSays(c)}</span>
              </div>
            ))}
          </div>
        </>
      )
    }

    // For a client: a question that lands in the firm's own Ask Etyme.
    if (site.askBox) {
      out.ask = (
        <>
          <H2 look={look}>{FIRM_ASK_COPY.heading(site.name)}</H2>
          <p className="text-[15px] text-etyme-muted mt-1.5 mb-5 max-w-xl leading-relaxed">
            {FIRM_ASK_COPY.means(site.name)}
          </p>
          <Ask source="GENERATED_SITE" firm={{ slug: site.slug, name: site.name }} />
        </>
      )
    }

    out.track = site.track.isNew ? (
      <p className="text-[15px] text-etyme-muted max-w-xl leading-relaxed">
        New here — no placements through Etyme yet. Everything on this page is counted from
        what actually happens, so it fills in as they work.
      </p>
    ) : (
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        <div>
          <Lbl>Placements</Lbl>
          <p className="font-serif text-4xl text-etyme-ink mt-1 tabular-nums">{site.track.placements}</p>
          <p className="text-[13px] text-etyme-muted mt-0.5">through Etyme</p>
        </div>
        <div>
          <Lbl>Working now</Lbl>
          <p className="font-serif text-4xl text-etyme-ink mt-1 tabular-nums">{site.track.activeNow}</p>
          <p className="text-[13px] text-etyme-muted mt-0.5">live contracts</p>
        </div>
        <div>
          <Lbl>Clients</Lbl>
          <p className="font-serif text-4xl text-etyme-ink mt-1 tabular-nums">{site.track.clients}</p>
          {/* "company": the reader is a US buyer. */}
          <p className="text-[13px] text-etyme-muted mt-0.5">
            {site.track.clients === 1 ? 'company' : 'companies'}
          </p>
        </div>
      </div>
    )

    if (site.skills.length > 0) {
      out.skills = (
        <>
          <H2 look={look}>{site.headings.skills ?? 'What they place'}</H2>
          <p className="text-[13px] text-etyme-muted mt-1">
            From the consultants they represent, not from a description.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            {site.skills.map((s) => (
              <Chip key={s.skill} look={look} round>
                {s.skill}
                {s.count > 1 && <span className="ml-1.5 text-etyme-faint tabular-nums">{s.count}</span>}
              </Chip>
            ))}
          </div>
        </>
      )
    }

    // Courses are listed only where `coursesShown` said so when the page was
    // read: Train to bench on and not hidden by the firm (record 120,
    // answer 3). Empty otherwise, and nothing is drawn.
    if (site.courses.length > 0) {
      out.courses = (
        <>
          <H2 look={look}>Courses</H2>
          <ul className="mt-3 space-y-1.5">
            {site.courses.map((c) => (
              <li key={c.title} className="text-[15px] text-etyme-ink">
                {c.title}
                {c.hours != null && <span className="ml-2 text-etyme-muted tabular-nums">{c.hours} hours</span>}
              </li>
            ))}
          </ul>
        </>
      )
    }

    // One door for a candidate, a staffing or bench firm's page only: the
    // bench's own ask, answered from the letter it sends.
    if (site.joinBench) {
      out.joinBench = (
        <>
          <H2 look={look}>{JOIN_BENCH_COPY.heading}</H2>
          <p className="text-[15px] text-etyme-muted mt-1.5 max-w-xl leading-relaxed">{JOIN_BENCH_COPY.means}</p>
          <JoinBench slug={site.slug} letterCanLeave={mailLeaves()} />
        </>
      )
    }
  }

  if (site.contact) out.contact = <Contact site={site} contact={site.contact} />
  if (site.credentials.length > 0) out.credentials = <Credentials site={site} />
  return out
}

export function SiteView({ site }: { site: PublicSite }) {
  const look = site.look
  const layout = layoutOf(look.template)
  const nodes = sectionsOf(site)
  const keys = orderFor(look.template, Object.keys(nodes) as SectionKey[])
  const style = styleOf(look)

  return (
    <div className="min-h-screen bg-etyme-canvas" style={style.page} data-template={look.template}>
      {style.accent && <div className="h-1" style={{ backgroundColor: style.accent }} />}
      <div className="max-w-3xl mx-auto px-6 py-20">
        <Header site={site} />
        {look.pages.length > 0 && (
          <nav aria-label="Pages" className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
            {look.pages.map((p) => (
              <a key={p.slug} href={`/site/${site.slug}/p/${p.slug}`} className="underline underline-offset-4" style={style.accent ? { color: style.accent } : undefined}>
                {p.title}
              </a>
            ))}
          </nav>
        )}

        {layout.columns === 2 ? (
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {keys.map((k) => (
              <section
                key={k}
                data-section={k}
                className={`bg-etyme-raised border border-etyme-rule rounded-lg p-5 ${layout.wide.includes(k) ? 'sm:col-span-2' : ''}`}
              >
                {nodes[k]}
              </section>
            ))}
          </div>
        ) : (
          keys.map((k) => (
            <div key={k}>
              <div className="mt-12 pt-10 border-t border-etyme-rule" />
              <section data-section={k}>{nodes[k]}</section>
            </div>
          ))
        )}

        <Footer site={site} />
      </div>
    </div>
  )
}

function Header({ site }: { site: PublicSite }) {
  const look = site.look
  return (
    <header>
      {look.logoUrl && (
        // The Owner's own logo, from the address they saved.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={look.logoUrl} alt={`${site.name} logo`} className="h-12 w-auto mb-5" />
      )}
      {site.locations.length > 0 && <Lbl>{site.locations.join(' · ')}</Lbl>}
      <h1 className="font-serif text-5xl text-etyme-ink mt-3 tracking-[-0.02em] text-balance" style={styleOf(look).heading}>
        {site.name}
      </h1>
      {/* Their words, generated once from their own numbers and editable. The
          facts further down are never generated — they are read live, so
          nothing on this page can go stale. */}
      <p className="text-[19px] text-etyme-ink mt-3 max-w-xl leading-relaxed">{site.tagline}</p>
      <p className="text-[15px] text-etyme-muted mt-3 max-w-xl leading-relaxed">{site.intro}</p>
      {site.verifiedDomain && <p className="text-[13px] text-etyme-verified mt-4">Verified as {site.verifiedDomain}</p>}
    </header>
  )
}

export function Footer({ site }: { site: PublicSite }) {
  return (
    <footer className="mt-16 pt-8 border-t border-etyme-rule">
      <p className="text-[13px] text-etyme-muted">
        {site.name} has been on Etyme since {formatDayLong(site.liveSince)}.
      </p>
      {/* Being here is not a recommendation from us. Implying otherwise
          would make every page on the platform worth less. */}
      <p className="text-[12px] text-etyme-faint mt-2 max-w-lg leading-relaxed">
        Everything counted on this page comes from work recorded on Etyme. It is not a
        recommendation from Etyme.
      </p>
      {/* Etyme's own brand on a tenant's page is this and nothing more. */}
      <p className="text-[12px] text-etyme-faint mt-4">
        <a href="https://etyme.com" className="hover:text-etyme-ink transition-colors">
          Runs on Etyme
        </a>
      </p>
    </footer>
  )
}

/** One of the tenant's own pages: its title and words, in the same look. */
export function PageView({ site, page }: { site: PublicSite; page: { title: string; body: string } }) {
  const style = styleOf(site.look)
  const paragraphs = page.body.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean)
  return (
    <div className="min-h-screen bg-etyme-canvas" style={style.page} data-template={site.look.template}>
      {style.accent && <div className="h-1" style={{ backgroundColor: style.accent }} />}
      <div className="max-w-3xl mx-auto px-6 py-20">
        <p className="text-[14px]">
          <a href={`/site/${site.slug}`} className="underline underline-offset-4" style={style.accent ? { color: style.accent } : undefined}>
            {site.name}
          </a>
        </p>
        <h1 className="font-serif text-4xl text-etyme-ink mt-6 tracking-[-0.02em] text-balance" style={style.heading}>
          {page.title}
        </h1>
        <div className="mt-6 space-y-4 max-w-xl">
          {paragraphs.map((t, i) => (
            <p key={i} className="text-[16px] text-etyme-ink leading-relaxed">{t}</p>
          ))}
        </div>
        <Footer site={site} />
      </div>
    </div>
  )
}

/** The firm's contact, only what it set at setup, and nothing invented. */
function Contact({ site, contact }: { site: PublicSite; contact: NonNullable<PublicSite['contact']> }) {
  const tel = contact.phone ? telHref(contact.phone) : null
  return (
    <>
      <H2 look={site.look}>Contact {site.name}</H2>
      <dl className="mt-5 space-y-2 max-w-md text-[15px]">
        {contact.phone && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-etyme-muted">Phone</dt>
            <dd className="text-etyme-ink tabular-nums">
              {tel ? <a href={tel} className="hover:underline">{contact.phone}</a> : contact.phone}
            </dd>
          </div>
        )}
        {contact.accountsEmail && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-etyme-muted">Accounts</dt>
            <dd className="text-etyme-ink">
              <a href={`mailto:${contact.accountsEmail}`} className="hover:underline">{contact.accountsEmail}</a>
            </dd>
          </div>
        )}
        {contact.people.map((p) => (
          <div key={p.role} className="flex items-baseline justify-between gap-4">
            <dt className="text-etyme-muted">{p.role}</dt>
            <dd className="text-etyme-ink">{p.name}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function Credentials({ site }: { site: PublicSite }) {
  return (
    <>
      <H2 look={site.look}>{site.headings.credentials ?? 'What they hold'}</H2>
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
    </>
  )
}
