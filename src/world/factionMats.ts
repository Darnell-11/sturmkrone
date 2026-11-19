import { Color, MeshBasicMaterial, type Material } from 'three';
import { FACTIONS, type FactionId } from '../data/factions';
import { markShared } from '../render/dispose';
import { toon } from '../render/toon';

/**
 * Materialien der Weltmächte für die Blender-Bausteine (Rollen als Materialnamen, siehe tools/blender/build_fraktionen.py) und für die
 * Farbwelt der Festungen: Kalkstein und Schiefer (England), Backstein und Ziegel (Niederlande), Granit (Deutschland), Sandstein und
 * Königsblau (Frankreich), geschwärztes Holz und Vulkangestein mit glühend roten Laternen (Kurogane), weißer Kalkstein (Marine).
 * Alle laufen über das Toon-Material (`onBeforeCompile` auf MeshStandardMaterial): Licht, Nebel und Schatten bleiben erhalten.
 */
const AM = (color: string, detail?: 'stone' | 'plaster' | 'tile') => toon({ color, detail, vertexColors: true });
const shade = (hex: string, k: number) => `#${new Color(hex).multiplyScalar(k).getHexString()}`;

/** Rote Laternen der Kurogane: leuchten immer, nachts kräftiger (`setFactionNight`) */
const RED_LANTERN = new Color(3.2, 0.34, 0.16);
const redLantern = markShared(new MeshBasicMaterial({ color: RED_LANTERN.clone().multiplyScalar(0.7) }));

/** Glas der Marine-Wachtürme: tagsüber ein heller Himmelston, nachts warmes Leuchtfeuer (ebenfalls ein einfaches Material, kein eigener Shader) */
const GLASS_DAY = new Color(0.62, 0.76, 0.9), GLASS_NIGHT = new Color(3.0, 2.2, 1.1);
const marineGlass = markShared(new MeshBasicMaterial({ color: GLASS_DAY.clone() }));

export function setFactionNight(night: number) {
  const n = Math.min(1, night * 1.4);
  redLantern.color.copy(RED_LANTERN).multiplyScalar(0.55 + 0.95 * n);
  marineGlass.color.copy(GLASS_DAY).lerp(GLASS_NIGHT, n);
}

/** Material für eine Rolle eines Bausteins der Macht `id` */
export function factionRole(id: FactionId, role: string): Material {
  const f = FACTIONS[id].fort;
  switch (role) {
    case 'wall': return AM(f.wall, f.wallDetail);
    case 'stone': return AM(f.stone, 'stone');
    case 'stonelight': return AM(f.stonelight, 'stone');
    case 'roof': return AM(f.roof, f.roofDetail);
    case 'cloth': return AM(f.cloth);
    case 'cloth2': return AM(f.cloth2);
    case 'light': return AM('#F2EEE4');
    case 'dark': return AM('#0B0B0E');
    case 'wood': return AM(shade(f.wood, 1.35));
    case 'darkwood': return AM(f.wood);
    case 'iron': return AM('#3A3C40');
    case 'gold': return AM('#D4AC42');
    case 'rope': return AM('#B8A070');
    case 'lantern': return id === 'kurogane' ? redLantern : AM(f.lantern);
    case 'glass': return id === 'marine' ? marineGlass : AM('#9CB4D0');
    default: return AM(f.wood);
  }
}

/** Rollen→Material-Funktion für `archGroup` */
export const factionMats = (id: FactionId) => (role: string): Material => factionRole(id, role);
