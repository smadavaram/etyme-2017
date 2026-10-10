import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import { buildModel } from '@/lib/system-map'
import { ownedFilesOnDisk, readSentences, testFilesOnDisk } from '@/lib/map-disk'
import { allProcesses } from '@/lib/matrix'
import { MapView } from './map-view'
import { MAP_WHO } from '@/lib/map-gate'

/**
 * The map of the memory.
 *
 * One picture of how the system hangs together, asked for by the founder
 * on 2026-10-08 so he sees the system instead of reading reports. Drawn
 * from lib/domains and lib/matrix, with the sentences each proving test
 * file holds read off the file itself.
 *
 * It says what is built, by whom and how it is proven, never a value from
 * anybody's data, and it reads no database. It is not public: the
 * middleware stands in front of it (lib/map-gate), and the footer says who
 * may see it.
 *
 * Built once, with the deployment. A deployment carries no test files, so
 * reading them on a request would find none; the page is rendered while
 * the build still has them, and a deploy is exactly when the matrix and
 * the tests can change.
 */
export const dynamic = 'force-static'

export const metadata = { title: 'The map · Etyme' }

export default function MapPage() {
  const tests = [...new Set(allProcesses().flatMap((r) => r.l3.testedBy ?? []))]
  const model = buildModel({
    sentences: readSentences(tests),
    filesOwned: ownedFilesOnDisk(),
    testFiles: testFilesOnDisk(),
  })

  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/"><EtymeLogo size="md" /></Link>
        <div className="flex gap-4 text-sm text-etyme-muted">
          <Link href="/ready" className="hover:text-etyme-ink">Ready</Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 pb-24">
        <p className="eyebrow">How it hangs together</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
          The map
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-etyme-muted">
          The agents are in the middle. Around them, the groups of work each one owns, then every process,
          colored by where it stands. At the edge, the test files that prove each process. Click anything.
        </p>
        <MapView model={model} />
      </main>
      <footer className="mx-auto max-w-7xl px-6 pb-12 text-xs text-etyme-muted">{MAP_WHO}</footer>
    </div>
  )
}
