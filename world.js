/* global AFRAME, THREE, WORLDS, PORTAL_EDGES, OPPOSITE */
/* Engine: builds each world from the registry, handles portals/travel, COD-Mobile-style controls,
 * side-by-side stereo for AR glasses. */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const $ = (id) => document.getElementById(id);
const onDOM = (fn) => (document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', fn) : fn();
window.onDOM = onDOM;
const UI = {
  status(msg, ms = 2500) {
    const el = $('status'); if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(UI._t); UI._t = setTimeout(() => el.classList.remove('show'), ms);
  }
};
window.UI = UI;

/* rolling terrain height, flat near spawn and along portal paths */
window.terrainMod = {};
function terrainH(x, z) {
  const d = Math.hypot(x, z);
  const base = (Math.sin(x * 0.21) * Math.cos(z * 0.17) + Math.sin(x * 0.05 + z * 0.07) * 2) * 0.16;
  const flatten = Math.min(1, Math.max(0, (d - 6) / 20));
  const onPath = Math.min(Math.abs(x), Math.abs(z)) < 2.4 ? 0.25 : 1; // keep paths nearly flat
  let h = base * flatten * onPath;
  const M = window.terrainMod;
  if (M.lakeX !== undefined) {            // shore slopes down into the lake on the +x side
    const t = Math.min(1, Math.max(0, (M.lakeX - x) / 6));
    h = h * t + (-0.6) * (1 - t);
  }
  return h;
}
window.terrainH = terrainH;

const QUALITY = (() => {
  const q = localStorage.getItem('quality');
  if (q) return q;
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  return mobile ? 'low' : 'high';
})();
window.QUALITY = QUALITY;
const QSCALE = QUALITY === 'high' ? 1 : QUALITY === 'medium' ? 0.6 : 0.4;

/* ---------- billboards ---------- */
AFRAME.registerComponent('look-at-camera', {
  tick() {
    const cam = this.el.sceneEl.camera; if (!cam) return;
    const p = new THREE.Vector3(); cam.getWorldPosition(p);
    p.y = this.el.object3D.getWorldPosition(new THREE.Vector3()).y;
    this.el.object3D.lookAt(p);
  }
});

/* ---------- world builder ---------- */
AFRAME.registerComponent('world-builder', {
  schema: { world: { default: '' } },
  init() {
    this.textures = {};
    this.loader = new THREE.TextureLoader();
  },
  update(old) {
    if (this.data.world && this.data.world !== old.world) this.build(this.data.world);
  },
  tex(url, repeat, repeatY) {
    const key = url + '|' + repeat + '|' + repeatY;
    if (this.textures[key]) return this.textures[key];
    const t = this.loader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeatY === undefined ? repeat : repeatY);
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    this.textures[key] = t;
    return t;
  },
  clear() {
    while (this.root.firstChild) this.root.removeChild(this.root.firstChild);
    if (this.group) { this.el.object3D.remove(this.group); this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.group = new THREE.Group(); this.el.object3D.add(this.group);
  },
  build(id) {
    const W = WORLDS[id]; if (!W) return;
    this.root = $('world-root');
    this.clear();
    const rnd = mulberry32(id.split('').reduce((a, c) => a + c.charCodeAt(0), 7));
    const sc = this.el;

    // sky dome (360° panorama) + fog + lights
    $('sky').setAttribute('src', W.sky);
    $('sky').setAttribute('rotation', `0 ${W.skyRotation || 0} 0`);
    sc.setAttribute('fog', `type: exponential; color: ${W.fog.color}; density: ${W.fog.density}`);
    $('ambient').setAttribute('light', { color: W.ambient, intensity: 0.6 });
    $('sun').setAttribute('light', { color: W.sun.color, intensity: W.sun.intensity, castShadow: QUALITY === 'high' });
    $('sun').setAttribute('position', W.sun.pos);
    $('hemi').setAttribute('light', { color: W.hemi.sky, groundColor: W.hemi.ground, intensity: 0.7 });
    window.terrainMod = (W.scenery.water === 'lake') ? { lakeX: 10 } : {};

    // ground
    const g = this.group;
    // detailed ground near the player (with rolling terrain) + a big flat skirt out to the horizon
    const groundMat = new THREE.MeshStandardMaterial({ map: this.tex(W.ground, W.groundRepeat), roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 80, 80), groundMat);
    ground.name = 'ground'; ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, terrainH(pos.getX(i), -pos.getY(i)));
    ground.geometry.computeVertexNormals();
    g.add(ground);
    const skirtMat = new THREE.MeshStandardMaterial({ map: this.tex(W.ground, W.groundRepeat * 5), roughness: 1, metalness: 0 });
    const skirt = new THREE.Mesh(new THREE.RingGeometry(78, 450, 48, 1), skirtMat);
    skirt.name = 'skirt'; skirt.rotation.x = -Math.PI / 2; skirt.position.y = -0.4; g.add(skirt);

    // paths to each portal
    const pathMat = new THREE.MeshStandardMaterial({ map: this.tex(W.path, 1, 11), roughness: 1, color: 0xbbbbbb, transparent: true, opacity: 0.95 });
    Object.keys(W.portals).forEach(edge => {
      const e = PORTAL_EDGES[edge];
      const path = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 36), pathMat);
      path.rotation.x = -Math.PI / 2; path.rotation.z = THREE.MathUtils.degToRad(e.rot);
      path.position.set(e.pos[0] / 2, 0.02, e.pos[2] / 2);
      path.receiveShadow = true; path.name = 'path' + edge;
      g.add(path);
    });

    const S = W.scenery;
    const keepClear = (x, z) => {
      if (Math.hypot(x, z) < 6) return false;                       // spawn
      for (const e of Object.values(PORTAL_EDGES)) {                 // arrival zones around every portal
        if (Math.hypot(x - e.pos[0], z - e.pos[2]) < 7) return false;
      }
      for (const edge of Object.keys(W.portals)) {                 // paths
        const e = PORTAL_EDGES[edge];
        const along = edge === 'N' ? -z : edge === 'S' ? z : edge === 'E' ? x : -x;
        const across = (edge === 'N' || edge === 'S') ? Math.abs(x) : Math.abs(z);
        if (along > 0 && along < 38 && across < 3.2) return false;
      }
      if (S.water === 'creek' && Math.abs(x - 6 + Math.sin(z * 0.15) * 3) < 2.2) return false;
      if (S.water === 'lake' && x > 8) return false;
      return true;
    };
    const scatter = (n, minR, maxR, cb) => {
      let made = 0, tries = 0;
      while (made < n && tries < n * 8) {
        tries++;
        const a = rnd() * Math.PI * 2, r = minR + Math.sqrt(rnd()) * (maxR - minR);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!keepClear(x, z)) continue;
        cb(x, z); made++;
      }
    };

    // trees (instanced trunks + foliage)
    const nTrees = Math.round(S.trees * (QUALITY === 'low' ? 0.6 : 1));
    const barkTex = this.tex('assets/tex/bark.jpg', 2, 6);
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 1, 8, 1, true);
    const trunkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, nTrees); trunks.name = 'trunks';
    trunks.castShadow = QUALITY === 'high';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const foliageGroup = new THREE.Group();
    const firTex = this.loader.load('assets/tex/fir.png'); firTex.colorSpace = THREE.SRGBColorSpace;
    const coneMat = new THREE.MeshStandardMaterial({ map: this.tex('assets/tex/moss.jpg', 2, 3), color: 0x2e5a34, roughness: 1 });
    const coneGeo = new THREE.ConeGeometry(1, 1, 9, 3); { const cp = coneGeo.attributes.position; for (let i = 0; i < cp.count; i++) { const yy = cp.getY(i); if (yy < 0.49) { const j = 0.85 + Math.random() * 0.3; cp.setX(i, cp.getX(i) * j); cp.setZ(i, cp.getZ(i) * j); } } coneGeo.computeVertexNormals(); }
    const mossMat = new THREE.MeshStandardMaterial({ map: this.tex('assets/tex/moss.jpg', 1), roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ map: this.tex('assets/tex/moss.jpg', 3, 3), color: 0x8fb060, roughness: 1 });
    const canopyGeo = new THREE.SphereGeometry(1, 8, 6);
    let ti = 0;
    scatter(nTrees, 7, 70, (x, z) => {
      const h = 12 + rnd() * 16, r = 0.9 + rnd() * 1.6;
      p3.set(x, terrainH(x, z) + h / 2 - 0.3, z); s3.set(r, h, r); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      m.compose(p3, q, s3); trunks.setMatrixAt(ti++, m);
      if (S.treeKind === 'maple') {
        // moss-draped maple: bulbous mossy canopy + a few mossy limbs
        for (let k = 0; k < 4; k++) {
          const c = new THREE.Mesh(canopyGeo, leafMat);
          c.position.set(x + (rnd() - 0.5) * 6, h * (0.7 + rnd() * 0.25), z + (rnd() - 0.5) * 6); c.scale.set(2.5 + rnd() * 3, 1.5 + rnd() * 1.5, 2.5 + rnd() * 3); c.rotation.set(rnd(), rnd() * 6, rnd());
          foliageGroup.add(c);
        }
        for (let k = 0; k < 5; k++) {
          const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 1, 5, 1, true), mossMat);
          const L = 3 + rnd() * 4;
          limb.position.set(x, h * (0.45 + rnd() * 0.3), z); limb.scale.set(1, L, 1);
          limb.rotation.set((rnd() - 0.5) * 1.6, rnd() * 6.28, (rnd() - 0.5) * 1.6 + 1.2);
          limb.position.add(new THREE.Vector3(Math.sin(limb.rotation.y) * L * 0.4, 0, Math.cos(limb.rotation.y) * L * 0.4));
          foliageGroup.add(limb);
        }
      } else {
        // conifer: stacked cones
        const tiers = QUALITY === 'low' ? 4 : 6;
        for (let k = 0; k < tiers; k++) {
          const cone = new THREE.Mesh(coneGeo, coneMat);
          const ch = h * 0.24, cr = (2.4 - k * 0.3) * (0.85 + rnd() * 0.3) * (r * 0.6 + 0.5);
          cone.position.set(x, h * 0.38 + k * ch * 0.6, z); cone.scale.set(cr, ch, cr); cone.rotation.y = rnd() * 6.28;
          cone.castShadow = QUALITY === 'high';
          foliageGroup.add(cone);
        }
      }
    });
    trunks.count = ti; trunks.instanceMatrix.needsUpdate = true;
    g.add(trunks); g.add(foliageGroup);

    // distant tree wall (billboards) so the horizon is dense
    if (S.treeKind === 'fir' || S.trees > 40) {
      const bbMat = new THREE.MeshBasicMaterial({ map: firTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: true, color: 0x8899aa });
      const bbGeo = new THREE.PlaneGeometry(1, 2);
      const n = QUALITY === 'low' ? 60 : 120;
      const bbs = new THREE.InstancedMesh(bbGeo, bbMat, n); bbs.name = 'treewall';
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.05, r = 72 + rnd() * 6, hh = 18 + rnd() * 10;
        if (S.water === 'lake' && Math.cos(a) > 0.15) { p3.set(0, -50, 0); s3.set(0.01, 0.01, 0.01); m.compose(p3, q, s3); bbs.setMatrixAt(i, m); continue; }
        p3.set(Math.cos(a) * r, hh / 2, Math.sin(a) * r); s3.set(hh / 2, hh, 1);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
        m.compose(p3, q, s3); bbs.setMatrixAt(i, m);
      }
      bbs.instanceMatrix.needsUpdate = true; g.add(bbs);
    }

    // ferns / grass (crossed billboards, instanced)
    const addPlants = (n, texUrl, scaleMin, scaleMax, minR, maxR, tint) => {
      if (!n) return;
      n = Math.round(n * QSCALE * 1.2);
      const t = this.loader.load(texUrl); t.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, color: tint || 0xffffff });
      const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
      const a1 = new THREE.InstancedMesh(geo, mat, n), a2 = new THREE.InstancedMesh(geo, mat, n); a1.name = a2.name = 'plants:' + texUrl;
      let i = 0;
      scatter(n, minR, maxR, (x, z) => {
        const s = scaleMin + rnd() * (scaleMax - scaleMin), ry = rnd() * 6.28;
        p3.set(x, terrainH(x, z) - 0.05, z); s3.set(s, s, s);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry); m.compose(p3, q, s3); a1.setMatrixAt(i, m);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry + Math.PI / 2); m.compose(p3, q, s3); a2.setMatrixAt(i, m);
        i++;
      });
      a1.count = a2.count = i; a1.instanceMatrix.needsUpdate = a2.instanceMatrix.needsUpdate = true; g.add(a1); g.add(a2);
    };
    addPlants(S.ferns, 'assets/tex/fern.png', 1.6, 2.8, 3, 60);
    addPlants(S.grass, 'assets/tex/grass.png', 0.7, 1.3, 2, 60);
    if (S.flowers) {
      const cols = [0x8a5cff, 0xff5fa2, 0xffffff, 0xffd447, 0xff4d2e];
      const geo = new THREE.SphereGeometry(0.09, 5, 4);
      const stemGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x3a7a2a });
      const mats = cols.map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.15 }));
      scatter(Math.round(S.flowers * QSCALE * 1.5), 1.5, 50, (x, z) => {
        const ty = terrainH(x, z); const f = new THREE.Mesh(geo, mats[(rnd() * mats.length) | 0]); f.position.set(x, ty + 0.5, z);
        const st = new THREE.Mesh(stemGeo, stemMat); st.position.set(x, ty + 0.25, z);
        g.add(f); g.add(st);
      });
    }

    // mossy rocks
    if (S.rocks) {
      const rockGeo = new THREE.DodecahedronGeometry(1, 1);
      const rockMat = new THREE.MeshStandardMaterial({ map: this.tex(id === 'craterlake' || id === 'alpinelake' ? 'assets/tex/rock.jpg' : 'assets/tex/moss.jpg', 1), roughness: 1 });
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, S.rocks); rocks.name = 'rocks';
      let i = 0;
      scatter(S.rocks, 4, 65, (x, z) => {
        const s = 0.3 + rnd() * 1.0;
        p3.set(x, terrainH(x, z) + s * 0.35, z); s3.set(s * (0.8 + rnd() * 0.6), s * 0.7, s * (0.8 + rnd() * 0.6));
        q.setFromEuler(new THREE.Euler(rnd(), rnd() * 6.28, rnd())); m.compose(p3, q, s3); rocks.setMatrixAt(i++, m);
      });
      rocks.count = i; rocks.instanceMatrix.needsUpdate = true; rocks.castShadow = QUALITY === 'high'; g.add(rocks);
    }

    // fallen logs
    for (let i = 0; i < (S.logs || 0); i++) {
      const L = 6 + rnd() * 8;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, L, 7, 1), mossMat);
      const a = rnd() * 6.28, r = 10 + rnd() * 40;
      log.position.set(Math.cos(a) * r, terrainH(Math.cos(a) * r, Math.sin(a) * r) + 0.35, Math.sin(a) * r); log.rotation.set(0, rnd() * 6.28, Math.PI / 2 + (rnd() - 0.5) * 0.3);
      if (keepClear(log.position.x, log.position.z)) g.add(log);
    }

    // water
    if (S.water === 'creek') {
      // flat ribbon that follows the terrain, plus a pebble bed underneath
      const N = 80, half = 1.7, verts = [], uvs = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const z = -80 + (160 * i) / N, cx = 6 - Math.sin(z * 0.15) * 3;
        const y = terrainH(cx, z) + 0.06;
        verts.push(cx - half, y, z, cx + half, y, z); uvs.push(0, i / 4, 1, i / 4);
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const bed = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.tex('assets/tex/rock.jpg', 1, 20), roughness: 1, color: 0x7a8088 }));
      bed.position.y = -0.03; g.add(bed);
      const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8fb4c8, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.55 }));
      g.add(water); this.water = water;
    } else if (S.water === 'lake') {
      const water = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.MeshStandardMaterial({ color: 0x9a7aa8, roughness: 0.05, metalness: 0.7, envMap: null }));
      water.rotation.x = -Math.PI / 2; water.position.set(129, -0.25, 0); water.renderOrder = 1; g.add(water); this.water = water;
      const envTex = this.loader.load(W.sky); envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.colorSpace = THREE.SRGBColorSpace;
      water.material.envMap = envTex; water.material.needsUpdate = true;
      // a fallen log on the shore, like the reference
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 9, 7), new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 1 }));
      log.position.set(9, 0.1, 6); log.rotation.set(0, 0.6, Math.PI / 2 + 0.08); g.add(log);
    }

    // particles: spores / mist / pollen
    if (S.particles && S.particles !== 'none') {
      const n = QUALITY === 'low' ? 150 : 400;
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = (rnd() - 0.5) * 60; arr[i * 3 + 1] = rnd() * 6; arr[i * 3 + 2] = (rnd() - 0.5) * 60; }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const col = S.particles === 'mist' ? 0xdde8e8 : S.particles === 'pollen' ? 0xfff2a0 : 0xd8f0c0;
      const ptex = this.loader.load('assets/tex/particle.png');
      const mat = new THREE.PointsMaterial({ map: ptex, color: col, size: S.particles === 'mist' ? 3.5 : 0.12, transparent: true, opacity: S.particles === 'mist' ? 0.10 : 0.8, depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(geo, mat); g.add(pts); this.particles = pts;
    }
    if (S.godrays) {
      const rayMat = new THREE.MeshBasicMaterial({ color: 0xeaf6f0, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      for (let i = 0; i < 10; i++) {
        const ray = new THREE.Mesh(new THREE.PlaneGeometry(1.5 + rnd() * 2, 30), rayMat);
        ray.position.set((rnd() - 0.5) * 50, 14, (rnd() - 0.5) * 50 - 10);
        ray.rotation.set(0, rnd() * 6.28, 0.35); g.add(ray);
      }
    }
    // fireflies
    if (S.fireflies) {
      for (let i = 0; i < S.fireflies; i++) {
        const s = document.createElement('a-sphere');
        const x = (rnd() - 0.5) * 30, y = 0.5 + rnd() * 3, z = (rnd() - 0.5) * 30;
        s.setAttribute('position', `${x} ${y} ${z}`); s.setAttribute('radius', 0.05);
        s.setAttribute('segments-width', 5); s.setAttribute('segments-height', 3);
        s.setAttribute('material', 'shader: flat; color: #ffd27a; fog: false; transparent: true');
        s.setAttribute('animation__move', `property: position; to: ${x + rnd() - 0.5} ${y + rnd()} ${z + rnd() - 0.5}; dir: alternate; dur: ${2000 + rnd() * 3000}; loop: true; easing: easeInOutSine`);
        s.setAttribute('animation__blink', `property: material.opacity; from: 1; to: 0.1; dir: alternate; dur: ${600 + rnd() * 1200}; loop: true`);
        this.root.appendChild(s);
      }
    }

    // portals
    Object.entries(W.portals).forEach(([edge, target]) => {
      const e = PORTAL_EDGES[edge];
      const T = WORLDS[target];
      const portal = document.createElement('a-entity');
      portal.setAttribute('position', `${e.pos[0]} 0 ${e.pos[2]}`);
      portal.setAttribute('rotation', `0 ${e.rot} 0`);
      portal.setAttribute('portal', `target: ${target}; edge: ${edge}`);
      portal.innerHTML = `
        <a-torus radius="2.2" radius-tubular="0.1" segments-radial="8" segments-tubular="32" position="0 2.3 0"
          material="shader: flat; color: #eaf6ff; fog: false"
          animation="property: rotation; to: 0 0 360; dur: 20000; loop: true; easing: linear"></a-torus>
        <a-circle radius="2.1" position="0 2.3 0" material="shader: flat; src: ${T.sky}; side: double; fog: false"></a-circle>
        <a-cylinder radius="2.6" height="40" position="0 20 0" open-ended="true" material="shader: flat; color: #dff0ff; opacity: 0.08; transparent: true; side: double; fog: false; depthWrite: false"></a-cylinder>
        <a-entity light="type: point; color: #bfe0ff; intensity: 0.8; distance: 10" position="0 2.3 1"></a-entity>
        <a-text value="${T.name}" align="center" color="#ffffff" width="8" position="0 4.9 0" look-at-camera></a-text>
        <a-text value="walk through" align="center" color="#bfe0ff" width="4" position="0 4.4 0" look-at-camera></a-text>`;
      this.root.appendChild(portal);
    });

    // the guide
    $('guide').setAttribute('position', `${3 + rnd() * 2} 1.7 ${-6 - rnd() * 3}`);
    window.currentWorld = id;
    $('world-name').textContent = W.name; $('world-tag').textContent = W.tagline;
    $('world-banner').classList.add('show'); setTimeout(() => $('world-banner').classList.remove('show'), 3500);
    document.title = W.name + ' — My Art World';
    if (window.onWorldChange) window.onWorldChange(id, W);
  },
  tick(t) {
    if (this.particles) { this.particles.rotation.y = t * 0.00002; this.particles.position.y = Math.sin(t * 0.0003) * 0.3; }
    if (this.water && this.water.material) { this.water.material.roughness = 0.1 + Math.sin(t * 0.002) * 0.05; }
  }
});

