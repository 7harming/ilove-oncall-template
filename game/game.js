// 我熱愛值班 · 一般民眾版範本
//
// A night on call in a 3D ward, 17:00 to 08:00: the phone rings, some calls are small and some
// are not, and each patient is a short script of choices at the bedside (public-cases.js).
// Everything clinical a player sees is data in public-cases.js; this file only plays it.
//
// three.js is vendored under game/vendor/ so the page needs nothing from another site.
import * as THREE from './vendor/three/three.module.js';
import { RoundedBoxGeometry } from './vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from './vendor/three/addons/utils/BufferGeometryUtils.js';
import { PUBLIC_CALLS, DEEP_CALLS, DAWN_CALLS, AFTER_PHONE, PUBLIC_CASES, CPR } from './public-cases.js';
import { CHATTER } from './chatter.js';

// game.css hangs off this class; set it here too so a host page that owns <body> still gets it
document.body.classList.add('game-page');

const $ = id => document.getElementById(id);
const FONT_UI = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
const FONT_NUM = '"JetBrains Mono", Consolas, monospace';
// the floor, east (+x) to west and north (-z) to south: core (station, back-of-house rooms,
// on-call room) | corridor | patient rooms. RW is a room's width; twelve rooms make the floor.
const RW = 3.5, XE = 18, XW = XE - 12 * RW, XCW = XW;
const ZCN = -4.0, ZCS = 1.0, ZFC = 3.6, ZF = 10.4, ZB = ZCN;
const X0 = XW, X1 = XE;
const YAW = THREE.MathUtils.degToRad(35), PITCH = THREE.MathUtils.degToRad(40);

// What the game is called, and the line that says what it was made from. A game made from this
// template keeps CREDIT on its start card and its summary (see README.md, 授權).
const GAME = { title: '我熱愛值班', edition: '一般民眾體驗版', site: location.host };
const CREDIT = { text: '以《我熱愛值班》範本製作', url: 'https://drcharming.net/' };

try {
  await boot();
} catch (err) {
  console.error(err);
  $('loading').textContent = '這台裝置無法顯示 3D 畫面（需要 WebGL）';
  $('loading').classList.add('err');
}

