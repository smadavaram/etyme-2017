'use client'

import { useEffect, useState, useCallback, use } from 'react'

/**
 * The page a stranger opens.
 *
 * No sign-in, no account, no navigation into the rest of the system. A
 * supplier's office manager has a certificate of insurance in their
 * downloads folder and ninety seconds of goodwill, and every step between
 * those two facts loses some of it.
 *
 * So: what you need, why, and a button per item. Nothing else.
 */

interface Item {
  id: string
  label: string
  hint: string
  required: boolean
  state: string
  fileName: string | null
  receivedAt: string | null
  note: string | null
}

interface Packet {
  label: string
  from: string
  about: string | null
  greeting: string | null
  reopenedReason: string | null
  expiresAt: string
  complete: boolean
  progress: { total: number; received: number; complete: boolean; summary: string }
  items: Item[]
}

export default function PacketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [packet, setPacket] = useState<Packet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/packet/${token}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'This link is not valid.')
      setPacket(body.data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function send(item: Item, file: File) {
    setBusy(item.id)
    setFlash(null)
    try {
      const res = await fetch(`/api/packet/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          // Stored as a reference. The file itself goes to object storage
          // in production; this keeps the flow honest end to end without
          // pretending an upload pipeline exists.
          fileUrl: `pending://${encodeURIComponent(file.name)}`,
          fileName: file.name,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not send that')
      setFlash(body.data.message)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (error && !packet) {
    return (
      <div className="min-h-screen bg-etyme-canvas grid place-items-center px-6">
        <div className="max-w-md text-center">
          <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">Etyme</p>
          <h1 className="font-serif text-2xl text-etyme-ink mt-2 tracking-[-0.02em]">
            This link is not usable
          </h1>
          <p className="text-etyme-muted mt-3 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!packet) {
    return (
      <div className="min-h-screen bg-etyme-canvas grid place-items-center">
        <p className="text-etyme-muted text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-etyme-canvas px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <p className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">
          {packet.from}
        </p>
        <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">
          {packet.label}
        </h1>
        {packet.about && (
          <p className="text-etyme-muted mt-1 text-sm">About {packet.about}</p>
        )}

        {packet.reopenedReason && (
          <div className="mt-5 rounded-lg border border-etyme-attention/30 bg-etyme-attention/5 p-4">
            <p className="text-[13px] text-etyme-ink">{packet.reopenedReason}</p>
          </div>
        )}

        <p className="text-etyme-muted mt-4 text-[15px] leading-relaxed">
          {packet.progress.summary}
        </p>

        {flash && (
          <div className="mt-4 rounded-lg border border-etyme-verified/30 bg-etyme-verified/5 p-3">
            <p className="text-[13px] text-etyme-verified">{flash}</p>
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-etyme-attention/30 bg-etyme-attention/5 p-3">
            <p className="text-[13px] text-etyme-attention">{error}</p>
          </div>
        )}

        <div className="mt-8 space-y-3">
          {packet.items.map((item) => {
            const done = item.state === 'RECEIVED' || item.state === 'ACCEPTED'
            return (
              <div
                key={item.id}
                className={`bg-etyme-surface border rounded-lg p-4 ${
                  item.state === 'REJECTED' ? 'border-etyme-attention/40' : 'border-etyme-rule'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[15px] text-etyme-ink">
                      {item.label}
                      {!item.required && (
                        <span className="ml-2 text-[12px] text-etyme-faint">optional</span>
                      )}
                    </p>
                    <p className="text-[13px] text-etyme-muted mt-0.5">{item.hint}</p>

                    {item.state === 'ACCEPTED' && (
                      <p className="text-[12px] text-etyme-verified mt-1.5">
                        Accepted{item.fileName ? ` — ${item.fileName}` : ''}
                      </p>
                    )}
                    {item.state === 'RECEIVED' && (
                      <p className="text-[12px] text-etyme-muted mt-1.5">
                        Sent{item.fileName ? ` — ${item.fileName}` : ''}. Waiting to be looked at.
                      </p>
                    )}
                    {item.state === 'REJECTED' && (
                      <p className="text-[12px] text-etyme-attention mt-1.5">
                        Sent back: {item.note}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <label
                      className={`inline-block px-3 py-1.5 rounded text-[13px] font-medium cursor-pointer transition-colors ${
                        done
                          ? 'border border-etyme-rule text-etyme-muted hover:text-etyme-ink'
                          : 'bg-etyme-action text-white hover:opacity-90'
                      } ${busy === item.id ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      {busy === item.id ? 'Sending…' : done ? 'Replace' : 'Attach'}
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) send(item, f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[12px] text-etyme-faint mt-8">
          This link works until {packet.expiresAt} and only for this request. If it stops working,
          ask {packet.from} for a new one — nothing you have already sent is lost.
        </p>
      </div>
    </div>
  )
}
