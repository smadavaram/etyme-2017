import type { Metadata } from 'next'
import { LegalDocument } from '../legal/document'

export const metadata: Metadata = {
  title: 'Data Processing Addendum — Etyme',
  description:
    'How Etyme handles personal data in a customer’s data: roles, categories, sub-processors, security measures, breaches, and deletion at the end.',
}

export default function DpaPage() {
  return <LegalDocument docKey="dpa" />
}
