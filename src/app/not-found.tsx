import Link from 'next/link'

/**
 * What an address that does not exist opens.
 *
 * Next's own page was a bare black-and-white error number and one line,
 * with no brand and no way back (sign-up walk, round four,
 * item 20). One sentence, in the brand, and a link home.
 */
export default function NotFound() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-6 py-16 bg-etyme-canvas text-etyme-ink">
      <div className="max-w-md">
        <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">Not found</p>
        <h1 className="mt-2 font-serif text-3xl tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
          There is no page at this address.
        </h1>
        <div className="mt-6">
          <Link href="/" className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">
            Go to the home page
          </Link>
        </div>
      </div>
    </main>
  )
}
