import type { Metadata } from 'next'
import { TryDemo } from '@/components/try-demo'
import { SiteHeader, SiteFooter } from './frame'
import { DemoLink } from './demo-link'
import { SCREEN, EDGE, BAND, H2, UNDER_HEADING } from './rhythm'
import { ASK_A_PERSON } from './funnel'
import {
  partyAt, otherDoors, growLabel, PRICE_NOTE, ON_SCREEN, ROWS_NOTE, ASK_LINE,
  type PartyPage, type PartySlug,
} from './parties'

/**
 * One party door, drawn from its words in `./parties`.
 *
 * The same header and footer as the home page, and not the frame's close
 * band: a door ends in its own three ways forward, sign up first, the
 * demo second, a person third, which is the template the founder
 * approved. The header's menu is untouched, so these pages are reached
 * by link and never from the home page. The footer carries a row linking
 * the other three doors.
 */

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'
const PRIMARY_BUTTON =
  `inline-block whitespace-nowrap rounded-lg bg-etyme-action px-6 py-3.5 text-center text-[15px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 ${FOCUS}`
const SECOND_BUTTON =
  `inline-block rounded-lg border border-etyme-rule bg-etyme-raised px-6 py-3.5 text-center text-[15px] font-semibold text-etyme-ink transition-colors hover:border-etyme-ink ${FOCUS}`
const PANEL = 'rounded-panel border border-etyme-rule bg-etyme-raised p-5'
const LABEL = 'text-[10.5px] font-semibold uppercase tracking-[0.08em] text-etyme-faint'

export function partyMetadata(slug: PartySlug): Metadata {
  const p = partyAt(slug)!
  return { title: `${p.eyebrow} | Etyme` }
}

function Demo({ p, label, className }: { p: PartyPage; label: string; className: string }) {
  if ('candidate' in p.demo) return <TryDemo side="CANDIDATE" label={label} className={className} />
  return <DemoLink target={p.demo.target} label={label} className={className} />
}