/* ---------- portal trigger ---------- */
AFRAME.registerComponent('portal', {
  schema: { target: { default: '' }, edge: { default: 'N' } },
  init() { this.p = new THREE.Vector3(); this.cool = 0; },
  tick(t, dt) {
    if (this.cool > 0) { this.cool -= dt; return; }
    const rig = $('rig').object3D.position;
    this.el.object3D.getWorldPosition(this.p);
    if (Math.hypot(rig.x - this.p.x, rig.z - this.p.z) < 2.2) {
      this.cool = 3000;
      travelTo(this.data.target, OPPOSITE[this.data.edge]);
    }
  }
});

let travelling = false;
function travelTo(target, arriveEdge) {
  if (travelling || !WORLDS[target]) return;
  travelling = true;
  const fade = $('fade'); fade.classList.add('on');
  UI.status('Travelling to ' + WORLDS[target].name + '…', 1500);
  setTimeout(() => {
    const scene = document.querySelector('a-scene');
    scene.setAttribute('world-builder', 'world', target);
    const e = PORTAL_EDGES[arriveEdge] || PORTAL_EDGES.S;
    const rig = $('rig');
    rig.setAttribute('position', `${e.arrive[0]} 0 ${e.arrive[2]}`);
    // face toward the centre
    const yaw = Math.atan2(e.arrive[0], e.arrive[2]) * 180 / Math.PI; // face the centre of the new world
    const cam = $('camera');
    const lc = cam.components['look-controls'];
    if (lc) { lc.yawObject.rotation.y = THREE.MathUtils.degToRad(yaw); lc.pitchObject.rotation.x = 0; }
    localStorage.setItem('lastWorld', target);
    history.replaceState(null, '', '#' + target);
    setTimeout(() => { fade.classList.remove('on'); travelling = false; }, 400);
  }, 450);
}
window.travelTo = travelTo;

