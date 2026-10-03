import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'
import type { Denied } from '@/lib/denied'

/**
 * What somebody the app cannot seat reads.
 *
 * One sentence, and nothing behind it. No sidebar, because a menu of
 * somebody else's workspace is what made the old denied screen read as
 * an empty dashboard rather than a refusal. No stats, because a zero is
 * an answer and the app has not got one. No action the route would
 * refuse — `lib/denied` decides which doors are genuinely open.
 *
 * Warm canvas and a serif headline: this is a decision surface, three
 * items at the outside, prose and calm. It is the last screen somebody
 * sees before they give up, so it reads like a person wrote it.
 */
export function DeniedScreen({ denied }: { denied: Denied }) {
  const primary = denied.doors.find((d) => d.primary)
  const rest = denied.doors.filter((d) => !d.primary)

  return (
    <div className="min-h-screen bg-etyme-canvas flex flex-col">
      {/* The mark, and nothing else in the header. Enough to say which
          product refused them; not a shell they cannot use. */}
      <div className="px-6 py-5 border-b border-etyme-rule">
        <Link href="/" className="inline-block">
          <EtymeLogo size="md" />
        </Link>
      </div>

      <main className="flex-1 flex items-start justify-center px-6 py-16 sm:py-24">
        <div className="max-w-xl w-full">
          <p className="text-[10px] uppercase tracking-[0.14em] text-etyme-faint mb-3">
            Not open to you
          </p>
          <h1
            className="font-serif text-etyme-ink text-3xl sm:text-4xl mb-5"
            style={{ letterSpacing: '-0.02em', textWrap: 'balance' }}
          >
            {denied.heading}
          </h1>
          <p className="text-etyme-muted leading-relaxed text-[15px]">{denied.says}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {primary && (
              <Link
                href={primary.href as any}
                className="inline-flex items-center rounded-md bg-etyme-action px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                {primary.label}
              </Link>
            )}
            {rest.map((d) => (
              <Link
                key={d.href}
                href={d.href as any}
                className="inline-flex items-center rounded-md border border-etyme-rule bg-etyme-surface px-4 py-2 text-sm text-etyme-ink hover:bg-etyme-raised"
              >
                {d.label}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
