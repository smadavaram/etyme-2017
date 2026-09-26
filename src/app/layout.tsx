import type { Metadata } from 'next'
import { Gelasio, Inter, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

/**
 * Three families, from the brand kit adopted 2026-09-26.
 *
 * The mono was JetBrains Mono, which was never the documented standard:
 * tailwind.config.ts already named IBM Plex Mono as the fallback and
 * CLAUDE.md's typography section has said IBM Plex Mono since it was
 * written. The product had drifted from its own spec and the kit agrees
 * with the spec, so this is a correction rather than a change of mind.
 *
 * Gelasio is new, and it is the serif's last resort rather than its first
 * choice: the stack is Iowan Old Style → Palatino → Georgia → Gelasio.
 * Gelasio is metric-compatible with Georgia, so it is what a machine with
 * none of the first three gets — a Linux or Android reader — without the
 * line lengths moving. The variable names stay --font-inter and --font-mono
 * so the 834 `font-mono` and `font-sans` call sites do not move.
 */

const gelasio = Gelasio({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-gelasio',
})

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: {
    default: 'Etyme',
    template: '%s | Etyme',
  },
  description:
    'The system of record for contingent hiring. Every hire, every timesheet, every payment — verified.',
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${gelasio.variable} ${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
