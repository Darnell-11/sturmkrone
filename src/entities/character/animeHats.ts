// Kopfbedeckungen und Accessoires für die Anime-Figuren (am Kopfknochen befestigt).
import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, BoxGeometry, type Object3D } from 'three';
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
      const brim = new Mesh(new CylinderGeometry(r * 1.85, r * 1.9, r * 0.12, 3), col);
      brim.position.y = top * 0.82;
      brim.rotation.y = Math.PI / 6;
      const crown = new Mesh(new CylinderGeometry(r * 0.85, r * 1.05, r * 0.75, 16), col);
      crown.position.y = top * 0.82 + r * 0.35;
      const band = new Mesh(new TorusGeometry(r * 1.86, r * 0.04, 4, 3), gold);
      band.rotation.x = Math.PI / 2;
      band.rotation.z = Math.PI / 6;
      band.position.y = top * 0.82 + r * 0.06;
      g.add(brim, crown, band);
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
      const cap = new Mesh(new SphereGeometry(r * 1.09, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), col);
      cap.position.y = top * 0.2;
      cap.scale.set(1, 1.05, 1.08);
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
  g.traverse((o) => { (o as Mesh).castShadow = true; });
  if (outline) addOutlines(g, 0.7);
  return g;
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
