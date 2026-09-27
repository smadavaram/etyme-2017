import { SiteFrame } from './frame'
import { MODULES, type ModulePage } from './modules'

/**
 * One module page: the real screen first, then the six sections.
 *
 * The order is the argument. A reader sees the product before a sentence
 * about it (screens before sentences, decided after a real buyer read the
 * home page), then what it does, then the problem it answers, then what
 * it refuses — the section that says this is software with rules rather
 * than a pitch.
 *
 * Every word comes from `./modules`, so `lib/positioning` reads the data
 * rather than trying to scrape this file.
 */

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-etyme-rule py-12 md:py-14">
      <h2 className="font-serif text-[27px] leading-tight tracking-[-0.02em] text-etyme-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function ModulePageView({ m }: { m: ModulePage }) {
  const prev = MODULES.find((x) => x.n === m.n - 1)
  const next = MODULES.find((x) => x.n === m.n + 1)

  return (
    <SiteFrame>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── The top: the category, the station, and the screen ── */}
        <div className="pt-10 md:pt-14">
          <p className="eyebrow">{`Product · ${m.n} of ${MODULES.length}`}</p>
          <h1 className="mt-3 max-w-[22ch] text-balance font-serif text-[34px] leading-[1.06] tracking-[-0.025em] text-etyme-ink md:text-[46px]">
            {m.title}
          </h1>
          <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-etyme-muted md:text-[18px]">{m.lede}</p>
        </div>

        <figure className="mt-8 overflow-hidden rounded-xl border border-etyme-rule bg-etyme-raised shadow-sm">
          <img
            src={m.screen.img}
            alt={m.screen.alt}
            width={1440}
            height={900}
            className="block h-auto w-full"
          />
          <figcaption className="border-t border-etyme-rule bg-etyme-surface px-4 py-3 text-[13px] leading-relaxed text-etyme-muted">
            {m.screen.caption}{' '}
            <span className="text-etyme-faint">{'From the example program, which you can open without an account.'}</span>
          </figcaption>
        </figure>

        {/* ── Key capabilities ── */}
        <Section id="capabilities" title="Key capabilities">
          <ul className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {m.capabilities.map((c) => (
              <li key={c.t}>
                <p className="text-[15px] font-semibold text-etyme-ink">{c.t}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-etyme-muted">{c.d}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── The complaint ── */}
        <Section id="complaint" title="The complaint">
          <div className="max-w-[64ch]">
            <p className="border-l-2 border-etyme-attention pl-4 font-serif text-[20px] leading-snug text-etyme-ink">
              {m.complaint.text}
            </p>
            <p className="mt-3 pl-4 text-[13px] text-etyme-faint">{`Whose problem: ${m.complaint.whose}`}</p>
            <p className="mt-5 text-[16px] leading-relaxed text-etyme-muted">{m.complaint.gloss}</p>
          </div>
        </Section>

        {/* ── What Etyme does ── */}
        <Section id="does" title="What Etyme does">
          <div className="max-w-[66ch] space-y-4">
            {m.does.map((p) => (
              <p key={p} className="text-[16px] leading-relaxed text-etyme-ink">{p}</p>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            {m.stages.steps.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span className="rounded-md border border-etyme-rule bg-etyme-raised px-3 py-1.5 text-[13px] font-medium text-etyme-ink">
                  {s}
                </span>
                {i < m.stages.steps.length - 1 && <span aria-hidden className="text-etyme-faint">{'→'}</span>}
              </span>
            ))}
            <span className="text-[13px] text-etyme-muted">{`— ${m.stages.under}`}</span>
          </div>
        </Section>

        {/* ── What it looks like ── */}
        <Section id="looks" title="What it looks like">
          <ul className="max-w-[66ch] list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-etyme-ink">
            {m.looks.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="mt-5 font-mono text-[11.5px] text-etyme-faint">
            {`Screen: ${m.screen.from} · taken ${m.screen.capturedAt.slice(0, 10)}`}
          </p>
          <a
            href="/demo"
            className="mt-5 inline-block rounded-lg bg-etyme-action px-4 py-2 text-[14px] font-medium text-white
                       transition-colors hover:bg-etyme-action-hover"
          >
            {'Open the example program'}
          </a>
        </Section>

        {/* ── What it refuses ── */}
        <Section id="refuses" title="What it refuses">
          <ul className="grid gap-4 md:grid-cols-2">
            {m.refuses.map((r) => (
              <li key={r.says} className="rounded-xl border border-etyme-rule bg-etyme-raised p-5">
                <span className={r.kind === 'BLOCK' ? 'chip chip--danger' : 'chip chip--attention'}>
                  {r.kind === 'BLOCK' ? 'Stops' : r.kind === 'WARN' ? 'Warns' : 'Goes to a desk'}
                </span>
                <p className="mt-3 font-mono text-[13.5px] leading-relaxed text-etyme-ink">{r.says}</p>
                <p className="mt-3 text-[14px] leading-relaxed text-etyme-muted">{r.then}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-[66ch] text-[15px] leading-relaxed text-etyme-muted">{m.refusesNote}</p>
        </Section>

        {/* ── Carried over from the home page, 2026-09-27 ── */}
        {/* The home page became a product page and its long middle moved
            to the station each section belongs to. See `More` in
            ./modules. The anchor is the section's own, so the home page
            and its footer link straight to it. */}
        {m.more && (
          <Section id={m.more.id} title={m.more.title}>
            <div className="max-w-[66ch] space-y-4">
              {m.more.paragraphs.map((p) => (
                <p key={p} className="text-[16px] leading-relaxed text-etyme-ink">{p}</p>
              ))}
            </div>
            {m.more.items && (
              <ul className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {m.more.items.map((i) => (
                  <li key={i.t} className="border-t border-etyme-rule pt-4">
                    <p className="text-[15px] font-semibold text-etyme-ink">{i.t}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-etyme-muted">{i.d}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* ── Read the flow ── */}
        <Section id="flow" title="Read the flow">
          <p className="max-w-[62ch] text-[16px] leading-relaxed text-etyme-muted">
            {'Every step of this flow is drawn in the documentation, including the ones not built yet. It is public, and it needs no account.'}
          </p>
          <p className="mt-4">
            <a href={m.flow.href} className="text-[15px] font-medium text-etyme-action hover:underline">
              {`${m.flow.label} →`}
            </a>
          </p>
          <p className="mt-3 text-[14px] text-etyme-muted">
            {'Or ask a person about it: '}
            <a href="/contact" className="text-etyme-action hover:underline">{'a sentence and an email reach somebody'}</a>
            {'.'}
          </p>
        </Section>

        <nav className="flex flex-wrap justify-between gap-4 border-t border-etyme-rule py-8 text-[14px]">
          {prev ? (
            <a href={prev.route} className="text-etyme-muted hover:text-etyme-ink">{`← ${prev.title}`}</a>
          ) : (
            <a href="/" className="text-etyme-muted hover:text-etyme-ink">{'← Overview'}</a>
          )}
          {next ? (
            <a href={next.route} className="text-etyme-muted hover:text-etyme-ink">{`${next.title} →`}</a>
          ) : (
            <a href="/docs" className="text-etyme-muted hover:text-etyme-ink">{'Documentation →'}</a>
          )}
        </nav>
      </div>
    </SiteFrame>
  )
}

/**
 * What a route file under `app/(site)` needs, so each one is three lines:
 *
 *     import { modulePage } from '@/lib/public-site/module-page'
 *     const { Page, metadata } = modulePage('/requisitions')
 *     export { metadata }
 *     export default Page
 */
export function modulePage(route: string) {
  const m = MODULES.find((x) => x.route === route)
  if (!m) throw new Error(`No module page is registered at ${route}`)
  return {
    metadata: { title: m.title, description: m.lede },
    Page: function Page() {
      return <ModulePageView m={m} />
    },
  }
}
