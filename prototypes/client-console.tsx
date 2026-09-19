import { useState, useEffect } from "react";

/* ─────────────────────────────────────────────────────────────
   ETYME — CLIENT OPERATIONS CONSOLE
   BRD v3.7 §17.1 Option C (mid-market, no VMS) + §16 rolloff fan-out
   Adds: daily approval queue, contract operations, client-initiated
   rolloff with six-party fan-out, vendor discovery by skill and region.
   ───────────────────────────────────────────────────────────── */

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;450;500;600&display=swap');`;

const PAPER = "#F7F6F3", INK = "#14181D", BODY = "#3D454E", MUTE = "#8A9199";
const RULE = "#DFDCD5", HOT = "#C2410C", CALM = "#0B7A6B", ACT = "#2F3AC4", WARN = "#B45309";

type Tab = "today" | "contracts" | "roles" | "memory" | "vendors" | "org";

const APPROVALS = [
  { id: "a1", kind: "timesheet", who: "Anita Raghavan", vendor: "TechVista", detail: "Week ending 1 Aug · 40.0 hrs", sub: "$4,080 · standard week", flag: null as string | null, age: "2 days" },
  { id: "a2", kind: "timesheet", who: "James Okonkwo", vendor: "Apex SAP", detail: "Week ending 1 Aug · 52.5 hrs", sub: "$5,119 · 12.5 hrs overtime", flag: "Overtime above contract cap of 45 hrs", age: "2 days" },
  { id: "a3", kind: "timesheet", who: "Sarah Lindqvist", vendor: "TechBridge", detail: "Week ending 1 Aug · 38.0 hrs", sub: "$3,306 · 2 hrs under standard", flag: null, age: "1 day" },
  { id: "a4", kind: "expense", who: "James Okonkwo", vendor: "Apex SAP", detail: "Travel — Denver to Lakewood", sub: "$1,284 · flight, 2 nights hotel, per diem", flag: "Hotel $312/night exceeds $250 policy", age: "4 days" },
  { id: "a5", kind: "expense", who: "Anita Raghavan", vendor: "TechVista", detail: "Software licence — SAP GUI", sub: "$180 · one-off, pre-approved", flag: null, age: "1 day" },
  { id: "a6", kind: "document", who: "Priya Deshmukh", vendor: "TechVista", detail: "Contract extension — 6 months", sub: "Your signature required before 12 Aug", flag: null, age: "3 days" },
  { id: "a7", kind: "task", who: "SAP FICO Consultant", vendor: "—", detail: "Interview panel — 2 candidates", sub: "Thursday 14:00 · calendar holds sent", flag: null, age: "today" },
  { id: "a8", kind: "task", who: "Marcus Bell", vendor: "CloudStaff", detail: "Extend or release decision", sub: "Contract ends 30 Aug · decision due in 5 days", flag: "Rolloff notice window opens in 2 days", age: "today" },
];

const DONE_TODAY = [
  { what: "Approved timesheet", who: "Dev Ramanathan", when: "09:14" },
  { what: "Signed onboarding pack", who: "New starter · CND-4417", when: "11:02" },
  { what: "Released rolloff", who: "Tomás Ferreira", when: "14:47" },
];

const CONTRACTS = [
  { id: "k1", name: "Anita Raghavan", role: "SAP FICO Consultant", vendor: "TechVista Consulting", end: "11 Feb 2027", days: 193, rate: "$102/hr", docs: "complete", ts: "current" },
  { id: "k2", name: "James Okonkwo", role: "Network Engineer", vendor: "Apex SAP Solutions", end: "2 Sep 2026", days: 31, rate: "$88/hr", docs: "complete", ts: "1 pending" },
  { id: "k3", name: "Marcus Bell", role: "Data Analyst", vendor: "CloudStaff Inc", end: "30 Aug 2026", days: 28, rate: "$76/hr", docs: "complete", ts: "current" },
  { id: "k4", name: "Sarah Lindqvist", role: "Regulatory Affairs", vendor: "TechBridge Solutions", end: "14 Jan 2027", days: 165, rate: "$91/hr", docs: "2 expiring", ts: "current" },
  { id: "k5", name: "Dev Ramanathan", role: "SAP MM Consultant", vendor: "TechVista Consulting", end: "31 May 2027", days: 302, rate: "$94/hr", docs: "complete", ts: "current" },
];

const FANOUT = [
  { p: "Consultant", via: "via vendor", m: "End date confirmed. Final timesheet due 2 Sept. Equipment return instructions attached." },
  { p: "Vendor", via: "TechVista Consulting", m: "Assignment closes 2 Sept. Final invoice window opens. Consultant enters your Releasing Soon pool automatically." },
  { p: "Procurement / AP", via: "internal", m: "PO closure scheduled. One final invoice expected, approx $14,080. No renewal raised." },
  { p: "IT Security", via: "internal", m: "Access revocation queued for 2 Sept 18:00 — VPN, SAP, Jira, email. Same-day SLA." },
  { p: "Facilities", via: "internal", m: "Badge deactivation and laptop return logged. Collection point: Lakewood reception." },
  { p: "Delivery lead", via: "internal", m: "Knowledge transfer window 26 Aug – 1 Sept. Backfill decision required by 18 Aug." },
];

