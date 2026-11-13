// Prüfwerkzeug für Figuren (nur in der Entwicklung geladen): misst Durchstiche, Schichtabstände und Hüllkugeln
// über viele Posen, ohne zu zeichnen. Aufruf in der Konsole: await __audit.run(); __audit.summary()
import { Vector3, type BufferAttribute, type SkinnedMesh } from 'three';
import type { CharacterAssets } from './assets';
import { Character } from './character';
import { defaultLook, type CharacterLook, type Coat, type Outfit } from '../../data/characterParts';

/** Eine gezeichnete Schicht der Figur: Haut, Grundkleidung oder ein erzeugtes Kleidungsstück */
export interface AuditLayer {
  name: string;
  /** innen → außen */
  level: number;
  mesh: SkinnedMesh;
  /** bei mehreren Stücken in einem Netz: Attribut „part“ und die Nummer dieses Stücks */
  part?: { attr: BufferAttribute; id: number };
}

const CLIPS = [
  'Idle_A', 'Walking_A', 'Running_A', 'Dodge_Forward', 'Hit_B', 'Death_A', 'Sit_Floor_Idle', 'Lie_Idle', 'Holding_B', 'Cheering',
  'Melee_1H_Attack_Slice_Horizontal', 'Melee_2H_Attack_Chop', 'Melee_Unarmed_Attack_Kick', 'Melee_1H_Attack_Jump_Chop', 'Ranged_Magic_Raise',
];
const FRAMES = 5;
/** ab dieser Tiefe (m) zählt ein Punkt als Durchstich */
const POKE = 0.0015;
const CELL = 0.025;
/** so nah (m, quer zur Normale) muss ein Punkt der äußeren Schicht liegen, um als „direkt darüber“ zu gelten */
const LATERAL = 0.01;

interface Skinned { P: Float32Array; N: Float32Array; drawn: Uint8Array; R: Float32Array; RN: Float32Array }

/** Ruhelage aller Punkte (Bindungsraum): nur Punkte, die schon in Ruhe benachbart sind, werden verglichen –
 *  sonst zählt eine Hand, die in der Pose an der Hüfte liegt, als Durchstich durch den Gürtel */
const restOf = new WeakMap<object, Float32Array>();
function restAll(mesh: SkinnedMesh): Float32Array {
  const pos = mesh.geometry.attributes.position;
  let r = restOf.get(pos);
  if (!r) {
    r = new Float32Array(pos.count * 3);
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix); r[i * 3] = v.x; r[i * 3 + 1] = v.y; r[i * 3 + 2] = v.z; }
    restOf.set(pos, r);
  }
  return r;
}
const REST2 = 0.035 * 0.035;

/** Alle Punkte eines Netzes in Weltlage (wie der Shader: Bindematrix, dann gewichtete Knochen) samt Normalen */
function skinAll(mesh: SkinnedMesh): Skinned {
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const n = pos.count;
  mesh.skeleton.update();
  const bm = mesh.skeleton.boneMatrices as Float32Array, b = mesh.bindMatrix.elements;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), RN = new Float32Array(n * 3), drawn = new Uint8Array(n);
  const idx = g.index;
  if (idx) for (let i = 0; i < idx.count; i++) drawn[idx.getX(i)] = 1; else drawn.fill(1);
  for (let i = 0; i < n; i++) {
    if (!drawn[i]) continue;
    const x0 = pos.getX(i), y0 = pos.getY(i), z0 = pos.getZ(i);
    const x = b[0] * x0 + b[4] * y0 + b[8] * z0 + b[12], y = b[1] * x0 + b[5] * y0 + b[9] * z0 + b[13], z = b[2] * x0 + b[6] * y0 + b[10] * z0 + b[14];
    const u0 = nor ? nor.getX(i) : 0, v0 = nor ? nor.getY(i) : 1, w0 = nor ? nor.getZ(i) : 0;
    const u = b[0] * u0 + b[4] * v0 + b[8] * w0, v = b[1] * u0 + b[5] * v0 + b[9] * w0, w = b[2] * u0 + b[6] * v0 + b[10] * w0;
    let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 4; k++) {
      const wt = sw.getComponent(i, k);
      if (!wt) continue;
      const o = si.getComponent(i, k) * 16;
      px += wt * (bm[o] * x + bm[o + 4] * y + bm[o + 8] * z + bm[o + 12]);
      py += wt * (bm[o + 1] * x + bm[o + 5] * y + bm[o + 9] * z + bm[o + 13]);
      pz += wt * (bm[o + 2] * x + bm[o + 6] * y + bm[o + 10] * z + bm[o + 14]);
      nx += wt * (bm[o] * u + bm[o + 4] * v + bm[o + 8] * w);
      ny += wt * (bm[o + 1] * u + bm[o + 5] * v + bm[o + 9] * w);
      nz += wt * (bm[o + 2] * u + bm[o + 6] * v + bm[o + 10] * w);
    }
    const rl = Math.hypot(u, v, w) || 1;
    RN[i * 3] = u / rl; RN[i * 3 + 1] = v / rl; RN[i * 3 + 2] = w / rl;
    const l = Math.hypot(nx, ny, nz) || 1;
    P[i * 3] = px; P[i * 3 + 1] = py; P[i * 3 + 2] = pz;
    N[i * 3] = nx / l; N[i * 3 + 1] = ny / l; N[i * 3 + 2] = nz / l;
  }
  return { P, N, drawn, R: restAll(mesh), RN };
}

