import type { Metadata } from 'next'
import Link from 'next/link'
import { DOOR_WORDS, WHAT_ARE_YOU_HREF } from '@/lib/public-site/course-door-page'
import { LearnSection } from '@/lib/public-site/learn-section'
import { DoorForm } from './door-form'
import s from './door.module.css'

export const metadata: Metadata = {
  title: 'AI from Zero in 3 Hours. Free. | Etyme',
  description: 'A free course that starts from zero. Tell us who you are and we write when it opens.',
}

export default function FreeTrainingDoor() {
  return (
    <div className={s.page}>
      <header className={s.top}>
        <Link href="/" className={s.brand}>Etyme</Link>
      </header>
      <main>
        <div className={s.hero}>
          <LearnSection headingLevel="h1" cta={{ label: 'Choose what you are', href: WHAT_ARE_YOU_HREF }} />
          <p className={s.paused}>{DOOR_WORDS.paused}</p>
        </div>
        <section id="what-are-you" className={s.section}>
          <DoorForm />
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
