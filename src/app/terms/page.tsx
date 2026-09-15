import type { Metadata } from 'next'
import { LegalDocument } from '../legal/document'
import { TERMS } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Terms of service — Etyme',
  description:
    'A working draft, written from the behavior of the software, for a lawyer to turn ' +
    'into a binding agreement.',
}

export default function TermsPage() {
  return <LegalDocument doc={TERMS} current="/terms" />
}
