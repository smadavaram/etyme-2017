/**
 * Forwarded business email, received securely (founder, 2026-10-22:
 * "security beats everything"). The one door.
 *
 *   address     the company's one address, minted, hashed, parsed
 *   signature   the provider's signature over the raw delivery
 *   sender      SPF and DKIM passed and aligned
 *   attachments allowed types, read from bytes, under the caps
 *   plain-text  the body as text, never HTML
 *   sort        rules only; IntakeDraft for the card owners; the model slot
 *   intake      one delivery, signature to row
 *   settings    the switch and the address
 *   drafts      what the card owners read and write
 *   retention   the nightly deletion
 */
export * from './address'
export * from './signature'
export * from './sender'
export * from './attachments'
export * from './plain-text'
export * from './sort'
export { receiveDelivery, MODEL_STEP, DELIVERY_CAP_BYTES, type Delivery, type DeliveryOutcome } from './intake'
export * from './settings'
export * from './drafts'
export * from './retention'
export { RECEIVING_KEY_ENV } from './provider'
