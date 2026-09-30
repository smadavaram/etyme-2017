import { SiteFrame } from './frame'
import {
  PARTIES, REFERENCE, DOCS_HOME, PROCESS_HOME, partyAt, referenceAt,
  type PartyDoc, type ReferenceDoc,
} from './docs/index'
import { PROCESS, processAt, partiesFor, processRoute, sectionOf, sectionsOf } from './docs/process'
import { TOPICS, GROUP_TITLE, GROUP_LEDE, topicAt, topicsIn, topicRoute } from './docs/topics'
import { FlowChart, Lines } from './flow-chart'
import { PrevNext, Contents, type ContentsItem, type SeqLink } from './sequence'
import { DemoLink } from './demo-link'
import { STEPS, demoNote } from './steps'
import { MODULES } from './modules'
import type { DemoTarget } from './flow'

/**
 * The documentation pages, under one side menu: the home; the process,
 * one page per stage (read as any party); master data and recruiting;
 * ten party pages; and two reference pages. Since 2026-09-30 no link here
 * lands in the middle of another page, and every page in a sequence has
 * Previous and Next at its top and its bottom (`./sequence`).
 *
 * The party pages carry their body as HTML converted from the static
 * site, styled by the kit's own rules for `.ch-sec`, `.fig` and the
 * stations tables. Those rules are scoped under `.etyme-docs` and sent
 * inline with the page rather than added to `globals.css`, which is
 * shared, so nothing here can restyle a dashboard table.
 */

const DOCS_CSS = `
.etyme-docs{color:var(--ink,#1F1E1D)}
.etyme-docs a{color:#4421D6;text-decoration:none}
.etyme-docs a:hover{text-decoration:underline}
.etyme-docs .ch-sec{margin-top:56px}
.etyme-docs .ch-sec:first-child{margin-top:0}
.etyme-docs .ch-sec h2{font-family:'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;font-size:27px;line-height:1.15;letter-spacing:-.02em;font-weight:400;max-width:26ch}
.etyme-docs h3{font-family:'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;font-size:19px;line-height:1.25;font-weight:400;letter-spacing:-.01em}
.etyme-docs .ch-sec>p{margin-top:14px;font-size:15.5px;line-height:1.68;max-width:70ch}
.etyme-docs .ch-sec>p.eyebrow{font-size:10px;line-height:1.4;margin-top:22px}
.etyme-docs .ch-sec>p.note{font-size:13.5px;color:#6B6862}
.etyme-docs .ch-sec>h3.sub{margin-top:30px}
.etyme-docs .ch-sec>ul.lines{margin-top:12px;max-width:70ch;padding-left:1.15em;list-style:disc;font-size:15.5px;line-height:1.6}
.etyme-docs .ch-sec>ul.lines li{margin-top:6px}
.etyme-docs .ch-sec>ul.lines li::marker{color:#9C9891}
.etyme-docs .ch-sec>ul.legend{font-size:14px;color:#6B6862}
.etyme-docs .fig{margin:24px 0 0;border:1px solid #E3DFD5;border-radius:12px;overflow:hidden;background:#fff}
.etyme-docs .fig img{display:block;width:100%;height:auto}
.etyme-docs .fig figcaption{padding:11px 16px;border-top:1px solid #E3DFD5;background:#FBFAF7;font-size:13px;line-height:1.55;color:#6B6862}
.etyme-docs .fig figcaption b{font-family:'IBM Plex Mono',ui-monospace,monospace;font-weight:500;color:#1F1E1D;margin-right:6px}
.etyme-docs .scrollx{overflow-x:auto;margin-top:12px;border:1px solid #E3DFD5;border-radius:12px;background:#FBFAF7}
.etyme-docs table{width:100%;border-collapse:collapse;font-size:13.5px}
.etyme-docs thead th{text-align:left;font-size:9.5px;font-weight:600;line-height:1.4;letter-spacing:.12em;text-transform:uppercase;color:#9C9891;padding:12px 10px;border-bottom:1px solid #E3DFD5}
.etyme-docs tbody td{padding:11px 10px;border-bottom:1px solid #E3DFD5;vertical-align:top;line-height:1.5}
.etyme-docs tbody tr:last-child td{border-bottom:0}
.etyme-docs .num{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-size:12.5px}
.etyme-docs .chip.ip{margin-left:6px;vertical-align:middle}
.etyme-docs .chip{white-space:nowrap}
`

