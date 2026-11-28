import { notFound } from 'next/navigation'
import { pluginSiteTenant } from '@/lib/plugin-site'

/**
 * The Project teams micro-site of one firm (records 133, 134). Signed-in
 * seats only: every screen asks the plugin's own routes, which keep the
 * seat's permissions. A firm whose plugin is off reads as no firm at all.
 */
export default async function PodsSiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const t = await pluginSiteTenant('PODS', tenant)
  if (!t) notFound()
  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink">
      <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-etyme-rule">
        <span className="font-serif text-[17px] font-semibold">{t.name}</span>
        <span className="text-sm text-etyme-muted">Project teams</span>
        <a href="/dashboard" className="ml-auto text-sm text-etyme-action underline">Back to your dashboard</a>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  )
}
