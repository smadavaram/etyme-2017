import { OPENING_CARDS, OPENING_QUESTION, routeFor } from '@/lib/training/courses/opening'
import { VERSION } from '@/lib/training/courses/index'

/** The opening screen: one question, four large cards. The answer routes; there is no catalog. */
export default async function LearnOpening({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  return (
    <section>
      <p className="text-sm tabular-nums" style={{ color: '#6B6862' }}>{VERSION}</p>
      <h1 className="text-3xl mt-1 mb-6" style={{ fontFamily: "'Iowan Old Style', Palatino, Georgia, serif" }}>{OPENING_QUESTION}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {OPENING_CARDS.map((c) => (
          <a key={c.track} className="learn-card" href={routeFor(tenant, c.track)!}>
            <span className="block text-xl font-semibold">{c.label}</span>
            <span className="block mt-1.5" style={{ color: '#6B6862' }}>{c.line}</span>
          </a>
        ))}
      </div>
    </section>
  )
}
