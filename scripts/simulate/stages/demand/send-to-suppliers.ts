/**
 * Stage: send-to-suppliers. Owned by demand (scripts/simulate/stage.ts says how to write one).
 *
 * What it will do: Procurement sends each open job to approved suppliers (POST /api/requisitions/[id]/distribute).
 *
 * A stub until demand builds it: the run passes through and the
 * report names the owner. Replace the line below with `defineStage`.
 */
import { stub } from '../../stage'

export default stub('send-to-suppliers', 'DEMAND')
