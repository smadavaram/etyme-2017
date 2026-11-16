import Link from 'next/link'
import type { Route } from 'next'
import { readSignInDoorPage } from '@/lib/notify/sign-in-link-door'
import { signInDoorGone, signInDoorPage, signInDoorUsed } from '@/lib/notify/sign-in-link'

/**
 * The page a firm's sign-in link opens (2026-11-16).
 *
 * One page for every address. It never says whether the address already
 * signs in to Etyme: Continue decides that, at use (`enterSignInDoor`), and
 * sends her to sign in as usual or to choose a password. Opening the page
 * only reads, so a mail scanner that opens every link decides nothing.
 * The link works once: pressed already, the page says so and links to the
 * sign-in page, the same words whichever way the first press went.
 */
export const dynamic = 'force-dynamic'

export default async function SignInDoorPage({ params }: { params: { token: string } }) {
  const read = await readSignInDoorPage(params.token)
  const words = read.ok ? signInDoorPage(read.firmName) : null
  return (
    <main className="mx-auto flex min-h-screen max-w-[36rem] flex-col justify-center px-6 py-16">
      <div className="panel">
        {words ? (
          <>
            <p className="text-[10px] uppercase tracking-[0.08em] text-etyme-faint">{read.firmName}</p>
            <h1 className="headline-serif mt-1 text-[27px]">{words.heading}</h1>
            <p className="mt-3 max-w-[46ch] text-[14px] text-etyme-ink">{words.says}</p>
            <form method="post" action={`/api/answer/sign-in/${encodeURIComponent(params.token)}`} className="mt-5">
              <button type="submit" className="rounded-md bg-etyme-action px-4 py-2 text-[13px] text-white">
                {words.button}
              </button>
            </form>
            <p className="mt-4 max-w-[46ch] text-[12px] text-etyme-muted">{words.after}</p>
          </>
        ) : !read.ok && read.used && read.firmName ? (
          <>
            <h1 className="headline-serif text-[27px]">This link was already used</h1>
            <p className="mt-2 max-w-[46ch] text-[14px] text-etyme-ink">{signInDoorUsed(read.firmName)}</p>
            <p className="mt-4 text-[13px]">
              <Link href={'/login' as Route} className="text-etyme-action-press underline underline-offset-2">Go to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="headline-serif text-[27px]">This link no longer works</h1>
            <p className="mt-2 max-w-[46ch] text-[14px] text-etyme-ink">{signInDoorGone(read.firmName)}</p>
          </>
        )}
      </div>
    </main>
  )
}
