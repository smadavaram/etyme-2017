import { SiteFrame } from './frame'
import { MODULES, type ModulePage } from './modules'
import { STEPS, stepOf, demoNote, type Step } from './steps'
import { MORE_DEMO } from './more-demo'
import { PROCESS, processRoute } from './docs/process'
import { FlowChart, Lines } from './flow-chart'
import { PrevNext, type SeqLink } from './sequence'
import { DemoLink } from './demo-link'
import { ACTOR_CHIP, ACTOR_LABEL, type DemoTarget } from './flow'

/**
 * The eight product pages, on one spine of four steps.
 *
 * ── Decided 2026-09-30 ───────────────────────────────────────────────
 *
 * The four steps on the home page lead to four step pages, one to one:
 * /requisitions, /contracts, /timesheets and /invoices. A step page says
 * "Step n of 4", has Previous and Next at its top and its bottom, and
 * reads in the founder's order: what you do, the real screen, who is
 * involved, what happens next. It ends with "See this step in the demo",
 * which seats the reader at the right desk on the exact screen.
 *
 * The other four pages hang under a step as "More in this step" — the
 * rules under Source, submissions and tenure under Choose and start, the
 * chain under Bill and pay — and each opens and ends with the way back
 * to its step. No link on either kind lands in the middle of a page.
 *
 * Every word comes from `./modules` and `./steps`, so `lib/positioning`
 * reads the data rather than trying to scrape this file.
 */

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-etyme-rule py-10 md:py-12">
      <h2 className="font-serif text-[27px] leading-tight tracking-[-0.02em] text-etyme-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}

const BUTTON =
  'inline-block rounded-lg bg-etyme-action px-5 py-3 text-[14px] font-medium text-white transition-colors hover:bg-etyme-action-hover'

/** Where a step page's Previous and Next go: the home page before the first, the process after the last. */
function stepAround(step: Step): { prev: SeqLink; next: SeqLink } {
  const before = STEPS.find((s) => s.n === step.n - 1)
  const after = STEPS.find((s) => s.n === step.n + 1)
  return {
    prev: before ? { href: before.route, label: `Step ${before.n} · ${before.name}` } : { href: '/', label: 'Overview' },
    next: after
      ? { href: after.route, label: `Step ${after.n} · ${after.name}` }
      : { href: '/docs/process', label: 'The whole process' },
  }
}

function Screen({ m }: { m: ModulePage }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-etyme-rule bg-etyme-raised shadow-sm">
      <img src={m.screen.img} alt={m.screen.alt} width={1440} height={900} className="block h-auto w-full" />
      <figcaption className="border-t border-etyme-rule bg-etyme-surface px-4 py-3 text-[13px] leading-relaxed text-etyme-muted">
        {m.screen.caption}{' '}
        <span className="text-etyme-faint">{'From the example program, which you can open without an account.'}</span>
      </figcaption>
    </figure>
  )
}

function Capabilities({ m }: { m: ModulePage }) {
  return (
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
  )
}

function Complaint({ m }: { m: ModulePage }) {
  return (
    <Section id="complaint" title="The complaint">
      <div className="max-w-[64ch]">
        <p className="border-l-2 border-etyme-attention pl-4 font-serif text-[20px] leading-snug text-etyme-ink">
          {m.complaint.text}
        </p>
        <p className="mt-3 pl-4 text-[13px] text-etyme-faint">{`Whose problem: ${m.complaint.whose}`}</p>
        <p className="mt-5 text-[16px] leading-relaxed text-etyme-muted">{m.complaint.gloss}</p>
      </div>
    </Section>
  )
}

function Refuses({ m }: { m: ModulePage }) {
  return (
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
  )
}

/** A section carried over from the home page on 2026-09-27; see `More` in ./modules. */
function Carried({ m }: { m: ModulePage }) {
  if (!m.more) return null
  return (
    <Section id={m.more.id} title={m.more.title}>
      <Lines lines={m.more.paragraphs} />
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
  )
}

