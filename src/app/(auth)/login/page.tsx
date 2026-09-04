'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { signIn, getProviders } from 'next-auth/react'
import { EtymeLogo } from '@/components/logo'

/**
 * Signing in.
 *
 * There is no separate sign-up. Whether a company already exists for your
 * email domain is something the system can work out, so both buttons land
 * on /start, which either joins you to your colleagues or sets the company
 * up (src/lib/onboarding.ts).
 *
 * The buttons used to render and do nothing at all — the page looked
 * finished and was a picture of itself.
 *
 * They now also ask NextAuth which ways in exist before offering them. A
 * Microsoft button that redirects to an error page because nobody set the
 * tenant credentials is worse than no Microsoft button: the person cannot
 * tell whether they are locked out or the product is broken, and an
 * enterprise buyer only tries once.
 */

export default function LoginPage() {
  const [available, setAvailable] = useState<Set<string> | null>(null)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [devEmail, setDevEmail] = useState<string | null>(null)

  useEffect(() => {
    getProviders()
      .then((p) => setAvailable(new Set(Object.keys(p ?? {}))))
      // If we cannot ask, offer everything rather than locking the door.
      .catch(() => setAvailable(null))

    // The bypass already decides who the app thinks you are in development.
    // Saying so here is the difference between a preview somebody can open
    // and a front door that is honest and shut.
    fetch('/api/auth/dev-session')
      .then((r) => r.json())
      .then((b) => setDevEmail(b?.data?.active ? b.data.email : null))
      .catch(() => setDevEmail(null))
  }, [])

  // Null means we do not know yet, so nothing is hidden on that basis.
  const has = (id: string) => available === null || available.has(id)
  const nothingWorks = available !== null && available.size === 0

  return (
    <div className="min-h-screen bg-etyme-navy flex">
      {/* Left — Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12">
        <Link href="/">
          <EtymeLogo size="lg" inverted />
        </Link>

        <div className="max-w-md">
          <p className="text-2xl font-semibold text-white leading-snug mb-4 tracking-[-0.02em]">
            The system of record for everything after the hire.
          </p>
          <p className="text-sm text-white/40 leading-relaxed">
            Employ, track, pay, prove — with an evidence trail that AI agents can
            trust and auditors can verify.
          </p>
        </div>

        <div className="flex items-center gap-6 text-xs text-white/20">
          <span>Etyme Inc.</span>
          <span>·</span>
          <span>SAP/ERP Staffing</span>
          <span>·</span>
          <span>System of Record</span>
        </div>
      </div>

      {/* Right — Sign In */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white lg:rounded-l-3xl">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10">
            <EtymeLogo size="lg" />
          </div>

          <h1 className="text-xl font-semibold mb-1">Sign in to Etyme</h1>
          <p className="text-sm text-etyme-muted mb-8">
            Your work address decides where you land — your colleagues&rsquo; company
            if it is already here, a new one if it is not.
          </p>

          {devEmail && (
            <div className="mb-6 rounded-lg border border-etyme-rule bg-etyme-canvas p-3">
              <p className="text-[13px] text-etyme-ink mb-2">
                This build is running with a development session as{' '}
                <span className="font-medium">{devEmail}</span>. No sign-in is needed.
              </p>
              <Link
                href="/dashboard"
                className="inline-block px-4 py-2 rounded-lg bg-etyme-navy text-white
                           text-[13px] font-medium hover:bg-etyme-ink transition-colors"
              >
                Continue to Etyme
              </Link>
            </div>
          )}

          {nothingWorks && !devEmail && (
            <div className="mb-6 rounded-lg border border-etyme-rule bg-etyme-canvas p-3">
              <p className="text-[13px] text-etyme-ink">
                No sign-in method is switched on for this deployment yet. Set the Microsoft,
                Google, or email credentials and this page will offer them.
              </p>
            </div>
          )}

          {/* OAuth buttons */}
          <div className="space-y-3 mb-6">
            {has('azure-ad') && (
            <button
              type="button"
              onClick={() => signIn('azure-ad', { callbackUrl: '/start' })}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg
                         border border-etyme-rule hover:border-etyme-action/30
                         hover:bg-blue-50/50 transition-all text-sm font-medium"
            >
              <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
                <path d="M10 0H0V10H10V0Z" fill="#F25022" />
                <path d="M21 0H11V10H21V0Z" fill="#7FBA00" />
                <path d="M10 11H0V21H10V11Z" fill="#00A4EF" />
                <path d="M21 11H11V21H21V11Z" fill="#FFB900" />
              </svg>
              Continue with Microsoft
            </button>
            )}

            {has('google') && (
            <button
              type="button"
              onClick={() => signIn('google', { callbackUrl: '/start' })}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg
                         border border-etyme-rule hover:border-etyme-action/30
                         hover:bg-blue-50/50 transition-all text-sm font-medium"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>
            )}
          </div>

          {/* Divider */}
          {has('email') && (
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-etyme-rule" />
            <span className="text-xs text-etyme-muted">or</span>
            <div className="flex-1 h-px bg-etyme-rule" />
          </div>
          )}

          {/* Email sign in */}
          {has('email') && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!email.trim()) return
              setSent(true)
              signIn('email', { email: email.trim(), callbackUrl: '/start' })
            }}
          >
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-etyme-muted mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-etyme-rule
                           text-sm placeholder:text-etyme-muted/50
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20
                           focus:border-etyme-action transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={sent || !email.trim()}
              className="w-full px-4 py-2.5 rounded-lg bg-etyme-navy text-white
                         text-sm font-medium hover:bg-etyme-ink transition-colors
                         disabled:opacity-50"
            >
              {sent ? 'Check your email' : 'Send magic link'}
            </button>
          </form>
          )}

          <p className="text-xs text-etyme-muted/60 mt-6 text-center">
            By signing in, you agree to the Etyme Terms of Service.
            <br />
            A personal address signs you in as a consultant. Setting a company up
            takes a work address.
          </p>
        </div>
      </div>
    </div>
  )
}
