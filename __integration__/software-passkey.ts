/**
 * A software passkey, for the second check's integration tests: what a
 * phone or a laptop does when the browser asks it to make a passkey or
 * answer a challenge, in about eighty lines of node's own crypto. It
 * answers with user presence and user verification set, attestation
 * "none", on a P-256 key (COSE algorithm -7), exactly as a platform
 * passkey does. The server checks every byte with the real library.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'

const b64u = (b: Buffer) => b.toString('base64url')
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest()

// ── A little CBOR: unsigned and negative integers, bytes, text, maps ─

function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n])
  if (n < 256) return Buffer.from([(major << 5) | 24, n])
  if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255])
  const b = Buffer.alloc(5)
  b[0] = (major << 5) | 26
  b.writeUInt32BE(n, 1)
  return b
}

type Cbor = number | string | Buffer | Map<Cbor, Cbor>

function cbor(v: Cbor): Buffer {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v)
  if (typeof v === 'string') {
    const t = Buffer.from(v, 'utf8')
    return Buffer.concat([head(3, t.length), t])
  }
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v])
  const parts: Buffer[] = [head(5, v.size)]
  for (const [k, val] of v) parts.push(cbor(k), cbor(val))
  return Buffer.concat(parts)
}

// ── The device ───────────────────────────────────────────────────────

const UP = 0x01
const UV = 0x04
const AT = 0x40

export class SoftwarePasskey {
  readonly credentialId = randomBytes(16)
  private readonly key: KeyObject
  private readonly pub: KeyObject
  private counter = 0
  /** Set false to answer without user verification, as a key with no PIN does. */
  verifies = true

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    this.key = privateKey
    this.pub = publicKey
  }

  get id(): string {
    return b64u(this.credentialId)
  }

  private flags(extra = 0): number {
    return UP | (this.verifies ? UV : 0) | extra
  }

  private clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string, origin: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }), 'utf8')
  }

  /** What `navigator.credentials.create` answers, in the JSON the browser package sends. */
  create(options: { challenge: string; rp: { id?: string } }, origin: string) {
    const rpId = options.rp.id ?? new URL(origin).hostname
    const jwk = this.pub.export({ format: 'jwk' }) as { x: string; y: string }
    const cose = cbor(new Map<Cbor, Cbor>([
      [1, 2], [3, -7], [-1, 1],
      [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')],
    ]))
    const idLen = Buffer.from([this.credentialId.length >> 8, this.credentialId.length & 255])
    const count = Buffer.alloc(4)
    const authData = Buffer.concat([sha256(rpId), Buffer.from([this.flags(AT)]), count, Buffer.alloc(16), idLen, this.credentialId, cose])
    const attestationObject = cbor(new Map<Cbor, Cbor>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
    return {
      id: this.id, rawId: this.id, type: 'public-key',
      response: {
        clientDataJSON: b64u(this.clientData('webauthn.create', options.challenge, origin)),
        attestationObject: b64u(attestationObject),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    }
  }

  /** What `navigator.credentials.get` answers. Each answer moves the counter on by one. */
  get(options: { challenge: string; rpId?: string }, origin: string) {
    const rpId = options.rpId ?? new URL(origin).hostname
    this.counter += 1
    const count = Buffer.alloc(4)
    count.writeUInt32BE(this.counter)
    const authenticatorData = Buffer.concat([sha256(rpId), Buffer.from([this.flags()]), count])
    const clientDataJSON = this.clientData('webauthn.get', options.challenge, origin)
    const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), this.key)
    return {
      id: this.id, rawId: this.id, type: 'public-key',
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authenticatorData),
        signature: b64u(signature),
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    }
  }
}
