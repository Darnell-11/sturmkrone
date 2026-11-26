// Phase 4.6B – echte Schiffs-Zweiteilung durch Kataklysmus-Ultimates (Himmelsspalter, Klingen-Zyklon, Iaijutsu, Schwarzes Loch).
// Ohne CSG und ohne neue Shader: jedes große Netz wird entlang einer Schnittebene in zwei Index-Puffer zerlegt (die Eckpunkt-Daten teilen sich
// beide Hälften), kleine Teile und Instanz-Netze wandern ganz auf ihre Seite. Die Hälften hängen an zwei Drehpunkt-Gruppen im Modell; das
// Schiff versinkt wie gewohnt (Ship.render), die Hälften kippen dabei nach innen weg (Bug und Heck), rollen auseinander (der Länge nach),
// gleiten am Schnitt ab (diagonal) oder trudeln in den Abgrund (radial). Materialien bleiben dieselben (gleiche Programme).
//
// 4.6J: Die Zerlegung eines Schiffs kostete 6 – 20 ms in einem Bild plus bis zu 8 ms Hochladen im nächsten (zusammen 20 – 35 ms). Jetzt ist sie
// ein Auftrag (`beginShipSplit`), den `pumpShipSplits` je gezeichnetem Bild mit festem Zeitbudget (`SPLIT_FRAME_MS`) weiterführt – meist 2 – 3
// Bilder, mitten im Standbild der Impact-Frames. Jeder Zwischenstand sieht aus wie das ganze Schiff (Umhängen mit gleicher Weltlage, beide
// Hälften an derselben Stelle); die Hälften bewegen sich erst, wenn der Auftrag fertig ist (`ShipSplit.ready`). Zusätzlich billiger:
// - die Hälften übernehmen die Hüllkugel des Originals (bisher je Hälfte eine Rechnung über ALLE Eckpunkte des geteilten Puffers),
// - die Dreiecks-Einteilung schreibt in Puffer, die der Auftrag für alle Netze wiederverwendet (nur das Ergebnis wird angelegt),
// - das Original gibt nur seinen Index-Puffer frei (`releaseIndexOnly`): bisher löschte `dispose()` die geteilten Eckpunkt-Puffer auf der
//   Grafikkarte, und beide Hälften luden sie im nächsten Bild neu hoch.
import { Box3, BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, Vector3, type Object3D, type ShaderMaterial } from 'three';
import { addOutlines } from '../../render/outline';
import { releaseIndexOnly } from '../../render/dispose';
import type { ShipCut } from '../../data/actionKit';

export type { ShipCut };

/** Zustand einer Zweiteilung (nur Darstellung) */
export interface ShipSplit {
  cut: Exclude<ShipCut, ''>;
  /** Zeit seit dem Schnitt (s) */
  t: number;
  /** Hälfte A (Bug / Backbord / oberhalb des Schnitts) und B */
  a: Group;
  b: Group;
  /** Schiffslänge und -breite, Deckshöhe über der Wasserlinie (Drehpunkt und diagonaler Schnitt) */
  L: number;
  W: number;
  deckY: number;
  /** Ebene im Schiffsraum: Normale und Abstand */
  nx: number; ny: number; nz: number;
  /** Drehsinn (zufällig je Schiff, deterministisch aus dem Startwert) */
  spin: number;
  /** Anzahl Teile je Seite (Prüfungen) */
  partsA: number;
  partsB: number;
  /** in Dreiecken zerlegte Netze (Prüfungen) */
  sliced: number;
  /** Anhub (m): eine Flutwelle hebt das Schiff vor dem Kentern (4.6C), eine Gletschersäule spießt es auf und hebt es an (4.6D) */
  lift: number;
  /** Zahl der Sektionen (2 = Hälften; 3 – 4: jede Hälfte zerfällt noch einmal, 4.6D) */
  sections: number;
  /** Untergruppen der weiteren Sektionen: driften entlang der zweiten Schnittebene auseinander und sinken versetzt */
  subs: { g: Group; dx: number; dz: number; sink: number; rot: number }[];
  /** 4.6J: Zerlegung abgeschlossen (erst dann bewegen sich die Hälften) */
  ready: boolean;
  /** 4.6J: Bilder, über die der Auftrag lief, und sein längster Schritt in ms (Prüfungen) */
  frames: number;
  maxStepMs: number;
}