const cellKey = (x: number, y: number, z: number) => (Math.floor(x / CELL) * 73856093) ^ (Math.floor(y / CELL) * 19349663) ^ (Math.floor(z / CELL) * 83492791);

function inLayer(l: AuditLayer, s: Skinned, i: number) { return !!s.drawn[i] && (!l.part || l.part.attr.getX(i) === l.part.id); }

export interface PairStat { inner: string; outer: string; n: number; poke: number; depth: number; gaps: number[]; /** schon in Ruhe liegt die äußere Schicht innen: Entwurf des Teils, kein Fehler der Bewegung */ design: number }

/** Innere gegen äußere Schicht in einer Pose: wie viele innere Punkte liegen weiter außen als die äußere Schicht darüber? */
function comparePair(inner: AuditLayer, si: Skinned, outer: AuditLayer, so: Skinned, st: PairStat) {
  const grid = new Map<number, number[]>();
  const no = so.P.length / 3;
  for (let j = 0; j < no; j++) {
    if (!inLayer(outer, so, j)) continue;
    const k = cellKey(so.P[j * 3], so.P[j * 3 + 1], so.P[j * 3 + 2]);
    const list = grid.get(k);
    if (list) list.push(j); else grid.set(k, [j]);
  }
  if (!grid.size) return;
  const ni = si.P.length / 3;
  for (let i = 0; i < ni; i += 2) {
    if (!inLayer(inner, si, i)) continue;
    const x = si.P[i * 3], y = si.P[i * 3 + 1], z = si.P[i * 3 + 2];
    const nx = si.N[i * 3], ny = si.N[i * 3 + 1], nz = si.N[i * 3 + 2];
    // die äußere Schicht direkt über dem Punkt: kleinster seitlicher Abstand (quer zur Normale). Ein Randpunkt, der
    // nur daneben liegt (an einer Öffnung oder einem Saum), zählt nicht als „darüber“.
    let best = -1, bl = LATERAL * LATERAL, d = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(cellKey(x + dx * CELL, y + dy * CELL, z + dz * CELL));
      if (!list) continue;
      for (const j of list) {
        // nur Flächen, die in dieselbe Richtung schauen (nicht die Gegenseite eines Fingers oder Arms)
        if (so.N[j * 3] * nx + so.N[j * 3 + 1] * ny + so.N[j * 3 + 2] * nz < 0.4) continue;
        const rx = so.R[j * 3] - si.R[i * 3], ry = so.R[j * 3 + 1] - si.R[i * 3 + 1], rz = so.R[j * 3 + 2] - si.R[i * 3 + 2];
        if (rx * rx + ry * ry + rz * rz > REST2) continue;
        const ex = so.P[j * 3] - x, ey = so.P[j * 3 + 1] - y, ez = so.P[j * 3 + 2] - z;
        const along = ex * nx + ey * ny + ez * nz;
        if (Math.abs(along) > CELL) continue;
        const lat = ex * ex + ey * ey + ez * ez - along * along;
        if (lat < bl) { bl = lat; best = j; d = along; }
      }
    }
    if (best < 0) continue;
    // In der Ruhehaltung gemessen: liegt die äußere Schicht dort schon innen, ist es ein Entwurfsmaß (Hose im Stiefel, Haar auf dem Hemd),
    // kein Durchstechen durch Bewegung. Nur das zweite zählt als Durchstich.
    const rest = (so.R[best * 3] - si.R[i * 3]) * si.RN[i * 3] + (so.R[best * 3 + 1] - si.R[i * 3 + 1]) * si.RN[i * 3 + 1] + (so.R[best * 3 + 2] - si.R[i * 3 + 2]) * si.RN[i * 3 + 2];
    if (rest < -POKE) { st.design++; continue; }
    st.n++;
    if (d < -POKE) { st.poke++; st.depth = Math.max(st.depth, -d); }
    else if (d > 0) st.gaps.push(d);
  }
}

