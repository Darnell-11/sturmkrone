// Kopfbedeckungen und Accessoires für die Anime-Figuren (am Kopfknochen befestigt).
import { ConeGeometry, CylinderGeometry, DoubleSide, Group, MathUtils, Matrix4, Mesh, SphereGeometry, TorusGeometry, BoxGeometry, Vector3, type BufferGeometry, type Object3D } from 'three';
import type { CharacterSocketId } from '../../data/characterRig';
import type { CharacterLook } from '../../data/characterParts';
import type { Anchors, CapShell } from './vroid';
import { templePath, type FaceField, type FaceMarks } from './beardStrands';
import { tube } from './gear/kit';
import { toon } from '../../render/toon';
import { addOutlines } from '../../render/outline';
import { markShared } from '../../render/dispose';
import { HELMS, HELM_KINDS, HEAD_R, HELM_RISE } from './gear/rigid';
import { finishMat } from './gear/kit';
import { beardStrandTexture } from './beardStrands';

/** Wird gesetzt, solange gemessene Anker gelten (dann hängt der Ohrring am Ohrläppchen statt am Hutrand) */
const ANCHORED = { earring: false };

/**
 * Baut den Kopfschmuck. Koordinaten relativ zur Kopfmitte (Höhe der Augen), Blick nach +Z, Maße in Metern.
 * r = halbe Kopfbreite.
 */
export function buildHeadgear(look: CharacterLook, r: number, outline: boolean, domeY?: number): Group {
  const g = new Group();
  const col = toon(look.hatColor);
  const dark = toon('#1E1A20');
  const gold = toon({ color: '#E3B04B', spec: 0.9 });
  const top = r * 0.95;
  switch (look.hat) {
    case 'dreispitz': {
      // Kuppel über dem Haar, drei hochgeschlagene Krempenwände, eine Spitze nach vorn (+Z)
      const t = new Group();
      t.rotation.x = 0.14; // leicht nach vorn geneigt, die Spitze zeigt über die Stirn
      g.add(t);
      const by = top * 0.3;
      const crown = new Mesh(new SphereGeometry(r * 1.25, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), col);
      crown.scale.set(1, 1.3, 1.05);
      crown.position.y = by;
      t.add(crown);
      // eine durchgehende, hochgeschlagene Krempe, zum abgerundeten Dreieck gekniffen (Spitze vorn)
      const h = r * 0.62;
      // die Krempe ragt um ein festes Maß über die Kuppel hinaus (bei voller Frisur sonst riesig)
      // bei voluminösen Frisuren nicht mitwachsen lassen (wirkte riesig)
      const rt = r * 1.24 + Math.min(r * 0.45, 0.045);
      const brim = new Mesh(tricornRing(r * 1.24, rt, h, 0), toon({ color: look.hatColor, side: DoubleSide }));
      brim.position.y = by + h / 2;
      const trim = new Mesh(tricornRing(rt + r * 0.01, rt + r * 0.04, r * 0.08, h / 2, true), gold);
      trim.position.y = by + h / 2;
      t.add(brim, trim);
      break;
    }
    case 'zweispitz': {
      const body = new Mesh(new SphereGeometry(r * 1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), col);
      body.scale.set(1.6, 0.8, 0.95);
      body.position.y = top * 0.85;
      const cock = new Mesh(new SphereGeometry(r * 0.16, 8, 6), gold);
      cock.position.set(r * 0.35, top * 0.85 + r * 0.55, r * 0.6);
      g.add(body, cock);
      break;
    }
    case 'bandana': {
      // liegt über dem Haar (die Anime-Frisuren haben viel Volumen)
      const cap = new Mesh(new SphereGeometry(r * 1.13, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), col);
      cap.position.y = top * 0.2;
      cap.scale.set(1, domeY ?? 1.08, 1.08);
      // umgeschlagener Saum über der Stirn: so wirkt es wie gebundener Stoff statt einer Kappe
      const hem = new Mesh(new TorusGeometry(r * 1.13, r * 0.07, 6, 28), col);
      hem.rotation.x = Math.PI / 2;
      hem.scale.set(1, 1.08, 1);
      hem.position.y = top * 0.2 + r * 0.06;
      g.add(hem);
      const knot = new Mesh(new SphereGeometry(r * 0.22, 8, 6), col);
      knot.position.set(0, top * 0.2 + r * 1.13 * (domeY ?? 1.08) * 0.35, -r * 1.12);
      const tail = new Mesh(new ConeGeometry(r * 0.18, r * 0.9, 4), col);
      tail.position.set(r * 0.12, top * 0.05, -r * 1.2);
      tail.rotation.x = 2.6;
      g.add(cap, knot, tail);
      break;
    }
    case 'muetze': {
      const cap = new Mesh(new SphereGeometry(r * 1.12, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), col);
      cap.position.y = top * 0.35;
      cap.scale.y = domeY ?? 1.15;
      const rim = new Mesh(new TorusGeometry(r * 1.1, r * 0.13, 6, 20), col);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = top * 0.38;
      g.add(cap, rim);
      break;
    }
    case 'marine': {
      // 4.6G: der Deckel trägt die Hutfarbe (Standard Weiß), Band und Schirm bleiben dunkel
      const cap = new Mesh(new CylinderGeometry(r * 1.25, r * 1.08, r * 0.55, 20), col);
      cap.position.y = top * 0.88;
      const band = new Mesh(new CylinderGeometry(r * 1.1, r * 1.1, r * 0.22, 20), dark);
      band.position.y = top * 0.7;
      const visor = new Mesh(new SphereGeometry(r * 0.9, 12, 6, 0, Math.PI, 0, Math.PI / 2), dark);
      visor.scale.set(1, 0.15, 0.8);
      visor.rotation.y = -Math.PI / 2;
      visor.position.set(0, top * 0.62, r * 0.75);
      const badge = new Mesh(new SphereGeometry(r * 0.15, 8, 6), gold);
      badge.position.set(0, top * 0.75, r * 1.1);
      g.add(cap, band, visor, badge);
      break;
    }
    case 'kochmuetze': {
      const band = new Mesh(new CylinderGeometry(r * 1.05, r * 1.05, r * 0.4, 18), col);
      band.position.y = top * 0.75;
      const puff = new Mesh(new SphereGeometry(r * 1.25, 16, 10), col);
      puff.scale.y = 0.85;
      puff.position.y = top * 0.75 + r * 0.9;
      g.add(band, puff);
      break;
    }
    case 'suedwester': {
      const cap = new Mesh(new SphereGeometry(r * 1.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), col);
      cap.position.y = top * 0.4;
      cap.scale.y = domeY ?? 1;
      const brim = new Mesh(new CylinderGeometry(r * 1.6, r * 1.75, r * 0.1, 20), col);
      brim.position.set(0, top * 0.4, -r * 0.15);
      brim.rotation.x = -0.15;
      g.add(cap, brim);
      break;
    }
    case 'helm': {
      const steel = toon({ color: '#9AA0A8', spec: 1 });
      const dome = new Mesh(new SphereGeometry(r * 1.18, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), steel);
      dome.position.y = top * 0.25;
      dome.scale.y = domeY ?? 1;
      const ridge = new Mesh(new BoxGeometry(r * 0.12, r * 0.3, r * 2.2), steel);
      ridge.position.y = top * 0.25 + r * 1.1 * (domeY ?? 1);
      const rim = new Mesh(new TorusGeometry(r * 1.2, r * 0.07, 6, 22), steel);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = top * 0.3;
      g.add(dome, ridge, rim);
      break;
    }
    default: break;
  }
  if (look.earring && !ANCHORED.earring) {
    const ring = new Mesh(new TorusGeometry(r * 0.12, r * 0.03, 6, 12), gold);
    ring.position.set(-r * 1.0, -r * 0.45, 0);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
  }
  // kein Schattenwurf: ein harter Hutschatten färbt das ganze Anime-Gesicht grau
  g.traverse((o) => { (o as Mesh).castShadow = false; });
  if (outline) addOutlines(g, 0.7);
  return g;
}

