/* ============================================================================
 * recon.js — Plate-tectonic reconstruction model.
 *
 * Each continental block is treated as a rigid plate. For a set of key
 * reconstruction times we store the paleo-position of a representative anchor
 * point (paleo-latitude, paleo-longitude) plus an azimuth (how much the block
 * has rotated relative to today). From that we build a finite rotation
 * quaternion that maps every present-day point on the plate to its position at
 * that time. Between key times we interpolate the anchor smoothly.
 *
 * Latitudes are grounded in published paleogeography (Torsvik & Cocks 2017;
 * Scotese PALEOMAP). Longitudes/azimuths — poorly constrained in deep time —
 * are chosen to reproduce the accepted assemblies (Pangea, Gondwana, Rodinia)
 * and the well-dated events (Atlantic opening, India's collision with Asia).
 * This is a simplified educational model, not a research-grade circuit.
 * ==========================================================================*/
(function (root) {
  const D2R = Math.PI / 180;

  // Canonical lon/lat -> unit vector. North pole = +Y. Used by BOTH the
  // reconstruction and the mesh projection so rotations stay consistent.
  function sph(lon, lat) {
    const la = lat * D2R, lo = lon * D2R, c = Math.cos(la);
    return [c * Math.cos(lo), Math.sin(la), -c * Math.sin(lo)];
  }
  function vecToLL(v) {
    const lat = Math.asin(Math.max(-1, Math.min(1, v[1]))) / D2R;
    const lon = Math.atan2(-v[2], v[0]) / D2R;
    return [lon, lat];
  }
  // --- quaternion helpers: q = [x,y,z,w] ---
  function qAxisAngle(ax, ang) {
    const h = ang / 2, s = Math.sin(h);
    return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(h)];
  }
  function qMul(a, b) {
    return [
      a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
      a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
      a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
      a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2],
    ];
  }
  function qBetween(u, v) {
    // minimal rotation carrying unit vector u onto unit vector v
    let d = u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
    d = Math.max(-1, Math.min(1, d));
    if (d > 0.999999) return [0, 0, 0, 1];
    let ax;
    if (d < -0.999999) {
      // antipodal: any perpendicular axis
      ax = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      ax = norm(cross(u, ax));
      return qAxisAngle(ax, Math.PI);
    }
    ax = norm(cross(u, v));
    return qAxisAngle(ax, Math.acos(d));
  }
  function cross(a, b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function norm(a){ const l = Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; }

  // Anchor points: representative present-day [lon, lat] per plate.
  const ANCHOR = {
    NAM:[-100,45], GRN:[-42,74], EUR:[25,52], SIB:[100,66], CHN:[112,32],
    IND:[78,22],  ARB:[45,24],  AFR:[18,3],  SAM:[-58,-12], AUS:[134,-25], ANT:[45,-80],
  };

  // Keyframes: [timeMa, paleoLat, paleoLon, azimuthDeg]. Ascending time.
  const KF = {
    AFR:[[0,3,18,0],[35,-2,20,-4],[66,-8,18,-6],[105,-18,10,-6],[150,-24,12,-8],[200,-18,20,-8],[260,-18,22,-8],[300,-30,20,-8],[340,-40,18,-8],[400,-46,15,-10],[430,-52,12,-10],[470,-58,10,-8],[500,-60,8,-6],[540,-52,6,-4],[600,-40,4,0],[700,-30,2,2],[800,-24,0,4],[1000,-20,-2,6]],
    SAM:[[0,-12,-58,0],[35,-16,-56,-6],[66,-22,-50,-12],[105,-28,-38,-22],[150,-30,-25,-30],[200,-26,-20,-32],[260,-26,-18,-32],[300,-38,-20,-32],[340,-46,-22,-32],[400,-52,-24,-30],[430,-58,-26,-28],[470,-62,-28,-24],[500,-64,-30,-20],[540,-58,-32,-16],[600,-46,-34,-12],[700,-38,-36,-8],[800,-32,-38,-6],[1000,-28,-40,-4]],
    ARB:[[0,24,45,0],[35,18,44,-4],[66,10,44,-6],[105,2,42,-6],[150,-2,42,-6],[200,-2,40,-6],[260,-2,40,-6],[300,-14,38,-6],[340,-24,36,-6],[400,-30,34,-8],[430,-36,32,-8],[470,-42,30,-6],[500,-44,28,-4],[540,-36,26,-2],[600,-24,24,0],[700,-14,22,2],[800,-8,20,4],[1000,-4,18,6]],
    IND:[[0,22,78,0],[35,10,74,20],[66,-8,68,60],[105,-30,58,120],[150,-40,54,150],[200,-42,55,158],[260,-42,55,158],[300,-48,53,158],[340,-54,51,158],[400,-58,49,156],[430,-62,47,152],[470,-64,45,148],[500,-64,43,144],[540,-58,41,140],[600,-46,39,135],[700,-38,37,130],[800,-32,35,128],[1000,-28,33,126]],
    ANT:[[0,-80,45,0],[35,-78,40,6],[66,-76,38,10],[105,-78,36,12],[150,-80,35,12],[200,-80,35,12],[260,-80,35,12],[300,-82,34,12],[340,-82,33,12],[400,-80,32,12],[430,-78,31,12],[470,-76,30,12],[500,-74,29,12],[540,-70,28,10],[600,-64,27,8],[700,-60,26,6],[800,-58,25,4],[1000,-56,24,2]],
    AUS:[[0,-25,134,0],[35,-48,120,-20],[66,-58,100,-35],[105,-60,92,-40],[150,-60,90,-40],[200,-58,92,-40],[260,-58,92,-40],[300,-64,90,-40],[340,-68,88,-40],[400,-70,86,-38],[430,-70,84,-36],[470,-68,82,-32],[500,-66,80,-28],[540,-60,78,-24],[600,-52,76,-20],[700,-46,74,-16],[800,-42,72,-14],[1000,-38,70,-12]],
    NAM:[[0,45,-100,0],[35,40,-85,-10],[66,38,-70,-22],[105,30,-52,-45],[150,24,-48,-56],[200,16,-46,-58],[260,15,-44,-58],[300,9,-44,-56],[340,2,-48,-48],[400,-4,-58,-40],[430,-6,-72,-30],[470,-8,-92,-20],[500,-6,-102,-14],[540,-2,-110,-8],[600,2,-114,0],[700,6,-118,6],[800,8,-120,10],[1000,6,-122,12]],
    GRN:[[0,74,-42,0],[35,70,-30,-8],[66,66,-20,-16],[105,56,-16,-40],[150,48,-16,-48],[200,40,-18,-52],[260,39,-18,-52],[300,33,-18,-52],[340,20,-22,-46],[400,10,-30,-35],[430,6,-42,-28],[470,2,-54,-20],[500,4,-62,-14],[540,8,-68,-8],[600,12,-72,-2],[700,16,-76,4],[800,18,-78,8],[1000,16,-80,10]],
    EUR:[[0,52,25,0],[35,48,26,-6],[66,44,24,-12],[105,40,28,-14],[150,37,30,-16],[200,35,31,-18],[260,34,31,-18],[300,28,31,-20],[340,14,30,-32],[400,0,28,-45],[430,-10,28,-60],[470,-35,32,-90],[500,-50,36,-110],[540,-55,40,-120],[600,-48,44,-110],[700,-40,48,-100],[800,-36,50,-95],[1000,-34,52,-90]],
    SIB:[[0,66,100,0],[35,62,96,6],[66,58,92,10],[105,54,86,14],[150,52,74,18],[200,48,68,22],[260,48,68,22],[300,44,66,24],[340,36,66,30],[400,25,66,45],[430,15,66,60],[470,5,66,80],[500,0,66,95],[540,-2,64,100],[600,0,62,95],[700,4,60,85],[800,6,58,80],[1000,6,56,75]],
    CHN:[[0,32,112,0],[35,26,104,6],[66,18,96,10],[105,8,88,14],[150,2,84,18],[200,0,82,18],[260,0,82,18],[300,-6,80,18],[340,-14,78,18],[400,-22,76,18],[430,-28,74,16],[470,-34,72,14],[500,-36,70,12],[540,-34,68,10],[600,-30,66,8],[700,-26,64,6],[800,-24,62,4],[1000,-22,60,2]],
  };

  function lerpAngle(a, b, f) {
    let d = ((b - a + 540) % 360) - 180;
    return a + d * f;
  }
  // Interpolated anchor state [lat, lon, az] for a plate at time t (Ma).
  function stateAt(plate, t) {
    const k = KF[plate];
    if (t <= k[0][0]) return [k[0][1], k[0][2], k[0][3]];
    const last = k[k.length - 1];
    if (t >= last[0]) return [last[1], last[2], last[3]];
    for (let i = 0; i < k.length - 1; i++) {
      if (t >= k[i][0] && t <= k[i + 1][0]) {
        const a = k[i], b = k[i + 1];
        const f = (t - a[0]) / (b[0] - a[0]);
        // smoothstep for gentler motion
        const s = f * f * (3 - 2 * f);
        return [a[1] + (b[1] - a[1]) * s, lerpAngle(a[2], b[2], s), a[3] + (b[3] - a[3]) * s];
      }
    }
    return [last[1], last[2], last[3]];
  }

  // Finite rotation quaternion for a plate at time t.
  function quatAt(plate, t) {
    const anc = ANCHOR[plate];
    const [plat, plon, az] = stateAt(plate, t);
    const aPres = sph(anc[0], anc[1]);
    const aPaleo = sph(plon, plat);
    const qMove = qBetween(aPres, aPaleo);
    const qSpin = qAxisAngle(aPaleo, az * D2R);
    return qMul(qSpin, qMove);
  }

  // Paleo lon/lat of the anchor (for verification / debugging).
  function anchorLLAt(plate, t) {
    const q = quatAt(plate, t);
    const anc = ANCHOR[plate];
    const v = sph(anc[0], anc[1]);
    // rotate v by q
    const [x,y,z,w] = q;
    const ix =  w*v[0] + y*v[2] - z*v[1];
    const iy =  w*v[1] + z*v[0] - x*v[2];
    const iz =  w*v[2] + x*v[1] - y*v[0];
    const iw = -x*v[0] - y*v[1] - z*v[2];
    const r = [
      ix*w + iw*-x + iy*-z - iz*-y,
      iy*w + iw*-y + iz*-x - ix*-z,
      iz*w + iw*-z + ix*-y - iy*-x,
    ];
    return vecToLL(r);
  }

  const RECON = { sph, vecToLL, quatAt, stateAt, anchorLLAt, ANCHOR, KF,
    TIMES:[0,35,66,105,150,200,260,300,340,400,430,470,500,540,600,700,800,1000] };
  if (typeof module !== 'undefined' && module.exports) module.exports = RECON;
  root.RECON = RECON;
})(typeof window !== 'undefined' ? window : globalThis);
