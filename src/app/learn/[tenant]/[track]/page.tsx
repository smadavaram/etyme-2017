import { notFound } from 'next/navigation'
import { trackOf, lessonsOf, VERSION } from '@/lib/training/courses/index'
import { OPENING_CARDS } from '@/lib/training/courses/opening'

/** A track's own page: what you will be good at, and the first lesson. */
export default async function TrackPage({ params }: { params: Promise<{ tenant: string; track: string }> }) {
  const { tenant, track } = await params
  const card = OPENING_CARDS.find((c) => c.track === track)
  if (!card) notFound()
  const t = trackOf(track)
  if (!t) {
    return (
      <section>
        <h1 className="text-2xl mb-2">{card.label}</h1>
        <p style={{ color: '#6B6862' }}>This track is being written. Come back soon.</p>
        <p className="mt-4"><a className="underline" href={`/learn/${tenant}`}>Back to the question</a></p>
      </section>
    )
  }
  const first = lessonsOf(t)[0]
  return (
    <section>
      <p className="text-sm tabular-nums" style={{ color: '#6B6862' }}>{VERSION}</p>
      <h1 className="text-3xl mt-1 mb-4" style={{ fontFamily: "'Iowan Old Style', Palatino, Georgia, serif" }}>{t.title}</h1>
      <h2 className="text-lg font-semibold mb-2">What you will be good at</h2>
      <ul className="list-disc pl-5 space-y-1 mb-6">{t.goodAt.map((g) => <li key={g}>{g}</li>)}</ul>
      {first && <a className="learn-run inline-block" href={`/learn/${tenant}/${t.key}/${first.lesson.key}`}>Start the first lesson</a>}
    </section>
  )
}