async function boot() {
  await Promise.race([
    Promise.all([
      document.fonts.load(`900 64px ${FONT_UI}`, '護理站值班室緊急出口病房便當安全梯往'),
      document.fonts.load(`700 48px ${FONT_NUM}`, '0123456789SpOHRNIBP'),
    ]),
    new Promise(r => setTimeout(r, 3000)),
  ]);

  const frame = $('frame'), canvas = $('view');
  const rng = seed => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  // Tonight's ward name is drawn at random each shift (index.html?ward=6B picks one); every
  // ward has the same floor, only the room numbers change.
  const WARDS = ['5A', '5B', '6A', '6B', '7A', '7B'];
  const wardParam = new URLSearchParams(location.search).get('ward');
  const WARD = WARDS.includes(wardParam) ? wardParam : WARDS[Math.floor(Math.random() * WARDS.length)];
  const wb = n => `${WARD}${n}`; // a room or bed on tonight's ward: wb('08B')
  // there are only choices to make, nothing to type, so the clock runs twice as fast as PACE says
  const PUBLIC_PACE = 2;
  // bed counts in words: 「四床都穩住了」
  const CN = ['零', '一', '兩', '三', '四', '五', '六', '七', '八'];
  // energy under this and the doctor cannot run; at 0 they drop and the night is over
  const TIRED = 20;
  // the two shifts, picked on the start card: 普通班 rings four to six patients, 大爛班 six to
  // eight and spends the bar twice as fast (it fills as slowly on both). A small bed bank caps both.
  const SHIFT_NAME = { normal: '普通班', hard: '大爛班' }, SPEND = { normal: 1, hard: 2 };
  // index.html?debug: a handle for scripted playtests (window.__ward) and ] to skip half an hour
  const DEBUG = new URLSearchParams(location.search).has('debug');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a1019');
  const world = new THREE.Group();
  scene.add(world);

  // ---------- helpers ----------
  const cache = new Map();
  const M = (color, rough = 0.8, metal = 0, flat = false) => {
    const k = `${color}|${rough}|${metal}|${flat}`;
    if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat }));
    return cache.get(k);
  };
  const F = (color, rough = 0.75) => M(color, rough, 0, true);
  const glow = (color, intensity) => new THREE.MeshStandardMaterial({ color: '#160606', emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  const basic = opts => new THREE.MeshBasicMaterial(opts);
  const solids = [];
  const solid = (x0, z0, x1, z1) => solids.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);

  function box(p, w, h, d, mat, x, y, z, r = 0.03) {
    const rr = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
    const geo = rr > 0.004 ? new RoundedBoxGeometry(w, h, d, 1, rr) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m;
  }
  function cyl(p, rt, rb, h, mat, x, y, z, seg = 16) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); p.add(m); return m;
  }
  function sph(p, r, mat, x, y, z, ws = 20, hs = 14) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat); m.position.set(x, y, z); p.add(m); return m;
  }
  function plane(p, w, h, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); p.add(m); return m;
  }
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }

  // ---------- textures ----------
  const floorTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#dfe4e6'; g.fillRect(0, 0, w, h);
    const r = rng(4);
    for (let i = 0; i < 1300; i++) { g.globalAlpha = 0.12 + r() * 0.2; g.fillStyle = ['#cdd3d6', '#f1f4f5', '#bcc4c8'][i % 3]; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    g.globalAlpha = 1; g.fillStyle = 'rgba(80,95,105,.16)';
    g.fillRect(0, 0, w, 2); g.fillRect(0, h / 2 - 1, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w / 2 - 1, 0, 2, h);
  }, true);
  // the corridor is one polished sheet, no tile seams
  const hallTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e4e8e3'; g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 900; i++) { g.globalAlpha = 0.08 + r() * 0.14; g.fillStyle = ['#d2d8d2', '#f4f6f3'][i % 2]; g.fillRect(r() * w, r() * h, 2.2, 1); }
  }, true);
  // on-call room floor: beige speckled tiles
  const tileTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e6dcc8'; g.fillRect(0, 0, w, h);
    const r = rng(6);
    for (let i = 0; i < 1600; i++) { g.globalAlpha = 0.15 + r() * 0.25; g.fillStyle = ['#cdbfa6', '#f3ecdd', '#b9a98c'][i % 3]; g.fillRect(r() * w, r() * h, 1.6, 1.6); }
    g.globalAlpha = 1; g.fillStyle = 'rgba(110,95,75,.28)';
    for (let i = 0; i <= w; i += w / 4) { g.fillRect(i - 1, 0, 2, h); g.fillRect(0, i - 1, w, 2); }
  }, true);
  const stripeTex = (base, line, step) => canvasTex(64, 64, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = line; for (let x = 0; x < w; x += step) g.fillRect(x, 0, step / 3, h); }, true);
  // stripes that run along a bed: they change across v, the bed's width
  const rowTex = (base, line, n) => canvasTex(128, 128, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = line; for (let i = 0; i < n; i++) g.fillRect(0, (i + 0.3) * h / n, w, h / n * 0.42); });
  const gownTex = stripeTex('#d9ebe7', '#9cc4be', 8);
  const blanketTex = rowTex('#f2f5f7', '#7fa7c9', 9);
  const pillowTex = rowTex('#eef2f5', '#9db7cc', 6);
  const spreadTex = rowTex('#f4f6f3', '#2f9a6c', 4);
  const paperTex = stripeTex('#e3e8ec', '#d3dbe1', 12); paperTex.repeat.set(8, 2);
  const letterTex = {};
  ['A', 'B', 'C'].forEach(L => {
    letterTex[L] = canvasTex(128, 128, g => {
      g.font = `900 112px ${FONT_UI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = '#6d6a62'; g.strokeText(L, 64, 70); g.fillStyle = '#f4f2ec'; g.fillText(L, 64, 70);
    });
  });
  const plaqueTex = text => canvasTex(256, 72, g => {
    g.fillStyle = '#4f7fae'; g.beginPath(); g.roundRect(0, 0, 256, 72, 10); g.fill();
    g.fillStyle = '#ffffff'; g.font = `700 46px ${FONT_NUM}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 39);
  });
  const nameTex = canvasTex(128, 160, g => {
    g.fillStyle = '#e3e6e8'; g.fillRect(0, 0, 128, 160);
    g.fillStyle = '#1f3d32'; for (let i = 0; i < 5; i++) g.fillRect(10, 12 + i * 29, 108, i ? 15 : 22);
  });
  function monitorTex(v) {
    return canvasTex(440, 300, (g) => {
      g.fillStyle = '#03060a'; g.fillRect(0, 0, 440, 300);
      const trace = (y0, color, f) => { g.strokeStyle = color; g.lineWidth = 3.4; g.beginPath(); for (let x = 10; x <= 272; x++) { const y = y0 + f(x); x === 10 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); };
      const beat = v.hr > 100 ? 50 : 74;
      trace(80, '#53ff8e', x => { const p = x % beat; if (p > 18 && p < 22) return -44 * Math.sin((p - 18) / 4 * Math.PI); if (p >= 22 && p < 25) return 9; if (p > 31 && p < 43) return -9 * Math.sin((p - 31) / 12 * Math.PI); return 0; });
      trace(162, '#4fe3ff', x => { const p = (x % beat) / beat; return -24 * Math.pow(Math.max(0, Math.sin(p * Math.PI)), 2) + 6; });
      trace(236, '#ffd166', x => -12 * Math.sin(x / (v.rr > 24 ? 20 : 34)));
      const num = (label, val, color, y, alarm) => {
        if (alarm) { g.fillStyle = '#d0202c'; g.fillRect(284, y - 60, 150, 78); }
        g.fillStyle = alarm ? '#ffffff' : color;
        g.font = `600 16px ${FONT_NUM}`; g.fillText(label, 294, y - 38);
        g.font = `700 56px ${FONT_NUM}`; g.fillText(String(val), 300, y + 8);
      };
      num('HR', v.hr, '#53ff8e', 80, false);
      num('SpO2', v.spo2, '#4fe3ff', 164, v.alarm);
      num('RR', v.rr, '#ffd166', 240, false);
      g.font = `600 16px ${FONT_NUM}`; g.fillStyle = '#ff9aa2'; g.fillText(`NIBP ${v.bp}`, 12, 288); g.fillStyle = '#ffb2e6'; g.fillText(`T ${v.bt}`, 190, 288);
    });
  }
  function signTex(main, sub, bg, fg, w = 512, h = 150, size) {
    return canvasTex(w, h, g => {
      g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, 14); g.fill();
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 ${size || (sub ? 64 : 76)}px ${FONT_UI}`; g.fillText(main, w / 2, sub ? h * 0.42 : h / 2 + 4);
      if (sub) { g.globalAlpha = 0.8; g.font = `700 24px ${FONT_NUM}`; g.fillText(sub, w / 2, h * 0.8); }
    });
  }
  const emrTex = canvasTex(320, 200, (g, w) => {
    g.fillStyle = '#e8f0f7'; g.fillRect(0, 0, w, 200); g.fillStyle = '#1f6fa8'; g.fillRect(0, 0, w, 28);
    g.fillStyle = '#fff'; g.font = `700 15px ${FONT_UI}`; g.fillText(`${WARD} 病房 · 病人清單`, 10, 19);
    for (let i = 0; i < 7; i++) { const y = 36 + i * 23; g.fillStyle = i === 1 ? '#ffd5d5' : (i % 2 ? '#fff' : '#f2f6fa'); g.fillRect(6, y, w - 12, 19); g.fillStyle = '#7d8a99'; g.fillRect(12, y + 6, 36, 7); g.fillRect(58, y + 6, 130 - (i * 17) % 60, 7); g.fillStyle = i === 1 ? '#e5383b' : (i === 3 ? '#f0a020' : '#2fa36b'); g.fillRect(w - 44, y + 5, 28, 9); }
  });

  // ---------- repeated furniture: one InstancedMesh per shape and material ----------
  // 66 beds drawn one mesh at a time would be thousands of draw calls
  const kit = new Map();
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
  function kitAdd(key, make, mat, x, y, z, rot, color) {
    let k = kit.get(key);
    if (!k) kit.set(key, k = { geo: make(), mat, items: [] });
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    k.items.push({ m: new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s), color });
  }
  // every instance of a kit shape is drawn, seen or not, so only soft things (mattress, blanket,
  // pillow, cushions) get rounded corners; the rest are plain 12-triangle boxes
  const rgeo = (w, h, d, r) => { const rr = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002); return r >= 0.05 && rr > 0.004 ? new RoundedBoxGeometry(w, h, d, 1, rr) : new THREE.BoxGeometry(w, h, d); };
  const kb = (mat, w, h, d, x, y, z, r = 0.03, rot, color) => kitAdd(`b${w},${h},${d},${r},${mat.uuid}`, () => rgeo(w, h, d, r), mat, x, y, z, rot, color);
  const kc = (mat, rt, rb, h, x, y, z, seg = 12, rot) => kitAdd(`c${rt},${rb},${h},${seg},${mat.uuid}`, () => new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rot);
  const kp = (mat, w, h, x, y, z, rot) => kitAdd(`p${w},${h},${mat.uuid}`, () => new THREE.PlaneGeometry(w, h), mat, x, y, z, rot);
  function flushKit() {
    for (const k of kit.values()) {
      const im = new THREE.InstancedMesh(k.geo, k.mat, k.items.length);
      const tinted = k.items.some(it => it.color);
      k.items.forEach((it, i) => { im.setMatrixAt(i, it.m); if (tinted) im.setColorAt(i, _c.set(it.color || '#ffffff')); });
      world.add(im);
    }
    kit.clear();
  }

  // ---------- the floor ----------
  // One corridor: twelve patient rooms on its south side, 01 at the east end, and on its north
  // side the core -- the nurse station at the east end, the back-of-house rooms, the on-call room
  // to the west. North is -z, the camera looks from the south-east. Walls that stand between the
  // camera and the floor are cut low, dollhouse style; only the far walls are full height.
  const ROOMS = Array.from({ length: 12 }, (_, i) => ({ n: wb(String(i + 1).padStart(2, '0')), front: true, x0: XE - (i + 1) * RW }));
  const BED_Z = { true: [9.2, 7.2, 5.2] };   // A by the window, C by the door
  // the rooms whose beds can ring get a call lamp and a wall monitor on every bed; the rest of
  // the floor sleeps (README.md lists them for public-cases.js)
  const CASE_ROOMS = ['03', '04', '06', '07', '08', '11'];
  const CASE_BEDS = Object.fromEntries(CASE_ROOMS.flatMap(n => ['A', 'B', 'C'].map(L => [wb(`${n}${L}`), { iv: L !== 'B' }])));
  const HAIRS = ['#d6d6d6', '#b8b8b8', '#3a302b', '#e2e2e2', '#2b2421', '#9a9a9a', '#cfcfcf', '#4a3d36', '#bdbdbd'];
  const BEDS = [], BED = {};
  const rb = rng(31);
  ROOMS.forEach(room => ['A', 'B', 'C'].forEach((letter, k) => {
    const id = `${room.n}${letter}`, cb = CASE_BEDS[id];
    const b = { id, room, letter, x0: room.x0, x: room.x0 + 1.25, z: BED_Z[room.front][k], isCase: !!cb,
      occupied: cb ? true : rb() < 0.72, iv: cb ? !!cb.iv : rb() < 0.4, hair: HAIRS[Math.floor(rb() * HAIRS.length)] };
    BEDS.push(b); BED[id] = b;
  }));
  // where people stand around a bed: the head is against the room's west wall, the foot opens to the aisle
  const SPOT = {
    approach: b => [b.x - 0.2, b.z + 0.85],   // the doctor's side, facing the camera
    cpr: b => [b.x - 0.3, b.z + 0.62],
    nurse: b => [b.x + 1.3, b.z + 0.15],      // the nurse waits at the foot, in the aisle
    leave: b => [b.x0 + 2.95, b.z + 0.7],
    touch: b => [b.x + 0.5, b.z],
  };

  // ---------- floors ----------
  box(world, XE - XW + 0.6, 0.7, ZF - ZB + 0.6, M('#131a26', 0.85), (XE + XW) / 2, -0.352, (ZB + ZF) / 2, 0.12);
  function floor(x0, x1, z0, z1, tex, opts = {}) {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set((x1 - x0) / (opts.tile || 1.2), (z1 - z0) / (opts.tile || 1.2));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: t, color: opts.tint || '#ffffff', roughness: opts.rough ?? 0.32 }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, opts.y || 0.003, (z0 + z1) / 2); world.add(m);
  }
  floor(XW, XE, ZFC, ZF, floorTex);
  floor(XW, XE, ZCS, ZFC, hallTex, { tile: 3, rough: 0.16 });
  floor(XW, XE, ZCN, ZCS, floorTex, { tint: '#eef1f2', y: 0.005 });
  floor(-17, -11, ZCN, ZCS, tileTex, { tile: 2.4, y: 0.007 });
  // border strips where the corridor floor meets the walls
  const edgeM = M('#8aa3b3', 0.4);
  [[ZCS + 0.12, XCW, 12], [ZFC - 0.12, XW, XE]].forEach(([z, a, b]) => {
    const m = plane(world, b - a, 0.24, edgeM, (a + b) / 2, 0.006, z); m.rotation.x = -Math.PI / 2;
  });

  // ---------- walls ----------
  // each face of a wall gets its own finish, lower panel then upper wall: blue-grey and off-white
  // in the rooms, grey and pale green in the corridor
  const FIN = {
    room: [M('#9fb7c6', 0.7), M('#f1efe8', 0.9)],
    hall: [M('#c9d3d6', 0.6), M('#e3eae2', 0.9)],
    core: [M('#cfd8db', 0.7), M('#eef1ef', 0.9)],
    oncall: [M('#b9c6cf', 0.8), new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.9 })],
    shut: [M('#97a1a8', 0.8), M('#b3bcc2', 0.9)],
  };
  const capM = M('#3d4550', 0.7), trimM = M('#8aa3b3', 0.6), frameM = M('#8f979e', 0.5), leafM = M('#c3ccd2', 0.6);
  // a: finish on the +z (or +x) face, b: on the -z (or -x) face. Each face is its own half-thick
  // slab, so every piece has one material and the static floor can be merged per material.
  function wall(x0, z0, x1, z1, h, a, b) {
    const horiz = Math.abs(z1 - z0) < 1e-6, t = 0.16;
    const w = horiz ? Math.abs(x1 - x0) : t, d = horiz ? t : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, low = Math.min(0.88, h);
    const slab = (y0, y1, mat, side) => box(world, horiz ? w : t / 2, y1 - y0, horiz ? t / 2 : d, mat,
      cx + (horiz ? 0 : side * t / 4), (y0 + y1) / 2, cz + (horiz ? side * t / 4 : 0), 0);
    slab(0, low, a[0], 1); slab(0, low, b[0], -1);
    if (h > low + 0.01) { slab(low, h, a[1], 1); slab(low, h, b[1], -1); box(world, w + (horiz ? 0 : 0.02), 0.04, d + (horiz ? 0.02 : 0), trimM, cx, low, cz, 0); }
    box(world, w, 0.02, d, capM, cx, h + 0.01, cz, 0);
    solid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
  }
  // a wall along x with door openings; open leaves swing into the side named by `into`
  function run(x0, x1, z, h, doors, a, b, into, rail) {
    // openings are cut walking along the wall, so they must come in order of x; the room
    // lists run east to west, and unsorted they let one segment bury every door after it
    doors = [...doors].sort((p, q) => p.x - q.x);
    let cur = x0;
    const seg = (p, q) => {
      if (q - p < 0.05) return;
      wall(p, z, q, z, h, a, b);
      if (rail) for (const s of rail) kb(M('#bdb5a6', 0.45), q - p - 0.14, 0.07, 0.08, (p + q) / 2, 0.84, z + s * 0.15, 0.03);
    };
    for (const d of doors) { seg(cur, d.x - d.w / 2); cur = d.x + d.w / 2; }
    seg(cur, x1);
    for (const d of doors) {
      for (const s of [-1, 1]) kb(frameM, 0.08, h, 0.22, d.x + s * d.w / 2, h / 2, z, 0.01);
      if (into) kb(leafM, 0.05, h - 0.02, d.w - 0.08, d.x + d.w / 2 - 0.06, h / 2, z + into * (d.w / 2 + 0.06), 0.01);
    }
  }
  function runZ(z0, z1, x, h, doors, a, b) {
    doors = [...doors].sort((p, q) => p.z - q.z);
    let cur = z0;
    const seg = (p, q) => { if (q - p > 0.05) wall(x, p, x, q, h, a, b); };
    for (const d of doors) { seg(cur, d.z - d.w / 2); cur = d.z + d.w / 2; }
    seg(cur, z1);
    for (const d of doors) for (const s of [-1, 1]) kb(frameM, 0.22, h, 0.08, x, h / 2, d.z + s * d.w / 2, 0.01);
  }
  const roomDoor = r => ({ x: r.x0 + 2.85, w: 1.0 });
  // patient rooms
  run(XW, XE, ZFC, 1.0, ROOMS.map(roomDoor), FIN.room, FIN.hall, 1, [-1]);
  wall(XW, ZF + 0.08, XE, ZF + 0.08, 0.5, FIN.shut, FIN.room);
  for (let i = 0; i <= 12; i++) wall(XE - i * RW, ZFC, XE - i * RW, ZF, 1.2, i === 0 ? FIN.shut : FIN.room, i === 12 ? FIN.shut : FIN.room);
  // the core: station at the east end, then the back-of-house rooms, then the on-call room.
  // Doors as [x, width], all on the corridor; the prep room opens into the station instead
  const CORE = [
    { n: '準備室', x0: 8, x1: 12, doors: [] }, { n: '治療室', x0: 4, x1: 8, doors: [[7.2]] },
    { n: '庫房', x0: 0, x1: 4, doors: [[3.2]] }, { n: '討論室', x0: -5, x1: 0, doors: [[-0.8]] },
    { n: '污物間', x0: -8, x1: -5, doors: [[-6.0, 1.2]] }, { n: '茶水間', x0: -11, x1: -8, doors: [[-8.8]] },
    { n: '值班室', x0: -17, x1: -11, doors: [[-11.8]] }, { n: '被服間', x0: XCW, x1: -17, doors: [[-18.4]] },
  ];
  run(XCW, 12, ZCS, 1.0, CORE.flatMap(r => r.doors.map(([x, w]) => ({ x, w: w || 1.0 }))), FIN.hall, FIN.core, -1, [1]);
  [8, 4, 0, -5, -8].forEach(x => wall(x, ZCN, x, ZCS, 1.0, FIN.core, FIN.core));
  wall(-11, ZCN, -11, ZCS, 1.0, FIN.core, FIN.oncall);
  wall(-17, ZCN, -17, ZCS, 1.0, FIN.oncall, FIN.core);
  runZ(ZCN, ZCS, 12, 1.0, [{ z: -1.5, w: 1.0 }], FIN.core, FIN.core);
  // the outer walls: full height behind the core and at the west end, low at the east end
  wall(XW, ZCN - 0.08, -17, ZCN - 0.08, 2.6, FIN.core, FIN.shut);
  wall(-17, ZCN - 0.08, -11, ZCN - 0.08, 2.6, FIN.oncall, FIN.shut);
  wall(-11, ZCN - 0.08, XE, ZCN - 0.08, 2.6, FIN.core, FIN.shut);
  wall(XW - 0.08, ZCN, XW - 0.08, ZCS, 2.6, FIN.core, FIN.shut);
  wall(XW - 0.08, ZCS, XW - 0.08, ZFC, 2.6, FIN.hall, FIN.shut);
  wall(XE + 0.08, ZCN, XE + 0.08, ZFC, 0.6, FIN.shut, FIN.hall);
  // the fire exit at the west end of the corridor
  box(world, 0.06, 2.1, 1.1, M('#8f979e', 0.5), XW - 0.01, 1.05, 2.3, 0.01);
  plane(world, 0.62, 0.2, basic({ map: plaqueTex('安全梯'), color: '#d6e6f5' }), XW + 0.03, 2.25, 2.3).rotation.y = Math.PI / 2;

  // hanging signs: navy, white text, facing down the floor toward the camera
  // the wires are unlit: a ceiling light of the roaming pool can sit right beside one, and a lit
  // wire that close burns to a white spark that blooms and blinks as the pool moves
  const wireM = basic({ color: '#6f7780' });
  function hang(x, z, text, w = 1.9) {
    [x - w * 0.38, x + w * 0.38].forEach(xx => cyl(world, 0.008, 0.008, 0.5, wireM, xx, 2.95, z, 6));
    plane(world, w, 0.42, basic({ map: signTex(text, null, '#1f4e79', '#ffffff', 600, 130, 54), toneMapped: false, color: '#d6e6f5' }), x, 2.55, z);
  }
  hang(10.4, 2.3, `← ${wb('01')}–${wb('12')}`); hang(-1.0, 2.3, '← 值班室', 1.6); hang(-20.4, 2.95, '← 緊急出口 EXIT', 2.1);

  // ---------- beds ----------
  const lamps = {}, monitors = {}, patients = {};
  const lampOff = M('#7d858f', 0.4);
  const lampMat = { red: glow('#ff2a2a', 7), amber: glow('#ffa62b', 5), off: lampOff };
  const okTex = monitorTex({ hr: 76, spo2: 97, rr: 16, bp: '126/78', bt: '36.8' });
  const TEX = {
    [wb('08B')]: [monitorTex({ hr: 92, spo2: 96, rr: 18, bp: '188/96', bt: '36.8', alarm: true }), monitorTex({ hr: 84, spo2: 97, rr: 16, bp: '176/90', bt: '36.8' })],
    [wb('03C')]: [monitorTex({ hr: 108, spo2: 96, rr: 18, bp: '104/64', bt: '36.7' }), okTex],
  };
  // the electric bed: white frame, rounded foot board, blue-striped spread
  const B_M = {
    frame: M('#e6e9ec', 0.5), base: M('#aab3bb', 0.6), panel: M('#c4ccd3', 0.55), wheel: M('#2d333b', 0.6), mattress: M('#e7efea', 0.9),
    blanket: new THREE.MeshStandardMaterial({ map: blanketTex, roughness: 0.95 }), pillow: new THREE.MeshStandardMaterial({ map: pillowTex, roughness: 0.95 }),
    gown: new THREE.MeshStandardMaterial({ map: gownTex, roughness: 0.9 }), skin: F('#efc7aa', 0.65), hair: F('#ffffff', 0.8),
    unit: M('#d7dde2', 0.6), cabinet: M('#ecebe4', 0.6), top: M('#9fb3c2', 0.55), pole: M('#c3cbd3', 0.35, 0.5),
    curtain: new THREE.MeshStandardMaterial({ color: '#d6e4f0', roughness: 0.95, side: THREE.DoubleSide }),
    letters: Object.fromEntries(Object.entries(letterTex).map(([L, t]) => [L, basic({ map: t, transparent: true })])),
    name: basic({ map: nameTex }), plaque: basic({ map: plaqueTex(WARD) }),
  };
  const hairGeo = () => new THREE.SphereGeometry(0.157, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  // a gently waved sheet, for the curtains bunched between the beds
  const wavy = (len, h, amp, freq) => {
    const geo = new THREE.PlaneGeometry(len, h, 40, 1), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const u = pos.getX(i); pos.setZ(i, Math.sin(u * freq) * amp + Math.sin(u * freq * 2.6) * amp * 0.25); }
    geo.computeVertexNormals(); return geo;
  };
  const curtainGeo = wavy(0.7, 1.9, 0.06, 26);
  function bed(b) {
    const { x, z, x0 } = b, wx = x0 + 0.08;
    for (const sx of [-0.82, 0.82]) for (const sz of [-0.36, 0.36]) kc(B_M.wheel, 0.065, 0.065, 0.06, x + sx, 0.065, z + sz, 12, [Math.PI / 2, 0, 0]);
    kb(B_M.base, 1.8, 0.1, 0.8, x, 0.18, z);
    for (const sx of [-0.5, 0.5]) kb(B_M.base, 0.14, 0.3, 0.14, x + sx, 0.36, z, 0.02);
    kb(B_M.frame, 2.08, 0.09, 1.0, x, 0.53, z);
    kb(B_M.mattress, 1.98, 0.18, 0.94, x + 0.02, 0.66, z, 0.07);
    kb(B_M.frame, 0.09, 0.62, 1.06, x - 1.06, 0.9, z, 0.04);
    kb(B_M.frame, 0.12, 0.5, 1.1, x + 1.07, 0.78, z, 0.05);
    kb(B_M.panel, 0.02, 0.28, 0.84, x + 1.14, 0.74, z, 0.01);
    for (const sz of [-0.53, 0.53]) { kb(B_M.frame, 0.8, 0.22, 0.06, x - 0.42, 0.86, z + sz, 0.03); kb(B_M.frame, 0.68, 0.2, 0.06, x + 0.5, 0.84, z + sz, 0.03); }
    kb(B_M.pillow, 0.38, 0.13, 0.64, x - 0.78, 0.82, z, 0.06, [0, 0, -0.26]);
    const pt = new THREE.Group(); world.add(pt); patients[b.id] = pt;
    if (b.occupied) {
      kitAdd('head', () => new THREE.SphereGeometry(0.15, 12, 10), B_M.skin, x - 0.6, 0.97, z);
      kitAdd('hair', hairGeo, B_M.hair, x - 0.6, 0.97, z, [0, 0, Math.PI / 2], b.hair);
      kb(B_M.gown, 0.3, 0.12, 0.62, x - 0.32, 0.83, z, 0.05);
      kb(B_M.blanket, 1.36, 0.15, 0.9, x + 0.27, 0.8, z, 0.07);
      kb(B_M.blanket, 1.08, 0.12, 0.54, x + 0.2, 0.88, z, 0.06);
    } else kb(B_M.blanket, 0.5, 0.08, 0.9, x + 0.68, 0.79, z, 0.04);
    // head unit on the wall: gases, call button, the bed letter and its green plaque
    kb(B_M.unit, 0.07, 1.0, 1.25, wx + 0.04, 1.5, z, 0.02);
    [['#2fa36b', -0.42], ['#f4f4f4', -0.29], ['#f2c230', -0.16]].forEach(([c, dz]) => kc(M(c, 0.4), 0.04, 0.04, 0.035, wx + 0.09, 1.18, z + dz, 12, [0, 0, Math.PI / 2]));
    kb(M('#d33a3a', 0.5), 0.04, 0.14, 0.14, wx + 0.09, 1.56, z - 0.36, 0.02);
    kp(B_M.letters[b.letter], 0.24, 0.24, wx + 0.085, 1.86, z + 0.32, [0, Math.PI / 2, 0]);
    if (b.isCase) plane(world, 0.3, 0.085, basic({ map: plaqueTex(b.id) }), wx + 0.085, 1.7, z + 0.32).rotation.y = Math.PI / 2;
    else kp(B_M.plaque, 0.3, 0.085, wx + 0.085, 1.7, z + 0.32, [0, Math.PI / 2, 0]);
    kp(B_M.name, 0.24, 0.3, wx + 0.085, 1.45, z + 0.32, [0, Math.PI / 2, 0]);
    if (b.isCase) lamps[b.id] = sph(world, 0.055, lampOff, wx + 0.1, 1.9, z - 0.36, 14, 10);
    else kitAdd('lamp', () => new THREE.SphereGeometry(0.055, 12, 8), lampOff, wx + 0.1, 1.9, z - 0.36);
    // bedside cabinet with the wood top, and the curtain bunched against the wall between beds
    kb(B_M.cabinet, 0.44, 0.72, 0.44, wx + 0.36, 0.36, z - 0.74, 0.02);
    kb(B_M.top, 0.48, 0.04, 0.48, wx + 0.36, 0.74, z - 0.74, 0.01);
    kb(M('#c9c8c0', 0.5), 0.36, 0.02, 0.012, wx + 0.36, 0.5, z - 0.515, 0);
    kitAdd('curtain', () => curtainGeo, B_M.curtain, wx + 0.5, 1.23, z - 1.0);
    solid(x - 1.12, z - 0.52, x + 1.14, z + 0.52);
    solid(wx + 0.12, z - 0.98, wx + 0.6, z - 0.5);
    if (b.iv) {
      const px = wx + 0.42, pz = z + 0.7;
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; kb(B_M.pole, 0.28, 0.025, 0.035, px + Math.cos(a) * 0.13, 0.06, pz + Math.sin(a) * 0.13, 0.01, [0, -a, 0]); }
      kc(B_M.pole, 0.018, 0.018, 1.95, px, 1.0, pz, 8);
      kb(new THREE.MeshStandardMaterial({ color: '#e6f3fa', roughness: 0.2, transparent: true, opacity: 0.8 }), 0.05, 0.24, 0.15, px, 1.78, pz + 0.08, 0.02);
      kb(M('#eef0f3', 0.5), 0.13, 0.2, 0.17, px + 0.06, 1.2, pz, 0.02);
      solid(px - 0.12, pz - 0.12, px + 0.12, pz + 0.12);
    }
    if (b.isCase) wallMonitor(b);
  }
  function wallMonitor(b) {
    const g = new THREE.Group(); g.position.set(b.x0 + 0.1, 0, b.z - 0.62); world.add(g);
    box(g, 0.42, 0.06, 0.06, M('#9aa4ae', 0.4, 0.3), 0.21, 2.05, 0, 0.02);
    const mon = new THREE.Group(); mon.position.set(0.44, 2.05, 0); mon.rotation.y = 0.9; g.add(mon);
    box(mon, 0.58, 0.42, 0.12, M('#2b3138', 0.5), 0, 0, 0, 0.03);
    monitors[b.id] = plane(mon, 0.52, 0.355, basic({ map: TEX[b.id] ? TEX[b.id][1] : okTex, toneMapped: false }), 0, 0, 0.062);
  }
  BEDS.forEach(bed);
  // a reclining companion chair in some of the quiet rooms, folded against the aisle wall
  const reclM = M('#9bb0a0', 0.6);
  ROOMS.filter((r, i) => i % 3 === 1 && !CASE_ROOMS.map(wb).includes(r.n)).forEach(r => {
    const x = r.x0 + RW - 0.45, z = BED_Z[r.front][1];
    kb(reclM, 0.62, 0.42, 0.66, x, 0.4, z, 0.06); kb(reclM, 0.18, 0.7, 0.66, x + 0.24, 0.85, z, 0.06);
    kb(M('#2b2f36', 0.5), 0.08, 0.06, 0.6, x - 0.24, 0.66, z, 0.02);
    solid(x - 0.34, z - 0.36, x + 0.34, z + 0.36);
  });

  // ---------- core rooms ----------
  function chair(x, z, rot = 0, seat = '#33404d') {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = rot; world.add(c);
    cyl(c, 0.27, 0.27, 0.04, M('#2e3640', 0.5), 0, 0.05, 0, 18);
    cyl(c, 0.03, 0.03, 0.4, M('#8a939d', 0.4, 0.5), 0, 0.26, 0, 10);
    box(c, 0.48, 0.07, 0.46, M(seat, 0.7), 0, 0.47, 0, 0.03);
    box(c, 0.44, 0.5, 0.06, M(seat, 0.7), 0, 0.8, -0.24, 0.03);
    return c;
  }
  const shelfM = M('#9aa1a8', 0.5, 0.3), binColors = ['#e4572e', '#4f86c6', '#f3a712', '#29a36a', '#b56fd8', '#e94f87', '#3fb6c6'];
  function shelf(x, z, w, rotated) {
    const W = rotated ? 0.45 : w, D = rotated ? w : 0.45;
    for (let i = 0; i < 4; i++) kb(shelfM, W, 0.03, D, x, 0.2 + i * 0.42, z, 0);
    for (const s of [-1, 1]) kb(shelfM, rotated ? 0.45 : 0.04, 1.5, rotated ? 0.04 : 0.45, x + (rotated ? 0 : s * w / 2), 0.75, z + (rotated ? s * w / 2 : 0), 0);
    const r = rng(Math.round(x * 13 + z * 7));
    for (let i = 0; i < 3; i++) for (let k = 0; k < Math.floor(w / 0.32); k++) if (r() < 0.8) {
      const off = -w / 2 + 0.2 + k * 0.32;
      kb(M(binColors[Math.floor(r() * 7)], 0.6), rotated ? 0.34 : 0.26, 0.22, rotated ? 0.26 : 0.34, x + (rotated ? 0 : off), 0.33 + i * 0.42, z + (rotated ? off : 0), 0.02);
    }
    solid(x - W / 2, z - D / 2, x + W / 2, z + D / 2);
  }
  const counterM = M('#e9e6df', 0.5), sinkM = M('#cfd6dc', 0.25, 0.4);
  // 準備室: counter with a sink along the north wall, the med cart, shelves
  box(world, 2.2, 0.86, 0.6, counterM, 9.4, 0.43, -3.6, 0.02); box(world, 2.3, 0.04, 0.66, M('#a9b4bd', 0.4), 9.4, 0.88, -3.6, 0.01);
  box(world, 0.5, 0.05, 0.4, sinkM, 9.0, 0.9, -3.6, 0.01); solid(8.3, -3.9, 10.5, -3.3);
  box(world, 0.95, 1.0, 0.56, M('#3a78c9', 0.5), 9.6, 0.5, -1.2, 0.04); solid(9.1, -1.5, 10.1, -0.9);
  shelf(8.4, -1.3, 1.8, true);
  // 治療室: an exam couch and a cabinet
  box(world, 1.9, 0.62, 0.72, M('#7d9bb0', 0.6), 6, 0.31, -2.6, 0.06); box(world, 0.5, 0.12, 0.6, M('#eef2f4', 0.8), 5.2, 0.68, -2.6, 0.05);
  solid(5.0, -3.0, 7.0, -2.2); shelf(4.5, -1.2, 1.4, true);
  box(world, 0.6, 0.86, 0.5, counterM, 7.4, 0.43, -3.6, 0.02); solid(7.1, -3.9, 7.7, -3.35);
  // 庫房: shelving
  shelf(1.5, -3.6, 2.4); shelf(0.45, -1.4, 2.0, true); shelf(3.55, -1.6, 1.6, true);
  // 討論室: table, chairs, whiteboard
  box(world, 2.8, 0.06, 1.1, M('#c9a77a', 0.5), -2.5, 0.74, -1.6, 0.02);
  [-0.9, 0.9].forEach(dx => box(world, 0.06, 0.72, 0.9, M('#8a7a66', 0.5), -2.5 + dx, 0.37, -1.6, 0));
  solid(-3.9, -2.15, -1.1, -1.05);
  [-3.4, -2.5, -1.6].forEach(x => { chair(x, -0.75, Math.PI); chair(x, -2.45, 0); });
  box(world, 2.4, 1.0, 0.04, M('#f7f8f9', 0.3), -2.5, 0.9, ZCN + 0.1, 0.01);
  // 污物間: bins and a hopper sink
  [['#f2c230', -7.6], ['#d64545', -7.15], ['#2f6fb0', -6.7]].forEach(([c, x]) => { cyl(world, 0.2, 0.18, 0.7, M(c, 0.6), x, 0.35, -3.5, 14); });
  solid(-7.82, -3.75, -6.48, -3.25);
  // 茶水間: water dispenser, fridge, counter
  box(world, 2.0, 0.86, 0.6, counterM, -9.5, 0.43, -3.6, 0.02); solid(-10.5, -3.9, -8.5, -3.3);
  box(world, 0.4, 0.5, 0.36, M('#f4f4f2', 0.4), -9.0, 1.12, -3.6, 0.03);
  box(world, 0.7, 1.7, 0.66, M('#d8dde2', 0.35, 0.2), -10.55, 0.85, -0.9, 0.04); solid(-10.9, -1.25, -10.2, -0.55);
  // 被服間: linen shelves
  shelf(-19.4, -3.6, 1.9);
  // ---------- nurse station ----------
  // A white-topped counter along the corridor with the staff sitting behind it, a back counter
  // and the charting screens along the north wall, pigeonholes on the west wall, and a ceiling
  // panel with a cool light that marks the station from down the corridor.
  const plinthM = M('#7f9fb4', 0.6), whiteTopM = M('#f2f4f5', 0.3), baseWoodM = M('#7f9fb4', 0.55), topM = M('#eef1f3', 0.45);
  function counter(x0, z0, x1, z1, h, d, faceM, topMat) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.Group(); g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); g.rotation.y = -Math.atan2(z1 - z0, x1 - x0); world.add(g);
    box(g, len, h - 0.12, d, faceM, 0, (h - 0.12) / 2 + 0.06, 0, 0.02);
    box(g, len - 0.04, 0.08, d - 0.06, plinthM, 0, 0.04, 0, 0);
    box(g, len + 0.04, 0.05, d + 0.12, topMat, 0, h - 0.035, 0, 0.015);
    solid(Math.min(x0, x1) - d / 2, Math.min(z0, z1) - d / 2, Math.max(x0, x1) + d / 2, Math.max(z0, z1) + d / 2);
  }
  counter(16.9, -3.25, 13.4, -3.25, 0.84, 0.6, baseWoodM, whiteTopM);
  counter(16.9, 0.75, 13.4, 0.75, 0.84, 0.5, baseWoodM, whiteTopM);
  chair(14.4, 0.1, 0); chair(15.9, 0.1, 0);
  // the north desk, its screens facing the camera
  box(world, 2.9, 0.06, 0.6, topM, 14.95, 0.76, -2.62, 0.02);
  [14.0, 15.3].forEach(x => {
    box(world, 0.08, 0.3, 0.08, M('#2b3138', 0.5), x, 0.92, -2.72, 0.01);
    box(world, 0.64, 0.42, 0.05, M('#22272e', 0.5), x, 1.22, -2.72, 0.02);
    plane(world, 0.58, 0.36, basic({ map: emrTex }), x, 1.22, -2.692);
    box(world, 0.46, 0.02, 0.16, M('#d9dde2', 0.5), x, 0.8, -2.42, 0.005);
  });
  chair(14.5, -1.95, Math.PI);
  solid(13.5, -2.95, 16.4, -2.3);
  // the west wall: cabinets under dark pigeonholes, and the ward whiteboard
  const holeTex = canvasTex(160, 120, g => {
    g.fillStyle = '#3b3f45'; g.fillRect(0, 0, 160, 120);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) { g.fillStyle = '#20242a'; g.fillRect(4 + c * 19.5, 4 + r * 19, 16, 15); g.fillStyle = '#e9e6dc'; if ((r * 8 + c) % 3) g.fillRect(6 + c * 19.5, 14 + r * 19, 12, 4); }
  });
  box(world, 0.45, 0.85, 1.3, baseWoodM, 12.35, 0.425, -2.95, 0.02);
  box(world, 0.4, 0.75, 1.3, M('#3b3f45', 0.6), 12.33, 1.25, -2.95, 0.01);
  plane(world, 1.26, 0.72, basic({ map: holeTex }), 12.54, 1.25, -2.95).rotation.y = Math.PI / 2;
  [[-3.35, '#4caf50'], [-2.95, '#43a047'], [-2.55, '#66bb6a']].forEach(([z, c]) => box(world, 0.12, 0.22, 0.16, M(c, 0.6), 12.35, 1.74, z, 0.02));
  solid(12.1, -3.6, 12.6, -2.3);
  box(world, 0.45, 0.85, 1.0, baseWoodM, 12.35, 0.425, -0.1, 0.02);
  box(world, 0.04, 0.7, 0.95, M('#f7f8f9', 0.3), 12.4, 1.3, -0.1, 0.01);
  solid(12.1, -0.6, 12.6, 0.4);
  // the ceiling panel; its sides carry a cool light
  const octagon = (hx, hz, c) => {
    const s = new THREE.Shape();
    [[-hx + c, -hz], [hx - c, -hz], [hx, -hz + c], [hx, hz - c], [hx - c, hz], [-hx + c, hz], [-hx, hz - c], [-hx, -hz + c]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath(); return s;
  };
  const ringShape = octagon(2.95, 2.75, 0.3);
  ringShape.holes.push(new THREE.Path(octagon(2.6, 2.4, 0.25).getPoints()));
  const stationRing = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape, { depth: 0.18, bevelEnabled: false }), [
    M('#e4eaee', 0.55),
    new THREE.MeshStandardMaterial({ color: '#dfe8ec', emissive: '#9fd0ff', emissiveIntensity: 0.45, roughness: 0.5 }),
  ]);
  stationRing.rotation.x = -Math.PI / 2; stationRing.position.set(15.35, 2.72, -1.35); world.add(stationRing);
  [[13.0, -3.6], [17.7, -3.6], [13.0, 0.9], [17.7, 0.9]].forEach(([x, z]) => cyl(world, 0.01, 0.01, 0.4, M('#9aa4ae', 0.4), x, 3.05, z, 6));
  [14.4, 16.0].forEach(x => cyl(world, 0.008, 0.008, 0.3, M('#9aa4ae', 0.4), x, 2.48, 1.25, 6));
  plane(world, 2.4, 0.62, basic({ map: signTex(`${WARD} 護理站`, 'NURSE STATION', '#1f4e79', '#ffffff'), color: '#e6eef6' }), 15.2, 2.02, 1.25);
  // crash cart and treatment cart along the core wall, outside the station
  box(world, 0.78, 1.0, 0.58, M('#d43a3c', 0.5), 11.3, 0.5, ZCS + 0.42, 0.04);
  for (let i = 0; i < 4; i++) box(world, 0.68, 0.015, 0.02, M('#ffd0d0', 0.4), 11.3, 0.25 + i * 0.2, ZCS + 0.72, 0);
  box(world, 0.44, 0.2, 0.34, M('#f0c02f', 0.5), 11.3, 1.1, ZCS + 0.42, 0.03);
  plane(world, 0.22, 0.1, basic({ color: '#56ffa0', toneMapped: false }), 11.3, 1.14, ZCS + 0.595);
  solid(10.9, ZCS, 11.7, ZCS + 0.72);
  const tc = new THREE.Group(); tc.position.set(9.7, 0, ZCS + 0.4); world.add(tc);
  box(tc, 0.8, 0.95, 0.55, M('#d3d5d8', 0.5), 0, 0.55, 0, 0.04);
  for (let i = 0; i < 3; i++) box(tc, 0.7, 0.16, 0.03, M('#d96a77', 0.5), 0, 0.35 + i * 0.22, 0.28, 0.02);
  [['#e94f4f', -0.25], ['#f2f2f2', -0.05], ['#f3a712', 0.15]].forEach(([c, dx]) => box(tc, 0.14, 0.16, 0.12, M(c, 0.6), dx, 1.11, -0.05, 0.02));
  solid(9.25, ZCS, 10.15, ZCS + 0.7);

  // ---------- on-call room (值班室): single bed, its own toilet, white steel desk, pink chair ----------
  // the toilet in the north-west corner, behind its own door
  const bathFin = [M('#d6dde0', 0.5), M('#eef2f3', 0.6)];
  floor(-17, -15.1, ZCN, -1.9, tileTex, { tint: '#dfe7ea', tile: 0.9, y: 0.009 });
  runZ(ZCN, -1.9, -15.1, 1.0, [{ z: -2.6, w: 0.8 }], FIN.oncall, bathFin);
  wall(-17, -1.9, -15.1, -1.9, 1.0, FIN.oncall, bathFin);
  kb(leafM, 0.72, 0.98, 0.05, -15.52, 0.49, -2.98, 0.01);
  const porcelain = M('#f4f5f3', 0.3);
  cyl(world, 0.17, 0.14, 0.4, porcelain, -16.5, 0.2, -3.25, 18);
  box(world, 0.46, 0.06, 0.38, porcelain, -16.48, 0.42, -3.25, 0.03);
  box(world, 0.18, 0.42, 0.44, porcelain, -16.8, 0.62, -3.25, 0.03);
  solid(-16.92, -3.5, -16.25, -3.0);
  cyl(world, 0.07, 0.09, 0.72, porcelain, -15.75, 0.36, -3.72, 12);
  box(world, 0.52, 0.14, 0.4, porcelain, -15.75, 0.79, -3.7, 0.04);
  cyl(world, 0.015, 0.015, 0.16, M('#b9c1c8', 0.3, 0.6), -15.75, 0.92, -3.84, 8);
  solid(-16.05, -3.92, -15.45, -3.48);
  // the bed along the west wall, head to the wall
  box(world, 2.12, 0.36, 1.02, M('#6b4f3a', 0.7), -15.82, 0.18, -0.75, 0.03);
  box(world, 2.04, 0.16, 0.96, M('#f2f2f0', 0.9), -15.82, 0.44, -0.75, 0.06);
  box(world, 0.06, 0.62, 1.02, M('#6b4f3a', 0.7), -16.86, 0.5, -0.75, 0.02);
  box(world, 0.34, 0.12, 0.55, M('#9fd8c6', 0.95), -16.55, 0.58, -0.75, 0.06);
  solid(-16.92, -1.3, -14.74, -0.2);
  const bl1 = box(world, 1.15, 0.12, 0.9, new THREE.MeshStandardMaterial({ map: spreadTex, roughness: 0.95 }), -15.25, 0.58, -0.72, 0.06); bl1.rotation.y = 0.18; bl1.rotation.x = 0.05;
  // desk
  box(world, 1.5, 0.04, 0.64, M('#e8e6df', 0.45), -12.6, 0.76, -3.55, 0.01);
  box(world, 0.5, 0.72, 0.6, M('#e3e1d9', 0.5), -12.1, 0.37, -3.55, 0.02);
  for (let i = 0; i < 3; i++) box(world, 0.44, 0.012, 0.012, M('#9b9a93', 0.5), -12.1, 0.2 + i * 0.22, -3.24, 0);
  box(world, 0.04, 0.72, 0.6, M('#e3e1d9', 0.5), -13.33, 0.37, -3.55, 0);
  solid(-13.4, -3.9, -11.8, -3.2);
  box(world, 0.9, 0.6, 0.02, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, transparent: true, opacity: 0.35 }), -12.4, 1.55, ZCN + 0.1, 0);
  cyl(world, 0.08, 0.09, 0.03, M('#2b2f36', 0.5), -11.95, 0.8, -3.7, 14);
  const lampArm = cyl(world, 0.012, 0.012, 0.42, M('#2b2f36', 0.5), -11.95, 1.0, -3.62, 8); lampArm.rotation.x = 0.4;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#f1f0ea', side: THREE.DoubleSide }));
  shade.position.set(-11.95, 1.2, -3.45); world.add(shade);
  sph(world, 0.04, glow('#ffd59a', 4), -11.95, 1.15, -3.45, 10, 8);
  chair(-12.7, -2.75, Math.PI, '#e59a9a');
  // the bento
  const bento = new THREE.Group(); bento.position.set(-12.8, 0.79, -3.5); world.add(bento);
  box(bento, 0.3, 0.06, 0.22, M('#2b2b2b', 0.6), 0, 0.03, 0, 0.015);
  box(bento, 0.16, 0.03, 0.18, M('#fbfaf5', 0.9), -0.06, 0.065, 0, 0.01);
  box(bento, 0.1, 0.03, 0.08, M('#b5652b', 0.7), 0.08, 0.07, -0.04, 0.01);
  box(bento, 0.08, 0.03, 0.06, M('#f2c230', 0.7), 0.08, 0.07, 0.05, 0.01);
  sph(bento, 0.025, M('#4f9d4a', 0.8), 0.02, 0.08, 0.06, 8, 6);
  const sticks = box(bento, 0.22, 0.012, 0.012, M('#d8b07a', 0.6), 0, 0.075, 0.13, 0); sticks.rotation.y = 0.15;
  const steamM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false });
  const steam = [0, 1, 2].map(i => sph(bento, 0.035, steamM, -0.05 + i * 0.05, 0.16, 0, 8, 6));
  // where the on-call room's routines happen
  // bed: the on-call bed's footprint (x0, z0, x1, z1), the same box the doctor walks around
  const ONCALL = { bed: [-16.92, -1.3, -14.74, -0.2], sleepAt: [-15.7, 0.25], wake: [-15.4, 0.35], eatAt: [-12.7, -2.5], seat: [-12.7, -2.75], stand: [-12.7, -2.0], toiletAt: [-16.0, -2.9], sleeper: [-15.0, 0.72, -0.75], bento: [-12.8, 1.25, -3.5], zzz: [-15.9, 1.3, -0.75] };

  // ---------- plants at the two ends of the corridor ----------
  function plant(x, z) {
    cyl(world, 0.22, 0.17, 0.42, M('#d9dde0', 0.7), x, 0.21, z, 16);
    [[0, 0.62, 0, 0.3], [0.12, 0.85, 0.05, 0.22], [-0.1, 0.8, -0.06, 0.2]].forEach(([dx, y, dz, r]) => sph(world, r, F('#3f8a52', 0.8), x + dx, y, z + dz, 8, 6));
    solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  }
  plant(XW + 0.5, 3.1); plant(XE - 0.5, 3.1);

  // ---------- people ----------
  const coatM = new THREE.MeshStandardMaterial({ color: '#f6f8fa', roughness: 0.85, side: THREE.DoubleSide, flatShading: true });
  function person(o) {
    const g = new THREE.Group();
    const skinM = F(o.skin || '#f0c6a6', 0.65), topM = F(o.top, 0.85), pantsM = F(o.pants || o.top, 0.85), shoeM = F(o.shoes || '#eceff2', 0.6);
    const pose = o.pose || 'stand';
    const lift = pose === 'sit' ? -0.36 : 0;
    const legs = [], arms = [];
    for (const s of [-1, 1]) {
      if (pose === 'stand') {
        const hip = new THREE.Group(); hip.position.set(s * 0.085, 0.74, 0); g.add(hip);
        cyl(hip, 0.068, 0.062, 0.66, pantsM, 0, -0.33, 0, 8);
        box(hip, 0.12, 0.08, 0.25, shoeM, 0, -0.7, 0.04, 0.035);
        legs.push(hip);
      } else {
        const th = cyl(g, 0.072, 0.072, 0.44, pantsM, s * 0.085, 0.5, 0.2, 8); th.rotation.x = Math.PI / 2;
        cyl(g, 0.062, 0.06, 0.46, pantsM, s * 0.085, 0.26, 0.4, 8);
        box(g, 0.12, 0.08, 0.25, shoeM, s * 0.085, 0.04, 0.46, 0.035);
      }
    }
    cyl(g, 0.19, 0.215, 0.6, topM, 0, 0.99 + lift, 0, 10);
    const sh = sph(g, 0.205, topM, 0, 1.27 + lift, 0, 10, 6); sh.scale.set(1, 0.42, 0.82);
    let armM = topM;
    if (o.coat) {
      armM = coatM;
      // short coat (PGY) ends at the hip; long coat (residents and up) reaches the knee
      const short = o.coat === 'short' || pose !== 'stand';
      const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.226, short ? 0.25 : 0.28, short ? 0.6 : 0.92, 12, 1, true, 0.42, Math.PI * 2 - 0.84), coatM);
      coat.position.set(0, pose === 'stand' ? (short ? 1.03 : 0.87) : 1.0 + lift, 0); g.add(coat);
      const cs = sph(g, 0.215, coatM, 0, 1.275 + lift, -0.01, 10, 6); cs.scale.set(1.02, 0.42, 0.8);
    }
    for (const s of [-1, 1]) {
      const shp = new THREE.Group(); shp.position.set(s * 0.258, 1.27 + lift, 0); shp.rotation.z = s * 0.1; g.add(shp);
      cyl(shp, 0.064, 0.056, 0.56, armM, 0, -0.27, 0, 8);
      sph(shp, 0.06, skinM, 0, -0.58, 0, 8, 6);
      arms.push(shp);
    }
    cyl(g, 0.07, 0.075, 0.1, skinM, 0, 1.36 + lift, 0, 8);
    const hy = 1.58 + lift;
    sph(g, 0.205, skinM, 0, hy, 0, 12, 10);
    for (const s of [-1, 1]) sph(g, 0.022, M('#1d1a1a', 0.4), s * 0.072, hy + 0.02, 0.19, 6, 5);
    const hm = F(o.hairColor || '#1d1817', 0.75);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.222, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), hm);
    cap.position.set(0, hy + 0.012, -0.012); cap.rotation.x = -0.32; g.add(cap);
    if (o.hair === 'pony') { sph(g, 0.09, hm, 0, hy + 0.08, -0.2, 8, 6); const tail = cyl(g, 0.07, 0.03, 0.3, hm, 0, hy - 0.08, -0.27, 8); tail.rotation.x = 0.35; }
    if (o.hair === 'bob') { const b = sph(g, 0.225, hm, 0, hy - 0.045, -0.04, 12, 8); b.scale.set(1.04, 0.92, 1); }
    if (o.mask) box(g, 0.21, 0.11, 0.07, F('#b9d8f0', 0.9), 0, hy - 0.08, 0.165, 0.03);
    if (o.clip) box(g, 0.24, 0.3, 0.03, F('#a77b4f', 0.7), 0, 1.06 + lift, 0.23, 0.01);
    if (o.steth) {
      const st = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.013, 6, 16, Math.PI), M('#2d3138', 0.5));
      st.rotation.z = Math.PI; st.rotation.x = -0.28; st.position.set(0, 1.27 + lift, 0.17); g.add(st);
    }
    if (o.badge) box(g, 0.075, 0.095, 0.02, M('#ffffff', 0.5), -0.1, 1.13 + lift, 0.215, 0.01);
    g.userData = { legs, arms, person: true };
    world.add(g);
    return g;
  }
  const place = (obj, x, z, rot = 0) => { obj.position.set(x, 0, z); obj.rotation.y = rot; return obj; };

  const PGY_LOOK = { m: { hair: 'short', hairColor: '#1b1716' }, f: { hair: 'pony', hairColor: '#141110' } };
  const players = {}, sitters = {}, sleepers = {};
  for (const k of ['m', 'f']) {
    // the shift starts in front of the station
    players[k] = place(person({ top: '#7fb2dc', coat: 'short', steth: true, badge: true, ...PGY_LOOK[k] }), 14.8, 2.3, -Math.PI / 2);
    players[k].rotation.order = 'YXZ'; // turn first, then lean forward over a chest
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 40), basic({ color: '#45e3cc', transparent: true, opacity: 0.9, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; players[k].add(ring);
    sitters[k] = place(person({ top: '#7fb2dc', coat: 'short', steth: true, pose: 'sit', ...PGY_LOOK[k] }), ONCALL.seat[0], ONCALL.seat[1], Math.PI);
    sitters[k].visible = false;
    // lying on the on-call bed, head toward the west wall
    const holder = new THREE.Group(); holder.position.set(...ONCALL.sleeper); holder.rotation.y = Math.PI / 2; world.add(holder);
    const body = person({ top: '#7fb2dc', coat: 'short', ...PGY_LOOK[k] });
    holder.add(body); body.rotation.x = -Math.PI / 2;
    holder.visible = false; sleepers[k] = holder;
  }
  players.f.visible = false;
  let player = players.m, playerSit = sitters.m;
  const sleepBlanket = box(world, 1.3, 0.14, 0.95, new THREE.MeshStandardMaterial({ map: spreadTex, roughness: 0.95 }), -15.45, 0.86, -0.75, 0.06);
  sleepBlanket.visible = false;

  const NURSE = { top: '#f5f6f8', hair: 'pony', hairColor: '#6b3f22', clip: true, badge: true };
  const nurseByBed = {};
  function ensureNurse(bed) {
    if (nurseByBed[bed]) { nurseByBed[bed].visible = true; return nurseByBed[bed]; }
    const [x, z] = SPOT.nurse(BED[bed]);
    const n = place(person(NURSE), x, z, -Math.PI / 2);
    n.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // she stands in the room's only aisle, so she is a small round obstacle (see collide), not a box
    return (nurseByBed[bed] = n);
  }
  const sitShufen = place(person({ top: '#f5f6f8', hair: 'bob', hairColor: '#2c201d', pose: 'sit', mask: true }), 15.9, 0.1, 0);
  const sitAzhe = place(person({ top: '#7fb2dc', coat: 'long', steth: true, hair: 'short', hairColor: '#231c19', pose: 'sit', mask: true }), 14.4, 0.1, 0);
  const sitYaqi = place(person({ top: '#f5f6f8', hair: 'pony', hairColor: '#3a2a24', pose: 'sit', mask: true }), 14.5, -1.95, Math.PI);
  const prepJingyi = place(person({ ...NURSE, clip: false }), 9.6, -0.5, Math.PI); // at the med cart in the prep room

  // the rest of the night staff walk the corridor; they are scenery, so the player walks through them
  const staff = [];
  function walker(look, path, opts = {}) {
    const obj = place(person({ ...NURSE, ...look }), path[0][0], path[0][1], 0);
    const n = { obj, path, i: 1, dir: 1, wait: Math.random() * 3, speed: opts.speed || 1.25, phase: Math.random() * 6, active: opts.active !== false, once: !!opts.once, face: opts.face };
    obj.visible = n.active;
    staff.push(n);
    return n;
  }
  const wPinyu = walker({}, [[16.0, 2.4], [6.0, 2.4], [-4.0, 2.2], [-14.0, 2.4], [-21.8, 2.2]]);
  const wShuhan = walker({ hair: 'bob', hairColor: '#2c201d', clip: false }, [[-21.0, 3.0], [-8.0, 3.1], [4.0, 3.0], [11.0, 3.0]]);
  const wAkai = walker({ top: '#4f6f95', hair: 'short', hairColor: '#2a2420', clip: false, badge: false }, [[17.0, 1.7], [2.0, 1.8], [-19.0, 1.7]]);
  const wAzhu = walker({ top: '#8fb3a2', hair: 'bob', hairColor: '#9c9c9c', clip: false, badge: false }, [[10.0, 2.3], [6.85, 2.3], [6.85, 4.6], [6.9, 6.2]]);
  // everyone who can be spoken to (chatter.js), and how close the doctor has to be: the station
  // staff sit behind the counter, so they are reached from across it
  const TALKERS = [
    { key: 'pinyu', obj: wPinyu.obj, walker: wPinyu, reach: 1.3 }, { key: 'shuhan', obj: wShuhan.obj, walker: wShuhan, reach: 1.3 },
    { key: 'akai', obj: wAkai.obj, walker: wAkai, reach: 1.3 }, { key: 'azhu', obj: wAzhu.obj, walker: wAzhu, reach: 1.3 },
    { key: 'shufen', obj: sitShufen, reach: 2.1 }, { key: 'yaqi', obj: sitYaqi, reach: 2.1 }, { key: 'azhe', obj: sitAzhe, reach: 2.1 },
    { key: 'jingyi', obj: prepJingyi, reach: 1.4 },
  ];
  // two more nurses keep the station all night
  walker({}, [[14.6, 2.0]], { active: false, speed: 2.4, face: 0 });
  walker({ hair: 'bob', hairColor: '#2c201d' }, [[15.2, 2.0]], { active: false, speed: 2.2, face: -Math.PI / 2 });
  function updateStaff(dt) {
    for (const n of staff) {
      if (!n.active) continue;
      const { obj, path } = n, { legs, arms } = obj.userData;
      if (n.wait > 0) { n.wait -= dt; legs.forEach(l => { l.rotation.x *= 0.8; }); arms.forEach(a => { a.rotation.x *= 0.8; }); continue; }
      const [tx, tz] = path[n.i], dx = tx - obj.position.x, dz = tz - obj.position.z, d = Math.hypot(dx, dz);
      if (d < 0.05) {
        if (n.once && n.i === path.length - 1) { n.active = false; if (n.face != null) obj.rotation.y = n.face; legs.forEach(l => { l.rotation.x = 0; }); arms.forEach(a => { a.rotation.x = 0; }); continue; }
        if (n.i === path.length - 1 || n.i === 0) n.dir = -n.dir;
        n.i += n.dir; n.wait = n.once ? 0 : 0.6 + Math.random() * 2.4;
        continue;
      }
      const step = Math.min(d, n.speed * dt);
      obj.position.x += dx / d * step; obj.position.z += dz / d * step;
      let diff = Math.atan2(dx, dz) - obj.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      obj.rotation.y += diff * Math.min(1, dt * 10);
      n.phase += dt * n.speed * 3.4;
      const sw = Math.sin(n.phase) * 0.5;
      legs[0].rotation.x = sw; legs[1].rotation.x = -sw; arms[0].rotation.x = -sw * 0.6; arms[1].rotation.x = sw * 0.6;
    }
  }

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight('#8f9dc8', '#2a2730', 1.05); scene.add(hemi);
  // moonlight through the windows; its shadow box follows the camera, so it stays sharp on a long floor
  const moon = new THREE.DirectionalLight('#b0c2ff', 1.0);
  const MOON = new THREE.Vector3(-10, 18, 10);
  moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 1, far: 70 });
  moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.03;
  scene.add(moon, moon.target);
  const point = (color, intensity, dist, x, y, z) => { const l = new THREE.PointLight(color, intensity, dist, 2); l.position.set(x, y, z); scene.add(l); return l; };
  // the floor has far more ceiling lights than a forward renderer should carry, so a fixed
  // pool of point lights moves to the fixtures nearest the camera
  const FIX = [];
  for (let x = 16; x >= -22; x -= 6) FIX.push([x, 2.3, '#f4f6ff', 9, 8]);
  FIX.push([15.2, -1.5, '#eef6ff', 14, 9]);
  CORE.forEach(r => FIX.push([(r.x0 + r.x1) / 2, -1.5, r.n === '值班室' ? '#ffcf9a' : '#fff1dc', r.n === '值班室' ? 2.5 : 4.5, 6]));
  ROOMS.forEach(r => FIX.push([r.x0 + 1.75, r.front ? 7.2 : -10.2, '#7d95d6', 3.2, 7.5]));
  const pool = Array.from({ length: 7 }, () => point('#ffffff', 0, 8, 0, 2.7, 0));
  let poolAt = null;
  let poolDim = 1;
  function updateLights(target) {
    const dim = S.t >= PACE.lightsOut ? 0.55 : 1;  // first called after S exists (updateCamera at the end of boot)
    if (poolAt && poolAt.distanceToSquared(target) < 1 && dim === poolDim) return;
    poolAt = (poolAt || new THREE.Vector3()).copy(target); poolDim = dim;
    const near = FIX.map(f => [f, (f[0] - target.x) ** 2 + (f[1] - target.z) ** 2]).sort((a, b) => a[1] - b[1]);
    pool.forEach((l, i) => { const f = near[i][0]; l.position.set(f[0], 2.7, f[1]); l.color.set(f[2]); l.intensity = f[3] * (f[2] === '#7d95d6' ? 1 : dim); l.distance = f[4]; });
  }
  point('#ffc27a', 5, 4, -11.95, 1.1, -3.45); // the on-call desk lamp
  // two roaming alarm lights follow the most urgent red and amber beds, so the light count stays fixed
  const alarmRed = point('#ff2d2d', 0, 4.5, 0, 1.9, 7.6), alarmAmber = point('#ffae3d', 0, 3.5, 0, 1.9, 7.6);

  flushKit();
  // Everything that never moves, changes material or hides is baked into one mesh per material:
  // a few hundred draw calls become a few dozen, which is what an integrated GPU can carry.
  function bake(keep) {
    world.updateMatrixWorld(true);
    const groups = new Map(), baked = [];
    world.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || !o.visible) return;
      for (let q = o; q && q !== world; q = q.parent) if (keep.has(q) || q.userData.person || !q.visible) return;
      // indexed and non-indexed geometry cannot share a merge, so they go to separate groups
      const geo = o.geometry, key = `${o.material.uuid}|${geo.index ? 'i' : 'n'}|${Object.keys(geo.attributes).sort().join()}`;
      if (!groups.has(key)) groups.set(key, { mat: o.material, geos: [] });
      groups.get(key).geos.push(geo.clone().applyMatrix4(o.matrixWorld));
      baked.push(o);
    });
    baked.forEach(o => o.parent.remove(o));
    for (const { mat, geos } of groups.values()) world.add(new THREE.Mesh(mergeGeometries(geos), mat));
  }
  bake(new Set([...Object.values(lamps), ...Object.values(monitors), bl1, sleepBlanket, bento, stationRing]));
  // only people and beds cast moon shadows; walls and props just receive them
  world.traverse(o => {
    if (!o.isMesh) return;
    const flat = !Array.isArray(o.material) && o.material.isMeshBasicMaterial;
    let person = false;
    for (let q = o; q; q = q.parent) if (q.userData.person) { person = true; break; }
    o.receiveShadow = !flat;
    o.castShadow = !flat && (person || o.isInstancedMesh);
  });

  // ---------- render pipeline ----------
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const camDir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
  const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 2 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, cam));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.86));
  composer.addPass(new OutputPass());
  let vw = 16, vh = 9;
  // render scale, lowered when the GPU cannot keep up (see frameLoop) and raised again when it can
  let quality = 1;
  function resize() {
    const r = frame.getBoundingClientRect();
    vw = Math.max(16, r.width); vh = Math.max(9, r.height);
    const dpr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, 1.75) * quality);
    renderer.setPixelRatio(dpr); renderer.setSize(vw, vh, false);
    composer.setPixelRatio(dpr); composer.setSize(vw, vh);
  }
  new ResizeObserver(resize).observe(frame);
  resize();

  const camTarget = new THREE.Vector3(0.8, 0.6, 0.2);
  let zoom = 4.9;
  function updateCamera(dt, snap) {
    const want = S.map ? new THREE.Vector3(-3.0, 0, 2.6) : new THREE.Vector3(player.position.x, 0.6, player.position.z - 0.4);
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    camTarget.lerp(want, k);
    zoom += ((S.map ? 14 : 4.9) - zoom) * (snap ? 1 : 1 - Math.exp(-dt * 5));
    cam.position.copy(camTarget).addScaledVector(camDir, 60);
    cam.lookAt(camTarget);
    const hw = zoom * vw / vh;
    cam.left = -hw; cam.right = hw; cam.top = zoom; cam.bottom = -zoom;
    cam.updateProjectionMatrix();
    const sh = S.map ? 34 : 16;
    if (moon.shadow.camera.right !== sh) { Object.assign(moon.shadow.camera, { left: -sh, right: sh, top: sh * 0.9, bottom: -sh * 0.9 }); moon.shadow.camera.updateProjectionMatrix(); }
    moon.target.position.copy(camTarget); moon.position.copy(camTarget).add(MOON);
    updateLights(camTarget);
  }

  // ---------- calls ----------
  // CASES holds every bed that can ring tonight. The patients and the corridor arrest are added
  // when the night is drawn (startPublicNight); the entries here are the small calls' scenes, for a
  // doctor who walks over anyway.
  const pickN = (list, n) => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
  const CASES = {
    // the patient was fine all along: walking over only costs sleep. The nurse is kind about it
    // (players read a smirk or a blank stare as the nurse mocking them)
    'v-new': { bed: wb('03B'), kind: 'false', level: 'amber', nurse: '怡君', short: '新病人報到', face: 'thankful',
      line: '醫師你怎麼跑來了？我電話裡說他很穩啊……他現在睡得比你還好。' },
    'v-ins': { bed: wb('08A'), kind: 'false', level: 'amber', nurse: '小雯', short: '睡不著想要安眠藥', face: 'thankful',
      line: '……醫師，他只是睡不著，你一來他更清醒了。電話講一聲就好啦。' },
    'v-iv': { bed: wb('03A'), kind: 'false', level: 'amber', nurse: '怡君', short: '點滴跑完了', face: 'thankful',
      line: '醫師，電話說「續原本的」就好了啦。不過既然你都來了，順便幫我看一下他的點滴部位好了。' },
    'v-stool': { bed: wb('08A'), kind: 'false', level: 'amber', nurse: '小雯', short: '三天沒大便', face: 'thankful',
      line: '醫師……你五點跑來看大便？電話說「給一顆軟便藥」就好了啦。' },
    'v-temp': { bed: wb('11A'), kind: 'false', level: 'amber', nurse: '佳穎', short: '體溫 37.8 度', face: 'thankful',
      line: '醫師……37.8 而已，他睡得比你還熟。我只是照規定跟你報告，你快回去躺吧。' },
    'v-bp': { bed: wb('03B'), kind: 'false', level: 'amber', nurse: '怡君', short: '早上血壓有點高', face: 'thankful',
      line: '醫師，他血壓一點點高、人好好的，我只是照規定跟你報告……快交班了，你回去躺十分鐘吧。' },
    'v-fam': { bed: wb('11A'), kind: 'false', level: 'amber', nurse: '佳穎', short: '家屬問出院時間', face: 'thankful',
      line: '醫師你怎麼親自跑來了？家屬只是想問明天幾點出院，你講一聲我轉達就好啦。' },
  };
  // the shift: handover at 17:00, the day team is back at 08:00 the next morning
  const START = 17 * 60, END = 32 * 60;
  // how fast the night happens: game minutes per real second (before PUBLIC_PACE) walking, at a
  // bed and asleep, and when the evening's fixed things happen. Slowed after playtesting on the
  // full floor, where the walk between beds alone takes ten seconds or more.
  const PACE = {
    walk: 0.45, pcase: 0.12, sleep: 3.6,
    quiet: 1.5,             // nobody waiting: the evening moves on faster
    dinnerAt: 18 * 60,      // the bento reaches the on-call room
    lightsOut: 23 * 60,     // corridor lights dim
    dinnerCut: 0.5,         // the dinner call rings when half the bento is gone, give or take
  };
  // tonight's dinner patient, set when the night is drawn (startPublicNight)
  const night = { dinner: null };
  // blood results come back this many game minutes after the draw
  const LAB_WAIT = 30;
  // everything about tonight: the clock, the doctor's needs, the calls, the counts for the summary
  const S = {
    started: false, mode: 'walk', map: false, t: START,
    energy: 82, full: 35, bladder: 20, eaten: 0, cold: false, interrupted: false, interruptAt: PACE.dinnerCut + Math.random() * 0.2, labs: [],
    calls: {}, current: null, ended: false, paused: false,
    pgy: 'm', shift: 'normal',
    stats: { callsIn: 0, wakeups: 0, sleptMin: 0, wentFine: 0, phoned: 0, ignoredFine: 0, unanswered: 0, worsened: 0 },
    sleepStart: 0, nextCallAt: Infinity, call: null,
  };
  // the portraits: placeholders drawn by tools/make-placeholders.mjs. Put your own art in
  // assets/game/char/ under the same names; if it is .png, change .svg here and in index.html
  const IMG = n => `assets/game/char/${n}.svg`;
  const ME = e => IMG(`pgy_${S.pgy}_${e}`);
  const activeIds = () => Object.keys(S.calls).filter(id => S.calls[id].state === 'active');
  const preload = () => ['worried', 'panic', 'relieved', 'annoyed', 'thankful', 'sleepy', 'caring', 'stern', 'holding_laugh', 'shocked']
    .map(e => `nurse_${e}`)
    .concat(['nervous', 'sleepy', 'eating', 'scolded', 'confident', 'survived'].map(e => `pgy_${S.pgy}_${e}`))
    .forEach(n => { const i = new Image(); i.src = IMG(n); });

  // ---------- markers ----------
  const marks = $('marks');
  const mk = (cls, html) => { const d = document.createElement('div'); d.className = `mk ${cls}`; d.innerHTML = html; marks.appendChild(d); return d; };
  const caseMarks = {}, edges = {};
  function markFor(id) {
    if (!caseMarks[id]) {
      const c = CASES[id];
      caseMarks[id] = mk(c.level, `<span class="bang">!</span><span class="lbl">${c.bed}</span>`);
      const d = document.createElement('div'); d.className = `edge ${c.level}`; d.innerHTML = `<i></i>${c.bed}`; d.hidden = true; marks.appendChild(d); edges[id] = d;
    }
    return caseMarks[id];
  }
  const bedTags = BEDS.map(b => ({ b, el: mk('tag dimlbl', `<span class="lbl">${b.id}</span>`) }));
  // room numbers by each door: the front row's own plaques face away from the camera
  const roomTags = ROOMS.map(r => ({ p: new THREE.Vector3(r.x0 + 2.85, 1.45, ZFC), el: mk('tag', `<span class="lbl">${r.n}</span>`) }));
  const placeTags = [
    { p: new THREE.Vector3(15.2, 2.9, -1.5), el: mk('tag', '<span class="lbl">護理站</span>') },
    { p: new THREE.Vector3(-13.6, 1.6, -1.2), el: mk('tag', '<span class="lbl">值班室</span>') },
    { p: new THREE.Vector3(-16.0, 1.3, -2.95), el: mk('tag dimlbl', '<span class="lbl">廁所</span>'), near: 6 },
    ...CORE.filter(r => r.n !== '值班室').map(r => ({ p: new THREE.Vector3((r.x0 + r.x1) / 2, 1.4, -1.5), el: mk('tag dimlbl', `<span class="lbl">${r.n}</span>`), near: 7 })),
  ];
  const bentoTag = mk('tag', '<span class="lbl">便當</span>');
  const zzz = mk('zzz', 'Z z z'); zzz.hidden = true;
  const prompt = document.createElement('div'); prompt.className = 'mk';
  prompt.innerHTML = '<span class="prompt"><span class="key" id="promptKey">E</span><span id="promptText"></span></span>'; prompt.hidden = true; marks.appendChild(prompt);
  const v3 = new THREE.Vector3();
  const project = p => { v3.copy(p).project(cam); return v3; };
  const setPos = (el, v) => { el.style.left = `${((v.x + 1) / 2 * 100).toFixed(2)}%`; el.style.top = `${((1 - v.y) / 2 * 100).toFixed(2)}%`; };

  // ---------- HUD ----------
  const fmt = t => { const m = Math.floor(t) % 1440, h = Math.floor(m / 60), mm = m % 60; return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
  function setMeter(id, v, warnAt, badAt, invert) {
    const el = $(id); el.style.width = `${Math.max(2, Math.min(100, v))}%`;
    const bad = invert ? v > badAt : v < badAt, warn = invert ? v > warnAt : v < warnAt;
    el.className = bad ? 'bad' : warn ? 'warn' : '';
  }
  // a patient's marker is red, a small call walked to anyway amber
  const levelOf = id => S.calls[id]?.lvl || CASES[id].level;
  let hudTimer = 0, lastCallsHtml = '';
  function renderHud() {
    $('clock').textContent = fmt(S.t);
    const left = Math.max(0, END - S.t);
    $('untilHandover').textContent = `距離交班 ${Math.floor(left / 60)} 小時 ${Math.floor(left % 60)} 分`;
    setMeter('mEnergy', S.energy, 40, 20); $('tEnergy').textContent = `${Math.round(S.energy)}%`;
    setMeter('mFull', S.full, 40, 20); $('tFull').textContent = S.eaten >= 100 ? '吃飽了' : S.eaten > 0 ? `吃了 ${Math.round(S.eaten)}%` : '沒吃晚餐';
    setMeter('mBladder', S.bladder, 70, 85, true); $('tBladder').textContent = `${Math.round(S.bladder)}%`;
    const active = activeIds().sort((a, b) => (levelOf(a) === 'red' ? 0 : 1) - (levelOf(b) === 'red' ? 0 : 1) || S.calls[a].since - S.calls[b].since);
    const callsHtml = `<header>待處理的 call <b>${active.length}</b></header>` + (active.length
      ? `<ol>${active.map(id => { const c = CASES[id]; return `<li class="${levelOf(id)}"><b>${c.bed}</b><span>${c.short}</span><time>${Math.max(0, Math.round(S.t - S.calls[id].since))} 分鐘前 · 護理師${c.nurse}</time></li>`; }).join('')}</ol>`
      : '<p class="empty">目前沒有人找你。</p>')
      + (S.labs.some(l => !l.seen) ? `<header class="labhead">檢驗</header><ol class="labs">${S.labs.map((l, i) => (l.seen ? '' : l.ready
        ? `<li class="lab ready" data-lab="${i}"><b>${l.bed}</b><span>檢驗報告出來了</span><time>點一下查看</time></li>`
        : `<li class="lab"><b>${l.bed}</b><span>抽血送檢中</span><time>約 ${Math.max(1, Math.ceil(l.readyAt - S.t))} 分鐘後出來</time></li>`)).join('')}</ol>` : '');
    // rebuilt only when it changes, so a lab result is still there when the click lands
    if (callsHtml !== lastCallsHtml) { lastCallsHtml = callsHtml; $('calls').innerHTML = callsHtml; }
    $('goal').innerHTML = goalText();
  }
  function goalText() {
    if (S.mode === 'sleep' || S.mode === 'scall') return '睡覺中……按 <b>E</b> 起床';
    if (S.mode === 'eat') return '吃飯中…能吃幾口算幾口';
    if (S.mode === 'toilet') return '上廁所中…';
    const active = activeIds();
    const red = active.find(id => levelOf(id) === 'red');
    if (red) return `先去 <b>${CASES[red].bed}</b>：${CASES[red].short}`;
    if (S.energy < TIRED) return '精力不到 20%，跑不動了。快去<b>值班室</b>躺一下，歸零就會累倒';
    if (active.length) return `再去 <b>${CASES[active[0]].bed}</b>：${CASES[active[0]].short}`;
    if (S.bladder >= 85) return '快憋不住了，去<b>值班室</b>的廁所';
    if (S.eaten < 100) return S.eaten > 0 ? '便當還沒吃完，回<b>值班室</b>把它吃掉（已經涼了）' : '趁現在沒人 call，去<b>值班室</b>吃便當';
    if (S.energy < 70) return '精力快沒了，去<b>值班室</b>的床上躺一下';
    return '病房暫時安靜了，去<b>值班室</b>躺一下吧，08:00 白班才會來接手';
  }
  let toastTimer = 0;
  function toast(text, secs = 4, avatar) {
    $('toastText').innerHTML = text;
    const av = $('toastAvatar');
    if (avatar) { av.style.backgroundImage = `url(${IMG(avatar)})`; av.hidden = false; $('toast').classList.add('soft'); }
    else { av.hidden = true; $('toast').classList.remove('soft'); }
    $('toast').hidden = false; toastTimer = secs;
  }

  // ---------- interactions ----------
  function nearest() {
    if (S.mode !== 'walk') return null;
    const p = player.position;
    let best = null, bd = 1e9;
    for (const id of activeIds()) {
      const c = CASES[id], [tx, tz] = SPOT.touch(BED[c.bed]), d = Math.hypot(p.x - tx, p.z - tz);
      if (d < 1.6 && d < bd) {
        bd = d;
        best = { kind: 'case', id, key: 'E', label: `看病人（${c.bed}）` };
      }
    }
    if (S.eaten < 100 && S.t >= PACE.dinnerAt) { const d = Math.hypot(p.x - ONCALL.eatAt[0], p.z - ONCALL.eatAt[1]); if (d < 1.3 && d < bd) { bd = d; best = { kind: 'eat', key: 'E', label: S.eaten > 0 ? '把便當吃完' : '吃便當' }; } }
    if (S.bladder > 15) { const d = Math.hypot(p.x - ONCALL.toiletAt[0], p.z - ONCALL.toiletAt[1]); if (d < 0.9 && d < bd) { bd = d; best = { kind: 'toilet', key: 'E', label: '上廁所' }; } }
    // the bed takes the doctor however full the bar is: sleep no longer ends when it fills
    {
      const [x0, z0, x1, z1] = ONCALL.bed, d = Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(z0 - p.z, 0, p.z - z1));
      if (d < 0.95 && d < bd) { bd = d; best = { kind: 'sleep', key: 'E', label: '躺一下' }; }
    }
    if (!best) {
      let td = 1e9;
      for (const t of talkers()) {
        const d = Math.hypot(p.x - t.obj.position.x, p.z - t.obj.position.z);
        if (d < t.reach && d < td) { td = d; best = { kind: 'chat', key: 'E', label: `跟${t.name || CHATTER[t.key].name}聊聊`, talker: t }; }
      }
    }
    return best;
  }

  function act() {
    if (!S.started || S.ended) return;
    if (S.mode === 'walk') {
      const n = nearest(); if (!n) return;
      if (n.kind === 'case') openCase(n.id);
      else if (n.kind === 'eat') startEat();
      else if (n.kind === 'sleep') startSleep();
      else if (n.kind === 'toilet') useToilet();
      else if (n.kind === 'chat') openChat(n.talker);
      return;
    }
    if (S.mode === 'eat') { stopEat('先不吃了，便當放著。'); return; }
    if (S.mode === 'sleep') { stopSleep('自己醒來了。'); return; }
    if (S.mode === 'false') closeScripted();
    if (S.mode === 'chat') closeChat();
  }
  function spawnCase(id, late = 0) {
    const c = CASES[id];
    S.calls[id] = { state: 'active', since: S.t - late };
    ensureNurse(c.bed).userData.chatName = c.nurse; markFor(id);
    if (TEX[c.bed] && monitors[c.bed]) { monitors[c.bed].material.map = TEX[c.bed][0]; monitors[c.bed].material.needsUpdate = true; }
  }
  function resolve(id, stable = true) {
    const c = CASES[id], call = S.calls[id];
    if (call.state === 'done') return;
    call.state = 'done'; call.at = S.t; call.stable = stable;
    lamps[c.bed].material = lampOff;
    if (stable && TEX[c.bed] && monitors[c.bed]) { monitors[c.bed].material.map = TEX[c.bed][1]; monitors[c.bed].material.needsUpdate = true; }
    const m = markFor(id); m.className = 'mk done'; m.innerHTML = `<span class="bang">${stable ? '✓' : '…'}</span>`;
    call.flashUntil = performance.now() + 2500;
  }

  // a bed: a small call walked to anyway plays a short scene; a patient opens the choices
  function openCase(id) {
    if (CASES[id].kind === 'false') openScripted(id);
    else openPublicCase(id);
  }
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  // a nurse rings again for a patient nobody came to: wakes the doctor, puts the bento down
  function ring(c, face, text, note) {
    if (S.mode === 'sleep') { stopSleep(); S.stats.wakeups++; }
    if (S.mode === 'eat') stopEat();
    S.mode = 'recall'; prompt.hidden = true;
    $('recallPic').src = IMG(`nurse_${face}`);
    $('recallMe').src = ME('nervous');
    $('recallBed').textContent = `${c.bed} · 護理師${c.nurse}`;
    $('recallText').textContent = `醫師！${c.bed} ${text}`;
    $('recallNote').textContent = note;
    $('recall').hidden = false;
  }
  $('recallGo').addEventListener('click', () => {
    $('recall').hidden = true;
    S.mode = 'walk'; frame.focus();
  });

  // calls that were fine all along: a short scripted exchange
  function openScripted(id) {
    const c = CASES[id];
    S.mode = 'false'; S.current = id; prompt.hidden = true;
    $('dPortrait').src = IMG(`nurse_${c.face}`);
    $('dSpeaker').textContent = `護理師 ${c.nurse}`;
    $('dLine').innerHTML = c.line;
    $('dMe').src = ME('sleepy');
    $('dialog').hidden = false;
    S.stats.wentFine++;
    resolve(id, true);
  }
  function closeScripted() {
    $('dialog').hidden = true; S.mode = 'walk'; S.current = null; frame.focus();
    toast(S.t >= PACE.lightsOut ? '白跑一趟……回值班室躺著吧。' : '白跑一趟。電話交代就好的事，其實不用跑。', 3);
  }
  $('dBack').addEventListener('click', () => (S.mode === 'chat' ? closeChat() : closeScripted()));

  // ---------- small talk ----------
  // E beside anyone on the ward. A line fits the hour and the doctor (hungry, worn out, bursting);
  // a gift (a snack, a coffee) is given once a night; lines do not repeat until all have been said.
  const DBACK = $('dBack').innerHTML, said = {};
  let talking = null;
  function talkers() {
    const beds = Object.entries(nurseByBed).filter(([bed, n]) => n.visible && n.userData.chatName && !activeIds().some(id => CASES[id].bed === bed))
      .map(([bed, n]) => ({ key: 'bed', id: `bed-${bed}`, name: n.userData.chatName, obj: n, reach: 1.3 }));
    return [...TALKERS.filter(t => t.obj.visible), ...beds];
  }
  function openChat(t) {
    const who = CHATTER[t.key], id = t.id || t.key, name = t.name || who.name;
    const s = { evening: S.t < 23 * 60, night: S.t >= 23 * 60 && S.t < 29 * 60, dawn: S.t >= 29 * 60,
      hungry: S.eaten < 100 && S.t >= PACE.dinnerAt, tired: S.energy < 45, needLoo: S.bladder >= 70 };
    S.gifts = S.gifts || {};
    const heard = (said[id] = said[id] || new Set());
    let fit = who.lines.map((l, i) => [l, i]).filter(([l]) => (!l.when || l.when(s)) && !(l.gift && S.gifts[id]));
    if (!fit.length) fit = [[who.lines[0], 0]];
    if (fit.every(([, i]) => heard.has(i))) fit.forEach(([, i]) => heard.delete(i));
    const fresh = fit.filter(([, i]) => !heard.has(i)), first = fresh.filter(([l]) => l.pri);
    const [line, i] = pickN(first.length ? first : fresh, 1)[0];
    heard.add(i);
    talking = t; S.mode = 'chat'; S.current = null; prompt.hidden = true; keys.clear();
    // a walker stops and turns to the doctor; the doctor turns to them
    const o = t.obj, p = player.position;
    if (t.walker) { t.walker.wait = 1e9; o.rotation.y = Math.atan2(p.x - o.position.x, p.z - o.position.z); }
    player.rotation.y = Math.atan2(o.position.x - p.x, o.position.z - p.z);
    $('dPortrait').closest('figure').hidden = !who.faces.length;
    if (who.faces.length) $('dPortrait').src = IMG(pickN(who.faces, 1)[0]);
    $('dSpeaker').textContent = `${who.role} ${name}`;
    $('dLine').textContent = line.text;
    $('dMe').src = ME(S.energy < 45 ? 'sleepy' : 'neutral');
    $('dBack').innerHTML = '嗯，謝謝 <span class="key">E</span>';
    $('dialog').hidden = false;
    const g = line.gift;
    if (g) {
      S.gifts[id] = true;
      S.full = Math.min(100, S.full + (g.full || 0)); S.energy = Math.min(100, S.energy + (g.energy || 0)); S.bladder = Math.min(100, S.bladder + (g.bladder || 0));
      toast(g.toast, 3.5, who.faces[0]);
    }
  }
  function closeChat() {
    $('dialog').hidden = true; $('dPortrait').closest('figure').hidden = false; $('dBack').innerHTML = DBACK;
    if (talking?.walker) talking.walker.wait = 0.6 + Math.random();
    talking = null; S.mode = 'walk'; S.t += 2; frame.focus();
  }
  // ---------- eating ----------
  function startEat() {
    S.mode = 'eat'; prompt.hidden = true;
    player.visible = false; playerSit.visible = true;
    $('eatMe').src = ME('eating');
    $('eatTitle').textContent = S.cold ? '排骨便當 · 涼掉了' : '排骨便當 · 還溫的';
    $('eat').hidden = false;
  }
  function stopEat(msg) {
    S.mode = 'walk'; $('eat').hidden = true;
    playerSit.visible = false; player.visible = true; place(player, ...ONCALL.stand, 0);
    if (msg) toast(msg, 2.5);
  }
  function spawnDinnerCall(late) {
    const id = night.dinner;
    S.stats.callsIn++; spawnCase(id, late ? 6 : 0);
    S.calls[id].said = publicText(id).replace(/^醫師[！，]\S+ (?:的)?/, ''); S.calls[id].saidAt = S.t;
    plog(`電話：${CASES[id].bed} ${CASES[id].short}（便當吃到一半）`, 'warn');
  }
  $('iGo').addEventListener('click', () => { $('interrupt').hidden = true; S.cold = true; stopEat(); spawnDinnerCall(false); toast(`${CASES[night.dinner].bed} ${CASES[night.dinner].short}，快去！`, 3); frame.focus(); });
  $('iBite').addEventListener('click', () => {
    $('interrupt').hidden = true; S.eaten = Math.min(100, S.eaten + 15); S.energy = Math.min(100, S.energy + 5); S.full = Math.max(S.full, 12 + S.eaten * 0.85); S.cold = true;
    stopEat(); spawnDinnerCall(true); toast('護理師又打來了：「醫師你人呢？！」', 3.5); frame.focus();
  });

  // ---------- lab results ----------
  // Blood drawn at a bed comes back LAB_WAIT game minutes later. The results sit in the call list
  // (and behind the bed's 檢驗報告 button) until the doctor opens them.
  function labsArrive() {
    for (const lab of S.labs) {
      if (lab.ready || S.t < lab.readyAt) continue;
      lab.ready = true;
      toast(`${lab.bed} 的檢驗報告出來了${S.mode === 'pcase' ? '，按右上角「檢驗報告」查看' : '，在 call 欄點一下查看'}。`, 4);
    }
    publicLabButton();
  }
  function openLab(i) {
    const lab = S.labs[i];
    if (!lab || !lab.ready) return;
    lab.seen = true;
    $('glabTitle').textContent = `${lab.bed} 床`;
    $('glabWhen').textContent = `${fmt(lab.at)} 抽血 · ${fmt(lab.readyAt)} 回報`;
    const tbody = $('glabRows'); tbody.replaceChildren();
    let group = '';
    for (const r of lab.rows) {
      if (r.group !== group) { group = r.group; tbody.insertAdjacentHTML('beforeend', `<tr class="lab-group"><th colspan="4">${esc(group)}</th></tr>`); }
      const value = typeof r.value === 'number' ? String(Math.round(r.value * 1000) / 1000) : r.value;
      tbody.insertAdjacentHTML('beforeend', `<tr class="${r.flag ? `lab-flag-${r.flag.toLowerCase()}` : ''}"><td>${esc(r.label)}</td><td>${esc(value)}${r.flag ? ` ${r.flag}` : ''}</td><td>${esc(r.unit)}</td><td>${esc(r.ref ?? '')}</td></tr>`);
    }
    // each sheet comes with what the numbers mean (the bed's labs.note in public-cases.js)
    $('glabNote').hidden = !lab.note; $('glabNote').textContent = lab.note || '';
    $('glab').hidden = false;
    if (S.mode === 'walk') S.mode = 'lab';
    publicLabButton(); renderHud();
  }
  function closeLab() {
    $('glab').hidden = true;
    if (S.mode === 'lab') S.mode = 'walk';
    frame.focus();
  }
  $('glabClose').addEventListener('click', closeLab);
  $('calls').addEventListener('pointerdown', e => { const li = e.target.closest('[data-lab]'); if (li) openLab(Number(li.dataset.lab)); });

  // ---------- the toilet ----------
  function useToilet() {
    S.mode = 'toilet'; prompt.hidden = true; player.visible = false;
    toast('上廁所中……', 2);
    setTimeout(() => {
      if (S.mode !== 'toilet') return;
      S.bladder = 0; S.mode = 'walk'; player.visible = true;
      place(player, -14.6, -2.6, Math.PI / 2);
      toast('上完廁所，舒服多了。', 2.5);
    }, 2200);
  }

  // ---------- sleeping and the calls that wake you ----------
  function startSleep() {
    S.mode = 'sleep'; prompt.hidden = true;
    place(player, ...ONCALL.wake, 0); player.visible = false;
    sleepers[S.pgy].visible = true; bl1.visible = false; sleepBlanket.visible = true;
    S.sleepStart = S.t; S.fullNoted = S.energy >= 100;
    $('sleepMe').src = ME('sleepy');
    // lying down after lights out: the night's next call is never far off
    if (S.pq?.length && S.t >= S.nightAt) S.nextCallAt = Math.min(S.nextCallAt, S.t + 20 + Math.random() * 15);
    $('sleep').hidden = false;
  }
  function stopSleep(msg) {
    S.mode = 'walk'; $('sleep').hidden = true;
    sleepers[S.pgy].visible = false; bl1.visible = true; sleepBlanket.visible = false;
    player.visible = true; place(player, ...ONCALL.wake, 0);
    if (msg) toast(msg, 2.5);
  }
  // every call card has the same three answers (see publicAnswer)
  $('scGo').addEventListener('click', () => { if (!$('scall').hidden) publicAnswer('go'); });
  $('scPhone').addEventListener('click', () => { if (!$('scall').hidden) publicAnswer('phone'); });
  $('scSleep').addEventListener('click', () => { if (!$('scall').hidden) publicAnswer('sleep'); });

  // ---------- the night's patients ----------
  // 17:00 to 08:00, for someone who has never been on call. A few patients a night, in a random
  // order: one interrupts dinner, the others ring through the evening and the night. Between them
  // the phone rings for things that need nobody at the bed -- the point is what it is like to be
  // woken for each of them anyway. A call answered but left waiting too long rings again, worse.
  // Each bed is a short script of choices (public-cases.js): the wrong choices make the patient
  // worse, enough of them stop his heart (or, for a stroke, cost him the window), and chest
  // compressions to the beat are the last chance.
  const PCASE = Object.fromEntries(PUBLIC_CASES.map(c => [c.id, c]));
  // order: the shuffled choices of the question on screen (orderFor), by position on screen
  const PC = { id: null, step: null, state: 'start', extra: null, danger: 0, off: new Set(), log: [], warned: false, cpr: null, done: false, outcome: null, snap: null, order: null, orderFor: null };
  const plog = (text, kind = '') => S.plog.push({ t: S.t, text, kind });
  const publicText = id => PCASE[id].call.replace('{bed}', CASES[id].bed);
  // A patient's call looks like any other call: the same three answers, 電話交代 included, and
  // the same faces on the card. Only what the nurse says tells them apart -- the point of the night.
  const realCall = c => ({ id: c.id, caseId: c.id, urgent: true, short: c.short, bed: c.bed, text: c.call, phone: c.phone });
  // the night's phone queue waits for lights out; a call put off rings again sooner
  const nextPublicCall = () => { S.nextCallAt = S.pq.length ? Math.max(S.nightAt, S.t + 30 + Math.random() * 20) : Infinity; };
  function groggy() { frame.classList.remove('groggy'); void frame.offsetWidth; frame.classList.add('groggy'); }
  // on a touch screen the controls are the stick and the buttons on it, so say those instead of keys
  if (matchMedia('(pointer: coarse)').matches) {
    $('gKeys').innerHTML = '<dt><span class="key">搖桿</span></dt><dd>左下角：大拇指在哪裡按下，搖桿就跟到哪裡；往任何方向滑就會走，推到底用跑的</dd>'
      + '<dt><span class="key">E</span></dt><dd>右下角：看病人、吃便當、上床睡覺、上廁所（走近就會出現提示）</dd>'
      + '<dt><span class="key">床邊</span></dt><dd>在床邊直接點你要做的事</dd>'
      + '<dt><span class="key">右上</span></dt><dd>暫停、全景（看整層樓）、交班</dd>';
    document.querySelector('#brief .bkeys').innerHTML = '<div><span class="key">搖桿</span>走路，推到底跑</div><div><span class="key">E</span>看病人、吃、睡、廁所</div>'
      + '<div class="wide"><span class="key">床邊</span>點選項；心跳停了，照節拍點「壓胸」</div>'
      + '<div class="wide"><span class="key">右上</span>暫停、全景（看整層樓）、交班</div>';
  }
  // When tonight's patients ring. 普通班 wants four to six of them, 大爛班 six to eight, never more
  // than PUBLIC_CASES holds. The slots fill in this order, so even a bank of two beds has one at
  // dinner and one in the dead of night; with more beds the night gets busier. `dark` slots are
  // after lights out (23:30) and are the only ones a bed marked `night: true` (its call says 半夜)
  // can take; `at` is the window it rings in, in minutes from midnight (25 * 60 is 01:00). The
  // dinner patient rings when half the bento is gone (or at 19:00, for a doctor who never sat
  // down to it), and `late` rings after lights out, behind two small calls (see pq).
  const NIGHT_SLOTS = [
    { name: 'dinner', seq: 1 },
    { name: 'deep', seq: 6, dark: true, at: [27 * 60, 28 * 60 + 30] },
    { name: 'early', seq: 0, at: [17 * 60 + 55, 18 * 60 + 30] },
    { name: 'late', seq: 4, dark: true },
    { name: 'morning', seq: 7, at: [29 * 60 + 30, 31 * 60] },
    { name: 'evening', seq: 2, at: [19 * 60 + 20, 20 * 60 + 30] },
    { name: 'more', seq: 3, at: [22 * 60 + 30, 23 * 60 + 10] },
    { name: 'more', seq: 5, dark: true, at: [25 * 60, 25 * 60 + 50] },
  ];
  // 17:00, once the doctor has read the handover: draw the night
  function startPublicNight() {
    PUBLIC_CASES.forEach(c => { CASES[c.id] = { bed: wb(c.bed), kind: 'public', level: 'red', nurse: c.nurse, short: c.short }; });
    const want = (S.shift === 'hard' ? 6 : 4) + Math.floor(Math.random() * 3);
    // each slot takes a bed it can ring at, in a random order; a dark slot takes a 半夜 bed first
    const left = pickN(PUBLIC_CASES, PUBLIC_CASES.length), filled = [];
    for (const slot of NIGHT_SLOTS) {
      if (filled.length >= want) break;
      const fits = left.filter(c => slot.dark || !c.night);
      const c = (slot.dark && fits.find(x => x.night)) || fits[0];
      if (!c) continue;
      left.splice(left.indexOf(c), 1);
      filled.push({ ...slot, c });
    }
    const of = name => filled.find(f => f.name === name)?.c;
    // tonight's beds in the order they ring, for the summary
    const tonight = [...filled].sort((a, b) => a.seq - b.seq).map(f => f.c);
    night.dinner = of('dinner')?.id || null;
    if (!night.dinner) S.interrupted = true;   // no dinner patient: the bento is eaten in peace
    const day = pickN(PUBLIC_CALLS.filter(c => !c.night), 2), dark = pickN(PUBLIC_CALLS.filter(c => !day.includes(c)), 2);
    const between = (a, b) => a + Math.random() * (b - a);
    Object.assign(S, { plog: [], late: {}, outcome: {}, pretries: 0, trivial: 0, tonight,
      nightAt: 23 * 60 + 30 + Math.random() * 30,
      pschedule: [
        // two small things in the evening
        { at: between(17 * 60 + 30, 17 * 60 + 50), item: day[0] },
        { at: between(21 * 60 + 10, 22 * 60 + 20), item: day[1] },
        ...filled.filter(f => f.at).map(f => ({ at: between(...f.at), item: realCall(f.c) })),
        // the dead of night, when sleep is deepest, and before the day shift: calls that need nobody
        { at: between(26 * 60 + 15, 26 * 60 + 45), item: DEEP_CALLS[0] },
        { at: between(29 * 60, 29 * 60 + 40), item: DAWN_CALLS[0] },
        { at: between(30 * 60 + 10, 30 * 60 + 50), item: DAWN_CALLS[1] },
      ].filter(e => e.item).map(e => ({ ...e, done: false })),
      // after lights out: two that need nobody, then the midnight patient
      pq: [...dark, ...(of('late') ? [realCall(of('late'))] : [])] });
    S.nextCallAt = S.nightAt;
  }
  // every frame of the night: the evening's calls by the clock, dinner, the night's calls,
  // and the nurse ringing again for a patient nobody came to
  function publicTick() {
    if (!S.pschedule || !['walk', 'sleep', 'eat'].includes(S.mode)) return;
    const due = S.pschedule.find(e => !e.done && S.t >= e.at);
    if (due) { due.done = true; publicCall(due.item); return; }
    if (S.mode === 'eat') return;
    // never sat down to the bento: the dinner patient rings anyway
    if (!S.interrupted && night.dinner && S.t >= 19 * 60 + (S.eaten > 0 ? 30 : 0)) { S.interrupted = true; publicCall(realCall(PCASE[night.dinner])); return; }
    if (S.t >= S.nextCallAt) { publicCall(S.pq.shift()); return; }
    for (const c of PUBLIC_CASES) {
      const call = S.calls[c.id];
      if (call?.state !== 'active' || call.opened || S.late[c.id] || S.t - call.since < 30) continue;
      S.late[c.id] = true; S.stats.worsened++;
      plog(`${CASES[c.id].bed} 等太久沒人來，${c.name}變差了`, 'warn');
      ring(CASES[c.id], 'panic', c.again.replace(/^醫師[！，]\{bed\} (?:的)?/, ''), '答應了要去，病人卻等太久，變差了。');
      return;
    }
  }
  function publicCall(sc) {
    if (!sc) { S.nextCallAt = Infinity; return; }
    if (S.mode === 'eat') stopEat();
    const asleep = S.mode === 'sleep';
    S.stats.callsIn++; if (asleep) { S.stats.wakeups++; S.energy = Math.max(0, S.energy - 3 * SPEND[S.shift]); groggy(); }
    S.call = { ...sc, public: true, asleep }; S.mode = 'scall';
    // one nurse face and one doctor face for every call that can be put off; only the call that
    // cannot (someone down in the corridor, a patient gone worse) looks different
    $('scPic').src = IMG(`nurse_${sc.forced ? sc.face : 'neutral'}`); $('scallMe').src = ME(sc.forced ? 'nervous' : asleep ? 'sleepy' : 'neutral');
    $('scWhen').textContent = asleep ? `${fmt(S.t)} · 你才睡了 ${Math.round(S.t - S.sleepStart)} 分鐘` : fmt(S.t);
    $('scText').textContent = sc.text.replace('{bed}', wb(sc.bed));
    $('scGo').textContent = sc.forced ? '馬上過去' : asleep ? '起床去看' : '過去看看';
    $('scPhone').hidden = !sc.phone || !!sc.forced; $('scPhone').textContent = sc.phone ? `電話交代：${sc.phone}` : '';
    $('scSleep').hidden = !!sc.forced; $('scSleep').textContent = asleep ? '繼續睡' : '先不管';
    $('scNote').textContent = sc.note || (sc.forced ? '這通不能不接。' : '是小事，還是真的危險？只能從護理師說的話判斷。');
    $('scall').hidden = false;
    plog(`電話：${wb(sc.bed)} ${sc.short}`, sc.urgent ? 'warn' : '');
  }
  // back where the call found you; a doctor going back to sleep starts counting again
  const backFromCall = sc => { if (sc.asleep) { S.mode = 'sleep'; S.sleepStart = S.t; } else S.mode = 'walk'; };
  function publicAnswer(how) {
    const sc = S.call; $('scall').hidden = true; frame.focus();
    if (sc.urgent) {
      const c = PCASE[sc.caseId];
      // handled by phone or put off: nobody comes, the patient gets worse, and the nurse's second
      // call says why this one needed the doctor at the bed
      if (how !== 'go') {
        plog(how === 'phone' ? `你：電話交代：${sc.phone}` : sc.asleep ? '你：繼續睡' : '你：先不管', 'bad');
        S.late[c.id] = true;
        S.pq.unshift({ id: `again-${c.id}`, caseId: c.id, urgent: true, forced: true, short: `${c.name}變差了`, bed: c.bed, face: 'panic', text: c.again, note: c.callWhy });
        S.nextCallAt = S.t + (how === 'phone' ? 10 : 8);
        backFromCall(sc);
        if (how === 'phone') toast(`${c.nurse}：「好……那我先這樣做，有變化再打給你。」`, 3, 'nurse_worried');
        else toast(sc.asleep ? '你翻個身，想說再瞇五分鐘就好……' : '你想說手邊的事先做完……', 3);
        return;
      }
      plog('你：馬上過去', 'best');
      if (sc.asleep) stopSleep(); else S.mode = 'walk';
      if (!S.calls[c.id]) spawnCase(c.id);
      S.calls[c.id].said = sc.text.replace(/^醫師[！，]\{bed\} (?:的)?/, ''); S.calls[c.id].saidAt = S.t;
      nextPublicCall();
      toast(`往 ${CASES[c.id].bed} 跑！`, 2.5);
      return;
    }
    S.trivial++;
    if (how === 'go') {
      plog(sc.asleep ? '你：起床去看' : '你：過去看看', 'ok');
      if (sc.asleep) stopSleep(); else S.mode = 'walk';
      spawnCase(sc.visit);
      toast(`往 ${wb(sc.bed)} 走。`, 2.5);
    } else if (how === 'phone') {
      S.stats.phoned++; plog('你：電話交代', 'best');
      backFromCall(sc);
      toast(sc.phoneReply, 3, 'nurse_thankful');
      if (sc.asleep) setTimeout(() => { if (S.mode === 'sleep') toast(pickN(AFTER_PHONE, 1)[0], 4); }, 3200);
    } else {
      if (sc.need === 'none') S.stats.ignoredFine++; else S.stats.unanswered++;
      plog(sc.asleep ? '你：繼續睡' : '你：先不管', sc.need === 'none' ? 'best' : 'ok');
      backFromCall(sc);
      toast(sc.sleepNote, 4);
    }
    nextPublicCall();
  }

  // the bed
  const say = (cls, text) => PC.log.push({ cls, text });
  const C = () => PCASE[PC.id];
  function openPublicCase(id) {
    const c = CASES[id];
    S.mode = 'pcase'; S.current = id; prompt.hidden = true; keys.clear();
    S.calls[id].opened = true;
    document.body.classList.add('at-bedside');
    place(player, ...SPOT.approach(BED[c.bed]), Math.PI);
    if (PC.id !== id || !PC.step) startPublicCase(id);
    $('pcBed').textContent = c.bed; $('pcWho').textContent = PCASE[id].who; $('pcSub').textContent = `護理師${c.nurse}在旁邊等你決定`;
    $('pcase').hidden = false;
    renderPublicCase();
    frame.focus();
  }
  function startPublicCase(id) {
    const c = PCASE[id], late = !!S.late[id];
    // 「從這一床重來」 comes back to this moment
    if (PC.id !== id || !PC.snap) PC.snap = { t: S.t, energy: S.energy, plog: S.plog.length };
    Object.assign(PC, { id, step: 'first', state: late ? c.late : 'start', extra: null, danger: late ? 2 : 0, off: new Set(), log: [], orderFor: null,
      warned: late && c.late === c.warn.state, cpr: null, done: false, outcome: null });
    say(late ? 'alarm' : 'nurse', `${c.nurse}：「${late ? c.introLate : c.intro}」`);
    plog(`到 ${CASES[id].bed} ${c.name}床邊`);
    $('pcNurse').src = IMG(late ? 'nurse_panic' : 'nurse_worried');
  }
  const EXTRA = { sugar: ['血糖', '還沒測'], ekg: ['心電圖', '還沒做'], breath: ['呼吸聲', '還沒聽'], urine: ['尿量', '還沒看'], skin: ['皮膚', '還沒看'],
    head: ['頭部', '還沒看'], fit: ['抽搐', '還沒計時'], temp: ['體溫', '還沒量'], rr: ['呼吸次數', '還沒數'], stool: ['大便', '還沒看'],
    rhythm: ['心律', '還沒貼 AED'] };
  function monitorHtml() {
    const c = C(), st = c.states[PC.state];
    if (st[c.extra] !== undefined) PC.extra = st[c.extra];
    const cell = (label, value, word, cls = '') => `<div class="pc-v ${cls}"><small>${label}</small><b>${value}</b><em>${word}</em></div>`;
    const hr = st.hr === 0 ? cell('心跳', '—', '摸不到', 'bad')
      : cell('心跳', st.hr, st.hr > 120 ? '很快' : st.hr > 100 ? '偏快' : st.hr < 50 ? '很慢' : '正常', st.hr > 120 || st.hr < 50 ? 'bad' : st.hr > 100 ? 'warn' : '');
    const bp = !st.bp ? cell('血壓', '—', '量不到', 'bad')
      : cell('血壓', `${st.bp[0]}/${st.bp[1]}`, st.bp[0] < 90 ? '偏低' : st.bp[0] >= 180 ? '很高' : st.bp[0] >= 140 ? '偏高' : '正常', st.bp[0] < 90 || st.bp[0] >= 180 ? 'bad' : st.bp[0] >= 140 ? 'warn' : '');
    const sp = st.spo2 == null ? cell('血氧', '—', '測不到', 'bad')
      : cell('血氧', `${st.spo2}%`, st.spo2 < 90 ? '很低' : st.spo2 < 95 ? '偏低' : '正常', st.spo2 < 90 ? 'bad' : st.spo2 < 95 ? 'warn' : '');
    const v = PC.extra, [label, none] = EXTRA[c.extra];
    const ex = v == null ? cell(label, '?', none, 'na txt')
      : c.extra === 'sugar' ? cell(label, v, v < 70 ? '太低' : v > 180 ? '偏高' : '正常', v < 70 ? 'bad' : v > 180 ? 'warn' : '')
      : cell(label, esc(v), '', `txt ${c.extraOk?.includes(v) ? '' : c.extraWarn?.includes(v) ? 'warn' : 'bad'}`);
    return hr + bp + sp + ex + cell('意識', esc(st.mind), '', st.calm || /^清醒(?!，但)/.test(st.mind) ? 'mind' : 'mind bad');
  }
  function renderPublicCase() {
    const c = C();
    $('pcMonitor').innerHTML = monitorHtml();
    $('pcLog').innerHTML = PC.log.map(l => `<p class="${l.cls}">${esc(l.text)}</p>`).join('');
    $('pcLog').scrollTop = $('pcLog').scrollHeight;
    $('pcCpr').hidden = !PC.cpr; $('pcAsk').hidden = !!PC.cpr;
    publicLabButton();
    if (PC.cpr) return;
    if (PC.done) {
      $('pcQ').textContent = `${c.results[PC.outcome]}。`;
      $('pcOpts').innerHTML = '<button class="btn go pc-end" type="button" data-end="back">回去繼續值班</button>';
      return;
    }
    const step = c.steps[PC.step];
    $('pcQ').textContent = (step.askBy?.[PC.state] || ([c.warn.state, c.late].includes(PC.state) && step.askWarn) || step.ask).replace('{sugar}', PC.extra ?? '');
    // the data lists the best answer first; each new question deals its choices in a fresh random
    // order, and keeps it while the question stays, so a crossed-out choice does not move
    if (PC.orderFor !== step) { PC.orderFor = step; PC.order = pickN(step.options.map((o, i) => i), step.options.length); }
    $('pcOpts').innerHTML = PC.order.map((oi, pos) => {
      const o = step.options[oi];
      return `<button class="btn pc-opt" type="button" data-i="${pos}"${PC.off.has(o.id) ? ' disabled' : ''}><span class="key">${pos + 1}</span><span>${esc(o.text)}</span></button>`;
    }).join('');
  }
  // A screen that appears under a finger still tapping the compressions -- or a key still pressing
  // them -- takes no taps for a moment: on Android the next tap landed on a choice the doctor had
  // not read yet. Held elements are dimmed and ignore pointer and keyboard alike.
  const holds = new WeakMap();
  function holdTaps(el, ms) {
    holds.set(el, performance.now() + ms);
    el.classList.add('arming');
    setTimeout(() => { if (!held(el)) el.classList.remove('arming'); }, ms + 20);
  }
  const held = el => performance.now() < (holds.get(el) || 0);
  $('pcOpts').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || held($('pcOpts'))) return;
    if (b.dataset.end === 'back') closePublicCase(); else choosePublic(Number(b.dataset.i));
  });
  $('pcPause').addEventListener('click', () => setPaused(true));
  // blood tests: one draw per bed, the numbers come back LAB_WAIT game
  // minutes later in the call list and behind this button
  function publicLabButton() {
    const lab = S.labs.find(l => l.id === PC.id), b = $('pcLab');
    b.textContent = !lab ? '抽血檢查' : lab.ready ? (lab.seen ? '檢驗報告' : '檢驗報告（新）') : `報告約 ${Math.max(1, Math.ceil(lab.readyAt - S.t))} 分鐘後`;
    b.classList.toggle('go', !lab || lab.ready);
  }
  $('pcLab').addEventListener('click', () => {
    if (S.mode !== 'pcase' || PC.cpr) return;
    const k = S.labs.findIndex(l => l.id === PC.id), lab = S.labs[k], c = C();
    if (lab?.ready) { openLab(k); return; }
    if (lab) { toast(`還在等報告，大約 ${Math.max(1, Math.ceil(lab.readyAt - S.t))} 分鐘後出來。`, 2.5); return; }
    say('you', '抽血送檢查'); plog('你：抽血送檢查');
    S.t += 2;
    say('nurse', `${c.nurse}：「好，我抽好送去檢驗科，報告大約 ${LAB_WAIT} 分鐘後出來，出來會通知你。」`);
    publicDraw(S.t);
    renderPublicCase();
  });
  // a bed's one blood draw, from the button above or from a choice that draws blood as part of the
  // care (draw: true in public-cases.js); the report comes LAB_WAIT minutes after the blood was taken
  function publicDraw(at) {
    const c = C();
    if (S.labs.some(l => l.id === PC.id)) return;
    S.labs.push({ id: PC.id, bed: CASES[PC.id].bed, note: c.labs.note, at, readyAt: at + LAB_WAIT, ready: false, seen: false,
      rows: c.labs.rows.map(([label, value, unit, ref, flag]) => ({ group: '抽血檢查', label, value, unit, ref, flag })) });
  }
  function closePublicCase() {
    const id = PC.id;
    $('pcase').hidden = true; document.body.classList.remove('at-bedside');
    S.mode = 'walk'; S.current = null;
    place(player, ...SPOT.leave(BED[CASES[id].bed]), Math.PI / 2);
    PC.step = null; PC.snap = null;
    frame.focus();
    // never says how many are left: the doctor does not know how many beds the night holds
    toast(S.t >= PACE.lightsOut ? '回值班室躺一下吧，能睡一點是一點。' : '這床穩住了。別忘了吃飯、上廁所。', 3);
  }
  // i is the position on screen (button or key 1–4), not the option's place in the data
  function choosePublic(i) {
    if (S.mode !== 'pcase' || PC.cpr || PC.done || held($('pcOpts'))) return;
    const c = C(), step = c.steps[PC.step], o = step?.options[PC.orderFor === step ? PC.order[i] : i];
    if (!o || PC.off.has(o.id)) return;
    say('you', o.text); plog(`你：${o.text}`, o.grade);
    const began = S.t;
    S.t += o.min || 0;
    // blood taken at the start of the choice: with a choice as long as LAB_WAIT, the report is
    // back, and announced, as the next question is asked
    if (o.draw) { publicDraw(began); labsArrive(); }
    if (o.cpr) { startCpr(); return; }
    if (o.death) { publicDeath(o.death); return; }
    if (o.say) say('nurse', o.say);
    if (o.state) PC.state = o.state;
    if (o.grade !== 'best') {
      PC.off.add(o.id);
      PC.danger += o.grade === 'ok' ? 1 : 2;
      if (o.why) say('why', o.why);
    }
    if (o.next === 'arrest' || PC.danger >= 5) { publicArrest(); return; }
    // the first warning that this is going badly (not mid-choke, which is its own question)
    if (o.grade !== 'best' && PC.danger >= 3 && !PC.warned && !o.quiet) {
      PC.warned = true; PC.state = c.warn.state;
      say('alarm', c.warn.line); plog(c.warn.log, 'warn');
      $('pcNurse').src = IMG('nurse_panic');
    }
    if (o.next === 'done') {
      PC.done = true; PC.outcome = o.outcome; S.outcome[PC.id] = o.outcome;
      resolve(PC.id, true); $('pcNurse').src = IMG('nurse_thankful');
      plog(c.results[o.outcome], 'best');
    } else if (o.next) PC.step = o.next;
    renderPublicCase();
  }
  // too far gone: the heart stops, unless this is a bed that fails another way (a stroke)
  function publicArrest() {
    const c = C();
    if (!c.steps.arrest) { publicDeath(c.fail.text, c.fail.title); return; }
    PC.state = 'arrest'; PC.step = 'arrest';
    say('alarm', c.arrestLine); plog(`${c.name}沒有呼吸心跳`, 'warn');
    $('pcNurse').src = IMG('nurse_panic');
    renderPublicCase();
  }
  // chest compressions to the beat: judged on the middle presses, so a hesitant start is forgiven
  function startCpr() {
    PC.cpr = { times: [], timer: setInterval(() => {
      const cp = PC.cpr; if (!cp || S.paused || !cp.times.length) return;
      if (performance.now() - cp.times[cp.times.length - 1] > CPR.maxGap * 1000) publicDeath('壓胸中斷太久了。CPR 一旦開始就盡量不要停，直到 AED 或急救團隊接手。');
    }, 200) };
    $('pcCount').textContent = `0 / ${CPR.presses}`; $('pcRate').textContent = '準備好就開始按';
    renderPublicCase();
  }
  function cprPress() {
    const cp = PC.cpr; if (!cp || S.paused) return;
    cp.times.push(performance.now());
    const press = $('pcPress'); press.classList.remove('hit'); void press.offsetWidth; press.classList.add('hit');
    const gaps = cp.times.slice(1).map((t, i) => t - cp.times[i]), recent = gaps.slice(-4);
    const rate = recent.length ? Math.round(60000 / (recent.reduce((a, b) => a + b, 0) / recent.length)) : 0;
    $('pcCount').textContent = `${cp.times.length} / ${CPR.presses}`;
    $('pcRate').textContent = rate ? `每分鐘 ${rate} 下 · ${rate < 100 ? '太慢' : rate > 120 ? '太快' : '剛好'}` : '';
    if (cp.times.length < CPR.presses) return;
    clearInterval(cp.timer);
    const middle = gaps.slice(2).sort((a, b) => a - b), bpm = Math.round(60000 / middle[Math.floor(middle.length / 2)]);
    PC.cpr = null;
    if (bpm < CPR.slowest) { publicDeath(`壓胸太慢了（每分鐘大約 ${bpm} 下），血液送不到腦部。要壓每分鐘 100 到 120 下。`); return; }
    if (bpm > CPR.fastest) { publicDeath(`壓胸太快了（每分鐘大約 ${bpm} 下），心臟來不及回血。要壓每分鐘 100 到 120 下。`); return; }
    const c = C();
    S.t += 2; PC.state = c.cprState; PC.step = c.cprNext; PC.danger = 3;
    say('nurse', c.cprLine); plog(`壓胸 30 下（每分鐘約 ${bpm} 下）`, 'best');
    $('pcNurse').src = IMG(c.cprState === 'arrest' ? 'nurse_panic' : 'nurse_relieved');
    renderPublicCase();
    holdTaps($('pcOpts'), 1200);
  }
  $('pcPress').addEventListener('pointerdown', e => { e.preventDefault(); cprPress(); });
  const tipHtml = c => `<b>${esc(c.card.title)}</b><ol>${c.card.points.map(p => `<li>${esc(p)}</li>`).join('')}</ol>`;
  function publicDeath(reason, title) {
    const c = C();
    if (PC.cpr) clearInterval(PC.cpr.timer);
    PC.cpr = null; S.mode = 'pdead';
    plog(title || `${c.name}沒有救回來`, 'warn');
    $('pcase').hidden = true;
    $('pdWhen').textContent = fmt(S.t);
    $('pdTitle').textContent = title || `${CASES[PC.id].bed} 的${c.name}沒有救回來`;
    $('pdText').textContent = `${reason}${title ? '' : '這是遊戲；在真實的病房裡，值班醫師可能就在某一個晚上面對這一刻。'}下面是今晚發生的事，紅色的是警訊。`;
    $('pdTimeline').innerHTML = S.plog.map(l => `<li class="${l.kind}"><time>${fmt(l.t)}</time><span>${esc(l.text)}</span></li>`).join('');
    $('pdCard').innerHTML = tipHtml(c);
    $('pdeath').hidden = false;
    // the card fades in over about 1.4 s; its buttons wait for it, and for the finger that was pressing
    holdTaps($('pdRetry').parentElement, 1500);
    $('pdRetry').focus();
  }
  $('pdRetry').addEventListener('click', () => {
    if (held($('pdRetry').parentElement)) return;
    $('pdeath').hidden = true; S.pretries++;
    S.t = PC.snap.t; S.energy = PC.snap.energy; S.plog.length = PC.snap.plog;
    S.labs = S.labs.filter(l => !(l.id === PC.id && l.at > PC.snap.t));
    PC.step = null;
    openPublicCase(PC.id);
  });
  $('pdAgain').addEventListener('click', () => { if (!held($('pdAgain').parentElement)) location.reload(); });
  // the summary's word on looking after yourself, for a doctor who went without food or held it in
  function selfCare() {
    const lines = [
      ...(S.looFull ? ['值班醫師常常一忙就憋尿，憋久了容易泌尿道感染、腎結石。再忙，也要記得上廁所。'] : []),
      ...(S.eaten <= 0 ? ['值班醫師常常忙到忘了吃飯。餓著肚子做事，精力掉得快、判斷也會變差。再忙，也要記得吃飯。'] : []),
    ];
    return lines.length ? '<li class="tiphead">照顧自己</li>' + lines.map(t => `<li class="tip">${esc(t)}</li>`).join('') : '';
  }
  function publicSummary() {
    if (S.ended) return;
    S.ended = true; S.mode = 'end';
    ['pcase', 'pdeath', 'dialog', 'sleep', 'scall', 'recall', 'eat', 'interrupt', 'glab'].forEach(id => { $(id).hidden = true; });
    document.body.classList.remove('at-bedside');
    const st = S.stats, tonight = S.tonight || [], seen = tonight.filter(c => S.outcome?.[c.id]), all = tonight.length > 0 && seen.length === tonight.length;
    // a patient whose call came but who was never stabilised by 08:00
    const left = tonight.filter(c => S.calls[c.id]?.state === 'active');
    document.querySelector('#handover .mark').textContent = `${GAME.title} · ${GAME.edition} · ${SHIFT_NAME[S.shift]}`;
    $('hStamp').hidden = S.shift !== 'hard';
    if (S.shift === 'hard') drawStamp($('hStamp'), '#cf2027');
    $('hWhen').textContent = `${fmt(S.t)} · ${S.collapsed ? '累倒了' : S.t >= END ? '白班來接手了' : '提早交班'}`;
    $('hTitle').textContent = (S.nick ? `${S.nick}醫師，` : '') + (S.collapsed ? '你累倒了' : all ? `${CN[tonight.length]}床都穩住了，你撐過這一晚`
      : left.length ? `${S.t >= END ? '天亮了，' : ''}還有 ${left.length} 床沒處理好` : seen.length ? `穩住了 ${seen.length} 床` : '今晚先到這裡');
    $('hStats').innerHTML = [
      ['睡了', Math.round(st.sleptMin), '分鐘'], ['被電話吵醒', st.wakeups, '次'], ['其實電話講就好', S.trivial || 0, '通'],
      ['白跑一趟', st.wentFine, '次'], ['穩住的病人', seen.length, `/ ${tonight.length}`], ['從床邊重來', S.pretries || 0, '次'],
    ].map(([k, v, u]) => `<div class="stat"><small>${k}</small><b>${v}<span>${u}</span></b></div>`).join('');
    const cards = tonight.filter(c => S.calls[c.id]);
    $('hCases').innerHTML = seen.map(c => `<li class="tip"><b>${CASES[c.id].bed}</b> ${esc(c.results[S.outcome[c.id]])}</li>`).join('')
      + left.map(c => `<li class="tip miss"><b>${CASES[c.id].bed}</b> ${esc(c.name)}${S.calls[c.id].opened ? '還沒處理好，就交給白班了' : '等到早上，都沒有醫師去看'}</li>`).join('')
      + cards.map(c => `<li class="tiphead">${esc(c.card.title)}</li>` + c.card.points.map(p => `<li class="tip">${esc(p)}</li>`).join('')).join('')
      + selfCare();
    $('hScore').textContent = st.wakeups;
    $('hPgy').src = ME(all && !S.collapsed ? 'survived' : 'sleepy');
    $('hBadge').textContent = `稱號：${S.collapsed ? '累倒在護理站的值班醫師' : !all ? '還在值班的人' : S.pretries ? '跌倒了再站起來的值班醫師' : '一個人撐住整層樓的值班醫師'}`;
    $('hChiefAvatar').style.backgroundImage = `url(${IMG('nurse_caring')})`;
    $('hChief').textContent = S.collapsed
      ? '你趴在護理站睡著了，怎麼叫都叫不醒，只好打電話請總值醫師來接手整層樓。值班再忙，也要找空檔吃飯、躺一下：照顧好自己，才照顧得了病人。'
      : '一晚的電話，大部分是小事。可是接起來之前，你沒辦法知道哪一通是真的危險，所以每一通都得醒來、聽完、判斷。下次在醫院看到值班醫師一臉沒睡飽，你大概知道為什麼了。';
    S.result = `我在《${GAME.title}》${GAME.edition}值了一晚${SHIFT_NAME[S.shift]}：穩住 ${seen.length}/${tonight.length} 床，被電話吵醒 ${st.wakeups} 次，其中 ${S.trivial || 0} 通其實電話講就好${S.collapsed ? `，${fmt(S.t)} 累倒了` : ''}。`;
    $('handover').hidden = false;
  }

  // ---------- ending ----------
  const endShift = () => publicSummary();
  $('hAgain').addEventListener('click', () => location.reload());
  $('hCopy').addEventListener('click', () => {
    const b = $('hCopy');
    navigator.clipboard.writeText(shareText()).then(() => { b.textContent = '已複製'; }, () => { b.textContent = '無法複製，請手動選取'; });
  });

  // ---------- sharing the night ----------
  // The summary on screen, redrawn as a story-sized card (1080×1920). A phone opens its share sheet
  // with it -- Instagram and Facebook offer their stories there; the web cannot post a story itself --
  // and a computer saves the picture instead.
  const shareUrl = () => `${location.origin}${location.pathname}`;
  const summaryStats = () => [...$('hStats').querySelectorAll('.stat')].map(el => {
    const b = el.querySelector('b'), unit = b.querySelector('span')?.textContent || '';
    return [el.querySelector('small').textContent, b.textContent.slice(0, b.textContent.length - unit.length).trim(), unit.trim()];
  });
  function shareText() {
    const badge = $('hBadge').textContent;
    return [`🌙 ${GAME.title}｜${GAME.edition}・${SHIFT_NAME[S.shift]}`, $('hWhen').textContent, $('hTitle').textContent,
      ...summaryStats().map(([k, v, u]) => `・${k} ${v}${u ? ` ${u}` : ''}`),
      badge, `你撐得過一晚嗎？👉 ${shareUrl()}`, CREDIT.text].join('\n');
  }
  // text that wraps by character, as Chinese does
  function wrapText(g, text, width) {
    const lines = []; let line = '';
    for (const ch of text) { if (g.measureText(line + ch).width > width && line) { lines.push(line); line = ch; } else line += ch; }
    if (line) lines.push(line);
    return lines;
  }
  function pill(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // 大爛班's stamp, upright on a canvas of its own: two rings and the name, in ink worn like
  // rubber (the same specks every time). The summary turns it with CSS; the share card turns it
  // as it draws it, in a brighter red for its dark background.
  function drawStamp(cv, color) {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height, r = rng(9);
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'sans-serif';
    g.clearRect(0, 0, w, h);
    g.strokeStyle = g.fillStyle = color;
    g.lineWidth = 12; pill(g, 8, 8, w - 16, h - 16, 26); g.stroke();
    g.lineWidth = 4; pill(g, 26, 26, w - 52, h - 52, 14); g.stroke();
    g.font = `900 ${Math.round(h * 0.52)}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('大爛班', w / 2, h / 2 + h * 0.03);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 420; i++) { g.globalAlpha = 0.25 + r() * 0.6; g.beginPath(); g.arc(r() * w, r() * h, 0.6 + r() * 2.6, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return cv;
  }
  async function drawShareCard() {
    const cv = $('shareCanvas'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'sans-serif';
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a1220'); bg.addColorStop(0.6, '#151c2f'); bg.addColorStop(1, '#2b1830');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W / 2, 560, 40, W / 2, 560, 560); glow.addColorStop(0, 'rgba(69, 227, 204, .22)'); glow.addColorStop(1, 'rgba(69, 227, 204, 0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, 1150);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#45e3cc'; g.font = `700 36px ${font}`; g.fillText(`${GAME.edition} · ${SHIFT_NAME[S.shift]}`, W / 2, 118);
    g.fillStyle = '#eef3f6'; g.font = `900 100px ${font}`; g.fillText(GAME.title, W / 2, 228);
    // the doctor, as on the summary
    const px = 250, py = 280, pw = 580, ph = 600, img = new Image();
    img.src = $('hPgy').src;
    try { await img.decode(); } catch { /* drawn without the portrait */ }
    g.save(); pill(g, px, py, pw, ph, 40); g.clip();
    const pg = g.createLinearGradient(0, py, 0, py + ph); pg.addColorStop(0, '#2a3e55'); pg.addColorStop(1, '#152131'); g.fillStyle = pg; g.fillRect(px, py, pw, ph);
    if (img.naturalWidth) { const k = Math.max(pw / img.naturalWidth, ph / img.naturalHeight); g.drawImage(img, px + (pw - img.naturalWidth * k) / 2, py, img.naturalWidth * k, img.naturalHeight * k); }
    g.restore();
    g.fillStyle = '#f0b45a'; g.font = `700 42px ${font}`; g.fillText($('hWhen').textContent, W / 2, 962);
    g.fillStyle = '#ffffff'; g.font = `900 66px ${font}`;
    let y = 1052;
    for (const line of wrapText(g, $('hTitle').textContent, 960).slice(0, 3)) { g.fillText(line, W / 2, y); y += 84; }
    const badge = $('hBadge').textContent.replace(/^稱號：/, '');
    g.font = `700 38px ${font}`;
    const bw = Math.min(980, g.measureText(badge).width + 84);
    y += 6; pill(g, (W - bw) / 2, y - 50, bw, 72, 36);
    g.fillStyle = 'rgba(69, 227, 204, .15)'; g.fill(); g.strokeStyle = 'rgba(69, 227, 204, .6)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#c4f6ee'; g.fillText(badge, W / 2, y); y += 96;
    const stats = summaryStats(), cols = stats.length > 6 ? 3 : 2, cw = 960 / cols;
    stats.forEach(([k, v, u], i) => {
      const cx = 60 + cw * (i % cols) + cw / 2, cy = y + Math.floor(i / cols) * 128;
      g.fillStyle = '#8fa3b6'; g.font = `600 32px ${font}`; g.fillText(k, cx, cy);
      g.font = `800 62px ${font}`; const vw = g.measureText(v).width; g.font = `600 30px ${font}`; const uw = u ? g.measureText(u).width + 10 : 0;
      g.textAlign = 'left'; g.fillStyle = '#ffffff'; g.font = `800 62px ${font}`; g.fillText(v, cx - (vw + uw) / 2, cy + 70);
      if (u) { g.fillStyle = '#8fa3b6'; g.font = `600 30px ${font}`; g.fillText(u, cx - (vw + uw) / 2 + vw + 10, cy + 70); }
      g.textAlign = 'center';
    });
    // 大爛班: the summary's stamp, slanted, in the room under the numbers (and short of the
    // closing line however many lines the title took)
    if (S.shift === 'hard') {
      const stamp = drawStamp(Object.assign(document.createElement('canvas'), { width: 460, height: 200 }), '#ff4a50');
      const below = y + Math.ceil(stats.length / cols) * 128 - 10;
      g.save(); g.translate(W / 2 + 70, Math.min(below, H - 290)); g.rotate(-12 * Math.PI / 180); g.globalAlpha = 0.92;
      g.drawImage(stamp, -184, -80, 368, 160); g.restore();
    }
    g.fillStyle = '#eef3f6'; g.font = `800 46px ${font}`; g.fillText('你撐得過一晚嗎？', W / 2, H - 150);
    g.fillStyle = '#45e3cc'; g.font = `700 38px ${font}`; g.fillText(GAME.site, W / 2, H - 92);
    // the credit line the license asks for (README.md, 授權)
    g.fillStyle = '#8fa3b6'; g.font = `500 26px ${font}`; g.fillText(CREDIT.text, W / 2, H - 46);
  }
  let shareFile = null;
  async function openShare() {
    $('share').hidden = false; $('shareGo').hidden = true; $('shareHint').textContent = '圖卡產生中……';
    await drawShareCard();
    shareFile = null;
    $('shareCanvas').toBlob(b => {
      shareFile = b && new File([b], `${GAME.title}.png`, { type: 'image/png' });
      const can = !!shareFile && !!navigator.canShare?.({ files: [shareFile] });
      $('shareGo').hidden = !can;
      $('shareHint').textContent = can ? '按「分享」，選 Instagram 或 Facebook，就能發到限時動態。'
        : '這台裝置沒有分享選單：先下載圖片，再從手機相簿分享到限時動態。';
      (can ? $('shareGo') : $('shareSave')).focus();
    }, 'image/png');
  }
  // the share sheet opens straight from the tap, with the picture made beforehand
  $('shareGo').addEventListener('click', () => { if (shareFile) navigator.share({ files: [shareFile], title: GAME.title, text: shareText() }).catch(() => {}); });
  $('shareSave').addEventListener('click', () => $('shareCanvas').toBlob(b => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${GAME.title}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png'));
  $('shareClose').addEventListener('click', () => { $('share').hidden = true; });
  $('hShare').addEventListener('click', openShare);
  $('btnEnd').addEventListener('click', () => { if (S.started) endShift(); });
  $('btnMap').addEventListener('click', () => { S.map = !S.map; frame.focus(); });

  // ---------- start ----------
  // only the nickname and the shift are kept, in this browser
  const KEYS = { name: 'oncall_template_name', shift: 'oncall_template_shift' };
  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: nothing is kept */ } },
  };
  $('gName').value = store.get(KEYS.name);
  // the credit line on the start card and the summary (README.md, 授權)
  document.querySelectorAll('.credit').forEach(el => el.replaceChildren(`${CREDIT.text} · `,
    Object.assign(document.createElement('a'), { href: CREDIT.url, target: '_blank', rel: 'noopener', textContent: new URL(CREDIT.url).host })));
  // the shift picked last time is picked again
  if (store.get(KEYS.shift) === 'hard') document.querySelector('#gShift [value="hard"]').checked = true;
  // the line under the settings only speaks when there is something to say
  const startHint = (text, err = false) => { $('gHint').hidden = false; $('gHint').textContent = text; $('gHint').classList.toggle('err', err); };
  // the missing-name note goes away as soon as there is a name
  $('gName').addEventListener('input', () => {
    if (!$('gName').value.trim() || !$('gName').hasAttribute('aria-invalid')) return;
    $('gName').removeAttribute('aria-invalid'); $('gHint').classList.remove('err'); $('gHint').hidden = true;
  });
  document.querySelectorAll('.pick [data-pgy]').forEach(b => b.addEventListener('click', () => {
    // the doctor needs a name: the handover, the calls and the summary use it
    if (!$('gName').value.trim()) {
      startHint('請先輸入暱稱，才能開始值班。', true);
      $('gName').setAttribute('aria-invalid', 'true'); $('gName').focus(); return;
    }
    goSideways();
    document.querySelectorAll('.pick button').forEach(x => { x.disabled = true; });
    S.nick = $('gName').value.trim().slice(0, 40);
    store.set(KEYS.name, S.nick);
    S.shift = document.querySelector('#gShift input:checked')?.value === 'hard' ? 'hard' : 'normal';
    store.set(KEYS.shift, S.shift);
    const k = b.dataset.pgy;
    S.pgy = k;
    players.m.visible = k === 'm'; players.f.visible = k === 'f';
    player = players[k]; playerSit = sitters[k];
    $('start').hidden = true;
    showBrief();
  }));

  // ---------- 17:00 handover ----------
  // The day team's handover lists a few quiet beds with ordinary problems, drawn at random.
  // None of them is tonight's trouble; the calls come from elsewhere. Time starts only when
  // the doctor says they are ready.
  const SURNAMES = ['王', '林', '陳', '黃', '張', '李', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '郭'];
  // a few quiet beds for the handover sheet; add more and up to five are drawn each night
  const DECOYS = [
    { who: '伯伯', age: [70, 86], dx: '腦中風復健中', lay: '今天血壓有點高，有開需要時吃的藥，晚上照常。' },
    { who: '先生', age: [42, 64], dx: '蜂窩性組織炎', lay: '打抗生素第三天，已經退燒，紅腫有消。' },
    { who: '女士', age: [30, 50], dx: '急性腸胃炎', lay: '今天開始吃粥，點滴明天可以停。' },
  ];
  function showBrief() {
    $('briefTitle').textContent = `今晚，${WARD} 交給你了`;
    $('briefEyebrow').textContent = `交班 · 熱愛 內科 ${WARD} 病房`;
    $('briefMe').src = ME('confident');
    $('briefLevel').textContent = `${S.nick ? `${S.nick}醫師` : '你'} · 今晚的值班醫師`;
    $('briefFrom').textContent = `白班 R1 ${pickN(['陳', '黃', '張', '李', '吳', '蔡'], 1)[0]}醫師 → 你`;
    const n = Math.min(5, DECOYS.length);
    const beds = pickN(BEDS.filter(b => !b.isCase && b.occupied), n).sort((a, b) => a.id.localeCompare(b.id));
    const items = pickN(DECOYS, n);
    $('briefList').innerHTML = beds.map((b, i) => {
      const d = items[i], age = d.age[0] + Math.floor(Math.random() * (d.age[1] - d.age[0] + 1));
      return `<div class="pt"><b>${b.id}</b><strong>${pickN(SURNAMES, 1)[0]}${d.who} ${age} 歲 · ${d.dx}</strong><span>${d.lay}</span></div>`;
    }).join('');
    $('briefTeam').innerHTML = [['怡君', 'nurse_neutral', '01', '04'], ['小雯', 'nurse_caring', '05', '08'], ['佳穎', 'nurse_thankful', '09', '12']]
      .map(([n, face, a, z]) => `<div class="nurse"><span class="av" style="background-image:url(${IMG(face)})"></span><b>${n}</b><small>${wb(a)} – ${wb(z)}</small></div>`).join('');
    $('brief').hidden = false;
    setTimeout(() => $('briefGo').focus(), 60);
  }
  function beginShift() {
    if ($('brief').hidden) return;
    $('brief').hidden = true;
    S.started = true; frame.focus();
    startPublicNight();
    preload();
    toast(`17:00 接班，${WARD} 病房交給你了。先熟悉一下環境吧。`, 4);
  }
  $('briefGo').addEventListener('click', beginShift);
  $('hudWard').textContent = `${WARD} 病房 · 值班`;

  // ---------- input ----------
  const keys = new Set();
  const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  const MOVE = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
  window.addEventListener('keydown', e => {
    if (typing(e)) { if (e.key === 'Escape') { e.target.blur(); frame.focus(); } return; }
    const k = e.key.toLowerCase();
    if (!$('share').hidden) { if (k === 'escape') { e.preventDefault(); $('share').hidden = true; } return; }
    if (S.ended && k === 's' && !e.repeat && !$('handover').hidden) { e.preventDefault(); openShare(); return; }
    if (S.paused) { if (['p', 'escape', 'enter', ' '].includes(k)) { e.preventDefault(); setPaused(false); } return; }
    if (k === 'p' && !e.repeat && S.started && !S.ended) { e.preventDefault(); setPaused(true); return; }
    if (!$('glab').hidden) { if (['escape', 'e', 'enter', ' '].includes(k)) { e.preventDefault(); closeLab(); } return; }
    if (!$('recall').hidden) { if (['escape', 'e', 'enter', ' '].includes(k)) { e.preventDefault(); $('recallGo').click(); } return; }
    if (!$('brief').hidden) { if (k === 'enter' || k === ' ') { e.preventDefault(); beginShift(); } return; }
    if (!S.started) return;
    if (S.mode === 'pcase') {
      if (PC.cpr && (k === 'c' || k === ' ') && !e.repeat) { e.preventDefault(); cprPress(); }
      else if (/^[1-4]$/.test(k) && !e.repeat) { e.preventDefault(); choosePublic(Number(k) - 1); }
      return;
    }
    if (S.mode === 'pdead') return;
    if (MOVE.includes(k) || k === ' ') e.preventDefault();
    keys.add(k);
    if ((k === 'e' || k === ' ' || k === 'enter') && !e.repeat) act();
    if (k === 'm' && !e.repeat) S.map = !S.map;
    if (k === ']' && DEBUG) { S.t = Math.min(END, S.t + 30); toast(`（測試）時間快轉到 ${fmt(S.t)}`, 1.5); }
    if (k === 'escape' && S.mode === 'false') closeScripted();
    if (k === 'escape' && S.mode === 'chat') closeChat();
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  frame.addEventListener('pointerdown', e => { if (!e.target.closest('input, button, select')) frame.focus(); });
  // the thumb stick: x to the right, y up the screen, each -1..1; past STICK_RUN the doctor runs.
  // It floats: the thumb goes down anywhere in the lower-left corner and the ring centres under it,
  // kept whole inside the corner, so a big phone need not reach for one spot; let go and it drifts back.
  const stick = { x: 0, y: 0, mag: 0 }, STICK_DEAD = 0.2, STICK_RUN = 0.85;
  const stickZone = $('stickZone'), stickEl = $('stick'), knob = $('stickKnob');
  let centre = null;
  function stickAt(e) {
    const { x, y, R } = centre;
    let dx = (e.clientX - x) / R, dy = (y - e.clientY) / R;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    Object.assign(stick, { x: dx, y: dy, mag: Math.min(1, m) });
    knob.style.transform = `translate(${dx * R * 0.58}px, ${-dy * R * 0.58}px)`;
    stickEl.classList.toggle('run', stick.mag > STICK_RUN && S.energy >= TIRED);
  }
  // the thumb on the stick is followed by its pointer id; capture keeps it when it slides out of the corner
  let stickId = null;
  function stickOff() { stickId = null; Object.assign(stick, { x: 0, y: 0, mag: 0 }); knob.style.transform = stickEl.style.transform = ''; stickEl.classList.remove('on', 'run'); }
  stickZone.addEventListener('pointerdown', e => {
    e.preventDefault(); stickId = e.pointerId;
    try { stickZone.setPointerCapture(e.pointerId); } catch { /* the stick still follows this pointer */ }
    // offsetLeft/Top is where the ring rests, before any transform
    const z = stickZone.getBoundingClientRect(), R = stickEl.offsetWidth / 2;
    const cx = Math.min(Math.max(e.clientX - z.left, R), z.width - R), cy = Math.min(Math.max(e.clientY - z.top, R), z.height - R);
    centre = { x: z.left + cx, y: z.top + cy, R };
    stickEl.classList.add('on');
    stickEl.style.transform = `translate(${cx - R - stickEl.offsetLeft}px, ${cy - R - stickEl.offsetTop}px)`;
    stickAt(e);
  });
  stickZone.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickAt(e); });
  ['pointerup', 'pointercancel'].forEach(ev => stickZone.addEventListener(ev, e => { if (e.pointerId === stickId) stickOff(); }));
  stickZone.addEventListener('lostpointercapture', e => { if (e.pointerId === stickId) stickOff(); });
  // phones: put the page sideways where the browser allows it (Android, from a tap, in full
  // screen); elsewhere the cover in index.html asks for the phone to be turned, and turning it
  // upright mid-shift stops the clock
  const PHONE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600;
  function goSideways() {
    if (!PHONE || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
  const upright = matchMedia('(pointer: coarse) and (orientation: portrait) and (max-width: 600px)');
  upright.addEventListener('change', () => { if (upright.matches) { stickOff(); setPaused(true); } });
  $('touchAct').addEventListener('click', act);

  // ---------- pause ----------
  // the whole shift stands still: the clock, the patients, the phone, the labs, the player's
  // needs. Whatever was open (the bedside, a call, a lab report) is still there on resume.
  let resumeFocus = null;
  function setPaused(on) {
    if (on === S.paused || (on && (!S.started || S.ended))) return;
    S.paused = on;
    keys.clear();
    // chest compressions are timed in real time: a pause starts them over
    if (on && PC.cpr) { PC.cpr.times = []; $('pcCount').textContent = `0 / ${CPR.presses}`; $('pcRate').textContent = '暫停過了，從第一下重新開始壓'; }
    $('pause').hidden = !on;
    if (on) { resumeFocus = document.activeElement; $('pauseGo').focus(); }
    else (resumeFocus?.isConnected && resumeFocus !== document.body ? resumeFocus : frame).focus();
  }
  $('btnPause').addEventListener('click', () => setPaused(true));
  $('pauseGo').addEventListener('click', () => setPaused(false));
  // a hidden tab draws no frames anyway; coming back to it paused gives the player a moment
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') setPaused(true); });

  // ---------- movement ----------
  // The player is a circle among the floor's boxes. It is a little slimmer than the shoulders
  // (0.3) so a 1 m door and a room's aisle leave room to spare; a nurse waiting at a bed's foot
  // stands in that aisle, so she is a small circle the player slides round, not a box.
  const R = 0.25, NURSE_R = 0.15;
  function collide(p) {
    for (let it = 0; it < 3; it++) {
      for (const b of solids) {
        const cx = Math.max(b[0], Math.min(p.x, b[2])), cz = Math.max(b[1], Math.min(p.z, b[3]));
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (R - d) / d; p.x += dx * k; p.z += dz * k; }
        else {
          const opts = [[b[0] - R - p.x, 0], [b[2] + R - p.x, 0], [0, b[1] - R - p.z], [0, b[3] + R - p.z]];
          opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          p.x += opts[0][0]; p.z += opts[0][1];
        }
      }
      for (const n of Object.values(nurseByBed)) {
        if (!n.visible) continue;
        const dx = p.x - n.position.x, dz = p.z - n.position.z, d = Math.hypot(dx, dz), min = R + NURSE_R;
        if (d >= min) continue;
        if (d > 1e-6) { p.x += dx / d * (min - d); p.z += dz / d * (min - d); } else p.x += min;
      }
    }
    p.x = Math.max(X0 + R, Math.min(X1 - R, p.x)); p.z = Math.max(ZB + R, Math.min(ZF - R, p.z));
  }
  // Pressed into a wall a hand's width beside a door (or into the nurse, or a bed's corner), the
  // player used to stand pinned against the edge. When a step gets almost nowhere, feel to each
  // side, a short step at a time so the feeler cannot pass through a wall, for the nearest spot
  // with the way ahead open, and slide toward it. `slideSide` remembers the last choice so the
  // player does not flicker between two openings.
  let slideSide = 1;
  function walkStep(p, dir, d) {
    const x = p.x, z = p.z;
    p.x += dir.x * d; p.z += dir.z * d; collide(p);
    if (Math.hypot(p.x - x, p.z - z) > d * 0.3) return;
    const tx = -dir.z, tz = dir.x;
    let best = null;
    for (const s of [slideSide, -slideSide]) {
      const q = { x, z };
      for (let i = 1; i <= 8; i++) {
        const lx = q.x, lz = q.z;
        q.x += tx * s * 0.07; q.z += tz * s * 0.07; collide(q);
        if ((q.x - lx) * tx * s + (q.z - lz) * tz * s < 0.035) break;
        const f = { x: q.x + dir.x * 0.3, z: q.z + dir.z * 0.3 }; collide(f);
        if ((f.x - q.x) * dir.x + (f.z - q.z) * dir.z > 0.285) { if (!best || i < best.i) best = { i, s }; break; }
      }
    }
    if (!best) return;
    slideSide = best.s;
    p.x = x + tx * slideSide * d; p.z = z + tz * slideSide * d; collide(p);
  }
  const fwd = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW)), right = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
  let walkPhase = 0;
  function move(dt) {
    let ix = 0, iz = 0;
    if (keys.has('arrowup') || keys.has('w')) iz += 1;
    if (keys.has('arrowdown') || keys.has('s')) iz -= 1;
    if (keys.has('arrowright') || keys.has('d')) ix += 1;
    if (keys.has('arrowleft') || keys.has('a')) ix -= 1;
    const thumb = stick.mag > STICK_DEAD;
    if (thumb) { ix = stick.x; iz = stick.y; }
    const { legs, arms } = player.userData;
    if (S.mode !== 'walk' || (!ix && !iz)) {
      walkPhase = 0; legs.forEach(l => { l.rotation.x *= 0.7; }); arms.forEach(a => { a.rotation.x *= 0.7; });
      return;
    }
    const dir = new THREE.Vector3().addScaledVector(right, ix).addScaledVector(fwd, iz).normalize();
    // Shift, or the stick pushed to its rim, runs; under 20% there is nothing left to run on
    // (TIRED), and a short reminder says so
    const wantRun = keys.has('shift') || (thumb && stick.mag > STICK_RUN);
    const run = wantRun && S.energy >= TIRED;
    if (wantRun && !run && performance.now() > (S.noRunAt || 0)) { S.noRunAt = performance.now() + 8000; toast('精力不到 20%，跑不動了。', 2.5); }
    const speed = (run ? 4.6 : 2.9) * (S.energy < 15 ? 0.75 : 1) * 1.3;
    // a slow frame moves the full distance, in steps short enough that a wall cannot be skipped
    const steps = Math.ceil(dt / 0.04);
    for (let i = 0; i < steps; i++) walkStep(player.position, dir, speed * dt / steps);
    if (run) S.energy = Math.max(0, S.energy - dt * 0.4 * SPEND[S.shift]);
    const target = Math.atan2(dir.x, dir.z);
    let diff = target - player.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.rotation.y += diff * Math.min(1, dt * 14);
    walkPhase += dt * speed * 3.4;
    const sw = Math.sin(walkPhase) * 0.6;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw; arms[0].rotation.x = -sw * 0.7; arms[1].rotation.x = sw * 0.7;
  }

  // ---------- loop ----------
  function updateMarks() {
    const n = nearest(), now = performance.now(), asleep = S.mode === 'sleep' || S.mode === 'scall';
    for (const id of Object.keys(S.calls)) {
      const c = S.calls[id], el = markFor(id), edge = edges[id];
      el.hidden = asleep || !(c.state === 'active' || now < (c.flashUntil || 0));
      if (el.hidden) { edge.hidden = true; continue; }
      if (c.state === 'active') { el.className = `mk ${levelOf(id)}`; edge.className = `edge ${levelOf(id)}`; }
      const v = project(nurseByBed[CASES[id].bed].position.clone().setY(2.3));
      setPos(el, v);
      const off = Math.abs(v.x) > 0.94 || Math.abs(v.y) > 0.9;
      edge.hidden = !(off && c.state === 'active' && S.mode === 'walk');
      if (!edge.hidden) {
        // pointing down, it stops above the goal line at the foot of the screen
        const s = Math.max(Math.abs(v.x) / 0.84, v.y > 0 ? v.y / 0.76 : -v.y / 0.62);
        const ex = v.x / s, ey = v.y / s;
        edge.style.left = `${((ex + 1) / 2 * 100).toFixed(2)}%`; edge.style.top = `${((1 - ey) / 2 * 100).toFixed(2)}%`;
        edge.querySelector('i').style.setProperty('--a', `${Math.atan2(-v.y, v.x)}rad`);
      }
    }
    const p = player.position, busyBeds = new Set(activeIds().map(id => CASES[id].bed));
    // bed labels only inside the room the player stands in; room numbers from the corridor
    const row = p.z > ZFC ? 'front' : null;
    bedTags.forEach(({ b, el }) => {
      el.hidden = S.map || asleep || !row || b.room.front !== (row === 'front') || Math.abs(p.x - (b.x0 + RW / 2)) > RW / 2 || busyBeds.has(b.id);
      if (!el.hidden) setPos(el, project(v3.set(b.x + 0.3, 1.3, b.z)));
    });
    roomTags.forEach(({ p: pp, el }) => {
      el.hidden = asleep || (!S.map && Math.hypot(p.x - pp.x, p.z - pp.z) > 6.5);
      if (!el.hidden) setPos(el, project(pp));
    });
    placeTags.forEach(({ p: pp, el, near }) => {
      el.hidden = asleep || (!!near && !S.map && Math.hypot(p.x - pp.x, p.z - pp.z) > near);
      if (!el.hidden) setPos(el, project(pp));
    });
    bentoTag.hidden = S.eaten >= 100 || S.mode === 'eat' || asleep || S.t < PACE.dinnerAt;
    bento.visible = S.t >= PACE.dinnerAt;
    if (!bentoTag.hidden) { bentoTag.querySelector('.lbl').textContent = S.eaten > 0 ? '便當（涼了）' : '便當'; setPos(bentoTag, project(v3.set(...ONCALL.bento))); }
    zzz.hidden = !asleep;
    if (!zzz.hidden) setPos(zzz, project(v3.set(...ONCALL.zzz)));
    prompt.hidden = !n;
    if (n) { $('promptKey').textContent = n.key; $('promptText').textContent = n.label; setPos(prompt, project(player.position.clone().setY(2.2))); }
  }
  let last = performance.now(), pulse = 0;
  // adaptive resolution: an integrated GPU on a large floor can drop to a few frames a second,
  // and the walk runs in slow motion below 20 (dt is capped), so trade pixels for frames
  const perf = { frames: 0, time: 0, since: performance.now() };
  function adapt(rawDt) {
    if (document.visibilityState !== 'visible' || rawDt > 0.5 || performance.now() - perf.since < 4000) return;
    perf.frames++; perf.time += rawDt;
    if (perf.time < 2) return;
    const fps = perf.frames / perf.time;
    perf.frames = 0; perf.time = 0;
    const next = fps < 20 ? Math.max(0.75, quality - 0.1) : fps > 45 ? Math.min(1, quality + 0.1) : quality;
    if (next !== quality) { quality = next; resize(); }
  }
  function runFrame(now) {
    const rawDt = Math.max(0, (now - last) / 1000), dt = Math.min(0.12, rawDt); last = now;
    adapt(rawDt);
    if (S.started && !S.ended && !S.paused) {
      // game minutes per real second: sleep fast-forwards, a bed runs slow so the choices are not
      // a race against the clock, a ringing phone waits
      const rate = S.mode === 'sleep' ? PACE.sleep : S.mode === 'pcase' ? PACE.pcase : S.mode === 'scall' || S.mode === 'recall' || S.mode === 'pdead' ? 0
        : S.mode === 'walk' && !activeIds().length ? PACE.quiet : PACE.walk;
      const gm = dt * rate * PUBLIC_PACE;
      S.t += gm;
      // asleep, the bar fills from empty in about 3 hours 40 minutes (it used to take under 2), so a
      // night can hold six to eight hours of sleep; everything that spends it -- the hours awake,
      // running, a call that wakes you -- was halved with it on 普通班 (SPEND), and is not on 大爛班
      if (S.mode === 'sleep') { S.energy = Math.min(100, S.energy + gm * 0.45); S.stats.sleptMin += gm; }
      else S.energy = Math.max(0, S.energy - gm * 0.045 * SPEND[S.shift] * (S.full <= 0 ? 2 : S.full < 20 ? 1.5 : 1));
      S.full = Math.max(0, S.full - gm * 0.05);
      S.bladder = Math.min(100, S.bladder + gm * 0.15);
      move(dt);
      if (S.mode === 'eat') {
        S.eaten = Math.min(100, S.eaten + dt * 5.5 * 1.8);
        S.energy = Math.min(100, S.energy + dt * (S.cold ? 0.4 : 0.9));
        S.full = Math.max(S.full, 12 + S.eaten * 0.85);
        $('eatBar').style.width = `${S.eaten}%`; $('eatPct').textContent = `${Math.round(S.eaten)}%`;
        if (!S.interrupted && S.eaten >= S.interruptAt * 100) {
          S.interrupted = true;
          S.mode = 'interrupt';
          $('iText').textContent = publicText(night.dinner); $('interruptMe').src = ME('eating');
          $('interrupt').hidden = false;
        } else if (S.eaten >= 100) stopEat('便當吃完了，精力回來一點。');
      }
      // a full bar does not wake the doctor: sleep goes on until the phone, the bladder or E
      if (S.mode === 'sleep') {
        if (S.energy >= 100 && !S.fullNoted) { S.fullNoted = true; toast('精力補滿了。想起床就按 E，也可以繼續睡。', 4); }
        $('sleepBar').style.width = `${S.energy}%`; $('sleepPct').textContent = `${Math.round(S.energy)}%`;
      }
      publicTick();
      if (S.labs.some(l => !l.ready && S.t >= l.readyAt)) labsArrive();
      if (!S.dinnerNoted && S.t >= PACE.dinnerAt) { S.dinnerNoted = true; toast('小雯：「醫師，你的便當送到值班室了，有空趕快去吃。」', 5, 'nurse_caring'); }
      if (S.t >= END) endShift();
      // tiredness: a warning at 20% and at 10%, and at 0% the doctor drops -- but never in the
      // middle of a patient, a call or compressions: the moment they are back on their feet
      if (S.energy < TIRED && !S.warned20) { S.warned20 = true; toast('精力剩 20%，跑不動了。找空檔去值班室躺一下。', 5); }
      if (S.energy < 10 && !S.warned10) { S.warned10 = true; toast('精力剩 10%……眼皮好重。再不休息，就要撐不住了。', 5); }
      // hunger: said once as it bites and once when it is empty; eating again resets it
      if (S.full < 20 && !S.hungry20) { S.hungry20 = true; toast('肚子好餓，頭有點暈……餓著做事，精力掉得比較快。', 5); }
      if (S.full <= 0 && !S.hungry0) { S.hungry0 = true; toast('餓到手在發抖。再不吃東西，精力會掉得更快。', 5); }
      if (S.full >= 30) S.hungry20 = S.hungry0 = false;
      // a full bladder: it wakes a sleeping doctor, and nags an awake one until they go (never at a bed)
      if (S.bladder >= 100) {
        S.looFull = true;
        if (S.mode === 'sleep') stopSleep('憋不住了，被尿意叫醒。');
        else if ((S.mode === 'walk' || S.mode === 'eat') && performance.now() > (S.looNagAt || 0)) {
          S.looNagAt = performance.now() + 9000;
          toast(pickN(['憋不住了！快去值班室的廁所！', '尿意已經滿了，走路都要夾著走……快去廁所！', '再不去廁所，真的要漏出來了！'], 1)[0], 4);
        }
      }
      if (S.energy >= 30) S.warned20 = S.warned10 = false;
      if (S.energy <= 0 && S.mode === 'walk' && !S.ended) { S.collapsed = true; keys.clear(); endShift(); }
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').hidden = true; }
      hudTimer -= dt; if (hudTimer <= 0) { hudTimer = 0.25; renderHud(); if (S.mode === 'pcase') publicLabButton(); }
    }
    if (!S.paused) pulse += dt;
    if (S.started && !S.ended && !S.paused) updateStaff(dt);
    let redBed = null, amberBed = null;
    for (const id of activeIds()) {
      const c = CASES[id], red = levelOf(id) === 'red';
      lamps[c.bed].material = red ? lampMat.red : lampMat.amber;
      if (red && !redBed) redBed = c.bed; else if (!red && !amberBed) amberBed = c.bed;
    }
    const k = 0.65 + 0.35 * Math.sin(pulse * 6);
    // high on the headwall beside the call lamp, so whoever stands over the bed is not lit like a lantern
    if (redBed) { alarmRed.position.set(BED[redBed].x0 + 0.55, 2.35, BED[redBed].z); alarmRed.intensity = 5 * k; } else alarmRed.intensity = 0;
    if (amberBed) { alarmAmber.position.set(BED[amberBed].x0 + 0.55, 2.35, BED[amberBed].z); alarmAmber.intensity = 2.5 * k; } else alarmAmber.intensity = 0;
    steam.forEach((s, i) => { const q = (pulse * 0.5 + i / 3) % 1; s.position.y = 0.12 + q * 0.25; s.scale.setScalar(0.6 + q); s.visible = S.eaten < 100 && !S.cold; });
    updateCamera(dt);
    composer.render();
    updateMarks();
  }
  function frameLoop(now) { runFrame(now); requestAnimationFrame(frameLoop); }
  updateCamera(0, true);
  // compile every material up front: otherwise each part of the floor stalls the first time
  // it comes into view, which on an integrated GPU freezes the walk for a second or two
  renderer.compile(scene, cam);
  renderHud();
  $('loading').hidden = true;
  $('start').hidden = false;
  // index.html?debug exposes a handle for scripted playtests; on its own it changes nothing but ]
  if (DEBUG) {
    window.__ward = { S, night, CASES, PC, TALKERS, openChat, step: (n = 1) => { for (let i = 0; i < n; i++) runFrame(last + 1000 / 60); }, publicCall, publicTick, openPublicCase, BED, WARD, renderer, scene, composer, solids, openCase, spawnCase, startSleep, place, get player() { return player; }, get quality() { return quality; } };
  }
  requestAnimationFrame(frameLoop);
}
