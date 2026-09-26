/* Dashboards built from the operating-model documents (window.ETYME_MODEL, see model.js).
   L1 a party · L2 its value streams · L3 the stations in a stream · L4 the desk's task and the system's rule. */
(function(){
  var M=window.ETYME_MODEL; if(!M) return;
  var P={
    building:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h3M13 7h3M8 11h3M13 11h3M8 15h3M13 15h3M10 21v-3h4v3"/>',
    briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
    users:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.6-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.4c2.5.2 4.2 1.7 4.8 4.6"/>',
    idcard:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M6 16c.4-1.6 1.6-2.5 3-2.5s2.6.9 3 2.5M14 10h4M14 13h4"/>',
    user:'<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.4-6 7-6s6.2 2.2 7 6"/>',
    req:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
    con:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 13l2 2 4-4"/>',
    ts:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    inv:'<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    pay:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9h.01M18 15h.01"/>',
    report:'<path d="M4 20h16M7 16v-6M12 16V6M17 16v-3"/>',
    comp:'<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    expense:'<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M12 7v9M14.3 9.2c0-.9-1-1.6-2.3-1.6s-2.3.7-2.3 1.6 1 1.4 2.3 1.7 2.3.8 2.3 1.7-1 1.6-2.3 1.6-2.3-.7-2.3-1.6"/>',
    set:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    block:'<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
    book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
    chev:'<path d="M9 6l6 6-6 6"/>',
    lanes:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    network:'<circle cx="5" cy="6" r="2.2"/><circle cx="19" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M7 7l4 9M17 7l-4 9M7.2 6h9.6"/>',
    factory:'<path d="M3 21V10l6 3V10l6 3V10l6 3v8z"/><path d="M7 21v-4M12 21v-4M17 21v-4"/>',
    erp:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'
  };
  function ic(n,s){ s=s||16; return '<svg class="ic" width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+P[n]+'</svg>'; }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
  var PICON={client:'building',gsi:'network',msp:'req',prime:'briefcase',sub:'factory',bench:'users',self:'idcard',candidate:'user',cand_ind:'user',cand_emp:'user'};
  var EDGE={"L1.1": ["SAP S/4 · purchase requisition, source list", "HCM · position, job requisition"], "L1.2": ["SAP S/4 · purchase order, contract", "HCM · worker record, onboarding"], "L1.3": ["HCM · time"], "L1.4": ["SAP S/4 · billing document"], "L1.5": ["SAP S/4 · accounts payable, payment run", "HCM · payroll"], "L1.6": ["SAP S/4 · journal, the ERP"], "L1.7": ["HCM · compliance, tenure", "SAP S/4 · vendor master"], "L1.3 → L1.5": ["Concur · expense report", "SAP S/4 · accounts payable"]};
  var EDGESYS=[['SAP S/4','erp'],['HCM','users'],['Concur','expense']];
  var SICON={'L1.1':'req','L1.2':'con','L1.3':'ts','L1.4':'inv','L1.5':'pay','L1.6':'report','L1.7':'comp','L1.3 → L1.5':'expense'};
  var PAGE={"client": "docs-client.html", "gsi": "docs-systems-integrator.html", "msp": "docs-msp-program-office.html", "prime": "docs-prime-vendor.html", "sub": "docs-sub-vendor.html", "bench": "docs-bench-vendor.html", "self": "docs-self-employed.html", "candidate": "docs-candidate.html", "cand_ind": "docs-candidate-independent.html", "cand_emp": "docs-candidate-employee.html"};
  function slug(code){ return code==='L1.3 → L1.5'?'expenses':code.toLowerCase().replace(/\./g,'-'); }
  function initials(name){ var w=name.replace(/[^A-Za-z ]/g,' ').trim().split(/\s+/).filter(Boolean); var s=(w[0]||'').charAt(0)+(w[1]||'').charAt(0); if(s.length<2) s=(w[0]||'??').slice(0,2); return s.toUpperCase(); }
  function party(k){ for(var i=0;i<M.parties.length;i++) if(M.parties[i].meta.key===k) return M.parties[i]; return M.parties[0]; }
  function stream(p,code){ for(var i=0;i<p.streams.length;i++) if(p.streams[i].code===code) return p.streams[i]; return p.streams[0]; }
  function words(s){ return s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(function(w){return w.length>3;}); }
  function glossFor(st,title){ var tw=words(title); for(var i=0;i<st.glossary.length;i++){ var gw=words(st.glossary[i].etyme); for(var a=0;a<tw.length;a++) for(var b=0;b<gw.length;b++) if(tw[a]===gw[b]||tw[a].indexOf(gw[b])===0||gw[b].indexOf(tw[a])===0) return st.glossary[i]; } return null; }

  function render(box, pkey, code, openN, filt){
    filt=filt||'all';
    var p=party(pkey), m=p.meta, st=stream(p,code);
    var lanesUsed=[]; st.stations.forEach(function(s){ if(s.lane&&lanesUsed.indexOf(s.lane)<0) lanesUsed.push(s.lane); });
    var tabs='<div class="tabs dash-tabs" role="tablist">'+M.parties.map(function(q){ return '<button role="tab" data-party="'+q.meta.key+'" aria-selected="'+(q.meta.key===m.key)+'">'+ic(PICON[q.meta.key]||'user',15)+q.meta.number+' · '+esc(q.meta.label)+'</button>'; }).join('')+'</div>';
    var nav=p.streams.map(function(s){ return '<a class="d-nav" href="#" data-stream="'+esc(s.code)+'"'+(s.code===st.code?' aria-current="page"':'')+'>'+ic(SICON[s.code]||'req',16)+esc(s.short)+'<span class="ct">'+s.stations.length+'</span></a>'; }).join('');
    var side='<aside class="d-side"><div class="d-who"><span class="av">'+initials(m.name)+'</span><div><b>'+esc(m.label)+'</b><span>Party '+esc(m.number)+' of 10 · L1</span></div></div><p class="grp">Value streams · L2</p>'+nav+'<p class="grp">Edge systems</p>'+EDGESYS.map(function(e){ var on=(EDGE[st.code]||[]).some(function(x){return x.indexOf(e[0])===0;}); return '<span class="d-nav'+(on?' edge-on':'')+'">'+ic(e[1],16)+e[0]+(on?'<span class="ct">this stream</span>':'')+'</span>'; }).join('')+'<p class="grp">Account</p><a class="d-nav" href="signin.html">'+ic('set',16)+'Settings</a></aside>';
    var bar='<div class="d-bar"><div class="d-search">'+ic('search',15)+'Search '+esc(m.label)+'</div><span class="d-ic" aria-label="Notifications">'+ic('bell',18)+'<i></i></span><span class="av">'+initials(m.name)+'</span></div>';
    var crumb='<nav class="crumb" aria-label="Where you are"><span>'+esc(m.label)+'</span><i>\u203a</i><span>'+esc(st.short)+'</span><i>\u203a</i><span>Stations</span></nav>';
    var head='<div class="dash-head">'+crumb+'<div class="dash-head-row"><div><h3>'+esc(st.code)+' · '+esc(st.name)+'</h3><p>'+esc(st.caption||m.tagline)+'</p></div><a class="btn btn-s btn-sm" href="'+PAGE[m.key]+'#'+slug(st.code)+'">Read the drawing &rarr;</a></div></div>';
    var tiles='<div class="d-tiles"><div class="d-tile"><div class="k">Desks in this stream</div><div class="v">'+lanesUsed.length+'</div><div class="s">of '+m.desks.length+' this party has</div></div>'+
      '<div class="d-tile"><div class="k">Stations · L3</div><div class="v">'+st.stations.length+'</div><div class="s">in the order the work happens</div></div>'+
      '<div class="d-tile"><div class="k">Refusals</div><div class="v">'+st.refusals.length+'</div><div class="s">blocks said in a sentence</div></div>'+
      '<div class="d-tile"><div class="k">Proven by</div><div class="v">'+st.sentences+'</div><div class="s">test sentences on this branch</div></div></div>';
    var edge='<div class="dash-edge"><span class="k">Edge systems</span>'+(EDGE[st.code]||[]).map(function(x){ return '<span class="chip chip--passive">'+esc(x)+'</span>'; }).join('')+'<span class="s">Documents at the edge of this stream can come from or go to these systems. Etyme keeps the record; they keep theirs.</span></div>';
    var filters='<div class="dash-filters">'+[['all','All stations'],['refuse','With a refusal'],['record','Records only']].map(function(f){ return '<button type="button" class="filt" data-filt="'+f[0]+'" aria-pressed="'+(filt===f[0])+'">'+f[1]+'</button>'; }).join('')+'</div>';
    var rows=st.stations.filter(function(s){ var has=st.refusals.some(function(r){return r.station===s.n;}); return filt==='all'||(filt==='refuse'&&has)||(filt==='record'&&!has); }).map(function(s){
      var rf=st.refusals.filter(function(r){return r.station===s.n;});
      var rule=rf.length?rf.map(function(r){return '<span class="chip chip--danger">'+esc(r.text)+'</span>';}).join(' '):'<span class="chip chip--passive">records</span>';
      var open=(openN===s.n);
      var row='<tr class="dash-row" data-n="'+s.n+'" aria-expanded="'+open+'"><td><span class="num">'+s.n+'</span></td><td><b>'+esc(s.title)+'</b></td><td><span class="chip chip--action">'+esc(s.lane||'—')+'</span></td><td>'+esc(s.sub)+'</td><td>'+rule+'</td></tr>';
      if(!open) return row;
      var g=glossFor(st,s.title);
      var sys=rf.length?'<ul>'+rf.map(function(r){return '<li>'+ic('block',14)+esc(r.text)+'</li>';}).join('')+'</ul>':'<p>Nothing is refused at this station. The system writes a row saying who did it and when, so it can be audited later.</p>';
      var l4='<tr class="dash-l4"><td colspan="5"><div class="dash-l4-grid">'+
        '<div>'+ic('user',18)+'<b>The desk does · L4</b><p><strong>'+esc(s.title)+'</strong>'+(s.sub?' — '+esc(s.sub):'')+'</p><p class="mut">Desk: '+esc(s.lane||'—')+'</p></div>'+
        '<div>'+ic('set',18)+'<b>The system does · L4</b>'+sys+'</div>'+
        (g?'<div>'+ic('book',18)+'<b>Etyme says · what SAP calls it</b><p><strong>'+esc(g.etyme)+'</strong> — '+esc(g.sap)+'</p><p class="mut">'+esc(g.note)+'</p></div>':'<div>'+ic('lanes',18)+'<b>Lanes this stream crosses</b><p>'+esc(st.lanes.map(function(l){return l.name;}).join(' · '))+'</p><p class="mut">Every arrow into another party’s lane is a document that party reads.</p></div>')+
        '</div></td></tr>';
      return row+l4;
    }).join('');
    var table='<div class="scrollx"><table class="tabular dash-table"><thead><tr><th>#</th><th>Station</th><th>Desk</th><th>What happens</th><th>System rule</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
    var note='<div class="callout">'+ic('lanes',18)+'<div><b>Lanes in this drawing</b><p>'+esc(st.lanes.map(function(l){return l.name+(l.sub?' ('+l.sub+')':'');}).join(' · '))+'. Shaded lanes belong to other parties; what crosses into them is a document that party reads.</p></div></div>';
    var cap='<p class="dash-cap"><b>L1 '+esc(m.label)+' · L2 '+esc(st.short)+' · L3 '+st.stations.length+' stations</b>Open a station for its task and the system’s rule (L4). Numbers, wording and refusals are taken from the operating-model document for this party.</p>';
    box.innerHTML=tabs+'<div class="d-shell dash-shell">'+side+'<div class="d-main">'+bar+head+tiles+edge+filters+table+note+'</div></div>'+cap;
    box.dataset.filt=filt;
    box.dataset.party=m.key; box.dataset.stream=st.code;
    box.querySelectorAll('.dash-tabs button').forEach(function(b){ b.addEventListener('click',function(){ render(box,b.dataset.party,box.dataset.stream,null,'all'); var sel=box.querySelector('.dash-tabs [aria-selected="true"]'); if(sel&&sel.scrollIntoView) sel.scrollIntoView({block:'nearest',inline:'center'}); }); });
    box.querySelectorAll('.d-nav[data-stream]').forEach(function(a){ a.addEventListener('click',function(e){ e.preventDefault(); render(box,box.dataset.party,a.dataset.stream,null,'all'); }); });
    box.querySelectorAll('.dash-filters .filt').forEach(function(f){ f.addEventListener('click',function(){ render(box,box.dataset.party,box.dataset.stream,null,f.dataset.filt); }); });
    box.querySelectorAll('.dash-row').forEach(function(r){ r.addEventListener('click',function(){ var n=parseInt(r.dataset.n,10); render(box,box.dataset.party,box.dataset.stream,openN===n?null:n,box.dataset.filt); }); });
  }
  document.querySelectorAll('.dash[data-stream]').forEach(function(box){ render(box, box.dataset.party||'client', box.dataset.stream, null); });
})();
