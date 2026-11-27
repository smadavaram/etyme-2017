import type { Metadata, Viewport } from 'next'
import { SiteHeader } from '@/lib/public-site/frame'
import { SkeletonFooter } from '@/lib/public-site/skeleton'
import { homeSample } from '@/lib/public-site/home-sample'
import { HomeAsk, RoleLink } from '@/lib/public-site/home-ask'
import { DOOR_SOON,
  HOME_TITLE, HOME_BADGE, HOME_NAV, START_FREE, HERO, ROLES, ASK, GUARANTEE, FEATURES, DOORS, PRICE, START, SAMPLE_NOTE,
} from '@/lib/public-site/home-page-words'

/**
 * The front door, the owner-approved design of 2026-11-18
 * (`prototypes/homepage/approved-2026-11-18.html`), built in the repo's own
 * tokens and parts. It replaces the 2026-11-12 and 2026-11-13 briefs'
 * page: badge and the locked line in the hero, a role per card, Ask Etyme
 * with a CFO view behind a button, the three guarantees on ink, the chat
 * doors, price beside what Etyme does not do, and the start panel.
 *
 * Every word is a constant in `lib/public-site/home-page-words`; the
 * sample company's figures are the seed's (`lib/public-site/home-sample`).
 * Light only. The header is the shared one, with the kit logo at 26px; the
 * footer is the shared one (the 13 links and the © line), which also
 * carries the marketing pages' analytics. Every sign-up button opens
 * `/signup`.
 */
export const metadata: Metadata = { title: { absolute: HOME_TITLE } }
export const viewport: Viewport = { colorScheme: 'light' }

const SAMPLE = homeSample()

const GELASIO = { fontFamily: 'var(--font-gelasio), Georgia, serif' } as const
const WRAP = 'mx-auto max-w-6xl px-4 sm:px-6'
const H2 = 'text-[30px] font-semibold leading-[1.12] tracking-[-0.01em] sm:text-[40px]'
const KICKER = 'mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-etyme-action-press'
const PRIMARY = 'inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full bg-etyme-action px-6 py-3 text-[16px] font-semibold text-white shadow-[0_6px_20px_rgba(82,40,255,.22)] hover:opacity-90'
const SECONDARY = 'inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-etyme-rule px-6 py-3 text-[16px] font-semibold text-etyme-ink hover:border-etyme-ink'
const CARD = 'rounded-[18px] border border-etyme-rule bg-etyme-raised'

function Cta({ label, line, onInk = false }: { label: string; line: string; onInk?: boolean }) {
  return (
    <div className="mt-7 flex flex-wrap items-center gap-4">
      <a href={START_FREE.href} className={PRIMARY}>{label}</a>
      <p className={`text-[15px] ${onInk ? 'text-etyme-canvas/75' : 'text-etyme-muted'}`}>{line}</p>
    </div>
  )
}

