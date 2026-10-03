import { useState } from "react";
import { ChevronDown, ChevronRight, Search, Bell, Lock, ArrowRight, Building2, User, Briefcase, Menu } from "lucide-react";

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
input{font-family:inherit}
.wrap{max-width:1060px;margin:0 auto;padding:0 40px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.gside{display:grid;grid-template-columns:1.5fr 1fr;gap:14px}
.g3wide{display:grid;grid-template-columns:repeat(3,1fr);gap:44px}
.hero{font-size:60px}
.pageh{font-size:31px}
.split{display:flex;justify-content:space-between;align-items:flex-start;gap:26px}
.splitc{display:flex;justify-content:space-between;align-items:center;gap:20px}
.sidebar{display:block;width:208px;flex-shrink:0}
.mobnav{display:none}
.main{padding:34px 38px;flex:1;min-width:0}
.hdr{padding:0 26px}
.sm-hide{display:block}
.ledger{display:grid;grid-template-columns:1.7fr 1fr .6fr auto;gap:16px;align-items:baseline}
.score{display:grid;grid-template-columns:1.6fr repeat(3,auto);gap:18px;align-items:baseline}
.homenav{display:flex;align-items:center;gap:30px}
.pill{white-space:nowrap}
@media (max-width:900px){
  .sidebar{display:none}
  .mobnav{display:flex}
  .main{padding:20px 15px 92px}
  .hdr{padding:0 14px}
  .wrap{padding:0 20px}
  .g2,.g3,.gside,.g3wide{grid-template-columns:1fr;gap:16px}
  .g4{grid-template-columns:repeat(2,1fr)}
  .hero{font-size:34px}
  .pageh{font-size:25px}
  .split,.splitc{flex-direction:column;align-items:stretch;gap:14px}
  .sm-hide{display:none}
  .ledger{grid-template-columns:1fr;gap:5px}
  .score{grid-template-columns:1fr 1fr;gap:8px}
  .homenav{gap:16px;font-size:13px}
}
`;

function Mark({ h = 21 }) {
  return (
    <svg height={h} width={h * 2.42} viewBox="-15 35 615 250" style={{ display: "block", overflow: "visible", flexShrink: 0 }}>
      <defs><linearGradient id={"g" + h} x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#22B5E8" /><stop offset="55%" stopColor="#2A6BE8" /><stop offset="100%" stopColor="#2B41E4" />
      </linearGradient></defs>
      <g fill="none" stroke={T.ink} strokeWidth="30" strokeLinecap="round" strokeLinejoin="round">
        <path d="M110 150 L10 150 A50 50 0 1 1 97 182" /><path d="M150 55 L150 172 A26 26 0 0 0 176 198" />
        <path d="M208 100 L258 196" /><path d="M304 100 L256 198 C244 236 232 258 208 256" />
        <path d="M332 100 L332 200" /><path d="M332 133 A29 29 0 0 1 390 133 L390 200" />
        <path d="M390 133 A29 29 0 0 1 448 133 L448 200" /><path d="M570 150 L470 150 A50 50 0 1 1 557 182" />
      </g>
      <polygon points="112,106 208,88 208,120 112,138" fill={"url(#g" + h + ")"} />
    </svg>
  );
}

function Lbl({ children, c }) {
  return <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: c || T.faint, fontWeight: 600 }}>{children}</div>;
}
function Head({ eyebrow, title, sub }) {
  return (
    <div style={{ marginBottom: 24 }}>
      {eyebrow ? <Lbl>{eyebrow}</Lbl> : null}
      <h1 className="pageh" style={{ fontFamily: T.serif, letterSpacing: "-0.02em", marginTop: 8, lineHeight: 1.15 }}>{title}</h1>
      {sub ? <p style={{ fontSize: 14.5, color: T.muted, marginTop: 10, maxWidth: 620, lineHeight: 1.7 }}>{sub}</p> : null}
    </div>
  );
}
function Panel({ title, sub, children }) {
  return (
    <div style={{ background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, padding: 20 }}>
      {title ? <div style={{ fontFamily: T.serif, fontSize: 17, marginBottom: sub ? 4 : 15 }}>{title}</div> : null}
      {sub ? <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 15, lineHeight: 1.6 }}>{sub}</div> : null}
      {children}
    </div>
  );
}
function Stat({ l, v, s, tone }) {
  return (
    <div style={{ background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, padding: "16px 18px" }}>
      <Lbl>{l}</Lbl>
      <div style={{ fontFamily: T.serif, fontSize: 27, marginTop: 9, lineHeight: 1, color: tone === "a" ? T.attention : tone === "v" ? T.verified : T.ink }}>{v}</div>
      {s ? <div style={{ fontSize: 11.5, color: T.faint, marginTop: 6 }}>{s}</div> : null}
    </div>
  );
}
function Chip({ children, tone }) {
  const m = { a: ["#F7EDE6", T.attention, "#E5C9B5"], v: ["#EDF1ED", T.verified, "#C9D6CA"], b: ["#EDEFFC", T.action, "#C7CDF5"], p: ["#F2F0EA", T.muted, T.rule] };
  const s = m[tone] || m.p;
  return <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 4, background: s[0], color: s[1], border: "1px solid " + s[2], display: "inline-block" }}>{children}</span>;
}
function Why({ score, confidence, basis, factors, unknown }) {
  const [open, setOpen] = useState(false);
  const c = confidence === "high" ? ["Confident", T.verified] : confidence === "low" ? ["Low confidence", T.attention] : ["Moderate", T.muted];
  return (
    <div>
      <button onClick={function () { setOpen(!open); }} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: T.serif, fontSize: 22, color: score >= 80 ? T.verified : T.ink }}>{score}%</span>
        <span style={{ fontSize: 11.5, color: c[1] }}>{c[0]}</span>
        <ChevronDown size={13} color={T.faint} style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open ? (
        <div style={{ marginTop: 11, padding: 14, background: T.canvas, borderRadius: 8, border: "1px solid " + T.rule }}>
          <Lbl>What produced this</Lbl>
          <div style={{ marginTop: 9 }}>
            {factors.map(function (f, i) {
              return (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, gap: 10 }}>
                    <span>{f[0]}</span><span style={{ color: T.muted }}>{f[1]}</span>
                  </div>
                  <div style={{ height: 2, background: "#E4E0D5", borderRadius: 2 }}>
                    <div style={{ height: 2, width: f[2] + "%", background: T.ink, opacity: .55, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 12, paddingTop: 11, borderTop: "1px solid " + T.rule, lineHeight: 1.6 }}>
            <strong style={{ color: T.ink }}>Learned from</strong> {basis}
          </div>
          {unknown ? <div style={{ fontSize: 12, color: T.attention, marginTop: 8, lineHeight: 1.6 }}><strong>Could not account for</strong> {unknown}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ============ HOME ============ */
function Home({ go }) {
  return (
    <div style={{ background: T.canvas, minHeight: "100vh", paddingBottom: 80 }}>
      <div style={{ borderBottom: "1px solid " + T.rule }}>
        <div className="wrap splitc" style={{ height: 66, display: "flex", alignItems: "center" }}>
          <Mark h={22} />
          <div className="homenav" style={{ color: T.muted, fontSize: 14 }}>
            <span className="sm-hide">Programs</span><span className="sm-hide">Vendors</span><span className="sm-hide">Consultants</span>
            <button onClick={function () { go("login"); }} style={{ fontSize: 14, color: T.ink, fontWeight: 500 }}>Sign in</button>
          </div>
        </div>
      </div>

      <div className="wrap" style={{ paddingTop: 66, paddingBottom: 56 }}>
        <Lbl c={T.action}>For contingent workforce programs</Lbl>
        <h1 className="hero" style={{ fontFamily: T.serif, lineHeight: 1.07, letterSpacing: "-0.025em", marginTop: 16 }}>
          Every contractor.<br />Every vendor.<br />One record.
        </h1>
        <p style={{ fontSize: 17, color: T.muted, lineHeight: 1.7, marginTop: 20, maxWidth: 580 }}>
          Spend, compliance and expirations across your whole supplier chain &mdash; and the people your vendors already have available, including the ones who worked for you before.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
          <button onClick={function () { go("login"); }} style={{ background: T.action, color: "#fff", fontSize: 15, fontWeight: 500, padding: "13px 24px", borderRadius: 6 }}>See a live program</button>
          <button style={{ fontSize: 15, padding: "13px 22px", borderRadius: 6, border: "1px solid " + T.rule, background: T.surface }}>Talk to the founder</button>
        </div>
        <div style={{ fontSize: 13, color: T.faint, marginTop: 16, lineHeight: 1.6 }}>
          Your vendors bring it in. Nothing is ripped out, nothing is migrated.
        </div>
      </div>

      <div style={{ borderTop: "1px solid " + T.rule, borderBottom: "1px solid " + T.rule, background: T.surface }}>
        <div className="wrap g3wide" style={{ paddingTop: 48, paddingBottom: 48 }}>
          {[
            ["Nobody falls through", "When a contract ends, the consultant, the sub-vendor, your project manager and the vendor's resourcing team are told at the same moment. Today that is a spreadsheet somebody forgot to update."],
            ["The people who worked here before", "Alumni surface automatically, including consultants whose timesheets a particular manager personally approved. The warmest hire available, currently locked inside one person's memory."],
            ["Receipts instead of resumes", "Verified hours, extensions earned, rehires. Facts the platform attests to because the work ran through it. A resume can be generated in seconds now; this cannot."],
          ].map(function (c, i) {
            return (
              <div key={i}>
                <div style={{ fontFamily: T.serif, fontSize: 20, lineHeight: 1.3, marginBottom: 9 }}>{c[0]}</div>
                <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.7 }}>{c[1]}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="wrap" style={{ paddingTop: 48 }}>
        <Lbl>Who uses it</Lbl>
        <div className="g2" style={{ marginTop: 16 }}>
          {[
            ["Enterprises", "Applied Materials", "Program visibility across twelve vendors, compliance that survives an audit, and the bench your suppliers already pay for.", "amat"],
            ["Staffing vendors", "TechVista Consulting", "Fill the bench, sell the bench, and let the back office run itself. Three decisions a day instead of thirty.", "vend"],
            ["Delivery firms", "Infosys, Accenture", "Internal supply checked before a rupee of subcontractor spend is approved. Utilization by pod.", "infy"],
            ["Consultants", "Free, always", "Your record travels with you. You decide who may market you. Nobody submits you without permission.", "cand"],
          ].map(function (c, i) {
            return (
              <button key={i} onClick={function () { go(c[3]); }}
                style={{ textAlign: "left", background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, padding: 22 }}>
                <Lbl c={T.action}>{c[0]}</Lbl>
                <div style={{ fontFamily: T.serif, fontSize: 19, marginTop: 8 }}>{c[1]}</div>
                <div style={{ fontSize: 13.5, color: T.muted, marginTop: 8, lineHeight: 1.65 }}>{c[2]}</div>
                <div style={{ fontSize: 13, color: T.action, marginTop: 13, display: "flex", alignItems: "center", gap: 6 }}>See this view <ArrowRight size={13} /></div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============ LOGIN ============ */
function Login({ go }) {
  const [stage, setStage] = useState("email");
  const ctx = [
    { id: "cand", i: User, n: "My consulting profile", d: "SAP BRIM · your own record", c: T.verified },
    { id: "vend", i: Building2, n: "TechVista Consulting", d: "Owner · staffing vendor", c: T.action },
    { id: "infy", i: Building2, n: "Infosys", d: "Delivery manager · SAP practice, US", c: T.action },
    { id: "amat", i: Briefcase, n: "Applied Materials", d: "Contingent program · client contact", c: T.muted },
  ];
  return (
    <div style={{ background: T.canvas, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px 100px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <Mark h={24} />
        {stage === "email" ? (
          <div style={{ marginTop: 34 }}>
            <h1 style={{ fontFamily: T.serif, fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1.2 }}>Sign in</h1>
            <p style={{ fontSize: 14.5, color: T.muted, marginTop: 10, lineHeight: 1.65 }}>
              One account, whatever your relationship to the work. Any email address &mdash; it does not have to match a company domain.
            </p>
            <input defaultValue="rajesh.v@gmail.com"
              style={{ width: "100%", height: 48, marginTop: 24, borderRadius: 6, border: "1px solid " + T.rule, background: T.surface, padding: "0 16px", fontSize: 15, outline: "none" }} />
            <button onClick={function () { setStage("pick"); }}
              style={{ width: "100%", height: 48, marginTop: 12, borderRadius: 6, background: T.action, color: "#fff", fontSize: 15, fontWeight: 500 }}>Continue</button>
            <div style={{ fontSize: 13, color: T.faint, marginTop: 18, lineHeight: 1.6 }}>Consultants are never charged. The companies are.</div>
          </div>
        ) : (
          <div style={{ marginTop: 34 }}>
            <h1 style={{ fontFamily: T.serif, fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1.2 }}>Where would you like to go?</h1>
            <p style={{ fontSize: 14.5, color: T.muted, marginTop: 10, lineHeight: 1.65 }}>
              You hold four roles. They stay separate &mdash; Infosys cannot see your consulting record, and Applied Materials cannot see either.
            </p>
            <div style={{ marginTop: 22 }}>
              {ctx.map(function (c) {
                const I = c.i;
                return (
                  <button key={c.id} onClick={function () { go(c.id); }}
                    style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, padding: 15, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: T.canvas, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <I size={17} color={c.c} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{c.n}</div>
                      <div style={{ fontSize: 12.5, color: T.faint, marginTop: 2 }}>{c.d}</div>
                    </div>
                    <ChevronRight size={16} color={T.faint} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ SHELL ============ */
function Shell({ org, role, nav, page, setPage, children }) {
  const items = nav.filter(function (n) { return n.id; });
  return (
    <div style={{ minHeight: "100vh", background: T.canvas }}>
      <header style={{ borderBottom: "1px solid " + T.rule, position: "sticky", top: 0, background: T.canvas, zIndex: 20 }}>
        <div className="hdr" style={{ height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
            <Mark h={19} />
            <div style={{ width: 1, height: 20, background: T.rule, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{org}</div>
              <div style={{ fontSize: 11, color: T.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{role}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button style={{ padding: 7, color: T.faint }}><Search size={16} /></button>
            <button style={{ padding: 7, color: T.faint }}><Bell size={16} /></button>
            <div style={{ width: 28, height: 28, borderRadius: 28, background: T.ink, color: T.canvas, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, marginLeft: 5 }}>RV</div>
          </div>
        </div>
        <div className="mobnav" style={{ gap: 6, padding: "0 14px 10px", overflowX: "auto" }}>
          {items.map(function (n) {
            const on = page === n.id;
            return (
              <button key={n.id} onClick={function () { setPage(n.id); }} className="pill"
                style={{ padding: "7px 13px", borderRadius: 16, fontSize: 12.5, fontWeight: on ? 600 : 400, background: on ? T.ink : T.surface, color: on ? T.canvas : T.muted, border: on ? "none" : "1px solid " + T.rule, flexShrink: 0 }}>
                {n.l}{n.badge ? " · " + n.badge : ""}
              </button>
            );
          })}
        </div>
      </header>
      <div style={{ display: "flex" }}>
        <nav className="sidebar" style={{ borderRight: "1px solid " + T.rule, minHeight: "calc(100vh - 58px)", padding: "18px 12px" }}>
          {nav.map(function (n, i) {
            if (n.s) return <div key={i} style={{ padding: "0 12px", marginTop: i === 0 ? 0 : 20, marginBottom: 6, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: T.faint, fontWeight: 600 }}>{n.s}</div>;
            const on = page === n.id;
            return (
              <button key={i} onClick={function () { setPage(n.id); }}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", padding: "7px 12px", borderRadius: 5, fontSize: 13.5, marginBottom: 1, background: on ? "#E6E3D9" : "transparent", color: on ? T.ink : T.muted, fontWeight: on ? 500 : 400 }}>
                <span>{n.l}</span>{n.badge ? <span style={{ fontSize: 11, color: T.attention, fontWeight: 600 }}>{n.badge}</span> : null}
              </button>
            );
          })}
        </nav>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

function Blank({ title }) {
  return (
    <div><Lbl>Not built in this demo</Lbl>
      <h1 className="pageh" style={{ fontFamily: T.serif, marginTop: 8, letterSpacing: "-0.02em" }}>{title}</h1>
      <p style={{ fontSize: 14.5, color: T.muted, marginTop: 12, maxWidth: 440, lineHeight: 1.7 }}>The first two screens in each view carry the pattern.</p>
    </div>
  );
}

/* ============ CONSULTANT ============ */
function CandRecord() {
  return (
    <div>
      <Head eyebrow="Your record" title="Two thousand two hundred and forty hours"
        sub="Attested by the platform because the work ran through it. Nothing here was written by you, and nothing can be." />
      <div className="g4" style={{ marginBottom: 16 }}>
        <Stat l="Verified hours" v="2,240" /><Stat l="Extensions" v="2" /><Stat l="Rehired by" v="1 client" /><Stat l="Rate growth" v="+38%" tone="v" />
      </div>
      <Panel title="Where the hours came from">
        {[["Fortune 500 semiconductor", "S/4HANA revenue recognition", "14 months", "2,240", 2, true],
          ["Fortune 500 telecom", "BRIM implementation", "10 months, running", "1,600", 1, false],
          ["Mid-market biotech", "RAR revenue recognition", "8 months", "980", 1, true]].map(function (r, i) {
          return (
            <div key={i} className="ledger" style={{ padding: "13px 0", borderBottom: i < 2 ? "1px solid " + T.rule : "none" }}>
              <div><div style={{ fontSize: 14 }}>{r[0]}</div><div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{r[1]}</div></div>
              <div style={{ fontSize: 12.5, color: T.muted }}>{r[2]}</div>
              <div style={{ fontFamily: T.serif, fontSize: 17 }}>{r[3]} hrs</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Chip tone="v">{r[4]} ext</Chip>{r[5] ? <Chip tone="b">Rehire</Chip> : null}</div>
            </div>
          );
        })}
        <div style={{ marginTop: 16, padding: 15, background: "#EDF1ED", border: "1px solid #C9D6CA", borderRadius: 6, fontSize: 13, color: T.verified, lineHeight: 1.65 }}>
          A manager at the semiconductor client is looking for BRIM again. You appear in their view anonymously, marked as someone whose timesheets they personally approved.
        </div>
      </Panel>
    </div>
  );
}

function CandControl() {
  const [on, setOn] = useState(["v1", "v2"]);
  const vendors = [
    { id: "v1", n: "TechVista Consulting", d: "14 BRIM placements · 47 of 47 payrolls on time · sponsors H1B" },
    { id: "v2", n: "TechBridge Solutions", d: "9 BRIM placements · 38 of 40 payrolls on time · sponsors H1B" },
    { id: "v3", n: "CloudStaff Inc", d: "4 BRIM placements · 71 percent reply rate" },
    { id: "v4", n: "NexGen Staffing", d: "No BRIM placements on record · asked to market you two days ago" },
  ];
  return (
    <div>
      <Head eyebrow="Control" title="Nobody may market you unless you say so"
        sub="A vendor switched off here cannot submit you to anything. Enforced in the system, not a request." />
      {vendors.map(function (v) {
        const isOn = on.indexOf(v.id) !== -1;
        return (
          <div key={v.id} style={{ background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, padding: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 500 }}>{v.n}</div>
              <div style={{ fontSize: 12, color: T.faint, marginTop: 4, lineHeight: 1.5 }}>{v.d}</div>
            </div>
            <button onClick={function () { setOn(isOn ? on.filter(function (x) { return x !== v.id; }) : on.concat([v.id])); }}
              style={{ width: 46, height: 27, borderRadius: 27, background: isOn ? T.action : "#DCD8CD", position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: 3, left: isOn ? 22 : 3, width: 21, height: 21, borderRadius: 21, background: "#fff" }} />
            </button>
          </div>
        );
      })}
      <div className="g2" style={{ marginTop: 18 }}>
        <Panel title="Your floor">
          <div style={{ fontFamily: T.serif, fontSize: 34, lineHeight: 1 }}>$118 <span style={{ fontFamily: T.sans, fontSize: 14, color: T.muted }}>an hour</span></div>
          <div style={{ fontSize: 12.5, color: T.attention, marginTop: 11, lineHeight: 1.6 }}>
            Thirty-four BRIM placements closed near you in ninety days. The median was $138. You are set at the bottom of the market.
          </div>
        </Panel>
        <Panel title="Where you have been sent">
          {[["TechVista to Nike", "2 days ago · interviewing"], ["CloudStaff to Terumo", "6 days ago · no decision"]].map(function (s, i) {
            return (
              <div key={i} style={{ padding: "8px 0", borderBottom: i === 0 ? "1px solid " + T.rule : "none" }}>
                <div style={{ fontSize: 13.5 }}>{s[0]}</div><div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>{s[1]}</div>
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: T.muted, marginTop: 11, lineHeight: 1.6 }}>
            Timestamped. If two vendors try the same client the first holds, so you are never double-submitted and rejected for it.
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============ STAFFING VENDOR ============ */
function VendToday() {
  const [rev, setRev] = useState([]);
  const gates = [
    { k: "Submission drafted", who: "Rajesh Venkataraman", what: "SAP BRIM Consultant · Nike · proposed at $168 an hour",
      s: 87, conf: "high", basis: "34 BRIM placements at this kind of client over eighteen months",
      f: [["Skill overlap", "strong", 92], ["Free on the start date", "exact", 100], ["Rate inside client band", "yes", 88], ["Extensions earned before", "two", 74]],
      u: "whether this manager prefers onsite-first candidates. Nothing in the record says.",
      stake: "Placing him here also ends twenty thousand dollars a month of H1B bench pay from the sixteenth of August." },
    { k: "Rate response needed", who: "Nike offered $185", what: "Your margin at that rate is thirty-two percent",
      s: 71, conf: "moderate", basis: "eleven rate negotiations with this client",
      f: [["Above your floor of 18 percent", "well above", 90], ["Against recent comparables", "slightly under", 62], ["Client has accepted counters", "twice of three", 66]],
      u: "their budget ceiling. They have never disclosed one.", stake: null },
    { k: "Two timesheets held", who: "Anomalies, not errors", what: "Hours outside what this assignment usually runs",
      s: 44, conf: "low", basis: "only six weeks of history on this assignment",
      f: [["Above a typical week", "twelve percent", 55], ["Prior anomalies from this person", "none", 30]],
      u: "whether a go-live weekend was agreed. Nobody told the system.",
      stake: "Held rather than rejected. Too thin a basis for a machine to decide." },
  ];
  const ran = [
    { t: "Distributed the Nike requirement to four vendors", d: "Chose those four on reply rates above seventy percent. Held the band at $120 to $135, your standing floor.", r: true },
    { t: "Approved fourteen timesheets that matched their pattern", d: "Each within eight percent of the assignment's usual week and signed by the client approver.", r: true },
    { t: "Issued six invoices totalling $248,400", d: "Generated on the billing cycle from approved hours only.", r: false },
    { t: "Opened rolloff for Rajesh Venkataraman", d: "Four weeks before contract end. Notified the consultant, the sub-vendor, the client and resourcing.", r: true },
    { t: "Chased three overdue invoices", d: "Terumo at sixty-eight days was escalated to you rather than chased again.", r: false },
  ];
  return (
    <div>
      <Head eyebrow="TechVista Consulting · Thursday" title="Three decisions are yours"
        sub="Thirty-one other things ran. Each one below shows what it based itself on, and says plainly what it could not know." />
      <div style={{ display: "grid", gap: 13, marginBottom: 26 }}>
        {gates.map(function (g, i) {
          return (
            <div key={i} style={{ background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, padding: 20 }}>
              <div className="split">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Lbl>{g.k}</Lbl>
                  <div style={{ fontFamily: T.serif, fontSize: 20, marginTop: 7 }}>{g.who}</div>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{g.what}</div>
                  {g.stake ? <div style={{ fontSize: 13, color: T.attention, marginTop: 11, lineHeight: 1.6 }}>{g.stake}</div> : null}
                </div>
                <div style={{ flexShrink: 0 }}><Why score={g.s} confidence={g.conf} basis={g.basis} factors={g.f} unknown={g.u} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid " + T.rule, flexWrap: "wrap" }}>
                <button style={{ background: T.action, color: "#fff", fontSize: 13, fontWeight: 500, padding: "9px 18px", borderRadius: 5 }}>Approve</button>
                <button style={{ fontSize: 13, padding: "9px 16px", borderRadius: 5, border: "1px solid " + T.rule, background: T.raised }}>Change it first</button>
                <button style={{ fontSize: 13, padding: "9px 16px", borderRadius: 5, color: T.muted }}>Decline</button>
              </div>
            </div>
          );
        })}
      </div>
      <Panel title="What ran without you" sub="Everything here can be inspected. Most of it can be undone.">
        {ran.map(function (r, i) {
          const undone = rev.indexOf(i) !== -1;
          return (
            <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < ran.length - 1 ? "1px solid " + T.rule : "none", opacity: undone ? .45 : 1 }}>
              <div style={{ width: 5, height: 5, borderRadius: 5, background: T.verified, marginTop: 7, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{r.t}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.55 }}>{r.d}</div>
              </div>
              {r.r && !undone ? (
                <button onClick={function () { setRev(rev.concat([i])); }} style={{ fontSize: 11.5, color: T.muted, flexShrink: 0, marginTop: 2 }}>Undo</button>
              ) : undone ? <span style={{ fontSize: 11.5, color: T.attention, flexShrink: 0, marginTop: 2 }}>Undone</span>
              : <span style={{ fontSize: 11.5, color: T.faint, flexShrink: 0, marginTop: 2 }}>Final</span>}
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function VendReqs() {
  const rows = [
    { t: "SAP RAR Consultant", cl: "via Apex SAP Solutions", ev: "$126k", conf: "low",
      why: "Most of this is avoided bench cost, and that assumes Rajesh stays the full six months. If the engagement is shorter the figure falls steeply. Treat it as a reason to look, not a promise." },
    { t: "SAP BRIM Consultant", cl: "Nike · your client", ev: "$93k", conf: "high",
      why: "Exclusive to you, twelve month term, three matches already on the bench. Very little of this is guesswork." },
    { t: "SAP S/4 Migration Lead", cl: "Terumo BCT · your client", ev: "$21k", conf: "moderate",
      why: "Three vendors competing. Fill odds are the softest part of the estimate." },
    { t: "SAP BW/BI Lead", cl: "via CloudStaff Inc", ev: "$2k", conf: "moderate",
      why: "Nine vendors have this. Honestly, not worth working." },
  ];
  return (
    <div>
      <Head eyebrow="Sell" title="Requirements, ranked by what they are worth"
        sub="Expected value is an estimate. Where the estimate is weak it says so, rather than rounding the doubt into a clean number." />
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map(function (r, i) {
          const c = r.conf === "high" ? T.verified : r.conf === "low" ? T.attention : T.muted;
          const l = r.conf === "high" ? "Firm estimate" : r.conf === "low" ? "Soft estimate" : "Moderate estimate";
          return (
            <div key={i} style={{ background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, padding: 18 }}>
              <div className="split">
                <div>
                  <div style={{ fontFamily: T.serif, fontSize: 18 }}>{r.t}</div>
                  <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>{r.cl}</div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ fontFamily: T.serif, fontSize: 24, lineHeight: 1 }}>{r.ev}</div>
                  <div style={{ fontSize: 11, color: c, marginTop: 5 }}>{l}</div>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: T.muted, marginTop: 13, paddingTop: 12, borderTop: "1px solid " + T.rule, lineHeight: 1.6 }}>{r.why}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VendMoney() {
  return (
    <div>
      <Head eyebrow="Operate" title="Money in motion"
        sub="The half of this business no agent can take over. Someone employs the person, floats the payroll, and carries the receivable." />
      <div className="g2" style={{ marginBottom: 14 }}>
        <Panel>
          <Lbl>Owed to you</Lbl>
          <div style={{ fontFamily: T.serif, fontSize: 42, lineHeight: 1, marginTop: 10 }}>$412,000</div>
          <div style={{ display: "flex", gap: 22, marginTop: 18, paddingTop: 16, borderTop: "1px solid " + T.rule, flexWrap: "wrap" }}>
            {[["Current", "$302k", false], ["31 to 60", "$86k", true], ["Over 60", "$24k", true]].map(function (r, i) {
              return (
                <div key={i}><Lbl>{r[0]}</Lbl>
                  <div style={{ fontFamily: T.serif, fontSize: 19, marginTop: 5, color: r[2] ? T.attention : T.ink }}>{r[1]}</div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel>
          <Lbl>Out within fourteen days</Lbl>
          <div style={{ fontFamily: T.serif, fontSize: 42, lineHeight: 1, marginTop: 10, color: T.attention }}>$380,000</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 18, paddingTop: 16, borderTop: "1px solid " + T.rule, lineHeight: 1.65 }}>
            Payroll of $286,000 and sub-vendor bills of $94,000, against receivables of which $24,000 is already past sixty days. The bench burn is the slow bleed. This is the near one.
          </div>
        </Panel>
      </div>
      <Panel title="Where the margin comes from">
        {[["Own consultant, direct client", 38, 18], ["Own consultant, via a prime", 22, 6],
          ["Network consultant, direct client", 19, 11], ["Network consultant, via a prime", 9, 4]].map(function (r, i) {
          return (
            <div key={i} style={{ padding: "11px 0", borderBottom: i < 3 ? "1px solid " + T.rule : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7, gap: 10 }}>
                <span style={{ fontSize: 13 }}>{r[0]} <span style={{ color: T.faint }}>· {r[2]}</span></span>
                <span style={{ fontFamily: T.serif, fontSize: 16, color: r[1] < 15 ? T.attention : T.ink }}>{r[1]}%</span>
              </div>
              <div style={{ height: 3, background: "#E9E6DC", borderRadius: 3 }}>
                <div style={{ height: 3, width: r[1] * 2.4 + "%", background: r[1] < 15 ? T.attention : T.ink, borderRadius: 3, opacity: .75 }} />
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 12.5, color: T.muted, marginTop: 15, lineHeight: 1.65 }}>
          Margin fell one and eight tenths of a point this quarter because network placements grew from a fifth of the book to well over a third. Volume rose. The quality of the revenue fell.
        </div>
      </Panel>
    </div>
  );
}

function VendSite() {
  const [tab, setTab] = useState("outcome");
  return (
    <div>
      <Head eyebrow="Grow · techvista.etyme.com" title="Your site is a channel, not a brochure"
        sub="It was written in ninety seconds and has not been touched since. Every bench change, job and cohort updates it without anyone editing anything." />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["outcome", "What it produced"], ["live", "The site"], ["edit", "Change it"]].map(function (o) {
          const on = tab === o[0];
          return (
            <button key={o[0]} onClick={function () { setTab(o[0]); }}
              style={{ padding: "9px 16px", borderRadius: 5, fontSize: 13, fontWeight: on ? 600 : 400, background: on ? T.ink : T.surface, color: on ? T.canvas : T.muted, border: on ? "none" : "1px solid " + T.rule }}>
              {o[1]}
            </button>
          );
        })}
      </div>

      {tab === "outcome" ? (
        <div>
          <div className="g4" style={{ marginBottom: 16 }}>
            <Stat l="Consultants it brought" v="5" s="this quarter, near zero cost" tone="v" />
            <Stat l="Applications" v="18" s="from the jobs page" />
            <Stat l="Cohort enrolments" v="7" s="from the training page" tone="v" />
            <Stat l="Bench page views" v="342" s="mostly from hotlists" />
          </div>

          <div className="g2">
            <Panel title="Where the visitors came from" sub="Twelve hundred and forty-seven in thirty days.">
              {[["Hotlist emails landing here", 412, "v"], ["Google Jobs, indexed automatically", 288, "v"],
                ["Typed the address directly", 301, "p"], ["LinkedIn and shared links", 246, "p"]].map(function (r, i) {
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, gap: 10 }}>
                      <span>{r[0]}</span><span style={{ fontFamily: T.serif, fontSize: 15 }}>{r[1]}</span>
                    </div>
                    <div style={{ height: 3, background: "#E9E6DC", borderRadius: 3 }}>
                      <div style={{ height: 3, width: (r[1] / 412) * 100 + "%", borderRadius: 3, background: r[2] === "v" ? T.verified : T.ink, opacity: .75 }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6, lineHeight: 1.65 }}>
                A third of your traffic is hotlist recipients clicking through to a bench page that is current. That is the difference between sending a PDF and sending a link.
              </div>
            </Panel>

            <Panel title="What is working and what is not">
              <div style={{ padding: "12px 0", borderBottom: "1px solid " + T.rule }}>
                <div style={{ fontSize: 13.5, color: T.verified, fontWeight: 500 }}>Training page converts</div>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 5, lineHeight: 1.6 }}>
                  Seven of ninety-one visitors enrolled. That is unusually high, and those seven cost you nothing to reach.
                </div>
              </div>
              <div style={{ padding: "12px 0" }}>
                <div style={{ fontSize: 13.5, color: T.attention, fontWeight: 500 }}>The bench page does not</div>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 5, lineHeight: 1.6 }}>
                  Three hundred and forty-two views produced two enquiries. People are looking and leaving. The page shows skills and availability but nothing about verified hours, which is the one thing on it a competitor cannot copy.
                </div>
                <button style={{ fontSize: 12.5, color: T.action, fontWeight: 500, marginTop: 9 }}>Show verified hours on the bench page</button>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === "live" ? (
        <div>
          <div style={{ background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "9px 14px", borderBottom: "1px solid " + T.rule, display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ display: "flex", gap: 5 }}>
                <div style={{ width: 9, height: 9, borderRadius: 9, background: "#E0C3B4" }} />
                <div style={{ width: 9, height: 9, borderRadius: 9, background: "#E5D5B4" }} />
                <div style={{ width: 9, height: 9, borderRadius: 9, background: "#C4D5C4" }} />
              </div>
              <code style={{ fontSize: 11.5, color: T.muted }}>techvista.etyme.com</code>
            </div>
            <div style={{ padding: "34px 24px", background: T.canvas }}>
              <div style={{ fontFamily: T.serif, fontSize: 24 }}>TechVista Consulting</div>
              <div style={{ fontSize: 14, color: T.muted, marginTop: 8, lineHeight: 1.65, maxWidth: 420 }}>
                SAP talent that delivers. S/4HANA migrations, BRIM implementations and enterprise finance transformation.
              </div>
            </div>
            <div style={{ padding: "18px 24px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 11 }}>
                <Lbl>Available now</Lbl>
                <span style={{ fontSize: 11, color: T.verified }}>updated four minutes ago</span>
              </div>
              {[["SAP BRIM and BTE", "12 years", "H1B", "2,240"], ["SAP S/4 migration", "8 years", "US citizen", "3,800"], ["SAP FICO and RAR", "6 years", "GC", "1,280"]].map(function (c, i) {
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < 2 ? "1px solid " + T.rule : "none", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 13.5 }}>{c[0]}</div>
                      <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>{c[1]} experience</div>
                    </div>
                    <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                      <Chip tone={c[2] === "US citizen" ? "v" : c[2] === "GC" ? "b" : "a"}>{c[2]}</Chip>
                      <span style={{ fontSize: 11.5, color: T.verified }}>{c[3]} verified hrs</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Panel title="What maintains itself" sub="Nobody edits these. They read from the platform.">
            {[["Available bench", "Every hotlist link lands here. Changes the moment someone is placed or rolls off.", true],
              ["Open roles", "Published requirements, indexed for Google Jobs. Applications create a candidate record.", true],
              ["Training cohorts", "Published programmes with enrolment. Seven people joined through this.", true],
              ["Verified hours on each profile", "Currently switched off. It is the only thing on the page a competitor cannot copy.", false],
              ["About, contact, the words", "Written once by the model. Yours to change whenever.", false]].map(function (r, i) {
              return (
                <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < 4 ? "1px solid " + T.rule : "none" }}>
                  <div style={{ width: 5, height: 5, borderRadius: 5, marginTop: 7, flexShrink: 0, background: r[2] ? T.verified : T.faint }} />
                  <div>
                    <div style={{ fontSize: 13.5 }}>{r[0]} {r[2] ? <span style={{ fontSize: 11, color: T.verified }}>· live</span> : <span style={{ fontSize: 11, color: T.faint }}>· static</span>}</div>
                    <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4, lineHeight: 1.6 }}>{r[1]}</div>
                  </div>
                </div>
              );
            })}
          </Panel>
        </div>
      ) : null}

      {tab === "edit" ? (
        <div className="g2">
          <Panel title="Say what you want changed" sub="It edits the page, never the code. You see it before anyone else does.">
            <div style={{ background: T.canvas, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <Lbl>Now</Lbl>
              <div style={{ fontFamily: T.serif, fontSize: 19, marginTop: 7, lineHeight: 1.3 }}>SAP talent that delivers.</div>
            </div>
            <input placeholder="Lead with the training programme instead"
              style={{ width: "100%", height: 44, borderRadius: 6, border: "1px solid " + T.rule, background: T.surface, padding: "0 14px", fontSize: 14, outline: "none" }} />
            <button style={{ width: "100%", height: 44, marginTop: 10, borderRadius: 6, background: T.action, color: "#fff", fontSize: 14, fontWeight: 500 }}>Rewrite it</button>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 12, lineHeight: 1.65 }}>
              Nothing publishes until you say so, and every version is kept. Reverting is one click, not a support ticket.
            </div>
          </Panel>

          <Panel title="Your own address">
            <code style={{ display: "block", background: T.canvas, borderRadius: 6, padding: "11px 13px", fontSize: 13, color: T.action, marginBottom: 12 }}>techvista.etyme.com</code>
            <input placeholder="careers.techvista.com"
              style={{ width: "100%", height: 44, borderRadius: 6, border: "1px solid " + T.rule, background: T.surface, padding: "0 14px", fontSize: 14, outline: "none" }} />
            <button style={{ width: "100%", height: 44, marginTop: 10, borderRadius: 6, background: T.surface, border: "1px solid " + T.rule, fontSize: 14, fontWeight: 500 }}>Point your domain here</button>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 14, paddingTop: 13, borderTop: "1px solid " + T.rule, lineHeight: 1.65 }}>
              On your own domain the platform becomes invisible. Clients and candidates see TechVista, which is the point &mdash; the site is yours, the plumbing is ours.
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

/* ============ INFOSYS ============ */
function InfyDemand() {
  return (
    <div>
      <Head eyebrow="Demand · raised by Meera R." title="SAP BRIM consultant, Terumo, eight weeks"
        sub="Internal supply is checked before any external spend is approved. That gate is not optional." />
      <div style={{ background: T.surface, border: "1px solid #C9D6CA", borderRadius: 6, padding: 20, marginBottom: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 21, height: 21, borderRadius: 21, background: "#EDF1ED", border: "1px solid #C9D6CA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, color: T.verified, flexShrink: 0 }}>1</div>
          <div style={{ fontFamily: T.serif, fontSize: 17 }}>Internal supply, checked first</div>
        </div>
        {[
          { n: "Rajesh Venkataraman", e: "Infosys India, deputed US · SAP practice US", s: 87, conf: "high",
            basis: "eleven BRIM deputations over two years",
            f: [["Skill match", "strong", 92], ["Free from 16 August", "exact", 100], ["Visa for onsite", "H1B stamped", 90], ["Location", "relocation needed", 48]],
            u: "whether he will accept a Denver relocation. Nobody has asked him." },
          { n: "Kavitha S.", e: "Infosys India · SAP practice India", s: 64, conf: "moderate",
            basis: "offshore to onsite conversions in this practice",
            f: [["Skill match", "partial, no BTE", 61], ["Free from 1 September", "two weeks late", 55], ["Visa", "B1 only, needs petition", 22]],
            u: "petition timelines this quarter. The last three took between four and nine months." },
        ].map(function (c, i) {
          return (
            <div key={i} className="split" style={{ padding: "13px 0", borderBottom: i === 0 ? "1px solid " + T.rule : "none" }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 500 }}>{c.n}</div>
                <div style={{ fontSize: 12, color: T.faint, marginTop: 3 }}>{c.e}</div>
              </div>
              <div style={{ flexShrink: 0 }}><Why score={c.s} confidence={c.conf} basis={c.basis} factors={c.f} unknown={c.u} /></div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 9, marginTop: 15, flexWrap: "wrap" }}>
          <button style={{ background: T.action, color: "#fff", fontSize: 13.5, fontWeight: 500, padding: "9px 18px", borderRadius: 5 }}>Allocate Rajesh</button>
          <button style={{ fontSize: 13.5, padding: "9px 16px", borderRadius: 5, border: "1px solid " + T.rule, background: T.raised }}>Ask him about Denver</button>
        </div>
      </div>

      <div style={{ background: T.surface, border: "1px solid " + T.rule, borderRadius: 6, padding: 20, opacity: .62 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
          <div style={{ width: 21, height: 21, borderRadius: 21, background: T.canvas, border: "1px solid " + T.rule, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, color: T.faint, flexShrink: 0 }}>2</div>
          <div style={{ fontFamily: T.serif, fontSize: 17 }}>Subcontractor panel</div>
          <Lock size={13} color={T.faint} />
        </div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.65 }}>
          Locked while an internal match above eighty percent exists. Releasing to the panel needs a reason recorded, because every subcontracted hour is margin the practice does not keep.
        </div>
        <button style={{ fontSize: 12.5, color: T.muted, marginTop: 11, textDecoration: "underline" }}>Release anyway, with a reason</button>
      </div>
    </div>
  );
}

function InfyUtil() {
  return (
    <div>
      <Head eyebrow="SAP practice, US" title="Eighty-seven percent"
        sub="Scoped to your practice. You see supply across the whole firm, but you can commit only within your own unit." />
      <div className="g4" style={{ marginBottom: 16 }}>
        <Stat l="Utilization" v="87%" s="target 92" tone="a" /><Stat l="On bench" v="6" s="of 47" />
        <Stat l="Average idle" v="34 days" s="was 21" tone="a" /><Stat l="Redeployed" v="62%" s="of rolloffs" />
      </div>
      <div className="g2">
        <Panel title="By pod">
          {[["BRIM and billing", 96, 12], ["FICO and controlling", 91, 15], ["S/4 migration", 84, 11], ["IS-Retail and CAR", 61, 9]].map(function (r, i) {
            return (
              <div key={i} style={{ marginBottom: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, gap: 10 }}>
                  <span>{r[0]} <span style={{ color: T.faint }}>· {r[2]}</span></span>
                  <span style={{ fontFamily: T.serif, fontSize: 15, color: r[1] < 75 ? T.attention : T.ink }}>{r[1]}%</span>
                </div>
                <div style={{ height: 3, background: "#E9E6DC", borderRadius: 3 }}>
                  <div style={{ height: 3, width: r[1] + "%", borderRadius: 3, background: r[1] < 75 ? T.attention : r[1] > 93 ? T.verified : T.ink, opacity: .8 }} />
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.6 }}>
            IS-Retail is carrying the bench. BRIM is over-committed, which is why the Terumo demand had only one strong internal match.
          </div>
        </Panel>
        <Panel title="Rolloff, next ninety days" sub="Four of eleven have no plan yet.">
          {[["0 to 30 days", 4, 3, 1], ["31 to 60 days", 3, 2, 1], ["61 to 90 days", 4, 2, 2]].map(function (r, i) {
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < 2 ? "1px solid " + T.rule : "none", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13 }}>{r[0]}</span>
                <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
                  <span style={{ fontSize: 12, color: T.faint }}>{r[1]} rolling</span>
                  <span style={{ fontSize: 12, color: T.verified }}>{r[2]} planned</span>
                  <Chip tone={r[3] > 1 ? "a" : "p"}>{r[3]} at risk</Chip>
                </div>
              </div>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}

/* ============ APPLIED MATERIALS ============ */
function AmatProgram() {
  return (
    <div>
      <Head eyebrow="Contingent program · third quarter" title="Four hundred and eighty-seven contractors"
        sub="Assembled from twelve vendors who each run their own operations here. You were invited in by them, not sold to." />
      <div className="g4" style={{ marginBottom: 16 }}>
        <Stat l="Active" v="487" s="across 12 vendors" /><Stat l="Quarterly spend" v="$18.4m" s="94% of budget" />
        <Stat l="Work authorization" v="100%" s="verified" tone="v" /><Stat l="Expiring 30 days" v="23" s="visas, contracts" tone="a" />
      </div>
      <div className="gside">
        <Panel title="Vendor scorecards" sub="Built from work that ran here, not from what they told you in the review.">
          {[["TechVista Consulting", 47, "98%", "v"], ["CloudStaff Inc", 62, "94%", "v"],
            ["TechBridge Solutions", 38, "89%", "a"], ["Apex SAP Solutions", 21, "96%", "v"]].map(function (r, i) {
            return (
              <div key={i} className="score" style={{ padding: "11px 0", borderBottom: i < 3 ? "1px solid " + T.rule : "none" }}>
                <span style={{ fontSize: 13.5 }}>{r[0]}</span>
                <span style={{ fontSize: 12, color: T.muted }}>{r[1]} people</span>
                <span style={{ fontSize: 12, color: T.muted }}>{r[2]} on time</span>
                <Chip tone={r[3]}>{r[3] === "v" ? "Clear" : "Review"}</Chip>
              </div>
            );
          })}
        </Panel>
        <Panel title="Needs someone">
          {[["Eight visas expire within sixty days", "a"], ["TechBridge has three timesheets overdue", "a"],
            ["Fourteen contracts end this month", "p"], ["Two contractors eligible for conversion", "p"]].map(function (r, i) {
            return (
              <div key={i} style={{ display: "flex", gap: 11, padding: "10px 0", borderBottom: i < 3 ? "1px solid " + T.rule : "none" }}>
                <div style={{ width: 5, height: 5, borderRadius: 5, marginTop: 6, flexShrink: 0, background: r[1] === "a" ? T.attention : T.faint }} />
                <span style={{ fontSize: 13, flex: 1, lineHeight: 1.45 }}>{r[0]}</span>
              </div>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}

function AmatTalent() {
  const [f, setF] = useState("alumni");
  const rows = [
    { s: "SAP BRIM and BTE", av: "15 August", visa: "H1B", rate: "$120 to $145", hrs: 2240, alum: "you", note: "Fourteen months here on revenue recognition. You approved his timesheets." },
    { s: "SAP S/4 migration", av: "Now", visa: "US citizen", rate: "$100 to $125", hrs: 3800, alum: "company", note: "Eighteen months on the ECC cutover, a different business unit." },
    { s: "SAP BRIM subscription", av: "28 August", visa: "GC", rate: "$110 to $140", hrs: 1280, alum: "project", note: "Billing harmonisation, your department, last year." },
    { s: "SAP FICO asset accounting", av: "September", visa: "GC", rate: "$105 to $130", hrs: 1600, alum: null, note: null },
  ];
  const shown = f === "alumni" ? rows.filter(function (r) { return r.alum; }) : rows;
  return (
    <div>
      <Head eyebrow="Talent network" title="People your vendors already have"
        sub="Anonymised, and visible only because each vendor chose to show them. Names are released when you and they agree, not before." />
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[["all", "Everyone available"], ["alumni", "Worked here before"]].map(function (o) {
          const on = f === o[0];
          return (
            <button key={o[0]} onClick={function () { setF(o[0]); }}
              style={{ padding: "9px 16px", borderRadius: 5, fontSize: 13, fontWeight: on ? 600 : 400, background: on ? T.ink : T.surface, color: on ? T.canvas : T.muted, border: on ? "none" : "1px solid " + T.rule }}>
              {o[1]} ({o[0] === "all" ? rows.length : rows.filter(function (r) { return r.alum; }).length})
            </button>
          );
        })}
      </div>
      {shown.map(function (r, i) {
        return (
          <div key={i} style={{ background: T.surface, border: "1px solid " + (r.alum ? "#C9D6CA" : T.rule), borderRadius: 6, padding: 18, marginBottom: 11 }}>
            <div className="split">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: T.serif, fontSize: 18 }}>{r.s}</span>
                  {r.alum === "you" ? <Chip tone="v">You approved their timesheets</Chip> : null}
                  {r.alum === "company" ? <Chip tone="v">Worked here before</Chip> : null}
                  {r.alum === "project" ? <Chip tone="v">Your department</Chip> : null}
                </div>
                {r.note ? <div style={{ fontSize: 12.5, color: T.verified, marginTop: 8, lineHeight: 1.6 }}>{r.note}</div> : null}
                <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12, color: T.muted, flexWrap: "wrap", alignItems: "center" }}>
                  <span>Available {r.av}</span><Chip tone={r.visa === "US citizen" ? "v" : r.visa === "GC" ? "b" : "a"}>{r.visa}</Chip>
                  <span>{r.rate}</span><span style={{ color: T.verified }}>{r.hrs.toLocaleString()} verified hours</span>
                </div>
              </div>
              <button style={{ background: T.action, color: "#fff", fontSize: 13, fontWeight: 500, padding: "10px 16px", borderRadius: 5, flexShrink: 0 }}>Ask for this person</button>
            </div>
          </div>
        );
      })}
      <div style={{ background: T.canvas, border: "1px dashed " + T.rule, borderRadius: 6, padding: 16, fontSize: 12, color: T.muted, lineHeight: 1.65 }}>
        No names, no vendor names, no exact rates. Asking for someone routes to whichever vendor holds them &mdash; they keep the submission, the rate negotiation and the relationship. This view exists to stop you hiring externally for a skill you are already paying for.
      </div>
    </div>
  );
}

/* ============ ROOT ============ */
export default function Demo() {
  const [view, setView] = useState("home");
  const [page, setPage] = useState("");

  function go(v) {
    setView(v);
    setPage(v === "cand" ? "record" : v === "vend" ? "today" : v === "infy" ? "demand" : v === "amat" ? "program" : "");
  }

  let body;
  if (view === "home") body = <Home go={go} />;
  else if (view === "login") body = <Login go={go} />;
  else if (view === "cand") body = (
    <Shell org="Rajesh Venkataraman" role="Consultant · SAP BRIM"
      nav={[{ s: "You" }, { id: "record", l: "Your record" }, { id: "control", l: "Who may market you", badge: 1 },
            { id: "roles", l: "Open roles", badge: 12 }, { id: "msg", l: "Messages", badge: 1 },
            { s: "Grow" }, { id: "mentors", l: "Mentors" }, { id: "ask", l: "Ask" }]}
      page={page} setPage={setPage}>
      {page === "record" ? <CandRecord /> : page === "control" ? <CandControl /> : <Blank title="This screen" />}
    </Shell>
  );
  else if (view === "vend") body = (
    <Shell org="TechVista Consulting" role="Sharath M. · owner"
      nav={[{ s: "Today" }, { id: "today", l: "Yours to decide", badge: 3 },
            { s: "Sell" }, { id: "reqs", l: "Requirements" }, { id: "bench", l: "Bench" }, { id: "subs", l: "Submissions" }, { id: "roll", l: "Rolloff" },
            { s: "Procure" }, { id: "psupply", l: "Partner supply" }, { id: "vendors", l: "Sub-vendors" },
            { s: "Operate" }, { id: "money", l: "Money" }, { id: "time", l: "Timesheets" }, { id: "docs", l: "Documents" },
            { s: "Grow" }, { id: "site", l: "Website" }, { id: "channels", l: "Channels" }, { id: "training", l: "Training" }]}
      page={page} setPage={setPage}>
      {page === "today" ? <VendToday /> : page === "reqs" ? <VendReqs /> : page === "money" ? <VendMoney /> : page === "site" ? <VendSite /> : <Blank title="This screen" />}
    </Shell>
  );
  else if (view === "infy") body = (
    <Shell org="Infosys · SAP practice, US" role="Meera R. · delivery manager"
      nav={[{ s: "Deliver" }, { id: "demand", l: "Open demand", badge: 3 }, { id: "util", l: "Utilization" },
            { id: "roll", l: "Rolloff forecast" }, { s: "Supply" }, { id: "bench", l: "Practice bench" },
            { id: "panel", l: "Subcontractor panel" }, { s: "Operate" }, { id: "time", l: "Timesheets" }, { id: "inter", l: "Intercompany" }]}
      page={page} setPage={setPage}>
      {page === "demand" ? <InfyDemand /> : page === "util" ? <InfyUtil /> : <Blank title="This screen" />}
    </Shell>
  );
  else body = (
    <Shell org="Applied Materials" role="Sarah Chen · contingent program"
      nav={[{ s: "Program" }, { id: "program", l: "Overview" }, { id: "talent", l: "Talent network", badge: 3 },
            { id: "workers", l: "Contractors" }, { s: "Governance" }, { id: "comp", l: "Compliance" },
            { id: "vendors", l: "Vendors" }, { id: "appr", l: "Approvals", badge: 6 }]}
      page={page} setPage={setPage}>
      {page === "program" ? <AmatProgram /> : page === "talent" ? <AmatTalent /> : <Blank title="This screen" />}
    </Shell>
  );

  return (
    <div style={{ fontFamily: T.sans, color: T.ink }}>
      <style>{CSS}</style>
      {body}
      <div style={{ position: "fixed", bottom: 14, left: 10, right: 10, display: "flex", justifyContent: "center", zIndex: 100, pointerEvents: "none" }}>
        <div style={{ background: T.ink, borderRadius: 26, padding: "6px 7px", display: "flex", gap: 2, maxWidth: "100%", overflowX: "auto", pointerEvents: "auto", boxShadow: "0 8px 30px rgba(31,30,29,.28)" }}>
          {[["home", "Home"], ["login", "Sign in"], ["vend", "TechVista"], ["cand", "Consultant"], ["infy", "Infosys"], ["amat", "Applied Materials"]].map(function (o) {
            const on = view === o[0];
            return (
              <button key={o[0]} onClick={function () { go(o[0]); }} className="pill"
                style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: on ? 600 : 400, background: on ? T.canvas : "transparent", color: on ? T.ink : "#9C9891", flexShrink: 0 }}>
                {o[1]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
