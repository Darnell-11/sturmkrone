// Kopfbedeckungen und Accessoires für die Anime-Figuren (am Kopfknochen befestigt).
import { ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, SphereGeometry, TorusGeometry, BoxGeometry, type Object3D } from 'three';
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
      const R = r * 2.55; // Eckradius; die Wände liegen bei R/2 knapp außerhalb der Kuppel
      const floor = new Mesh(new CylinderGeometry(R, R, r * 0.08, 3), col);
      floor.position.y = by;
      t.add(floor);
      const wallMat = toon({ color: look.hatColor, side: DoubleSide });
      const h = r * 0.58, len = R * Math.sqrt(3);
      for (let i = 0; i < 3; i++) {
        const phi = (i * 2 * Math.PI) / 3 + Math.PI / 3;
        const wall = new Mesh(new BoxGeometry(len, h, r * 0.06), wallMat);
        wall.rotation.order = 'YXZ';
        wall.rotation.set(0.42, phi, 0);
        wall.position.set(Math.sin(phi) * R * 0.5, by + h * 0.45, Math.cos(phi) * R * 0.5);
        const trim = new Mesh(new BoxGeometry(len * 0.98, r * 0.07, r * 0.09), gold);
        trim.position.y = h / 2;
        wall.add(trim);
        t.add(wall);
      }
      break;
    }
    case 'zweispitz': {
      const body = new Mesh(new SphereGeometry(r * 1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), col);
      body.scale.set(1.6, 0.8, 0.55);
      body.position.y = top * 0.85;
      const cock = new Mesh(new SphereGeometry(r * 0.16, 8, 6), gold);
      cock.position.set(r * 0.35, top * 0.85 + r * 0.55, r * 0.6);
      g.add(body, cock);
      break;
    }
    case 'bandana': {
      // liegt über dem Haar (die Anime-Frisuren haben viel Volumen)
      const cap = new Mesh(new SphereGeometry(r * 1.2, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), col);
      cap.position.y = top * 0.22;
      cap.scale.set(1, 1.12, 1.1);
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
  if (look.eyepatch) {
    // Augenklappe auf dem rechten Auge, Band eng um den Kopf
    const hr = r * 0.62;
    const patch = new Mesh(new SphereGeometry(hr * 0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    patch.rotation.x = Math.PI / 2;
    patch.scale.set(1, 0.45, 1);
    patch.position.set(-hr * 0.42, 0, hr * 1.12);
    const band = new Mesh(new TorusGeometry(hr * 1.12, hr * 0.03, 4, 28), dark);
    band.rotation.set(Math.PI / 2 - 0.3, 0, 0);
    band.position.set(0, hr * 0.1, hr * 0.1);
    g.add(patch, band);
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
  const belt = new Group();
  // flaches Band statt Ring
  const band = new Mesh(new CylinderGeometry(w * 1.3, w * 1.38, w * 0.34, 28, 1, true), faction === 'marine' ? toon('#2A2420') : acc);
  band.scale.set(1, 1, 0.8);
  belt.add(band);
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
export function attachHeadgear(head: Object3D, eyeL: Object3D | null, eyeR: Object3D | null, look: CharacterLook, outline: boolean): Group | null {
  if ((look.hat === 'keiner' || !look.hat) && !look.eyepatch && !look.earring) return null;
  // Augenmitte im Kopfraum; Kopfbreite aus dem Augenabstand
  const l = eyeL?.position, rr = eyeR?.position;
  const cx = l && rr ? (l.x + rr.x) / 2 : 0, cy = l && rr ? (l.y + rr.y) / 2 : 0.06, cz = l && rr ? (l.z + rr.z) / 2 + 0.07 : 0;
  const width = l && rr ? Math.abs(l.x - rr.x) : 0.065;
  // Kopf samt Haarvolumen ist deutlich breiter als der Augenabstand
  const r = Math.max(0.12, width * 2.7);
  const g = buildHeadgear(look, r, outline);
  g.position.set(cx, cy, cz);
  // Der Kopfknochen der VRoid-Figur schaut nach −Z (die Figur ist um 180° gedreht)
  g.rotation.y = Math.PI;
  head.add(g);
  return g;
}
