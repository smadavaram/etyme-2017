import { useState } from "react";
import { Check, ChevronRight, Search, Upload, Building2 } from "lucide-react";

const T = {
  canvas: "#F0EEE6", surface: "#FBFAF7", raised: "#FFFFFF",
  ink: "#1F1E1D", muted: "#6B6862", faint: "#9C9891", rule: "#E3DFD5",
  action: "#2B47E5", attention: "#C0622E", verified: "#4F6F52",
  serif: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif',
  sans: '"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
};

const CSS = `
*{box-sizing:border-box}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
input,select{font-family:inherit}
.wrap{max-width:900px;margin:0 auto;padding:0 24px}
.wide{max-width:1140px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.split{display:flex;justify-content:space-between;align-items:center;gap:16px}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#9C9891;font-weight:600;padding:9px 10px;border-bottom:1px solid #E3DFD5;white-space:nowrap}
.tbl td{padding:9px 10px;border-bottom:1px solid #EDE9DF;vertical-align:middle}
.num{font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto}
.steps{display:flex;gap:6px;flex-wrap:wrap}
@media (max-width:820px){
  .g2,.g4{grid-template-columns:1fr}
  .split{flex-direction:column;align-items:stretch}
  .wrap{padding:0 16px}
  .hide-sm{display:none}
}
`;

function Mark({ h = 22 }) {
  return (
    <svg height={h} width={h * 2.42} viewBox="-15 35 615 250" style={{ display: "block", overflow: "visible" }}>
      <defs><linearGradient id="om" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#22B5E8" /><stop offset="55%" stopColor="#2A6BE8" /><stop offset="100%" stopColor="#2B41E4" />
      </linearGradient></defs>
      <g fill="none" stroke={T.ink} strokeWidth="30" strokeLinecap="round" strokeLinejoin="round">
        <path d="M110 150 L10 150 A50 50 0 1 1 97 182" /><path d="M150 55 L150 172 A26 26 0 0 0 176 198" />
        <path d="M208 100 L258 196" /><path d="M304 100 L256 198 C244 236 232 258 208 256" />
        <path d="M332 100 L332 200" /><path d="M332 133 A29 29 0 0 1 390 133 L390 200" />
        <path d="M390 133 A29 29 0 0 1 448 133 L448 200" /><path d="M570 150 L470 150 A50 50 0 1 1 557 182" />
      </g>
      <polygon points="112,106 208,88 208,120 112,138" fill="url(#om)" />
    </svg>
  );
}

function Lbl({ children, c }) {
  return <div style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: c || T.faint, fontWeight: 600 }}>{children}</div>;
}
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Lbl>{label}</Lbl>
      <div style={{ marginTop: 7 }}>{children}</div>
      {hint ? <div style={{ fontSize: 12, color: T.faint, marginTop: 6, lineHeight: 1.55 }}>{hint}</div> : null}
    </div>
  );
}
const inp = { width: "100%", height: 44, borderRadius: 6, border: "1px solid " + T.rule, background: T.surface, padding: "0 14px", fontSize: 14.5, outline: "none", color: T.ink };
function Chip({ children, tone }) {
  const m = { a: ["#F7EDE6", T.attention, "#E5C9B5"], v: ["#EDF1ED", T.verified, "#C9D6CA"], b: ["#EDEFFC", T.action, "#C7CDF5"], p: ["#F2F0EA", T.muted, T.rule] };
  const s = m[tone] || m.p;
  return <span style={{ fontSize: 10.5, fontWeight: 500, padding: "2px 7px", borderRadius: 4, background: s[0], color: s[1], border: "1px solid " + s[2], whiteSpace: "nowrap" }}>{children}</span>;
}

const PACKS = [
  { id: "us", n: "US IT staffing", d: "W2, 1099 and corp-to-corp. Biweekly timesheets, monthly invoicing, W9 and I-9, H1B compliance gates on." },
  { id: "sap", n: "US SAP consulting", d: "Everything above, plus a skill graph seeded with FICO, BRIM, BTE, RAR, S/4, PP-PI and IS-Retail." },
  { id: "in", n: "India delivery centre", d: "INR payroll, fixed-term contracts, PF and ESI hooks, offshore rate tiers." },
  { id: "uk", n: "UK staffing", d: "IR35 determination on every assignment, Skilled Worker visa types, GBP, right-to-work checklist." },
];