const DISCOVER = [
  { n: "Meridian Technical", skills: "SAP FICO, MM, SD", region: "Denver, Boulder, Fort Collins", size: "60–80 consultants", note: "Places four SAP consultants at two other Colorado manufacturers.", auth: "78% citizen or GC", compliance: "verified", fit: 92 },
  { n: "Front Range Staffing", skills: "Validation, Quality Systems, CSV", region: "Colorado, Utah", size: "30–50", note: "Medical device focus. FDA-regulated placements only.", auth: "91% citizen or GC", compliance: "verified", fit: 88 },
  { n: "Aspen Data Partners", skills: "Analytics, Power BI, SQL", region: "Denver metro", size: "20–30", note: "Three years old. Two client references available.", auth: "64% citizen or GC", compliance: "pending", fit: 74 },
  { n: "Cascadia Consulting", skills: "SAP FICO, BW, Analytics", region: "Pacific Northwest, remote US", size: "100+", note: "Remote-first. No Colorado presence.", auth: "55% citizen or GC", compliance: "verified", fit: 61 },
];

const VENDORS = [
  { n: "TechVista Consulting", people: 19, fill: "94%", speed: "1.8 days", ret: "18 mo", ok: true },
  { n: "CloudStaff Inc", people: 23, fill: "88%", speed: "2.4 days", ret: "14 mo", ok: true },
  { n: "Apex SAP Solutions", people: 14, fill: "79%", speed: "4.1 days", ret: "9 mo", ok: false },
  { n: "TechBridge Solutions", people: 11, fill: "71%", speed: "5.6 days", ret: "7 mo", ok: false },
];

const MEMORY = [
  { name: "Anita Raghavan", skill: "SAP FICO · Product Costing", dept: "Manufacturing Finance", months: 18, hours: 2880, ext: 2, state: "placed", detail: "On contract here" },
  { name: "Priya Deshmukh", skill: "CSV · Process Validation", dept: "Quality Systems", months: 9, hours: 1440, ext: 1, state: "available", detail: "Available now · TechVista" },
  { name: "Marcus Bell", skill: "SAP FICO · CO-PA", dept: "Supply Chain", months: 11, hours: 1760, ext: 1, state: "available", detail: "Available now · CloudStaff" },
  { name: "Tomás Ferreira", skill: "Automation · PLC", dept: "Manufacturing Ops", months: 15, hours: 2400, ext: 2, state: "available", detail: "Released today · Apex" },
  { name: "Sarah Lindqvist", skill: "Regulatory Affairs", dept: "Quality Systems", months: 7, hours: 1120, ext: 0, state: "placed", detail: "On contract here" },
  { name: "Dev Ramanathan", skill: "SAP MM · Procurement", dept: "Supply Chain", months: 14, hours: 2240, ext: 2, state: "placed", detail: "On contract here" },
];


const MANAGERS = [
  { n: "D. Whitfield",   dept: "Manufacturing Finance", skill: "SAP FICO",        heads: 3,  vendors: 2, spend: "$612k", rate: "$94–102" },
  { n: "A. Nwosu",       dept: "Applications",          skill: ".NET",            heads: 9,  vendors: 4, spend: "$1.84m", rate: "$95–124", flag: "4 vendors for one skill" },
  { n: "K. Ramaswamy",   dept: "Data Platform",         skill: "Databricks",      heads: 5,  vendors: 3, spend: "$1.32m", rate: "$115–148", flag: "widest rate spread on programme" },
  { n: "S. Delacroix",   dept: "Digital Workplace",     skill: "SharePoint",      heads: 4,  vendors: 3, spend: "$798k", rate: "$92–118" },
  { n: "L. Brennan",     dept: "Manufacturing Ops",     skill: "Power BI",        heads: 6,  vendors: 2, spend: "$1.02m", rate: "$88–96" },
  { n: "R. Castellano",  dept: "Infrastructure",        skill: "Network / Cloud", heads: 7,  vendors: 3, spend: "$1.21m", rate: "$78–96" },
  { n: "M. Okafor",      dept: "Quality Systems",       skill: "Validation / CSV",heads: 5,  vendors: 2, spend: "$886k", rate: "$81–88" },
  { n: "T. Nakamura",    dept: "Integration",           skill: ".NET / APIs",     heads: 4,  vendors: 2, spend: "$918k", rate: "$106–124", flag: "same skill as Applications, +22% rate" },
  { n: "P. Lindgren",    dept: "Security",              skill: "Infra / Security",heads: 3,  vendors: 2, spend: "$648k", rate: "$88–104" },
  { n: "J. Mbeki",       dept: "ERP",                   skill: "SAP MM / SD",     heads: 4,  vendors: 1, spend: "$742k", rate: "$91–96" },
];

const VARIANCE = [
  { skill: ".NET",             heads: 13, mgrs: 3, lo: 95,  hi: 124, med: 104, save: "$214k" },
  { skill: "Databricks",       heads: 5,  mgrs: 2, lo: 115, hi: 148, med: 126, save: "$118k" },
  { skill: "SharePoint",       heads: 4,  mgrs: 2, lo: 92,  hi: 118, med: 101, save: "$74k"  },
  { skill: "Power BI",         heads: 6,  mgrs: 2, lo: 88,  hi: 112, med: 94,  save: "$92k"  },
  { skill: "Network / Cloud",  heads: 7,  mgrs: 2, lo: 78,  hi: 96,  med: 86,  save: "$58k"  },
];

