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

  function Globe(canvas, mesh) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 400);
    camera.position.set(0, 0.75, 2.85);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setClearColor(0x03040a, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.9;
    controls.enablePan = false; controls.minDistance = 1.18; controls.maxDistance = 9;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.28;
    let userActive = false, idleTimer = null;
    controls.addEventListener('start', () => { userActive = true; controls.autoRotate = false; if (idleTimer) clearTimeout(idleTimer); });
    controls.addEventListener('end', () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (spinEnabled) controls.autoRotate = true; }, 4000); userActive = false; });

    const SUN = new THREE.Vector3(0.65, 0.32, 0.68).normalize();

    scene.add(makeStars());
    const sun = sunSprite(); sun.position.copy(SUN).multiplyScalar(60); scene.add(sun);

    const earth = new THREE.Group();
    scene.add(earth);

    // ---- Ocean ---------------------------------------------------------------
    const oceanUniforms = {
      uSun: { value: SUN }, uTime: { value: 0 }, uMagma: { value: 0 }, uGreen: { value: 0 },
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
          uniform vec3 uSun; uniform float uTime, uMagma, uGreen; varying vec3 vN,vView,vPos;
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

    // ---- Continents (one rigid mesh per plate) -------------------------------
    const contUniforms = { uSun: { value: SUN }, uFade: { value: 1 } };
    const contVert = `varying vec3 vWN; varying vec3 vLocal; varying vec3 vWP;
      void main(){ vLocal=normalize(position); vWN=normalize(mat3(modelMatrix)*normalize(position));
      vec4 wp=modelMatrix*vec4(position,1.0); vWP=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`;
    const contFrag = NOISE + `
      uniform vec3 uSun; uniform float uFade; varying vec3 vWN,vLocal,vWP;
      void main(){
        vec3 N=normalize(vWN), L=normalize(uSun);
        float lat=degrees(asin(clamp(normalize(vWP).y,-1.0,1.0)));
        float al=abs(lat);
        float e=fbm(vLocal*3.4);
        float e2=fbm(vLocal*9.0+7.0);
        vec3 tropic=vec3(0.16,0.40,0.14), savanna=vec3(0.55,0.55,0.26), desert=vec3(0.80,0.71,0.47);
        vec3 temper=vec3(0.28,0.45,0.21), boreal=vec3(0.18,0.33,0.21), tundra=vec3(0.55,0.57,0.50), ice=vec3(0.93,0.95,0.99);
        vec3 col=tropic;
        col=mix(col,savanna,smoothstep(7.0,17.0,al));
        col=mix(col,desert,0.85*smoothstep(15.0,24.0,al)*(1.0-smoothstep(30.0,38.0,al)));
        col=mix(col,temper,smoothstep(30.0,40.0,al));
        col=mix(col,boreal,smoothstep(45.0,58.0,al));
        col=mix(col,tundra,smoothstep(58.0,67.0,al));
        col=mix(col,ice,smoothstep(66.0,74.0,al));
        col*= (0.82+0.4*e2);                     // fine texture
        float mount=smoothstep(0.60,0.80,e);
        col=mix(col,vec3(0.42,0.37,0.32),mount*0.55);
        float snow=smoothstep(0.80,0.93,e)*(0.35+al/70.0);
        col=mix(col,ice,clamp(snow,0.0,1.0));
        // terrain relief: gently perturb normal by the elevation gradient (Mikkelsen)
        float H=(e-0.5)+(e2-0.5)*0.25;
        vec3 dpx=dFdx(vWP), dpy=dFdy(vWP);
        float dHx=dFdx(H), dHy=dFdy(H);
        vec3 r1=cross(dpy,N), r2=cross(N,dpx);
        float det=dot(dpx,r1);
        vec3 sg=sign(det)*(dHx*r1+dHy*r2);
        N=normalize(abs(det)*N - 4.0*sg);
        float dif=clamp(dot(N,L),0.0,1.0);
        vec3 lit=col*(0.24+0.9*dif);
        // subtle terminator warm tint
        lit+=vec3(0.25,0.12,0.05)*pow(clamp(1.0-abs(dot(N,L)),0.0,1.0),3.0)*dif;
        gl_FragColor=vec4(lit,uFade);
      }`;

    const plateMeshes = {};
    const plateIds = Object.keys(mesh.plates);
    plateIds.forEach((id, pi) => {
      const p = mesh.plates[id];
      const v = p.verts, n = v.length / 2;
      // stagger radii so overlapping plates occlude cleanly (no z-fighting)
      const rad = CONT_R + pi * 0.0012;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const s = RECON.sph(v[i*2], v[i*2+1]);
        pos[i*3]=s[0]*rad; pos[i*3+1]=s[1]*rad; pos[i*3+2]=s[2]*rad;
        nor[i*3]=s[0]; nor[i*3+1]=s[1]; nor[i*3+2]=s[2];
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(p.idx);
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
        uniforms: contUniforms, vertexShader: contVert, fragmentShader: contFrag,
        transparent: true, side: THREE.DoubleSide, extensions: { derivatives: true },
      }));
      m.renderOrder = 1;
      m.material.depthWrite = true;
      earth.add(m);
      plateMeshes[id] = m;
    });

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
    const _q = new THREE.Quaternion();
    function applyRecon(ma) {
      const t = Math.min(ma, 1000);
      for (const id in plateMeshes) {
        const q = RECON.quatAt(id, t);
        _q.set(q[0], q[1], q[2], q[3]);
        plateMeshes[id].quaternion.copy(_q);
      }
      // era-driven appearance
      const fade = 1 - smooth(1000, 1450, ma);
      contUniforms.uFade.value = fade;
      oceanUniforms.uMagma.value = smooth(3200, 4200, ma);
      oceanUniforms.uGreen.value = Math.max(0, smooth(1500, 2600, ma) - oceanUniforms.uMagma.value);
      cloudUniforms.uOpacity.value = 0.85 * (1 - oceanUniforms.uMagma.value) * (0.35 + 0.65 * Math.max(fade, 0.4));
      for (const id in plateMeshes) plateMeshes[id].visible = fade > 0.02;
    }
    function smooth(a, b, x){ const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t*t*(3-2*t); }

    let clock = 0;
    function frame(dt) {
      clock += dt;
      // ease displayed time toward target
      if (Math.abs(displayMa - targetMa) > 0.01) {
        displayMa += (targetMa - displayMa) * Math.min(1, dt * 3.0);
        if (Math.abs(displayMa - targetMa) < 0.05) displayMa = targetMa;
        applyRecon(displayMa);
        if (onTimeAnim) onTimeAnim(displayMa);
      }
      oceanUniforms.uTime.value = clock; cloudUniforms.uTime.value = clock;
      controls.update();
      renderer.render(scene, camera);
    }

    let onTimeAnim = null;
    applyRecon(0);

    return {
      scene, camera, renderer, controls, frame,
      setTime(ma){ targetMa = ma; },
      setTimeImmediate(ma){ targetMa = displayMa = ma; applyRecon(ma); },
      getDisplayMa(){ return displayMa; },
      setSpin(on){ spinEnabled = on; controls.autoRotate = on; },
      setClouds(on){ clouds.visible = on; },
      onTimeAnim(fn){ onTimeAnim = fn; },
      resize(w, h){ camera.aspect = w/h; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); renderer.setSize(w,h,false); },
      resetView(){ controls.reset(); camera.position.set(0,0.75,2.85); },
    };
  }

  root.Globe = Globe;
})(typeof window !== 'undefined' ? window : globalThis);
