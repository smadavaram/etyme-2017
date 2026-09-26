import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────────
   ETYME — ROLLOFF CONSOLE
   Implements BRD v3.7 §16: The Rolloff Event & Internal Mobility
   Reference case from spec: AMAT San Jose → Apple Austin
   ───────────────────────────────────────────────────────────── */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;450;500;600&display=swap');
`;

type Stage = "watching" | "matched" | "claimed" | "fanout" | "redeployed";

interface Consultant {
  id: string;
  name: string;
  skill: string;
  client: string;
  site: string;
  daysLeft: number;
  billRate: number;
  payRate: number;
  visa: "H1B" | "GC" | "OPT" | "Citizen";
  subVendor: string | null;
  pm: string;
  stage: Stage;
}

interface Demand {
  id: string;
  client: string;
  site: string;
  role: string;
  startsInWeeks: number;
  billRate: number;
  pm: string;
  matchFor: string;
  score: number;
  reasons: string[];
}

const SEED: Consultant[] = [
  { id: "c1", name: "Rajesh Kumar",       skill: "SAP FICO",          client: "Applied Materials", site: "San Jose, CA",     daysLeft: 12, billRate: 92, payRate: 61, visa: "H1B",  subVendor: null,            pm: "D. Whitfield", stage: "watching" },
  { id: "c2", name: "Sneha Iyer",         skill: "QA Automation",     client: "Optum",             site: "Eden Prairie, MN", daysLeft: 8,  billRate: 68, payRate: 44, visa: "OPT",  subVendor: "Talentbridge", pm: "M. Okafor",    stage: "watching" },
  { id: "c3", name: "Priya Menon",        skill: "ServiceNow Dev",    client: "Cisco",             site: "San Jose, CA",     daysLeft: 19, billRate: 85, payRate: 56, visa: "H1B",  subVendor: null,            pm: "D. Whitfield", stage: "watching" },
  { id: "c4", name: "Arun Balakrishnan",  skill: "Data Engineering",  client: "Wells Fargo",       site: "Charlotte, NC",    daysLeft: 26, billRate: 78, payRate: 52, visa: "GC",   subVendor: null,            pm: "L. Brennan",   stage: "watching" },
  { id: "c5", name: "Vikram Shah",        skill: "Java Full Stack",   client: "Verizon",           site: "Irving, TX",       daysLeft: 31, billRate: 88, payRate: 58, visa: "H1B",  subVendor: "Nexus IT",     pm: "R. Castellano",stage: "watching" },
];

const DEMAND: Demand[] = [
  { id: "d1", client: "Apple",   site: "Austin, TX",       role: "SAP FICO Consultant",  startsInWeeks: 3, billRate: 98, pm: "K. Ramaswamy", matchFor: "c1", score: 94,
    reasons: ["SAP FICO — exact skill match", "Available 9 days before start", "H1B transfer not required — same employer", "Rate +$6/hr over current"] },
  { id: "d2", client: "Intuit",  site: "Mountain View, CA", role: "ServiceNow Engineer",  startsInWeeks: 4, billRate: 91, pm: "S. Delacroix", matchFor: "c3", score: 88,
    reasons: ["ServiceNow — exact skill match", "Same metro, no relocation", "Available 9 days before start", "Rate +$6/hr over current"] },
  { id: "d3", client: "Truist",  site: "Charlotte, NC",     role: "Data Platform Engineer", startsInWeeks: 5, billRate: 84, pm: "A. Nwosu",   matchFor: "c4", score: 81,
    reasons: ["Data Engineering — strong overlap", "Same metro, no relocation", "GC — no visa gate", "Rate +$6/hr over current"] },
];

const FANOUT_ROLES = [
  { key: "consultant", label: "Consultant",           who: "Direct",              msg: "Assignment ends in 12 days. New role confirmed at Apple, Austin. Onboarding checklist issued." },
  { key: "subvendor",  label: "Sub-vendor",           who: "If applicable",       msg: "End-date confirmed. Final timesheet window opens. Release note attached." },
  { key: "client",     label: "Client PM / Procurement", who: "Applied Materials", msg: "Rolloff acknowledged. Knowledge transfer scheduled. Asset return and access revocation logged." },
  { key: "rmg",        label: "RMG / Delivery Ops",   who: "Internal",            msg: "Redeployment closed. Utilization retained. Bench exposure avoided: $9,760/mo." },
];

/* ── helpers ── */
const monthlyBurn = (c: Consultant) => Math.round(c.payRate * 160);
const fmt = (n: number) => n.toLocaleString("en-US");

export default function RolloffConsole() {
  const [people, setPeople] = useState<Consultant[]>(SEED);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fanoutFor, setFanoutFor] = useState<string | null>(null);
  const [fanoutStep, setFanoutStep] = useState(0);
  const [scale, setScale] = useState<"vendor" | "si">("si");
  const [liveBurn, setLiveBurn] = useState(427000);
  const detailRef = useRef<HTMLDivElement>(null);

  /* bench burn accrues in real time against consultants already unclaimed */
  useEffect(() => {
    setLiveBurn(scale === "si" ? 427000 : 83520);
  }, [scale]);

  useEffect(() => {
    const rate = scale === "si" ? 9.88 : 1.93;
    const t = setInterval(() => setLiveBurn((b) => b + rate), 1000);
    return () => clearInterval(t);
  }, [scale]);

  const org = scale === "si"
    ? { name: "Infosys \u2014 Delivery Unit", label: "delivery unit", headcount: "418", util: "89%", benched: "46", note: "onsite consultants in your unit" }
    : { name: "Hermitage Infotech", label: "vendor", headcount: "104", util: "91%", benched: "9", note: "consultants on billing" };

  /* fan-out sequence */
  useEffect(() => {
    if (!fanoutFor) return;
    setFanoutStep(0);
    const timers = FANOUT_ROLES.map((_, i) =>
      setTimeout(() => setFanoutStep(i + 1), 420 + i * 340)
    );
    const done = setTimeout(() => {
      setPeople((p) => p.map((c) => (c.id === fanoutFor ? { ...c, stage: "redeployed" } : c)));
    }, 420 + FANOUT_ROLES.length * 340 + 500);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, [fanoutFor]);

  const setStage = (id: string, stage: Stage) =>
    setPeople((p) => p.map((c) => (c.id === id ? { ...c, stage } : c)));

  const exposure = people
    .filter((c) => c.stage !== "redeployed")
    .reduce((s, c) => s + monthlyBurn(c), 0);

  const redeployed = people.filter((c) => c.stage === "redeployed");
  const avoided = redeployed.reduce((s, c) => s + monthlyBurn(c), 0);

  const open = people.find((c) => c.id === openId) || null;
  const match = open ? DEMAND.find((d) => d.matchFor === open.id) || null : null;

  return (
    <div style={{ background: PAPER, minHeight: "100vh" }} className="w-full">
      <style>{FONTS}</style>
      <style>{`
        .arch { font-family: 'Archivo', system-ui, sans-serif; }
        .plex { font-family: 'IBM Plex Sans', system-ui, sans-serif; }
        .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
        @keyframes riseIn { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
        @keyframes pulseRing { 0% { box-shadow: 0 0 0 0 rgba(217,72,15,.35) } 70% { box-shadow: 0 0 0 12px rgba(217,72,15,0) } 100% { box-shadow: 0 0 0 0 rgba(217,72,15,0) } }
        .rise { animation: riseIn .38s cubic-bezier(.2,.7,.3,1) both; }
        .ring { animation: pulseRing 2.4s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .rise, .ring { animation: none !important } }
      `}</style>

      {/* ── masthead ── */}
      <header style={{ borderBottom: `1px solid ${RULE}` }}>
        <div className="max-w-[1180px] mx-auto px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-baseline gap-2.5">
            <span className="arch text-[19px] font-700 tracking-[-0.02em]" style={{ color: INK, fontWeight: 700 }}>etyme</span>
            <span className="mono text-[10px] uppercase tracking-[0.16em]" style={{ color: MUTE }}>rolloff console</span>
          </div>

          <div className="h-7 w-px hidden sm:block" style={{ background: RULE }} />

          <div className="flex items-center gap-2.5">
            <span className="mono text-[10px] uppercase tracking-[0.14em]" style={{ color: MUTE }}>{org.label}</span>
            <span className="plex text-[13px]" style={{ color: INK, fontWeight: 500 }}>{org.name}</span>
            <button
              onClick={() => setScale(scale === "si" ? "vendor" : "si")}
              className="mono text-[10px] px-2 py-1 transition-opacity hover:opacity-70"
              style={{ border: `1px solid ${RULE}`, color: MUTE, borderRadius: 2 }}
            >
              switch
            </button>
          </div>

          <div className="flex items-center gap-7 ml-auto">
            <Stat label="utilization" value={org.util} tone="calm" />
            <Stat label="bench burn / mo" value={`$${fmt(Math.round(liveBurn))}`} tone="hot" live />
            <Stat label={org.note} value={org.headcount} tone="calm" />
            <Stat label="releasing ≤ 4wk" value={String(people.filter(c => c.stage !== "redeployed").length)} tone="warn" />
          </div>
        </div>
      </header>

      <main className="max-w-[1180px] mx-auto px-6 py-9">

        {/* ── thesis ── */}
        <div className="mb-9 max-w-[720px]">
          <h1 className="arch text-[30px] sm:text-[38px] leading-[1.08] tracking-[-0.025em]" style={{ color: INK, fontWeight: 600 }}>
            {scale === "si"
              ? `${org.benched} of your ${org.headcount} are on bench right now.`
              : `Five of your ${org.headcount} come off contract this month.`}
            <span style={{ color: HOT }}>
              {scale === "si" ? " Most were predictable four weeks out." : " Nothing in your system knows."}
            </span>
          </h1>
          <p className="plex text-[14.5px] leading-[1.65] mt-4" style={{ color: BODY }}>
            {scale === "si"
              ? "Utilization is what you are measured on, and rolloff is where it leaks. Etyme fires four weeks before end date, matches against open demand across the unit before anyone hits bench, and routes the claim to the PM who needs them."
              : "When an assignment ends, the consultant waits, the PM hires externally, and the bench clock starts. Etyme fires four weeks early — matches against open internal demand, routes a claim, and fans the confirmed rolloff out to every party at once."}
          </p>
          {scale === "si" && (
            <p className="mono text-[11.5px] mt-3" style={{ color: MUTE }}>
              showing 5 releasing this month with live internal matches \u00b7 sample of 47
            </p>
          )}
        </div>

        {/* ── exposure ledger ── */}
        <div className="grid sm:grid-cols-3 gap-px mb-9" style={{ background: RULE, border: `1px solid ${RULE}` }}>
          <Ledger label="Exposure if unclaimed" value={`$${fmt(exposure)}`} unit="/mo" tone="hot"
                  note={`${people.filter(c=>c.stage!=='redeployed').length} releasing × loaded pay rate — on top of 9 already benched`} />
          <Ledger label="Redeployed internally" value={String(redeployed.length)} unit={`of ${people.length}`} tone="calm"
                  note={redeployed.length ? "Claimed before end date" : "None yet — claim one below"} />
          <Ledger label="Burn avoided" value={`$${fmt(avoided)}`} unit="/mo" tone="calm"
                  note={avoided ? "Recurring, per month" : "Rises with each claim"} />
        </div>

        {/* ── pipeline ── */}
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="mono text-[10.5px] uppercase tracking-[0.16em]" style={{ color: MUTE }}>
            releasing soon — supply pool
          </h2>
          <span className="mono text-[10.5px]" style={{ color: MUTE }}>T-4 weeks · §16.2</span>
        </div>

        <div style={{ border: `1px solid ${RULE}` }}>
          {people.map((c, i) => (
            <Row
              key={c.id}
              c={c}
              first={i === 0}
              isOpen={openId === c.id}
              onToggle={() => { setOpenId(openId === c.id ? null : c.id); }}
            />
          ))}
        </div>

        {/* ── detail ── */}
        {open && (
          <div ref={detailRef} className="rise mt-7" style={{ border: `1px solid ${RULE}` }}>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${RULE}`, background: "#FFFFFF" }}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="arch text-[20px] tracking-[-0.02em]" style={{ color: INK, fontWeight: 600 }}>{open.name}</span>
                <span className="mono text-[12px]" style={{ color: MUTE }}>
                  {open.skill} · {open.client} · {open.site}
                </span>
              </div>
            </div>

            {/* workflow spine */}
            <div className="px-6 py-6" style={{ background: "#FFFFFF" }}>
              <Spine stage={open.stage} />
            </div>

            {/* forecast match */}
            {match && open.stage !== "redeployed" && (
              <div className="px-6 pb-6" style={{ background: "#FFFFFF" }}>
                <div className="mono text-[10.5px] uppercase tracking-[0.16em] mb-3" style={{ color: MUTE }}>
                  forecast match — open internal demand
                </div>

                <div style={{ border: `1px solid ${RULE}` }}>
                  <div className="px-5 py-4 flex flex-wrap items-start gap-x-6 gap-y-3">
                    <div className="min-w-[190px]">
                      <div className="plex text-[15px]" style={{ color: INK, fontWeight: 550 }}>{match.role}</div>
                      <div className="mono text-[12px] mt-1" style={{ color: BODY }}>
                        {match.client} · {match.site}
                      </div>
                      <div className="mono text-[11.5px] mt-1.5" style={{ color: MUTE }}>
                        starts in {match.startsInWeeks} weeks · ${match.billRate}/hr
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="mono text-[26px] leading-none" style={{ color: CALM, fontWeight: 600 }}>{match.score}</div>
                      <div className="mono text-[10px] uppercase leading-[1.4]" style={{ color: MUTE }}>match<br/>score</div>
                    </div>

                    <ul className="flex-1 min-w-[240px] space-y-1">
                      {match.reasons.map((r) => (
                        <li key={r} className="plex text-[12.5px] flex gap-2" style={{ color: BODY }}>
                          <span className="mono" style={{ color: CALM }}>+</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="px-5 py-3.5 flex flex-wrap items-center gap-3" style={{ borderTop: `1px solid ${RULE}`, background: PAPER }}>
                    {open.stage === "watching" && (
                      <Btn onClick={() => setStage(open.id, "matched")}>Surface to internal PMs</Btn>
                    )}
                    {open.stage === "matched" && (
                      <>
                        <Btn onClick={() => setStage(open.id, "claimed")}>
                          Claim for {match.client} — {match.pm}
                        </Btn>
                        <span className="mono text-[11.5px]" style={{ color: MUTE }}>
                          visible to 4 PMs · console_internal
                        </span>
                      </>
                    )}
                    {open.stage === "claimed" && (
                      <>
                        <Btn tone="hot" onClick={() => setFanoutFor(open.id)}>Execute rolloff — fan out</Btn>
                        <span className="mono text-[11.5px]" style={{ color: CALM }}>
                          ✓ compliance gate cleared · visa, I-9, client docs
                        </span>
                      </>
                    )}
                    {(open.stage as Stage) === "redeployed" && (
                      <span className="mono text-[12px]" style={{ color: CALM }}>
                        ✓ redeployed — {match.client}, {match.site} · burn avoided ${fmt(monthlyBurn(open))}/mo
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!match && (
              <div className="px-6 pb-6" style={{ background: "#FFFFFF" }}>
                <div className="px-5 py-4 mono text-[12.5px]" style={{ border: `1px dashed ${RULE}`, color: MUTE }}>
                  No internal demand matches this profile. Unclaimed at end date → bench_paid,
                  burn clock starts at <span style={{ color: HOT }}>${fmt(monthlyBurn(open))}/mo</span>.
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── fan-out overlay ── */}
      {fanoutFor && (
        <Fanout
          step={fanoutStep}
          consultant={people.find((c) => c.id === fanoutFor)!}
          onClose={() => { setFanoutFor(null); }}
        />
      )}
    </div>
  );
}

/* ─────────────── palette ─────────────── */
const PAPER = "#F7F6F3";
const INK   = "#14181D";
const BODY  = "#3D454E";
const MUTE  = "#8A9199";
const RULE  = "#DFDCD5";
const HOT   = "#C2410C";
const CALM  = "#0B7A6B";
const ACT   = "#2F3AC4";

/* ─────────────── pieces ─────────────── */

function Stat({ label, value, tone, live }: { label: string; value: string; tone: "hot" | "calm" | "warn"; live?: boolean }) {
  const color = tone === "hot" ? HOT : tone === "calm" ? CALM : INK;
  return (
    <div className="flex flex-col">
      <span className="mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: MUTE }}>{label}</span>
      <span className="mono text-[15px] mt-0.5 flex items-center gap-1.5" style={{ color, fontWeight: 600 }}>
        {value}
        {live && <span className="w-1.5 h-1.5 rounded-full ring" style={{ background: HOT }} />}
      </span>
    </div>
  );
}

function Ledger({ label, value, unit, tone, note }: { label: string; value: string; unit: string; tone: "hot" | "calm"; note: string }) {
  return (
    <div className="px-5 py-5" style={{ background: "#FFFFFF" }}>
      <div className="mono text-[10px] uppercase tracking-[0.15em]" style={{ color: MUTE }}>{label}</div>
      <div className="flex items-baseline gap-1.5 mt-2">
        <span className="mono text-[27px] leading-none" style={{ color: tone === "hot" ? HOT : CALM, fontWeight: 600 }}>{value}</span>
        <span className="mono text-[12px]" style={{ color: MUTE }}>{unit}</span>
      </div>
      <div className="plex text-[12px] mt-2" style={{ color: MUTE }}>{note}</div>
    </div>
  );
}

function Row({ c, first, isOpen, onToggle }: { c: Consultant; first: boolean; isOpen: boolean; onToggle: () => void }) {
  const done = c.stage === "redeployed";
  const urgent = c.daysLeft <= 12 && !done;

  return (
    <button
      onClick={onToggle}
      className="w-full text-left px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-2 transition-colors"
      style={{
        borderTop: first ? "none" : `1px solid ${RULE}`,
        background: isOpen ? "#FFFFFF" : done ? "#FBFDFC" : "#FFFFFF",
      }}
    >
      {/* countdown */}
      <div className="w-[62px] shrink-0">
        <div className="mono text-[19px] leading-none" style={{ color: done ? CALM : urgent ? HOT : INK, fontWeight: 600 }}>
          {done ? "✓" : c.daysLeft}
        </div>
        <div className="mono text-[9.5px] uppercase tracking-[0.12em] mt-1" style={{ color: MUTE }}>
          {done ? "placed" : "days"}
        </div>
      </div>

      {/* identity */}
      <div className="min-w-[168px] flex-1">
        <div className="plex text-[14.5px]" style={{ color: INK, fontWeight: 550 }}>{c.name}</div>
        <div className="mono text-[11.5px] mt-0.5" style={{ color: MUTE }}>{c.skill}</div>
      </div>

      {/* assignment */}
      <div className="min-w-[168px] flex-1">
        <div className="plex text-[13px]" style={{ color: BODY }}>{c.client}</div>
        <div className="mono text-[11.5px] mt-0.5" style={{ color: MUTE }}>{c.site}</div>
      </div>

      {/* commercial */}
      <div className="min-w-[92px]">
        <div className="mono text-[13px]" style={{ color: BODY }}>${c.billRate}/hr</div>
        <div className="mono text-[11px] mt-0.5" style={{ color: MUTE }}>{c.visa}{c.subVendor ? " · C2C" : ""}</div>
      </div>

      {/* exposure */}
      <div className="min-w-[104px] text-right">
        <div className="mono text-[13px]" style={{ color: done ? CALM : HOT, fontWeight: 550 }}>
          {done ? "avoided" : `$${fmt(monthlyBurn(c))}`}
        </div>
        <div className="mono text-[10px] mt-0.5 uppercase tracking-[0.1em]" style={{ color: MUTE }}>
          {done ? "recurring" : "if unclaimed"}
        </div>
      </div>

      <span className="mono text-[13px] w-4 text-right" style={{ color: MUTE }}>{isOpen ? "−" : "+"}</span>
    </button>
  );
}

const STEPS = [
  { k: "watching",   n: "End signal",      d: "T-4 weeks" },
  { k: "matched",    n: "Forecast match",  d: "Before bench" },
  { k: "claimed",    n: "Internal claim",  d: "PM + RMG" },
  { k: "fanout",     n: "Compliance gate", d: "Visa · docs" },
  { k: "redeployed", n: "Fan-out",         d: "4 parties" },
];

function Spine({ stage }: { stage: Stage }) {
  const order: Stage[] = ["watching", "matched", "claimed", "fanout", "redeployed"];
  const at = order.indexOf(stage);

  return (
    <div className="flex flex-wrap gap-y-4">
      {STEPS.map((s, i) => {
        const state = i < at ? "done" : i === at ? "now" : "next";
        const color = state === "done" ? CALM : state === "now" ? ACT : MUTE;
        return (
          <div key={s.k} className="flex items-start gap-3 pr-7">
            <div className="flex flex-col items-center pt-0.5">
              <div
                className="w-[9px] h-[9px] rounded-full"
                style={{
                  background: state === "next" ? "transparent" : color,
                  border: `1.5px solid ${color}`,
                }}
              />
              {i < STEPS.length - 1 && <div className="w-px h-4 mt-1" style={{ background: RULE }} />}
            </div>
            <div>
              <div className="plex text-[13px] leading-tight" style={{ color: state === "next" ? MUTE : INK, fontWeight: state === "now" ? 600 : 450 }}>
                {s.n}
              </div>
              <div className="mono text-[10.5px] mt-0.5" style={{ color: MUTE }}>{s.d}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Btn({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone?: "hot" }) {
  return (
    <button
      onClick={onClick}
      className="plex text-[13px] px-4 py-2 transition-opacity hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ background: tone === "hot" ? HOT : ACT, color: "#fff", fontWeight: 500, borderRadius: 2 }}
    >
      {children}
    </button>
  );
}

function Fanout({ step, consultant, onClose }: { step: number; consultant: Consultant; onClose: () => void }) {
  const complete = step >= FANOUT_ROLES.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-auto"
         style={{ background: "rgba(20,24,29,.55)", backdropFilter: "blur(3px)" }}>
      <div className="w-full max-w-[680px]" style={{ background: PAPER, border: `1px solid ${RULE}` }}>

        <div className="px-6 py-5" style={{ borderBottom: `1px solid ${RULE}`, background: "#FFFFFF" }}>
          <div className="mono text-[10px] uppercase tracking-[0.16em]" style={{ color: MUTE }}>
            §16.2 step 6 — rolloff execution
          </div>
          <div className="arch text-[22px] tracking-[-0.02em] mt-1.5" style={{ color: INK, fontWeight: 600 }}>
            Simultaneous fan-out
          </div>
          <div className="plex text-[13px] mt-1.5" style={{ color: BODY }}>
            {consultant.name} · every party notified in the same instant, each with role-appropriate content.
          </div>
        </div>

        <div className="px-6 py-5 space-y-2.5">
          {FANOUT_ROLES.map((r, i) => {
            const shown = step > i;
            const skipped = r.key === "subvendor" && !consultant.subVendor;
            return (
              <div
                key={r.key}
                className={shown ? "rise" : ""}
                style={{
                  opacity: shown ? 1 : 0.18,
                  background: "#FFFFFF",
                  border: `1px solid ${shown ? RULE : "transparent"}`,
                  padding: "13px 16px",
                  transition: "opacity .3s",
                }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="mono text-[10px] uppercase tracking-[0.13em]" style={{ color: shown ? CALM : MUTE }}>
                    {shown ? "delivered" : "queued"}
                  </span>
                  <span className="plex text-[13.5px]" style={{ color: INK, fontWeight: 550 }}>{r.label}</span>
                  <span className="mono text-[11px]" style={{ color: MUTE }}>
                    {r.key === "client" ? consultant.client : r.who}
                  </span>
                </div>
                <div className="plex text-[12.5px] mt-1.5 leading-[1.55]" style={{ color: skipped ? MUTE : BODY }}>
                  {skipped ? "No sub-vendor on this assignment — step skipped." : r.msg}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
             style={{ borderTop: `1px solid ${RULE}`, background: "#FFFFFF" }}>
          <div className="mono text-[11.5px]" style={{ color: complete ? CALM : MUTE }}>
            {complete
              ? "✓ deboard checklist issued · knowledge transfer, assets, access, final timesheet"
              : "dispatching…"}
          </div>
          <button
            onClick={onClose}
            disabled={!complete}
            className="plex text-[13px] px-4 py-2"
            style={{
              background: complete ? INK : RULE,
              color: complete ? "#fff" : MUTE,
              fontWeight: 500, borderRadius: 2,
              cursor: complete ? "pointer" : "default",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