const VENDOR_TAIL = [
  { tier: "preferred", label: "MSA, volume, negotiated rates", rows: [
    { n: "TechVista Consulting", pl: 19, mgrs: 4, skills: "SAP, Validation" },
    { n: "CloudStaff Inc",       pl: 23, mgrs: 5, skills: "Data, Power BI, .NET" },
    { n: "Apex SAP Solutions",   pl: 14, mgrs: 3, skills: "SAP, Infrastructure" },
    { n: "TechBridge Solutions", pl: 11, mgrs: 3, skills: "Regulatory, Quality" },
  ]},
  { tier: "occasional", label: "2–4 placements, MSA in place", rows: [
    { n: "Summit Technical",     pl: 4, mgrs: 2, skills: ".NET, Integration" },
    { n: "Aspen Data Partners",  pl: 3, mgrs: 1, skills: "Databricks, Power BI" },
    { n: "Front Range Staffing", pl: 3, mgrs: 1, skills: "Validation" },
    { n: "Cirrus Cloud Group",   pl: 2, mgrs: 1, skills: "Network, Cloud" },
  ]},
  { tier: "one-time", label: "Single placement. Full onboarding cost, no leverage.", rows: [
    { n: "Bluepeak Digital",     pl: 1, mgrs: 1, skills: "SharePoint" },
    { n: "Vertex IT Partners",   pl: 1, mgrs: 1, skills: ".NET" },
    { n: "Nova Analytics",       pl: 1, mgrs: 1, skills: "Databricks" },
    { n: "Redstone Systems",     pl: 1, mgrs: 1, skills: "Infrastructure" },
    { n: "Halcyon Consulting",   pl: 1, mgrs: 1, skills: "SharePoint" },
    { n: "Trailhead Tech",       pl: 1, mgrs: 1, skills: "Power BI" },
  ]},
];

const KIND_LABEL: Record<string, string> = { timesheet: "timesheet", expense: "expense", document: "signature", task: "decision" };

