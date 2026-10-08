import { resetLinkState } from '@/lib/password-door'
import { DoorFrame } from '../../door-frame'
import { ResetWithLinkForm } from './form'

/**
 * The link in a reset or set-a-password email.
 *
 * The link is checked when the page opens (sign-up walk, round two, item
 * 43): a used, replaced, expired or made-up link says so before anything
 * is typed, the way a verify link does. Checking reads and never spends,
 * so a mail scanner that opens the link leaves it working.
 */
export const dynamic = 'force-dynamic'

export default async function ResetWithLinkPage({ params }: { params: { token: string } }) {
  const state = await resetLinkState(params.token)
  if (!state.ok) {
    return (
      <DoorFrame>
        <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-3">This link did not work</h1>
        <p role="alert" className="text-sm text-etyme-attention">{state.says}</p>
        <p className="text-sm mt-6">
          <a href="/reset" className="text-etyme-action-press hover:underline">Ask for a new link</a>
          <span className="text-etyme-faint"> · </span>
          <a href="/login" className="text-etyme-action-press hover:underline">Sign in</a>
        </p>
      </DoorFrame>
    )
  }
  return <ResetWithLinkForm token={params.token} />
}