/** "See this step in the demo": the last thing on a step page, before Previous and Next. */
function DemoEnd({ target, label }: { target: DemoTarget; label: string }) {
  return (
    <section id="demo" className="scroll-mt-6 border-t border-etyme-rule py-10 md:py-12">
      <h2 className="font-serif text-[27px] leading-tight tracking-[-0.02em] text-etyme-ink">{label}</h2>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-etyme-muted">{demoNote(target.seat)}</p>
      <p className="mt-5">
        <DemoLink target={target} label={`${label} →`} className={BUTTON} />
      </p>
    </section>
  )
}

/**
 * "What Etyme does" was written as short paragraphs. On these pages it is
 * one idea per line (the founder, 2026-09-30: less prose), so each
 * sentence is drawn as a line of its own. Cut into lines, never cut.
 */
function oneIdeaPerLine(paragraphs: string[]): string[] {
  return paragraphs.flatMap((p) => p.split(/(?<=[.!?])\s+(?=[A-Z“])/).map((l) => l.trim()).filter(Boolean))
}

function Head({ eyebrow, title, lede }: { eyebrow: string; title: string; lede: string }) {
  return (
    <div className="pb-8 pt-8 md:pt-10">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 max-w-[22ch] text-balance font-serif text-[34px] leading-[1.06] tracking-[-0.025em] text-etyme-ink md:text-[46px]">
        {title}
      </h1>
      <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-etyme-muted md:text-[18px]">{lede}</p>
    </div>
  )
}

