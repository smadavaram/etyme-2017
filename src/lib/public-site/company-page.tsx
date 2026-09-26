import { Ask } from '@/app/site/ask'
import { SiteFrame } from './frame'
import { COMPANY_PAGES, type CompanyPage } from './company'

/**
 * About, Contact and the security position share one shape: a title, a
 * lede, and blocks that are either prose or a list of short claims. The
 * contact page adds the same "leave a sentence" form the home page uses,
 * so a message from either reaches the same person by the same rules
 * (`lib/public-site/leads`: no consent, no row; nothing bought).
 */

export function CompanyPageView({ p }: { p: CompanyPage }) {
  return (
    <SiteFrame>
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="pt-10 md:pt-14">
          <p className="eyebrow">{p.eyebrow}</p>
          <h1 className="mt-3 max-w-[24ch] text-balance font-serif text-[34px] leading-[1.06] tracking-[-0.025em] text-etyme-ink md:text-[46px]">
            {p.title}
          </h1>
          <p className="mt-5 max-w-[64ch] text-[17px] leading-relaxed text-etyme-muted md:text-[18px]">{p.lede}</p>
        </div>

        {p.blocks.map((b) => (
          <section key={b.id} id={b.id} className="scroll-mt-6 border-t border-etyme-rule py-10 md:py-12 mt-10 first-of-type:mt-10">
            <h2 className="font-serif text-[27px] leading-tight tracking-[-0.02em] text-etyme-ink">{b.title}</h2>
            {b.paragraphs && (
              <div className="mt-5 max-w-[66ch] space-y-3">
                {b.paragraphs.map((t) => (
                  <p key={t} className="text-[16px] leading-relaxed text-etyme-ink">{t}</p>
                ))}
              </div>
            )}
            {b.items && (
              <ul className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
                {b.items.map((i) => (
                  <li key={i.t}>
                    <p className="text-[15px] font-semibold text-etyme-ink">{i.t}</p>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-etyme-muted">{i.d}</p>
                  </li>
                ))}
              </ul>
            )}
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
    metadata: { title: `${p.eyebrow} — Etyme`, description: p.lede },
    Page: function Page() {
      return <CompanyPageView p={p} />
    },
  }
}