/** Where each process page and topic page sits against the four steps. */
function stepLink(step: number | null): SeqLink | null {
  const s = STEPS.find((x) => x.n === step)
  return s ? { href: s.route, label: `Step ${s.n} of 4 · ${s.name}` } : null
}

/**
 * The documentation, read front to back: the process overview, each
 * stage, then master data, then recruiting. Previous and Next walk this
 * list, so the last stage of the process leads to master data rather than
 * to nothing.
 */
export function docsSequence(): ContentsItem[] {
  return [
    { href: '/docs/process', label: 'The process, in one picture', note: 'Overview', unnumbered: true },
    ...PROCESS.map((p) => ({ href: processRoute(p.slug), label: p.title, note: p.when })),
    ...TOPICS.map((t) => ({ href: topicRoute(t), label: t.title, note: GROUP_TITLE[t.group] })),
  ]
}

/** The same walk, read as one party: its own view of each stage it draws. */
function partySequence(party: string): ContentsItem[] {
  return [
    { href: '/docs/process', label: 'The process, in one picture', note: 'Overview', unnumbered: true },
    ...PROCESS.map((p) => {
      const has = partiesFor(p).some((d) => d.slug === party)
      return { href: has ? processRoute(p.slug, party) : processRoute(p.slug), label: p.title, note: p.when }
    }),
  ]
}

/** The page before and after `href` in a sequence. */
function around(seq: ContentsItem[], href: string): { prev: SeqLink | null; next: SeqLink | null } {
  const i = seq.findIndex((x) => x.href === href)
  const home = { href: '/docs', label: 'Documentation home' }
  return {
    prev: i > 0 ? seq[i - 1] : home,
    next: i >= 0 && i < seq.length - 1 ? seq[i + 1] : home,
  }
}

function SideMenu({ current }: { current: string }) {
  const link = (href: string, label: string) => (
    <a
      key={href}
      href={href}
      aria-current={current === href ? 'page' : undefined}
      className={
        'block rounded-md px-2.5 py-1.5 text-[13.5px] ' +
        (current === href
          ? 'bg-etyme-action-wash font-semibold text-etyme-action-press'
          : 'text-etyme-muted hover:bg-etyme-sunk hover:text-etyme-ink')
      }
    >
      {label}
    </a>
  )
  return (
    <nav aria-label="Documentation" className="min-w-0 border-b border-etyme-rule pb-4 lg:border-b-0 lg:pb-0">
      <p className="eyebrow px-2.5 pb-1.5">{'The process'}</p>
      {link('/docs/process', 'Overview')}
      {PROCESS.map((p) => link(processRoute(p.slug), p.title))}
      {(['master-data', 'recruiting'] as const).map((g) => (
        <div key={g}>
          <p className="eyebrow px-2.5 pb-1.5 pt-4">{GROUP_TITLE[g]}</p>
          {topicsIn(g).map((t) => link(topicRoute(t), t.title))}
        </div>
      ))}
      <p className="eyebrow px-2.5 pb-1.5 pt-4">{'Read it as'}</p>
      {PARTIES.map((p) => link(`/docs/${p.doc.slug}`, `${p.n} · ${p.doc.title}`))}
      <p className="eyebrow px-2.5 pb-1.5 pt-4">{'Reference'}</p>
      {REFERENCE.map((r) => link(`/docs/${r.slug}`, r.title))}
      {link('/security', 'Security position')}
      {link('/dpa', 'Data processing addendum')}
      {link('/docs', 'Documentation home')}
    </nav>
  )
}

function Head({ eyebrow, title, lede }: { eyebrow: string; title: string; lede: string }) {
  return (
    <div className="pt-6 md:pt-8">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 max-w-[26ch] text-balance font-serif text-[32px] leading-[1.08] tracking-[-0.025em] text-etyme-ink md:text-[42px]">
        {title}
      </h1>
      <p className="mt-4 max-w-[64ch] text-[17px] leading-relaxed text-etyme-muted">{lede}</p>
    </div>
  )
}

