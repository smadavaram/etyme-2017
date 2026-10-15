import { SiteFrame } from './frame'
import {
  DOCS_HOME, WHO_DOES_WHAT, referenceAt, type ReferenceDoc,
} from './docs/index'
import {
  STEP_PAGES, stepPageAt, stepRoute, stepEyebrow, stepLabel, STEP_HEADINGS, REFUSAL_KIND, type StepPage,
} from './docs/process'
import { TOPICS, GROUP_TITLE, topicAt, topicsIn, topicRoute, type TopicPage } from './docs/topics'
import { FlowChart, Lines } from './flow-chart'
import { PrevNext, type SeqLink } from './sequence'
import { DemoLink } from './demo-link'
import { demoNote } from './steps'
import type { DemoTarget } from './flow'

/**
 * The documentation pages, one screen each. Decided by the founder,
 * 2026-10-15 ("Build it", on the drawing that cut every public page to
 * one screen).
 *
 * One column, no side menu. Until that day every page printed the whole
 * contents twice — a side menu, its copy folded for a phone, and a
 * contents box at the bottom — around nine hundred words of its own. Now
 * the contents are said once on a page: the home is the contents, and
 * every other page carries one short strip of its own part (the five
 * steps, your records, recruiting, or more) with "you are here", above
 * Previous and Next at the bottom. Previous and Next stay at the top and
 * the bottom of every page, and no link here lands in the middle of
 * another page.
 */

// ── The order a reader walks ──────────────────────────────────────────

const HOME: SeqLink = { href: '/docs', label: DOCS_HOME.title }

const MORE: SeqLink[] = [
  { href: '/docs/who-does-what', label: WHO_DOES_WHAT.title },
  { href: '/docs/time-and-money', label: 'Time and money' },
  { href: '/docs/integrations', label: 'Integrations' },
]

/** Every page of the documentation after its home, front to back: the steps, your records, recruiting, then more. */
export function docsSequence(): SeqLink[] {
  return [
    ...STEP_PAGES.map((p) => ({ href: stepRoute(p), label: stepLabel(p) })),
    ...TOPICS.map((t) => ({ href: topicRoute(t), label: t.title })),
    ...MORE,
  ]
}

/** The page before and after `href`. The home is before the first and after the last. */
function around(href: string): { prev: SeqLink; next: SeqLink } {
  const seq = docsSequence()
  const i = seq.findIndex((x) => x.href === href)
  return {
    prev: i > 0 ? seq[i - 1] : HOME,
    next: i >= 0 && i < seq.length - 1 ? seq[i + 1] : HOME,
  }
}

// ── The pieces every page shares ──────────────────────────────────────

