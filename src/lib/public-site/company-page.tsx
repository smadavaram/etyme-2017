import { Ask } from '@/app/site/ask'
import { SiteFrame } from './frame'
import { COMPANY_PAGES, type CompanyPage } from './company'

/**
 * About, Contact and the security position share one shape: a title, a
 * lede, and blocks of short lines, a numbered list, a few sentences or a
 * list of short claims (one screen each since 2026-10-15). The
 * contact page adds the same "leave a sentence" form the home page uses,
 * so a message from either reaches the same person by the same rules
 * (`lib/public-site/leads`: no consent, no row; nothing bought).
 */

export function CompanyPageView({ p }: { p: CompanyPage }) {
  return (
    <SiteFrame>
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <div className="pt-10 md:pt-14">
          {p.eyebrow !== p.title && <p className="eyebrow">{p.eyebrow}</p>}
          <h1 className="mt-3 max-w-[24ch] text-balance font-serif text-[34px] leading-[1.06] tracking-[-0.025em] text-etyme-ink md:text-[42px]">
            {p.title}
          </h1>
          <p className="mt-4 max-w-[64ch] text-[17px] leading-relaxed text-etyme-muted">{p.lede}</p>
        </div>

        {p.blocks.map((b) => (
          <section key={b.id} id={b.id} className="mt-10">
            {b.title && <h2 className="font-serif text-[22px] leading-tight tracking-[-0.02em] text-etyme-ink">{b.title}</h2>}
            {b.lines && (
              <ul className="mt-4 max-w-[66ch] space-y-2.5">
                {b.lines.map((l) => (
                  <li key={l.t} className="flex items-baseline gap-3 text-[16px] leading-relaxed text-etyme-ink">
                    <span
                      aria-hidden="true"
                      className={'inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ' + (b.tone === 'no' ? 'bg-etyme-attention' : 'bg-etyme-verified')}
                    />
                    <span>
                      {l.lead && <b className="font-semibold">{`${l.lead} `}</b>}
                      {l.t}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {b.ordered && (
              <ol className="mt-4 max-w-[66ch] list-decimal space-y-1.5 pl-6 text-[16px] leading-relaxed text-etyme-ink marker:text-etyme-faint">
                {b.ordered.map((o) => <li key={o}>{o}</li>)}
              </ol>
            )}
            {b.paragraphs && (
              <div className="mt-4 max-w-[66ch] space-y-3">
                {b.paragraphs.map((t) => (
                  <p key={t} className="text-[16px] leading-relaxed text-etyme-ink">{t}</p>
                ))}
              </div>
            )}
            {b.items && (
              <ul className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-2">
                {b.items.map((i) => (
                  <li key={i.t}>
                    <p className="text-[15px] font-semibold text-etyme-ink">{i.t}</p>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-etyme-muted">{i.d}</p>
                  </li>
                ))}
              </ul>
            )}
            {b.note && <p className="mt-3 text-[14px] leading-relaxed text-etyme-muted">{b.note}</p>}
            {p.route === '/contact' && b.id === 'ask' && (
              <div className="mt-6 max-w-xl">
                <Ask source="HOME_PAGE" />
              </div>
            )}
          </section>
        ))}
      </div>
    </SiteFrame>
  )
}

/** What a route file needs: `const { Page, metadata } = companyPage('/about')`. */
export function companyPage(route: CompanyPage['route']) {
  const p = COMPANY_PAGES.find((x) => x.route === route)
  if (!p) throw new Error(`No company page is registered at ${route}`)
  return {
    // The layout's template adds "| Etyme", so "About Etyme" would read twice.
    metadata: { title: p.eyebrow.replace(/ Etyme$/, ''), description: p.lede },
    Page: function Page() {
      return <CompanyPageView p={p} />
    },
  }
}
