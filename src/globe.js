/* ============================================================================
 * globe.js — Three.js scene: procedural realistic Earth whose continents are
 * rigid tectonic plates that rotate to their paleo-positions.
 * ==========================================================================*/
(function (root) {
  const R = 1.0;
  const CONT_R = 1.006;   // continents float just above the ocean
  const CLOUD_R = 1.018;
  const ATMO_R = 1.16;

  // ---- shared GLSL: cheap 3D value-noise + fbm -----------------------------
  const NOISE = `
  vec3 hash3(vec3 p){
    p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));
    return -1.0+2.0*fract(sin(p)*43758.5453123);
  }
  float vnoise(vec3 p){
    vec3 i=floor(p),f=fract(p);
    vec3 u=f*f*(3.0-2.0*f);
    return mix(mix(mix(dot(hash3(i+vec3(0,0,0)),f-vec3(0,0,0)),dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                   mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
               mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                   mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
  }
  float fbm(vec3 p){
    float v=0.0,a=0.5;
    for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; }
    return v*0.5+0.5;
  }`;

  function makeStars() {
    const N = 3500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // deterministic pseudo-random (no Math.random needed)
      const a = Math.sin(i * 12.9898) * 43758.5453; const r1 = a - Math.floor(a);
      const b = Math.sin(i * 78.233) * 12543.213; const r2 = b - Math.floor(b);
      const c = Math.sin(i * 39.425) * 24634.634; const r3 = c - Math.floor(c);
      const theta = r1 * Math.PI * 2, phi = Math.acos(2 * r2 - 1), rad = 90;
      pos[i*3] = rad*Math.sin(phi)*Math.cos(theta);
      pos[i*3+1] = rad*Math.cos(phi);
      pos[i*3+2] = rad*Math.sin(phi)*Math.sin(theta);
      const t = r3; const warm = 0.6 + 0.4*t;
      col[i*3] = 0.8+0.2*t; col[i*3+1] = 0.85+0.15*warm; col[i*3+2] = 1.0-0.15*t;
      siz[i] = r3 < 0.92 ? (0.18 + r3*0.35) : (0.7 + r3*0.9);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('asize', new THREE.BufferAttribute(siz, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: {}, transparent: true, depthWrite: false,
      vertexShader: `attribute float asize; attribute vec3 color; varying vec3 vC;
        void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=asize*(300.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
        float a=smoothstep(0.5,0.0,r); gl_FragColor=vec4(vC,a); }`,
    });
    return new THREE.Points(g, m);
  }

  function sunSprite() {
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = 128;
    const ctx = cvs.getContext('2d');
    const g = ctx.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'rgba(255,250,235,1)'); g.addColorStop(0.2,'rgba(255,240,200,0.9)');
    g.addColorStop(0.5,'rgba(255,210,140,0.35)'); g.addColorStop(1,'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
    const tex = new THREE.CanvasTexture(cvs);
    const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite:false, transparent:true });
    const s = new THREE.Sprite(mat); s.scale.set(14,14,1); return s;
  }

  // Per-era glaciation: [ageMa, iceEdgeLatitude(deg; 90 = ice-free), snowball(0..1)].
  // Ice appears poleward of iceEdge (in |latitude|); snowball adds a global freeze.
  // Values from published paleoclimate / glaciation extents (Torsvik, Scotese,
  // Snowball-Earth & Late-Paleozoic-Ice-Age literature).
  // [ageMa, iceEdgeLat, snowball, hemiBias]. hemiBias: +south-dominated / -north /
  // 0 bipolar — the non-dominant hemisphere's ice edge is pushed poleward.
  const CLIMATE = [
    [0,62,0,0.2],[0.02,40,0,-0.2],[1,45,0,-0.1],[2.7,50,0,-0.1],[5,60,0,0.4],[12,66,0,0.5],[15,69,0,0.5],
    [25,64,0,0.5],[33.9,63,0,0.6],[40,84,0,0.4],[50,89,0,0],[56,90,0,0],[66,88,0,0],[100,90,0,0],
    [145,88,0,0],[200,88,0,0],[250,78,0,0.5],[255,60,0,0.9],[275,36,0,1],[300,30,0,1],[320,31,0,1],
    [335,34,0,1],[350,46,0,0.8],[360,56,0,0.6],[375,72,0,0.5],[400,86,0,0],[419,85,0,0],[430,84,0,0],
    [443,58,0,0.7],[444.3,40,0,1],[445.2,46,0,1],[450,66,0,0.6],[470,84,0,0.3],[500,88,0,0],[539,86,0,0],
    [560,80,0,0.3],[578,60,0.05,0.5],[580.5,38,0.2,0.6],[583,62,0.02,0.4],[600,88,0,0],[635,12,0.9,0],
    [642,6,0.97,0],[650,10,0.9,0],[655,52,0.12,0],[660,10,0.9,0],[688,6,0.97,0],[717,12,0.9,0],
    [725,80,0,0],[1000,85,0,0],[1600,88,0,0],[2100,88,0,0],[2220,86,0,0],[2300,13,0.9,0],[2400,11,0.92,0],
    [2450,22,0.6,0],[2500,88,0,0],
  ];
  function climateAt(ma) {
    const A = CLIMATE, lerp = (a, b, f) => a + (b - a) * f;
    if (ma <= A[0][0]) return { edge: A[0][1], snow: A[0][2], hemi: A[0][3] };
    const last = A[A.length - 1];
    if (ma >= last[0]) return { edge: last[1], snow: last[2], hemi: last[3] };
    for (let i = 0; i < A.length - 1; i++) {
      if (ma >= A[i][0] && ma <= A[i + 1][0]) {
        const f = (ma - A[i][0]) / (A[i + 1][0] - A[i][0]);
        return { edge: lerp(A[i][1], A[i+1][1], f), snow: lerp(A[i][2], A[i+1][2], f), hemi: lerp(A[i][3], A[i+1][3], f) };
      }
    }
    return { edge: last[1], snow: last[2], hemi: last[3] };
  }

  function Globe(canvas, FIELD) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 400);
    camera.position.set(0, 0.75, 2.85);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setClearColor(0x03040a, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;

    const earth = new THREE.Group();
    scene.add(earth);

    // OrbitControls is used only for zoom (dolly) and for camera-orbit when the
    // user drags empty space; rotating the globe itself is handled below.
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.9;
    controls.enablePan = false; controls.minDistance = 1.18; controls.maxDistance = 9;
    controls.autoRotate = false;

    // Sun roughly toward the viewer so the visible face stays lit; offset up/right
    // for grazing light that reveals terrain relief.
    const SUN = new THREE.Vector3(0.34, 0.30, 0.90).normalize();
    scene.add(makeStars());
    const sun = sunSprite(); sun.position.copy(SUN).multiplyScalar(60); scene.add(sun);

    // ---- interaction: drag the globe -> spin Earth (stays sun-facing);
    //      drag empty space -> orbit camera; wheel/pinch -> zoom ------------------
    let userActive = false, idleTimer = null;
    const raycaster = new THREE.Raycaster();
    const _sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), R);
    const _ndc = new THREE.Vector2(), _hit = new THREE.Vector3(), _right = new THREE.Vector3();
    const _qy = new THREE.Quaternion(), _qx = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
    let earthDrag = false, lastX = 0, lastY = 0, velX = 0, velY = 0, pointers = 0;
    const el = renderer.domElement;
    function hitGlobe(cx, cy) {
      const r = el.getBoundingClientRect();
      _ndc.x = ((cx - r.left) / r.width) * 2 - 1;
      _ndc.y = -((cy - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(_ndc, camera);
      return raycaster.ray.intersectSphere(_sphere, _hit) !== null;
    }
    controls.enableRotate = false;   // rotation handled below; OrbitControls only zooms
    let orbitDrag = false;
    // Turntable rotation: unlimited yaw (spin about the polar axis, with momentum)
    // + pitch (tilt toward a pole; no momentum, never rolls).
    // earth.quaternion = pitch(about screen-X) * yaw(about world-Y).
    const X_AXIS = new THREE.Vector3(1, 0, 0);
    let yaw = 0, pitch = 0, yawVel = 0;
    // Pitch is clamped relative to the camera direction so the extremes put the
    // North / South pole exactly at screen centre (the camera sits a little above
    // the equator, so the bounds are not simply ±90°).
    function pitchBounds() { const hi = Math.atan2(camera.position.z, camera.position.y); return [hi - Math.PI, hi]; }
    function clampPitch(p) { const b = pitchBounds(); return Math.max(b[0], Math.min(b[1], p)); }
    function applyOrientation() {
      _qx.setFromAxisAngle(X_AXIS, pitch);
      _qy.setFromAxisAngle(UP, yaw);
      earth.quaternion.copy(_qx).multiply(_qy);
    }
    function dragSpin(dx, dy) {   // grabbed surface follows the cursor
      const sp = 0.006;
      yaw += dx * sp;
      pitch = clampPitch(pitch + dy * sp);
      yawVel = dx * sp;           // momentum on the spin only, not the tilt
      applyOrientation();
    }
    function orbitCamera(dx, dy) {   // rotate viewpoint around the globe (sun stays fixed)
      const sp = 0.005;
      _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      _qy.setFromAxisAngle(UP, -dx * sp);
      camera.position.applyQuaternion(_qy);
      // clamp pitch so we don't flip over the poles
      const cur = Math.acos(Math.max(-1, Math.min(1, camera.position.clone().normalize().y)));
      const want = -dy * sp, lim = 0.12;
      const pitch = Math.max(lim - cur, Math.min(Math.PI - lim - cur, want));
      _qx.setFromAxisAngle(_right, pitch);
      camera.position.applyQuaternion(_qx);
      camera.lookAt(0, 0, 0);
    }
    el.addEventListener('pointerdown', (e) => {
      pointers++;
      userActive = true; if (idleTimer) clearTimeout(idleTimer);
      if (pointers === 1) {
        if (hitGlobe(e.clientX, e.clientY)) { earthDrag = true; orbitDrag = false; velX = velY = 0; }
        else { orbitDrag = true; earthDrag = false; }
        lastX = e.clientX; lastY = e.clientY;
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      } else { earthDrag = false; orbitDrag = false; }   // 2+ pointers -> pinch zoom
    });
    el.addEventListener('pointermove', (e) => {
      if (pointers !== 1) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (earthDrag) dragSpin(dx, dy);
      else if (orbitDrag) orbitCamera(dx, dy);
    });
    function endDrag() {
      pointers = Math.max(0, pointers - 1);
      if (pointers === 0) {
        earthDrag = false; orbitDrag = false;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { userActive = false; }, 3500);
      }
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    // ---- Ocean ---------------------------------------------------------------
    const oceanUniforms = {
      uSun: { value: SUN }, uTime: { value: 0 }, uMagma: { value: 0 }, uGreen: { value: 0 },
      uIceEdge: { value: 62 }, uSnowball: { value: 0 }, uHemi: { value: 0 },
    };
    const ocean = new THREE.Mesh(
      new THREE.SphereGeometry(R, 128, 96),
      new THREE.ShaderMaterial({
        uniforms: oceanUniforms,
        vertexShader: `varying vec3 vN; varying vec3 vView; varying vec3 vPos;
          void main(){ vN=normalize(mat3(modelMatrix)*normal); vPos=normalize(position);
          vec4 wp=modelMatrix*vec4(position,1.0); vView=normalize(cameraPosition-wp.xyz);
          gl_Position=projectionMatrix*viewMatrix*wp; }`,
        fragmentShader: NOISE + `
          uniform vec3 uSun; uniform float uTime, uMagma, uGreen, uIceEdge, uSnowball, uHemi; varying vec3 vN,vView,vPos;
          void main(){
            vec3 N=normalize(vN), V=normalize(vView), L=normalize(uSun);
            float dif=clamp(dot(N,L),0.0,1.0);
            float mott=fbm(vPos*2.6);
            vec3 deep=vec3(0.015,0.07,0.19), shallow=vec3(0.04,0.20,0.40);
            vec3 base=mix(deep,shallow,0.35+0.35*mott);
            // archean greenish seas
            base=mix(base, mix(vec3(0.05,0.16,0.16),vec3(0.10,0.28,0.24),mott), uGreen);
            vec3 col=base*(0.10+0.95*dif);
            vec3 Rr=reflect(-L,N); float spec=pow(max(dot(Rr,V),0.0),140.0)*dif;
            col+=vec3(1.0,0.93,0.75)*spec*0.55;
            float fres=pow(1.0-max(dot(N,V),0.0),3.0);
            col=mix(col, vec3(0.28,0.48,0.85), fres*0.5*dif);
            // sea ice: polar pack ice this era + global freeze in snowball worlds
            // vPos is the ocean's local position -> reconstruction-frame latitude
            float olat=degrees(asin(clamp(vPos.y,-1.0,1.0)));
            float oedge=uIceEdge + (olat>0.0 ? max(0.0,uHemi) : max(0.0,-uHemi))*25.0;
            float sea=smoothstep(oedge-2.0, oedge+9.0, abs(olat)+mott*7.0-3.5);
            sea=max(sea, uSnowball*(0.85+0.15*mott));
            vec3 seaIce=vec3(0.80,0.86,0.93);
            col=mix(col, seaIce*(0.30+0.8*dif), sea);
            // hadean magma ocean
            if(uMagma>0.001){
              float h=fbm(vPos*3.1+vec3(uTime*0.03));
              float cracks=fbm(vPos*7.0-vec3(uTime*0.05));
              vec3 magma=mix(vec3(0.28,0.02,0.0),vec3(1.0,0.55,0.10),smoothstep(0.35,0.72,h));
              magma+=vec3(1.0,0.35,0.05)*pow(smoothstep(0.55,0.9,cracks),2.0);
              magma*= (0.7+0.5*dif);
              col=mix(col,magma,uMagma);
            }
            gl_FragColor=vec4(col,1.0);
          }`,
      })
    );
    earth.add(ocean);

    // ---- Continents (implicit distance-field union, re-evaluated per frame) ---
    // Each plate's LAND is a baked signed-distance field (a stereographic tile
    // in the atlas). The fragment shader rotates every plate's field by its
    // reconstruction quaternion and takes a smooth-min UNION of them, so the
    // coastline is the level-set of one moving field: plates that meet fuse into
    // a single landmass (land bridges), plates that separate pinch apart (rifts),
    // and overlaps raise mountains along the suture. Real colour/topography ride
    // along because each plate samples them in its own PRESENT-day frame.
    const NP = FIELD.plates.length;
    const uQ = [], uC = [], uE1 = [], uE2 = [], uRect = [], uRs = [];
    const curQ = [], plateList = [];
    FIELD.plates.forEach(p => {
      uQ.push(new THREE.Vector4(0, 0, 0, 1));
      uC.push(new THREE.Vector3(p.c[0], p.c[1], p.c[2]));
      uE1.push(new THREE.Vector3(p.e1[0], p.e1[1], p.e1[2]));
      uE2.push(new THREE.Vector3(p.e2[0], p.e2[1], p.e2[2]));
      uRect.push(new THREE.Vector4(p.rect[0], p.rect[1], p.rect[2], p.rect[3]));
      uRs.push(p.Rs);
      curQ.push(new THREE.Quaternion());
      plateList.push({ id: p.id, center: new THREE.Vector3(p.c[0], p.c[1], p.c[2]), mass: p.mass });
    });
    function loadTex(uri, opt) {
      const img = new Image();
      const tex = new THREE.Texture(img);
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      tex.wrapS = opt.wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.flipY = false;
      img.onload = () => { tex.needsUpdate = true; renderer.render(scene, camera); };
      img.src = uri;
      return tex;
    }
    const atlasTex = loadTex(FIELD.atlas, { wrap: false });
    const colorTex = loadTex(FIELD.color, { wrap: true });
    const topoTex = loadTex(FIELD.topo, { wrap: true });

    const contUniforms = { uSun: { value: SUN }, uFade: { value: 1 }, uClimate: { value: 0 },
      uIceEdge: { value: 62 }, uSnowball: { value: 0 }, uHemi: { value: 0 },
      uAtlas: { value: atlasTex }, uColor: { value: colorTex }, uTopo: { value: topoTex },
      uQ: { value: uQ }, uC: { value: uC }, uE1: { value: uE1 }, uE2: { value: uE2 },
      uRect: { value: uRect }, uRs: { value: uRs }, uDR: { value: FIELD.drange }, uK: { value: 3.0 },
      uAge: { value: 0 } };

    const contVert = `varying vec3 vLocal; varying vec3 vWN; varying vec3 vWP;
      void main(){ vLocal=normalize(position); vWN=normalize(mat3(modelMatrix)*normalize(position));
      vec4 wp=modelMatrix*vec4(position,1.0); vWP=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp; }`;
    const contFrag = NOISE + `
      #define NP ${NP}
      uniform vec3 uSun; uniform float uFade, uClimate, uIceEdge, uSnowball, uHemi, uDR, uK, uAge;
      uniform sampler2D uAtlas, uColor, uTopo;
      uniform vec4 uQ[NP]; uniform vec3 uC[NP], uE1[NP], uE2[NP]; uniform vec4 uRect[NP]; uniform float uRs[NP];
      varying vec3 vLocal, vWN, vWP;
      vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }
      float smin(float a, float b, float k){ float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0); return mix(b,a,h)-k*h*(1.0-h); }
      vec2 llUV(vec3 L){ float lon=atan(-L.z, L.x); float lat=asin(clamp(L.y,-1.0,1.0)); return vec2(lon/6.2831853+0.5, 0.5 - lat/3.14159265); }
      vec3 climate(float lat, float e, float micro){
        float al=abs(lat);
        vec3 tropic=vec3(0.14,0.34,0.12), savanna=vec3(0.52,0.50,0.24), desert=vec3(0.74,0.64,0.42);
        vec3 temper=vec3(0.24,0.40,0.19), boreal=vec3(0.16,0.30,0.19), tundra=vec3(0.52,0.53,0.47), ice=vec3(0.90,0.93,0.97);
        vec3 c=tropic;
        c=mix(c,savanna,smoothstep(7.0,17.0,al));
        c=mix(c,desert,0.85*smoothstep(15.0,24.0,al)*(1.0-smoothstep(30.0,38.0,al)));
        c=mix(c,temper,smoothstep(30.0,40.0,al));
        c=mix(c,boreal,smoothstep(45.0,58.0,al));
        c=mix(c,tundra,smoothstep(58.0,67.0,al));
        c=mix(c,ice,smoothstep(66.0,76.0,al));
        c*=(0.85+0.3*micro);
        return c;
      }
      void main(){
        vec3 D=normalize(vLocal);
        // union of the plate distance fields (degrees); track the two nearest
        // plates (field value + present-frame direction) so overlaps can BLEND
        // and uplift instead of one plate's texture sitting on top of the other.
        float best=uDR*2.0, second=uDR*2.0; vec3 bestL=D, secondL=D;
        for(int k=0;k<NP;k++){
          vec3 L=qrot(vec4(-uQ[k].xyz,uQ[k].w), D);
          float t=dot(L,uC[k]);
          if(t<0.05) continue;                      // plate elsewhere on the globe
          float kf=2.0/(1.0+t);
          float un=(kf*dot(L,uE1[k]))/uRs[k]*0.5+0.5;
          float vn=(kf*dot(L,uE2[k]))/uRs[k]*0.5+0.5;
          if(un<0.0||un>1.0||vn<0.0||vn>1.0) continue;
          vec2 uv=uRect[k].xy+vec2(un,vn)*uRect[k].zw;
          float d=texture2D(uAtlas,uv).r*(2.0*uDR)-uDR;   // decode signed degrees
          if(d<best){ second=best; secondL=bestL; best=d; bestL=L; }
          else if(d<second){ second=d; secondL=L; }
        }
        float field=smin(best,second,uK);            // fuse nearby coasts
        float haveSecond=1.0-step(uDR*1.5,second);   // second plate actually present here
        float bw=mix(1.0, clamp(0.5+(second-best)*0.10,0.0,1.0), haveSecond);
        // noise rides in the PLATE frame (bestL/secondL rotate with the land),
        // so detail drifts with its continent instead of the land sliding under
        // a static pattern; a slow age-driven domain shift makes it evolve too.
        vec3 nL=normalize(mix(secondL,bestL,bw));
        vec3 nOff=vec3(uAge*0.011, uAge*0.007, -uAge*0.009);
        float micro=fbm(nL*22.0+nOff);
        float micro2=fbm(nL*64.0-nOff*1.7);
        float w=0.85;
        // dither the contour with noise so the sub-degree tile stairs break up
        float land=1.0-smoothstep(-w, w, field + (micro-0.5)*1.1 + (micro2-0.5)*0.6);
        if(land<0.02) discard;

        float lat=degrees(asin(clamp(D.y,-1.0,1.0)));  // paleo latitude (turntable-independent)
        float al=abs(lat);
        // sample BOTH nearest plates and cross-fade by relative field depth, so
        // a collision zone is one continuous surface (no over/under seam).
        vec2 cuv=llUV(bestL), cuv2=llUV(secondL);
        vec3 real=pow(clamp(texture2D(uColor,cuv).rgb,0.0,1.0),vec3(2.2));
        float e=clamp(texture2D(uTopo,cuv).r,0.0,1.0);
        vec3 real2=pow(clamp(texture2D(uColor,cuv2).rgb,0.0,1.0),vec3(2.2));
        float e2=clamp(texture2D(uTopo,cuv2).r,0.0,1.0);
        real=mix(real2,real,bw);
        e=mix(e2,e,bw);
        // water pixels (inland lakes / offshore blue caught by the dilated
        // fringe) are near-black albedo that no sun angle can light — swap
        // them for the latitude climate colour instead.
        float wat=smoothstep(0.005,0.06, real.b-max(real.r,real.g));
        float bestPresLat=degrees(asin(clamp(mix(secondL.y,bestL.y,bw),-1.0,1.0)));
        // collision orogeny: where two plates' interiors overlap, the crust
        // thickens — build a ridged mountain belt along the suture and let it
        // consume the overlap (rocky, snow-capped, strong relief).
        float overlap=clamp(-best/5.0,0.0,1.0)*clamp(-second/5.0,0.0,1.0);
        float ridge=1.0-abs(2.0*micro2-1.0);         // sharp crest lines
        float uplift=overlap*(0.55+0.45*ridge);
        e=clamp(e+uplift*0.95,0.0,1.0);
        vec3 clim=climate(lat,e,micro);
        float latShift=clamp(abs(lat-bestPresLat)/40.0,0.0,1.0);
        float toClim=clamp(uClimate*0.8 + latShift*0.7,0.0,1.0);
        vec3 col=mix(real,clim,max(toClim,wat));
        // exposed rock over the young mountain belt
        vec3 rock=vec3(0.40,0.34,0.27)*(0.72+0.55*micro);
        col=mix(col, rock, smoothstep(0.10,0.55,uplift)*0.8);
        vec3 ICE=vec3(0.93,0.95,0.99);
        float edge=uIceEdge + (lat>0.0 ? max(0.0,uHemi) : max(0.0,-uHemi))*25.0;
        float iceAmt=smoothstep(edge-9.0, edge+7.0, al+micro*7.0-3.5);
        iceAmt=max(iceAmt, uSnowball*(0.72+0.28*micro));
        col=mix(col, ICE, iceAmt);
        float cold=smoothstep(88.0,35.0,uIceEdge);
        float snow=smoothstep(0.5,0.82,e+micro*0.12-0.06)*clamp(cold*0.55+smoothstep(30.0,60.0,al)*0.7+uplift*0.8,0.0,1.0);
        col=mix(col, ICE, snow*0.55*(1.0-iceAmt));
        // terrain relief: perturb normal by the elevation gradient (Mikkelsen).
        // Lean on smoothed topo + fine noise rather than raw texel steps.
        vec3 N=normalize(vWN), L2=normalize(uSun);
        float H=e*1.05 + micro*0.06 + micro2*0.03 + uplift*1.1;
        vec3 dpx=dFdx(vWP), dpy=dFdy(vWP);
        float dHx=dFdx(H), dHy=dFdy(H);
        vec3 r1=cross(dpy,N), r2=cross(N,dpx);
        float det=dot(dpx,r1);
        // bounded bump: cap the slope of the perturbation so steep screen-space
        // gradients (ridged uplift, texel steps) can never flip the normal away
        // from the sun and leave permanently-black facets.
        vec3 pert=(-0.95*sign(det))*(dHx*r1+dHy*r2)/max(abs(det),1e-8);
        float pl=length(pert);
        pert*=min(pl,1.1)/max(pl,1e-6);
        N=normalize(N+pert);
        float dif=clamp(dot(N,L2),0.0,1.0);
        // ambient floor + faint sky fill so shaded slopes stay readable
        float fill=0.10*clamp(0.5+0.5*N.y,0.0,1.0);
        vec3 lit=col*(0.34+0.82*dif+fill);
        lit+=vec3(0.25,0.12,0.05)*pow(clamp(1.0-abs(dot(N,L2)),0.0,1.0),3.0)*dif;
        gl_FragColor=vec4(lit, uFade*land);
      }`;

    const contGeo = new THREE.SphereGeometry(CONT_R, 320, 200);
    const contMesh = new THREE.Mesh(contGeo, new THREE.ShaderMaterial({
      uniforms: contUniforms, vertexShader: contVert, fragmentShader: contFrag,
      transparent: true, extensions: { derivatives: true },
    }));
    contMesh.renderOrder = 1;
    contMesh.material.depthWrite = true;
    earth.add(contMesh);

    // ---- Clouds --------------------------------------------------------------
    const cloudUniforms = { uSun: { value: SUN }, uTime: { value: 0 }, uOpacity: { value: 0.9 } };
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(CLOUD_R, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: cloudUniforms, transparent: true, depthWrite: false,
        vertexShader: `varying vec3 vN; varying vec3 vPos; varying vec3 vView;
          void main(){ vN=normalize(mat3(modelMatrix)*normal); vPos=normalize(position);
          vec4 wp=modelMatrix*vec4(position,1.0); vView=normalize(cameraPosition-wp.xyz);
          gl_Position=projectionMatrix*viewMatrix*wp; }`,
        fragmentShader: NOISE + `
          uniform vec3 uSun; uniform float uTime, uOpacity; varying vec3 vN,vPos,vView;
          void main(){
            vec3 p=vPos*2.2+vec3(uTime*0.006,0.0,0.0);
            float c=fbm(p); c=smoothstep(0.52,0.78,c);
            float bands=0.6+0.4*fbm(vPos*vec3(1.0,4.0,1.0));
            c*=bands;
            float dif=clamp(dot(normalize(vN),normalize(uSun)),0.0,1.0);
            float a=c*uOpacity;
            if(a<0.01) discard;
            vec3 col=vec3(1.0)* (0.25+0.85*dif);
            gl_FragColor=vec4(col,a);
          }`,
      })
    );
    clouds.renderOrder = 2; earth.add(clouds);

    // ---- Atmosphere ----------------------------------------------------------
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(ATMO_R, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { uSun: { value: SUN } }, transparent: true, side: THREE.BackSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader: `varying vec3 vN; varying vec3 vView; varying vec3 vWP;
          void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0);
          vWP=wp.xyz; vView=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
        fragmentShader: `uniform vec3 uSun; varying vec3 vN,vView,vWP;
          void main(){ vec3 N=normalize(vN);
          float rim=pow(clamp(0.72 - dot(N,-normalize(vView)),0.0,1.0),2.2);
          float dif=clamp(dot(normalize(-vWP),normalize(uSun))*0.5+0.6,0.0,1.0);
          vec3 col=mix(vec3(0.20,0.42,0.9),vec3(0.5,0.72,1.0),rim);
          gl_FragColor=vec4(col, rim*1.4*dif); }`,
      })
    );
    scene.add(atmo);

    // ---- Reconstruction / animation state ------------------------------------
    let displayMa = 0, targetMa = 0, spinEnabled = true;
    function applyRecon(ma) {
      const t = Math.min(ma, 1000);
      // update each plate's reconstruction quaternion (drives the field union)
      for (let i = 0; i < NP; i++) {
        const q = RECON.quatAt(plateList[i].id, t);
        uQ[i].set(q[0], q[1], q[2], q[3]);
        curQ[i].set(q[0], q[1], q[2], q[3]);
      }
      // era-driven appearance
      contUniforms.uAge.value = ma;   // evolves the surface noise through time
      const fade = 1 - smooth(1000, 1450, ma);
      contUniforms.uFade.value = fade;
      contUniforms.uClimate.value = smooth(15, 250, ma);  // real biomes -> climate palette
      oceanUniforms.uMagma.value = smooth(3200, 4200, ma);
      oceanUniforms.uGreen.value = Math.max(0, smooth(1500, 2600, ma) - oceanUniforms.uMagma.value);
      cloudUniforms.uOpacity.value = 0.85 * (1 - oceanUniforms.uMagma.value) * (0.35 + 0.65 * Math.max(fade, 0.4));
      contMesh.visible = fade > 0.02;
      // per-era glaciation (see CLIMATE table)
      const cl = climateAt(ma);
      contUniforms.uIceEdge.value = cl.edge; contUniforms.uSnowball.value = cl.snow; contUniforms.uHemi.value = cl.hemi;
      oceanUniforms.uIceEdge.value = cl.edge; oceanUniforms.uSnowball.value = cl.snow; oceanUniforms.uHemi.value = cl.hemi;
    }
    function smooth(a, b, x){ const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t*t*(3-2*t); }

    // Weighted centroid direction of all land at the current time. Each plate's
    // present-frame centre is rotated by its current reconstruction quaternion.
    const _v = new THREE.Vector3(), _acc = new THREE.Vector3();
    function landCentroid(out) {
      _acc.set(0, 0, 0);
      if (!contMesh.visible) { return out.set(0, 0, 1); }
      for (let i = 0; i < NP; i++) {
        _v.copy(plateList[i].center).applyQuaternion(curQ[i]).multiplyScalar(plateList[i].mass);
        _acc.add(_v);
      }
      if (_acc.lengthSq() < 1e-9) _acc.set(0, 0, 1);
      return out.copy(_acc).normalize();
    }
    let followEnabled = true;
    const prevC = new THREE.Vector3(0, 0, 1), curC = new THREE.Vector3();
    landCentroid(prevC);
    let prevAz = Math.atan2(prevC.z, prevC.x);

    const _m4 = new THREE.Matrix4(), _spin = new THREE.Quaternion();
    let clock = 0;
    function frame(dt) {
      clock += dt;
      // ease displayed time toward target
      const animating = Math.abs(displayMa - targetMa) > 0.01;
      if (animating) {
        displayMa += (targetMa - displayMa) * Math.min(1, dt * 3.0);
        if (Math.abs(displayMa - targetMa) < 0.05) displayMa = targetMa;
        applyRecon(displayMa);
        if (onTimeAnim) onTimeAnim(displayMa);
      }
      // keep continents in view: track the land centroid's longitude drift with
      // yaw (turntable-safe; the empty ocean rotates to the back). Pitch is left
      // to the user so the view never tilts on its own.
      landCentroid(curC);
      const az = Math.atan2(curC.z, curC.x);
      let dAz = az - prevAz; if (dAz > Math.PI) dAz -= 2*Math.PI; else if (dAz < -Math.PI) dAz += 2*Math.PI;
      prevAz = az;
      if (!earthDrag) {
        if (followEnabled && animating) yaw += dAz;
        // momentum on the spin (yaw only)
        if (Math.abs(yawVel) > 0.0002) { yaw += yawVel; yawVel *= 0.94; } else yawVel = 0;
        // gentle idle auto-spin (paused while interacting or animating)
        if (spinEnabled && !userActive && !animating) yaw += dt * 0.045;
        applyOrientation();
      }
      oceanUniforms.uTime.value = clock; cloudUniforms.uTime.value = clock;
      controls.update();
      renderer.render(scene, camera);
    }

    // Point the turntable so a given local direction faces the (fixed) camera.
    function faceDir(dir) {
      const d = dir.clone().normalize(), F = camera.position.clone().normalize();
      yaw = Math.atan2(-d.x, d.z);
      let dp = d.clone().applyAxisAngle(UP, yaw);
      if (dp.z < 0) { yaw += Math.PI; dp = d.clone().applyAxisAngle(UP, yaw); }
      pitch = clampPitch(Math.atan2(F.z, F.y) - Math.atan2(dp.z, dp.y));
      yawVel = 0; applyOrientation();
      landCentroid(prevC); prevAz = Math.atan2(prevC.z, prevC.x);
    }

    let onTimeAnim = null;
    applyRecon(0);
    // open facing Africa/Europe (recognisable + well lit) rather than a pole
    const HOME = RECON.sph(24, 18);
    faceDir(new THREE.Vector3(HOME[0], HOME[1], HOME[2]));

    return {
      scene, camera, renderer, controls, frame,
      setTime(ma){ targetMa = ma; },
      setTimeImmediate(ma){ targetMa = displayMa = ma; applyRecon(ma); },
      getDisplayMa(){ return displayMa; },
      setSpin(on){ spinEnabled = on; },
      setClouds(on){ clouds.visible = on; },
      setFollow(on){ followEnabled = on; },
      onTimeAnim(fn){ onTimeAnim = fn; },
      resize(w, h){ camera.aspect = w/h; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); renderer.setSize(w,h,false); },
      resetView(){ controls.reset(); camera.position.set(0,0.75,2.85); faceDir(new THREE.Vector3(HOME[0], HOME[1], HOME[2])); },
      // debug/testing helpers
      _earth: earth,
      _state(){ return { yaw, pitch, yawVel }; },
      _face(dir){ faceDir(dir); },
      _centroid(){ const o = new THREE.Vector3(); landCentroid(o); return o; },
    };
  }

  root.Globe = Globe;
})(typeof window !== 'undefined' ? window : globalThis);
