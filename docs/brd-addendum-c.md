**ETYME BRD --- ADDENDUM C**

The Rolloff Event · VMS Integration · Global Delivery & Internal Mobility

*Stress-tested against global SI operations (US, Canada, EMEA, LATAM, India, Australia)*

C1. THE MARKET FINDING

**Verified from direct field experience: even top-tier global SIs (Infosys-class, 300,000+ consultants) run contract rolloff on Excel sheets. No tool in their stack talks to the client VMS (Beeline) when a contract ends. No system simultaneously informs the candidate, the candidate\'s sub-vendor, and the client. No system flips the consultant to \"available\" so another internal PM can hire them.**

Prior assumption in this BRD process --- that large SIs have mature internal tooling for internal mobility --- was wrong. The gap exists at every scale, from 50-consultant vendors to the largest SIs in the world. The difference is only the size of the Excel sheet.

C1.1 Why Nobody Has Built This

> • The rolloff event originates in the client VMS (Beeline, Fieldglass) --- building around it requires VMS integration, which staffing tools avoid
>
> • The buyer inside an SI is ambiguous: RMG? Delivery? IT? Procurement? --- ambiguity kills enterprise sales, so vendors built for clearer buyers (ATS for recruiting, VMS for procurement)
>
> • The multi-party fan-out crosses company boundaries (client, prime, sub-vendor, candidate) --- no single-tenant tool can do it; only a network platform can

**Etyme is a network platform with all four parties already modeled. This gap is structurally Etyme\'s to take.**

C2. THE ROLLOFF EVENT --- THE WEDGE FEATURE

The single atomic workflow that lands Etyme inside an SI or large vendor. Everything else in the platform expands from this beachhead.

C2.1 The Layer Cake (All Parties Already in the Data Model)

  ------------------- ----------------------------- --------------------------------------------------------------------------------------
  **Tier**            **Real-World Example**        **Etyme Entity**

  End Client          AMAT / Apple                  Company (hiring_manager) or external via VMS

  Client VMS          Beeline / Fieldglass          NEW: VmsConnection integration layer

  Prime SI / Vendor   Inosys                        Company (vendor) --- the Etyme customer

  Sub-vendor          Candidate\'s employer (C2C)   Company (vendor) via PreferVendor + C2C BuyContract --- already modeled in 2017 code

  Consultant          The individual                Candidate with recruiter_id / RMG owner
  ------------------- ----------------------------- --------------------------------------------------------------------------------------

