import type { Metadata } from 'next'
import { LegalDocument } from '../legal/document'

export const metadata: Metadata = {
  title: 'Terms of Service — Etyme',
  description:
    'The agreement between Etyme and the companies and people who use it: what Etyme is and is not, and what each party is responsible for.',
}

export default function TermsPage() {
  return <LegalDocument docKey="terms" />
}