/**
 * Starre Kleinteile der Kleidung. Jedes wird im Raum eines Knochens gebaut (Hüfte bzw. Brust) und hängt an einem
 * Haut-Anker (sockets.ts), der sich mit dem Stoff darunter bewegt – so sitzt es in jeder Pose auf Band bzw. Schulter.
 */
function finish(g: Group, outline: boolean) {
  g.traverse((o) => { (o as Mesh).castShadow = true; });
  if (outline) addOutlines(g, 0.7);
  return g;
}

/** Knoten der Schärpe mit herabhängendem Ende (Hüftraum) */
export function buildKnot(color: string, pos: Vector3, outline: boolean): Group {
  const g = new Group();
  const acc = toon(color);
  const knot = new Mesh(new SphereGeometry(0.022, 8, 6), acc);
  knot.position.copy(pos);
  const tail = new Mesh(new BoxGeometry(0.03, 0.12, 0.008), acc);
  tail.position.copy(pos).add(new Vector3(0, -0.07, 0));
  tail.lookAt(pos.clone().multiplyScalar(2).setY(tail.position.y));
  tail.rotateZ(0.12);
  g.add(knot, tail);
  return finish(g, outline);
}

/** Schnalle des Koppels (Hüftraum) */
export function buildBuckle(pos: Vector3, outline: boolean): Group {
  const g = new Group();
  const buckle = new Mesh(new BoxGeometry(0.05, 0.034, 0.01), toon({ color: '#E3B04B', spec: 0.9 }));
  buckle.position.copy(pos);
  buckle.lookAt(pos.clone().multiplyScalar(2).setY(pos.y));
  g.add(buckle);
  return finish(g, outline);
}

