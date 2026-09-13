import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { assess, type Edge } from '@/lib/readiness'
import { gatherFacts } from '@/lib/readiness-facts'

/**
 * Is Etyme ready?
 *
 * One page the founder can open on a phone that answers the question he
 * kept asking and nothing could: "it is still not production ready" —
 * ready for whom, missing what, and what do I do about it. Each row is
 * an edge with the outside world; each red or amber row ends with the
 * one thing that turns it green.
 *
 * Public, because it reveals only that a thing is configured or has
 * happened, never a value. Never cached, because the point is now.
 */
export const dynamic = 'force-dynamic'

const DOT: Record<Edge['state'], string> = {
  PROVEN: 'bg-etyme-verified',
  SET: 'bg-etyme-attention',
  MISSING: 'bg-[#B3261E]',
  OFF: 'bg-etyme-rule',
}

const WORD: Record<Edge['state'], string> = {
  PROVEN: 'Proven',
  SET: 'Set up, never used',
  MISSING: 'Missing',
  OFF: 'Off',
}

export default async function ReadyPage() {
  const verdict = assess(await gatherFacts())
  const required = verdict.edges.filter((e) => e.required)
  const optional = verdict.edges.filter((e) => !e.required)

  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/"><EtymeLogo size="md" /></Link>
        <a href="/api/ready" className="text-sm text-etyme-muted hover:text-etyme-ink">As JSON</a>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24">
        <p className="eyebrow">Production</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
          {verdict.ready ? 'Ready.' : 'Not ready yet.'}
        </h1>
        <div className="mt-6 flex items-baseline gap-3">
          <span className="font-serif text-6xl tabular-nums text-etyme-ink">{verdict.proven}</span>
          <span className="text-etyme-muted">of {verdict.required} edges proven by the outside world</span>
        </div>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-etyme-muted">
          {verdict.says} Tests prove the inside. Each row below is proven only when a real tenant,
          a real file, a real inbox or a real channel has used it on this deployment once.
        </p>

        <section className="mt-10 divide-y divide-etyme-rule rounded-lg border border-etyme-rule bg-etyme-surface">
          {required.map((e) => <Row key={e.key} edge={e} />)}
        </section>

        <p className="eyebrow mt-12">Not counted</p>
        <section className="mt-3 divide-y divide-etyme-rule rounded-lg border border-etyme-rule bg-etyme-surface">
          {optional.map((e) => <Row key={e.key} edge={e} />)}
        </section>

        <p className="mt-8 text-xs text-etyme-faint tabular-nums">
          Read at {new Date(verdict.at).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC.
          The machine itself is on <a href="/api/health" className="underline">/api/health</a>.
        </p>
      </main>
    </div>
  )
}

function Row({ edge }: { edge: Edge }) {
  return (
    <div className="flex gap-4 p-4">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[edge.state]}`} aria-hidden="true" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="font-serif text-lg text-etyme-ink">{edge.name}</h2>
          <span className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint">{WORD[edge.state]}</span>
        </div>
        <p className="mt-1 text-sm text-etyme-ink">{edge.says}</p>
        {edge.fix && <p className="mt-1 text-sm text-etyme-muted">{edge.fix}</p>}
      </div>
    </div>
  )
}