/** One of the four step pages. */
export function StepPageView({ m, step }: { m: ModulePage; step: Step }) {
  const { prev, next } = stepAround(step)
  const where = `Step ${step.n} of 4`
  const after = STEPS.find((s) => s.n === step.n + 1)
  const more = step.more.map((r) => MODULES.find((x) => x.route === r)!).filter(Boolean)
  const processPages = step.process.map((s) => PROCESS.find((p) => p.slug === s)!).filter(Boolean)

  return (
    <SiteFrame>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PrevNext prev={prev} next={next} where={where} position="top" />
        <Head eyebrow={`Product · ${step.name}`} title={m.title} lede={m.lede} />

        {/* ── What you do ── */}
        <Section id="does" title="What you do">
          <FlowChart label={`${step.name}, in ${step.flow.length} steps`} boxes={step.flow} />
          <div className="mt-8"><Lines lines={oneIdeaPerLine(m.does)} /></div>
        </Section>

        {/* ── The real screen ── */}
        <Section id="screen" title="The real screen">
          <Screen m={m} />
          <div className="mt-6"><Lines lines={m.looks} /></div>
          <p className="mt-4 font-mono text-[11.5px] text-etyme-faint">
            {`Screen: ${m.screen.from} · taken ${m.screen.capturedAt.slice(0, 10)}`}
          </p>
        </Section>

        {/* ── Who is involved ── */}
        <Section id="who" title="Who is involved">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {step.involved.map((i) => (
              <li key={i.who} className="rounded-xl border border-etyme-rule bg-etyme-raised p-4">
                <p className="flex items-center gap-2">
                  <span className={`chip ${ACTOR_CHIP[i.actor]}`}>{ACTOR_LABEL[i.actor]}</span>
                  <span className="text-[15px] font-semibold text-etyme-ink">{i.who}</span>
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-etyme-muted">{i.does}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Capabilities m={m} />
        <Refuses m={m} />
        <Complaint m={m} />

        {/* ── More in this step ── */}
        {more.length > 0 && (
          <Section id="more" title="More in this step">
            <ul className="grid gap-4 sm:grid-cols-2">
              {more.map((x) => (
                <li key={x.route}>
                  <a href={x.route} className="block h-full rounded-xl border border-etyme-rule bg-etyme-raised p-5 transition-shadow hover:shadow-lift">
                    <span className="block text-[16px] font-semibold text-etyme-ink">{`${x.title} →`}</span>
                    <span className="mt-2 block text-[14px] leading-relaxed text-etyme-muted">{x.lede}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── The process, in the documentation ── */}
        <Section id="flow" title="Read the flow">
          <ul className="space-y-2">
            {processPages.map((p) => (
              <li key={p.slug}>
                <a href={processRoute(p.slug)} className="text-[15px] font-medium text-etyme-action-press hover:underline">
                  {`${p.title}, in the documentation →`}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[14px] text-etyme-muted">
            {'Each page opens with a flow chart, and needs no account. Or '}
            <a href="/contact" className="text-etyme-action-press hover:underline">{'ask a person'}</a>
            {'.'}
          </p>
        </Section>

        {/* ── What happens next ── */}
        <Section id="next" title="What happens next">
          <p className="max-w-[62ch] text-[17px] leading-relaxed text-etyme-ink">{step.next}</p>
          <p className="mt-4">
            <a href={next.href} className="text-[15px] font-medium text-etyme-action-press hover:underline">
              {after ? `Step ${after.n} of 4 · ${after.name} →` : 'The whole process, stage by stage →'}
            </a>
          </p>
        </Section>

        <DemoEnd target={step.demo} label="See this step in the demo" />

        <PrevNext prev={prev} next={next} where={where} position="bottom" />
      </div>
    </SiteFrame>
  )
}

/** A product page that hangs under a step. */
export function MorePageView({ m, step }: { m: ModulePage; step: Step }) {
  const back: SeqLink = { href: step.route, label: `Step ${step.n} · ${step.name}` }
  const siblings = step.more.map((r) => MODULES.find((x) => x.route === r)!).filter(Boolean)
  const i = siblings.findIndex((x) => x.route === m.route)
  const prev: SeqLink = i > 0 ? { href: siblings[i - 1].route, label: siblings[i - 1].title } : back
  const next: SeqLink =
    i < siblings.length - 1
      ? { href: siblings[i + 1].route, label: siblings[i + 1].title }
      : STEPS.find((s) => s.n === step.n + 1)
        ? { href: STEPS.find((s) => s.n === step.n + 1)!.route, label: `Step ${step.n + 1} · ${STEPS.find((s) => s.n === step.n + 1)!.name}` }
        : { href: '/docs/process', label: 'The whole process' }
  const where = `More in step ${step.n} of 4`
  const demo = MORE_DEMO[m.route]

  return (
    <SiteFrame>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PrevNext prev={prev} next={next} where={where} position="top" />
        <p className="mt-4">
          <a href={back.href} data-back-to-step="top" className="text-[14px] font-medium text-etyme-action-press hover:underline">
            {`← Back to step ${step.n}: ${step.name}`}
          </a>
        </p>
        <Head eyebrow={`Product · ${step.name}`} title={m.title} lede={m.lede} />

        <div className="mt-2"><Screen m={m} /></div>

        <Section id="does" title="What Etyme does">
          <FlowChart
            label={`${m.title}, in ${m.stages.steps.length} steps`}
            boxes={m.stages.steps.map((t) => ({ t }))}
          />
          <p className="mt-3 text-[13.5px] text-etyme-muted">{m.stages.under}</p>
          <div className="mt-8"><Lines lines={oneIdeaPerLine(m.does)} /></div>
        </Section>

        <Capabilities m={m} />

        <Section id="looks" title="What it looks like">
          <Lines lines={m.looks} />
          <p className="mt-5 font-mono text-[11.5px] text-etyme-faint">
            {`Screen: ${m.screen.from} · taken ${m.screen.capturedAt.slice(0, 10)}`}
          </p>
        </Section>

        <Refuses m={m} />
        <Complaint m={m} />
        <Carried m={m} />

        <Section id="flow" title="Read the flow">
          <p>
            <a href={m.flow.href} className="text-[15px] font-medium text-etyme-action-press hover:underline">{`${m.flow.label} →`}</a>
          </p>
          <p className="mt-3 text-[14px] text-etyme-muted">
            {'It needs no account. Or '}
            <a href="/contact" className="text-etyme-action-press hover:underline">{'ask a person'}</a>
            {'.'}
          </p>
        </Section>

        {demo && <DemoEnd target={demo} label="See this in the demo" />}

        <p className="border-t border-etyme-rule pt-8">
          <a href={back.href} data-back-to-step="bottom" className="text-[15px] font-medium text-etyme-action-press hover:underline">
            {`← Back to step ${step.n}: ${step.name}`}
          </a>
        </p>
        <PrevNext prev={prev} next={next} where={where} position="bottom" />
      </div>
    </SiteFrame>
  )
}

export function ModulePageView({ m }: { m: ModulePage }) {
  const at = stepOf(m.route)
  if (!at) throw new Error(`${m.route} is on no step`)
  return at.isStep ? <StepPageView m={m} step={at.step} /> : <MorePageView m={m} step={at.step} />
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
