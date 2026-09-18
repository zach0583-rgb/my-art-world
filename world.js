/* global AFRAME, THREE */
/* World helpers: procedural forest, fireflies, touch joystick, side-by-side 3D for AR glasses. */

// Small seeded RNG so the forest looks the same every visit.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UI = {
  status(msg, ms = 2500) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(UI._t);
    UI._t = setTimeout(() => el.classList.remove('show'), ms);
  }
};
window.UI = UI;

/* ---------- always face the player (billboards) ---------- */
AFRAME.registerComponent('look-at-camera', {
  tick() {
    const cam = this.el.sceneEl.camera;
    if (!cam) return;
    const p = new THREE.Vector3();
    cam.getWorldPosition(p);
    p.y = this.el.object3D.getWorldPosition(new THREE.Vector3()).y; // yaw only
    this.el.object3D.lookAt(p);
  }
});

/* ---------- procedural forest ---------- */
AFRAME.registerComponent('forest', {
  schema: { count: { default: 80 }, spread: { default: 40 }, pathHalfWidth: { default: 5 } },
  init() {
    const rnd = mulberry32(1337);
    const { count, spread, pathHalfWidth } = this.data;
    const trunkColors = ['#0b120c', '#080e09', '#050a06', '#0d1410'];
    const leafColors = ['#0a1a10', '#08150d', '#0c1f13'];
    let made = 0, tries = 0;
    while (made < count && tries < count * 10) {
      tries++;
      const x = (rnd() * 2 - 1) * spread;
      const z = -rnd() * spread * 1.6 + 6;
      if (Math.abs(x) < pathHalfWidth && z < 4) continue;       // keep the path clear
      if (Math.hypot(x, z + 30) < 12) continue;                 // keep the painting clear
      const h = 6 + rnd() * 9;
      const r = 0.25 + rnd() * 0.45;
      const tree = document.createElement('a-entity');
      tree.setAttribute('position', `${x} 0 ${z}`);
      const trunk = document.createElement('a-cylinder');
      trunk.setAttribute('position', `0 ${h / 2} 0`);
      trunk.setAttribute('radius', r);
      trunk.setAttribute('height', h);
      trunk.setAttribute('segments-radial', 6);
      trunk.setAttribute('color', trunkColors[(rnd() * trunkColors.length) | 0]);
      tree.appendChild(trunk);
      // two stacked cones for a canopy
      for (let i = 0; i < 2; i++) {
        const cone = document.createElement('a-cone');
        const ch = 3 + rnd() * 3;
        cone.setAttribute('position', `0 ${h * 0.55 + i * ch * 0.6} 0`);
        cone.setAttribute('radius-bottom', 1.6 + rnd() * 1.6 - i * 0.4);
        cone.setAttribute('radius-top', 0);
        cone.setAttribute('height', ch);
        cone.setAttribute('segments-radial', 7);
        cone.setAttribute('color', leafColors[(rnd() * leafColors.length) | 0]);
        tree.appendChild(cone);
      }
      this.el.appendChild(tree);
      made++;
    }
  }
});

/* ---------- fireflies ---------- */
AFRAME.registerComponent('fireflies', {
  schema: { count: { default: 30 }, spread: { default: 20 } },
  init() {
    const rnd = mulberry32(42);
    for (let i = 0; i < this.data.count; i++) {
      const x = (rnd() * 2 - 1) * this.data.spread;
      const y = 0.5 + rnd() * 3;
      const z = -rnd() * this.data.spread * 1.5 + 3;
      const s = document.createElement('a-sphere');
      const col = rnd() < 0.7 ? '#77ffaa' : '#ffcc66';
      s.setAttribute('position', `${x} ${y} ${z}`);
      s.setAttribute('radius', 0.04 + rnd() * 0.05);
      s.setAttribute('segments-width', 6);
      s.setAttribute('segments-height', 4);
      s.setAttribute('material', `shader: flat; color: ${col}; fog: false`);
      s.setAttribute('animation__move', `property: position; to: ${x + rnd() - 0.5} ${y + rnd() * 0.8} ${z + rnd() - 0.5}; dir: alternate; dur: ${2000 + rnd() * 3000}; loop: true; easing: easeInOutSine`);
      s.setAttribute('animation__blink', `property: material.opacity; from: 1; to: 0.15; dir: alternate; dur: ${700 + rnd() * 1500}; loop: true`);
      s.setAttribute('material', 'transparent', true);
      this.el.appendChild(s);
    }
  }
});

