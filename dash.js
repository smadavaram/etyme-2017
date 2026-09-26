/* Dashboard illustrations for the marketing site. The shell, menus and styling follow the product
   (etyme2040: components/shell/sidebar.tsx, app/globals.css); the content is the operating-model data
   in model.js — a party (L1), its value streams (L2), the stations (L3), the desk's task and the rule (L4). */
(function(){
  var M=window.ETYME_MODEL; if(!M) return;
  var P={
    home:'<path d="M4 11l8-7 8 7"/><path d="M6 10v10h5v-6h2v6h5V10"/>',
    req:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
    people:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.6-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.4c2.5.2 4.2 1.7 4.8 4.6"/>',
    user:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.4-6 7-6s6.2 2.2 7 6"/>',
    doc:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 13l2 2 4-4"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    invoice:'<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    pay:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9h.01M18 15h.01"/>',
    chart:'<path d="M4 20h16M7 16v-6M12 16V6M17 16v-3"/>',
    shield:'<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plug:'<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    chat:'<path d="M4 5h16v11H9l-5 4z"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    warn:'<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    star:'<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/>',
    upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
    check:'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
    idcard:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M6 16c.4-1.6 1.6-2.5 3-2.5s2.6.9 3 2.5M14 10h4M14 13h4"/>',
    building:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h3M13 7h3M8 11h3M13 11h3M8 15h3M13 15h3M10 21v-3h4v3"/>',
    phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    block:'<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
    book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
    erp:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    lanes:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
    network:'<circle cx="5" cy="6" r="2.2"/><circle cx="19" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M7 7l4 9M17 7l-4 9M7.2 6h9.6"/>',
    factory:'<path d="M3 21V10l6 3V10l6 3V10l6 3v8z"/><path d="M7 21v-4M12 21v-4M17 21v-4"/>'
  };
  function ic(n,s){ s=s||16; return '<svg class="ic" width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[n]||P.doc)+'</svg>'; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
  var PICON={client:'building',gsi:'network',msp:'req',prime:'briefcase',sub:'factory',bench:'people',self:'idcard',candidate:'user',cand_ind:'user',cand_emp:'user'};
  var PAGE={client:'docs-client.html',gsi:'docs-systems-integrator.html',msp:'docs-msp-program-office.html',prime:'docs-prime-vendor.html',sub:'docs-sub-vendor.html',bench:'docs-bench-vendor.html',self:'docs-self-employed.html',candidate:'docs-candidate.html',cand_ind:'docs-candidate-independent.html',cand_emp:'docs-candidate-employee.html'};
  /* The seeded company behind each party, and the label the product prints under it (lib/parties kindLabel). */
  var COMPANY={client:['Northbend Athletic','Client · Enterprise'],gsi:['Teleworld Solutions','Integrator · Delivery'],msp:['Aptiva Workforce','Program office · MSP'],prime:['Computer Systems Inc','Supplier · Staffing'],sub:['Vertex Global','Supplier · Staffing'],bench:['CloudEPA','Supplier · Staffing'],self:['Byrne Critical Care LLC','Own company · One person'],candidate:['Helena Marsh','Consultant'],cand_ind:['Marisol Quintero','Consultant'],cand_emp:['Karthik Menon','Consultant · Teleworld Solutions']};
  /* The product's menus, one per company kind (components/shell/sidebar.tsx). [section, [group|null, label, icon]...] */
  var TODAY=[[null,'Dashboard','home'],[null,'Needs attention','warn'],[null,'Conversations','chat'],[null,'Notifications','bell']];
  var NETWORK=[['Network','Suppliers','building'],['Network','Companies','building'],['Network','Contacts','phone']];
  var CT=[['Contracts & time','Sell contracts','doc'],['Contracts & time','Buy contracts','doc'],['Contracts & time','POs','req'],['Contracts & time','Timesheets','clock'],['Contracts & time','Expenses','invoice']];
  var MONEY=[['Money','Invoices','invoice'],['Money','AR','pay'],['Money','AP','pay'],['Money','Payroll','pay'],['Money','Commissions','star']];
  var GOV=[['Compliance','Compliance','shield'],['Compliance','Paperwork','doc'],['Compliance','Document requests','mail'],['Compliance','Screening packs','check'],['Compliance','Check queue','check'],['Compliance','DNR list','block'],['Privacy','Data requests','shield'],['Privacy','Your data','user'],['Admin','Users & permissions','people'],['Admin','Settings','gear'],['Admin','Automation','gear'],['Admin','Integrations','plug'],['Admin','Import','upload'],['Admin','Setup','check']];
  function operate(net,money){ return [[null,'Missing paperwork','link']].concat(net,CT,money); }
  var SELL=[[null,'Leads','star'],[null,'Shared with you','mail'],[null,'Requirements','req'],[null,'Submissions','people'],[null,'Interviews','clock'],[null,'Rolloff','warn']];
  var PROCURE=[[null,'Bench','people'],[null,'Consultants','user'],[null,'Bench check-ins','phone'],[null,'Training','book']];
  var GROW=[[null,'Profitability','chart'],[null,'Reports','chart'],[null,'Rate history','clock'],[null,'Your scorecard','star']];
  var VENDOR_NAV=[['Today',TODAY],['Sell',SELL],['Procure',PROCURE],['Operate',operate(NETWORK,MONEY)],['Grow',GROW],['Governance',GOV]];
  var GSI_NAV=[['Today',TODAY],['Deliver',SELL.slice(1)],['Supply',PROCURE],['Operate',operate(NETWORK,MONEY)],['Grow',GROW],['Governance',GOV]];
  var MSP_NAV=[['Today',TODAY],['Demand',SELL.slice(1)],['Supply',[[null,'Suppliers','building'],[null,'Supplier scorecards','star'],[null,'Bench','people'],[null,'Consultants','user'],[null,'Bench check-ins','phone']]],['Operate',operate(NETWORK.slice(1),MONEY.slice(0,4))],['Grow',GROW.slice(0,3)],['Governance',GOV]];
  var CLIENT_NAV=[['Workforce',[[null,'Dashboard','home'],['Hire','Requirements','req'],['Hire','Submissions','people'],['Hire','Conversations','chat'],['Network','Contractors','user'],['Network','Suppliers','building'],['Network','Contacts','phone'],['Operate','Contracts','doc'],['Operate','POs','req'],['Operate','Timesheets','clock'],['Operate','Expenses','invoice'],['Money','Invoices','invoice'],['Money','AP','pay'],['Money','Budget','chart'],['Offboard','Ending soon','warn'],['Offboard','Past contractors','user']]],
    ['Governance',[['Who runs it','Program team','people'],['Who runs it','Program office','building'],['Who runs it','Org view','network'],['Oversight','Compliance','shield'],['Oversight','Document requests','mail'],['Oversight','Tenure','clock'],['Oversight','Supplier scorecards','star'],['Oversight','Duplicate check','check'],['Privacy','Data requests','shield'],['Privacy','Your data','user'],['Setup','Users & permissions','people'],['Setup','Settings','gear'],['Setup','Import','upload']]]];
  var YOU=[[null,'Your work','home'],[null,'Your page','user'],[null,'Who has you','people'],[null,'Your data','shield'],[null,'Your paperwork','doc']];
  var SOLO_NAV=[['Today',TODAY.slice(1)],['Operate',[[null,'Contracts','doc'],[null,'POs','req'],[null,'Timesheets','clock'],[null,'Invoices','invoice'],[null,'Expenses','invoice'],[null,'AR','pay']]],['Governance',[[null,'Compliance','shield'],[null,'Company paperwork','doc'],[null,'Settings','gear']]],['You',YOU]];
  var CONSULTANT_NAV=[['You',YOU.concat([[null,'Notifications','bell']])]];
  var NAV={client:CLIENT_NAV,gsi:GSI_NAV,msp:MSP_NAV,prime:VENDOR_NAV,sub:VENDOR_NAV,bench:VENDOR_NAV,self:SOLO_NAV,candidate:CONSULTANT_NAV,cand_ind:CONSULTANT_NAV,cand_emp:CONSULTANT_NAV};
  /* Which menu entry a value stream opens, so the rail highlights the page the stations belong to. */
  var OPEN={'L1.1':['Requirements','Submissions','Your work'],'L1.2':['Contracts','Sell contracts','Your work'],'L1.3':['Timesheets','Your work'],'L1.4':['Invoices','Your work'],'L1.5':['AP','Payroll','AR','Your work'],'L1.6':['Reports','Budget','Your work'],'L1.7':['Compliance','Your paperwork','Your data'],'L1.3 → L1.5':['Expenses','Your work']};
  var SECTION_FOR_STREAM={};
  var IP=[['Concur',/files an expense|expense report|reimburs/i],['HCM',/payroll|\bw-?2\b|onboard|i-9|position|headcount|worker record|employment/i],['SAP S/4',/purchase order|sales order|work order|invoice|\bbill\b|journal|\berp\b|ledger|payment|pay run|remittance|vendor master|requisition/i]];
  function ipoint(st){ var t=(st.title+' '+st.sub); for(var i=0;i<IP.length;i++) if(IP[i][1].test(t)) return IP[i][0]; return null; }
  function slug(code){ return code==='L1.3 → L1.5'?'expenses':code.toLowerCase().replace(/\./g,'-'); }
  function initials(name){ var w=name.replace(/[^A-Za-z ]/g,' ').trim().split(/\s+/).filter(Boolean); var s=(w[0]||'').charAt(0)+(w[1]||'').charAt(0); if(s.length<2) s=(w[0]||'??').slice(0,2); return s.toUpperCase(); }
  function party(k){ for(var i=0;i<M.parties.length;i++) if(M.parties[i].meta.key===k) return M.parties[i]; return M.parties[0]; }
  function stream(p,code){ for(var i=0;i<p.streams.length;i++) if(p.streams[i].code===code) return p.streams[i]; return p.streams[0]; }
  function words(s){ return s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(function(w){return w.length>3;}); }
  function glossFor(st,title){ var tw=words(title); for(var i=0;i<st.glossary.length;i++){ var gw=words(st.glossary[i].etyme); for(var a=0;a<tw.length;a++) for(var b=0;b<gw.length;b++) if(tw[a]===gw[b]||tw[a].indexOf(gw[b])===0||gw[b].indexOf(tw[a])===0) return st.glossary[i]; } return null; }

  function activeLabel(nav, code){
    var wants=OPEN[code]||[]; var labels=[]; nav.forEach(function(sec){ sec[1].forEach(function(it){ labels.push(it[1]); }); });
    for(var i=0;i<wants.length;i++) if(labels.indexOf(wants[i])>=0) return wants[i];
    return labels[0];
  }
  function railHtml(m, nav, active){
    var co=COMPANY[m.key]||[m.label,m.label];
    var out='<aside class="d-side"><div class="d-logo"><img src="img/icon.svg" alt="" width="28" height="28"><span>etyme</span></div><nav class="d-navlist">';
    nav.forEach(function(sec){
      out+='<p class="grp">'+esc(sec[0])+'</p>'; var prev=null;
      sec[1].forEach(function(it){
        if(it[0]&&it[0]!==prev) out+='<p class="sub">'+esc(it[0])+'</p>'; prev=it[0];
        var isActive=it[1]===active, isInt=it[1]==='Integrations';
        out+='<a class="d-nav'+(isActive?' on':'')+'" href="'+(isInt?'docs-integrations.html':'#')+'"'+(isActive?' aria-current="page"':'')+(isInt?'':' data-inert="1"')+'>'+ic(it[2],15)+'<span>'+esc(it[1])+'</span></a>';
      });
    });
    out+='</nav><div class="d-co"><b>'+esc(co[0])+'</b><span>'+esc(co[1])+'</span></div></aside>';
    return out;
  }
  function headerHtml(m){
    var co=COMPANY[m.key]||[m.label,m.label];
    return '<div class="d-bar"><button type="button" class="d-burger" aria-label="Menu">'+ic('menu',18)+'</button><div class="d-search">'+ic('search',15)+'<span>Search '+esc(co[0])+'</span><kbd>⌘K</kbd></div><button type="button" class="d-plus">'+ic('plus',14)+'New</button><span class="d-ic" aria-label="Notifications">'+ic('bell',18)+'<i></i></span><span class="av">'+initials(co[0])+'</span></div>';
  }

  function render(box, pkey, code, openN, filt){
    filt=filt||'all';
    var p=party(pkey), m=p.meta, st=stream(p,code), nav=NAV[m.key]||CONSULTANT_NAV, co=COMPANY[m.key]||[m.label,m.label];
    var active=activeLabel(nav, st.code), section=''; nav.forEach(function(sec){ sec[1].forEach(function(it){ if(it[1]===active) section=sec[0]; }); });
    var lanesUsed=[]; st.stations.forEach(function(s){ if(s.lane&&lanesUsed.indexOf(s.lane)<0) lanesUsed.push(s.lane); }); var own=lanesUsed.filter(function(l){ return m.desks.indexOf(l)>=0; }).length;
    var tabs='<div class="tabs dash-tabs" role="tablist">'+M.parties.map(function(q){ return '<button role="tab" data-party="'+q.meta.key+'" aria-selected="'+(q.meta.key===m.key)+'">'+ic(PICON[q.meta.key]||'user',15)+q.meta.number+' · '+esc(q.meta.label)+'</button>'; }).join('')+'</div>';
    var head='<div class="page-head"><p class="eyebrow">'+esc(section)+' · '+esc(co[0])+'</p><div class="dash-head-row"><div><h1>'+esc(st.name)+'</h1><p>'+esc(st.caption||m.tagline)+'</p></div><a class="btn-secondary" href="'+PAGE[m.key]+'#'+slug(st.code)+'">Read the drawing &rarr;</a></div></div>';
    var streams='<div class="d-tabs">'+p.streams.map(function(s){ return '<button type="button" class="filter-tab '+(s.code===st.code?'filter-tab--active':'filter-tab--inactive')+'" data-stream="'+esc(s.code)+'">'+esc(s.short)+'</button>'; }).join('')+'</div>';
    var stats='<div class="d-stats">'+[['Desks on the drawing',lanesUsed.length,own+' of yours · '+(lanesUsed.length-own)+' counterpart'+((lanesUsed.length-own)===1?'y':'ies')],['Stations',st.stations.length,'in the order the work happens'],['Refusals',st.refusals.length,'blocks said in a sentence'],['Proven by',st.sentences,'test sentences on this branch']].map(function(t){ return '<div class="card d-stat"><div class="stat-label">'+esc(t[0])+'</div><div class="stat-value">'+esc(t[1])+'</div><div class="stat-sub">'+esc(t[2])+'</div></div>'; }).join('')+'</div>';
    var ips=st.stations.filter(function(x){return ipoint(x);});
    var edge='<div class="panel d-edge"><span class="eyebrow">Integration points</span>'+(ips.length?ips.map(function(x){ return '<span class="chip chip--passive">'+x.n+' '+esc(x.title)+' → '+esc(ipoint(x))+'</span>'; }).join(''):'<span class="chip chip--passive">none on this stream</span>')+'<span class="s">A marker means a document at that station can come from or go to an edge system. The systems are set up under Governance › Settings › <a href="docs-integrations.html">Integrations</a>.</span></div>';
    var seg='<div class="d-seg"><div class="seg">'+[['all','All stations'],['refuse','With a refusal'],['record','Records only']].map(function(f){ return '<button type="button" data-filt="'+f[0]+'" aria-pressed="'+(filt===f[0])+'">'+f[1]+'</button>'; }).join('')+'</div><span class="d-count">'+st.stations.length+' stations · '+lanesUsed.length+' desks</span></div>';
    var rows=st.stations.filter(function(s){ var has=st.refusals.some(function(r){return r.station===s.n;}); return filt==='all'||(filt==='refuse'&&has)||(filt==='record'&&!has); }).map(function(s){
      var rf=st.refusals.filter(function(r){return r.station===s.n;});
      var rule=rf.length?rf.map(function(r){return '<span class="chip chip--danger">'+esc(r.text)+'</span>';}).join(' '):'<span class="chip chip--passive">records</span>';
      var open=(openN===s.n); var ipn=ipoint(s);
      var row='<tr class="dash-row" data-n="'+s.n+'" aria-expanded="'+open+'"><td><span class="num">'+s.n+'</span></td><td><b>'+esc(s.title)+'</b>'+(ipn?' <span class="chip chip--passive ip" title="Integration point">'+ic('erp',11)+esc(ipn)+'</span>':'')+'</td><td><span class="chip chip--action">'+esc(s.lane||'—')+'</span></td><td>'+esc(s.sub)+'</td><td>'+rule+'</td></tr>';
      if(!open) return row;
      var g=glossFor(st,s.title);
      var sys=rf.length?'<ul>'+rf.map(function(r){return '<li>'+ic('block',14)+esc(r.text)+'</li>';}).join('')+'</ul>':'<p>Nothing is refused at this station. The system writes a row saying who did it and when, so it can be audited later.</p>';
      var l4='<tr class="dash-l4"><td colspan="5"><div class="dash-l4-grid">'+
        '<div>'+ic('user',18)+'<b>The desk does</b><p><strong>'+esc(s.title)+'</strong>'+(s.sub?' — '+esc(s.sub):'')+'</p><p class="mut">Desk: '+esc(s.lane||'—')+'</p></div>'+
        '<div>'+ic('gear',18)+'<b>The system does</b>'+sys+'</div>'+
        (ipn?'<div>'+ic('erp',18)+'<b>Integration point</b><p>A document at this station can come from or go to <strong>'+esc(ipn)+'</strong>.</p><p class="mut">Set up under Governance › Settings › Integrations. Etyme keeps the record; the edge system keeps its own.</p></div>':'')+
        (g?'<div>'+ic('book',18)+'<b>Etyme says · what SAP calls it</b><p><strong>'+esc(g.etyme)+'</strong> — '+esc(g.sap)+'</p><p class="mut">'+esc(g.note)+'</p></div>':'<div>'+ic('lanes',18)+'<b>Lanes this stream crosses</b><p>'+esc(st.lanes.map(function(l){return l.name;}).join(' · '))+'</p><p class="mut">Every arrow into another party’s lane is a document that party reads.</p></div>')+
        '</div></td></tr>';
      return row+l4;
    }).join('');
    var table='<div class="scrollx panel d-panel"><table class="data-table tabular"><thead><tr><th>#</th><th>Station</th><th>Desk</th><th>What happens</th><th>System rule</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
    var cap='<p class="dash-cap"><b>L1 '+esc(m.label)+' · L2 '+esc(st.short)+' · L3 '+st.stations.length+' stations</b>The menu is the product’s own for this kind of company; open a station for its task and the system’s rule (L4). Wording and refusals are taken from the operating-model document for this party.</p>';
    box.innerHTML=tabs+'<div class="d-shell dash-shell">'+railHtml(m,nav,active)+'<div class="d-main">'+headerHtml(m)+'<div class="d-content">'+head+streams+stats+edge+seg+table+'</div></div></div>'+cap;
    box.dataset.party=m.key; box.dataset.stream=st.code; box.dataset.filt=filt;
    box.querySelectorAll('.dash-tabs button').forEach(function(b){ b.addEventListener('click',function(){ render(box,b.dataset.party,box.dataset.stream,null,'all'); var sel=box.querySelector('.dash-tabs [aria-selected="true"]'); if(sel&&sel.scrollIntoView) sel.scrollIntoView({block:'nearest',inline:'center'}); }); });
    box.querySelectorAll('[data-stream]').forEach(function(a){ a.addEventListener('click',function(e){ e.preventDefault(); render(box,box.dataset.party,a.dataset.stream,null,'all'); }); });
    box.querySelectorAll('[data-inert]').forEach(function(a){ a.addEventListener('click',function(e){ e.preventDefault(); }); });
    box.querySelectorAll('.d-seg button').forEach(function(f){ f.addEventListener('click',function(){ render(box,box.dataset.party,box.dataset.stream,null,f.dataset.filt); }); });
    box.querySelectorAll('.dash-row').forEach(function(r){ r.addEventListener('click',function(e){ if(e.target.closest('a')) return; var n=parseInt(r.dataset.n,10); render(box,box.dataset.party,box.dataset.stream,openN===n?null:n,box.dataset.filt); }); });
    var side=box.querySelector('.d-side'), on=side&&side.querySelector('.d-nav.on'); if(on&&side.scrollHeight>side.clientHeight){ var sr=side.getBoundingClientRect(), orr=on.getBoundingClientRect(); if(orr.top<sr.top||orr.bottom>sr.bottom){ side.scrollTop=Math.max(0,side.scrollTop+(orr.top-sr.top)-side.clientHeight/2); } }
  }
  document.querySelectorAll('.dash[data-stream]').forEach(function(box){ render(box, box.dataset.party||'client', box.dataset.stream, null, 'all'); });
})();
