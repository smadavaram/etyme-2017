import { PartyPageView, partyMetadata, type DoorParams } from '@/lib/public-site/party-page'
import { doorFacts } from '@/lib/public-site/door-map-facts'
export function generateMetadata(params: DoorParams) { return partyMetadata('suppliers', params) }
export default async function Page(params: DoorParams) { return <PartyPageView slug="suppliers" params={params} facts={await doorFacts('suppliers')} /> }