function Layout({ current, children }: { current: string; children: React.ReactNode }) {
  return (
    <div className="mt-10 grid gap-8 pb-16 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
      {/* On a phone the menu folds away, so the page starts where the reader expects it to. */}
      <details className="border-b border-etyme-rule pb-4 lg:hidden">
        <summary className="cursor-pointer text-[14px] font-medium text-etyme-muted">{'Pages in the documentation'}</summary>
        <div className="mt-3"><SideMenu current={current} /></div>
      </details>
      <div className="hidden lg:block"><SideMenu current={current} /></div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 font-serif text-[25px] leading-tight tracking-[-0.02em] text-etyme-ink">{children}</h2>
}

/** "See this in the demo", at the end of a page, as the right desk. */
function DemoEnd({ target, what }: { target: DemoTarget; what: string }) {
  return (
    <section className="mt-12 rounded-xl border border-etyme-rule bg-etyme-raised p-5">
      <h2 className="font-serif text-[22px] leading-tight tracking-[-0.02em] text-etyme-ink">{`See ${what} in the demo`}</h2>
      <p className="mt-2 max-w-[60ch] text-[14.5px] leading-relaxed text-etyme-muted">{demoNote(target.seat)}</p>
      <p className="mt-4">
        <DemoLink
          target={target}
          label={`See ${what} in the demo →`}
          className="inline-block rounded-lg bg-etyme-action px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-etyme-action-hover"
        />
      </p>
    </section>
  )
}

/** The first mural, as the documentation home draws it. */
export const DOCS_MURAL = {
  src: '/mural/docs-band-night.svg',
  alt: 'A line drawing on a dark ground: a grid of dots for many records, a line rising to a row of steps, three small cards, and one table with a row for each piece of work, beside two people and a rising bar chart.',
}

export function DocsHomeView() {
  return (
    <SiteFrame>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="pt-4 md:pt-6" />
        <Head eyebrow={DOCS_HOME.eyebrow} title={DOCS_HOME.title} lede={DOCS_HOME.lede} />
      </div>
      {/* The first mural, under the heading, on the ink. The founder,
          2026-09-30: "We have 2 murals. Home page is the second one and
          use the first mural we built in documentation." It is the band
          crop of the two-ink mural system, in its night colorway —
          canvas line work on a dark ground — from
          design/mural/svg/etyme-mural-master-band-night.svg on the mural
          branch. Its ground was the mural system's navy (#0D1426); it is
          recolored to the brand's ink so it is the same "black" as the
          home page's dark band. It carries no text and no wordmark.
          Full width; on a phone it keeps a fixed height and is cropped to
          its middle, the way the home page's mural is, so it never
          shrinks to a sliver. The home page keeps its own mural. */}
      <div id="docs-mural" className="mt-8 w-full overflow-hidden bg-etyme-ink md:mt-10">
        <img
          src={DOCS_MURAL.src}
          alt={DOCS_MURAL.alt}
          width={2400}
          height={800}
          className="block h-[160px] w-full object-cover object-center sm:h-auto"
        />
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Layout current="/docs">
          <FlowChart
            label="The four steps and the end of the work, in order"
            boxes={[
              ...STEPS.map((s) => ({ who: s.flow[0].who, t: `${s.name}: ${s.home.toLowerCase()}` })),
              { who: 'RULES' as const, t: 'Post to your books, and the work ends' },
            ]}
          />
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {DOCS_HOME.parts.map((i) => (
              <li key={i.t} className="rounded-xl border border-etyme-rule bg-etyme-raised p-5">
                <a href={i.href} className="font-serif text-[21px] leading-tight text-etyme-ink hover:underline">{i.t}</a>
                <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">{i.d}</p>
              </li>
            ))}
          </ul>

          <H2>{'The process'}</H2>
          <div className="mt-5"><Contents title="Every stage, in order" items={docsSequence().slice(0, PROCESS.length + 1)} current="" /></div>

          {(['master-data', 'recruiting'] as const).map((g) => (
            <div key={g}>
              <H2>{GROUP_TITLE[g]}</H2>
              <p className="mt-2 max-w-[64ch] text-[15px] leading-relaxed text-etyme-muted">{GROUP_LEDE[g]}</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                {topicsIn(g).map((t) => (
                  <li key={t.slug}>
                    <a href={topicRoute(t)} className="block rounded-xl border border-etyme-rule bg-etyme-raised p-4 hover:shadow-lift">
                      <span className="block text-[15px] font-semibold text-etyme-ink">{t.title}</span>
                      <span className="mt-1 block text-[13.5px] leading-snug text-etyme-muted">{t.lede}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <H2>{'Read it as one party'}</H2>
          <p className="mt-2 max-w-[64ch] text-[15px] leading-relaxed text-etyme-muted">{DOCS_HOME.readAs}</p>
          <ul className="mt-4 divide-y divide-etyme-rule rounded-xl border border-etyme-rule bg-etyme-surface">
            {PARTIES.map((p) => (
              <li key={p.doc.slug} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-4">
                <a href={`/docs/${p.doc.slug}`} className="shrink-0 text-[14.5px] font-medium text-etyme-ink hover:underline sm:w-72">
                  {`${p.n} · ${p.doc.title}`}
                </a>
                <span className="text-[13.5px] text-etyme-muted">{p.doc.lede}</span>
              </li>
            ))}
          </ul>

          <H2>{'Reference'}</H2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {DOCS_HOME.reference.map((i) => (
              <li key={i.t} className="rounded-xl border border-etyme-rule bg-etyme-raised p-4">
                <a href={i.href} className="text-[15px] font-semibold text-etyme-ink hover:underline">{i.t}</a>
                <p className="mt-1 text-[13.5px] leading-snug text-etyme-muted">{i.d}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-[64ch] text-[15px] leading-relaxed text-etyme-muted">
            {DOCS_HOME.example}{' '}
            <a href="/demo" className="font-medium text-etyme-action-press hover:underline">{'Open the example program →'}</a>
          </p>
        </Layout>
      </div>
    </SiteFrame>
  )
}

/** The process overview: the whole flow, its contents, and the client's three drawings of one hire. */
export function ProcessHomeView() {
  const here = '/docs/process'
  const { prev, next } = around(docsSequence(), here)
  const client = partyAt('client')!
  const oneHire = sectionOf(client, 'one-hire')
  return (
    <SiteFrame>
      <style dangerouslySetInnerHTML={{ __html: DOCS_CSS }} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PrevNext prev={prev} next={next} where="The process · overview" position="top" />
        <Head eyebrow={PROCESS_HOME.eyebrow} title={PROCESS_HOME.title} lede={PROCESS_HOME.lede} />
        <Layout current={here}>
          <FlowChart
            label="The process, in order"
            boxes={[
              { who: 'CLIENT', t: 'Source: a job request goes to cleared suppliers' },
              { who: 'CLIENT', t: 'Award, and the papers before day one' },
              { who: 'WORKER', t: 'The week is filed and signed' },
              { who: 'SUPPLIER', t: 'Bill, check and pay' },
              { who: 'BOOKS', t: 'Post to your books' },
              { who: 'RULES', t: 'The work ends; time on site stays' },
            ]}
          />
          <div className="mt-8"><Contents title="Every stage, in order" items={docsSequence().slice(0, PROCESS.length + 1)} current={here} /></div>
          {oneHire && (
            <>
              <H2>{PROCESS_HOME.onePicture}</H2>
              <div className="etyme-docs mt-2" dangerouslySetInnerHTML={{ __html: withoutFirstHeading(oneHire) }} />
            </>
          )}
          <PrevNext prev={prev} next={next} where="The process · overview" position="bottom" />
        </Layout>
      </div>
    </SiteFrame>
  )
}

/** A section's own h2 repeats the page's heading; the page says it once. */
function withoutFirstHeading(html: string): string {
  return html.replace(/<h2>[^<]*<\/h2>/, '')
}

/** One stage of the process, read as one party (the client's view where no party is chosen). */
export function ProcessPageView({ slug, party }: { slug: string; party?: string }) {
  const p = processAt(slug)!
  const views = partiesFor(p)
  const shown = party ? views.find((d) => d.slug === party) ?? null : views[0] ?? null
  const here = processRoute(p.slug, party)
  const seq = party ? partySequence(party) : docsSequence()
  const { prev, next } = around(seq, here)
  const n = PROCESS.findIndex((x) => x.slug === p.slug) + 1
  const where = `The process · ${n} of ${PROCESS.length} · ${p.when}`
  const step = stepLink(p.step)
  const drawn = shown && p.section ? sectionOf(shown, p.section) : null

  return (
    <SiteFrame>
      <style dangerouslySetInnerHTML={{ __html: DOCS_CSS }} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PrevNext prev={prev} next={next} where={where} position="top" />
        <Head
          eyebrow={`Documentation · The process${shown && party ? ` · read as ${shown.title}` : ''}`}
          title={p.title}
          lede={p.lede}
        />
        <Layout current={processRoute(p.slug)}>
          <FlowChart label={`${p.title}, in ${p.flow.length} steps`} boxes={p.flow} />
          <div className="mt-8"><Lines lines={p.lines} /></div>
          {step && (
            <p className="mt-6 text-[14.5px] text-etyme-muted">
              {'On the product pages: '}
              <a href={step.href} className="font-medium text-etyme-action-press hover:underline">{`${step.label} →`}</a>
            </p>
          )}

          <div className="mt-10"><Contents title="The whole process" items={seq.slice(0, PROCESS.length + 1)} current={here} /></div>

          {views.length > 0 && drawn && (
            <>
              <H2>{`The drawing and its stations, read as ${shown!.title}`}</H2>
              <nav aria-label="Read it as" className="mt-4 flex flex-wrap gap-2">
                <span className="self-center text-[13px] text-etyme-muted">{'Read it as:'}</span>
                {views.map((d) => {
                  const on = d.slug === shown!.slug
                  return (
                    <a
                      key={d.slug}
                      href={processRoute(p.slug, d.slug)}
                      aria-current={on ? 'page' : undefined}
                      className={
                        'rounded-md border px-2.5 py-1 text-[12.5px] font-medium ' +
                        (on
                          ? 'border-etyme-action-press bg-etyme-action-wash text-etyme-action-press'
                          : 'border-etyme-rule bg-etyme-raised text-etyme-ink hover:border-etyme-action-press')
                      }
                    >
                      {d.title}
                    </a>
                  )
                })}
              </nav>
              <div className="etyme-docs mt-6" dangerouslySetInnerHTML={{ __html: withoutFirstHeading(drawn) }} />
            </>
          )}

          {p.demo && <DemoEnd target={p.demo} what="this stage" />}
          <PrevNext prev={prev} next={next} where={where} position="bottom" />
        </Layout>
      </div>
    </SiteFrame>
  )
}

/** A master data or recruiting page. */
export function TopicPageView({ group, slug }: { group: string; slug: string }) {
  const t = topicAt(group, slug)!
  const here = topicRoute(t)
  const { prev, next } = around(docsSequence(), here)
  const siblings = topicsIn(t.group)
  const where = `${GROUP_TITLE[t.group]} · ${siblings.indexOf(t) + 1} of ${siblings.length}`
  const product = t.product ? MODULES.find((m) => m.route === t.product) : undefined
  return (
    <SiteFrame>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PrevNext prev={prev} next={next} where={where} position="top" />
        <Head eyebrow={`Documentation · ${GROUP_TITLE[t.group]}`} title={t.title} lede={t.lede} />
        <Layout current={here}>
          <FlowChart label={`${t.title}, in ${t.flow.length} steps`} boxes={t.flow} />
          <div className="mt-8"><Lines lines={t.lines} /></div>
          <div className="mt-10">
            <Contents
              title={GROUP_TITLE[t.group]}
              items={siblings.map((s) => ({ href: topicRoute(s), label: s.title }))}
              current={here}
            />
          </div>
          <H2>{'Read it as one party'}</H2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {t.parties.map((s) => {
              const d = partyAt(s)
              return d ? (
                <li key={s}>
                  <a href={`/docs/${s}`} className="inline-block rounded-md border border-etyme-rule bg-etyme-raised px-2.5 py-1 text-[13px] font-medium text-etyme-ink hover:border-etyme-action-press">
                    {d.title}
                  </a>
                </li>
              ) : null
            })}
          </ul>
          {product && (
            <p className="mt-6 text-[14.5px] text-etyme-muted">
              {'On the product pages: '}
              <a href={product.route} className="font-medium text-etyme-action-press hover:underline">{`${product.title} →`}</a>
            </p>
          )}
          {t.demo && <DemoEnd target={t.demo} what="this" />}
          <PrevNext prev={prev} next={next} where={where} position="bottom" />
        </Layout>
      </div>
    </SiteFrame>
  )
}

/** A party page: where the party stands on a deal, then its stages, each a page of its own. */
export function PartyDocView({ doc }: { doc: PartyDoc }) {
  const opening = sectionsOf(doc).find((s) => s.id === null)?.html ?? ''
  return (
    <SiteFrame>
      <style dangerouslySetInnerHTML={{ __html: DOCS_CSS }} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="pt-4 md:pt-6" />
        <Head eyebrow={doc.eyebrow} title={doc.title} lede={doc.lede} />
        <Layout current={`/docs/${doc.slug}`}>
          <div className="etyme-docs" dangerouslySetInnerHTML={{ __html: opening }} />
          <H2>{'The process, from this desk'}</H2>
          <div className="mt-5">
            <Contents
              title={`Every stage, read as ${doc.title}`}
              items={doc.thisParty.map((l) => ({ href: l.href, label: l.label.replace(/^L[\d.]+( → L[\d.]+)? · /, '') }))}
              current=""
            />
          </div>
        </Layout>
      </div>
    </SiteFrame>
  )
}

export function ReferenceDocView({ doc }: { doc: ReferenceDoc }) {
  return (
    <SiteFrame>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="pt-4 md:pt-6" />
        <Head eyebrow={doc.eyebrow} title={doc.title} lede={doc.lede} />
        <Layout current={`/docs/${doc.slug}`}>
          {doc.screen && (
            <figure className="mb-10 overflow-hidden rounded-xl border border-etyme-rule bg-etyme-raised">
              <img src={doc.screen.img} alt={doc.screen.alt} width={1440} height={900} className="block h-auto w-full" />
              <figcaption className="border-t border-etyme-rule bg-etyme-surface px-4 py-3 text-[13px] leading-relaxed text-etyme-muted">
                {doc.screen.caption}
              </figcaption>
            </figure>
          )}
          {doc.blocks.map((b) => (
            <section key={b.id} id={b.id} className="mb-12 scroll-mt-6">
              <h2 className="font-serif text-[27px] leading-tight tracking-[-0.02em] text-etyme-ink">{b.title}</h2>
              {b.paragraphs?.map((t) => (
                <p key={t} className="mt-4 max-w-[68ch] text-[15.5px] leading-relaxed text-etyme-ink">{t}</p>
              ))}
              {b.items && (
                <ul className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  {b.items.map((i) => (
                    <li key={i.t}>
                      <p className="text-[15px] font-semibold text-etyme-ink">{i.t}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-etyme-muted">{i.d}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </Layout>
      </div>
    </SiteFrame>
  )
}

/** The page at /docs/[slug], or null where there is none. */
export function DocsSlugView({ slug }: { slug: string }) {
  const p = partyAt(slug)
  if (p) return <PartyDocView doc={p} />
  const r = referenceAt(slug)
  if (r) return <ReferenceDocView doc={r} />
  return null
}

/**
 * A tab's title and a search result's line. The layout's template adds
 * "| Etyme", so no title here says Etyme itself.
 */
export function docsHomeMetadata() {
  return { title: 'Documentation', description: DOCS_HOME.lede }
}

export function processMetadata(slug?: string, party?: string) {
  if (!slug) return { title: 'The process — documentation', description: PROCESS_HOME.lede }
  const p = processAt(slug)
  if (!p) return { title: 'Documentation' }
  const as = party ? partyAt(party) : null
  return { title: `${p.title}${as ? `, read as ${as.title}` : ''} — documentation`, description: p.lede }
}

export function topicMetadata(group: string, slug: string) {
  const t = topicAt(group, slug)
  return t ? { title: `${t.title} — documentation`, description: t.lede } : { title: 'Documentation' }
}

export function docMetadata(slug: string) {
  const p = partyAt(slug)
  if (p) return { title: `${p.title} — documentation`, description: p.lede }
  const r = referenceAt(slug)
  if (r) return { title: `${r.title} — documentation`, description: r.lede }
  return { title: 'Documentation' }
}
