'use client'

/**
 * Training funnel — Talent section (vendor)
 *
 * BRD §9: "Training pipeline that tracks a candidate from sourcing
 * through onboarding to bench-ready." Phase 1 data model only.
 *
 * This page will show:
 * - Active training programs and their completion rates
 * - Candidate pipeline by stage (sourced → screening → training → certified → bench)
 * - Skill gap analysis against open requirements
 * - Certification tracking with expiry dates
 */

export default function TrainingPage() {
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Talent</p>
        <h1>Training</h1>
        <p>
          Candidate pipeline from sourcing through certification to bench-ready.
          Track completion rates, skill gaps, and certification expiry.
        </p>
      </div>

      <div className="panel text-center py-16">
        <p className="text-lg font-serif text-etyme-ink mb-2">Coming soon</p>
        <p className="text-sm text-etyme-muted max-w-md mx-auto">
          The training funnel tracks candidates from sourcing through onboarding to bench-ready.
          Pipeline stages, completion rates, and certification tracking will appear here.
        </p>
        <p className="text-xs text-etyme-faint mt-4">
          Phase 1 data model is in place — the UI is next.
        </p>
      </div>
    </>
  )
}
