import { notFound } from 'next/navigation'
import { learnTenant } from '@/lib/training/learn-read'
import { styleOf } from '@/lib/public-site/site-look'
import { VERSION } from '@/lib/training/courses/index'
import { VisitorNote } from '../_components/visitor-note'
import '../learn.css'

/**
 * The learning micro-site of one firm, in the firm's own saved branding.
 * Free and public. A firm whose plugin is off reads as no firm at all.
 */
export default async function LearnLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) notFound()
  const st = styleOf(t.look)
  const accent = st.accent ?? '#5228FF'
  return (
    <div className="learn-root" style={{ ...(st.page ?? {}), ['--learn-accent' as string]: accent }}>
      <header className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: '#E3DFD5' }}>
        {t.look.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.look.logoUrl} alt="" className="h-7 w-auto" />}
        <a href={`/learn/${t.slug}`} className="text-[17px] font-semibold" style={st.heading}>{t.name}</a>
        <a href={`/learn/${t.slug}/home`} className="ml-auto text-sm" style={{ color: accent }}>Your learning</a>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      <footer className="px-5 py-6 text-sm border-t" style={{ borderColor: '#E3DFD5', color: '#6B6862' }}>
        <span>Free to take.<VisitorNote tenant={t.slug} /></span>
        <span className="float-right tabular-nums">{VERSION}</span>
      </footer>
    </div>
  )
}
