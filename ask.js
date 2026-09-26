/* Lead capture for every .ask-form on the site (home, audit, contact). Posts every field the form
   holds to /api/market/leads. With no server behind the page it keeps the row in the browser and
   says so, instead of pretending something was sent. */
(function(){
  var THANKS={
    AUDIT_PAGE:'Got it. Your contractor spend audit will be in your inbox within 24 hours.',
    CONTACT_PAGE:'Got it. Somebody reads this and writes back within 24 hours.',
    HOME_PAGE:'Got it. Somebody reads this and writes back.',
    DOCS_GATE:'Got it. Somebody reads this and sends a sign-in link.'
  };
  var AFTER='If you would rather look before you talk to anybody, the example program needs no card and no sign-up.';
  var PREVIEW='This is a preview page with no server behind it, so nothing was sent. On the live site this reaches a person, and somebody writes back.';
  function clean(v){ return (v||'').replace(/\s+/g,' ').trim(); }
  function say(f,text,bad){ var s=f.querySelector('.ask-says'); s.hidden=false; s.textContent=text; s.classList.toggle('bad',!!bad); }
  document.querySelectorAll('form.ask-form').forEach(function(f){
    var t0=Date.now();
    f.addEventListener('submit',function(e){
      e.preventDefault();
      var btn=f.querySelector('button[type=submit]');
      var source=f.getAttribute('data-source')||'HOME_PAGE';
      var email=clean(f.elements.email.value).toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ say(f,'An email address is the one thing we need.',true); f.elements.email.focus(); return; }
      var missing=Array.prototype.filter.call(f.querySelectorAll('[required]'),function(el){ return !clean(el.value); });
      if(missing.length){ say(f,'A few fields are still empty. Everything marked is needed for the report.',true); missing[0].focus(); return; }
      var body={source:source, filledInMs:Date.now()-t0, submittedAt:new Date().toISOString()};
      Array.prototype.forEach.call(f.elements,function(el){ if(el.name&&el.name!=='email') body[el.name]=clean(el.value)||null; });
      body.email=email;
      btn.disabled=true; var label=btn.textContent; btn.textContent='Sending…';
      fetch('/api/market/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){ return r.json().catch(function(){return null;}).then(function(j){ return {ok:r.ok,j:j}; }); })
        .then(function(x){
          if(!x.ok){ var m=x.j&&x.j.error&&x.j.error.message; if(m){ say(f,m,true); btn.disabled=false; btn.textContent=label; return; } throw new Error('no server'); }
          done(f,(x.j&&x.j.data&&x.j.data.says)||THANKS[source]||THANKS.HOME_PAGE,AFTER);
        })
        .catch(function(){
          try{ var rows=JSON.parse(localStorage.getItem('etymeSubmissions')||'[]'); rows.push(body); localStorage.setItem('etymeSubmissions',JSON.stringify(rows)); }catch(_){}
          done(f,PREVIEW,null);
        });
    });
  });
  function done(f,text,after){
    f.querySelectorAll('.ask-body').forEach(function(el){ el.hidden=true; });
    var s=f.querySelector('.ask-says'); s.hidden=false; s.classList.remove('bad'); s.innerHTML='';
    var p=document.createElement('p'); p.textContent=text; s.appendChild(p);
    if(after){ var q=document.createElement('p'); q.className='after'; q.textContent=after; s.appendChild(q); }
  }
})();