/* ---------- COD-Mobile style controls ----------
 * Left half of screen: virtual stick (appears where you touch) → move.
 * Right half: drag → look. Buttons: sprint, jump, interact (fire).
 * Desktop: WASD + mouse drag, Shift sprint, Space jump, E/click interact. Gamepad: sticks + A/B/RT.
 */
AFRAME.registerComponent('fps-controls', {
  schema: { speed: { default: 3.2 }, sprint: { default: 1.9 }, lookSpeed: { default: 0.0032 }, jump: { default: 5.5 } },
  init() {
    this.move = { x: 0, y: 0 }; this.keys = {}; this.sprint = false; this.vy = 0; this.grounded = true;
    this.fwd = new THREE.Vector3(); this.right = new THREE.Vector3();
    onDOM(() => this.wire());
    addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; this.keys[e.code] = true; if (e.code === 'Space') { e.preventDefault(); this.jump(); } });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  },
  wire() {
    const lc = () => $('camera').components['look-controls'];
    // --- touch ---
    const stickBase = $('stick-base'), stickKnob = $('stick-knob');
    let moveId = null, lookId = null, mo = { x: 0, y: 0 }, lo = { x: 0, y: 0 };
    const R = 55;
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('button, #chat, #settings, #map, input')) continue;
        if (t.clientX < innerWidth * 0.5 && moveId === null) {
          moveId = t.identifier; mo = { x: t.clientX, y: t.clientY };
          stickBase.style.left = (t.clientX - 70) + 'px'; stickBase.style.top = (t.clientY - 70) + 'px'; stickBase.classList.add('on');
        } else if (lookId === null) { lookId = t.identifier; lo = { x: t.clientX, y: t.clientY }; }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          let dx = t.clientX - mo.x, dy = t.clientY - mo.y; const d = Math.hypot(dx, dy);
          if (d > R) { dx = dx / d * R; dy = dy / d * R; }
          stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.move.x = dx / R; this.move.y = dy / R;
          this.sprint = this.sprintLatched || d > R * 0.95 && -dy / R > 0.85; // push stick fully up → auto sprint
        } else if (t.identifier === lookId) {
          const dx = t.clientX - lo.x, dy = t.clientY - lo.y; lo = { x: t.clientX, y: t.clientY };
          const l = lc(); if (!l) continue;
          l.yawObject.rotation.y -= dx * this.data.lookSpeed;
          l.pitchObject.rotation.x = Math.max(-1.4, Math.min(1.4, l.pitchObject.rotation.x - dy * this.data.lookSpeed));
        }
      }
      if (moveId !== null || lookId !== null) e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) { moveId = null; this.move.x = this.move.y = 0; stickKnob.style.transform = ''; stickBase.classList.remove('on'); if (!this.sprintLatched) this.sprint = false; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    const surf = document.body;
    surf.addEventListener('touchstart', onStart, { passive: false });
    surf.addEventListener('touchmove', onMove, { passive: false });
    surf.addEventListener('touchend', onEnd); surf.addEventListener('touchcancel', onEnd);
    // action buttons
    $('btn-sprint').addEventListener('touchstart', (e) => { e.preventDefault(); this.sprintLatched = !this.sprintLatched; this.sprint = this.sprintLatched; $('btn-sprint').classList.toggle('active', this.sprintLatched); }, { passive: false });
    $('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); this.jump(); }, { passive: false });
    $('btn-jump').addEventListener('mousedown', () => this.jump());
    $('btn-sprint').addEventListener('mousedown', () => { this.sprintLatched = !this.sprintLatched; this.sprint = this.sprintLatched; $('btn-sprint').classList.toggle('active', this.sprintLatched); });
  },
  jump() { if (this.grounded) { this.vy = this.data.jump; this.grounded = false; } },
  tick(t, dt) {
    dt = Math.min(dt, 50) / 1000;
    const cam = this.el.sceneEl.camera; if (!cam) return;
    // keyboard → move vector
    let kx = 0, ky = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) ky -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) ky += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) kx -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) kx += 1;
    // gamepad
    const gp = navigator.getGamepads && navigator.getGamepads()[0];
    if (gp) {
      const dz = (v) => Math.abs(v) > 0.15 ? v : 0;
      kx += dz(gp.axes[0]); ky += dz(gp.axes[1]);
      const lc = $('camera').components['look-controls'];
      if (lc) { lc.yawObject.rotation.y -= dz(gp.axes[2]) * dt * 2.4; lc.pitchObject.rotation.x = Math.max(-1.4, Math.min(1.4, lc.pitchObject.rotation.x - dz(gp.axes[3]) * dt * 1.8)); }
      if (gp.buttons[0]?.pressed) this.jump();
      if (gp.buttons[10]?.pressed) this.sprint = true;
      if (gp.buttons[7]?.pressed && !this._gpFire) { this._gpFire = true; document.dispatchEvent(new CustomEvent('interact')); }
      if (!gp.buttons[7]?.pressed) this._gpFire = false;
    }
    let mx = this.move.x + kx, my = this.move.y + ky;
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    const sprint = this.sprint || this.keys.ShiftLeft || this.keys.ShiftRight;
    const spd = this.data.speed * (sprint ? this.data.sprint : 1);
    cam.getWorldDirection(this.fwd); this.fwd.y = 0; this.fwd.normalize();
    this.right.crossVectors(this.fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const p = this.el.object3D.position;
    p.addScaledVector(this.fwd, -my * spd * dt);
    p.addScaledVector(this.right, mx * spd * dt);
    // gravity / jump
    const floor = terrainH(p.x, p.z);
    if (!this.grounded || this.vy !== 0) {
      this.vy -= 14 * dt; p.y += this.vy * dt;
      if (p.y <= floor) { p.y = floor; this.vy = 0; this.grounded = true; }
    } else { p.y = floor; }
    // world bounds (portals sit at 34)
    const lim = 38; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
    // head-bob while moving
    const camEl = $('camera').object3D;
    const moving = len > 0.1 && this.grounded;
    this.bob = (this.bob || 0) + (moving ? dt * (sprint ? 14 : 9) : 0);
    camEl.position.y = 1.65 + (moving ? Math.sin(this.bob) * 0.035 : 0);
    // FOV kick when sprinting
    const camera = cam; const targetFov = sprint && moving ? 86 : 78;
    if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov += (targetFov - camera.fov) * 0.1; camera.updateProjectionMatrix(); }
  }
});

