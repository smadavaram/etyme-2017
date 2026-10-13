import { PartyPageView, partyMetadata } from '@/lib/public-site/party-page'

export const metadata = partyMetadata('program-offices')
export default function Page() { return <PartyPageView slug="program-offices" /> }