function Page({ here, eyebrow, title, lede, children }: {
  here: string; eyebrow?: string; title: string; lede: string; children: React.ReactNode
}) {
  const { prev, next } = around(here)
  return (
    <SiteFrame>
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <PrevNext prev={prev} next={next} position="top" />
        <div className="pt-8">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="mt-2 text-balance font-serif text-[34px] leading-[1.08] tracking-[-0.025em] text-etyme-ink md:text-[42px]">
            {title}
          </h1>
          <p className="mt-3 max-w-[60ch] text-[17px] leading-relaxed text-etyme-muted">{lede}</p>
        </div>
        {children}
        <Strip here={here} />
        <PrevNext prev={prev} next={next} position="bottom" />
      </div>
    </SiteFrame>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 font-serif text-[22px] leading-tight tracking-[-0.02em] text-etyme-ink">{children}</h2>
}

/**
 * The contents of the part this page is in, once, with "you are here":
 * the five steps on a step page, the three records on a record page, and
 * so on.
 */
function Strip({ here }: { here: string }) {
  const parts: { title: string; links: SeqLink[] }[] = [
    { title: 'The steps', links: STEP_PAGES.map((p) => ({ href: stepRoute(p), label: p.title })) },
    ...(['master-data', 'recruiting'] as const).map((g) => ({
      title: GROUP_TITLE[g], links: topicsIn(g).map((t) => ({ href: topicRoute(t), label: t.title })),
    })),
    { title: 'More', links: MORE },
  ]
  const part = parts.find((p) => p.links.some((l) => l.href === here))
  if (!part) return null
  return (
    <nav aria-label={part.title} data-contents="" className="mt-12 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
      <span className="eyebrow">{part.title}</span>
      {part.links.map((l) =>
        l.href === here ? (
          <a key={l.href} href={l.href} aria-current="page" className="font-semibold text-etyme-ink">{l.label}</a>
        ) : (
          <a key={l.href} href={l.href} className="text-etyme-action-press hover:underline">{l.label}</a>
        )
      )}
    </nav>
  )
}

/** "See this step in the demo", at the end of a page, seated as the right person. */
function DemoEnd({ target, what }: { target: DemoTarget; what: string }) {
  return (
    <div className="mt-10">
      <DemoLink
        target={target}
        label={`See ${what} in the demo`}
        className="inline-block rounded-lg bg-etyme-action px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-etyme-action-hover"
      />
      <p className="mt-2 text-[13.5px] leading-relaxed text-etyme-muted">{demoNote(target.seat)}</p>
    </div>
  )
}

// ── The home ──────────────────────────────────────────────────────────

export function DocsHomeView() {
  return (
    <SiteFrame>
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6 md:pt-14">
        <h1 className="text-balance font-serif text-[34px] leading-[1.08] tracking-[-0.025em] text-etyme-ink md:text-[42px]">
          {DOCS_HOME.title}
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-etyme-muted">{DOCS_HOME.lede}</p>
        {DOCS_HOME.groups.map((g) => (
          <section key={g.heading}>
            <H2>{g.heading}</H2>
            {g.links.some((l) => l.k) ? (
              <ol className="mt-3 divide-y divide-etyme-rule rounded-xl border border-etyme-rule bg-etyme-raised">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="flex gap-4 px-4 py-3 hover:bg-etyme-sunk">
                      <span className="w-14 shrink-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-etyme-faint">{l.k}</span>
                      <span className="text-[15px] text-etyme-ink">
                        <b className="font-semibold">{l.t}</b>
                        <span className="text-etyme-muted">{` · ${l.d}`}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 rounded-xl border border-etyme-rule bg-etyme-raised px-4 py-3 text-[15px]">
                {g.links.map((l, i) => (
                  <span key={l.href}>
                    {i > 0 && <span aria-hidden="true" className="text-etyme-faint">{' · '}</span>}
                    <a href={l.href} className="font-semibold text-etyme-ink hover:underline">{l.t}</a>
                  </span>
                ))}
              </p>
            )}
          </section>
        ))}
      </div>
    </SiteFrame>
  )
}

// ── A step page ───────────────────────────────────────────────────────

export function StepPageView({ slug }: { slug: string }) {
  const p = stepPageAt(slug) as StepPage
  return (
    <Page here={stepRoute(p)} eyebrow={stepEyebrow(p)} title={p.title} lede={p.lede}>
      <H2>{STEP_HEADINGS.flow}</H2>
      <div className="mt-4"><FlowChart label={`${p.title}: who does what, in ${p.flow.length} boxes`} boxes={p.flow} /></div>
      <H2>{STEP_HEADINGS.rules}</H2>
      <div className="mt-3"><Lines lines={p.rules} /></div>
      {p.more && (
        <>
          <H2>{p.more.title}</H2>
          <div className="mt-3"><Lines lines={p.more.lines} /></div>
        </>
      )}
      <H2>{STEP_HEADINGS.cost}</H2>
      <div className="mt-3"><Lines lines={p.cost} /></div>
      <H2>{STEP_HEADINGS.stops}</H2>
      <ul className="mt-3 space-y-3">
        {p.stops.map((r) => (
          <li key={r.says} className="flex items-baseline gap-3">
            <span className={`chip shrink-0 ${r.kind === 'BLOCK' ? 'chip--danger' : 'chip--attention'}`}>{REFUSAL_KIND[r.kind]}</span>
            <span className="text-[15px] leading-relaxed text-etyme-ink">
              {`“${r.says}”`}
              {r.then && <span className="text-etyme-muted">{` ${r.then}`}</span>}
            </span>
          </li>
        ))}
      </ul>
      <DemoEnd target={p.demo} what="this step" />
    </Page>
  )
}

// ── Your records and recruiting ───────────────────────────────────────

export function TopicPageView({ group, slug }: { group: string; slug: string }) {
  const t = topicAt(group, slug) as TopicPage
  return (
    <Page here={topicRoute(t)} eyebrow={GROUP_TITLE[t.group]} title={t.title} lede={t.lede}>
      <div className="mt-8"><Lines lines={t.lines} /></div>
      {t.demo && <DemoEnd target={t.demo} what="this" />}
    </Page>
  )
}

// ── Who does what, time and money, integrations ───────────────────────

function Table({ columns, rows }: { columns: readonly string[]; rows: string[][] }) {
  return (
    <div className="mt-8 overflow-x-auto rounded-xl border border-etyme-rule bg-etyme-raised">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className="border-b border-etyme-rule px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-etyme-faint">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.join('|')} className="border-b border-etyme-rule last:border-b-0">
              {r.map((cell, i) => (
                <td key={i} className={'px-3 py-2.5 align-top leading-snug ' + (i === 0 ? 'font-semibold text-etyme-ink' : 'text-etyme-ink')}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function WhoDoesWhatView() {
  const w = WHO_DOES_WHAT
  return (
    <Page here={`/docs/${w.slug}`} title={w.title} lede={w.lede}>
      <Table columns={w.columns} rows={w.rows.map((r) => [r.who, r.buysFrom, r.sellsTo, r.sees])} />
      <p className="mt-3 text-[14px] leading-relaxed text-etyme-muted">{w.closing}</p>
    </Page>
  )
}

export function ReferenceDocView({ doc }: { doc: ReferenceDoc }) {
  return (
    <Page here={`/docs/${doc.slug}`} title={doc.title} lede={doc.lede}>
      <div className="mt-8"><Lines lines={doc.lines} /></div>
      {doc.table && <Table columns={doc.table.columns} rows={doc.table.rows} />}
    </Page>
  )
}

/** The page at /docs/[slug], or null where there is none. */
export function DocsSlugView({ slug }: { slug: string }) {
  if (stepPageAt(slug)) return <StepPageView slug={slug} />
  if (slug === WHO_DOES_WHAT.slug) return <WhoDoesWhatView />
  const r = referenceAt(slug)
  if (r) return <ReferenceDocView doc={r} />
  return null
}

// ── A tab's title and a search result's line ──────────────────────────
// The layout's template adds "| Etyme", so no title here says Etyme itself.

export function docsHomeMetadata() {
  return { title: 'Documentation', description: DOCS_HOME.lede }
}

export function topicMetadata(group: string, slug: string) {
  const t = topicAt(group, slug)
  return t ? { title: `${t.title} — documentation`, description: t.lede } : { title: 'Documentation' }
}

export function docMetadata(slug: string) {
  const s = stepPageAt(slug)
  if (s) return { title: `${s.title} — documentation`, description: s.lede }
  if (slug === WHO_DOES_WHAT.slug) return { title: `${WHO_DOES_WHAT.title} — documentation`, description: WHO_DOES_WHAT.lede }
  const r = referenceAt(slug)
  if (r) return { title: `${r.title} — documentation`, description: r.lede }
  return { title: 'Documentation' }
}