C2.2 The Rolloff Workflow (Reference Case: AMAT San Jose → Apple Austin)

  ------------------------- -------------------------------------------------------------------------------------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Step**                  **Trigger / Actor**                                                                          **System Action**

  1\. End Signal            Assignment end_date approaching (T-4 weeks) --- from Etyme Assignment OR Beeline API event   Consultant enters \"Releasing Soon\" supply pool with availability date

  2\. Forecast Match        System                                                                                       Matching fires against ALL open internal demand (other PMs\' engagements) BEFORE bench

  3\. Internal Visibility   System                                                                                       Apple Austin PM sees consultant in Releasing Soon pool: skills, rate, location, visa, availability date, AMAT project history

  4\. Internal Claim        Austin PM                                                                                    console_internal application --- PM requests the consultant; RMG owner + current PM notified

  5\. Compliance Gate       System                                                                                       Location change check: H1B → LCA amendment required flag BEFORE transfer confirmed; state tax registration; work-rights check on cross-border

  6\. Rolloff Execution     End date reached                                                                             FAN-OUT: simultaneous notification to (a) consultant, (b) sub-vendor, (c) client PM/procurement, (d) internal RMG --- each with role-appropriate content

  7\. Deboard Checklist     Workflow engine                                                                              Knowledge transfer, asset return, access revocation, final timesheet, release note --- owners + deadlines per item

  8\. Transition            System                                                                                       If claimed: new Assignment under Apple Engagement, onboarding checklist per Apple\'s doc requirements. If not: Assignment → bench_paid (B1), burn clock starts, AI prioritizes placement
  ------------------------- -------------------------------------------------------------------------------------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**The value in one sentence: the consultant never disappears between projects. The 2017 gap (A1.8 --- nothing happens at contract end) becomes the product\'s strongest feature.**

C2.3 What Makes This Sellable Immediately

> • Painkiller, not vitamin: every SI loses money and people at rolloff --- consultants quit during bench uncertainty, PMs hire externally while internal talent sits idle
>
> • Measurable: utilization % and bench cost are THE metrics SI leadership tracks; the rolloff loop moves both directly
>
> • Cheap to adopt: does not replace Beeline, does not replace the HRIS, does not require migration --- it listens and orchestrates
>
> • Clear buyer identified: RMG / Resource Management leadership + Delivery Ops, whose entire job is this workflow and who currently do it in Excel

C3. VMS INTEGRATION LAYER (NET NEW)

Extends the Ariba Option B strategy: Etyme never replaces the client\'s system of record --- it connects to it and orchestrates the workflow the VMS ignores.

  ---------------------------- --------------- -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Integration**              **Direction**   **Events / Data**

  Beeline                      Inbound         Assignment created / end-date changed / ended; requisitions; timesheet status

  SAP Fieldglass               Inbound         Work order events, SOW milestones, worker status

  Ariba Network                Outbound        Invoices via vendor ANID (per Option B, BRD v2.0 §15)

  Fallback: Email/CSV parser   Inbound         AI-parsed rolloff notices and assignment reports for clients with no API access --- critical because VMS API access requires client cooperation; the fallback makes adoption unilateral
  ---------------------------- --------------- -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**The fallback parser is strategically essential: the prime vendor can adopt Etyme WITHOUT asking the client for anything. Forwarding Beeline notification emails into Etyme is enough to drive the rolloff loop on day one. API integration deepens later.**

C4. GLOBAL DELIVERY FRACTURES & FIXES

  -------- ----------------------------------------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **\#**   **Fracture (2017 Code)**                              **2.0 Fix**

  1        Company.currency_id --- single currency per company   Currency moves to MSA/Engagement (billing) and Assignment (pay); FX pair recorded per period; multi-entity consolidation

  2        Flat Company; Branch/Department are address books     OrgUnit tree: legal entity (per country) → BU → account (AMAT, Apple) → engagement; Assignments carry cost centers; intercompany billing when employing entity ≠ serving entity (the SI default case)

  3        US-shaped contract types (W2/1099/C2C)                Cycle engine unchanged (country-agnostic); contract types, tax treatment, statutory deductions become pluggable per-country modules

  4        Matching = job-triggered, bench-only                  Demand-supply grid: continuous forecast matching of open + upcoming demand vs bench + releasing-soon supply (the utilization engine)

  5        Email on every notification, no digests               Notification preferences, digests, role-based routing, event batching --- prerequisite for any org over \~200 people

  6        Visa data stored, never enforced                      Compliance gates: location-change checks (LCA amendments), work-rights validation on cross-border moves, expiry alerts feeding the timeline (A5)
  -------- ----------------------------------------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

C4.1 New Role Definitions (Extends BRD §4.2)

  ------------------------ ------------------------------------------------------------------------------------------------------------ ----------------------------------------------------------------------
  **Role**                 **Permissions (New)**                                                                                        **Maps To**

  Project Manager          raise_demand, view_supply_pool, claim_consultant, approve_onboarding, approve_timesheets (own engagements)   The internal hiring manager at an SI --- did not exist in 2017 roles

  Resource Manager (RMG)   manage_supply_pool, assign_consultants, approve_transfers, view_utilization, manage_bench                    Extends recruiter_id ownership to the SI context

  Compliance Officer       manage_compliance_gates, approve_visa_transfers, view_audit                                                  Net new --- required once compliance gates exist
  ------------------------ ------------------------------------------------------------------------------------------------------------ ----------------------------------------------------------------------

C5. SEGMENT & PHASING IMPACT

C5.1 Revised Target Segments

  --------------- --------------------- ----------------------------------------------------------------------- -----------------------------------------------------------------------------------------------
  **Segment**     **Size**              **Entry Product**                                                       **Evidence**

  Small vendor    10--500 consultants   Vendor tier (B3.6): website + hotlist + training funnel + back office   Original Etyme market

  Mid-tier SI     500--5,000            Rolloff loop + demand-supply grid + bench burn                          Runs on spreadsheets; cannot build internal tools

  Global SI       5,000+                Rolloff loop via email-parser fallback → VMS API expansion              Field-verified: Excel-based rolloff even at 300k+ scale; no Beeline-connected rolloff tooling
  --------------- --------------------- ----------------------------------------------------------------------- -----------------------------------------------------------------------------------------------

C5.2 Phase Plan Impact (Amends B4)

> • Phase 1--2 (pulled forward): Releasing Soon supply pool, rolloff fan-out notifications, availability flip, email/CSV VMS fallback parser --- this is the A1.8 gap fix promoted from feature to flagship
>
> • Phase 3: compliance gates attach to Assignment transitions (location/visa checks) alongside the MSA→Engagement→Assignment restructure
>
> • Phase 4: Beeline/Fieldglass API integrations join Ariba; PM + RMG roles ship with the enterprise portal
>
> • Phase 5: demand-supply grid AI forecasting (predictive rolloff risk, proactive redeployment recommendations) deepens the loop

**END OF ADDENDUM C**

Document set: BRD v2.0 + Addendum A + Addendum B + Addendum C
