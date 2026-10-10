import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'

/**
 * What an address that does not exist opens.
 *
 * Next's own page was a bare black-and-white error number and one line,
 * with no brand and no way back (sign-up walk, round four,
 * item 20). One sentence, in the brand, and a link home — drawn the way
 * the denied screen is, because both are a door that did not open.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-etyme-canvas text-etyme-ink flex flex-col">
      <div className="px-6 h-14 flex items-center border-b border-etyme-rule">
        <Link href="/" aria-label="Etyme home" className="inline-block">
          <EtymeLogo size="md" />
        </Link>
      </div>
      <main className="flex-1 flex items-start justify-center px-6 py-16 sm:py-24">
        <div className="max-w-xl w-full">
          <p className="eyebrow">Not found</p>
          <h1 className="font-serif headline-serif mt-3 text-[30px] leading-[1.12] sm:text-[38px]">
            There is no page at this address.
          </h1>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="btn-primary inline-flex items-center">
              Go to the home page
            </Link>
            <Link href="/dashboard" className="btn-secondary inline-flex items-center">
              Back to your desk
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