const ROWS = [
  { n: "Rajesh Venkataraman", sk: "SAP BRIM, BTE", rate: 125, visa: "H1B", st: "On assignment", ok: true },
  { n: "Priya Deshmukh", sk: "SAP FICO, RAR", rate: 110, visa: "GC", st: "On assignment", ok: true },
  { n: "Carlos Rivera", sk: "SAP S/4 Migration", rate: 105, visa: "US citizen", st: "Bench", ok: true },
  { n: "Anil Sharma", sk: "IS-Retail, CAR", rate: 85, visa: "H1B", st: "Bench", ok: true },
  { n: "Deepa Krishnan", sk: "SAP BRIM", rate: 115, visa: "H1B", st: "On assignment", ok: true },
  { n: "Wei Zhang", sk: "SAP BW/BI", rate: null, visa: "H1B", st: "On assignment", ok: false, issue: "No rate in the file" },
  { n: "Mike Patterson", sk: "PP-PI, QM", rate: 95, visa: null, st: "Bench", ok: false, issue: "Work authorisation blank" },
  { n: "Alisha Patel", sk: "SAP QM", rate: 88, visa: "GC", st: null, ok: false, issue: "Status unclear — column read as 'act'" },
];

const MS = (
  <svg width="17" height="17" viewBox="0 0 23 23"><path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/></svg>
);
const GG = (
  <svg width="17" height="17" viewBox="0 0 48 48"><path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.5 5-4.4 7l6.7 5.2C42.2 36 45 30.6 45 24z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.9-12.5-9.2l-7.1 5.5C8 41 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.5 28.3c-.5-1.4-.7-2.8-.7-4.3s.3-3 .7-4.3l-7.1-5.5C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.8l7.1-5.5z"/><path fill="#EA4335" d="M24 9.5c3.3 0 5.5 1.4 6.8 2.6l5.9-5.8C33.1 3 29.2 1 24 1 15.4 1 8 6 4.4 14.2l7.1 5.5C13.3 13.4 18.2 9.5 24 9.5z"/></svg>
);

function AuthBtn({ icon, label, sub, onClick, primary }) {
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", height: 54, padding: "0 18px", borderRadius: 6, marginBottom: 10, background: T.surface, border: "1px solid " + (primary ? T.action : T.rule) }}>
      <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 500 }}>{label}</span>
        {sub ? <span style={{ display: "block", fontSize: 11.5, color: T.faint, marginTop: 2 }}>{sub}</span> : null}
      </span>
      <ChevronRight size={15} color={T.faint} />
    </button>
  );
}

