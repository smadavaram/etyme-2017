import { SiteFrame } from './frame'
import {
  PARTIES, REFERENCE, DOCS_HOME, partyAt, referenceAt,
  type PartyDoc, type ReferenceDoc,
} from './docs/index'

/**
 * The documentation pages: the home, ten party pages and two reference
 * pages, under one side menu.
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

function SideMenu({ current, own }: { current: string; own?: { href: string; label: string }[] }) {
  const link = (href: string, label: string, isCurrent: boolean) => (
    <a
      key={href}
      href={href}
      aria-current={isCurrent ? 'page' : undefined}
      className={
        'block rounded-md px-2.5 py-1.5 text-[13.5px] ' +
        (isCurrent
          ? 'bg-etyme-action-wash font-semibold text-etyme-action-press'
          : 'text-etyme-muted hover:bg-etyme-sunk hover:text-etyme-ink')
      }
    >
      {label}
    </a>
  )
  return (
    <nav aria-label="Documentation" className="min-w-0 border-b border-etyme-rule pb-4 lg:border-b-0 lg:pb-0">
      {own && own.length > 0 && (
        <>
          <p className="eyebrow px-2.5 pb-1.5">{'This page'}</p>
          {own.map((o) => link(o.href, o.label, false))}
        </>
      )}
      <p className="eyebrow px-2.5 pb-1.5 pt-4">{'The flows · from one desk'}</p>
      {PARTIES.map((p) => link(`/docs/${p.doc.slug}`, `${p.n} · ${p.doc.title}`, current === p.doc.slug))}
      <p className="eyebrow px-2.5 pb-1.5 pt-4">{'Reference'}</p>
      {REFERENCE.map((r) => link(`/docs/${r.slug}`, r.title, current === r.slug))}
      {link('/security', 'Security position', false)}
      {link('/dpa', 'Data processing addendum', false)}
      {link('/docs', 'Documentation home', current === '')}
    </nav>
  )
}

function Head({ eyebrow, title, lede }: { eyebrow: string; title: string; lede: string }) {
  return (
    <div className="pt-10 md:pt-14">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 max-w-[26ch] text-balance font-serif text-[32px] leading-[1.08] tracking-[-0.025em] text-etyme-ink md:text-[42px]">
        {title}
      </h1>
      <p className="mt-4 max-w-[64ch] text-[17px] leading-relaxed text-etyme-muted">{lede}</p>
    </div>
  )
}

function Layout({ current, own, children }: { current: string; own?: { href: string; label: string }[]; children: React.ReactNode }) {
  return (
    <div className="mt-10 grid gap-8 pb-16 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
      {/* On a phone the menu folds away, so the page starts where the reader expects it to. */}
      <details className="border-b border-etyme-rule pb-4 lg:hidden">
        <summary className="cursor-pointer text-[14px] font-medium text-etyme-muted">{'Pages in the documentation'}</summary>
        <div className="mt-3"><SideMenu current={current} own={own} /></div>
      </details>
      <div className="hidden lg:block"><SideMenu current={current} own={own} /></div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function DocsHomeView() {
  return (
    <SiteFrame>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Head eyebrow={DOCS_HOME.eyebrow} title={DOCS_HOME.title} lede={DOCS_HOME.lede} />
        <Layout current="">
          <h2 className="font-serif text-[27px] leading-tight tracking-[-0.02em] text-etyme-ink">{'What is inside'}</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {DOCS_HOME.inside.map((i) => (
              <li key={i.t} className="rounded-xl border border-etyme-rule bg-etyme-raised p-5">
                <a href={i.href} className="text-[15px] font-semibold text-etyme-ink hover:underline">{i.t}</a>
                <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">{i.d}</p>
              </li>
            ))}
          </ul>
          <h2 className="mt-12 font-serif text-[27px] leading-tight tracking-[-0.02em] text-etyme-ink">{'The flows, one party at a time'}</h2>
          <ul className="mt-5 divide-y divide-etyme-rule rounded-xl border border-etyme-rule bg-etyme-surface">
            {PARTIES.map((p) => (
              <li key={p.doc.slug} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-4">
                <a href={`/docs/${p.doc.slug}`} className="shrink-0 text-[14.5px] font-medium text-etyme-ink hover:underline sm:w-72">
                  {`${p.n} · ${p.doc.title}`}
                </a>
                <span className="text-[13.5px] text-etyme-muted">{p.doc.lede}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-[64ch] text-[15px] leading-relaxed text-etyme-muted">
            {DOCS_HOME.example}{' '}
            <a href="/demo" className="font-medium text-etyme-action hover:underline">{'Open the example program →'}</a>
          </p>
        </Layout>
      </div>
    </SiteFrame>
  )
}

export function PartyDocView({ doc }: { doc: PartyDoc }) {
  return (
    <SiteFrame>
      <style dangerouslySetInnerHTML={{ __html: DOCS_CSS }} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Head eyebrow={doc.eyebrow} title={doc.title} lede={doc.lede} />
        <Layout current={doc.slug} own={doc.thisParty}>
          <div className="etyme-docs" dangerouslySetInnerHTML={{ __html: doc.html }} />
        </Layout>
      </div>
    </SiteFrame>
  )
}

export function ReferenceDocView({ doc }: { doc: ReferenceDoc }) {
  return (
    <SiteFrame>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Head eyebrow={doc.eyebrow} title={doc.title} lede={doc.lede} />
        <Layout current={doc.slug}>
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

export function docMetadata(slug: string) {
  const p = partyAt(slug)
  if (p) return { title: `${p.title} — documentation`, description: p.lede }
  const r = referenceAt(slug)
  if (r) return { title: `${r.title} — documentation`, description: r.lede }
  return { title: 'Documentation' }
}