/* ---------- side-by-side stereo for AR glasses ---------- */
AFRAME.registerComponent('sbs-glasses', {
  init() {
    this.active = false; this.swap = localStorage.getItem('sbsSwap') === '1';
    this.stereo = new THREE.StereoCamera(); this.stereo.aspect = 0.5; this.stereo.eyeSep = 0.064;
    const sceneEl = this.el;
    const hook = () => {
      const renderer = sceneEl.renderer; if (!renderer || renderer.__sbsHooked) return;
      renderer.__sbsHooked = true;
      const orig = renderer.render.bind(renderer); const size = new THREE.Vector2();
      renderer.render = (scene, camera) => {
        if (!this.active || sceneEl.is('vr-mode')) return orig(scene, camera);
        renderer.getSize(size); const w = size.x, h = size.y, hw = Math.floor(w / 2);
        if (camera.parent === null) camera.updateMatrixWorld();
        this.stereo.update(camera);
        const L = this.swap ? this.stereo.cameraR : this.stereo.cameraL, Rc = this.swap ? this.stereo.cameraL : this.stereo.cameraR;
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, hw, h); renderer.setViewport(0, 0, hw, h); orig(scene, L);
        renderer.setScissor(hw, 0, w - hw, h); renderer.setViewport(hw, 0, w - hw, h); orig(scene, Rc);
        renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
      };
    };
    if (sceneEl.renderer) hook(); else sceneEl.addEventListener('render-target-loaded', hook);
    onDOM(() => {
      $('btn-glasses').addEventListener('click', () => this.set(!this.active));
      $('exit-sbs').addEventListener('click', () => this.set(false));
    });
    document.addEventListener('keydown', (e) => { if (e.key === '3' && e.target.tagName !== 'INPUT') this.set(!this.active); });
  },
  setSwap(v) { this.swap = !!v; localStorage.setItem('sbsSwap', v ? '1' : '0'); },
  async set(on) {
    this.active = on; document.body.classList.toggle('sbs', on); setGaze(on);
    $('btn-glasses').classList.toggle('active', on);
    if (on) {
      try { await document.documentElement.requestFullscreen?.(); } catch (e) { }
      try { await screen.orientation?.lock?.('landscape'); } catch (e) { }
      UI.status('Glasses 3D on — set glasses to Side-by-Side mode. ✕ or "3" exits.', 5000);
    } else {
      try { screen.orientation?.unlock?.(); } catch (e) { }
      if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (e) { } }
    }
  }
});
function setGaze(on) { const g = $('gaze'); if (!g) return; g.setAttribute('visible', on); g.setAttribute('raycaster', 'enabled', on); }

