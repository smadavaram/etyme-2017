import { PartyPageView, partyMetadata, type DoorParams } from '@/lib/public-site/party-page'
import { doorFacts } from '@/lib/public-site/door-map-facts'
export const metadata = partyMetadata('program-offices')
export default async function Page(params: DoorParams) { return <PartyPageView slug="program-offices" params={params} facts={await doorFacts('program-offices')} /> }
