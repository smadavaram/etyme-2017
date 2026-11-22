import { SegmentPageView, segmentMetadata, type DoorParams } from '@/lib/public-site/party-page'
import { doorFacts } from '@/lib/public-site/door-map-facts'
export const metadata = segmentMetadata('bench')
export default async function Page(params: DoorParams) { return <SegmentPageView slug="bench" params={params} facts={await doorFacts('suppliers')} /> }
