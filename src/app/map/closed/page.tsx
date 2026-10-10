import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { MAP_REFUSED, MAP_WHO } from '@/lib/map-gate'

/** Where /map sends somebody it does not open for (lib/map-gate). */
export const metadata = { title: 'The map · Etyme' }

export default function MapClosedPage() {
  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/"><EtymeLogo size="md" /></Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em]" style={{ textWrap: 'balance' }}>The map is closed to you</h1>
        <p className="mt-3 text-[15px] text-etyme-ink">{MAP_REFUSED}</p>
        <p className="mt-2 text-sm text-etyme-muted">{MAP_WHO}</p>
        <p className="mt-6 text-sm">
          <a href="/login?next=/map" className="text-etyme-action-press hover:underline">Sign in</a>
          <span className="text-etyme-faint"> · </span>
          <Link href="/ready" className="text-etyme-action-press hover:underline">What is ready</Link>
        </p>
      </main>
    </div>
  )
}
