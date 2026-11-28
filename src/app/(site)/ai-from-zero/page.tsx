import type { Metadata } from 'next'
import Link from 'next/link'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { DOOR_WORDS, TILES } from '@/lib/public-site/course-door-page'
import { TileGlyph } from './icons'
import { DoorForm } from './door-form'
import s from './door.module.css'

export const metadata: Metadata = {
  title: 'AI from Zero in 3 Hours — free training',
  description: 'A free course that starts from zero. Tell us who you are and we write when it opens.',
}

// The page says whether mail can leave, so it is read when asked, not at build.
export const dynamic = 'force-dynamic'

export default function FreeTrainingDoor() {
  return (
    <div className={s.page}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap" />
      <header className={s.top}>
        <Link href="/" className={s.brand}>Etyme</Link>
      </header>
      <main>
        <section className={s.hero} id="top">
          <p className={s.eyebrow}>{DOOR_WORDS.eyebrow}</p>
          <h1 className={s.h1}>{DOOR_WORDS.headline}</h1>
          <p className={s.free}>{DOOR_WORDS.free}</p>
          <p className={s.promise}>{DOOR_WORDS.promise}</p>
          <p className={s.paused}>{DOOR_WORDS.paused}</p>
          <a href="#what-are-you" className={s.primary}>Get started</a>
        </section>

        <section aria-labelledby="learn-h" className={s.section}>
          <h2 id="learn-h" className={s.h2}>{DOOR_WORDS.gridHeading}</h2>
          <ul className={s.grid}>
            {TILES.map((t) => (
              <li key={t.key} className={s.tile}>
                <span className={s.icon}><TileGlyph name={t.key} /></span>
                <h3 className={s.tileName}>{t.name}</h3>
                {t.sub && <p className={s.tileSub}>{t.sub}</p>}
                <p className={s.tileGloss}>{t.gloss}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="what-are-you" className={s.section}>
          <DoorForm mailCanLeave={mailLeaves()} />
        </section>
      </main>
      <footer className={s.foot}>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/contact">Contact</Link>
      </footer>
    </div>
  )
}