/** Eine gewölbte Schulterplatte aus Stahl (Brustraum), sitzt außen über dem Schultergelenk */
export function buildPauldron(sp: Vector3, color: string, outline: boolean): Group {
  const g = new Group();
  const steel = toon({ color, spec: 1, side: DoubleSide });
  const s = sp.x < 0 ? -1 : 1;
  const dome = new Mesh(new SphereGeometry(0.058, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  dome.scale.set(1, 0.6, 1.15);
  dome.position.set(sp.x + s * 0.022, sp.y - 0.012, sp.z);
  dome.rotation.z = -s * 0.55;
  const rim = new Mesh(new TorusGeometry(0.058, 0.005, 5, 20), toon({ color: '#E3B04B', spec: 0.9 }));
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, 1.15, 1);
  dome.add(rim);
  g.add(dome);
  return finish(g, outline);
}

/** 4.6G: ein Knopf (Brustraum, das Gesicht des Knochens schaut nach −Z): gewölbte Metallscheibe mit Rand, gemeinsame Geometrie */
const BUTTON_GEO = new SphereGeometry(0.0075, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const BUTTON_RIM = new TorusGeometry(0.0072, 0.0014, 4, 14);
markShared(BUTTON_GEO); markShared(BUTTON_RIM);
export function buildButton(pos: Vector3, color: string): Group {
  const g = new Group();
  const metal = toon({ color, spec: 1 });
  const dome = new Mesh(BUTTON_GEO, metal);
  dome.rotation.x = -Math.PI / 2;
  dome.scale.set(1, 0.45, 1);
  const rim = new Mesh(BUTTON_RIM, metal);
  g.add(dome, rim);
  g.position.copy(pos);
  g.traverse((o) => { (o as Mesh).castShadow = false; });
  return g;
}

/** Ein goldenes Schulterstück mit Fransen (Brustraum) */
export function buildEpaulette(sp: Vector3, outline: boolean): Group {
  const g = new Group();
  const gold = toon({ color: '#E3B04B', spec: 0.9 });
  const s = sp.x < 0 ? -1 : 1;
  const plate = new Mesh(new CylinderGeometry(0.042, 0.042, 0.008, 16), gold);
  plate.position.copy(sp);
  plate.rotation.z = -s * 0.2;
  g.add(plate);
  for (let k = 0; k < 5; k++) {
    const fr = new Mesh(new CylinderGeometry(0.003, 0.003, 0.026, 4), gold);
    const a = (k / 4 - 0.5) * 1.6;
    fr.position.set(sp.x + s * 0.04, sp.y - 0.014, sp.z + Math.sin(a) * 0.03);
    g.add(fr);
  }
  return finish(g, outline);
}

/** Kopfschmuck an einen Kopfknochen hängen: Mitte, Blickrichtung und Größe aus den Augenknochen */
/**
 * Ring für den Dreispitz: unten Radius rb, oben rt, zum abgerundeten Dreieck gekniffen (eine Ecke nach +Z).
 * y0 verschiebt den Ring (für die Borte an der Oberkante).
 */
function tricornRing(rb: number, rt: number, h: number, y0: number, full = false) {
  const g = new CylinderGeometry(rt, rb, h, 60, 1, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const th = Math.atan2(x, z);
    const phi = MathUtils.euclideanModulo(th, (Math.PI * 2) / 3) - Math.PI / 3;
    // Ecken weich: höchstens 1,45-fach, und unten (an der Kuppel) fast rund
    const up = full ? 1 : (y + h / 2) / h;
    const k = 1 + (Math.min(1.45, 1 / Math.cos(phi)) - 1) * (0.35 + 0.65 * up);
    p.setXYZ(i, x * k, y + y0, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Öffnungsradius (Vielfaches von r) und Höhe der Unterkante (Vielfaches von r) je Hut –
 * damit der Hut auf dem Haar sitzt statt darin zu versinken oder darüber zu schweben.
 */
const HAT_SEAT: Partial<Record<string, { open: number; base: number; sink: number }>> = {
  dreispitz: { open: 1.25, base: 0.285, sink: 0.055 }, zweispitz: { open: 1.14, base: 0.81, sink: 0.05 }, bandana: { open: 1.13, base: 0.19, sink: 0.08 },
  muetze: { open: 1.12, base: 0.33, sink: 0.075 }, marine: { open: 1.1, base: 0.56, sink: 0.05 }, kochmuetze: { open: 1.05, base: 0.51, sink: 0.05 },
  suedwester: { open: 1.12, base: 0.38, sink: 0.065 }, helm: { open: 1.18, base: 0.24, sink: 0.065 },
};

/** Rand über dem Sitz, den Kappen im Haar stehen lassen (m, wie CAP_RIM in vroid.ts) */
export const CAP_RIM_DEFAULT = 0.035;

/** 4.6G.2: Hüte ohne Kappe (auf das Haar gesetzt): Sitztiefe fürs Stauchen der Frisur darunter; null = kein Hut */
export function hairSqueezeFor(hat: string): { sink: number; rim: number } | null {
  const h = HAT_SEAT[hat];
  return h ? { sink: h.sink, rim: 0.012 } : null;
}

/** Form des Haars im Kopfraum: liefert für eine Eindringtiefe (m) Sitzhöhe, Mitte und Halbmesser */
export type HairFit = (sink: number) => { seat: number; cx: number; cz: number; radius: number } | null;

/** Teile, die die Grundfigur aus ihrer Form erzeugt (Bart, Narbe) */
export interface FaceParts {
  beard: BufferGeometry | null; scar: { pos: Vector3; tilt: number } | null; cap?: (sink: number, margin: number) => CapShell | null;
  /** 4.6G.2: Radius-Feld des Gesichts (Brillenbügel liegen an der Kopfseite an) */
  field?: { field: FaceField; marks: FaceMarks } | null;
}

/** Kopfbedeckungen, die sich als gemessene Kappe um die Frisur legen: Sitztiefe und Abstand zum Haar */
export const CAPPED: Partial<Record<string, { sink: number; margin: number }>> = { kochmuetze: { sink: 0.06, margin: 0.006 }, zweispitz: { sink: 0.06, margin: 0.007 }, bandana: { sink: 0.095, margin: 0.005 }, muetze: { sink: 0.08, margin: 0.009 }, suedwester: { sink: 0.07, margin: 0.008 }, helm: { sink: 0.07, margin: 0.01 }, ...Object.fromEntries(HELM_KINDS.map((k) => [k, { sink: 0.13, margin: 0.012 }])) };

/**
 * Senkrechte Streckung einer Hut-Halbkugel (Radius R, Mitte capY über dem Hutursprung), damit sie die Frisur
 * überall umschließt und oben knapp darüber endet – statt als hohe Schüssel über dem Kopf zu stehen.
 */
function domeFit(fit: HairFit, seat: { open: number; base: number; sink: number }, hr: number, capY: number, R: number): number {
  const f0 = fit(seat.sink);
  if (!f0) return 1;
  const cy = f0.seat - seat.base * hr + capY;
  let sy = (f0.seat + seat.sink + 0.012 - cy) / R;
  for (let s = 0.004; s < seat.sink; s += 0.005) {
    const f = fit(s);
    if (!f) continue;
    const y = f.seat - cy, rh = f.radius * 1.03;
    if (y <= 0) continue;
    sy = rh >= R * 0.98 ? Math.max(sy, 1.35) : Math.max(sy, y / (R * Math.sqrt(1 - (rh / R) ** 2)));
  }
  return Math.min(1.35, Math.max(0.5, sy));
}
const DOME: Partial<Record<string, { R: number; capY: number }>> = {
  bandana: { R: 1.13, capY: 0.95 * 0.2 }, muetze: { R: 1.12, capY: 0.95 * 0.35 }, suedwester: { R: 1.12, capY: 0.95 * 0.4 }, helm: { R: 1.18, capY: 0.95 * 0.25 },
};

/** Was attachHeadgear von den Sockets braucht (CharacterSockets erfüllt es) */
export interface SocketHost { get(id: CharacterSocketId): Object3D | null }

const _m = new Matrix4();

/**
 * Teil (im Raum des Kopfknochens gebaut) an seinen Socket hängen (4.6G): die Lage am Kopf bleibt exakt gleich, im Socket steht danach
 * der Versatz in Metern der Grundfigur – den prüfen `SOCKET_BOUNDS` und `CharacterSockets.audit`. Ohne Socket hängt es am Kopfknochen.
 */
function seatOn(part: Object3D, id: CharacterSocketId, head: Object3D, sockets: SocketHost | null) {
  part.userData.socket = id;
  const n = sockets?.get(id) ?? null;
  if (!n || n.parent !== head) { head.add(part); return; }
  part.updateMatrix();
  n.updateMatrix();
  _m.copy(n.matrix).invert().multiply(part.matrix);
  _m.decompose(part.position, part.quaternion, part.scale);
  n.add(part);
}

/**
 * Kopfschmuck an den Kopf hängen: Hut, Brille, Augenklappe, Ohrring, Bart, Narbe. Gebaut wird im Raum des Kopfknochens (gemessene Augen,
 * Frisurform, Ohrläppchen), danach sitzt jedes Teil an seinem Socket (Hüte am Scheitel, Brillen und Narbe vorm Gesicht, Monokel und
 * Augenklappe am Auge, Bart und Ohrring am Kiefer). Gibt die Teile zurück (der Aufrufer gibt sie frei).
 */
export function attachHeadgear(head: Object3D, eyeL: Object3D | null, eyeR: Object3D | null, look: CharacterLook, outline: boolean, fit: HairFit | null = null, an: Anchors | null = null, face: FaceParts | null = null, sockets: SocketHost | null = null): Object3D[] {
  const beardOn = !!face?.beard && look.beard !== 'keiner';
  const scarOn = !!face?.scar && look.scar;
  const glasses = look.glasses && look.glasses !== 'keine' ? look.glasses : null;
  const parts: Object3D[] = [];
  if ((look.hat === 'keiner' || !look.hat) && !look.eyepatch && !look.earring && !beardOn && !scarOn && !glasses) return parts;
  const put = (o: Object3D, id: CharacterSocketId) => { seatOn(o, id, head, sockets); parts.push(o); };
  ANCHORED.earring = !!an;
  // Augenmitte im Kopfraum; Kopfbreite aus dem Augenabstand
  const l = eyeL?.position, rr = eyeR?.position;
  const cx = l && rr ? (l.x + rr.x) / 2 : 0, cy = l && rr ? (l.y + rr.y) / 2 : 0.06, cz = l && rr ? (l.z + rr.z) / 2 + 0.07 : 0;
  const width = l && rr ? Math.abs(l.x - rr.x) : 0.065;
  // Kopf samt Haarvolumen ist deutlich breiter als der Augenabstand
  const r = Math.max(0.12, width * 2.7);
  // 4.6G: Gesichtsoberfläche vor den Augen (Kopfraum, −Z = vorn) – gemessen; die Augenknochen liegen 7 bis 8 cm dahinter
  const faceZ = an?.faceZ ?? (l && rr ? (l.z + rr.z) / 2 - 0.075 : -0.1);
  // Kappe aus der Frisurform (Kopftuch, Mütze, Südwester, Helm) statt einer starren Halbkugel
  const capCfg = CAPPED[look.hat];
  const shell = capCfg && face?.cap ? face.cap(capCfg.sink, capCfg.margin) : null;
  const seatCfg = fit && !shell ? HAT_SEAT[look.hat] : undefined;
  // Ersatz-Hut (ohne gemessene Frisur) und Ohrring ohne Anker: um die Augenmitte
  const acc = buildHeadgear((seatCfg && fit?.(seatCfg.sink)) || shell ? { ...look, hat: 'keiner' } : look, r, outline);
  ANCHORED.earring = false;
  acc.position.set(cx, cy, cz);
  // Der Kopfknochen der VRoid-Figur schaut nach −Z (die Figur ist um 180° gedreht)
  acc.rotation.y = Math.PI;
  if (acc.children.length) put(acc, 'headTop');
  const f = seatCfg && fit ? fit(seatCfg.sink) : null;
  if (seatCfg && f) {
    // Hut passend zur Frisur: Öffnung so weit wie das Haar auf Sitzhöhe
    const hr = (f.radius * 1.04) / seatCfg.open;
    const d = DOME[look.hat];
    const hat = buildHeadgear({ ...look, eyepatch: false, earring: false }, hr, outline, d && fit ? domeFit(fit, seatCfg, hr, d.capY * hr, d.R * hr) : undefined);
    hat.position.set(f.cx, f.seat - seatCfg.base * hr, f.cz);
    hat.rotation.y = Math.PI;
    put(hat, 'headTop');
  }
  if (shell) put(capHat(look, shell, outline), 'headTop');
  if (look.eyepatch && rr) {
    // Augenklappe direkt auf dem rechten Auge (Gesichtsfläche liegt ~5 cm vor dem Augenknochen, Blick nach −Z)
    const dark = toon('#1E1A20');
    const g = new Group();
    const patch = new Mesh(new SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    patch.rotation.x = -Math.PI / 2;
    // flache Wölbung (4.6G.2: 1 cm statt 1,2 cm – darüber hat eine Brille Platz)
    patch.scale.set(1.05, EYEPATCH_DEPTH / 0.03, 0.9);
    // 4.6G: auf der gemessenen Haut vor dem Auge (vorher 3 cm im Gesicht versunken), Rand leicht eingesenkt
    patch.position.set(rr.x, rr.y, faceZ + PATCH_SINK);
    // Band: vorn auf Höhe der Klappe, steigt nach hinten über die Ohren an und läuft um den Hinterkopf
    const R = 0.1, tilt = 0.25;
    const band = new Mesh(new TorusGeometry(R, 0.004, 4, 32), dark);
    band.rotation.set(Math.PI / 2 - tilt, 0, 0);
    band.position.set(cx, rr.y + R * Math.sin(tilt), faceZ - 0.003 + R * Math.cos(tilt));
    g.add(patch, band);
    g.traverse((o) => { (o as Mesh).castShadow = false; });
    if (outline) addOutlines(patch, 0.7);
    put(g, 'eyeRight');
  }
  if (glasses === 'flieger' && fit && an) {
    // Fliegerbrille: Riemen um die Frisur auf Stirnhöhe, Gläser vorn auf dem Pony (vorher im Haar versunken)
    const top = fit(0)?.seat ?? an.eyeY + 0.15;
    const fs = fit(Math.max(0.01, top - (an.eyeY + 0.05)));
    if (fs) {
      const dark = toon('#2A2220'), brass = toon({ color: '#C9A13B', spec: 1 });
      const glassMat = toon({ color: '#7FA8B8', spec: 1 });
      const gog = new Group();
      // Schädelbreite statt Frisurbreite (seitlich abstehende Zöpfe machten den Riemen zum Heiligenschein)
      const rad = Math.min(fs.radius, 0.112);
      const strap = new Mesh(new TorusGeometry(rad + 0.006, 0.006, 6, 32), dark);
      strap.rotation.x = Math.PI / 2;
      strap.position.set(fs.cx, fs.seat, fs.cz);
      gog.add(strap);
      for (const s of [-1, 1]) {
        const lens = new Mesh(new CylinderGeometry(0.019, 0.021, 0.018, 14), brass);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(fs.cx + s * 0.03, fs.seat + 0.004, fs.cz - rad - 0.008);
        const glass = new Mesh(new CylinderGeometry(0.0145, 0.0145, 0.004, 14), glassMat);
        glass.rotation.x = Math.PI / 2;
        glass.position.set(fs.cx + s * 0.03, fs.seat + 0.004, fs.cz - rad - 0.0175);
        gog.add(lens, glass);
      }
      gog.traverse((o) => { (o as Mesh).castShadow = false; });
      if (outline) addOutlines(gog, 0.7);
      put(gog, 'faceFront');
    }
  } else if (glasses === 'rund' && l && rr) {
    // 4.6G.2: über einer Augenklappe sitzt die Brille ein Stück weiter vorn (die Klappe ragt sonst durch das rechte Glas)
    put(roundGlasses(l, rr, an, faceZ, outline, look.eyepatch ? Math.max(0, EYEPATCH_DEPTH - PATCH_SINK - LENS_GAP + 0.004) : 0, face?.field?.field ?? null), 'faceFront');
  } else if (glasses === 'monokel' && l && rr) {
    // Monokel aufs freie Auge (unter einer Augenklappe rechts wandert es nach links)
    const e = look.eyepatch ? l : rr;
    put(monocle(e, look.eyepatch ? 1 : -1, faceZ, outline), look.eyepatch ? 'eyeLeft' : 'eyeRight');
  }
  if (look.earring && an) {
    // Ohrring hängt am gemessenen Ohrläppchen (rechtes Ohr), Ring in der Seitenebene
    const ring = new Mesh(new TorusGeometry(0.0075, 0.0016, 6, 14), toon({ color: '#E3B04B', spec: 0.9 }));
    ring.position.set(an.earLobe.x + 0.002, an.earLobe.y - 0.0065, an.earLobe.z);
    ring.rotation.y = Math.PI / 2;
    ring.castShadow = false;
    put(ring, 'beardJaw');
  }
  if (beardOn) {
    // 4.6G.2: Strähnen-Bart mit feiner Haar-Textur (Schmiede-Pfad des Figuren-Shaders, kein neues Programm) und Lichtband wie das Haar;
    // Stoppeln liegen knapp auf der Haut: kleine Tiefenverschiebung gegen Flackern
    const geo = face!.beard!;
    const tex = beardStrandTexture();
    const hairC = (geo.userData.hairC as [number, number, number] | undefined) ?? [0, 0.08, 0];
    const mat = toon({ color: look.hairColor, surface: 'hair', hairC, rim: 0.35, unique: true, ...(tex ? { forgeTex: { tex, depth: 0.0004, rough: 0.6 }, forgeScale: 0.09 } : {}) });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -3;
    const beard = new Mesh(geo, mat);
    beard.castShadow = false;
    beard.name = `bart:${look.beard}`;
    put(beard, 'beardJaw');
  }
  if (scarOn) {
    // schmaler, leicht gebogener Strich über der Wange (dunkler als die Haut)
    const sc = face!.scar!;
    const scar = new Mesh(new BoxGeometry(0.0028, 0.03, 0.0015), toon({ color: '#7A3A30', rim: 0 }));
    scar.position.copy(sc.pos);
    scar.rotation.z = sc.tilt;
    scar.userData.noOutline = true;
    scar.castShadow = false;
    put(scar, 'faceFront');
  }
  return parts;
}

/** Abstand der Gläser vor der Gesichtshaut (m, Kopfraum): knapp vor Lidern und Wimpern */
export const LENS_GAP = 0.006;
/** Wölbung der Augenklappe vor der Haut (m); eine Brille darüber rückt um so viel plus 4 mm nach vorn */
export const EYEPATCH_DEPTH = 0.0095;
/** so weit sitzt der Rand der Augenklappe hinter der vordersten Gesichtshaut (eingesenkt) */
export const PATCH_SINK = 0.005;

/**
 * Runde Drahtbrille (4.6G.2): zwei Fassungen vor den Augen, Steg über der Nase; die Endstücke laufen in der Glasebene bis zum Scharnier knapp außen
 * an Schläfe und Schädel (gemessen), dort knicken die Bügel im rechten Winkel nach hinten, laufen gerade (keine abstehenden Stangen) und leicht
 * abfallend über das Ohr und enden in einem kurzen Ohrhaken. `ahead` schiebt die Brille nach vorn (über einer Augenklappe).
 */
export function roundGlasses(l: Vector3, r: Vector3, an: Anchors | null, faceZ: number, outline: boolean, ahead = 0, field: FaceField | null = null): Group {
  const g = new Group();
  const wire = toon({ color: '#C9A13B', spec: 1 });
  const R = Math.min(0.019, Math.abs(l.x - r.x) * 0.31);
  const y = (l.y + r.y) / 2 - 0.002, z = faceZ - LENS_GAP - ahead;
  for (const e of [l, r]) {
    const ring = new Mesh(new TorusGeometry(R, 0.0017, 6, 28), wire);
    ring.position.set(e.x, y, z);
    // Glas ohne Scheibe (die Augen bleiben sichtbar), nur ein schräger Lichtreflex wie in Anime-Zeichnungen
    g.add(ring, glint(e.x, y, z, R));
  }
  // Steg: flacher Bogen zwischen den Fassungen
  const gap = Math.abs(l.x - r.x) - 2 * R;
  const bridge = new Mesh(new TorusGeometry(Math.max(0.004, gap / 2), 0.0015, 4, 10, Math.PI), wire);
  bridge.position.set((l.x + r.x) / 2, y + R * 0.35, z);
  g.add(bridge);
  const mid = (l.x + r.x) / 2;
  const yF = y + 0.004;
  const earZ = an ? an.earLobe.z : z + 0.09;
  const yE = Math.min(yF, Math.max(yF - 0.02, (an?.earTopY ?? yF - 0.008) + 0.003));
  // Bügelweg: an der gemessenen Kopfseite entlang (Schläfe, über dem Ohr); ohne Feld gerade nach hinten am Scharnier
  const z0 = z + 0.004, z1 = earZ + 0.006;
  const path = field ? templePath(field, yF, z0, z1, 0.0025) : null;
  const hingeX = Math.max(templeHinge(Math.abs(l.x - mid) + R, an, Math.abs(l.x - r.x)) * (path ? 0 : 1), path ? Math.max(Math.abs(l.x - mid) + R + 0.003, path[0][0]) : 0);
  for (const e of [l, r]) {
    const s = Math.sign(e.x - mid) || 1;
    const ax = e.x + s * R, hx = mid + s * hingeX;
    // Endstück in der Glasebene bis zum Scharnier
    const end = new Mesh(new BoxGeometry(Math.max(0.002, Math.abs(hx - ax)), 0.0024, 0.0024), wire);
    end.position.set((ax + hx) / 2, yF, z);
    // Scharnier: kleiner Block am Knick (rechter Winkel)
    const hinge = new Mesh(new BoxGeometry(0.0034, 0.0034, 0.0044), wire);
    hinge.position.set(hx, yF, z + 0.0012);
    g.add(end, hinge);
    // Bügel: vom Scharnier im rechten Winkel nach hinten, an der Kopfseite entlang bis über das Ohr, leicht abfallend
    const pts: [number, number, number][] = path
      ? path.map(([px, pz], i) => [mid + s * Math.max(hingeX, px), yF + (yE - yF) * (i / (path.length - 1)), pz])
      : [[hx, yF, z0], [hx, yE, z1]];
    pts.unshift([hx, yF, z + 0.001]);
    // Ohrhaken: hinter dem Ohr nach unten gebogen
    const last = pts[pts.length - 1];
    pts.push([last[0] - s * 0.001, yE - 0.006, z1 + 0.008], [last[0] - s * 0.003, yE - 0.017, z1 + 0.011]);
    g.add(new Mesh(tube(pts, 0.0011, 24, 5), wire));
  }
  g.traverse((o) => { (o as Mesh).castShadow = false; });
  if (outline) addOutlines(g, 0.7);
  return g;
}

/**
 * Halbe Breite am Scharnier (Kopfraum): knapp außen an Glasrand und Schläfe – nach dem rechtwinkligen Knick laufen die Bügel gerade nach
 * hinten und verschwinden hinter der Schläfe im Haar; nichts steht seitlich über das Gesicht hinaus.
 */
export function templeHinge(lensEdge: number, an: Pick<Anchors, 'templeX' | 'skullX'> | null, eyeDist: number): number {
  const temple = an?.templeX ?? eyeDist * 1.4;
  return Math.max(lensEdge + 0.003, temple + 0.002);
}

/** Lichtreflex auf einem Brillenglas (Anime-Glanzstrich oben im Glas, schräg), ohne die Augen zu verdecken */
const GLINT_GEO = markShared(new BoxGeometry(1, 1, 1));
function glint(x: number, y: number, z: number, R: number): Group {
  const g = new Group();
  const white = toon({ color: '#FFFFFF', spec: 1 });
  for (const [len, off] of [[R * 0.9, 0.42], [R * 0.4, 0.05]] as const) {
    const b = new Mesh(GLINT_GEO, white);
    b.scale.set(len, R * 0.12, 0.0005);
    b.rotation.z = -0.75;
    b.position.set(x - R * off * 0.6, y + R * (0.3 + off * 0.35), z - 0.0004);
    g.add(b);
  }
  return g;
}

/** Monokel: goldene Fassung vor einem Auge, eine feine Kette fällt zur Wange (s = Seite des Auges, ±1 in x) */
function monocle(e: Vector3, s: number, faceZ: number, outline: boolean): Group {
  const g = new Group();
  const gold = toon({ color: '#E3B04B', spec: 1 });
  const R = 0.0175;
  const ring = new Mesh(new TorusGeometry(R, 0.0021, 6, 28), gold);
  ring.position.set(e.x, e.y, faceZ - LENS_GAP + 0.002);
  g.add(ring, glint(e.x, e.y, ring.position.z, R));
  // Kette: drei kurze Glieder vom unteren äußeren Rand schräg nach unten zur Wange
  for (let k = 0; k < 3; k++) {
    const link = new Mesh(new TorusGeometry(0.0028, 0.0007, 4, 8), gold);
    link.position.set(e.x + s * (R * 0.7 + k * 0.004), e.y - R * 0.8 - k * 0.0062, ring.position.z + 0.004 + k * 0.005);
    link.rotation.set(0, k % 2 ? Math.PI / 2 : 0, 0);
    g.add(link);
  }
  g.traverse((o) => { (o as Mesh).castShadow = false; });
  if (outline) addOutlines(g, 0.7);
  return g;
}

/** Kopfbedeckung um eine gemessene Kappe (Kopfraum der Figur: Gesicht schaut nach −Z, hinten ist +Z) */
function capHat(look: CharacterLook, sh: CapShell, outline: boolean): Group {
  const g = new Group();
  const cloth = toon({ color: look.hatColor, side: DoubleSide });
  sh.geo.computeBoundingBox();
  const topY = sh.geo.boundingBox!.max.y;
  const ring = (radius: number, tube: number, y: number, mat = cloth) => {
    const t = new Mesh(new TorusGeometry(radius, tube, 6, 32), mat);
    t.rotation.x = Math.PI / 2;
    t.position.set(sh.cx, y, sh.cz);
    return t;
  };
  const gearHelm = HELMS[look.hat];
  if (gearHelm) {
    // Ausrüstungshelm (gear/rigid.ts): Kappe um die Frisur in der gewählten Oberfläche plus Zierteile
    // enge Schädelkuppel statt der weiten Frisurkappe (das Haar darüber ist ausgeblendet) und ein Rand über der Stirn
    const r = gearHelm({ sh, topY: sh.seatY + HELM_RISE, c: look.hatColor, c2: look.hatAccent ?? '#E3B04B' });
    const cm = finishMat(r.cap.finish, r.cap.color ?? look.hatColor);
    const skull = new Mesh(new SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), cm);
    skull.scale.set(HEAD_R, HELM_RISE, HEAD_R * 1.04);
    skull.position.set(sh.cx, sh.seatY, sh.cz);
    g.add(skull, r.bag.build());
    g.traverse((o) => { (o as Mesh).castShadow = false; });
    return g;
  }
  switch (look.hat) {
    case 'bandana': {
      g.add(new Mesh(sh.geo, cloth));
      // Knoten hinten am Rand, zwei kurze Enden hängen herab
      const knot = new Mesh(new SphereGeometry(0.018, 8, 6), cloth);
      knot.position.set(sh.cx, sh.seatY + 0.02, sh.cz + sh.ringR);
      g.add(knot);
      for (const s of [-1, 1]) {
        const tail = new Mesh(new ConeGeometry(0.014, 0.07, 4), cloth);
        tail.position.set(sh.cx + s * 0.012, sh.seatY - 0.02, sh.cz + sh.ringR + 0.006);
        tail.rotation.set(Math.PI + 0.25, 0, s * 0.25);
        g.add(tail);
      }
      break;
    }
    case 'muetze':
      g.add(new Mesh(sh.geo, cloth), ring(sh.ringR + 0.004, 0.012, sh.seatY + 0.008));
      break;
    case 'kochmuetze': {
      // Kochmütze: Kappe um die Frisur, Band am Rand, darüber der Bausch (sitzt auf, statt zu schweben); Farbe = Hutfarbe (4.6G)
      const white = toon({ color: look.hatColor, side: DoubleSide });
      const puff = new Mesh(new SphereGeometry(sh.ringR * 0.95, 16, 10), white);
      puff.scale.y = 0.75;
      puff.position.set(sh.cx, topY + sh.ringR * 0.45, sh.cz);
      g.add(new Mesh(sh.geo, white), ring(sh.ringR + 0.004, 0.014, sh.seatY + 0.012, white), puff);
      break;
    }
    case 'zweispitz': {
      // Zweispitz: Kappe um die Frisur, darauf quer ein aufrechter Halbkreis (Krempe hochgeschlagen), vorn die Kokarde
      g.add(new Mesh(sh.geo, cloth));
      const R = Math.max(sh.ringR * 1.25, topY - sh.seatY + 0.045);
      const fan = new Mesh(new CylinderGeometry(R, R, 0.022, 28, 1, false, -Math.PI / 2, Math.PI), cloth);
      fan.rotation.x = -Math.PI / 2;
      fan.position.set(sh.cx, sh.seatY + 0.004, sh.cz);
      const trim = new Mesh(new TorusGeometry(R, 0.004, 4, 28, Math.PI), toon({ color: '#E3B04B', spec: 0.9 }));
      trim.position.set(sh.cx, sh.seatY + 0.004, sh.cz);
      const cock = new Mesh(new SphereGeometry(0.016, 8, 6), toon({ color: '#E3B04B', spec: 0.9 }));
      cock.position.set(sh.cx + R * 0.35, sh.seatY + R * 0.55, sh.cz - 0.014);
      g.add(fan, trim, cock);
      break;
    }
    case 'suedwester': {
      g.add(new Mesh(sh.geo, cloth));
      const brim = new Mesh(new CylinderGeometry(sh.ringR * 1.42, sh.ringR * 1.55, 0.007, 28), cloth);
      brim.position.set(sh.cx, sh.seatY + 0.004, sh.cz + 0.012);
      brim.rotation.x = 0.12; // hinten tiefer (Regen läuft in den Nacken ab)
      g.add(brim);
      break;
    }
    case 'helm': {
      const steel = toon({ color: '#9AA0A8', spec: 1, side: DoubleSide });
      const dome = new Mesh(sh.geo, steel);
      // Kamm nur so lang wie die Kuppel oben breit ist (ragte sonst als Stange vorn und hinten heraus)
      const ridge = new Mesh(new BoxGeometry(0.008, 0.02, sh.ringR * 0.85), steel);
      ridge.position.set(sh.cx, topY - 0.002, sh.cz);
      g.add(dome, ridge, ring(sh.ringR + 0.006, 0.006, sh.seatY + 0.004, steel));
      break;
    }
  }
  g.traverse((o) => { (o as Mesh).castShadow = false; });
  if (outline) addOutlines(g, 0.7);
  return g;
}
