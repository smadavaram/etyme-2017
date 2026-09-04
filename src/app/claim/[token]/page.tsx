'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'

/**
 * Taking possession of a supplier record.
 *
 * A client listed this firm. That made a real company record with the
 * client's roles pointed at it — but nobody at the firm has ever signed
 * in, so it cannot be seen by the network and has no seats.
 *
 * The page has one job and says one thing: there are roles waiting.
 * Nobody at a staffing firm reads "you have been invited to a platform".
 * Everybody reads "Calder Manufacturing sent you two roles".
 */

interface Claim {
  company: string
  invitedBy: string
  invitedEmail: string
  contactName: string | null
  alreadyClaimed: boolean
  rolesWaiting: number
  signedInAs: string | null
  mayClaim: boolean | null
}

export default function ClaimPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params?.token

  const [claim, setClaim] = useState<Claim | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/claim/${token}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setClaim(body.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function take() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/claim/${token}`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      router.push(body.data.landing)
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-etyme-canvas">
      <div className="mx-auto max-w-[560px] px-6 py-16">
        <EtymeLogo size="lg" />

        {loading && <p className="mt-10 text-[13px] text-etyme-muted">Loading…</p>}

        {!loading && error && !claim && (
          <div className="panel mt-10">
            <p className="text-[13px] text-etyme-attention">{error}</p>
            <p className="mt-3 text-[12px] text-etyme-faint">
              Ask whoever sent it to send you a fresh one.
            </p>
          </div>
        )}

        {claim && (
          <div className="mt-10 space-y-6">
            <div>
              <p className="eyebrow">{claim.invitedBy} listed you as a supplier</p>
              <h1 className="headline-serif mt-2 text-[34px] leading-[1.05]">
                {claim.company}
              </h1>
              <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-etyme-muted">
                {claim.rolesWaiting > 0 ? (
                  <>
                    There {claim.rolesWaiting === 1 ? 'is' : 'are'}{' '}
                    <strong className="text-etyme-ink">
                      {claim.rolesWaiting} {claim.rolesWaiting === 1 ? 'role' : 'roles'}
                    </strong>{' '}
                    waiting for you from {claim.invitedBy}. Sign in and you can answer
                    {claim.rolesWaiting === 1 ? ' it' : ' them'} straight away — no bench
                    to build first, no setup.
                  </>
                ) : (
                  <>
                    {claim.invitedBy} added you to their supplier list. Take the account
                    and their roles come straight to you as they open.
                  </>
                )}
              </p>
            </div>

            {claim.alreadyClaimed && (
              <div className="panel">
                <p className="text-[13px] text-etyme-muted">
                  Somebody at {claim.company} has already taken this one.{' '}
                  <Link href="/login" className="underline">
                    Sign in
                  </Link>{' '}
                  and ask them for a seat.
                </p>
              </div>
            )}

            {!claim.alreadyClaimed && !claim.signedInAs && (
              <div className="space-y-3">
                <Link
                  href={`/login?next=/claim/${token}`}
                  className="inline-flex items-center rounded-lg bg-etyme-action px-6 py-3
                             text-[14px] font-semibold text-white"
                >
                  Sign in as {claim.invitedEmail}
                </Link>
                <p className="text-[12px] text-etyme-faint">
                  Use that address, or another one at the same company. We do not accept
                  a personal address for this — the link gets forwarded, and a company is
                  not something a stranger should be able to pick up.
                </p>
              </div>
            )}

            {!claim.alreadyClaimed && claim.signedInAs && claim.mayClaim === false && (
              <div className="panel">
                <p className="text-[13px] text-etyme-attention">
                  You are signed in as {claim.signedInAs}, and this was sent to{' '}
                  {claim.invitedEmail}.
                </p>
                <p className="mt-2 text-[12px] text-etyme-muted">
                  Sign in with that address, or with another one at {claim.company}.
                </p>
              </div>
            )}

            {!claim.alreadyClaimed && claim.mayClaim && (
              <div className="space-y-3">
                <button
                  onClick={take}
                  disabled={busy}
                  className="rounded-lg bg-etyme-action px-6 py-3 text-[14px] font-semibold
                             text-white disabled:opacity-40"
                >
                  {busy ? 'Setting up…' : `Take ${claim.company}`}
                </button>
                <p className="text-[12px] text-etyme-faint">
                  Signed in as {claim.signedInAs}. You get the owner's seat and can add
                  colleagues afterwards.
                </p>
              </div>
            )}

            {error && <p className="text-[13px] text-etyme-attention">{error}</p>}

            <p className="border-t border-etyme-rule pt-5 text-[12px] leading-relaxed text-etyme-faint">
              Your bench, your rates and your client relationships stay yours. They are
              not shared with other suppliers, and you can export everything whenever you
              want.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