export default function ClientOps() {
  const [scope, setScope] = useState<"mine" | "org">("mine");
  const [tab, setTab] = useState<Tab>("today");
  const [cleared, setCleared] = useState<string[]>([]);
  const [rolloff, setRolloff] = useState<(typeof CONTRACTS)[0] | null>(null);
  const [skill, setSkill] = useState("SAP FICO");
  const [region, setRegion] = useState("Colorado");

  const pending = APPROVALS.filter((a) => !cleared.includes(a.id));
  const flagged = pending.filter((a) => a.flag).length;

  const TABS: [Tab, string, number | null][] = scope === "mine"
    ? [
        ["today", "Today", pending.length || null],
        ["contracts", "Contracts", null],
        ["roles", "Open roles", 3],
        ["memory", "Worked here before", null],
        ["vendors", "Vendors", null],
      ]
    : [
        ["org", "Across IT", null],
        ["today", "Approvals", pending.length || null],
        ["memory", "Worked here before", null],
        ["vendors", "Vendors", null],
      ];

  useEffect(() => {
    setTab(scope === "org" ? "org" : "today");
  }, [scope]);

  return (
    <div style={{ background: PAPER, minHeight: "100vh" }}>
      <style>{FONTS}</style>
      <style>{`
        .arch{font-family:'Archivo',system-ui,sans-serif}
        .plex{font-family:'IBM Plex Sans',system-ui,sans-serif}
        .mono{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
        @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .rise{animation:rise .34s cubic-bezier(.2,.7,.3,1) both}
        @media (prefers-reduced-motion:reduce){.rise{animation:none}}
      `}</style>

      <header style={{ borderBottom: `1px solid ${RULE}` }}>
        <div className="max-w-[1160px] mx-auto px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-baseline gap-2.5">
            <span className="arch text-[19px]" style={{ color: INK, fontWeight: 700, letterSpacing: "-0.02em" }}>etyme</span>
            <span className="mono text-[10px] uppercase tracking-[0.16em]" style={{ color: MUTE }}>contingent operations</span>
          </div>
          <div className="h-7 w-px hidden sm:block" style={{ background: RULE }} />
          <div className="flex items-center gap-2.5">
            <span className="plex text-[13px]" style={{ color: INK, fontWeight: 500 }}>Terumo BCT</span>
            <span className="mono text-[11px]" style={{ color: MUTE }}>
              · {scope === "mine" ? "D. Whitfield, Mfg Finance" : "IT — all departments"}
            </span>
            <button onClick={() => setScope(scope === "mine" ? "org" : "mine")}
              className="mono text-[10px] px-2 py-1 transition-opacity hover:opacity-70"
              style={{ border: `1px solid ${RULE}`, color: MUTE, borderRadius: 2 }}>
              {scope === "mine" ? "view all IT" : "view my team"}
            </button>
          </div>
          <div className="flex items-center gap-7 ml-auto">
            <Stat label="needs you" value={String(pending.length)} tone={pending.length ? "hot" : "calm"} />
            <Stat label="exceptions" value={String(flagged)} tone={flagged ? "warn" : "calm"} />
            <Stat label="contractors" value={scope === "mine" ? "8" : "83"} />
            <Stat label="vendors" value={scope === "mine" ? "4" : "14"} tone={scope === "org" ? "warn" : undefined} />
            {scope === "org" && <Stat label="managers" value="10" />}
          </div>
        </div>
      </header>

      <main className="max-w-[1160px] mx-auto px-6 py-8">
        <div className="flex gap-1 mb-7 flex-wrap" style={{ borderBottom: `1px solid ${RULE}` }}>
          {TABS.map(([k, label, count]) => (
            <button key={k} onClick={() => setTab(k)} className="plex text-[13.5px] px-4 py-2.5 -mb-px flex items-center gap-2"
              style={{ color: tab === k ? INK : MUTE, fontWeight: tab === k ? 600 : 450, borderBottom: `2px solid ${tab === k ? INK : "transparent"}` }}>
              {label}
              {count ? <span className="mono text-[10px] px-1.5 py-0.5" style={{ background: tab === k ? INK : RULE, color: tab === k ? PAPER : MUTE }}>{count}</span> : null}
            </button>
          ))}
        </div>

        {/* ═══ TODAY ═══ */}
        {tab === "today" && (
          <div>
            <h1 className="arch text-[27px] sm:text-[32px] leading-[1.12] tracking-[-0.025em] mb-2" style={{ color: INK, fontWeight: 600 }}>
              {pending.length
                ? <>{pending.length} things need you.<span style={{ color: flagged ? WARN : CALM }}> {flagged} have exceptions.</span></>
                : <>Nothing left today.</>}
            </h1>
            <p className="plex text-[14px] leading-[1.6] mb-7 max-w-[640px]" style={{ color: BODY }}>
              Timesheets, expenses, signatures and decisions across every vendor in one queue instead of four
              inboxes. Exceptions are checked against contract terms rather than left for you to notice.
            </p>

            <div className="space-y-2 mb-9">
              {pending.map((a) => (
                <div key={a.id} className="px-5 py-4 flex flex-wrap items-start gap-x-5 gap-y-3"
                  style={{ border: `1px solid ${a.flag ? "#E5CBA8" : RULE}`, background: a.flag ? "#FDF8F0" : "#FFFFFF" }}>
                  <div className="w-[78px] shrink-0 pt-0.5">
                    <span className="mono text-[9.5px] uppercase tracking-[0.12em] px-1.5 py-0.5"
                      style={{ border: `1px solid ${RULE}`, color: MUTE }}>{KIND_LABEL[a.kind]}</span>
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <div className="plex text-[14px]" style={{ color: INK, fontWeight: 550 }}>{a.who}</div>
                    <div className="mono text-[12px] mt-0.5" style={{ color: BODY }}>{a.detail}</div>
                    <div className="mono text-[11.5px] mt-0.5" style={{ color: MUTE }}>{a.sub}{a.vendor !== "—" ? ` · ${a.vendor}` : ""}</div>
                    {a.flag && (
                      <div className="plex text-[12.5px] mt-2 flex items-start gap-2" style={{ color: WARN }}>
                        <span className="mono">!</span>{a.flag}
                      </div>
                    )}
                  </div>
                  <div className="min-w-[64px] mono text-[11.5px] pt-1" style={{ color: MUTE }}>{a.age}</div>
                  <div className="flex gap-2 shrink-0">
                    {a.kind === "task" ? (
                      <button onClick={() => setCleared([...cleared, a.id])} className="plex text-[12.5px] px-3.5 py-2"
                        style={{ background: INK, color: "#fff", borderRadius: 2 }}>Open</button>
                    ) : (
                      <>
                        <button onClick={() => setCleared([...cleared, a.id])} className="plex text-[12.5px] px-3.5 py-2"
                          style={{ background: a.flag ? WARN : CALM, color: "#fff", borderRadius: 2 }}>
                          {a.flag ? "Approve anyway" : "Approve"}
                        </button>
                        <button className="plex text-[12.5px] px-3 py-2" style={{ border: `1px solid ${RULE}`, color: MUTE, borderRadius: 2 }}>Query</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {!pending.length && (
                <div className="px-5 py-10 text-center mono text-[13px]" style={{ border: `1px dashed ${RULE}`, color: MUTE }}>
                  Queue clear. Everything below was completed today.
                </div>
              )}
            </div>

            <div className="mono text-[10px] uppercase tracking-[0.15em] mb-3" style={{ color: MUTE }}>completed today</div>
            <div style={{ border: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              {DONE_TODAY.map((d, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-4" style={{ borderTop: i ? `1px solid ${RULE}` : "none" }}>
                  <span className="mono text-[11px]" style={{ color: CALM }}>✓</span>
                  <span className="plex text-[13px] flex-1" style={{ color: BODY }}>{d.what} — <span style={{ color: INK }}>{d.who}</span></span>
                  <span className="mono text-[11.5px]" style={{ color: MUTE }}>{d.when}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ CONTRACTS ═══ */}
        {tab === "contracts" && (
          <div>
            <h1 className="arch text-[27px] leading-[1.12] tracking-[-0.025em] mb-2" style={{ color: INK, fontWeight: 600 }}>
              Five active contracts. <span style={{ color: WARN }}>Two end within 31 days.</span>
            </h1>
            <p className="plex text-[14px] leading-[1.6] mb-7 max-w-[640px]" style={{ color: BODY }}>
              Ending a contract is one action here instead of six emails. Every party is notified in the same
              instant, and access revocation is scheduled rather than remembered.
            </p>

            <div style={{ border: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              <div className="px-5 py-3 flex flex-wrap gap-x-5 gap-y-1" style={{ borderBottom: `1px solid ${RULE}`, background: PAPER }}>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] flex-1 min-w-[180px]" style={{ color: MUTE }}>contractor</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[150px]" style={{ color: MUTE }}>vendor</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[104px]" style={{ color: MUTE }}>ends</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[88px]" style={{ color: MUTE }}>docs</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[84px]" style={{ color: MUTE }}>timesheet</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[142px]" style={{ color: MUTE }} />
              </div>
              {CONTRACTS.map((k, i) => (
                <div key={k.id} className="px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-2" style={{ borderTop: i ? `1px solid ${RULE}` : "none" }}>
                  <div className="flex-1 min-w-[180px]">
                    <div className="plex text-[14px]" style={{ color: INK, fontWeight: 550 }}>{k.name}</div>
                    <div className="mono text-[11.5px] mt-0.5" style={{ color: MUTE }}>{k.role} · {k.rate}</div>
                  </div>
                  <div className="min-w-[150px] mono text-[12px]" style={{ color: BODY }}>{k.vendor}</div>
                  <div className="min-w-[104px]">
                    <div className="mono text-[12.5px]" style={{ color: k.days < 35 ? WARN : BODY }}>{k.days} days</div>
                    <div className="mono text-[11px] mt-0.5" style={{ color: MUTE }}>{k.end}</div>
                  </div>
                  <div className="min-w-[88px] mono text-[11.5px]" style={{ color: k.docs === "complete" ? CALM : WARN }}>{k.docs}</div>
                  <div className="min-w-[84px] mono text-[11.5px]" style={{ color: k.ts === "current" ? CALM : WARN }}>{k.ts}</div>
                  <div className="min-w-[142px] flex gap-2 justify-end">
                    {k.days < 35 ? (
                      <>
                        <button className="plex text-[12px] px-3 py-1.5" style={{ border: `1px solid ${RULE}`, color: INK, borderRadius: 2 }}>Extend</button>
                        <button onClick={() => setRolloff(k)} className="plex text-[12px] px-3 py-1.5" style={{ background: HOT, color: "#fff", borderRadius: 2 }}>Roll off</button>
                      </>
                    ) : (
                      <button className="plex text-[12px] px-3 py-1.5" style={{ border: `1px solid ${RULE}`, color: MUTE, borderRadius: 2 }}>View</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ OPEN ROLES ═══ */}
        {tab === "roles" && (
          <div>
            <h1 className="arch text-[27px] leading-[1.12] tracking-[-0.025em] mb-2" style={{ color: INK, fontWeight: 600 }}>
              Three open roles. <span style={{ color: CALM }}>Two have people who worked here before.</span>
            </h1>
            <p className="plex text-[14px] leading-[1.6] mb-7 max-w-[640px]" style={{ color: BODY }}>
              People you already know are ranked first, with their record attached — hours approved, who signed
              them off, how many times they were extended. No re-screening.
            </p>
            {[
              { t: "SAP FICO Consultant", d: "Manufacturing Finance · Lakewood · starts 15 Sept · $95–110/hr", alum: "Anita Raghavan — 2,880 hours approved by you, extended twice, available 20 Aug", fit: 96, others: 3 },
              { t: "Validation Engineer", d: "Quality Systems · Lakewood · starts 25 Aug · $78–88/hr", alum: "Priya Deshmukh — 1,440 hours approved by M. Okafor, available now", fit: 91, others: 1 },
              { t: "Data Analyst — Operations", d: "Manufacturing Ops · Denver · starts 1 Oct · $65–75/hr", alum: null, fit: 77, others: 1 },
            ].map((r, i) => (
              <div key={i} className="mb-3 px-5 py-4" style={{ border: `1px solid ${r.alum ? "#BFD8D2" : RULE}`, background: r.alum ? "#F4F9F8" : "#FFFFFF" }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-[240px]">
                    <div className="plex text-[15px]" style={{ color: INK, fontWeight: 550 }}>{r.t}</div>
                    <div className="mono text-[11.5px] mt-1" style={{ color: MUTE }}>{r.d}</div>
                    {r.alum ? (
                      <div className="plex text-[13px] mt-3 leading-[1.5]" style={{ color: CALM }}>
                        <span className="mono text-[9.5px] uppercase tracking-[0.11em] px-1.5 py-0.5 mr-2" style={{ background: CALM, color: "#fff" }}>worked here</span>
                        {r.alum}
                      </div>
                    ) : (
                      <div className="mono text-[12px] mt-3" style={{ color: MUTE }}>No prior contractor matches this profile</div>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="mono text-[22px] leading-none" style={{ color: r.alum ? CALM : INK, fontWeight: 600 }}>{r.fit}</div>
                      <div className="mono text-[9.5px] uppercase mt-1" style={{ color: MUTE }}>best fit</div>
                    </div>
                    <button className="plex text-[12.5px] px-3.5 py-2" style={{ background: r.alum ? CALM : ACT, color: "#fff", borderRadius: 2 }}>
                      {r.alum ? "Ask for them back" : "Review candidates"}
                    </button>
                  </div>
                </div>
                <div className="mono text-[11.5px] mt-3 pt-3" style={{ color: MUTE, borderTop: `1px solid ${RULE}` }}>
                  + {r.others} other candidate{r.others === 1 ? "" : "s"} proposed across your vendors
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ MEMORY ═══ */}
        {tab === "memory" && (
          <div>
            <h1 className="arch text-[27px] leading-[1.12] tracking-[-0.025em] mb-2" style={{ color: INK, fontWeight: 600 }}>
              Forty-one people have worked here. <span style={{ color: CALM }}>Three are available now.</span>
            </h1>
            <p className="plex text-[14px] leading-[1.6] mb-7 max-w-[640px]" style={{ color: BODY }}>
              Hours and extensions come from approved timesheets, not from anyone's claim. Availability comes
              from whichever vendor holds them today, which may not be the one who placed them originally.
            </p>
            <div style={{ border: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              {MEMORY.map((m, i) => (
                <div key={m.name} className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2" style={{ borderTop: i ? `1px solid ${RULE}` : "none" }}>
                  <div className="min-w-[190px] flex-1">
                    <div className="plex text-[14px]" style={{ color: INK, fontWeight: 550 }}>{m.name}</div>
                    <div className="mono text-[11.5px] mt-0.5" style={{ color: MUTE }}>{m.skill}</div>
                  </div>
                  <div className="min-w-[150px] mono text-[12px]" style={{ color: BODY }}>{m.dept}</div>
                  <div className="min-w-[124px]">
                    <div className="mono text-[12px]" style={{ color: BODY }}>{m.months} months</div>
                    <div className="mono text-[11px] mt-0.5" style={{ color: MUTE }}>{m.hours.toLocaleString()} hrs{m.ext ? ` · ${m.ext} ext` : ""}</div>
                  </div>
                  <div className="min-w-[168px] text-right">
                    <div className="mono text-[12px]" style={{ color: m.state === "available" ? CALM : MUTE }}>
                      {m.state === "available" ? "available" : "on contract here"}
                    </div>
                    <div className="mono text-[11px] mt-0.5" style={{ color: MUTE }}>{m.detail}</div>
                  </div>
                  {m.state === "available" && (
                    <button className="plex text-[12px] px-3 py-1.5 shrink-0" style={{ background: CALM, color: "#fff", borderRadius: 2 }}>Ask back</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ VENDORS ═══ */}
        {tab === "vendors" && (
          <div>
            <h1 className="arch text-[27px] leading-[1.12] tracking-[-0.025em] mb-2" style={{ color: INK, fontWeight: 600 }}>
              Four vendors on programme.
            </h1>
            <p className="plex text-[14px] leading-[1.6] mb-6 max-w-[640px]" style={{ color: BODY }}>
              Measured on what happened here, not on what was said in the quarterly review.
            </p>

            <div className="mb-10" style={{ border: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              <div className="px-5 py-3 flex flex-wrap gap-x-6 gap-y-1" style={{ borderBottom: `1px solid ${RULE}`, background: PAPER }}>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[190px] flex-1" style={{ color: MUTE }}>vendor</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[100px]" style={{ color: MUTE }}>people here</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[100px]" style={{ color: MUTE }}>fill rate</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[112px]" style={{ color: MUTE }}>time to submit</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[100px]" style={{ color: MUTE }}>median tenure</span>
              </div>
              {VENDORS.map((v, i) => (
                <div key={v.n} className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2" style={{ borderTop: i ? `1px solid ${RULE}` : "none" }}>
                  <div className="min-w-[190px] flex-1 plex text-[14px]" style={{ color: INK, fontWeight: 500 }}>{v.n}</div>
                  <div className="min-w-[100px] mono text-[13px]" style={{ color: BODY }}>{v.people}</div>
                  <div className="min-w-[100px] mono text-[13px]" style={{ color: v.ok ? CALM : WARN }}>{v.fill}</div>
                  <div className="min-w-[112px] mono text-[13px]" style={{ color: BODY }}>{v.speed}</div>
                  <div className="min-w-[100px] mono text-[13px]" style={{ color: BODY }}>{v.ret}</div>
                </div>
              ))}
            </div>

            <div className="mono text-[10px] uppercase tracking-[0.15em] mb-3" style={{ color: MUTE }}>find new vendors</div>
            <div className="px-5 py-4 mb-4 flex flex-wrap items-end gap-5" style={{ border: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              <label className="flex flex-col gap-1.5">
                <span className="mono text-[9.5px] uppercase tracking-[0.13em]" style={{ color: MUTE }}>skill</span>
                <select value={skill} onChange={(e) => setSkill(e.target.value)} className="plex text-[13px] px-3 py-2"
                  style={{ border: `1px solid ${RULE}`, background: PAPER, color: INK, minWidth: 190, borderRadius: 2 }}>
                  {["SAP FICO", "Validation / CSV", "Data & Analytics", "Network Engineering"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="mono text-[9.5px] uppercase tracking-[0.13em]" style={{ color: MUTE }}>region</span>
                <select value={region} onChange={(e) => setRegion(e.target.value)} className="plex text-[13px] px-3 py-2"
                  style={{ border: `1px solid ${RULE}`, background: PAPER, color: INK, minWidth: 190, borderRadius: 2 }}>
                  {["Colorado", "Mountain West", "Remote US", "Anywhere"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <span className="mono text-[11.5px] pb-2.5" style={{ color: MUTE }}>
                4 match · none currently on your programme
              </span>
            </div>

            <div className="space-y-2.5">
              {DISCOVER.map((d) => (
                <div key={d.n} className="px-5 py-4 flex flex-wrap items-start gap-x-5 gap-y-3" style={{ border: `1px solid ${RULE}`, background: "#FFFFFF" }}>
                  <div className="w-[52px] shrink-0">
                    <div className="mono text-[19px] leading-none" style={{ color: d.fit >= 85 ? CALM : INK, fontWeight: 600 }}>{d.fit}</div>
                    <div className="mono text-[9.5px] uppercase tracking-[0.11em] mt-1" style={{ color: MUTE }}>fit</div>
                  </div>
                  <div className="flex-1 min-w-[230px]">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <span className="plex text-[14.5px]" style={{ color: INK, fontWeight: 550 }}>{d.n}</span>
                      <span className="mono text-[9.5px] uppercase tracking-[0.1em] px-1.5 py-0.5"
                        style={{ border: `1px solid ${d.compliance === "verified" ? CALM : WARN}`, color: d.compliance === "verified" ? CALM : WARN }}>
                        {d.compliance}
                      </span>
                    </div>
                    <div className="mono text-[11.5px] mt-1" style={{ color: BODY }}>{d.skills}</div>
                    <div className="mono text-[11.5px] mt-0.5" style={{ color: MUTE }}>{d.region} · {d.size}</div>
                    <div className="plex text-[12.5px] mt-2 leading-[1.5]" style={{ color: BODY }}>{d.note}</div>
                  </div>
                  <div className="min-w-[126px]">
                    <div className="mono text-[11.5px]" style={{ color: BODY }}>{d.auth}</div>
                    <div className="mono text-[10.5px] mt-0.5" style={{ color: MUTE }}>work authorisation</div>
                  </div>
                  <button className="plex text-[12.5px] px-3.5 py-2 shrink-0" style={{ background: ACT, color: "#fff", borderRadius: 2 }}>
                    Request onboarding
                  </button>
                </div>
              ))}
            </div>
            <p className="mono text-[11.5px] mt-4" style={{ color: MUTE }}>
              Onboarding still needs your MSA and procurement sign-off. Etyme prepares the pack and tracks where it is.
            </p>
          </div>
        )}

        {/* ═══ ACROSS IT ═══ */}
        {tab === "org" && (
          <div>
            <h1 className="arch text-[27px] sm:text-[32px] leading-[1.12] tracking-[-0.025em] mb-2" style={{ color: INK, fontWeight: 600 }}>
              Ten managers. Fourteen vendors.
              <span style={{ color: HOT }}> $556k of avoidable rate variance.</span>
            </h1>
            <p className="plex text-[14px] leading-[1.6] mb-8 max-w-[660px]" style={{ color: BODY }}>
              Each manager found their own vendors and negotiated their own rates. Nobody has seen this
              together before, because it has never existed in one place — it lives across ten inboxes,
              fourteen AP records and a procurement folder.
            </p>

            <div className="grid sm:grid-cols-4 gap-px mb-9" style={{ background: RULE, border: `1px solid ${RULE}` }}>
              {[["Annual run rate", "$15.8m", "across all IT contingent"],
                ["Rate variance found", "$556k", "same skill, different price"],
                ["One-time vendors", "6", "of 14 · full onboarding each"],
                ["Reusable this quarter", "4", "rolling off, matched elsewhere"]].map(([l, v, n], i) => (
                <div key={i} className="px-5 py-5" style={{ background: "#FFFFFF" }}>
                  <div className="mono text-[10px] uppercase tracking-[0.15em]" style={{ color: MUTE }}>{l}</div>
                  <div className="mono text-[26px] leading-none mt-2" style={{ color: i === 1 ? HOT : INK, fontWeight: 600 }}>{v}</div>
                  <div className="plex text-[12px] mt-2" style={{ color: MUTE }}>{n}</div>
                </div>
              ))}
            </div>

            {/* rate variance */}
            <div className="mono text-[10px] uppercase tracking-[0.15em] mb-3" style={{ color: MUTE }}>
              same skill, different price
            </div>
            <div className="mb-9" style={{ border: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              <div className="px-5 py-3 flex flex-wrap gap-x-5 gap-y-1" style={{ borderBottom: `1px solid ${RULE}`, background: PAPER }}>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] flex-1 min-w-[150px]" style={{ color: MUTE }}>skill</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[110px]" style={{ color: MUTE }}>on contract</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[190px]" style={{ color: MUTE }}>rate range</span>
                <span className="mono text-[9.5px] uppercase tracking-[0.13em] min-w-[126px]" style={{ color: MUTE }}>if normalised</span>
              </div>
              {VARIANCE.map((v, i) => {
                const span = v.hi - v.lo;
                return (
                  <div key={v.skill} className="px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3" style={{ borderTop: i ? `1px solid ${RULE}` : "none" }}>
                    <div className="flex-1 min-w-[150px]">
                      <div className="plex text-[14px]" style={{ color: INK, fontWeight: 550 }}>{v.skill}</div>
                      <div className="mono text-[11.5px] mt-0.5" style={{ color: MUTE }}>{v.mgrs} managers buying it separately</div>
                    </div>
                    <div className="min-w-[110px] mono text-[13px]" style={{ color: BODY }}>{v.heads} people</div>
                    <div className="min-w-[190px]">
                      <div className="flex items-baseline gap-2 mono text-[12.5px]" style={{ color: BODY }}>
                        <span>${v.lo}</span>
                        <div className="flex-1 h-[3px] relative" style={{ background: "#E8E4DC" }}>
                          <div className="absolute inset-y-0" style={{ left: "0%", right: "0%", background: `linear-gradient(90deg, ${CALM}, ${HOT})` }} />
                        </div>
                        <span style={{ color: HOT }}>${v.hi}</span>
                      </div>
                      <div className="mono text-[11px] mt-1" style={{ color: MUTE }}>spread ${span}/hr · median ${v.med}</div>
                    </div>
                    <div className="min-w-[126px] text-right mono text-[14px]" style={{ color: CALM, fontWeight: 600 }}>{v.save}</div>
                  </div>
                );
              })}
              <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: `1px solid ${RULE}`, background: PAPER }}>
                <span className="plex text-[12.5px]" style={{ color: BODY }}>
                  Normalising to the median on renewal, not mid-contract. No contract is broken.
                </span>
                <span className="mono text-[14px]" style={{ color: CALM, fontWeight: 600 }}>$556k / yr</span>
              </div>
            </div>

            {/* managers */}
            <div className="mono text-[10px] uppercase tracking-[0.15em] mb-3" style={{ color: MUTE }}>who is buying what</div>
            <div className="mb-9" style={{ border: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              {MANAGERS.map((m, i) => (
                <div key={m.n} className="px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-2" style={{ borderTop: i ? `1px solid ${RULE}` : "none" }}>
                  <div className="min-w-[168px] flex-1">
                    <div className="plex text-[14px]" style={{ color: INK, fontWeight: 550 }}>{m.n}</div>
                    <div className="mono text-[11.5px] mt-0.5" style={{ color: MUTE }}>{m.dept}</div>
                  </div>
                  <div className="min-w-[136px] mono text-[12.5px]" style={{ color: BODY }}>{m.skill}</div>
                  <div className="min-w-[86px] mono text-[12.5px]" style={{ color: BODY }}>{m.heads} heads</div>
                  <div className="min-w-[86px] mono text-[12.5px]" style={{ color: m.vendors > 3 ? WARN : BODY }}>{m.vendors} vendors</div>
                  <div className="min-w-[104px] mono text-[12.5px]" style={{ color: BODY }}>{m.rate}</div>
                  <div className="min-w-[80px] mono text-[12.5px] text-right" style={{ color: INK, fontWeight: 550 }}>{m.spend}</div>
                  {m.flag && (
                    <div className="w-full plex text-[12.5px] flex items-start gap-2 pt-1" style={{ color: WARN }}>
                      <span className="mono">!</span>{m.flag}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* vendor tail */}
            <div className="mono text-[10px] uppercase tracking-[0.15em] mb-3" style={{ color: MUTE }}>the vendor tail</div>
            <div style={{ border: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              {VENDOR_TAIL.map((grp, gi) => (
                <div key={grp.tier} style={{ borderTop: gi ? `1px solid ${RULE}` : "none" }}>
                  <div className="px-5 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ background: PAPER }}>
                    <span className="mono text-[10px] uppercase tracking-[0.13em]"
                      style={{ color: grp.tier === "one-time" ? HOT : grp.tier === "occasional" ? WARN : CALM }}>
                      {grp.tier} · {grp.rows.length}
                    </span>
                    <span className="plex text-[12.5px]" style={{ color: MUTE }}>{grp.label}</span>
                  </div>
                  {grp.rows.map((r) => (
                    <div key={r.n} className="px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-1" style={{ borderTop: `1px solid ${RULE}` }}>
                      <span className="plex text-[13.5px] flex-1 min-w-[180px]" style={{ color: INK }}>{r.n}</span>
                      <span className="mono text-[12px] min-w-[110px]" style={{ color: BODY }}>{r.pl} placement{r.pl === 1 ? "" : "s"}</span>
                      <span className="mono text-[12px] min-w-[104px]" style={{ color: MUTE }}>{r.mgrs} manager{r.mgrs === 1 ? "" : "s"}</span>
                      <span className="mono text-[12px] min-w-[180px]" style={{ color: MUTE }}>{r.skills}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="px-5 py-4" style={{ borderTop: `1px solid ${RULE}`, background: PAPER }}>
                <p className="plex text-[12.5px] leading-[1.6]" style={{ color: BODY }}>
                  Each one-time vendor still required an MSA, a security review, insurance verification, an AP
                  record and onboarding. Six of them account for six placements. Four of those six skills are
                  already covered by a preferred vendor.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {rolloff && <RolloffFanout k={rolloff} onClose={() => setRolloff(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "hot" | "calm" | "warn" }) {
  const c = tone === "hot" ? HOT : tone === "calm" ? CALM : tone === "warn" ? WARN : INK;
  return (
    <div className="flex flex-col">
      <span className="mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: MUTE }}>{label}</span>
      <span className="mono text-[15px] mt-0.5" style={{ color: c, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function RolloffFanout({ k, onClose }: { k: (typeof CONTRACTS)[0]; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!sent) return;
    const t = FANOUT.map((_, i) => setTimeout(() => setStep(i + 1), 380 + i * 300));
    return () => t.forEach(clearTimeout);
  }, [sent]);

  const done = step >= FANOUT.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-auto"
      style={{ background: "rgba(20,24,29,.55)", backdropFilter: "blur(3px)" }}>
      <div className="w-full max-w-[640px]" style={{ background: PAPER, border: `1px solid ${RULE}` }}>
        <div className="px-6 py-5" style={{ borderBottom: `1px solid ${RULE}`, background: "#FFFFFF" }}>
          <div className="mono text-[10px] uppercase tracking-[0.16em]" style={{ color: MUTE }}>end of contract</div>
          <div className="arch text-[22px] tracking-[-0.02em] mt-1.5" style={{ color: INK, fontWeight: 600 }}>{k.name}</div>
          <div className="plex text-[13px] mt-1" style={{ color: BODY }}>{k.role} · {k.vendor} · ends {k.end}</div>
        </div>

        {!sent ? (
          <>
            <div className="px-6 py-5">
              <p className="plex text-[13.5px] leading-[1.6] mb-4" style={{ color: BODY }}>
                Six parties need to know. Today that is six emails you write yourself, and the one most often
                missed is IT — access frequently stays live for weeks after someone has gone.
              </p>
              <div className="space-y-1.5">
                {FANOUT.map((f) => (
                  <div key={f.p} className="px-4 py-2.5 flex items-baseline gap-3" style={{ background: "#FFFFFF", border: `1px solid ${RULE}` }}>
                    <span className="plex text-[13px] min-w-[132px]" style={{ color: INK, fontWeight: 550 }}>{f.p}</span>
                    <span className="mono text-[11.5px]" style={{ color: MUTE }}>{f.via}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              <span className="mono text-[11.5px]" style={{ color: MUTE }}>no backfill raised yet</span>
              <div className="flex gap-2">
                <button onClick={onClose} className="plex text-[13px] px-3.5 py-2" style={{ color: MUTE }}>Cancel</button>
                <button onClick={() => setSent(true)} className="plex text-[13px] px-4 py-2"
                  style={{ background: HOT, color: "#fff", fontWeight: 500, borderRadius: 2 }}>
                  Confirm rolloff — notify all six
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 py-5 space-y-2">
              {FANOUT.map((f, i) => (
                <div key={f.p} className={step > i ? "rise" : ""}
                  style={{ opacity: step > i ? 1 : 0.16, background: "#FFFFFF", border: `1px solid ${step > i ? RULE : "transparent"}`, padding: "12px 15px", transition: "opacity .3s" }}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="mono text-[10px] uppercase tracking-[0.12em]" style={{ color: step > i ? CALM : MUTE }}>
                      {step > i ? "delivered" : "queued"}
                    </span>
                    <span className="plex text-[13.5px]" style={{ color: INK, fontWeight: 550 }}>{f.p}</span>
                    <span className="mono text-[11px]" style={{ color: MUTE }}>{f.via}</span>
                  </div>
                  <div className="plex text-[12.5px] mt-1.5 leading-[1.5]" style={{ color: BODY }}>{f.m}</div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              <span className="mono text-[11.5px]" style={{ color: done ? CALM : MUTE }}>
                {done ? "✓ all six notified · access revocation scheduled 2 Sept 18:00" : "dispatching…"}
              </span>
              <button onClick={onClose} disabled={!done} className="plex text-[13px] px-4 py-2"
                style={{ background: done ? INK : RULE, color: done ? "#fff" : MUTE, fontWeight: 500, borderRadius: 2, cursor: done ? "pointer" : "default" }}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
