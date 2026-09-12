'use client'

import { useState, useCallback, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────

interface ColumnMapping {
  sourceColumn: string
  targetField: string | null
  confidence: number
  flagged: boolean
}

interface MappingResult {
  mappings: ColumnMapping[]
  unmapped: string[]
  warnings: string[]
}

interface ImportRecord {
  id: string
  companyId: string
  kind: string
  fileName: string | null
  rowCount: number
  issueCount: number
  mapping: MappingResult
  createdAt: string
}

interface ImportRow {
  id: string
  raw: Record<string, string>
  parsed: Record<string, any>
  issues: string[]
  createdId: string | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface CommitResult {
  importId: string
  committed: boolean
  created: number
  skipped: number
  rolloffCount: number
  message: string
}

type Step = 'upload' | 'mapping' | 'review' | 'committed'

// ── Target field options ───────────────────────────────────

const TARGET_FIELDS = [
  { value: '', label: '(unmapped)' },
  { value: 'name', label: 'Full Name' },
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'headline', label: 'Headline / Title' },
  { value: 'skills', label: 'Skills' },
  { value: 'location', label: 'Location' },
  { value: 'workAuth', label: 'Work Authorization' },
  { value: 'payRate', label: 'Pay Rate' },
  { value: 'billRate', label: 'Bill Rate' },
  { value: 'contractType', label: 'Contract Type' },
  { value: 'startDate', label: 'Start Date' },
  { value: 'endDate', label: 'End Date' },
  { value: 'availableFrom', label: 'Available From' },
  { value: 'clientName', label: 'Client' },
  { value: 'vendorName', label: 'Vendor' },
  { value: 'projectName', label: 'Project' },
]

// ── Confidence indicator ───────────────────────────────────

function ConfidenceDot({ confidence }: { confidence: number }) {
  if (confidence >= 0.9) return <span className="evidence-dot" title="High confidence" />
  if (confidence >= 0.5) return <span className="evidence-dot evidence-dot--pending" title="Low confidence — review" />
  return <span className="evidence-dot evidence-dot--blocked" title="Unmapped" />
}

// ── Step 1: Upload ─────────────────────────────────────────

function UploadStep({ onUploaded }: { onUploaded: (imp: ImportRecord) => void }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState('PEOPLE')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      // companyId will need to come from context — use placeholder for now
      formData.append('companyId', 'pending')
      formData.append('kind', kind)

      const res = await fetch('/api/imports', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `Upload failed (HTTP ${res.status})`)
      }

      const body = await res.json()
      onUploaded(body.data.import)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }, [kind, onUploaded])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  return (
    <div className="space-y-6">
      {/* Kind selector */}
      <div>
        <label className="block text-xs font-semibold text-etyme-muted mb-2">Import type</label>
        <div className="flex gap-2">
          {['PEOPLE', 'ASSIGNMENTS', 'CONTACTS'].map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                kind === k
                  ? 'bg-etyme-ink text-white border-etyme-ink'
                  : 'border-etyme-rule text-etyme-muted hover:bg-etyme-canvas'
              }`}
            >
              {k.charAt(0) + k.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`card text-center py-16 cursor-pointer transition-all ${
          dragging
            ? 'border-etyme-action bg-etyme-action/5 border-dashed border-2'
            : 'border-dashed border-2 border-etyme-rule hover:border-etyme-muted'
        }`}
      >
        {uploading ? (
          <>
            <div className="mx-auto mb-3 w-8 h-8 border-2 border-etyme-action border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Parsing your file...</p>
            <p className="text-xs text-etyme-muted mt-1">AI is mapping columns to Etyme fields</p>
          </>
        ) : (
          <>
            <svg className="mx-auto mb-3" width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="12" fill="rgb(var(--color-blue) / 0.06)" />
              <path d="M20 12v16M12 20h16" stroke="rgb(var(--color-blue))" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-sm font-medium">Drop a CSV file here, or click to browse</p>
            <p className="text-xs text-etyme-muted mt-1">
              Supports standard CSVs. We will map columns automatically and flag anything uncertain.
            </p>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Guidance */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-2">How the import works</h3>
        <ol className="space-y-2 text-xs text-etyme-muted">
          <li className="flex items-start gap-2">
            <span className="pill bg-etyme-action/10 text-etyme-action text-[10px] mt-0.5">1</span>
            <span><strong>Upload</strong> your CSV. The system reads every column header and proposes a mapping to Etyme fields.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="pill bg-etyme-action/10 text-etyme-action text-[10px] mt-0.5">2</span>
            <span><strong>Review the mapping.</strong> Fix any column that was not mapped or was mapped incorrectly. Low-confidence mappings are flagged.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="pill bg-etyme-action/10 text-etyme-action text-[10px] mt-0.5">3</span>
            <span><strong>Review the data.</strong> Scan rows for issues — missing emails, bad dates, unknown work authorization. Fix inline.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="pill bg-etyme-action/10 text-etyme-action text-[10px] mt-0.5">4</span>
            <span><strong>Commit.</strong> Creates real records. Rows with issues import at INTERNAL visibility — they will not appear on the bench until enriched.</span>
          </li>
        </ol>
      </div>
    </div>
  )
}

// ── Step 2: Mapping ────────────────────────────────────────

function MappingStep({
  importRecord,
  onMappingConfirmed,
}: {
  importRecord: ImportRecord
  onMappingConfirmed: (updated: ImportRecord) => void
}) {
  const [mappings, setMappings] = useState<ColumnMapping[]>(importRecord.mapping.mappings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateMapping(index: number, targetField: string) {
    const updated = [...mappings]
    updated[index] = {
      ...updated[index],
      targetField: targetField || null,
      confidence: targetField ? 1.0 : 0,
      flagged: !targetField,
    }
    setMappings(updated)
  }

  async function confirmMapping() {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/imports/${importRecord.id}/mapping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? 'Failed to update mapping')
      }

      const body = await res.json()
      onMappingConfirmed({
        ...importRecord,
        mapping: body.data.mapping,
        issueCount: body.data.issueCount,
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const flaggedCount = mappings.filter((m) => m.flagged).length
  const unmappedCount = mappings.filter((m) => !m.targetField).length

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="pill bg-etyme-action/5 text-etyme-action">
          {mappings.length} columns detected
        </span>
        {flaggedCount > 0 && (
          <span className="pill bg-amber-50 text-etyme-attention border border-amber-200">
            {flaggedCount} flagged for review
          </span>
        )}
        {unmappedCount > 0 && (
          <span className="pill bg-red-50 text-red-600 border border-red-200">
            {unmappedCount} unmapped
          </span>
        )}
      </div>

      {/* Warnings */}
      {importRecord.mapping.warnings.length > 0 && (
        <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
          <ul className="list-disc pl-4 space-y-1">
            {importRecord.mapping.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Mapping table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-etyme-rule">
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted w-8" />
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
                  CSV Column
                </th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted" />
                <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
                  Etyme Field
                </th>
                <th className="text-right px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m, i) => (
                <tr
                  key={m.sourceColumn}
                  className={`border-b border-etyme-rule last:border-0 ${
                    m.flagged ? 'bg-amber-50/50' : ''
                  }`}
                >
                  <td className="px-6 py-3">
                    <ConfidenceDot confidence={m.confidence} />
                  </td>
                  <td className="px-6 py-3 font-mono text-xs">{m.sourceColumn}</td>
                  <td className="px-6 py-3 text-etyme-muted text-center">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </td>
                  <td className="px-6 py-3">
                    <select
                      value={m.targetField ?? ''}
                      onChange={(e) => updateMapping(i, e.target.value)}
                      className={`px-2 py-1 text-sm border rounded-lg bg-white
                                  focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                                  ${m.flagged ? 'border-amber-300' : 'border-etyme-rule'}`}
                    >
                      {TARGET_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    <span className={`text-xs font-medium ${
                      m.confidence >= 0.9 ? 'text-etyme-verified' :
                      m.confidence >= 0.5 ? 'text-etyme-attention' :
                      'text-red-500'
                    }`}>
                      {Math.round(m.confidence * 100)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Action */}
      <div className="flex justify-end">
        <button
          onClick={confirmMapping}
          disabled={saving}
          className="px-5 py-2.5 text-sm font-medium rounded-lg bg-etyme-ink text-white
                     hover:bg-etyme-navy transition-colors disabled:opacity-50"
        >
          {saving ? 'Applying mapping...' : 'Confirm mapping and review rows'}
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Review ─────────────────────────────────────────

function ReviewStep({
  importRecord,
  onCommit,
}: {
  importRecord: ImportRecord
  onCommit: (result: CommitResult) => void
}) {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'issues' | 'clean'>('all')
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRows = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (filter !== 'all') params.set('filter', filter)

      const res = await fetch(`/api/imports/${importRecord.id}/rows?${params}`)
      if (!res.ok) throw new Error('Failed to load rows')

      const body = await res.json()
      setRows(body.data.rows)
      setPagination(body.data.pagination)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [importRecord.id, filter])

  // Load rows on mount and filter change
  useState(() => { fetchRows() })

  async function handleCommit() {
    if (!confirm(`This will create records from ${importRecord.rowCount} rows. Rows with issues will import at INTERNAL visibility. Continue?`)) {
      return
    }

    setCommitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/imports/${importRecord.id}/commit`, {
        method: 'POST',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? 'Commit failed')
      }

      const body = await res.json()
      onCommit(body.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCommitting(false)
    }
  }

  // Get the visible column names from the mapping
  const visibleFields = importRecord.mapping.mappings
    .filter((m) => m.targetField)
    .map((m) => ({ source: m.sourceColumn, target: m.targetField! }))

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="pill bg-etyme-action/5 text-etyme-action">
            {importRecord.rowCount} rows
          </span>
          {importRecord.issueCount > 0 ? (
            <span className="pill bg-amber-50 text-etyme-attention border border-amber-200">
              {importRecord.issueCount} with issues
            </span>
          ) : (
            <span className="pill bg-emerald-50 text-etyme-verified border border-emerald-200">
              All clean
            </span>
          )}
        </div>

        {/* Filter */}
        <div className="flex gap-1">
          {(['all', 'issues', 'clean'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); fetchRows(1) }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filter === f
                  ? 'bg-etyme-ink text-white'
                  : 'text-etyme-muted hover:bg-etyme-canvas'
              }`}
            >
              {f === 'all' ? 'All rows' : f === 'issues' ? 'With issues' : 'Clean'}
            </button>
          ))}
        </div>
      </div>

      {/* Dense review table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-scroll-x">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-etyme-rule">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted w-8">
                  #
                </th>
                {visibleFields.map((f) => (
                  <th key={f.target} className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
                    {f.target}
                  </th>
                ))}
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
                  Issues
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleFields.length + 2} className="px-4 py-8 text-center text-sm text-etyme-muted">
                    Loading rows...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleFields.length + 2} className="px-4 py-8 text-center text-sm text-etyme-muted">
                    No rows match the filter.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const hasIssues = row.issues.length > 0
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-etyme-rule last:border-0 ${
                        hasIssues ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="px-4 py-2 text-etyme-muted tabular-nums">
                        {(pagination.page - 1) * pagination.limit + idx + 1}
                      </td>
                      {visibleFields.map((f) => {
                        const value = row.parsed[f.target]
                        const displayValue = Array.isArray(value) ? value.join(', ') : String(value ?? '')
                        return (
                          <td key={f.target} className="px-4 py-2 max-w-[180px] truncate">
                            {displayValue || <span className="text-etyme-muted">—</span>}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2">
                        {hasIssues ? (
                          <div className="space-y-0.5">
                            {row.issues.map((issue, i) => (
                              <p key={i} className="text-amber-700 flex items-center gap-1.5">
                                <span className="evidence-dot evidence-dot--pending" />
                                {issue}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <span className="flex items-center gap-1.5 text-etyme-verified">
                            <span className="evidence-dot" />
                            Clean
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-etyme-muted">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} rows)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchRows(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-etyme-rule
                         hover:bg-etyme-canvas transition-colors disabled:opacity-30"
            >
              Previous
            </button>
            <button
              onClick={() => fetchRows(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-etyme-rule
                         hover:bg-etyme-canvas transition-colors disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Commit */}
      <div className="flex items-center justify-between pt-2 border-t border-etyme-rule">
        <p className="text-xs text-etyme-muted max-w-md">
          Committing creates People, ConsultantProfiles, and Assignments.
          Rows with issues import at INTERNAL visibility. Assignments ending within 8 weeks create rolloff events.
        </p>
        <button
          onClick={handleCommit}
          disabled={committing}
          className="px-5 py-2.5 text-sm font-medium rounded-lg bg-etyme-ink text-white
                     hover:bg-etyme-navy transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {committing ? 'Committing...' : `Commit ${importRecord.rowCount} rows`}
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Committed ──────────────────────────────────────

function CommittedStep({ result, onReset }: { result: CommitResult; onReset: () => void }) {
  return (
    <div className="card text-center py-12">
      <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h2 className="text-lg font-semibold mb-2">Import committed</h2>
      <p className="text-sm text-etyme-muted mb-6 max-w-md mx-auto">{result.message}</p>

      <div className="flex justify-center gap-4 mb-8">
        <div className="text-center">
          <p className="text-2xl font-semibold tabular-nums text-etyme-verified">{result.created}</p>
          <p className="text-xs text-etyme-muted mt-0.5">Created</p>
        </div>
        {result.skipped > 0 && (
          <div className="text-center">
            <p className="text-2xl font-semibold tabular-nums text-etyme-muted">{result.skipped}</p>
            <p className="text-xs text-etyme-muted mt-0.5">Skipped</p>
          </div>
        )}
        {result.rolloffCount > 0 && (
          <div className="text-center">
            <p className="text-2xl font-semibold tabular-nums text-etyme-attention">{result.rolloffCount}</p>
            <p className="text-xs text-etyme-muted mt-0.5">Rolloff events</p>
          </div>
        )}
      </div>

      <div className="flex justify-center gap-3">
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-etyme-rule
                     hover:bg-etyme-canvas transition-colors"
        >
          Import another file
        </button>
        <a
          href="/dashboard/consultants"
          className="px-4 py-2 text-sm font-medium rounded-lg bg-etyme-ink text-white
                     hover:bg-etyme-navy transition-colors inline-block"
        >
          View consultants
        </a>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────

export default function ImportPage() {
  const [step, setStep] = useState<Step>('upload')
  const [importRecord, setImportRecord] = useState<ImportRecord | null>(null)
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

  function handleUploaded(imp: ImportRecord) {
    setImportRecord(imp)
    setStep('mapping')
  }

  function handleMappingConfirmed(updated: ImportRecord) {
    setImportRecord(updated)
    setStep('review')
  }

  function handleCommit(result: CommitResult) {
    setCommitResult(result)
    setStep('committed')
  }

  function handleReset() {
    setStep('upload')
    setImportRecord(null)
    setCommitResult(null)
  }

  // Step labels for the progress bar
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'mapping', label: 'Map columns' },
    { key: 'review', label: 'Review data' },
    { key: 'committed', label: 'Commit' },
  ]
  const stepIndex = steps.findIndex((s) => s.key === step)

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Import data</h1>
        <p className="text-sm text-etyme-muted mt-1">
          The screen everything else depends on. Upload your CSV, review the mapping, scan the data, commit.
        </p>
      </div>

      {/* Step progress */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`w-8 h-px ${i <= stepIndex ? 'bg-etyme-action' : 'bg-etyme-rule'}`} />
              )}
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  i < stepIndex
                    ? 'bg-etyme-verified text-white'
                    : i === stepIndex
                    ? 'bg-etyme-action text-white'
                    : 'bg-etyme-canvas text-etyme-muted border border-etyme-rule'
                }`}>
                  {i < stepIndex ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6.5l2 2 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-xs font-medium ${
                  i === stepIndex ? 'text-etyme-ink' : 'text-etyme-muted'
                }`}>
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      {step === 'upload' && <UploadStep onUploaded={handleUploaded} />}
      {step === 'mapping' && importRecord && (
        <MappingStep importRecord={importRecord} onMappingConfirmed={handleMappingConfirmed} />
      )}
      {step === 'review' && importRecord && (
        <ReviewStep importRecord={importRecord} onCommit={handleCommit} />
      )}
      {step === 'committed' && commitResult && (
        <CommittedStep result={commitResult} onReset={handleReset} />
      )}
    </>
  )
}