/* ---------- touch joystick that moves the rig relative to where you look ---------- */
AFRAME.registerComponent('joystick-move', {
  schema: { speed: { default: 2.2 } },
  init() {
    this.vec = { x: 0, y: 0 };
    const pad = document.getElementById('joystick');
    const stick = document.getElementById('stick');
    if (!pad) return;
    let active = false, cx = 0, cy = 0;
    const R = 40;
    const start = (e) => { active = true; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e); };
    const move = (e) => {
      if (!active) return;
      const t = e.touches ? e.touches[0] : e;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
      this.vec.x = dx / R; this.vec.y = dy / R;
      e.preventDefault();
    };
    const end = () => { active = false; stick.style.transform = ''; this.vec.x = 0; this.vec.y = 0; };
    pad.addEventListener('touchstart', start, { passive: false });
    pad.addEventListener('touchmove', move, { passive: false });
    pad.addEventListener('touchend', end);
    pad.addEventListener('touchcancel', end);
    pad.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    this.fwd = new THREE.Vector3();
    this.right = new THREE.Vector3();
  },
  tick(t, dt) {
    if (!this.vec.x && !this.vec.y) return;
    const cam = this.el.sceneEl.camera;
    if (!cam) return;
    cam.getWorldDirection(this.fwd); // direction the camera is looking
    this.fwd.y = 0; this.fwd.normalize();
    this.right.crossVectors(this.fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const s = this.data.speed * (dt / 1000);
    const p = this.el.object3D.position;
    p.addScaledVector(this.fwd, -this.vec.y * s);
    p.addScaledVector(this.right, this.vec.x * s);
    // keep on the ground and inside the world
    p.x = Math.max(-60, Math.min(60, p.x));
    p.z = Math.max(-70, Math.min(20, p.z));
  }
});

/* ---------- side-by-side stereo for AR glasses (Xreal / Rokid / Viture / any 3D SBS display) ---------- */
AFRAME.registerComponent('sbs-glasses', {
  init() {
    this.active = false;
    this.swap = localStorage.getItem('sbsSwap') === '1';
    this.stereo = new THREE.StereoCamera();
    this.stereo.aspect = 0.5;
    this.stereo.eyeSep = 0.064;
    const sceneEl = this.el;

    const hook = () => {
      const renderer = sceneEl.renderer;
      if (!renderer || renderer.__sbsHooked) return;
      renderer.__sbsHooked = true;
      const orig = renderer.render.bind(renderer);
      const size = new THREE.Vector2();
      renderer.render = (scene, camera) => {
        if (!this.active || sceneEl.is('vr-mode')) return orig(scene, camera);
        renderer.getSize(size);
        const w = size.x, h = size.y, hw = Math.floor(w / 2);
        if (camera.parent === null) camera.updateMatrixWorld();
        this.stereo.update(camera);
        const L = this.swap ? this.stereo.cameraR : this.stereo.cameraL;
        const Rc = this.swap ? this.stereo.cameraL : this.stereo.cameraR;
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, hw, h); renderer.setViewport(0, 0, hw, h); orig(scene, L);
        renderer.setScissor(hw, 0, w - hw, h); renderer.setViewport(hw, 0, w - hw, h); orig(scene, Rc);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, w, h);
      };
    };
    if (sceneEl.renderer) hook(); else sceneEl.addEventListener('render-target-loaded', hook);

    // exit button
    const exitBtn = document.createElement('button');
    exitBtn.id = 'exit-sbs';
    exitBtn.textContent = '✕ Exit 3D';
    exitBtn.addEventListener('click', () => this.set(false));
    document.body.appendChild(exitBtn);

    const btn = document.getElementById('btn-glasses');
    if (btn) btn.addEventListener('click', () => this.set(!this.active));
    document.addEventListener('keydown', (e) => { if (e.key === '3' && e.target.tagName !== 'INPUT') this.set(!this.active); });
  },
  setSwap(v) { this.swap = !!v; localStorage.setItem('sbsSwap', v ? '1' : '0'); },
  async set(on) {
    this.active = on;
    document.body.classList.toggle('sbs', on);
    setGaze(on);
    document.getElementById('btn-glasses')?.classList.toggle('active', on);
    if (on) {
      try { await document.documentElement.requestFullscreen?.(); } catch (e) { /* ignore */ }
      try { await screen.orientation?.lock?.('landscape'); } catch (e) { /* ignore */ }
      UI.status('Glasses 3D on — set your glasses to Side-by-Side (SBS) mode. Press ✕ or "3" to exit.', 5000);
    } else {
      try { screen.orientation?.unlock?.(); } catch (e) { /* ignore */ }
      if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (e) { /* ignore */ } }
    }
  }
});

/* ---------- gaze cursor: only in glasses / VR mode ---------- */
function setGaze(on) {
  const g = document.getElementById('gaze');
  if (!g) return;
  g.setAttribute('visible', on);
  g.setAttribute('raycaster', 'enabled', on);
}

/* ---------- misc setup ---------- */
AFRAME.registerComponent('world-state', {
  init() {
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouch) document.body.classList.add('touch');
    this.el.addEventListener('enter-vr', () => setGaze(true));
    this.el.addEventListener('exit-vr', () => setGaze(document.body.classList.contains('sbs')));
    this.el.addEventListener('loaded', () => {
      UI.status(isTouch
        ? 'Drag to look • joystick to walk • tap the guide to talk'
        : 'WASD / arrows to walk • drag to look • click the guide to talk • press 3 for glasses mode', 6000);
    });
  }
});
