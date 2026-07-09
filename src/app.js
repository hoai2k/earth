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
  let globe, draggingSlider=false, playing=false, curIv=null;

  function loadMesh(){
    if (typeof MESH !== 'undefined') return Promise.resolve(MESH);
    return fetch('./data/plates-mesh.json').then(r=>r.json());
  }

  function buildTimeline(){
    const strip = $('#strip');
    // present (0 Ma) on the left, deep past on the right
    const ordered = INTERVALS.slice().sort((a,b)=>a.end-b.end);
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
    // playhead + strip highlight
    const fr=maToFrac(ma);
    $('#playhead').style.left = (fr*100)+'%';
    for(const seg of $('#strip').children) seg.classList.toggle('on', seg.dataset.id===iv.id);
    if(!opts.fromSlider && !draggingSlider) $('#slider').value = Math.round(fr*1000);
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
    const slider=$('#slider');
    slider.addEventListener('input', ()=>{ draggingSlider=true; const ma=fracToMa(slider.value/1000); stopPlay(); setTime(ma,{fromSlider:true}); });
    slider.addEventListener('change', ()=>{ draggingSlider=false; });
    slider.addEventListener('pointerup', ()=>{ draggingSlider=false; });
    slider.addEventListener('pointerdown', ()=>{ draggingSlider=true; });

    $('#maInput').addEventListener('input', ()=>{ const v=parseFloat($('#maInput').value); if(!isNaN(v)){ stopPlay(); setTime(v,{fromInput:true}); } });
    $('#eraSelect').addEventListener('change', ()=>{ const iv=INTERVALS.find(i=>i.id===$('#eraSelect').value); if(iv){ stopPlay(); setTime(midOf(iv)); } });

    $('#playBtn').addEventListener('click', togglePlay);
    $('#spinBtn').addEventListener('click', ()=>{ const b=$('#spinBtn'); const on=!b.classList.contains('active'); b.classList.toggle('active',on); globe.setSpin(on); });
    $('#cloudBtn').addEventListener('click', ()=>{ const b=$('#cloudBtn'); const on=!b.classList.contains('active'); b.classList.toggle('active',on); globe.setClouds(on); });
    $('#resetBtn').addEventListener('click', ()=>{ globe.resetView(); });

    // full-globe focus mode: hide all panels for unobstructed interaction
    const app=$('#app');
    function setFocus(on){ app.classList.toggle('focus',on); $('#focusBtn').classList.toggle('active',on);
      $('#focusBtn').title = on ? 'Show panels' : 'Full-globe mode — hide panels'; }
    $('#focusBtn').addEventListener('click', ()=> setFocus(!app.classList.contains('focus')));
    $('#restoreBtn').addEventListener('click', ()=> setFocus(false));
    // collapse / expand the facts panel
    $('#infoToggle').addEventListener('click', ()=> $('#info').classList.toggle('collapsed'));

    window.addEventListener('resize', doResize);
  }

  // ---- playback: sweep from present back through time -----------------------
  let playFrac=0, playDir=1;
  function togglePlay(){ playing?stopPlay():startPlay(); }
  function startPlay(){ playing=true; $('#playBtn').innerHTML='<span class="ic">❚❚</span> Pause';
    playFrac=maToFrac(globe.getDisplayMa()); if(playFrac>=0.999){playFrac=0; playDir=1;} }
  function stopPlay(){ if(!playing)return; playing=false; $('#playBtn').innerHTML='<span class="ic">▶</span> Play through time'; }

  function doResize(){ const w=window.innerWidth,h=window.innerHeight; globe.resize(w,h); }

  function loop(prev){
    return function frame(now){
      const dt=Math.min(0.05,(now-(prev||now))/1000); prev=now;
      if(playing){
        playFrac += playDir*dt*0.022;           // ~45s per full sweep
        if(playFrac>=1){ playFrac=1; playDir=-1; }
        if(playFrac<=0){ playFrac=0; playDir=1; }
        setTime(fracToMa(playFrac));
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
      globe.setTimeImmediate(0); updateUI(0);
      requestAnimationFrame(loop(0));
      setTimeout(()=>{ $('#loader').classList.add('hide'); },350);
      const hint=$('#hint'); hint.style.opacity=1; setTimeout(()=>hint.style.opacity=0,4200);
    }).catch(err=>{ console.error(err); $('#loader').innerHTML='<p style="color:#f88">Failed to load: '+err.message+'</p>'; });
  }

  if(document.readyState!=='loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