/** 4.6J: Zeitbudget je gezeichnetem Bild für alle laufenden Zerlegungen zusammen (ms) */
export const SPLIT_FRAME_MS = 3;
/** Dreiecke zwischen zwei Blicken auf die Uhr */
const TRI_CHUNK = 2048;

const _m = new Matrix4();
const _v = new Vector3();
const _box = new Box3();
const _c = new Vector3();
const _s = new Vector3();
const _cTmp = new Color();

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Arbeitskontext eines Auftrags: Zeitgrenze, eigene Matrizen (Aufträge wechseln sich zwischen zwei Bildern ab) und Einteilungs-Puffer */
interface SplitCtx {
  /** Uhrzeit (ms), ab der der Auftrag abgibt; Infinity = in einem Zug */
  until: number;
  inv: Matrix4;
  rel: Matrix4;
  /** wiederverwendete Einteilungs-Puffer für alle Netze des Auftrags (wachsen nur) */
  bufA: Uint32Array;
  bufB: Uint32Array;
}

const newCtx = (until: number): SplitCtx => ({ until, inv: new Matrix4(), rel: new Matrix4(), bufA: new Uint32Array(0), bufB: new Uint32Array(0) });
const over = (ctx: SplitCtx) => ctx.until !== Infinity && clock() > ctx.until;

/** Schnittebene je Art (Schiffsraum: +Z Bug, +X Backbord, +Y oben) */
export function cutPlane(cut: Exclude<ShipCut, ''>): { nx: number; ny: number; nz: number } {
  switch (cut) {
    // Kentern und Versenken zerteilen nicht: das ganze Schiff dreht bzw. sinkt als eine Gruppe
    case 'capsize': case 'sink': return { nx: 0, ny: 0, nz: 1 };
    case 'length': return { nx: 1, ny: 0, nz: 0 };
    // schräger Schnitt von oben-achtern nach unten-vorn: die obere Hälfte gleitet am Schnitt ab
    case 'diagonal': { const l = Math.hypot(1, 0.8); return { nx: 0, ny: 1 / l, nz: 0.8 / l }; }
    case 'cross': case 'radial': default: return { nx: 0, ny: 0, nz: 1 };
  }
}

/** Seite eines Punkts (Schiffsraum) zur Ebene durch (0, y0, 0) mit Versatz `off` entlang der Normalen */
const sideOf = (x: number, y: number, z: number, nx: number, ny: number, nz: number, y0: number, off = 0) => nx * x + ny * (y - y0) + nz * z - off;

function hasOutlineChild(m: Object3D): ShaderMaterial | null {
  for (const c of m.children) {
    const mat = (c as Mesh).material as ShaderMaterial | undefined;
    if (mat && !Array.isArray(mat) && (mat.userData as { outline?: boolean }).outline) return mat;
  }
  return null;
}

/** Kontur-Kinder eines Netzes auf eine neue Geometrie bzw. Anzahl setzen */
function retargetOutline(m: Mesh, geo: BufferGeometry, count = -1) {
  for (const c of m.children) {
    const cm = c as Mesh;
    const mat = cm.material as ShaderMaterial | undefined;
    if (!mat || Array.isArray(mat) || !(mat.userData as { outline?: boolean }).outline) continue;
    cm.geometry = geo;
    if (count >= 0 && (cm as InstancedMesh).isInstancedMesh) (cm as InstancedMesh).count = count;
  }
}

/** Kontur für ein neues Netz der zweiten Hälfte (gleiche Breite wie beim Original) */
function outlineLike(src: Mesh, twin: Mesh) {
  const mat = hasOutlineChild(src);
  if (!mat) return;
  twin.userData.noOutline = false;
  const w = (mat.uniforms?.uWidth?.value as number | undefined) ?? 1;
  addOutlines(twin, w);
}

