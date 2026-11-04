// Kopfbedeckungen und Accessoires für die Anime-Figuren (am Kopfknochen befestigt).
import { ConeGeometry, CylinderGeometry, DoubleSide, Group, MathUtils, Mesh, SphereGeometry, TorusGeometry, BoxGeometry, type Object3D } from 'three';
import type { CharacterLook } from '../../data/characterParts';
import { toon } from '../../render/toon';
import { addOutlines } from '../../render/outline';

/**
 * Baut den Kopfschmuck. Koordinaten relativ zur Kopfmitte (Höhe der Augen), Blick nach +Z, Maße in Metern.
 * r = halbe Kopfbreite.
 */
export function buildHeadgear(look: CharacterLook, r: number, outline: boolean): Group {
  const g = new Group();
  const col = toon(look.hatColor);
  const dark = toon('#1E1A20');
  const gold = toon({ color: '#E3B04B', spec: 0.9 });
  const white = toon('#F4F1E8');
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
      const rt = r * 1.24 + Math.min(r * 0.71, 0.065);
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
      cap.scale.set(1, 1.08, 1.08);
      // umgeschlagener Saum über der Stirn: so wirkt es wie gebundener Stoff statt einer Kappe
      const hem = new Mesh(new TorusGeometry(r * 1.13, r * 0.07, 6, 28), col);
      hem.rotation.x = Math.PI / 2;
      hem.scale.set(1, 1.08, 1);
      hem.position.y = top * 0.2 + r * 0.06;
      g.add(hem);
      const knot = new Mesh(new SphereGeometry(r * 0.22, 8, 6), col);
      knot.position.set(0, top * 0.45, -r * 1.1);
      const tail = new Mesh(new ConeGeometry(r * 0.18, r * 0.9, 4), col);
      tail.position.set(r * 0.12, top * 0.05, -r * 1.2);
      tail.rotation.x = 2.6;
      g.add(cap, knot, tail);
      break;
    }
    case 'muetze': {
      const cap = new Mesh(new SphereGeometry(r * 1.12, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), col);
      cap.position.y = top * 0.35;
      cap.scale.y = 1.15;
      const rim = new Mesh(new TorusGeometry(r * 1.1, r * 0.13, 6, 20), col);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = top * 0.38;
      g.add(cap, rim);
      break;
    }
    case 'marine': {
      const cap = new Mesh(new CylinderGeometry(r * 1.25, r * 1.08, r * 0.55, 20), white);
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
      const band = new Mesh(new CylinderGeometry(r * 1.05, r * 1.05, r * 0.4, 18), white);
      band.position.y = top * 0.75;
      const puff = new Mesh(new SphereGeometry(r * 1.25, 16, 10), white);
      puff.scale.y = 0.85;
      puff.position.y = top * 0.75 + r * 0.9;
      g.add(band, puff);
      break;
    }
    case 'suedwester': {
      const cap = new Mesh(new SphereGeometry(r * 1.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), col);
      cap.position.y = top * 0.4;
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
      const ridge = new Mesh(new BoxGeometry(r * 0.12, r * 0.3, r * 2.2), steel);
      ridge.position.y = top * 0.25 + r * 1.1;
      const rim = new Mesh(new TorusGeometry(r * 1.2, r * 0.07, 6, 22), steel);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = top * 0.3;
      g.add(dome, ridge, rim);
      break;
    }
    case 'brille': {
      const strap = new Mesh(new TorusGeometry(r * 1.1, r * 0.06, 6, 24), dark);
      strap.rotation.x = Math.PI / 2;
      strap.position.y = top * 0.55;
      for (const s of [-1, 1]) {
        const lens = new Mesh(new CylinderGeometry(r * 0.28, r * 0.28, r * 0.2, 14), toon({ color: '#C9A13B', spec: 1 }));
        lens.rotation.x = Math.PI / 2;
        lens.position.set(s * r * 0.38, top * 0.6, r * 1.02);
        g.add(lens);
      }
      g.add(strap);
      break;
    }
    default: break;
  }
  if (look.earring) {
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
 * Piraten-Kleidung über der Grundfigur: Schärpe bzw. Koppel an der Hüfte, für Kapitäne goldene Schulterstücke.
 * Maße kommen aus den Knochenabständen; Blick der Knochen nach −Z (Figur ist gedreht), daher rotation.y = π.
 */
export function attachOutfit(chest: Object3D, hips: Object3D, armL: Object3D | null, armR: Object3D | null, look: CharacterLook, faction: 'pirat' | 'marine', outline: boolean): Group[] {
  const out: Group[] = [];
  const sw = armL && armR ? Math.abs(armL.position.x - armR.position.x) * 0.5 : 0.09;
  const w = Math.max(0.1, sw + 0.05);
  const acc = toon(look.accentColor);
  const gold = toon({ color: '#E3B04B', spec: 0.9 });
  // Schärpe (Piraten) bzw. Koppel (Marine)
  // das Band selbst entsteht aus dem Körper (bewegt sich mit), hier nur Schnalle bzw. Knoten
  const belt = new Group();
  if (faction === 'marine') {
    const buckle = new Mesh(new BoxGeometry(w * 0.32, w * 0.22, w * 0.06), gold);
    buckle.position.set(0, 0, w * 1.05);
    belt.add(buckle);
  } else {
    const knot = new Mesh(new SphereGeometry(w * 0.16, 8, 6), acc);
    knot.position.set(w * 1.0, 0, w * 0.55);
    const tail = new Mesh(new BoxGeometry(w * 0.2, w * 0.8, w * 0.04), acc);
    tail.position.set(w * 1.08, -w * 0.42, w * 0.5);
    tail.rotation.z = 0.15;
    belt.add(knot, tail);
  }
  belt.position.set(0, -w * 0.02, 0);
  belt.rotation.y = Math.PI;
  hips.add(belt);
  out.push(belt);
  // Kapitäns-Schulterstücke (starre Westen/Mäntel schneiden in die weite Grundkleidung – daher nur Abzeichen)
  if (look.coat === 'kapitaen') {
    const ep = new Group();
    for (const s of [-1, 1]) {
      const plate = new Mesh(new CylinderGeometry(w * 0.34, w * 0.34, w * 0.07, 16), gold);
      plate.position.set(s * (w + 0.035), w * 0.9, 0);
      plate.rotation.z = s * 0.25;
      ep.add(plate);
      for (let k = 0; k < 5; k++) {
        const fr = new Mesh(new CylinderGeometry(w * 0.025, w * 0.025, w * 0.22, 4), gold);
        const a = (k / 4 - 0.5) * 1.6;
        fr.position.set(s * (w + 0.035) + Math.sin(a) * w * 0.32 * s, w * 0.8, Math.cos(a) * w * 0.15);
        ep.add(fr);
      }
    }
    ep.rotation.y = Math.PI;
    chest.add(ep);
    out.push(ep);
  }
  for (const g of out) {
    g.traverse((o) => { (o as Mesh).castShadow = true; });
    if (outline) addOutlines(g, 0.7);
  }
  return out;
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

/** Form des Haars im Kopfraum: liefert für eine Eindringtiefe (m) Sitzhöhe, Mitte und Halbmesser */
export type HairFit = (sink: number) => { seat: number; cx: number; cz: number; radius: number } | null;

export function attachHeadgear(head: Object3D, eyeL: Object3D | null, eyeR: Object3D | null, look: CharacterLook, outline: boolean, fit: HairFit | null = null): Group | null {
  if ((look.hat === 'keiner' || !look.hat) && !look.eyepatch && !look.earring) return null;
  // Augenmitte im Kopfraum; Kopfbreite aus dem Augenabstand
  const l = eyeL?.position, rr = eyeR?.position;
  const cx = l && rr ? (l.x + rr.x) / 2 : 0, cy = l && rr ? (l.y + rr.y) / 2 : 0.06, cz = l && rr ? (l.z + rr.z) / 2 + 0.07 : 0;
  const width = l && rr ? Math.abs(l.x - rr.x) : 0.065;
  // Kopf samt Haarvolumen ist deutlich breiter als der Augenabstand
  const r = Math.max(0.12, width * 2.7);
  const all = new Group();
  const seat = fit ? HAT_SEAT[look.hat] : undefined;
  // Augenklappe und Ohrring richten sich nach den Augen
  const acc = buildHeadgear(seat && fit?.(seat.sink) ? { ...look, hat: 'keiner' } : look, r, outline);
  acc.position.set(cx, cy, cz);
  // Der Kopfknochen der VRoid-Figur schaut nach −Z (die Figur ist um 180° gedreht)
  acc.rotation.y = Math.PI;
  all.add(acc);
  const f = seat && fit ? fit(seat.sink) : null;
  if (seat && f) {
    // Hut passend zur Frisur: Öffnung so weit wie das Haar auf Sitzhöhe
    const hr = (f.radius * 1.04) / seat.open;
    const hat = buildHeadgear({ ...look, eyepatch: false, earring: false }, hr, outline);
    hat.position.set(f.cx, f.seat - seat.base * hr, f.cz);
    hat.rotation.y = Math.PI;
    all.add(hat);
  }
  if (look.eyepatch && rr) {
    // Augenklappe direkt auf dem rechten Auge (Gesichtsfläche liegt ~5 cm vor dem Augenknochen, Blick nach −Z)
    const dark = toon('#1E1A20');
    const patch = new Mesh(new SphereGeometry(0.03, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    patch.rotation.x = -Math.PI / 2;
    patch.scale.set(1.05, 0.4, 0.9);
    patch.position.set(rr.x, rr.y, rr.z - 0.048);
    const band = new Mesh(new TorusGeometry(0.108, 0.004, 4, 32), dark);
    band.rotation.set(Math.PI / 2 + 0.35, 0, 0);
    band.position.set(cx, rr.y + 0.035, rr.z + 0.06);
    all.add(patch, band);
    if (outline) addOutlines(patch, 0.7);
  }
  head.add(all);
  return all;
}
