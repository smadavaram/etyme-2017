/* Dashboards built from the operating-model documents (window.ETYME_MODEL, see model.js).
   L1 a party · L2 its value streams · L3 the stations in a stream · L4 the desk's task and the system's rule.
   Integrations live under Settings; a station only carries a marker where a document crosses to an edge system. */
(function(){
  var M=window.ETYME_MODEL; if(!M) return;
  var P={
    building:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h3M13 7h3M8 11h3M13 11h3M8 15h3M13 15h3M10 21v-3h4v3"/>',
    briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
    users:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.6-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.4c2.5.2 4.2 1.7 4.8 4.6"/>',
    idcard:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M6 16c.4-1.6 1.6-2.5 3-2.5s2.6.9 3 2.5M14 10h4M14 13h4"/>',
    user:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.4-6 7-6s6.2 2.2 7 6"/>',
    network:'<circle cx="5" cy="6" r="2.2"/><circle cx="19" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M7 7l4 9M17 7l-4 9M7.2 6h9.6"/>',
    factory:'<path d="M3 21V10l6 3V10l6 3V10l6 3v8z"/><path d="M7 21v-4M12 21v-4M17 21v-4"/>',
    req:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
    con:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 13l2 2 4-4"/>',
    ts:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    inv:'<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    pay:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9h.01M18 15h.01"/>',
    report:'<path d="M4 20h16M7 16v-6M12 16V6M17 16v-3"/>',
    comp:'<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    expense:'<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M12 7v9M14.3 9.2c0-.9-1-1.6-2.3-1.6s-2.3.7-2.3 1.6 1 1.4 2.3 1.7 2.3.8 2.3 1.7-1 1.6-2.3 1.6-2.3-.7-2.3-1.6"/>',
    set:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plug:'<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    block:'<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
    book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
    erp:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    lanes:'<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  function ic(n,s){ s=s||16; return '<svg class="ic" width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+P[n]+'</svg>'; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
  var PICON={client:'building',gsi:'network',msp:'req',prime:'briefcase',sub:'factory',bench:'users',self:'idcard',candidate:'user',cand_ind:'user',cand_emp:'user'};
  var SICON={'L1.1':'req','L1.2':'con','L1.3':'ts','L1.4':'inv','L1.5':'pay','L1.6':'report','L1.7':'comp','L1.3 → L1.5':'expense'};
  var PAGE={client:'docs-client.html',gsi:'docs-systems-integrator.html',msp:'docs-msp-program-office.html',prime:'docs-prime-vendor.html',sub:'docs-sub-vendor.html',bench:'docs-bench-vendor.html',self:'docs-self-employed.html',candidate:'docs-candidate.html',cand_ind:'docs-candidate-independent.html',cand_emp:'docs-candidate-employee.html'};
  /* where a document can cross to an edge system, by the document named at the station */
  var IP=[['Concur',/files an expense|expense report|reimburs/i],['HCM',/payroll|\bw-?2\b|onboard|i-9|position|headcount|worker record|employment/i],['SAP S/4',/purchase order|sales order|work order|invoice|\bbill\b|journal|\berp\b|ledger|payment|pay run|remittance|vendor master|requisition/i]];
  function ipoint(st){ var t=(st.title+' '+st.sub); for(var i=0;i<IP.length;i++) if(IP[i][1].test(t)) return IP[i][0]; return null; }
  /* Settings → Integrations. Statuses are those of the example program. */
  var CATALOG=[
    ['SAP S/4HANA','ERP and finance','SAP S/4','Purchase requisitions and orders, billing documents, invoices, payments, journal entries','Connected'],
    ['SAP SuccessFactors','HCM','HCM','Positions, worker records, onboarding, payroll','Connected'],
    ['Workday HCM','HCM','HCM','Positions, worker records, onboarding, payroll','Available'],
    ['SAP Concur','Expenses','Concur','Expense reports, receipts, reimbursements','Connected'],
    ['DocuSign','Signatures',null,'Agreements, contracts and work orders sent for signature; the signed copy comes back to the record','Available'],
    ['Microsoft Teams','Collaboration',null,'Notices to a desk: a week to sign, a bill held, a start blocked','Available'],
    ['Slack','Collaboration',null,'The same notices, to a channel or a person','Available'],
    ['Okta','Identity',null,'Sign-in and seat assignment (SSO, SCIM)','Available'],
    ['Microsoft Entra ID (Active Directory)','Identity',null,'Sign-in and seat assignment (SSO, SCIM)','Available'],
    ['Oracle NetSuite','ERP and finance','SAP S/4','Orders, invoices, payments, journal entries','Available'],
    ['QuickBooks Online','ERP and finance','SAP S/4','Invoices, bills, payments','Available'],
    ['ADP Workforce Now','Payroll','HCM','Payroll for employees paid through payroll','Available'],
    ['E-Verify','Work authorization',null,'The work-authorization result behind a start','Available'],
    ['Checkr','Background checks',null,'The background-check result that warns before a start','Planned']
  ];
  function slug(code){ return code==='L1.3 → L1.5'?'expenses':code.toLowerCase().replace(/\./g,'-'); }
  function initials(name){ var w=name.replace(/[^A-Za-z ]/g,' ').trim().split(/\s+/).filter(Boolean); var s=(w[0]||'').charAt(0)+(w[1]||'').charAt(0); if(s.length<2) s=(w[0]||'??').slice(0,2); return s.toUpperCase(); }
  function party(k){ for(var i=0;i<M.parties.length;i++) if(M.parties[i].meta.key===k) return M.parties[i]; return M.parties[0]; }
  function stream(p,code){ for(var i=0;i<p.streams.length;i++) if(p.streams[i].code===code) return p.streams[i]; return p.streams[0]; }
  function words(s){ return s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(function(w){return w.length>3;}); }
  function glossFor(st,title){ var tw=words(title); for(var i=0;i<st.glossary.length;i++){ var gw=words(st.glossary[i].etyme); for(var a=0;a<tw.length;a++) for(var b=0;b<gw.length;b++) if(tw[a]===gw[b]||tw[a].indexOf(gw[b])===0||gw[b].indexOf(tw[a])===0) return st.glossary[i]; } return null; }
  function countIp(p,ip){ var n=0; p.streams.forEach(function(s){ s.stations.forEach(function(x){ if(ipoint(x)===ip) n++; }); }); return n; }

  function shell(box,p,m,st,view,mainHtml,capHtml){
    var tabs='<div class="tabs dash-tabs" role="tablist">'+M.parties.map(function(q){ return '<button role="tab" data-party="'+q.meta.key+'" aria-selected="'+(q.meta.key===m.key)+'">'+ic(PICON[q.meta.key]||'user',15)+q.meta.number+' · '+esc(q.meta.label)+'</button>'; }).join('')+'</div>';
    var nav=p.streams.map(function(s){ return '<a class="d-nav" href="#" data-stream="'+esc(s.code)+'"'+(view==='stream'&&s.code===st.code?' aria-current="page"':'')+'>'+ic(SICON[s.code]||'req',16)+esc(s.short)+'<span class="ct">'+s.stations.length+'</span></a>'; }).join('');
    var side='<aside class="d-side"><div class="d-who"><span class="av">'+initials(m.name)+'</span><div><b>'+esc(m.label)+'</b><span>Party '+esc(m.number)+' of 10 · L1</span></div></div><p class="grp">Value streams · L2</p>'+nav+
      '<p class="grp">Account</p><a class="d-nav" href="#" data-view="settings"'+(view==='settings'?' aria-current="page"':'')+'>'+ic('set',16)+'Settings</a>'+
      '<a class="d-nav sub" href="#" data-view="integrations"'+(view==='integrations'?' aria-current="page"':'')+'>'+ic('plug',16)+'Integrations<span class="ct">'+CATALOG.length+'</span></a></aside>';
    var bar='<div class="d-bar"><div class="d-search">'+ic('search',15)+'Search '+esc(m.label)+'</div><span class="d-ic" aria-label="Notifications">'+ic('bell',18)+'<i></i></span><span class="av">'+initials(m.name)+'</span></div>';
    box.innerHTML=tabs+'<div class="d-shell dash-shell">'+side+'<div class="d-main">'+bar+mainHtml+'</div></div>'+capHtml;
    box.dataset.party=m.key; box.dataset.stream=st.code; box.dataset.view=view;
    box.querySelectorAll('.dash-tabs button').forEach(function(b){ b.addEventListener('click',function(){ render(box,b.dataset.party,box.dataset.stream,null,'all',box.dataset.view); var sel=box.querySelector('.dash-tabs [aria-selected="true"]'); if(sel&&sel.scrollIntoView) sel.scrollIntoView({block:'nearest',inline:'center'}); }); });
    box.querySelectorAll('[data-stream]').forEach(function(a){ a.addEventListener('click',function(e){ e.preventDefault(); render(box,box.dataset.party,a.dataset.stream,null,'all','stream'); }); });
    box.querySelectorAll('[data-view]').forEach(function(a){ a.addEventListener('click',function(e){ e.preventDefault(); render(box,box.dataset.party,box.dataset.stream,null,'all',a.dataset.view); }); });
  }

  function statusChip(s){ return '<span class="chip '+(s==='Connected'?'chip--verified':s==='Available'?'chip--action':'chip--passive')+'">'+esc(s)+'</span>'; }

  function renderSettings(box,p,m,view){
    var crumb='<nav class="crumb" aria-label="Where you are"><span>'+esc(m.label)+'</span><i>›</i><span>Settings</span>'+(view==='integrations'?'<i>›</i><span>Integrations</span>':'')+'</nav>';
    var stations=0; p.streams.forEach(function(s){ stations+=s.stations.length; });
    var head, body;
    if(view==='settings'){
      head='<div class="dash-head">'+crumb+'<div class="dash-head-row"><div><h3>Settings</h3><p>The program, its desks, and the systems documents come from or go to.</p></div></div></div>';
      var tiles='<div class="d-tiles"><div class="d-tile"><div class="k">Party</div><div class="v">'+esc(m.number)+'</div><div class="s">'+esc(m.label)+'</div></div><div class="d-tile"><div class="k">Desks</div><div class="v">'+m.desks.length+'</div><div class="s">seats in this program</div></div><div class="d-tile"><div class="k">Value streams</div><div class="v">'+p.streams.length+'</div><div class="s">'+stations+' stations</div></div><div class="d-tile"><div class="k">Integrations</div><div class="v">'+CATALOG.filter(function(c){return c[4]==='Connected';}).length+'</div><div class="s">connected of '+CATALOG.length+'</div></div></div>';
      var rows=[['Program','Name, party, the plan and the rate bands','Open'],['Desks and seats','Who holds each desk; every read logged','Open'],['Rules','What blocks, what warns, what is recorded',"Open"],['Integrations','SAP S/4, HCM, Concur, DocuSign, Microsoft Teams, Okta, Active Directory and more','view:integrations'],['Notifications','Which desk is told, on which channel','Open'],['Data export','CSV from every screen; retention by category','Open']];
      body='<div class="scrollx"><table class="tabular"><thead><tr><th>Setting</th><th>What it holds</th><th></th></tr></thead><tbody>'+rows.map(function(r){ var act=r[2].indexOf('view:')===0?'<a href="#" class="btn btn-s btn-sm" data-view="'+r[2].slice(5)+'">Open</a>':'<span class="chip chip--passive">in the program</span>'; return '<tr><td><b>'+esc(r[0])+'</b></td><td>'+esc(r[1])+'</td><td>'+act+'</td></tr>'; }).join('')+'</tbody></table></div>';
      body=tiles+'<p class="eyebrow" style="margin-top:20px">Desks in this program</p><p style="margin-top:8px">'+m.desks.map(function(d){return '<span class="chip chip--passive">'+esc(d)+'</span>';}).join(' ')+'</p>'+body;
    } else {
      head='<div class="dash-head">'+crumb+'<div class="dash-head-row"><div><h3>Integrations</h3><p>Systems that documents come from or go to. Etyme keeps the record; each system keeps its own. None of them is a flow — a station carries a marker where a document crosses.</p></div></div></div>';
      var conn=CATALOG.filter(function(c){return c[4]==='Connected';}).length, avail=CATALOG.filter(function(c){return c[4]==='Available';}).length, touched=0; p.streams.forEach(function(s){ s.stations.forEach(function(x){ if(ipoint(x)) touched++; }); });
      var tiles2='<div class="d-tiles"><div class="d-tile"><div class="k">Connected</div><div class="v">'+conn+'</div><div class="s">in the example program</div></div><div class="d-tile"><div class="k">Available</div><div class="v">'+avail+'</div><div class="s">switch on from here</div></div><div class="d-tile"><div class="k">Stations that cross</div><div class="v">'+touched+'</div><div class="s">on this party’s streams</div></div><div class="d-tile"><div class="k">Kinds</div><div class="v">'+CATALOG.map(function(c){return c[1];}).filter(function(v,i,a){return a.indexOf(v)===i;}).length+'</div><div class="s">ERP, HCM, expenses, signatures, identity, more</div></div></div>';
      body=tiles2+'<div class="scrollx"><table class="tabular"><thead><tr><th>Integration</th><th>Kind</th><th>What crosses</th><th>Stations on your streams</th><th>Status</th></tr></thead><tbody>'+CATALOG.map(function(c){ var n=c[2]?countIp(p,c[2]):0; return '<tr><td><b>'+esc(c[0])+'</b></td><td><span class="chip chip--passive">'+esc(c[1])+'</span></td><td>'+esc(c[3])+'</td><td>'+(c[2]?'<span class="num">'+n+'</span> · marked '+esc(c[2]):'<span class="num">—</span>')+'</td><td>'+statusChip(c[4])+'</td></tr>'; }).join('')+'</tbody></table></div>'+
        '<div class="callout">'+ic('plug',18)+'<div><b>Many more on request</b><p>Anything that can send or receive a document over an API can sit at the edge of a stream. Ask a person from the contact page and say which system.</p></div></div>';
    }
    var cap='<p class="dash-cap"><b>L1 '+esc(m.label)+' · Settings'+(view==='integrations'?' · Integrations':'')+'</b>Statuses shown are those of the example program.</p>';
    shell(box,p,m,stream(p,box.dataset.stream||'L1.1'),view,head+body,cap);
  }

  function render(box, pkey, code, openN, filt, view){
    filt=filt||'all'; view=view||'stream';
    var p=party(pkey), m=p.meta, st=stream(p,code);
    if(view==='settings'||view==='integrations'){ box.dataset.stream=st.code; renderSettings(box,p,m,view); return; }
    var lanesUsed=[]; st.stations.forEach(function(s){ if(s.lane&&lanesUsed.indexOf(s.lane)<0) lanesUsed.push(s.lane); });
    var crumb='<nav class="crumb" aria-label="Where you are"><span>'+esc(m.label)+'</span><i>›</i><span>'+esc(st.short)+'</span><i>›</i><span>Stations</span></nav>';
    var head='<div class="dash-head">'+crumb+'<div class="dash-head-row"><div><h3>'+esc(st.code)+' · '+esc(st.name)+'</h3><p>'+esc(st.caption||m.tagline)+'</p></div><a class="btn btn-s btn-sm" href="'+PAGE[m.key]+'#'+slug(st.code)+'">Read the drawing &rarr;</a></div></div>';
    var tiles='<div class="d-tiles"><div class="d-tile"><div class="k">Desks in this stream</div><div class="v">'+lanesUsed.length+'</div><div class="s">of '+m.desks.length+' this party has</div></div>'+
      '<div class="d-tile"><div class="k">Stations · L3</div><div class="v">'+st.stations.length+'</div><div class="s">in the order the work happens</div></div>'+
      '<div class="d-tile"><div class="k">Refusals</div><div class="v">'+st.refusals.length+'</div><div class="s">blocks said in a sentence</div></div>'+
      '<div class="d-tile"><div class="k">Proven by</div><div class="v">'+st.sentences+'</div><div class="s">test sentences on this branch</div></div></div>';
    var ips=st.stations.filter(function(x){return ipoint(x);});
    var edge='<div class="dash-edge"><span class="k">Integration points</span>'+(ips.length?ips.map(function(x){ return '<span class="chip chip--passive">'+x.n+' '+esc(x.title)+' → '+esc(ipoint(x))+'</span>'; }).join(''):'<span class="chip chip--passive">none on this stream</span>')+'<span class="s">A marker means a document at that station can come from or go to an edge system. The systems themselves are managed under <a href="#" data-view="integrations">Settings › Integrations</a>.</span></div>';
    var filters='<div class="dash-filters">'+[['all','All stations'],['refuse','With a refusal'],['record','Records only']].map(function(f){ return '<button type="button" class="filt" data-filt="'+f[0]+'" aria-pressed="'+(filt===f[0])+'">'+f[1]+'</button>'; }).join('')+'</div>';
    var rows=st.stations.filter(function(s){ var has=st.refusals.some(function(r){return r.station===s.n;}); return filt==='all'||(filt==='refuse'&&has)||(filt==='record'&&!has); }).map(function(s){
      var rf=st.refusals.filter(function(r){return r.station===s.n;});
      var rule=rf.length?rf.map(function(r){return '<span class="chip chip--danger">'+esc(r.text)+'</span>';}).join(' '):'<span class="chip chip--passive">records</span>';
      var open=(openN===s.n); var ipn=ipoint(s);
      var row='<tr class="dash-row" data-n="'+s.n+'" aria-expanded="'+open+'"><td><span class="num">'+s.n+'</span></td><td><b>'+esc(s.title)+'</b>'+(ipn?' <span class="chip chip--passive ip" title="Integration point">'+ic('erp',11)+esc(ipn)+'</span>':'')+'</td><td><span class="chip chip--action">'+esc(s.lane||'—')+'</span></td><td>'+esc(s.sub)+'</td><td>'+rule+'</td></tr>';
      if(!open) return row;
      var g=glossFor(st,s.title);
      var sys=rf.length?'<ul>'+rf.map(function(r){return '<li>'+ic('block',14)+esc(r.text)+'</li>';}).join('')+'</ul>':'<p>Nothing is refused at this station. The system writes a row saying who did it and when, so it can be audited later.</p>';
      var l4='<tr class="dash-l4"><td colspan="5"><div class="dash-l4-grid">'+
        '<div>'+ic('user',18)+'<b>The desk does · L4</b><p><strong>'+esc(s.title)+'</strong>'+(s.sub?' — '+esc(s.sub):'')+'</p><p class="mut">Desk: '+esc(s.lane||'—')+'</p></div>'+
        '<div>'+ic('set',18)+'<b>The system does · L4</b>'+sys+'</div>'+
        (ipn?'<div>'+ic('erp',18)+'<b>Integration point</b><p>A document at this station can come from or go to <strong>'+esc(ipn)+'</strong>.</p><p class="mut">Managed under Settings › Integrations. Etyme keeps the record; the edge system keeps its own.</p></div>':'')+
        (g?'<div>'+ic('book',18)+'<b>Etyme says · what SAP calls it</b><p><strong>'+esc(g.etyme)+'</strong> — '+esc(g.sap)+'</p><p class="mut">'+esc(g.note)+'</p></div>':'<div>'+ic('lanes',18)+'<b>Lanes this stream crosses</b><p>'+esc(st.lanes.map(function(l){return l.name;}).join(' · '))+'</p><p class="mut">Every arrow into another party’s lane is a document that party reads.</p></div>')+
        '</div></td></tr>';
      return row+l4;
    }).join('');
    var table='<div class="scrollx"><table class="tabular dash-table"><thead><tr><th>#</th><th>Station</th><th>Desk</th><th>What happens</th><th>System rule</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
    var note='<div class="callout">'+ic('lanes',18)+'<div><b>Lanes in this drawing</b><p>'+esc(st.lanes.map(function(l){return l.name+(l.sub?' ('+l.sub+')':'');}).join(' · '))+'. Shaded lanes belong to other parties; what crosses into them is a document that party reads.</p></div></div>';
    var cap='<p class="dash-cap"><b>L1 '+esc(m.label)+' · L2 '+esc(st.short)+' · L3 '+st.stations.length+' stations</b>Open a station for its task and the system’s rule (L4). Numbers, wording and refusals are taken from the operating-model document for this party.</p>';
    shell(box,p,m,st,'stream',head+tiles+edge+filters+table+note,cap);
    box.dataset.filt=filt;
    box.querySelectorAll('.dash-filters .filt').forEach(function(f){ f.addEventListener('click',function(){ render(box,box.dataset.party,box.dataset.stream,null,f.dataset.filt,'stream'); }); });
    box.querySelectorAll('.dash-row').forEach(function(r){ r.addEventListener('click',function(e){ if(e.target.closest('a')) return; var n=parseInt(r.dataset.n,10); render(box,box.dataset.party,box.dataset.stream,openN===n?null:n,box.dataset.filt,'stream'); }); });
  }
  document.querySelectorAll('.dash[data-stream]').forEach(function(box){ render(box, box.dataset.party||'client', box.dataset.stream, null, 'all', 'stream'); });
})();