/** Einteilungs-Puffer des Auftrags auf mindestens `n` Einträge bringen */
function ensureBuf(ctx: SplitCtx, n: number) {
  if (ctx.bufA.length >= n) return;
  const len = Math.max(n, ctx.bufA.length * 2, 4096);
  ctx.bufA = new Uint32Array(len);
  ctx.bufB = new Uint32Array(len);
}

/** Hälfte als eigene Geometrie: gleiche Eckpunkt-Attribute, eigener Index; Hüllkugel des Originals (umschließt jede Teilmenge) */
function makeHalf(g: BufferGeometry, src: Uint32Array, n: number, big: boolean): BufferGeometry {
  const h = new BufferGeometry();
  for (const name in g.attributes) h.setAttribute(name, g.attributes[name]);
  const arr = big ? new Uint32Array(n) : new Uint16Array(n);
  arr.set(src.subarray(0, n));
  h.setIndex(new BufferAttribute(arr, 1));
  h.boundingBox = null;
  if (!g.boundingSphere) g.computeBoundingSphere();
  h.boundingSphere = g.boundingSphere!.clone();
  return h;
}

/** Ergebnis einer Einteilung (ein Objekt je Zerlegung, kein neues je Netz) */
interface SliceOut { halves: [BufferGeometry, BufferGeometry] | null }

/**
 * Geometrie in zwei Index-Puffer zerlegen (Dreiecke nach ihrem Schwerpunkt, im Schiffsraum über `ctx.rel`). Ergebnis in `out`; null, wenn alles
 * auf einer Seite liegt oder die Geometrie nicht zerlegt werden kann (Morph-Ziele). Gibt nach je `TRI_CHUNK` Dreiecken ab, wenn das Budget
 * erschöpft ist (die Matrix wird vorher in lokale Zahlen kopiert und bleibt so über die Abgabe gültig).
 */
