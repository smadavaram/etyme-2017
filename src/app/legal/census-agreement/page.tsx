import type { Metadata } from 'next'
import { LegalDocument } from '../document'
import { CENSUS_AGREEMENT } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Census agreement — Etyme',
  description:
    'The one page read before a client sends us anything: what we receive, who at Etyme ' +
    'can see it, where it sits, that we never approach their suppliers, the day we delete ' +
    'it, and what happens if they start a program.',
}

export default function CensusAgreementPage() {
  return <LegalDocument doc={CENSUS_AGREEMENT} docKey="census" />
}
