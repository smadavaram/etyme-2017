import { DoorFrame } from '../door-frame'
import { deploymentSecret, openBlob } from '@/lib/identity/oidc'
import { signInRefusal } from '@/lib/login-doors'
import { FinishDirectorySignIn } from './finish'

/**
 * Back from a company's own directory (founder, 2026-11-11).
 *
 * On a yes, the browser holds a two-minute ticket the server set; the
 * client half hands it to NextAuth's `directory-oidc` door, which spends
 * it once and mints the session like every other door. On a no, the
 * sentence is the directory door's own, sealed by the server so nobody
 * can put words on this page through its address.
 */
export const dynamic = 'force-dynamic'

export default function DirectoryReturn({ searchParams }: { searchParams?: { next?: string; error?: string; r?: string } }) {
  if (searchParams?.error) {
    const own = deploymentSecret()
    const sealed = own ? openBlob<{ says: string }>(searchParams.r, 'sso-refusal', own) : null
    const says = sealed?.says ?? signInRefusal(searchParams.error) ?? 'That sign-in did not go through.'
    return (
      <DoorFrame>
        <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-3">Your company&rsquo;s directory did not sign you in</h1>
        <p role="alert" className="text-sm text-etyme-attention">{says}</p>
        <p className="text-sm mt-6"><a href="/login" className="text-etyme-action-press hover:underline">Back to sign in</a></p>
      </DoorFrame>
    )
  }
  return (
    <DoorFrame>
      <FinishDirectorySignIn next={searchParams?.next ?? '/start'} />
    </DoorFrame>
  )
}
