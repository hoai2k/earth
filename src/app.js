/* ============================================================================
 * app.js — UI controller: time mapping, timeline, dropdown, facts, playback.
 * ==========================================================================*/
(function () {
  // ---- nonlinear time <-> slider mapping (expands recent time) -------------
  const FR = [0, 0.30, 0.45, 0.60, 0.75, 0.88, 1.0];
  const MA = [0, 66,   150,  300,  540,  1000, 4540];
  function fracToMa(f){ f=Math.max(0,Math.min(1,f));
    for(let i=0;i<FR.length-1;i++){ if(f<=FR[i+1]){ const t=(f-FR[i])/(FR[i+1]-FR[i]); return MA[i]+(MA[i+1]-MA[i])*t; } }
    return MA[MA.length-1]; }
  function maToFrac(ma){ ma=Math.max(0,Math.min(4540,ma));
    for(let i=0;i<MA.length-1;i++){ if(ma<=MA[i+1]){ const t=(ma-MA[i])/(MA[i+1]-MA[i]); return FR[i]+(FR[i+1]-FR[i])*t; } }
    return 1; }

  function fmtAge(ma){
    if(ma<0.02) return {n:'0', u:'today'};
    if(ma<1) return {n:(ma*1000).toFixed(0), u:'ka ago'};
    if(ma<10) return {n:ma.toFixed(1), u:'Ma ago'};
    if(ma<1000) return {n:Math.round(ma).toLocaleString(), u:'Ma ago'};
    return {n:(ma/1000).toFixed(2), u:'Ga ago'};
  }

  // ---- DOM ----
  const $ = s => document.querySelector(s);
  let globe, draggingSlider=false, playing=false, curIv=null, sheet=null, curMa=0;

  function loadMesh(){
    if (typeof MESH !== 'undefined') return Promise.resolve(MESH);
    return fetch('./data/plates-mesh.json').then(r=>r.json());
  }

  function buildTimeline(){
    const strip = $('#strip');
    // deep past on the left, present (0 Ma) on the right
    const ordered = INTERVALS.slice().sort((a,b)=>b.end-a.end);
    for(const iv of ordered){
      const wl = maToFrac(iv.end), wr = maToFrac(iv.start);
      const seg = document.createElement('div');
      seg.className='seg'; seg.dataset.id=iv.id;
      seg.style.flex = `0 0 ${((wr-wl)*100).toFixed(3)}%`;
      seg.style.background = iv.color;
      const lab=document.createElement('span'); lab.textContent=iv.name; seg.appendChild(lab);
      strip.appendChild(seg);
    }
  }

  function buildDropdown(){
    const sel=$('#eraSelect');
    // group by eon-ish for readability, newest first
    const ordered = INTERVALS.slice().sort((a,b)=>a.end-b.end);
    for(const iv of ordered){
      const o=document.createElement('option'); o.value=iv.id;
      const range = iv.end===0 ? `0–${iv.start} Ma` : `${iv.end}–${iv.start} Ma`;
      o.textContent = `${iv.name} · ${range}`;
      sel.appendChild(o);
    }
  }

  function midOf(iv){
    // representative age: for reconstructions, favour the middle of the interval
    if(iv.end===0 && iv.start<0.02) return 0;
    return (iv.start+iv.end)/2;
  }

  function updateUI(ma, opts){
    opts=opts||{};
    const a=fmtAge(ma);
    $('#age').innerHTML = `${a.n}<span class="unit">${a.u}</span>`;
    const iv = intervalAt(ma);
    // era readout line
    $('#eraName').innerHTML = `<b>${iv.name}</b> · ${iv.kind}`;
    if(iv!==curIv){
      curIv=iv;
      document.documentElement.style.setProperty('--accent', iv.color);
      $('#eyebrow').textContent = `${iv.kind}${iv.kind!=='Eon'?' · '+eonOf(iv):''}`;
      $('#eraTitle').textContent = iv.name;
      const range = iv.end===0 ? `Present – ${iv.start} Ma` : `${iv.start} – ${iv.end} Ma`;
      $('#eraRange').textContent = range;
      $('#tagline').textContent = iv.tagline;
      const ul=$('#facts'); ul.innerHTML='';
      for(const f of iv.facts){ const li=document.createElement('li'); li.textContent=f; ul.appendChild(li); }
      // sync dropdown
      $('#eraSelect').value = iv.id;
      // deep-time note
      const note=$('#note');
      note.style.display = ma>1000 ? 'block' : 'none';
    }
    // current-time handle (present day on the right) + strip highlight
    curMa = ma;
    const pos = 1 - maToFrac(ma);
    const h=$('#handle'); h.style.left = (pos*100)+'%'; h.setAttribute('aria-valuenow', Math.round(ma));
    for(const seg of $('#strip').children) seg.classList.toggle('on', seg.dataset.id===iv.id);
    if(!opts.fromInput && document.activeElement!==$('#maInput'))
      $('#maInput').value = ma<10 ? +ma.toFixed(1) : Math.round(ma);
  }
  function eonOf(iv){
    if(['Cambrian','Ordovician','Silurian','Devonian','Carboniferous','Permian','Triassic','Jurassic','Cretaceous','Paleocene','Eocene','Oligocene','Miocene','Pliocene','Pleistocene','Holocene'].includes(iv.name)) return 'Phanerozoic';
    if(['Tonian','Cryogenian','Ediacaran','Paleoproterozoic','Mesoproterozoic'].includes(iv.name)) return 'Proterozoic';
    return '';
  }

  function setTime(ma, opts){ ma=Math.max(0,Math.min(4540,ma)); globe.setTime(ma); updateUI(ma,opts); }

  function wire(){
    const timeline=$('#timeline'), handle=$('#handle');
    function posToMa(clientX){ const r=timeline.getBoundingClientRect(); let p=(clientX-r.left)/r.width; p=Math.max(0,Math.min(1,p)); return fracToMa(1-p); }
    function tlDown(e){ draggingSlider=true; handle.classList.add('drag'); stopPlay();
      try{ timeline.setPointerCapture(e.pointerId); }catch(_){}
      setTime(posToMa(e.clientX),{fromSlider:true}); e.preventDefault(); }
    function tlMove(e){ if(!draggingSlider) return; setTime(posToMa(e.clientX),{fromSlider:true}); }
    function tlUp(){ if(!draggingSlider) return; draggingSlider=false; handle.classList.remove('drag'); }
    timeline.addEventListener('pointerdown', tlDown);
    timeline.addEventListener('pointermove', tlMove);
    timeline.addEventListener('pointerup', tlUp);
    timeline.addEventListener('pointercancel', tlUp);
    handle.addEventListener('keydown', e=>{
      let p = 1 - maToFrac(curMa); const s=0.01, big=0.06;
      if(e.key==='ArrowRight'||e.key==='ArrowUp') p+=s;
      else if(e.key==='ArrowLeft'||e.key==='ArrowDown') p-=s;
      else if(e.key==='PageUp') p+=big;
      else if(e.key==='PageDown') p-=big;
      else if(e.key==='End') p=1; else if(e.key==='Home') p=0;
      else return;
      e.preventDefault(); p=Math.max(0,Math.min(1,p)); stopPlay(); setTime(fracToMa(1-p));
    });

    $('#maInput').addEventListener('input', ()=>{ const v=parseFloat($('#maInput').value); if(!isNaN(v)){ stopPlay(); setTime(v,{fromInput:true}); } });
    $('#eraSelect').addEventListener('change', ()=>{ const iv=INTERVALS.find(i=>i.id===$('#eraSelect').value); if(iv){ stopPlay(); setTime(midOf(iv)); } });

    $('#playBtn').addEventListener('click', togglePlay);
    $('#spinBtn').addEventListener('click', ()=>{ const b=$('#spinBtn'); const on=!b.classList.contains('active'); b.classList.toggle('active',on); globe.setSpin(on); });
    $('#cloudBtn').addEventListener('click', ()=>{ const b=$('#cloudBtn'); const on=!b.classList.contains('active'); b.classList.toggle('active',on); globe.setClouds(on); });
    $('#resetBtn').addEventListener('click', ()=>{ globe.resetView(); });

    // full-globe focus mode: hide all panels for unobstructed interaction
    const app=$('#app');
    function setFocus(on){ app.classList.toggle('focus',on); $('#focusBtn').classList.toggle('active',on);
      $('#focusBtn').title = on ? 'Show panels' : 'Full-globe mode — hide panels';
      if(on && sheet && sheet.isMobile()) sheet.peek(); }
    $('#focusBtn').addEventListener('click', ()=> setFocus(!app.classList.contains('focus')));
    $('#restoreBtn').addEventListener('click', ()=> setFocus(false));
    // collapse / expand the facts panel
    $('#infoToggle').addEventListener('click', ()=> $('#info').classList.toggle('collapsed'));

    window.addEventListener('resize', doResize);
  }

  // ---- playback: play FORWARD in time from the current age to the present -----
  // frac 1 = oldest, frac 0 = present; starting at the present loops to the oldest.
  let playFrac=0;
  function togglePlay(){ playing?stopPlay():startPlay(); }
  function setPlayBtn(ic,label){ const b=$('#playBtn'); b.querySelector('.ic').textContent=ic; b.querySelector('.lbl').textContent=' '+label; }
  function startPlay(){ playing=true; setPlayBtn('❚❚','Pause');
    playFrac=maToFrac(globe.getDisplayMa());
    if(playFrac<=0.001){ playFrac=1; const ma=fracToMa(1); globe.setTimeImmediate(ma); updateUI(ma); } }
  function stopPlay(){ if(!playing)return; playing=false; setPlayBtn('▶','Play through time'); }

  function doResize(){ const w=window.innerWidth,h=window.innerHeight; globe.resize(w,h); }

  // ---- mobile: facts panel as a draggable bottom sheet -----------------------
  function initMobileSheet(){
    const info=$('#info');
    const mq=window.matchMedia('(max-width:820px), (orientation:portrait)');
    let snaps={full:0,half:0,peek:0}, cur='peek', curY=0;
    function measure(){
      const sheetH=info.offsetHeight, h2=info.querySelector('h2');
      const peekV=Math.min(sheetH, Math.max(52, h2.offsetTop + h2.offsetHeight + 10));
      const halfV=Math.round(window.innerHeight*0.5);
      snaps={ full:0, half:Math.max(0,sheetH-halfV), peek:Math.max(0,sheetH-peekV) };
      $('#console').style.marginBottom = mq.matches ? peekV+'px' : '';
    }
    function apply(y,animate){ curY=y;
      info.style.transition = animate ? 'transform .32s cubic-bezier(.22,.61,.36,1)' : 'none';
      info.style.transform = 'translateY('+y+'px)'; }
    function snap(name){ measure(); cur=name; apply(snaps[name],true); info.classList.toggle('sheet-full', name==='full'); }
    function nearest(y){ let best='peek',bd=1e9; for(const k in snaps){ const d=Math.abs(snaps[k]-y); if(d<bd){bd=d;best=k;} } return best; }
    let dragging=false, startPY=0, startTY=0, lastPY=0, lastT=0, vy=0, moved=0;
    function down(e){
      if(!mq.matches || e.target.closest('#facts')) return;   // drag from header only; facts scrolls
      measure(); dragging=true; moved=0;
      startPY=e.clientY; lastPY=e.clientY; lastT=e.timeStamp; startTY=curY; vy=0;
      info.style.transition='none';
      try{ info.setPointerCapture(e.pointerId); }catch(_){}
    }
    function move(e){
      if(!dragging) return;
      const dy=e.clientY-startPY; moved=Math.max(moved,Math.abs(dy));
      apply(Math.max(0,Math.min(snaps.peek,startTY+dy)),false);
      const dt=Math.max(1,e.timeStamp-lastT); vy=(e.clientY-lastPY)/dt; lastPY=e.clientY; lastT=e.timeStamp;
    }
    function up(){
      if(!dragging) return; dragging=false;
      if(moved<6){ snap(cur==='full'?'peek':'full'); return; }   // tap toggles
      snap(vy>0.5 ? 'peek' : vy<-0.5 ? 'full' : nearest(curY));  // flick or nearest
    }
    info.addEventListener('pointerdown',down);
    info.addEventListener('pointermove',move);
    info.addEventListener('pointerup',up);
    info.addEventListener('pointercancel',up);
    function reset(){
      if(mq.matches){ measure(); cur='peek'; apply(snaps.peek,false); info.classList.remove('sheet-full'); }
      else { info.style.transform=''; info.style.transition=''; $('#console').style.marginBottom=''; }
    }
    let rt; window.addEventListener('resize', ()=>{ clearTimeout(rt); rt=setTimeout(reset,120); });
    reset();
    return { isMobile:()=>mq.matches, expand:()=>snap('full'), peek:()=>snap('peek') };
  }

  function loop(prev){
    return function frame(now){
      const dt=Math.min(0.05,(now-(prev||now))/1000); prev=now;
      if(playing){
        playFrac -= dt*0.022;                    // forward in time (~45s full sweep)
        if(playFrac<=0){ playFrac=0; setTime(fracToMa(0)); stopPlay(); }
        else setTime(fracToMa(playFrac));
      }
      globe.frame(dt);
      requestAnimationFrame(frame);
    };
  }

  function boot(){
    loadMesh().then(mesh=>{
      globe = Globe($('#scene'), mesh);
      window.__G = globe;   // debug/testing hook
      // Readouts reflect the target age immediately; the globe eases visually.
      buildTimeline(); buildDropdown(); wire(); doResize();
      // default toggles state
      $('#spinBtn').classList.add('active'); $('#cloudBtn').classList.add('active');
      sheet = initMobileSheet();   // facts becomes a draggable bottom sheet on mobile
      globe.setTimeImmediate(0); updateUI(0);
      requestAnimationFrame(loop(0));
      setTimeout(()=>{ $('#loader').classList.add('hide'); },350);
      const hint=$('#hint'); hint.style.opacity=1; setTimeout(()=>hint.style.opacity=0,4200);
    }).catch(err=>{ console.error(err); $('#loader').innerHTML='<p style="color:#f88">Failed to load: '+err.message+'</p>'; });
  }

  if(document.readyState!=='loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