export function PartyPageView({ slug }: { slug: PartySlug }) {
  const p = partyAt(slug)!
  return (
    <div className="min-h-screen bg-etyme-canvas">
      <SiteHeader />
      <main>
        {/* ── Hero: who this is for, their day, the one screen ─────── */}
        <section id="top" className={`${EDGE} overflow-hidden`}>
          <div className={BAND}>
            <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-x-6">
              <div className="lg:col-span-6">
                <p className="eyebrow">{p.eyebrow}</p>
                <h1 className="mt-3 text-balance font-serif text-[34px] font-normal leading-[1.08] tracking-[-0.02em] text-etyme-ink md:text-[46px]">
                  {p.title}
                </h1>
                <p className="mt-5 max-w-[58ch] text-pretty text-[17px] leading-relaxed text-etyme-muted md:text-[18px]">{p.lede}</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a href={p.signUpHref} className={PRIMARY_BUTTON}>{p.signUpLabel}</a>
                  <Demo p={p} label={p.demoLabel} className={SECOND_BUTTON} />
                </div>
                <p className="mt-3 text-[13px] text-etyme-muted">{PRICE_NOTE}</p>
              </div>
              <div className="min-w-0 lg:col-span-6">
                <figure className="overflow-hidden rounded-r-lg border border-etyme-rule bg-etyme-raised shadow-lift">
                  <img
                    src={p.screen.img}
                    data-captured-at={p.screen.capturedAt}
                    alt={p.screen.alt}
                    width={1440}
                    height={900}
                    loading="eager"
                    className="block h-auto w-full border-b border-etyme-rule"
                  />
                  <figcaption className="space-y-0.5 px-4 py-3 text-[13px] leading-relaxed text-etyme-muted md:px-5">
                    <span className="block"><b className="font-semibold text-etyme-ink">{'One screen'}</b>{` · ${p.screen.caption}`}</span>
                    <span className="block">{ON_SCREEN}</span>
                  </figcaption>
                </figure>
              </div>
            </div>
          </div>
        </section>

        {/* ── What you get on day one: eight panels, all in the demo ── */}
        <section id="day-one" className={`${SCREEN} ${EDGE} bg-etyme-surface`}>
          <div className={BAND}>
            <p className="eyebrow mb-3">{'What you get on day one'}</p>
            <h2 className={H2}>{p.dayOne.heading}</h2>
            <ul className={`${UNDER_HEADING} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
              {p.dayOne.panels.map((x) => (
                <li key={x.label} className={PANEL}>
                  <p className={LABEL}>{x.label}</p>
                  <h3 className="mt-2 text-[16px] font-semibold leading-snug text-etyme-ink">{x.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-snug text-etyme-muted">{x.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── What stays yours: five rules, and who sees what ──────── */}
        <section id="yours" className={`${SCREEN} ${EDGE}`}>
          <div className={BAND}>
            <p className="eyebrow mb-3">{'What stays yours'}</p>
            <h2 className={H2}>{p.yours.heading}</h2>
            <div className={`${UNDER_HEADING} grid gap-8 lg:grid-cols-12`}>
              <ol className="space-y-5 lg:col-span-7">
                {p.yours.points.map((x, i) => (
                  <li key={x.t} className="flex gap-4">
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-etyme-rule bg-etyme-raised font-mono text-[12px] text-etyme-ink">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-[16px] font-semibold leading-snug text-etyme-ink">{x.t}</p>
                      <p className="mt-1 text-[15px] leading-snug text-etyme-muted">{x.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className={`${PANEL} lg:col-span-5`}>
                <p className={LABEL}>{p.yours.rowsLabel}</p>
                <table className="mt-2 w-full border-collapse text-left text-[14px] leading-snug">
                  <tbody>
                    {p.yours.rows.map(([a, b]) => (
                      <tr key={a} className="border-b border-etyme-rule/70 last:border-b-0">
                        <th scope="row" className="py-2 pr-3 align-top font-medium text-etyme-ink">{a}</th>
                        <td className="py-2 align-top text-etyme-muted">{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[13px] text-etyme-muted">{ROWS_NOTE}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── How you grow on it: built and being built, no date ───── */}
        <section id="grow" className={`${SCREEN} ${EDGE} bg-etyme-surface`}>
          <div className={BAND}>
            <p className="eyebrow mb-3">{'How you grow on it'}</p>
            <h2 className={H2}>{p.grow.heading}</h2>
            <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-etyme-muted">{p.grow.lede}</p>
            <ul className={`${UNDER_HEADING} grid gap-4 md:grid-cols-3`}>
              {p.grow.panels.map((x) => (
                <li key={x.label} className={PANEL}>
                  <p className={`${LABEL} ${x.built ? 'text-etyme-verified' : 'text-etyme-attention'}`}>{growLabel(x)}</p>
                  <p className="mt-2 text-[15px] leading-snug text-etyme-ink">{x.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── The close: sign up first, the demo second, a person third ── */}
        <section id="join" className={SCREEN}>
          <div className={BAND}>
            <h2 className={H2}>{p.close.heading}</h2>
            <div className={`${UNDER_HEADING} grid gap-4 md:grid-cols-3 md:items-stretch`}>
              <div className={`${PANEL} flex flex-col`}>
                <h3 className="text-[17px] font-semibold text-etyme-ink">{'Sign up now'}</h3>
                <p className="mt-2 flex-1 text-[14.5px] leading-snug text-etyme-muted">{p.close.signUp}</p>
                <div className="mt-4"><a href={p.signUpHref} className={PRIMARY_BUTTON}>{`${p.signUpLabel} →`}</a></div>
              </div>
              <div className={`${PANEL} flex flex-col`}>
                <h3 className="text-[17px] font-semibold text-etyme-ink">{p.close.demo.title}</h3>
                <p className="mt-2 flex-1 text-[14.5px] leading-snug text-etyme-muted">{p.close.demo.d}</p>
                <div className="mt-4"><Demo p={p} label="Open the demo →" className={SECOND_BUTTON} /></div>
              </div>
              <div className={`${PANEL} flex flex-col`}>
                <h3 className="text-[17px] font-semibold text-etyme-ink">{ASK_A_PERSON.t}</h3>
                <p className="mt-2 flex-1 text-[14.5px] leading-snug text-etyme-muted">{ASK_LINE}</p>
                <div className="mt-4"><a href={ASK_A_PERSON.href} className={SECOND_BUTTON}>{'Send a sentence'}</a></div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter doors={otherDoors(p)} />
    </div>
  )
}
