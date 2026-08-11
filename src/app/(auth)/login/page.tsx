import Link from 'next/link'
import { EtymeLogo } from '@/components/logo'

export const metadata = {
  title: 'Sign in',
}

export default function LoginPage() {
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
            Use your company Microsoft or Google account.
          </p>

          {/* OAuth buttons */}
          <div className="space-y-3 mb-6">
            <button
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

            <button
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
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-etyme-rule" />
            <span className="text-xs text-etyme-muted">or</span>
            <div className="flex-1 h-px bg-etyme-rule" />
          </div>

          {/* Email sign in */}
          <form className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-etyme-muted mb-1.5">
                Work email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-etyme-rule
                           text-sm placeholder:text-etyme-muted/50
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20
                           focus:border-etyme-action transition-all"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2.5 rounded-lg bg-etyme-navy text-white
                         text-sm font-medium hover:bg-etyme-ink transition-colors"
            >
              Send magic link
            </button>
          </form>

          <p className="text-xs text-etyme-muted/60 mt-6 text-center">
            By signing in, you agree to the Etyme Terms of Service.
            <br />
            Personal email domains (gmail, yahoo) are not accepted.
          </p>
        </div>
      </div>
    </div>
  )
}