function SignIn({ mode, setMode, onDone }) {
  const [code, setCode] = useState(false);
  return (
    <div style={{ maxWidth: 440 }}>
      <div style={{ display: "flex", gap: 7, marginBottom: 28 }}>
        {[["biz", "I run a business"], ["cand", "I am a consultant"]].map(function (o) {
          const on = mode === o[0];
          return (
            <button key={o[0]} onClick={function () { setMode(o[0]); setCode(false); }}
              style={{ padding: "8px 15px", borderRadius: 18, fontSize: 13, fontWeight: on ? 600 : 400, background: on ? T.ink : T.surface, color: on ? T.canvas : T.muted, border: on ? "none" : "1px solid " + T.rule }}>
              {o[1]}
            </button>
          );
        })}
      </div>

      {mode === "biz" ? (
        <div>
          <h1 style={{ fontFamily: T.serif, fontSize: 32, letterSpacing: "-.02em", lineHeight: 1.15 }}>Sign in with what you already use</h1>
          <p style={{ fontSize: 14.5, color: T.muted, marginTop: 10, lineHeight: 1.7, marginBottom: 26 }}>
            No new password. Signing in this way also confirms your company domain, so we do not have to ask you to prove it later.
          </p>
          <AuthBtn icon={MS} label="Continue with Microsoft" sub="Microsoft 365, Entra ID or Active Directory" primary onClick={onDone} />
          <AuthBtn icon={GG} label="Continue with Google" sub="Google Workspace" onClick={onDone} />
          <AuthBtn icon={<Building2 size={17} color={T.muted} />} label="Use your company sign-on" sub="SAML or OIDC, for larger programmes" onClick={onDone} />
          <div style={{ textAlign: "center", margin: "18px 0", fontSize: 12.5, color: T.faint }}>or</div>
          <input placeholder="you@yourcompany.com" style={inp} />
          <button onClick={onDone} style={{ width: "100%", height: 48, marginTop: 10, borderRadius: 6, background: T.action, color: "#fff", fontSize: 15, fontWeight: 500 }}>
            Email me a sign-in link
          </button>
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 20, lineHeight: 1.65 }}>
            If your team lives in Teams, Etyme installs there too &mdash; approvals, rolloff alerts and requirement replies come to the channel you are already in.
          </div>
        </div>
      ) : (
        <div>
          <h1 style={{ fontFamily: T.serif, fontSize: 32, letterSpacing: "-.02em", lineHeight: 1.15 }}>No password, ever</h1>
          <p style={{ fontSize: 14.5, color: T.muted, marginTop: 10, lineHeight: 1.7, marginBottom: 26 }}>
            Personal email is fine and expected. Your record belongs to you, not to whoever is marketing you this year.
          </p>
          {!code ? (
            <div>
              <AuthBtn icon={GG} label="Continue with Google" sub="Gmail" primary onClick={onDone} />
              <div style={{ textAlign: "center", margin: "18px 0", fontSize: 12.5, color: T.faint }}>or</div>
              <input placeholder="you@yahoo.com" style={inp} />
              <button onClick={function () { setCode(true); }} style={{ width: "100%", height: 48, marginTop: 10, borderRadius: 6, background: T.action, color: "#fff", fontSize: 15, fontWeight: 500 }}>
                Email me a six digit code
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 14, marginBottom: 14, lineHeight: 1.6 }}>
                Sent to <strong>rajesh.v@yahoo.com</strong>. It expires in ten minutes.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[0, 1, 2, 3, 4, 5].map(function (i) {
                  return <input key={i} maxLength={1} className="num"
                    style={{ width: "100%", height: 56, textAlign: "center", fontSize: 22, borderRadius: 6, border: "1px solid " + T.rule, background: T.surface, outline: "none" }} />;
                })}
              </div>
              <button onClick={onDone} style={{ width: "100%", height: 48, marginTop: 14, borderRadius: 6, background: T.action, color: "#fff", fontSize: 15, fontWeight: 500 }}>Continue</button>
              <button onClick={function () { setCode(false); }} style={{ fontSize: 13, color: T.muted, marginTop: 14, textDecoration: "underline" }}>Use a different address</button>
            </div>
          )}
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 22, lineHeight: 1.65 }}>
            Sign in later with a work address and it joins the same record rather than starting a new one. One person, several ways in.
          </div>
        </div>
      )}
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState("biz");
  const [pack, setPack] = useState("sap");
  const [email, setEmail] = useState("sharath@techvista.com");
  const [slug, setSlug] = useState("techvista");
  const [imported, setImported] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState([]);

  const domain = email.split("@")[1] || "";
  const isPersonal = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "rediffmail.com"].indexOf(domain) !== -1;
  const reserved = ["etyme", "admin", "www", "owner", "mail", "ftp"].indexOf(slug) !== -1;

  const shown = ROWS.filter(function (r) {
    if (!q) return true;
    return (r.n + " " + r.sk).toLowerCase().indexOf(q.toLowerCase()) !== -1;
  });
  const issues = ROWS.filter(function (r) { return !r.ok; }).length;

  const steps = [["Sign in", 0], ["Company", 1], ["How you work", 2], ["Your people", 3], ["Your team", 4]];

  return (
    <div style={{ minHeight: "100vh", background: T.canvas, fontFamily: T.sans, color: T.ink, paddingBottom: 60 }}>
      <style>{CSS}</style>

      <div style={{ borderBottom: "1px solid " + T.rule }}>
        <div className={"wrap " + (step === 3 ? "wide" : "")} style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Mark h={21} />
          <div className="steps">
            {steps.map(function (s) {
              const done = step > s[1];
              const on = step === s[1];
              return (
                <div key={s[1]} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 16, background: on ? T.ink : "transparent" }}>
                  <div style={{ width: 17, height: 17, borderRadius: 17, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: done ? "#DCE5DC" : on ? T.canvas : "transparent", color: done ? T.verified : on ? T.ink : T.faint, border: done || on ? "none" : "1px solid " + T.rule }}>
                    {done ? <Check size={10} /> : s[1]}
                  </div>
                  <span className="hide-sm" style={{ fontSize: 12.5, color: on ? T.canvas : done ? T.muted : T.faint, fontWeight: on ? 600 : 400 }}>{s[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={"wrap " + (step === 3 ? "wide" : "")} style={{ paddingTop: 44 }}>

        {step === 0 ? <SignIn mode={mode} setMode={setMode} onDone={function () { setStep(1); }} /> : null}

        {/* ---------- 1. COMPANY ---------- */}
        {step === 1 ? (
          <div style={{ maxWidth: 520 }}>
            <Lbl c={T.action}>One minute</Lbl>
            <h1 style={{ fontFamily: T.serif, fontSize: 34, letterSpacing: "-.02em", marginTop: 10, lineHeight: 1.15 }}>Register your company</h1>
            <p style={{ fontSize: 15, color: T.muted, marginTop: 10, lineHeight: 1.7, marginBottom: 30 }}>
              Your site and your team&rsquo;s accounts come from this. Everything after it is optional and can wait.
            </p>

            <div style={{ background: "#EDF1ED", border: "1px solid #C9D6CA", borderRadius: 6, padding: 15, marginBottom: 20, display: "flex", gap: 11 }}>
              <Check size={16} color={T.verified} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: T.verified, lineHeight: 1.6 }}>
                Signed in with Microsoft as <strong>sharath@techvista.com</strong>. Microsoft has confirmed you control <strong>techvista.com</strong>, so we do not need to verify it separately.
              </div>
            </div>

            {isPersonal ? (
              <div style={{ background: "#F7EDE6", border: "1px solid #E5C9B5", borderRadius: 6, padding: 15, marginBottom: 16 }}>
                <div style={{ fontSize: 13.5, color: T.attention, fontWeight: 500, marginBottom: 6 }}>That is a personal address</div>
                <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
                  Plenty of good firms run on Gmail, so this is not a refusal. Choose your subdomain by hand below and carry on. You can attach a company domain later, and network visibility waits until you do.
                </div>
              </div>
            ) : null}

            <Field label="Company name"><input defaultValue="TechVista Consulting" style={inp} /></Field>

            <Field label="Your address on Etyme"
              hint={reserved ? null : "Taken from your domain. Change it if you like."}>
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                <input value={slug} onChange={function (e) { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }}
                  style={Object.assign({}, inp, { borderRadius: "6px 0 0 6px", borderRight: "none" })} />
                <div style={{ height: 44, display: "flex", alignItems: "center", padding: "0 13px", background: T.canvas, border: "1px solid " + T.rule, borderRadius: "0 6px 6px 0", fontSize: 14, color: T.muted, whiteSpace: "nowrap" }}>.etyme.com</div>
              </div>
            </Field>
            {reserved ? (
              <div style={{ fontSize: 12.5, color: T.attention, marginTop: -8, marginBottom: 16 }}>
                That name is reserved. Try something else.
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: T.verified, marginTop: -8, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                <Check size={13} /> {slug}.etyme.com is free
              </div>
            )}

            <Field label="Entity type">
              <select style={Object.assign({}, inp, { appearance: "none" })} defaultValue="llc">
                <option value="llc">LLC</option><option value="c">C Corporation</option>
                <option value="s">S Corporation</option><option value="pvt">Private Limited, India</option>
                <option value="ltd">Limited, UK</option>
              </select>
            </Field>

            <button onClick={function () { setStep(2); }} disabled={reserved}
              style={{ width: "100%", height: 48, borderRadius: 6, background: reserved ? "#C7C3B8" : T.action, color: "#fff", fontSize: 15, fontWeight: 500, marginTop: 8 }}>
              Continue
            </button>
            <div style={{ fontSize: 12.5, color: T.faint, marginTop: 14, lineHeight: 1.6 }}>
              You will get an email to set your password. Nobody is charged anything today.
            </div>
          </div>
        ) : null}

        {/* ---------- 2. TEMPLATE PACK ---------- */}
        {step === 2 ? (
          <div style={{ maxWidth: 640 }}>
            <Lbl c={T.action}>Thirty seconds</Lbl>
            <h1 style={{ fontFamily: T.serif, fontSize: 34, letterSpacing: "-.02em", marginTop: 10, lineHeight: 1.15 }}>How does your firm work?</h1>
            <p style={{ fontSize: 15, color: T.muted, marginTop: 10, lineHeight: 1.7, marginBottom: 26 }}>
              This sets your contract types, timesheet and invoicing cycles, document checklists and compliance gates. All of it is changeable afterwards &mdash; the point is not starting from an empty screen.
            </p>
            {PACKS.map(function (p) {
              const on = pack === p.id;
              return (
                <button key={p.id} onClick={function () { setPack(p.id); }}
                  style={{ display: "block", width: "100%", textAlign: "left", background: T.surface, border: "1px solid " + (on ? T.action : T.rule), borderRadius: 6, padding: 18, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 16, border: "1px solid " + (on ? T.action : T.rule), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {on ? <div style={{ width: 8, height: 8, borderRadius: 8, background: T.action }} /> : null}
                    </div>
                    <span style={{ fontFamily: T.serif, fontSize: 18 }}>{p.n}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 8, lineHeight: 1.6, paddingLeft: 26 }}>{p.d}</div>
                </button>
              );
            })}
            <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              <button onClick={function () { setStep(3); }} style={{ height: 48, padding: "0 26px", borderRadius: 6, background: T.action, color: "#fff", fontSize: 15, fontWeight: 500 }}>Continue</button>
              <button onClick={function () { setStep(1); }} style={{ height: 48, padding: "0 20px", borderRadius: 6, border: "1px solid " + T.rule, background: T.surface, fontSize: 15 }}>Back</button>
            </div>
          </div>
        ) : null}

        {/* ---------- 3. IMPORT — the working surface ---------- */}
        {step === 3 ? (
          <div>
            <div style={{ maxWidth: 640, marginBottom: 24 }}>
              <Lbl c={T.action}>The part that usually takes a week</Lbl>
              <h1 style={{ fontFamily: T.serif, fontSize: 34, letterSpacing: "-.02em", marginTop: 10, lineHeight: 1.15 }}>Bring your people across</h1>
              <p style={{ fontSize: 15, color: T.muted, marginTop: 10, lineHeight: 1.7 }}>
                Your spreadsheet, however it is arranged. Names, skills and end dates are enough to start &mdash; three columns will light up the rolloff board.
              </p>
            </div>

            {!imported ? (
              <div style={{ maxWidth: 640 }}>
                <button onClick={function () { setImported(true); }}
                  style={{ width: "100%", background: T.surface, border: "1px dashed " + T.rule, borderRadius: 8, padding: 44, textAlign: "center" }}>
                  <Upload size={22} color={T.faint} />
                  <div style={{ fontSize: 15.5, fontWeight: 500, marginTop: 12 }}>Drop a spreadsheet, or paste from one</div>
                  <div style={{ fontSize: 13, color: T.faint, marginTop: 7, lineHeight: 1.6 }}>
                    Excel or CSV. Column names do not matter &mdash; they get read and mapped, and you check the result.
                  </div>
                </button>
                <button onClick={function () { setStep(4); }} style={{ fontSize: 13.5, color: T.muted, marginTop: 16, textDecoration: "underline" }}>
                  Skip this and add people one at a time
                </button>
              </div>
            ) : (
              <div>
                <div className="split" style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ position: "relative" }}>
                      <Search size={14} color={T.faint} style={{ position: "absolute", left: 11, top: 12 }} />
                      <input value={q} onChange={function (e) { setQ(e.target.value); }} placeholder="Search the import"
                        style={{ height: 38, width: 230, borderRadius: 6, border: "1px solid " + T.rule, background: T.surface, padding: "0 12px 0 32px", fontSize: 13.5, outline: "none" }} />
                    </div>
                    <span style={{ fontSize: 13, color: T.muted }}>
                      <strong style={{ color: T.ink }}>47 read</strong> · {issues} want a look
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {sel.length ? (
                      <>
                        <button style={{ height: 38, padding: "0 14px", borderRadius: 6, background: T.surface, border: "1px solid " + T.rule, fontSize: 13 }}>Set rate for {sel.length}</button>
                        <button style={{ height: 38, padding: "0 14px", borderRadius: 6, background: T.surface, border: "1px solid " + T.rule, fontSize: 13 }}>Mark as bench</button>
                      </>
                    ) : null}
                    <button style={{ height: 38, padding: "0 14px", borderRadius: 6, background: T.surface, border: "1px solid " + T.rule, fontSize: 13 }}>Change the mapping</button>
                  </div>
                </div>

                <div style={{ background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, overflow: "hidden" }}>
                  <div className="scroll">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}>
                            <input type="checkbox" checked={sel.length === shown.length && shown.length > 0}
                              onChange={function () { setSel(sel.length === shown.length ? [] : shown.map(function (_, i) { return i; })); }} />
                          </th>
                          <th>Name</th><th>Skills</th><th>Rate</th><th>Work authorisation</th><th>Status</th><th>Reading</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map(function (r, i) {
                          const on = sel.indexOf(i) !== -1;
                          return (
                            <tr key={i} style={{ background: on ? "#EDEFFC" : !r.ok ? "#FDF8F4" : "transparent" }}>
                              <td><input type="checkbox" checked={on}
                                onChange={function () { setSel(on ? sel.filter(function (x) { return x !== i; }) : sel.concat([i])); }} /></td>
                              <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{r.n}</td>
                              <td style={{ color: T.muted, whiteSpace: "nowrap" }}>{r.sk}</td>
                              <td className="num">{r.rate ? "$" + r.rate : <span style={{ color: T.attention }}>&mdash;</span>}</td>
                              <td>{r.visa ? r.visa : <span style={{ color: T.attention }}>&mdash;</span>}</td>
                              <td style={{ color: T.muted, whiteSpace: "nowrap" }}>{r.st || <span style={{ color: T.attention }}>&mdash;</span>}</td>
                              <td style={{ whiteSpace: "nowrap" }}>{r.ok ? <Chip tone="v">Clear</Chip> : <Chip tone="a">{r.issue}</Chip>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "10px 14px", borderTop: "1px solid " + T.rule, fontSize: 12.5, color: T.faint, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <span>Showing {shown.length} of 47</span>
                    <span>1 &nbsp; 2 &nbsp; 3 &nbsp; 4 &nbsp; 5 &nbsp; 6</span>
                  </div>
                </div>

                <div style={{ background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, padding: 18, marginTop: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 7 }}>The three with gaps still come in</div>
                  <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.65, maxWidth: 720 }}>
                    A missing rate or work authorisation does not block anyone. They import, they are searchable and matchable internally, and they simply are not visible to clients until the field is filled. Nothing waits for a complete record.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                  <button onClick={function () { setStep(4); }} style={{ height: 48, padding: "0 26px", borderRadius: 6, background: T.action, color: "#fff", fontSize: 15, fontWeight: 500 }}>Bring in all 47</button>
                  <button onClick={function () { setImported(false); }} style={{ height: 48, padding: "0 20px", borderRadius: 6, border: "1px solid " + T.rule, background: T.surface, fontSize: 15 }}>Use a different file</button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* ---------- 4. TEAM + DONE ---------- */}
        {step === 4 ? (
          <div style={{ maxWidth: 640 }}>
            <Lbl c={T.verified}>Already running</Lbl>
            <h1 style={{ fontFamily: T.serif, fontSize: 34, letterSpacing: "-.02em", marginTop: 10, lineHeight: 1.15 }}>
              TechVista is live
            </h1>
            <p style={{ fontSize: 15, color: T.muted, marginTop: 10, lineHeight: 1.7, marginBottom: 24 }}>
              Four minutes, most of it reading your spreadsheet.
            </p>

            <div style={{ background: T.surface, border: "1px solid #C9D6CA", borderRadius: 6, padding: 20, marginBottom: 20 }}>
              {[
                ["techvista.etyme.com is up", "Written from what you told us, with your available people already on it."],
                ["Forty-seven people imported", "Three want a field filled in. They are usable in the meantime."],
                ["Four rolling off within eight weeks", "The rolloff board is already watching them."],
                ["Seven roles created", "Manager, recruiter, resourcing, timesheets, accounts, compliance and sales."],
                ["Contracts, cycles and checklists set", "From the SAP consulting pack. Change any of it in settings."],
              ].map(function (r, i) {
                return (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: i < 4 ? "1px solid " + T.rule : "none" }}>
                    <Check size={15} color={T.verified} style={{ marginTop: 3, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 14 }}>{r[0]}</div>
                      <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.55 }}>{r[1]}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Lbl>Bring your team in</Lbl>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 8, marginBottom: 12, lineHeight: 1.6 }}>
              Eight people at techvista.com are in your Microsoft directory. Nobody is invited until you say so, and nobody sees anything until they accept.
            </div>
            <div style={{ background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
              {[["Priya Menon", "priya@techvista.com", "Recruiter", true], ["Vikas Rao", "vikas@techvista.com", "Recruiter", true],
                ["Anita Desai", "accounts@techvista.com", "Accounts", true], ["Sam Fuller", "sam@techvista.com", "Not now", false]].map(function (r, i) {
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", borderBottom: i < 3 ? "1px solid " + T.rule : "none" }}>
                    <input type="checkbox" defaultChecked={r[3]} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r[0]}</div>
                      <div style={{ fontSize: 11.5, color: T.faint }}>{r[1]}</div>
                    </div>
                    <select defaultValue={r[2]} style={{ height: 34, borderRadius: 5, border: "1px solid " + T.rule, background: T.canvas, fontSize: 12.5, padding: "0 8px", appearance: "none" }}>
                      <option>Manager</option><option>Recruiter</option><option>Resourcing</option>
                      <option>Timesheets</option><option>Accounts</option><option>Compliance</option><option>Not now</option>
                    </select>
                  </div>
                );
              })}
            </div>
            <button style={{ fontSize: 13, color: T.action, fontWeight: 500 }}>Invite somebody outside the directory</button>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 14, lineHeight: 1.6 }}>
              They sign in with Microsoft, the same as you. Anyone outside the directory can use any address. Recruiters never see bench cost or margin &mdash; that stays with you and whoever runs resourcing.
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
              <button style={{ height: 48, padding: "0 26px", borderRadius: 6, background: T.action, color: "#fff", fontSize: 15, fontWeight: 500 }}>Send the invitations and open Etyme</button>
              <button style={{ height: 48, padding: "0 20px", borderRadius: 6, border: "1px solid " + T.rule, background: T.surface, fontSize: 15 }}>Do this later</button>
            </div>

            <div style={{ background: T.canvas, border: "1px dashed " + T.rule, borderRadius: 6, padding: 16, marginTop: 24, fontSize: 12.5, color: T.muted, lineHeight: 1.65 }}>
              Your site is public now. Being visible to other companies on the network waits until we have confirmed the business exists &mdash; usually a day. Nothing you do inside Etyme is held up by that.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