export interface LookResult {
  id: string;
  /** gezeichnete Dreiecke aller Netze der Figur */
  tris: number;
  pairs: Record<string, { design: number; count: number; share: number; worstPose: number; depthMm: number; gapP5Mm: number; flickerFromM: number }>;
  /** je Netz: Anteil der Posen außerhalb der Hüllkugel, größter Überstand (m) */
  vis: Record<string, { out: number; excess: number }>;
}

function testLooks(): { id: string; look: CharacterLook }[] {
  const out: { id: string; look: CharacterLook }[] = [];
  const outfits: Outfit[] = ['hemd', 'weste', 'jacke', 'matrose', 'uniform', 'tunika'];
  const coats: Coat[] = ['keiner', 'lang'];
  for (const hair of ['kurz', 'lang'] as const) {
    let k = 0;
    for (const outfit of outfits) for (const coat of coats) {
      const look: CharacterLook = { ...defaultLook('pirat'), hair, outfit, coat, hat: 'keiner', earring: false, shoes: k % 3 === 2 ? 'schuhe' : 'stiefel', scarf: k % 2 === 1, gloves: k % 4 === 0 };
      out.push({ id: `${hair === 'kurz' ? 'm' : 'w'}-${outfit}-${coat}${look.scarf ? '-schal' : ''}${look.gloves ? '-handschuh' : ''}-${look.shoes}`, look });
      k++;
    }
    out.push({ id: `${hair === 'kurz' ? 'm' : 'w'}-weste-kurz-stiefel`, look: { ...defaultLook('pirat'), hair, outfit: 'weste', coat: 'kurz', hat: 'bandana', earring: false } });
  }
  // Ausrüstung mit Modellen aus Blender: ganze Sets und Teile, einzeln und gemischt
  const set = (id: string, extra: string[], hairModel?: string, hair: 'kurz' | 'lang' = 'kurz') => out.push({ id: `gear-${id}`, look: { ...defaultLook('pirat'), hair, outfit: 'hemd', coat: 'keiner', hat: 'keiner', earring: false, extra, hairModel } });
  const all = ['head', 'chest', 'legs', 'feet', 'mainhand', 'offhand'].map((c) => `kapitaen_${c}`);
  set('kapitaen', all);
  set('kapitaen-frisur', all, 'frisur_mehrlagig');
  set('strand', ['strand_legs', 'strand_feet'], 'frisur_mehrlagig');
  set('kapitaen-w', all, 'frisur_mehrlagig', 'lang');
  set('strand-w', ['strand_legs', 'strand_feet'], undefined, 'lang');
  set('stiefel', ['kapitaen_feet']);
  set('gehrock', ['kapitaen_chest']);
  set('hose-stiefel', ['kapitaen_legs', 'kapitaen_feet']);
  return out;
}

