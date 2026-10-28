import { PartyPageView, partyMetadata, type DoorParams } from '@/lib/public-site/party-page'
import { doorFacts } from '@/lib/public-site/door-map-facts'
export const metadata = partyMetadata('integrators')
export default async function Page(params: DoorParams) { return <PartyPageView slug="integrators" params={params} facts={await doorFacts('integrators')} /> }
