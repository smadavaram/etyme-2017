(function(){
  var items=document.querySelectorAll('.eh-nav .item'); var timer=null;
  function closeAll(except){ items.forEach(function(it){ if(it!==except){ it.querySelector('button').setAttribute('aria-expanded','false'); it.querySelector('.mega').hidden=true; } }); }
  function open(it){ closeAll(it); it.querySelector('button').setAttribute('aria-expanded','true'); it.querySelector('.mega').hidden=false; }
  items.forEach(function(it){
    var b=it.querySelector('button'), m=it.querySelector('.mega');
    b.addEventListener('click',function(){ (m.hidden?open:closeAll)(it); });
    it.addEventListener('mouseenter',function(){ if(window.matchMedia('(hover:hover)').matches){ clearTimeout(timer); open(it); } });
    it.addEventListener('mouseleave',function(){ if(window.matchMedia('(hover:hover)').matches){ timer=setTimeout(function(){ closeAll(); },140); } });
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ closeAll(); var d=document.getElementById('eh-drawer'); if(d&&!d.hidden){ d.hidden=true; document.querySelector('.burger').setAttribute('aria-expanded','false'); } } });
  document.addEventListener('click',function(e){ if(!e.target.closest('.eh-nav')) closeAll(); });
  var burger=document.querySelector('.burger'), drawer=document.getElementById('eh-drawer');
  if(burger&&drawer){ burger.addEventListener('click',function(){ var o=!drawer.hidden; drawer.hidden=o; burger.setAttribute('aria-expanded',String(!o)); }); }
  /* roles: open the tab the hash names */
  function roleFromHash(){ var m=(location.hash||'').match(/^#role-([a-z]+)$/); if(!m) return; var b=document.querySelector('.roles [data-role="'+m[1]+'"]'); if(b){ b.click(); var sec=document.getElementById('roles'); if(sec) sec.scrollIntoView(); } }
  document.querySelectorAll('.roles .tabs button').forEach(function(b){ b.addEventListener('click',function(){
    document.querySelectorAll('.roles .tabs button').forEach(function(x){ x.setAttribute('aria-selected','false'); });
    document.querySelectorAll('.roles .pane').forEach(function(p){ p.hidden=true; });
    b.setAttribute('aria-selected','true'); document.getElementById('pane-'+b.dataset.role).hidden=false; }); });
  window.addEventListener('hashchange',roleFromHash); roleFromHash();
})();
