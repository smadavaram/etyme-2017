import type { Metadata } from 'next'
import { LegalDocument } from '../legal/document'

export const metadata: Metadata = {
  title: 'Terms of Service — Etyme',
  description:
    'The agreement between Etyme and the companies and people who use it: what Etyme is and is not, what each party is responsible for, and what is still to be decided.',
}

export default function TermsPage() {
  return <LegalDocument docKey="terms" />
}