function auditLook(assets: CharacterAssets, id: string, look: CharacterLook): LookResult {
  const c = new Character(assets, look, false);
  const anyC = c as unknown as { action(n: string): import('three').AnimationAction | null; mixer: import('three').AnimationMixer };
  const layers = c.auditLayers();
  const meshes: SkinnedMesh[] = [];
  c.holder.traverse((o) => { const m = o as SkinnedMesh; if (m.isSkinnedMesh && m.visible) meshes.push(m); });
  let tris = 0;
  for (const m of meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  const pairStats = new Map<string, PairStat & { worst: number }>();
  const vis: Record<string, { out: number; excess: number; frames: number }> = {};
  const v = new Vector3();
  let first = true;
  for (const clip of CLIPS) {
    const a = anyC.action(clip);
    if (!a) continue;
    for (let f = 0; f < FRAMES; f++) {
      anyC.mixer.stopAllAction();
      a.reset(); a.setEffectiveWeight(1); a.play();
      a.time = (f / (FRAMES - 1)) * a.getClip().duration * 0.999;
      anyC.mixer.update(0);
      c.syncCull();
      c.holder.updateMatrixWorld(true);
      const skinned = new Map<SkinnedMesh, Skinned>();
      const get = (m: SkinnedMesh) => { let s = skinned.get(m); if (!s) { s = skinAll(m); skinned.set(m, s); } return s; };
      // Hüllkugeln: wie three.js beim ersten Bild (aus der Pose), falls die Figur keine eigene gesetzt hat
      for (const m of meshes) {
        if (first && m.boundingSphere === null) m.computeBoundingSphere();
        const sp = m.boundingSphere!;
        const s = get(m);
        let ex = 0;
        const n = s.P.length / 3;
        for (let i = 0; i < n; i += 3) {
          if (!s.drawn[i]) continue;
          v.set(s.P[i * 3], s.P[i * 3 + 1], s.P[i * 3 + 2]);
          m.worldToLocal(v);
          ex = Math.max(ex, v.distanceTo(sp.center) - sp.radius);
        }
        const key = m.name || `netz${meshes.indexOf(m)}`;
        const r = (vis[key] ??= { out: 0, excess: 0, frames: 0 });
        r.frames++;
        if (ex > 0.02) r.out++;
        r.excess = Math.max(r.excess, ex);
      }
      first = false;
      for (const inner of layers) for (const outer of layers) {
        if (outer.level <= inner.level) continue;
        const key = `${inner.name} < ${outer.name}`;
        let st = pairStats.get(key);
        if (!st) { st = { inner: inner.name, outer: outer.name, n: 0, poke: 0, depth: 0, gaps: [], worst: 0, design: 0 }; pairStats.set(key, st); }
        const n0 = st.n, p0 = st.poke;
        comparePair(inner, get(inner.mesh), outer, get(outer.mesh), st);
        if (st.n > n0) st.worst = Math.max(st.worst, (st.poke - p0) / (st.n - n0));
      }
    }
  }
  const pairs: LookResult['pairs'] = {};
  for (const [key, st] of pairStats) {
    if (!st.n && !st.design) continue;
    st.gaps.sort((x, y) => x - y);
    const p5 = st.gaps.length ? st.gaps[Math.floor(st.gaps.length * 0.05)] : 0;
    pairs[key] = { design: st.design, count: st.poke, share: st.n ? st.poke / st.n : 0, worstPose: st.worst, depthMm: st.depth * 1000, gapP5Mm: p5 * 1000, flickerFromM: p5 > 0 ? Math.sqrt(p5 * 0.1 * 16777216) : 0 };
  }
  const visOut: LookResult['vis'] = {};
  for (const [k, r] of Object.entries(vis)) visOut[k] = { out: r.out / r.frames, excess: r.excess };
  c.dispose();
  return { id, tris, pairs, vis: visOut };
}

/** Größter Abstand eines Knochens von der Figurenmitte über alle Clips (für den Halbmesser der Hüllkugel) */
function reach(assets: CharacterAssets) {
  const out: Record<string, { r: number; clip: string }> = {};
  for (const hair of ['kurz', 'lang'] as const) {
    const c = new Character(assets, { ...defaultLook('pirat'), hair }, false);
    const anyC = c as unknown as { action(n: string): import('three').AnimationAction | null; mixer: import('three').AnimationMixer };
    const center = new Vector3(), v = new Vector3();
    let worst = 0, at = '';
    for (const name of assets.clips.keys()) {
      const a = anyC.action(name);
      if (!a) continue;
      for (let f = 0; f < 8; f++) {
        anyC.mixer.stopAllAction();
        a.reset(); a.setEffectiveWeight(1); a.play();
        a.time = (f / 7) * a.getClip().duration * 0.999;
        anyC.mixer.update(0);
        c.holder.updateMatrixWorld(true);
        const hips = c.bones.hips;
        if (f === 0 && name === 'Idle_A') hips.getWorldPosition(center);
        c.rig.traverse((o) => { if ((o as { isBone?: boolean }).isBone) { const d = o.getWorldPosition(v).distanceTo(center); if (d > worst) { worst = d; at = name; } } });
      }
    }
    out[hair === 'kurz' ? 'm' : 'w'] = { r: worst, clip: at };
    c.dispose();
  }
  return out;
}

/** Was das Werkzeug vom Spiel braucht (bewusst lose getypt: Prüfwerkzeug, greift auch auf Privates zu) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GameLike = any;

export function installAudit(game: GameLike) {
  const getAssets = (): CharacterAssets | null => game.assets;
  const api = {
    results: [] as LookResult[],
    done: false,
    looks: testLooks,
    /** Messung im Hintergrund starten; das Ergebnis steht danach in __audit.last */
    last: null as unknown,
    start(from = 0, to = Infinity) { api.last = null; void api.run(from, to).then((s) => { api.last = s; }); return 'läuft'; },
    pick(id: string) { return testLooks().find((l) => l.id.startsWith(id))!.look; },
    cam: { d: 4.6, y: 0.92 },
    /**
     * Sichtprüfung: Figur im Editor-Raum mit fester Kamera, Pose und Drehung, Bild an den lokalen Empfänger (__shot).
     * Schleife vorher anhalten; der Editor wird bei Bedarf geöffnet.
     */
    async shot(name: string, look: CharacterLook, yaw: number, d = 1.7, lookY = 1.05, clip = 'Idle_A', t = 0) {
      game.loop.stop();
      if (!game.state.is('editor') || !game.stage?.char) game.openEditor(2);
      const st = game.stage;
      if (!st.__audit) {
        st.__audit = true;
        st.frame = (a: number) => { const c = st.camera; c.aspect = a; c.fov = 30; c.clearViewOffset(); c.position.set(0, api.cam.y + 0.1, api.cam.d); c.lookAt(0, api.cam.y, 0); c.updateProjectionMatrix(); };
        st.update = () => { if (st.char) st.char.holder.rotation.y = st.yaw; };
      }
      api.cam.d = d; api.cam.y = lookY;
      st.char.setLook(look);
      const c = st.char;
      c.mixer.stopAllAction();
      const a = c.action(clip);
      a.reset(); a.setEffectiveWeight(1); a.play();
      a.time = t * a.getClip().duration * 0.999;
      c.mixer.update(0);
      st.yaw = yaw;
      return (window as unknown as { __shot(n: string, w: number): Promise<string> }).__shot(name, 1000);
    },
    /** alle Prüf-Figuren messen (in Häppchen, damit die Seite bedienbar bleibt) */
    async run(from = 0, to = Infinity) {
      const assets = getAssets();
      if (!assets) return 'keine Figuren geladen';
      api.done = false;
      const looks = testLooks().slice(from, to);
      api.results = [];
      for (const l of looks) {
        api.results.push(auditLook(assets, l.id, l.look));
        await new Promise((r) => setTimeout(r, 0));
      }
      api.done = true;
      return api.summary();
    },
    one(look: CharacterLook, id = 'einzel') { const a = getAssets(); return a ? auditLook(a, id, look) : null; },
    reach() { const a = getAssets(); return a ? reach(a) : null; },
    /** Warten, bis Figuren geladen sind; Schleife anhalten und den Editor-Raum öffnen */
    async ready() {
      await new Promise<void>((r) => { const i = setInterval(() => { if (game.assets?.vroid) { clearInterval(i); r(); } }, 300); });
      await new Promise((r) => setTimeout(r, 1200));
      game.loop.stop();
      if (!game.state.is('editor') || !game.stage?.char) game.openEditor(2);
      return true;
    },
    /**
     * Leistung: n Figuren (gehend, rennend, stehend) im Editor-Raum auf der angegebenen Grafikstufe.
     * Liefert Zeichenaufrufe und Dreiecke je Bild sowie die mittlere Bildzeit (mit gl.finish, also samt Grafikkarte).
     */
    async perf(tier: string, n = 30, frames = 120, shot = '', gear = false) {
      game.renderer.applyQuality(tier);
      if (!game.state.is('editor') || !game.stage?.char) game.openEditor(2);
      const st = game.stage;
      st.char.holder.visible = false;
      const looks = testLooks();
      const cs: Character[] = [];
      for (let i = 0; i < n; i++) {
        const look = structuredClone(looks[i % looks.length].look);
        // gear = true: jede Figur trägt ein ganzes Beute-Set (alle Sets im Wechsel)
        if (gear) { const ids = ['eisenwall', 'seekoenig', 'schuppen', 'drache', 'sturmkrone', 'abgrund', 'kette', 'marine']; look.extra = ['head', 'shoulder', 'chest', 'cloak', 'hands', 'legs', 'feet'].map((cat) => `${ids[i % ids.length]}_${cat}`); }
        const c = new Character(game.assets, look, false);
        c.holder.position.set(((i % 6) - 2.5) * 1.1, 0, -Math.floor(i / 6) * 1.4);
        st.scene.add(c.holder);
        c.playClip(i % 3 === 0 ? 'Idle_A' : i % 3 === 1 ? 'Walking_A' : 'Running_A');
        cs.push(c);
      }
      const f0 = st.frame, u0 = st.update;
      st.frame = (a: number) => { const c = st.camera; c.aspect = a; c.fov = 40; c.clearViewOffset(); c.position.set(0, 3.2, 7.5); c.lookAt(0, 0.9, -2.5); c.updateProjectionMatrix(); };
      st.update = () => {};
      const gl = game.renderer.gl, ctx = gl.getContext();
      gl.info.autoReset = false;
      const step = () => { for (const c of cs) c.update(1 / 60); game.render(1, 1 / 60); };
      for (let i = 0; i < 25; i++) step();
      ctx.finish();
      gl.info.reset();
      step();
      const calls = gl.info.render.calls, tris = gl.info.render.triangles;
      let cpu = 0;
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) { const a = performance.now(); step(); cpu += performance.now() - a; if (i % 10 === 9) ctx.finish(); }
      ctx.finish();
      const total = performance.now() - t0;
      gl.info.autoReset = true;
      const saved = shot ? await (window as unknown as { __shot(n: string, w: number): Promise<string> }).__shot(shot, 900) : '';
      for (const c of cs) { st.scene.remove(c.holder); c.dispose(); }
      st.frame = f0; st.update = u0;
      st.char.holder.visible = true;
      return { tier, calls, tris, msFrame: +(total / frames).toFixed(2), msCpu: +(cpu / frames).toFixed(2), size: [ctx.drawingBufferWidth, ctx.drawingBufferHeight], saved };
    },
    /**
     * Flackern auf Entfernung: eine Figur in „dist“ Metern, stark herangezoomt, ruhige Pose. Die Kamera zittert je Bild um
     * Bruchteile eines Millimeters; gezählt werden Bildpunkte, die dabei deutlich die Farbe wechseln.
     */
    async flicker(tier: string, dist = 90, lookId = 'm-hemd-lang', frames = 14, shot = '') {
      game.renderer.applyQuality(tier);
      if (!game.state.is('editor') || !game.stage?.char) game.openEditor(2);
      const st = game.stage;
      st.char.setLook(api.pick(lookId));
      const c = st.char;
      c.holder.visible = true;
      c.mixer.stopAllAction();
      const a = c.action('Idle_A');
      a.reset(); a.setEffectiveWeight(1); a.play(); a.time = 0.2;
      c.mixer.update(0);
      const f0 = st.frame, u0 = st.update, far0 = st.camera.far;
      let jx = 0, jy = 0;
      st.frame = (as: number) => { const cam = st.camera; cam.aspect = as; cam.far = 1000; cam.fov = 2 * Math.atan(1.25 / dist) * 57.2958; cam.clearViewOffset(); cam.position.set(jx, 1.0 + jy, dist); cam.lookAt(jx, 0.95 + jy, 0); cam.updateProjectionMatrix(); };
      st.update = () => { c.holder.rotation.y = 0.5; };
      const ctx = game.renderer.gl.getContext();
      const W = ctx.drawingBufferWidth, H = ctx.drawingBufferHeight;
      const w = Math.min(W, Math.round(H * 0.5)) & ~1, x0 = (W - w) >> 1;
      let prev: Uint8Array | null = null, changed = 0;
      for (let i = 0; i < frames; i++) {
        // feste Folge statt Zufall: sonst schwankt das Ergebnis von Lauf zu Lauf um ein Drittel
        jx = 0.0003 * Math.sin(i * 2.4); jy = 0.0003 * Math.cos(i * 1.7);
        game.render(1, 1 / 60);
        const px = new Uint8Array(w * H * 4);
        ctx.readPixels(x0, 0, w, H, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
        if (prev) for (let k = 0; k < px.length; k += 4) if (Math.abs(px[k] - prev[k]) + Math.abs(px[k + 1] - prev[k + 1]) + Math.abs(px[k + 2] - prev[k + 2]) > 36) changed++;
        prev = px;
      }
      const saved = shot ? await (window as unknown as { __shot(n: string, w: number): Promise<string> }).__shot(shot, 700) : '';
      st.frame = f0; st.update = u0; st.camera.far = far0;
      return { tier, dist, changedPerFrame: Math.round(changed / (frames - 1)), area: w * H, saved };
    },
    /** Zusammenfassung über alle gemessenen Figuren */
    summary() {
      const byPair = new Map<string, { count: number; n: number; share: number; worst: number; depth: number; gap: number; who: string }>();
      let tris = 0, visOut = 0, visN = 0, visEx = 0, total = 0;
      for (const r of api.results) {
        tris += r.tris;
        for (const [k, p] of Object.entries(r.pairs)) {
          const key = k.replace(/guertelEng/g, 'guertel');
          const e = byPair.get(key) ?? { count: 0, n: 0, share: 0, worst: 0, depth: 0, gap: Infinity, who: '' };
          e.n++; e.share += p.share; e.count += p.count; total += p.count;
          if (p.worstPose > e.worst) { e.worst = p.worstPose; e.who = r.id; }
          e.depth = Math.max(e.depth, p.depthMm);
          if (p.gapP5Mm > 0) e.gap = Math.min(e.gap, p.gapP5Mm);
          byPair.set(key, e);
        }
        for (const v of Object.values(r.vis)) { visN++; visOut += v.out; visEx = Math.max(visEx, v.excess); }
      }
      const rows = [...byPair.entries()].map(([k, e]) => ({ paar: k, punkte: e.count, figuren: e.n, durchstich: +(100 * e.share / e.n).toFixed(2), schlimmstePose: +(100 * e.worst).toFixed(1), tiefeMm: +e.depth.toFixed(1), abstandP5Mm: Number.isFinite(e.gap) ? +e.gap.toFixed(1) : 0, bei: e.who }))
        .sort((a, b) => b.durchstich - a.durchstich);
      return {
        figuren: api.results.length,
        /** durchstechende Punkte je Figur und Pose (jeder zweite Punkt wird geprüft) */
        durchstichJePose: +(total / Math.max(1, api.results.length) / (CLIPS.length * FRAMES)).toFixed(1),
        dreieckeMittel: Math.round(tris / Math.max(1, api.results.length)),
        huellkugelAusserhalb: +(100 * visOut / Math.max(1, visN)).toFixed(1),
        huellkugelUeberstandM: +visEx.toFixed(2),
        paare: rows,
      };
    },
  };
  (window as unknown as { __audit: typeof api }).__audit = api;
}