function* sliceGeometrySteps(g: BufferGeometry, ctx: SplitCtx, nx: number, ny: number, nz: number, y0: number, off: number, out: SliceOut): Generator<void, void, void> {
  out.halves = null;
  const pos = g.getAttribute('position');
  // Gruppen zählen nur bei mehreren Materialien (der Aufrufer schließt die aus); die Hälften brauchen keine
  if (!pos || Object.keys(g.morphAttributes).length) return;
  const idx = g.getIndex();
  const tri = idx ? idx.count / 3 : pos.count / 3;
  if (tri < 2) return;
  const big = pos.count > 65535;
  ensureBuf(ctx, tri * 3);
  const A = ctx.bufA, B = ctx.bufB;
  const ia = idx ? idx.array : null;
  // Positionen direkt aus dem Feld lesen, wo möglich (getX prüft je Aufruf Normalisierung und Versatz)
  const flat = !(pos as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute && !pos.normalized && pos.itemSize === 3
    ? (pos.array as ArrayLike<number>) : null;
  const e = ctx.rel.elements;
  const e0 = e[0], e1 = e[1], e2 = e[2], e4 = e[4], e5 = e[5], e6 = e[6], e8 = e[8], e9 = e[9], e10 = e[10], e12 = e[12], e13 = e[13], e14 = e[14];
  let na = 0, nb = 0;
  for (let t = 0; t < tri; t++) {
    if ((t & (TRI_CHUNK - 1)) === TRI_CHUNK - 1 && over(ctx)) yield;
    const i0 = ia ? ia[t * 3] : t * 3, i1 = ia ? ia[t * 3 + 1] : t * 3 + 1, i2 = ia ? ia[t * 3 + 2] : t * 3 + 2;
    let px: number, py: number, pz: number;
    if (flat) {
      px = (flat[i0 * 3] + flat[i1 * 3] + flat[i2 * 3]) / 3;
      py = (flat[i0 * 3 + 1] + flat[i1 * 3 + 1] + flat[i2 * 3 + 1]) / 3;
      pz = (flat[i0 * 3 + 2] + flat[i1 * 3 + 2] + flat[i2 * 3 + 2]) / 3;
    } else {
      px = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3;
      py = (pos.getY(i0) + pos.getY(i1) + pos.getY(i2)) / 3;
      pz = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
    }
    // Schwerpunkt im Objektraum, dann in den Schiffsraum (affine Matrix, ohne neue Objekte)
    const x = e0 * px + e4 * py + e8 * pz + e12;
    const y = e1 * px + e5 * py + e9 * pz + e13;
    const z = e2 * px + e6 * py + e10 * pz + e14;
    if (sideOf(x, y, z, nx, ny, nz, y0, off) >= 0) { A[na++] = i0; A[na++] = i1; A[na++] = i2; }
    else { B[nb++] = i0; B[nb++] = i1; B[nb++] = i2; }
  }
  if (!na || !nb) return;
  out.halves = [makeHalf(g, A, na, big), makeHalf(g, B, nb, big)];
}

/** Instanz-Netz nach den Lagen seiner Instanzen aufteilen: A behält seine, B bekommt ein neues Netz (gleiche Geometrie, gleiches Material) */
function sliceInstanced(m: InstancedMesh, rel: Matrix4, nx: number, ny: number, nz: number, y0: number, off = 0): InstancedMesh | null {
  const n = m.count;
  if (n < 2) return null;
  const keep: number[] = [], move: number[] = [];
  for (let i = 0; i < n; i++) {
    m.getMatrixAt(i, _m);
    _v.setFromMatrixPosition(_m).applyMatrix4(rel);
    (sideOf(_v.x, _v.y, _v.z, nx, ny, nz, y0, off) >= 0 ? keep : move).push(i);
  }
  if (!keep.length || !move.length) return null;
  const twin = new InstancedMesh(m.geometry, m.material, move.length);
  move.forEach((src, k) => {
    m.getMatrixAt(src, _m); twin.setMatrixAt(k, _m);
    if (m.instanceColor) { m.getColorAt(src, _cTmp); twin.setColorAt(k, _cTmp); }
  });
  // A rückt zusammen
  keep.forEach((src, k) => {
    if (src === k) return;
    m.getMatrixAt(src, _m); m.setMatrixAt(k, _m);
    if (m.instanceColor) { m.getColorAt(src, _cTmp); m.setColorAt(k, _cTmp); }
  });
  m.count = keep.length;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere();
  twin.computeBoundingSphere();
  twin.castShadow = m.castShadow; twin.receiveShadow = m.receiveShadow;
  twin.frustumCulled = m.frustumCulled;
  twin.renderOrder = m.renderOrder;
  retargetOutline(m, m.geometry, m.count);
  return twin;
}

/** Neuer Zustand (noch ohne Teile) */
function newSplit(cut: Exclude<ShipCut, ''>, L: number, W: number, deckY: number, seed: number, lift: number): ShipSplit {
  const { nx, ny, nz } = cutPlane(cut);
  const a = new Group(); a.name = 'split-a';
  const b = new Group(); b.name = 'split-b';
  return { cut, t: 0, a, b, L, W, deckY, nx, ny, nz, spin: seed % 2 ? 1 : -1, partsA: 0, partsB: 0, sliced: 0, lift, sections: 2, subs: [], ready: false, frames: 0, maxStepMs: 0 };
}

/** Der eigentliche Ablauf: Hälften, dann weitere Sektionen; gibt ab, sobald das Budget von `ctx` erschöpft ist */
function* splitSteps(root: Group, st: ShipSplit, seed: number, sections: number, ctx: SplitCtx): Generator<void, void, void> {
  const { cut, nx, ny, nz, a, b, L, W } = st;
  root.add(a, b);
  if (cut === 'capsize' || cut === 'sink') {
    // ganz: alle Teile in Gruppe A (Drehpunkt), nichts wird zerlegt
    root.updateMatrixWorld(true);
    for (const o of root.children.slice()) { if (o === a || o === b) continue; a.attach(o); st.partsA++; }
    return;
  }
  // diagonale Schnitte gehen durch die Mitte des Rumpfs (halbe Deckshöhe), die anderen durch die Schiffsmitte
  const y0 = cut === 'diagonal' ? st.deckY * 0.5 : 0;
  const n = [0, 0];
  yield* partitionSteps(root, nx, ny, nz, y0, 0, a, b, st, ctx, n);
  st.partsA = n[0]; st.partsB = n[1];
  // weitere Sektionen (4.6D): jede Hälfte zerfällt entlang einer zweiten Ebene (der Länge nach geschnittene Schiffe quer, quer
  // geschnittene der Länge nach); die Teile driften auseinander und sinken versetzt
  if (sections >= 3) {
    const along = cut === 'length';
    const sx = along ? 0 : 1, sz = along ? 1 : 0;
    let s = seed;
    const rnd = () => { s = (s * 16807 + 11) % 2147483647; return s / 2147483647; };
    const halves = sections >= 4 ? [a, b] : [rnd() < 0.5 ? a : b];
    for (const h of halves) {
      const off = along ? (rnd() - 0.5) * L * 0.3 : (rnd() - 0.5) * W * 0.25;
      const h1 = new Group(); h1.name = `${h.name}-1`;
      const h2 = new Group(); h2.name = `${h.name}-2`;
      yield* partitionSteps(h, sx, 0, sz, 0, off, h1, h2, st, ctx, [0, 0]);
      const sp = 0.8 + rnd() * 0.5;
      st.subs.push({ g: h1, dx: sx * sp, dz: sz * sp, sink: 0.4 + rnd() * 0.5, rot: (rnd() - 0.5) * 2 });
      st.subs.push({ g: h2, dx: -sx * sp, dz: -sz * sp, sink: 0.2 + rnd() * 0.5, rot: (rnd() - 0.5) * 2 });
      st.sections++;
    }
  }
}

/**
 * Modell zerteilen – in einem Zug (Prüfungen, Werkzeuge). `root` = Modellgruppe des Schiffs (Ursprung = Schiffsmitte auf Wasserhöhe), `L`/`W` =
 * Maße, `seed` für den Drehsinn. Die Hälften hängen danach als zwei Gruppen in `root` (alles bleibt im selben Baum, nichts wird abgehängt).
 * Im Spiel läuft dasselbe als Auftrag über mehrere Bilder (`beginShipSplit`).
 */
export function splitShipModel(root: Group, cut: Exclude<ShipCut, ''>, L: number, W: number, deckY: number, seed = 1, lift = 0, sections = 2): ShipSplit {
  const st = newSplit(cut, L, W, deckY, seed, lift);
  const it = splitSteps(root, st, seed, sections, newCtx(Infinity));
  while (!it.next().done) { /* in einem Zug */ }
  st.ready = true;
  st.frames = 1;
  return st;
}

// ---------- Aufträge über mehrere Bilder (4.6J) ----------

interface SplitJob { st: ShipSplit; it: Generator<void, void, void>; ctx: SplitCtx; cancelled: boolean }
const jobs: SplitJob[] = [];

/**
 * Zerlegung als Auftrag anlegen (im Spiel über `Ship.splitApart`): der Zustand gilt sofort, die Hälften bewegen sich erst, wenn
 * `pumpShipSplits` ihn abgeschlossen hat (`ready`).
 */
export function beginShipSplit(root: Group, cut: Exclude<ShipCut, ''>, L: number, W: number, deckY: number, seed = 1, lift = 0, sections = 2): ShipSplit {
  const st = newSplit(cut, L, W, deckY, seed, lift);
  const ctx = newCtx(0);
  jobs.push({ st, it: splitSteps(root, st, seed, sections, ctx), ctx, cancelled: false });
  return st;
}

/**
 * Je gezeichnetem Bild einmal (`SeaWorld.render`): laufende Zerlegungen der Reihe nach weiterführen, bis das Budget `ms` verbraucht ist.
 * `ms` = Infinity schließt alle sofort ab. Liefert die Zahl der in diesem Aufruf fertig gewordenen Zerlegungen.
 */
export function pumpShipSplits(ms = SPLIT_FRAME_MS): number {
  if (!jobs.length) return 0;
  const until = ms === Infinity ? Infinity : clock() + ms;
  let done = 0;
  while (jobs.length) {
    const j = jobs[0];
    if (j.cancelled) { jobs.shift(); continue; }
    j.ctx.until = until;
    const s0 = clock();
    const r = j.it.next();
    const stepMs = clock() - s0;
    j.st.frames++;
    if (stepMs > j.st.maxStepMs) j.st.maxStepMs = stepMs;
    if (!r.done) break;
    j.st.ready = true;
    jobs.shift();
    done++;
    if (until !== Infinity && clock() >= until) break;
  }
  return done;
}

/** Laufenden Auftrag verwerfen (das Schiff wird abgebaut) */
export function cancelShipSplit(st: ShipSplit) {
  for (const j of jobs) if (j.st === st) j.cancelled = true;
}

/** Zahl der laufenden Zerlegungen (Prüfungen) */
export function pendingShipSplits(): number {
  let n = 0;
  for (const j of jobs) if (!j.cancelled) n++;
  return n;
}

/**
 * Teile von `root` entlang der Ebene (nx, ny, nz) durch (0, y0, 0) mit Versatz `off` in die Gruppen `a` (vorn/oben/Backbord) und `b`
 * zerlegen; große Netze Dreieck für Dreieck, Instanz-Netze nach Instanzen, kleine Teile ganz. Zählt die Teile je Seite in `n`.
 * Jedes Teil wird sofort mit gleicher Weltlage umgehängt – jeder Zwischenstand sieht aus wie vorher. Nach jeder Abgabe werden die
 * Matrizen neu gelesen (das Schiff bewegt sich zwischen zwei Bildern).
 */
function* partitionSteps(root: Group, nx: number, ny: number, nz: number, y0: number, off: number, a: Group, b: Group, st: ShipSplit,
  ctx: SplitCtx, n: number[]): Generator<void, void, void> {
  if (a.parent !== root) root.add(a, b);
  const sync = () => { root.updateMatrixWorld(true); ctx.inv.copy(root.matrixWorld).invert(); };
  sync();
  const place = (o: Object3D, to: Group) => { to.attach(o); if (to === a) n[0]++; else n[1]++; };
  // Kinder eines Netzes wandern mit ihm (Konturen, Anbauten)
  const placeWhole = (c: Object3D) => {
    c.getWorldPosition(_v).applyMatrix4(ctx.inv);
    place(c, sideOf(_v.x, _v.y, _v.z, nx, ny, nz, y0, off) >= 0 ? a : b);
  };
  /** Zwilling (zweite Hälfte) genau dort einhängen, wo sein Original liegt; Kontur wie beim Original */
  const addTwin = (m: Mesh, src: Mesh, to: Group) => {
    to.add(m);
    to.updateMatrixWorld(true);
    src.updateWorldMatrix(true, false);
    _m.copy(to.matrixWorld).invert().multiply(src.matrixWorld);
    _m.decompose(m.position, m.quaternion, m.scale);
    outlineLike(src, m);
    n[1]++;
  };
  const out: SliceOut = { halves: null };

  function* visit(o: Object3D): Generator<void, void, void> {
    for (const c of o.children.slice()) {
      if (c === a || c === b) continue;
      // zwischen zwei Bildern abgebaut oder umgehängt
      if (c.parent !== o) continue;
      if (over(ctx)) { yield; sync(); if (c.parent !== o) continue; }
      const mesh = c as Mesh;
      const mat = mesh.material as { userData?: { outline?: boolean } } | undefined;
      if (mat && !Array.isArray(mat) && mat.userData?.outline) continue; // Konturen bleiben an ihrem Netz
      if ((c as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) { placeWhole(c); continue; }
      if (mesh.isMesh) {
        ctx.rel.multiplyMatrices(ctx.inv, mesh.matrixWorld);
        if ((mesh as InstancedMesh).isInstancedMesh) {
          const twin = sliceInstanced(mesh as InstancedMesh, ctx.rel, nx, ny, nz, y0, off);
          if (twin) { place(mesh, a); addTwin(twin, mesh, b); st.sliced++; continue; }
          placeWhole(c);
          continue;
        }
        const g = mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        _box.copy(g.boundingBox!).applyMatrix4(ctx.rel);
        _box.getCenter(_c); _box.getSize(_s);
        const ext = Math.abs(nx) * _s.x + Math.abs(ny) * _s.y + Math.abs(nz) * _s.z;
        const d = sideOf(_c.x, _c.y, _c.z, nx, ny, nz, y0, off);
        // nur Netze, die der Schnitt wirklich durchquert, Dreieck für Dreieck; alles andere wandert ganz
        if (Math.abs(d) < ext * 0.42 && !Array.isArray(mesh.material)) {
          yield* sliceGeometrySteps(g, ctx, nx, ny, nz, y0, off, out);
          const halves = out.halves;
          out.halves = null;
          // nach einer Abgabe stehen die Weltmatrizen auf einem neuen Bild; während der Einteilung abgebaut: nichts mehr anfassen
          sync();
          if (c.parent !== o) continue;
          if (halves) {
            const twin = new Mesh(halves[1], mesh.material);
            twin.castShadow = mesh.castShadow; twin.receiveShadow = mesh.receiveShadow;
            twin.renderOrder = mesh.renderOrder; twin.frustumCulled = mesh.frustumCulled;
            twin.userData = { ...mesh.userData, noOutline: true };
            mesh.geometry = halves[0];
            retargetOutline(mesh, halves[0]);
            // nur den Index des Originals freigeben: die Eckpunkt-Puffer teilen sich die Hälften (bleiben auf der Grafikkarte)
            releaseIndexOnly(g);
            place(mesh, a);
            addTwin(twin, mesh, b);
            st.sliced++;
            continue;
          }
        }
        place(mesh, d >= 0 ? a : b);
        continue;
      }
      // Gruppen: durchquert der Schnitt sie, einzeln weiter; sonst ganz auf eine Seite
      if (c.children.length) {
        _box.setFromObject(c);
        if (_box.isEmpty()) { place(c, a); continue; }
        _box.applyMatrix4(ctx.inv);
        _box.getCenter(_c); _box.getSize(_s);
        const ext = Math.abs(nx) * _s.x + Math.abs(ny) * _s.y + Math.abs(nz) * _s.z;
        const d = sideOf(_c.x, _c.y, _c.z, nx, ny, nz, y0, off);
        if (Math.abs(d) < ext * 0.42 && !hasSkinned(c)) { yield* visit(c); continue; }
        place(c, d >= 0 ? a : b);
        continue;
      }
      placeWhole(c);
    }
  }

  yield* visit(root);
}

function hasSkinned(o: Object3D): boolean {
  let s = false;
  o.traverse((c) => { if ((c as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) s = true; });
  return s;
}

const smooth = (k: number) => { const v = k < 0 ? 0 : k > 1 ? 1 : k; return v * v * (3 - 2 * v); };

/**
 * Je Bild: die Hälften bewegen. Bug und Heck kippen nach innen (V-Form, die Bruchstelle sackt zuerst), der Länge nach rollen sie
 * auseinander, diagonal gleitet die obere Hälfte am Schnitt ab, radial trudeln beide und schrumpfen in den Abgrund.
 */
export function updateShipSplit(st: ShipSplit, dt: number) {
  // 4.6J: solange der Auftrag läuft, bleibt alles am Platz (jeder Zwischenstand sieht aus wie das ganze Schiff)
  if (!st.ready) return;
  st.t += Math.max(0, Math.min(0.1, dt));
  const t = st.t;
  const a = st.a, b = st.b;
  const ky = st.deckY * 0.15;
  switch (st.cut) {
    case 'cross':
    case 'radial': {
      // Drehpunkt an der Bruchstelle über dem Kiel; Bug (A) dreht nose-up, Heck (B) ebenso nach oben
      const th = Math.min(0.95, 0.06 + t * 0.32 + t * t * 0.05) * smooth(t / 0.4);
      // radial: nach dem Zusammenquetschen sprengt der Kollaps die Hälften nach außen (4.6D)
      const blast = st.cut === 'radial' && t > 1.2 ? (t - 1.2) * (t - 1.2) * 9 : 0;
      const gap = Math.min(st.L * 0.16, t * 1.6) + blast;
      rotX(a, -th, ky, gap);
      rotX(b, th, ky, -gap);
      if (st.cut === 'radial') {
        const sp = st.spin * t * t * 0.6;
        a.rotation.y = sp; b.rotation.y = sp;
        const k = Math.max(0.15, 1 - t * 0.16);
        a.scale.setScalar(k); b.scale.setScalar(k);
      }
      // Gletschersäule / Tornado (4.6D): das Schiff wird erst angehoben und bricht oben auseinander
      if (st.lift > 0) { const up = st.lift * Math.sin(Math.min(1, t / 1.6) * Math.PI); a.position.y += up; b.position.y += up; }
      break;
    }
    case 'length': {
      const ph = Math.min(1.15, 0.05 + t * 0.36 + t * t * 0.05) * smooth(t / 0.4);
      const gap = Math.min(st.W * 0.9, t * 1.4);
      rotZ(a, -ph, ky, gap);
      rotZ(b, ph, ky, -gap);
      break;
    }
    case 'capsize': {
      // Kentern: (von einer Welle angehoben) rollt das Schiff um die Längsachse kieloben und sinkt
      const ph = Math.min(2.7, t * t * 0.75 + t * 0.35) * st.spin;
      rotZ(a, -ph, st.deckY * 0.5, 0);
      if (st.lift > 0) a.position.y += st.lift * Math.sin(Math.min(1, t / 1.4) * Math.PI);
      break;
    }
    case 'sink': {
      // durchlöchert: Schlagseite und Bug voran, das Versinken selbst rechnet Ship.render
      a.rotation.set(Math.min(0.3, t * 0.1) * st.spin, 0, Math.min(0.42, t * 0.16) * st.spin);
      a.position.set(0, 0, 0);
      break;
    }
    case 'diagonal': {
      // obere Hälfte gleitet entlang der Schnittebene nach unten und kippt, die untere bleibt
      const s = Math.min(st.L * 0.35, t * t * 2.2 + t * 0.4);
      // Richtung in der Ebene, die nach unten zeigt: (0, −nz, ny)
      a.position.set(0, -st.nz * s, st.ny * s);
      a.rotation.set(Math.min(0.6, t * 0.18) * st.spin, 0, Math.min(0.4, t * 0.1) * st.spin);
      b.rotation.set(0, 0, 0);
      break;
    }
  }
  // weitere Sektionen: driften entlang der zweiten Ebene auseinander, kippen und sinken versetzt
  if (st.subs.length) {
    const gap = Math.min(Math.max(st.L, st.W) * 0.22, t * 1.1);
    for (const s of st.subs) {
      s.g.position.set(s.dx * gap, -s.sink * t * t * 0.35, s.dz * gap);
      s.g.rotation.set(s.rot * Math.min(0.5, t * 0.12), 0, s.rot * Math.min(0.7, t * 0.16));
    }
  }
}

/** Drehung um die Querachse durch (0, y, 0) samt Versatz entlang z */
function rotX(g: Group, ang: number, y: number, dz: number) {
  g.rotation.set(ang, 0, 0);
  // Position so, dass der Punkt (0, y, 0) fest bleibt: p' = R·p + t ⇒ t = (0,y,0) − R·(0,y,0)
  const c = Math.cos(ang), s = Math.sin(ang);
  g.position.set(0, y - (y * c), dz - (y * s));
}
/** Drehung um die Längsachse durch (0, y, 0) samt Versatz entlang x */
function rotZ(g: Group, ang: number, y: number, dx: number) {
  g.rotation.set(0, 0, ang);
  const c = Math.cos(ang), s = Math.sin(ang);
  g.position.set(dx + y * s, y - y * c, 0);
}