/* ---------- boot ---------- */
AFRAME.registerComponent('world-state', {
  init() {
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouch) document.body.classList.add('touch');
    this.el.addEventListener('enter-vr', () => setGaze(true));
    this.el.addEventListener('exit-vr', () => setGaze(document.body.classList.contains('sbs')));
    const start = (location.hash.slice(1) in WORLDS) ? location.hash.slice(1) : (localStorage.getItem('lastWorld') in WORLDS ? localStorage.getItem('lastWorld') : 'mossgrove');
    const go = () => {
      this.el.setAttribute('world-builder', 'world', start);
      $('fade').classList.remove('on');
      UI.status(isTouch ? 'Left thumb: move • right thumb: look • walk into a portal to travel'
        : 'WASD move • drag mouse to look • Shift sprint • Space jump • E talk • M map', 6000);
    };
    const ready = () => { if (this.el.hasLoaded) go(); else this.el.addEventListener('loaded', go); };
    onDOM(ready);
    addEventListener('hashchange', () => { const h = location.hash.slice(1); if (WORLDS[h] && h !== window.currentWorld) travelTo(h, 'S'); });

    onDOM(() => {
      const qs = $('set-quality'); if (qs) { qs.value = QUALITY; qs.addEventListener('change', () => { localStorage.setItem('quality', qs.value); location.reload(); }); }
      $('btn-map').addEventListener('click', () => $('map').classList.toggle('hidden'));
      document.querySelectorAll('#map [data-world]').forEach(b => b.addEventListener('click', () => { $('map').classList.add('hidden'); travelTo(b.dataset.world, 'S'); }));
    });
    document.addEventListener('keydown', (e) => { if ((e.key === 'm' || e.key === 'M') && e.target.tagName !== 'INPUT') $('map').classList.toggle('hidden'); });
  }
});