const ROLE_ICONS = [
  <path key="a" d="M20 6 9 17l-5-5" />,
  <g key="b"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></g>,
  <g key="c"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></g>,
]
const DOOR_COLORS = ['bg-etyme-action', 'bg-etyme-verified', 'bg-etyme-ink']

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-etyme-canvas text-[17px] leading-[1.6] text-etyme-ink">
      <SiteHeader button={START_FREE} links={HOME_NAV} />

      <main id="top">
        {/* Hero */}
        <div className={WRAP}>
          <div className="pb-2 pt-10 text-left sm:pt-16 sm:text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-etyme-rule bg-etyme-raised px-3.5 py-1.5 text-[13.5px] font-semibold text-etyme-ink">
              <i aria-hidden="true" className="inline-block h-2 w-2 flex-none rounded-full bg-etyme-action" />{HOME_BADGE}
            </span>
            <h1 className="mx-auto mt-5 max-w-[880px] text-[40px] font-bold leading-[1.12] tracking-[-0.01em] sm:text-[clamp(40px,6.2vw,68px)]" style={GELASIO}>
              {HERO.line1} <em className="italic text-etyme-action-press">{HERO.line2}</em>
            </h1>
            <p className="mx-auto mt-5 max-w-[720px] text-[19px] leading-[1.65] text-etyme-ink/85">{HERO.sub}</p>
            <p className="mx-auto mt-4 max-w-[720px] rounded-xl border border-etyme-action/20 bg-etyme-action/10 px-[18px] py-3 text-left text-[16.5px] font-semibold sm:text-center">{HERO.offer}</p>
            <div className="mt-7 flex flex-wrap gap-3 sm:justify-center">
              <a href={START_FREE.href} className={`${PRIMARY} max-sm:flex-1`}>{START_FREE.t}</a>
              <a href="#desks" className={`${SECONDARY} max-sm:flex-1`}>{HERO.seeRole}</a>
            </div>
            <p className="mt-3.5 text-[14px] text-etyme-muted">{HERO.micro}</p>
            <div aria-label="What Etyme replaces" className={`mx-auto mt-11 grid max-w-[760px] overflow-hidden text-left sm:grid-cols-3 ${CARD}`}>
              {HERO.stats.map((s, i) => (
                <div key={s.b} className={`px-5 py-[18px] ${i > 0 ? 'border-t border-etyme-rule sm:border-l sm:border-t-0' : ''}`}>
                  <strong className="block text-[26px] font-semibold leading-[1.1]" style={GELASIO}>{s.b}</strong>
                  <span className="mt-1 block text-[13.5px] leading-[1.45] text-etyme-muted">{s.s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Roles */}
        <section id="desks" className="scroll-mt-20 py-11 sm:py-16">
          <div className={WRAP}>
            <div className="max-w-[720px]">
              <p className={KICKER}>{ROLES.kicker}</p>
              <h2 className={H2} style={GELASIO}>{ROLES.heading}</h2>
              <p className="mt-3.5 text-[17.5px] text-etyme-ink/85">{ROLES.lead}</p>
            </div>
            <div className="mt-8 grid gap-[18px] min-[860px]:grid-cols-3">
              {ROLES.cards.map((c, i) => (
                <article key={c.h} className={`flex flex-col px-6 py-[26px] ${CARD}`}>
                  <div className="mb-3.5 flex items-center gap-3">
                    <div aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-etyme-action/10 text-etyme-action-press">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ROLE_ICONS[i]}</svg>
                    </div>
                    <h3 className="text-[21px] font-semibold" style={GELASIO}>{c.h}</h3>
                  </div>
                  <p className="flex-1 text-[16px] text-etyme-ink/85">{c.p}</p>
                  <div><RoleLink label={ROLES.link} ask={c.ask} /></div>
                </article>
              ))}
            </div>
            <Cta label={ROLES.cta} line={ROLES.ctaLine} />
          </div>
        </section>

        {/* Ask Etyme */}
        <section id="ask" className="scroll-mt-20 pb-11 sm:pb-16">
          <div className={WRAP}>
            <div className="max-w-[720px]">
              <p className={KICKER}>{ASK.kicker}</p>
              <h2 className={H2} style={GELASIO}>{ASK.heading}</h2>
              <p className="mt-3.5 text-[17.5px] text-etyme-ink/85">{ASK.lead}</p>
            </div>
            <HomeAsk sample={SAMPLE} />
            <Cta label={ASK.cta} line={ASK.ctaLine} />
          </div>
        </section>

        {/* Guarantees, on the kit's ink */}
        <section className="pb-2">
          <div className={WRAP}>
            <div className="rounded-[20px] bg-etyme-ink px-[22px] py-8 text-etyme-canvas sm:rounded-[28px] sm:px-10 sm:py-12">
              <p className={`${KICKER} !text-etyme-canvas/75`}>{GUARANTEE.kicker}</p>
              <h2 className="max-w-[640px] text-[30px] font-semibold leading-[1.12] sm:text-[44px]" style={GELASIO}>{GUARANTEE.heading}</h2>
              <p className="mt-3.5 max-w-[620px] text-[17px] opacity-80">{GUARANTEE.sub}</p>
              <ol className="mt-9 grid">
                {GUARANTEE.items.map((t, i) => (
                  <li key={t} className={`grid gap-1.5 py-[22px] sm:grid-cols-[64px_1fr] sm:gap-[18px] ${i > 0 ? 'border-t border-etyme-canvas/25' : 'pt-1.5'}`}>
                    <span className="text-[30px] leading-[1.1] text-etyme-canvas/75" style={GELASIO}>{`0${i + 1}`}</span>
                    <p className="max-w-[680px] text-[18px] leading-[1.6]">{t}</p>
                  </li>
                ))}
              </ol>
              <Cta label={GUARANTEE.cta} line={GUARANTEE.ctaLine} onInk />
            </div>
          </div>
        </section>

        {/* What is in it */}
        <div className={`${WRAP} pt-11`}>
          <p className={`${CARD} px-[26px] py-6 text-[17px] leading-[1.7] text-etyme-ink/85`}>
            <strong className="font-semibold text-etyme-ink">{FEATURES.slice(0, 6)}</strong>{FEATURES.slice(6)}
          </p>
        </div>

        {/* Chat doors */}
        <section id="doors" className="scroll-mt-20 py-11 sm:py-16">
          <div className={WRAP}>
            <div className="max-w-[720px]">
              <p className={KICKER}>{DOORS.kicker}</p>
              <h2 className={H2} style={GELASIO}>{DOORS.heading}</h2>
            </div>
            <div className="mt-7 grid gap-[18px] min-[760px]:grid-cols-3">
              {DOORS.items.map((d, i) => (
                <div key={d.h} className={`flex items-center gap-3.5 p-[22px] ${CARD}`}>
                  <div aria-hidden="true" className={`flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl text-[15px] font-bold text-white ${DOOR_COLORS[i]}`}>{d.mark}</div>
                  <div className="min-w-0"><h3 className="text-[18px] font-bold">{d.h}{d.soon ? <span className="ml-2 align-middle rounded-full border border-etyme-rule px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-etyme-muted">{DOOR_SOON}</span> : null}</h3><p className="mt-0.5 text-[14.5px] text-etyme-muted">{d.p}</p></div>
                </div>
              ))}
            </div>
            <p className="mt-5 max-w-[720px] text-[16.5px] text-etyme-ink/85"><strong className="font-semibold text-etyme-ink">{DOORS.noteLead}</strong> {DOORS.note}</p>
            <Cta label={DOORS.cta} line={DOORS.ctaLine} />
          </div>
        </section>

        {/* Price, and what Etyme does not do yet */}
        <section id="price" className="scroll-mt-20 pb-11 sm:pb-16">
          <div className={`${WRAP} grid gap-[18px] min-[820px]:grid-cols-[1.25fr_1fr]`}>
            <div className="rounded-[18px] bg-etyme-action px-[30px] py-8 text-white">
              <p className={`${KICKER} !text-white/80`}>{PRICE.kicker}</p>
              <h2 className="mb-3.5 text-[34px] font-semibold leading-[1.12]" style={GELASIO}>{PRICE.heading}</h2>
              <p className="text-[17.5px] leading-[1.65]">{PRICE.body}</p>
              <a href={START_FREE.href} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 text-[16px] font-semibold text-etyme-action-press hover:opacity-90">{PRICE.button}</a>
              <a href={PRICE.rateCard.href} className="mt-4 block text-[15.5px] font-semibold text-white underline underline-offset-4 hover:opacity-90">{PRICE.rateCard.t}</a>
            </div>
            <div className={`px-[30px] py-7 ${CARD}`}>
              <h3 className="mb-3 text-[20px] font-semibold" style={GELASIO}>{PRICE.notHeading}</h3>
              <ul className="list-disc pl-5 text-[15.5px] text-etyme-ink/85 marker:text-etyme-action">
                {PRICE.not.map((n) => <li key={n.b} className="my-[7px]"><strong className="font-semibold text-etyme-ink">{n.b}</strong> {n.t}</li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* Start */}
        <section id="start" className="scroll-mt-20 pb-11">
          <div className={WRAP}>
            <div className="grid gap-9 rounded-[22px] border border-etyme-rule bg-etyme-raised px-[22px] py-[26px] min-[860px]:grid-cols-[1fr_1.15fr] sm:p-[34px]">
              <div>
                <p className={KICKER}>{START.kicker}</p>
                <h2 className="text-[28px] font-semibold leading-[1.12] sm:text-[38px]" style={GELASIO}>{START.heading}</h2>
                <p className="mt-3.5 text-[16.5px] text-etyme-ink/85">{START.lead}</p>
                <ul className="mt-5">
                  {START.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 py-[7px] text-[15.5px] text-etyme-ink/85"><b aria-hidden="true" className="flex-none text-etyme-action-press">✓</b><span>{p}</span></li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col justify-center rounded-xl border border-etyme-rule bg-etyme-surface p-6">
                <h3 className="text-[22px] font-semibold" style={GELASIO}>{START.panelHeading}</h3>
                <p className="mt-2 text-[15.5px] text-etyme-ink/85">{START.panelLine}</p>
                <a href={START_FREE.href} className={`${PRIMARY} mt-5 w-full`}>{START_FREE.t}</a>
                <p className="mt-5 text-[15.5px]">
                  {START.talkLead} <a href={`mailto:${START.address}`} className="inline-block py-2 font-semibold text-etyme-action-press underline underline-offset-4">{START.address}</a> {START.talkTail}
                </p>
              </div>
            </div>
            <p className="mt-6 text-[13px] leading-snug text-etyme-muted">{SAMPLE_NOTE}</p>
          </div>
        </section>
      </main>

      <SkeletonFooter />
    </div>
  )
}
