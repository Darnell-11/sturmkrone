import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type Object3D,
} from 'three';
import type { StyleId } from '../../data/animations';
import { addOutlines } from '../../render/outline';
import { toon } from '../../render/toon';

/** Klingenfarben je Waffenstufe (aus 1.0: Rostiger Säbel … Himmelsschneide) */
export interface WeaponLook { blade: string; glow?: boolean }

const HANDLE = '#5A3A22';
const GUARD = '#E3B04B';

/** Klinge als flache, leicht gebogene Form. Griff am Ursprung, Klinge entlang +Y. */
function bladeGeo(length: number, width: number, curve: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(-width / 2, 0);
  s.quadraticCurveTo(-width / 2 + curve * 0.5, length * 0.55, curve, length);
  s.quadraticCurveTo(width / 2 + curve * 0.6, length * 0.5, width / 2, 0);
  s.lineTo(-width / 2, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -0.01);
  return g;
}

function sword(length: number, width: number, curve: number, look: WeaponLook, twoHanded = false): Group {
  const g = new Group();
  const bladeMat = toon({ color: look.blade, spec: 1, emissive: look.glow ? new Color(look.blade).multiplyScalar(0.35) : 0x000000 });
  const blade = new Mesh(bladeGeo(length, width, curve), bladeMat);
  blade.position.y = 0.12;
  g.add(blade);
  const guard = new Mesh(new BoxGeometry(width * 2.4, 0.04, 0.07), toon({ color: GUARD, spec: 0.8 }));
  guard.position.y = 0.11;
  g.add(guard);
  const grip = new Mesh(new CylinderGeometry(0.025, 0.028, twoHanded ? 0.32 : 0.2, 8), toon(HANDLE));
  grip.position.y = twoHanded ? -0.04 : 0;
  g.add(grip);
  const pommel = new Mesh(new SphereGeometry(0.04, 8, 6), toon({ color: GUARD, spec: 0.8 }));
  pommel.position.y = twoHanded ? -0.22 : -0.11;
  g.add(pommel);
  if (look.glow) {
    const aura = new Mesh(bladeGeo(length * 1.04, width * 1.5, curve), new MeshBasicMaterial({ color: new Color(look.blade).multiplyScalar(2.2), transparent: true, opacity: 0.35, depthWrite: false }));
    aura.position.set(0, 0.11, 0);
    aura.userData.noOutline = true;
    g.add(aura);
  }
  addOutlines(g, 0.7);
  return g;
}

/** Leuchtende Faji-Kugel über der Hand */
function orb(color: string): Group {
  const g = new Group();
  const core = new Mesh(new SphereGeometry(0.09, 16, 12), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(3) }));
  const ring = new Mesh(new TorusGeometry(0.14, 0.012, 6, 24), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(2) }));
  ring.rotation.x = Math.PI / 2;
  core.position.set(0, 0.12, 0.05);
  ring.position.copy(core.position);
  g.add(core, ring);
  g.userData.spin = ring;
  return g;
}

export interface HeldWeapons { right: Object3D | null; left: Object3D | null }

function musket(): Group {
  const g = new Group();
  const stock = new Mesh(new BoxGeometry(0.07, 0.5, 0.11), toon('#7A4A22'));
  stock.position.y = -0.1;
  const barrel = new Mesh(new CylinderGeometry(0.025, 0.03, 0.95, 8), toon({ color: '#3A3A44', spec: 1 }));
  barrel.position.y = 0.5;
  const band = new Mesh(new TorusGeometry(0.035, 0.012, 6, 10), toon({ color: GUARD, spec: 0.8 }));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.3;
  g.add(stock, barrel, band);
  addOutlines(g, 0.7);
  return g;
}

function shield(color = '#7A1F1A'): Group {
  const g = new Group();
  const disc = new Mesh(new CylinderGeometry(0.42, 0.42, 0.06, 20), toon(color));
  disc.rotation.z = Math.PI / 2;
  const rim = new Mesh(new TorusGeometry(0.42, 0.03, 6, 24), toon({ color: '#9AA0AA', spec: 1 }));
  rim.rotation.y = Math.PI / 2;
  const boss = new Mesh(new SphereGeometry(0.1, 10, 8), toon({ color: GUARD, spec: 1 }));
  boss.position.x = -0.05;
  g.add(disc, rim, boss);
  g.position.set(-0.08, 0.05, 0);
  addOutlines(g, 0.7);
  return g;
}

/** Waffen für Gegner (zusätzlich Muskete und Schild) */
export function enemyWeapons(kind: StyleId | 'muskete' | 'schild'): HeldWeapons {
  if (kind === 'muskete') return { right: inHand(musket()), left: null };
  if (kind === 'schild') {
    // der Schild ist auf die ungedrehte Hand ausgelegt: Drehung der linken Halterung (−90°) ausgleichen
    const s = new Group();
    s.rotation.z = Math.PI / 2;
    s.add(shield());
    return { right: inHand(sword(0.7, 0.09, 0.1, { blade: '#B8C0C8' })), left: s };
  }
  return weaponsFor(kind, { blade: '#B8C0C8' });
}

/** Die Handhalterung ist schon so gedreht, dass +Y quer aus der Faust zeigt (Klinge nach oben/vorn). */
function inHand(o: Object3D): Object3D {
  const g = new Group();
  g.add(o);
  return g;
}

/** Waffen passend zum Kampfstil */
export function weaponsFor(style: StyleId, look: WeaponLook = { blade: '#C9D2DA' }): HeldWeapons {
  switch (style) {
    case 'saebel': return { right: inHand(sword(0.78, 0.09, 0.12, look)), left: null };
    case 'langklinge': return { right: inHand(sword(1.05, 0.07, 0.06, look, true)), left: null };
    case 'zweihaender': return { right: inHand(sword(1.3, 0.16, 0.0, look, true)), left: null };
    case 'doppel': return { right: inHand(sword(0.6, 0.08, 0.08, look)), left: inHand(sword(0.6, 0.08, 0.08, look)) };
    case 'effekt': return { right: orb(look.glow ? look.blade : '#B98CFF'), left: null };
    default: return { right: null, left: null };
  }
}
