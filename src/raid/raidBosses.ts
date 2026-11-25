// Endbosse und Hauptmänner der sechs Belagerungs-Festungen: reine Daten ohne three.js (JSON-tauglich, testbar).
// Jede Festung hat EINEN einzigartigen Endboss mit zwei Kampfphasen, roten Boden-Warnflächen (`zones`), besonderen Fähigkeiten (`mech`)
// und einem eigenen Beute-Set (data/gear.ts, `kit`; Modelle aus Blender in public/models/bosses/). Dazu 3 bis 4 stark gepanzerte
// Hauptmänner mit Aura. Boss und Hauptmänner wählen ihr Ziel über die Bedrohungstabelle (combat/threat.ts), nicht fest.
import { ENEMIES, EA, type AuraDef, type EnemyAttack, type EnemyDef } from '../data/combat';
import type { FactionId } from '../data/factions';

// ---------- Auren der Hauptmänner ----------

export const AURAS: Record<string, AuraDef> = {
  schlachtruf: { id: 'schlachtruf', label: 'Schlachtruf', radius: 15, color: '#FF5A3C', dmg: 1.3 },
  bollwerk: { id: 'bollwerk', label: 'Bollwerk', radius: 15, color: '#6FA8FF', taken: 0.68 },
  eilmarsch: { id: 'eilmarsch', label: 'Eilmarsch', radius: 16, color: '#FFD166', speed: 1.25, dmg: 1.1 },
  feldscher: { id: 'feldscher', label: 'Feldscher', radius: 14, color: '#7BE08A', regen: 0.012 },
};

export interface RaidCaptainDef {
  id: string;
  name: string;
  aura: keyof typeof AURAS;
  /** Waffenstil (Animationen und Reichweite) */
  weapon: EnemyDef['weapon'];
}

/** Hauptmänner je Macht: vier Posten, jeder mit eigener Aura (Schlachtruf, Bollwerk, Eilmarsch, Feldscher) */
export const CAPTAINS: Record<FactionId, RaidCaptainDef[]> = {
  england: [
    { id: 'whitcombe', name: 'Kapitän Whitcombe', aura: 'schlachtruf', weapon: 'langklinge' },
    { id: 'harrowgate', name: 'Oberst Harrowgate', aura: 'bollwerk', weapon: 'zweihaender' },
    { id: 'pelham', name: 'Major Pelham', aura: 'eilmarsch', weapon: 'langklinge' },
    { id: 'fenwick', name: 'Wundarzt-Hauptmann Fenwick', aura: 'feldscher', weapon: 'saebel' },
  ],
  niederlande: [
    { id: 'devries', name: 'Kompanie-Hauptmann De Vries', aura: 'schlachtruf', weapon: 'zweihaender' },
    { id: 'bakker', name: 'Zeugmeister Bakker', aura: 'bollwerk', weapon: 'langklinge' },
    { id: 'janssen', name: 'Söldnerführer Janssen', aura: 'eilmarsch', weapon: 'saebel' },
    { id: 'visser', name: 'Faktor Visser', aura: 'feldscher', weapon: 'langklinge' },
  ],
  deutschland: [
    { id: 'rodenberg', name: 'Hauptmann von Rodenberg', aura: 'schlachtruf', weapon: 'zweihaender' },
    { id: 'kessler', name: 'Oberst Kessler', aura: 'bollwerk', weapon: 'zweihaender' },
    { id: 'brandt', name: 'Rittmeister Brandt', aura: 'eilmarsch', weapon: 'langklinge' },
    { id: 'hartmann', name: 'Feldscher Hartmann', aura: 'feldscher', weapon: 'saebel' },
  ],
  frankreich: [
    { id: 'montclair', name: 'Capitaine de Montclair', aura: 'schlachtruf', weapon: 'langklinge' },
    { id: 'beaumont', name: 'Colonel Beaumont', aura: 'bollwerk', weapon: 'langklinge' },
    { id: 'lacroix', name: 'Chevalier Lacroix', aura: 'eilmarsch', weapon: 'langklinge' },
    { id: 'moreau', name: 'Chirurgien Moreau', aura: 'feldscher', weapon: 'saebel' },
  ],
  kurogane: [
    { id: 'kagetora', name: 'Hauptmann Kagetora', aura: 'schlachtruf', weapon: 'doppel' },
    { id: 'goro', name: 'Eisenhand Gorō', aura: 'bollwerk', weapon: 'zweihaender' },
    { id: 'hayate', name: 'Windklinge Hayate', aura: 'eilmarsch', weapon: 'doppel' },
    { id: 'otsuka', name: 'Heiler Ōtsuka', aura: 'feldscher', weapon: 'langklinge' },
  ],
  marine: [
    { id: 'hollin', name: 'Kerkermeister Hollin', aura: 'schlachtruf', weapon: 'zweihaender' },
    { id: 'stahl', name: 'Vizeadmiral Stahl', aura: 'bollwerk', weapon: 'langklinge' },
    { id: 'kroll', name: 'Oberwärter Kroll', aura: 'eilmarsch', weapon: 'faust' },
    { id: 'lenz', name: 'Schiffsarzt Lenz', aura: 'feldscher', weapon: 'saebel' },
  ],
};

/** Werte eines Hauptmanns: deutlich zäher als ein Hauptmann der Garnison, mit schwerer Rüstung (prallt 30 % des Schadens ab, dazu die Rüstung der Gefahrenstufe) */
export function captainDef(f: FactionId, index: number): EnemyDef {
  const c = CAPTAINS[f][index % CAPTAINS[f].length];
  const base = ENEMIES.hauptmann;
  return {
    ...base, label: c.name, hp: Math.round(base.hp * 2.8), dmg: base.dmg * 1.18, poise: 120, speed: base.speed * 0.92, scale: 1.2, radius: 0.62,
    weapon: c.weapon, xp: 160, gold: [60, 110], raid: 'captain', armor: 0.3, aura: AURAS[c.aura],
  };
}

// ---------- Endbosse ----------

export interface RaidBossDef {
  /** Kurzname, auch Schlüssel der Beute (`boss_<id>`-Set in data/gear.ts) */
  id: string;
  factionId: FactionId;
  /** Festung (CITADELS.id), in der der Boss wartet */
  islandId: string;
  name: string;
  title: string;
  /** Banner beim Auftritt und beim Phasenwechsel */
  intro: string;
  phase2: string;
  /** Wiederkehr-Zeile der Beute-Anzeige */
  trophy: string;
  def: EnemyDef;
}

/** Gemeinsame Grundwerte der Endbosse (zäher und härter als eine Legende, zwei Phasen statt drei); Statur 1,36–1,5 × (4.6F: Präsenz) */
const boss = (o: Partial<EnemyDef> & Pick<EnemyDef, 'label' | 'weapon' | 'attacks' | 'phaseAttacks' | 'kit'>): EnemyDef => ({
  ...ENEMIES.legende, hp: 2100, dmg: 22, poise: 240, speed: 4.1, keep: 2.2, radius: 0.7, scale: 1.4, role: 'offizier', elite: true, boss: true, xp: 900, gold: [600, 900],
  raid: 'boss', armor: 0.2, phaseAt: [0.5, -1], phases: 2, ...o,
});

const FAN = (n: number, spread: number): { shape: 'line'; size: number; width: number; turn: number }[] =>
  Array.from({ length: n }, (_, i) => ({ shape: 'line' as const, size: 20, width: 1.5, turn: (i - (n - 1) / 2) * spread }));

/** 1 · England: Lord-Admiral Blackwood – Präzisions-Pistolensalven, Artillerie-Schlag-Signal und Marine-Säbelkombo */
const BLACKWOOD = boss({
  label: 'Lord-Admiral Blackwood', weapon: 'langklinge', kit: 'boss_england', hp: 1870, speed: 4.3,
  attacks: [
    EA({ label: 'Pistolensalve', clip: 'Ranged_1H_Shoot', speed: 1.0, windup: 1.0, range: 22, arc: 0.4, dmg: 1.0, knock: 5, fx: 'punch', zones: FAN(3, 0.24) }),
    EA({ label: 'Säbelkombo', clip: 'Melee_1H_Attack_Slice_Diagonal', speed: 1.1, windup: 0.62, range: 6, arc: 2, dmg: 1.0, knock: 7, zones: [{ shape: 'cone', size: 5.6, arc: 1.9 }, { shape: 'cone', size: 6.6, arc: 2.6, extra: 0.95 }] }),
    EA({ label: 'Entermesser-Stoß', clip: 'Melee_1H_Attack_Stab', speed: 1.15, windup: 0.6, range: 10, arc: 0.8, dmg: 1.1, knock: 8, fx: 'stab', zones: [{ shape: 'line', size: 9.5, width: 1.9 }] }),
    EA({ label: 'Artillerie-Signal!', clip: 'Ranged_Magic_Raise', speed: 1.05, windup: 1.15, range: 26, arc: 6.3, dmg: 1.05, knock: 9, fx: 'magic', mech: { kind: 'signal', color: '#FFB347' },
      zones: [{ shape: 'circle', size: 3.8, at: 'allies', extra: 1.5, prop: 'signal' }, { shape: 'circle', size: 3.6, at: 'scatter', count: 4, scatter: 10, stagger: 0.28, extra: 1.7, prop: 'granate' }] }),
  ],
  phaseAttacks: {
    2: [
      EA({ label: 'Breitseite!', clip: 'Ranged_Magic_Raise', speed: 1.1, windup: 1.2, range: 28, arc: 6.3, dmg: 1.15, knock: 10, fx: 'magic', mech: { kind: 'signal', color: '#FF7A3C' },
        zones: [{ shape: 'circle', size: 4.2, at: 'allies', extra: 1.4, prop: 'signal' }, { shape: 'circle', size: 3.8, at: 'scatter', count: 8, scatter: 13, stagger: 0.2, extra: 1.6, prop: 'granate' }] }),
      EA({ label: 'Salve der Seesoldaten', clip: 'Ranged_1H_Shoot', speed: 1.15, windup: 0.85, range: 24, arc: 0.4, dmg: 1.15, knock: 6, fx: 'punch', zones: FAN(5, 0.2) }),
      EA({ label: 'Enterschwung', clip: 'Melee_1H_Attack_Jump_Chop', speed: 1.1, windup: 0.75, range: 12, arc: 1.6, dmg: 1.25, knock: 11, fx: 'heavy', mech: { kind: 'lunge', dist: 8, speed: 32 }, zones: [{ shape: 'circle', size: 4.4, at: 'target', extra: 0.5 }] }),
      EA({ label: 'Säbelkombo', clip: 'Melee_1H_Attack_Slice_Horizontal', speed: 1.3, windup: 0.5, range: 6, arc: 2.6, dmg: 1.1, knock: 8, zones: [{ shape: 'cone', size: 6, arc: 2.2 }, { shape: 'cone', size: 7, arc: 3.0, extra: 0.8 }] }),
    ],
  },
});

/** 2 · Niederlande: Generalgouverneur Van Der Berg – schwere Hellebardenschwünge, Söldner-Schildwall und Granaten-Fässer */
const VAN_DER_BERG = boss({
  label: 'Generalgouverneur Van Der Berg', weapon: 'zweihaender', kit: 'boss_niederlande', hp: 1660, dmg: 24, speed: 3.7, scale: 1.46, radius: 0.78, armor: 0.28,
  attacks: [
    EA({ label: 'Hellebardenschwung', clip: 'Melee_2H_Attack_Slice', speed: 0.95, windup: 0.95, range: 8, arc: 3, dmg: 1.2, knock: 11, fx: 'heavy', zones: [{ shape: 'cone', size: 8, arc: 3.2 }] }),
    EA({ label: 'Hellebardenstoß', clip: 'Melee_2H_Attack_Stab', speed: 1.0, windup: 0.8, range: 11, arc: 0.8, dmg: 1.2, knock: 10, fx: 'stab', zones: [{ shape: 'line', size: 11, width: 2.4 }] }),
    EA({ label: 'Granaten-Fässer', clip: 'Ranged_Magic_Raise', speed: 1.05, windup: 1.05, range: 24, arc: 6.3, dmg: 1.1, knock: 9, fx: 'magic',
      zones: [{ shape: 'circle', size: 3.4, at: 'allies', extra: 1.6, prop: 'fass' }, { shape: 'circle', size: 3.4, at: 'scatter', count: 4, scatter: 9, stagger: 0.32, extra: 1.8, prop: 'fass' }] }),
    EA({ label: 'Söldner-Schildwall!', clip: 'Ranged_Magic_Summon', speed: 1.0, windup: 1.3, hitAt: 0.12, range: 40, arc: 6.3, dmg: 0.7, knock: 6, fx: 'magic',
      mech: { kind: 'summon', what: 'squad', typ: 'schwert', heads: 9, shape: 'wall', n: 2, label: 'Söldner-Schildwall' }, zones: [{ shape: 'ring', size: 7, inner: 4, extra: 0.4 }] }),
  ],
  phaseAttacks: {
    2: [
      EA({ label: 'Hellebardenwirbel', clip: 'Melee_2H_Attack_Spin', speed: 1.1, windup: 0.9, range: 8, arc: 6.3, dmg: 1.25, knock: 12, fx: 'spin', zones: [{ shape: 'circle', size: 5.2 }, { shape: 'ring', size: 9, inner: 5.2, extra: 0.6 }] }),
      EA({ label: 'Hellebardenstoß', clip: 'Melee_2H_Attack_Stab', speed: 1.1, windup: 0.7, range: 12, arc: 0.8, dmg: 1.25, knock: 10, fx: 'stab', zones: [{ shape: 'line', size: 12, width: 2.4 }, { shape: 'line', size: 12, width: 2.4, turn: 0.45, extra: 0.4 }, { shape: 'line', size: 12, width: 2.4, turn: -0.45, extra: 0.4 }] }),
      EA({ label: 'Fässer-Salve', clip: 'Ranged_Magic_Raise', speed: 1.15, windup: 0.95, range: 26, arc: 6.3, dmg: 1.2, knock: 10, fx: 'magic',
        zones: [{ shape: 'circle', size: 3.6, at: 'allies', extra: 1.4, prop: 'fass' }, { shape: 'circle', size: 3.6, at: 'scatter', count: 8, scatter: 12, stagger: 0.24, extra: 1.6, prop: 'fass' }] }),
      EA({ label: 'Schildwall und Musketen!', clip: 'Ranged_Magic_Summon', speed: 1.0, windup: 1.2, hitAt: 0.12, range: 40, arc: 6.3, dmg: 0.7, knock: 6, fx: 'magic',
        mech: { kind: 'summon', what: 'squad', typ: 'musketier', heads: 8, shape: 'wall', n: 3, label: 'Söldner-Schildwall' }, zones: [{ shape: 'ring', size: 8, inner: 4.5, extra: 0.4 }] }),
    ],
  },
});

/** 3 · Deutschland: Großkomtur von Eisenstein – massiver Zweihänder, Schockwellen-Stampfer und unverwundbare Frontal-Deckung */
const EISENSTEIN = boss({
  label: 'Großkomtur von Eisenstein', weapon: 'zweihaender', kit: 'boss_deutschland', hp: 1550, dmg: 25, speed: 3.5, scale: 1.5, radius: 0.82, armor: 0.34, poise: 320,
  attacks: [
    EA({ label: 'Zweihänderhieb', clip: 'Melee_2H_Attack_Slice', speed: 0.9, windup: 1.0, range: 8.5, arc: 3, dmg: 1.25, knock: 12, fx: 'heavy', zones: [{ shape: 'cone', size: 8.5, arc: 2.8 }] }),
    EA({ label: 'Schockwellen-Stampfer', clip: 'Melee_2H_Attack_Chop', speed: 0.9, windup: 1.05, range: 12, arc: 6.3, dmg: 1.2, knock: 12, fx: 'heavy', zones: [{ shape: 'ring', size: 6.5, inner: 2, extra: 0.4 }, { shape: 'ring', size: 12, inner: 6.5, extra: 1.05 }] }),
    EA({ label: 'Panzerwall!', clip: 'Melee_Block_Attack', speed: 0.9, windup: 0.8, range: 6, arc: 2.6, dmg: 0.6, knock: 8, fx: 'heavy', mech: { kind: 'guard', dur: 6.5, arc: 2.5 }, zones: [{ shape: 'cone', size: 5, arc: 2.0, extra: 0.3 }] }),
    EA({ label: 'Spaltschlag', clip: 'Melee_2H_Attack_Chop', speed: 0.95, windup: 0.9, range: 14, arc: 1, dmg: 1.3, knock: 12, fx: 'heavy', zones: [{ shape: 'line', size: 13, width: 3 }] }),
  ],
  phaseAttacks: {
    2: [
      EA({ label: 'Doppelter Stampfer', clip: 'Melee_2H_Attack_Chop', speed: 1.0, windup: 0.95, range: 14, arc: 6.3, dmg: 1.3, knock: 13, fx: 'heavy', zones: [{ shape: 'ring', size: 5.5, inner: 1.5, extra: 0.3 }, { shape: 'ring', size: 10, inner: 5.5, extra: 0.85 }, { shape: 'ring', size: 15, inner: 10, extra: 1.4 }] }),
      EA({ label: 'Eiserner Wille!', clip: 'Melee_Block_Attack', speed: 1.0, windup: 0.7, range: 6, arc: 2.8, dmg: 0.6, knock: 9, fx: 'heavy', mech: { kind: 'guard', dur: 8.5, arc: 2.7 }, zones: [{ shape: 'cone', size: 5.5, arc: 2.4, extra: 0.3 }] }),
      EA({ label: 'Zweihänderwirbel', clip: 'Melee_2H_Attack_Spin', speed: 1.1, windup: 0.85, range: 9, arc: 6.3, dmg: 1.35, knock: 13, fx: 'spin', zones: [{ shape: 'circle', size: 7.5 }] }),
      EA({ label: 'Spaltschlag', clip: 'Melee_2H_Attack_Chop', speed: 1.05, windup: 0.8, range: 15, arc: 1, dmg: 1.35, knock: 13, fx: 'heavy', zones: [{ shape: 'line', size: 14, width: 3 }, { shape: 'line', size: 14, width: 3, turn: Math.PI / 2, extra: 0.4 }] }),
    ],
  },
});

/** 4 · Frankreich: Marquis-Amiral De Valois – ultraschnelle Rapier-Ausfallschritte, Parier-Konter und Königsgarde-Ruf */
const DE_VALOIS = boss({
  label: 'Marquis-Amiral De Valois', weapon: 'langklinge', kit: 'boss_frankreich', hp: 1980, dmg: 20, speed: 5.0, scale: 1.36, radius: 0.62, armor: 0.1, poise: 190,
  attacks: [
    EA({ label: 'Ausfallschritt', clip: 'Melee_1H_Attack_Stab', speed: 1.5, windup: 0.5, range: 11, arc: 0.7, dmg: 1.05, knock: 7, fx: 'stab', mech: { kind: 'lunge', dist: 9, speed: 42 }, zones: [{ shape: 'line', size: 9.5, width: 1.7 }] }),
    EA({ label: 'Doppelstich', clip: 'Melee_1H_Attack_Stab', speed: 1.7, windup: 0.45, range: 10, arc: 0.7, dmg: 1.0, knock: 6, fx: 'stab', zones: [{ shape: 'line', size: 9, width: 1.5, turn: 0.28 }, { shape: 'line', size: 9, width: 1.5, turn: -0.28, extra: 0.45 }] }),
    EA({ label: 'Parade! (nicht angreifen)', clip: 'Melee_Block_Attack', speed: 1.2, windup: 0.5, range: 6, arc: 2.6, dmg: 0.6, knock: 6, fx: 'stab', mech: { kind: 'counter', dur: 2.8, dmg: 1.5, radius: 3.4 }, zones: [{ shape: 'ring', size: 4, inner: 3, extra: 0.2 }] }),
    EA({ label: 'Königsgarde, zu mir!', clip: 'Ranged_Magic_Summon', speed: 1.1, windup: 1.2, hitAt: 0.12, range: 40, arc: 6.3, dmg: 0.6, knock: 6, fx: 'magic',
      mech: { kind: 'summon', what: 'squad', typ: 'schwert', heads: 8, shape: 'flank', n: 2, label: 'Königsgarde' }, zones: [{ shape: 'ring', size: 6, inner: 3.6, extra: 0.4 }] }),
  ],
  phaseAttacks: {
    2: [
      EA({ label: 'Rapier-Tanz', clip: 'Melee_1H_Attack_Stab', speed: 1.8, windup: 0.4, range: 12, arc: 0.7, dmg: 1.1, knock: 7, fx: 'stab', mech: { kind: 'lunge', dist: 10, speed: 46 }, zones: [{ shape: 'line', size: 10.5, width: 1.7 }, { shape: 'line', size: 10, width: 1.5, turn: 0.5, extra: 0.35 }, { shape: 'line', size: 10, width: 1.5, turn: -0.5, extra: 0.35 }] }),
      EA({ label: 'Fächerstich', clip: 'Melee_1H_Attack_Slice_Horizontal', speed: 1.5, windup: 0.5, range: 8, arc: 3, dmg: 1.15, knock: 8, zones: [{ shape: 'cone', size: 8, arc: 3.4 }] }),
      EA({ label: 'Parade! (nicht angreifen)', clip: 'Melee_Block_Attack', speed: 1.3, windup: 0.4, range: 6, arc: 2.6, dmg: 0.6, knock: 6, fx: 'stab', mech: { kind: 'counter', dur: 2.2, dmg: 1.7, radius: 3.8 }, zones: [{ shape: 'ring', size: 4.2, inner: 3.2, extra: 0.2 }] }),
      EA({ label: 'Garde royale!', clip: 'Ranged_Magic_Summon', speed: 1.15, windup: 1.1, hitAt: 0.12, range: 40, arc: 6.3, dmg: 0.6, knock: 6, fx: 'magic',
        mech: { kind: 'summon', what: 'squad', typ: 'musketier', heads: 8, shape: 'flank', n: 3, label: 'Königsgarde' }, zones: [{ shape: 'ring', size: 6.5, inner: 3.8, extra: 0.4 }] }),
    ],
  },
});

/** 5 · Kurogane: Schattenfürst Kurogane – Doppelkatana-Schattenschnitt, dunkle Feuer-Wellen und Teleport-Dash */
const KUROGANE = boss({
  label: 'Schattenfürst Kurogane', weapon: 'doppel', kit: 'boss_kurogane', hp: 1820, dmg: 23, speed: 4.6, scale: 1.4, radius: 0.66, armor: 0.14, poise: 200,
  attacks: [
    EA({ label: 'Schattenschnitt', clip: 'Melee_Dualwield_Attack_Slice', speed: 1.15, windup: 0.75, range: 11, arc: 0.9, dmg: 1.15, knock: 8, zones: [{ shape: 'line', size: 11, width: 1.8, turn: Math.PI / 4 }, { shape: 'line', size: 11, width: 1.8, turn: -Math.PI / 4 }] }),
    EA({ label: 'Dunkle Feuerwelle', clip: 'Ranged_Magic_Raise', speed: 1.1, windup: 1.0, range: 20, arc: 6.3, dmg: 1.15, knock: 10, fx: 'magic', zones: [{ shape: 'circle', size: 5, prop: 'rune' }, { shape: 'ring', size: 10, inner: 5, extra: 0.7 }, { shape: 'ring', size: 15, inner: 10, extra: 1.4 }] }),
    EA({ label: 'Schattensprung', clip: 'Melee_Dualwield_Attack_Stab', speed: 1.3, windup: 0.85, range: 26, arc: 6.3, dmg: 1.2, knock: 10, fx: 'stab', mech: { kind: 'blink', behind: true },
      zones: [{ shape: 'circle', size: 4.4, at: 'behind', extra: 0.2, prop: 'rune' }] }),
    EA({ label: 'Klingentanz', clip: 'Melee_Dualwield_Attack_Chop', speed: 1.2, windup: 0.7, range: 7, arc: 2.6, dmg: 1.15, knock: 9, zones: [{ shape: 'cone', size: 6.5, arc: 2.2 }, { shape: 'cone', size: 6.5, arc: 2.2, turn: Math.PI, extra: 0.55 }] }),
  ],
  phaseAttacks: {
    2: [
      EA({ label: 'Schattenschnitt der Nacht', clip: 'Melee_Dualwield_Attack_Slice', speed: 1.3, windup: 0.65, range: 13, arc: 0.9, dmg: 1.25, knock: 9, zones: [{ shape: 'line', size: 13, width: 1.8, turn: Math.PI / 4 }, { shape: 'line', size: 13, width: 1.8, turn: -Math.PI / 4 }, { shape: 'line', size: 13, width: 1.8, extra: 0.5 }, { shape: 'line', size: 13, width: 1.8, turn: Math.PI / 2, extra: 0.5 }] }),
      EA({ label: 'Nachtfeuer', clip: 'Ranged_Magic_Raise', speed: 1.15, windup: 1.0, range: 24, arc: 6.3, dmg: 1.2, knock: 10, fx: 'magic', zones: [{ shape: 'circle', size: 4, at: 'allies', extra: 1.3, prop: 'rune' }, { shape: 'circle', size: 3.6, at: 'scatter', count: 6, scatter: 11, stagger: 0.24, extra: 1.5, prop: 'rune' }] }),
      EA({ label: 'Schattensprung', clip: 'Melee_Dualwield_Attack_Stab', speed: 1.5, windup: 0.7, range: 28, arc: 6.3, dmg: 1.3, knock: 11, fx: 'stab', mech: { kind: 'blink', behind: true },
        zones: [{ shape: 'circle', size: 4.8, at: 'behind', extra: 0.2, prop: 'rune' }, { shape: 'ring', size: 9, inner: 4.8, at: 'behind', extra: 0.75 }] }),
      EA({ label: 'Dunkle Feuerwelle', clip: 'Ranged_Magic_Raise', speed: 1.2, windup: 0.9, range: 22, arc: 6.3, dmg: 1.25, knock: 11, fx: 'magic', zones: [{ shape: 'circle', size: 5.5, prop: 'rune' }, { shape: 'ring', size: 11, inner: 5.5, extra: 0.6 }, { shape: 'ring', size: 17, inner: 11, extra: 1.2 }, { shape: 'ring', size: 23, inner: 17, extra: 1.8 }] }),
    ],
  },
});

/** 6 · Marine: Großadmiral & Oberster Gefängniswärter Valken – Kanonenfaust, Seestein-Kettenfesseln und Elite-Verstärkung */
const VALKEN = boss({
  label: 'Großadmiral Valken', weapon: 'faust', kit: 'boss_marine', hp: 1445, dmg: 24, speed: 3.8, scale: 1.5, radius: 0.85, armor: 0.3, poise: 340, xp: 1400, gold: [900, 1400],
  attacks: [
    EA({ label: 'Gerechtigkeits-Kanonenfaust', clip: 'Melee_Unarmed_Attack_Punch_A', speed: 0.85, windup: 1.0, range: 15, arc: 0.9, dmg: 1.3, knock: 13, fx: 'heavy', zones: [{ shape: 'line', size: 15, width: 3.4 }, { shape: 'circle', size: 4, at: 'target', extra: 0.9 }] }),
    EA({ label: 'Gerechtigkeits-Hieb', clip: 'Melee_2H_Attack_Chop', speed: 0.9, windup: 0.95, range: 12, arc: 6.3, dmg: 1.25, knock: 13, fx: 'heavy', zones: [{ shape: 'ring', size: 6, inner: 1.5, extra: 0.35 }, { shape: 'ring', size: 11.5, inner: 6, extra: 1.0 }] }),
    EA({ label: 'Seestein-Kettenfesseln', clip: 'Ranged_Magic_Raise', speed: 1.0, windup: 1.1, range: 28, arc: 6.3, dmg: 0.8, knock: 4, fx: 'magic', zones: [{ shape: 'circle', size: 3, at: 'allies', extra: 1.7, prop: 'kette', bind: { dur: 3.6, slow: 0.62 } }, { shape: 'circle', size: 2.8, at: 'scatter', count: 3, scatter: 8, stagger: 0.3, extra: 1.9, prop: 'kette', bind: { dur: 3.6, slow: 0.62 } }] }),
    EA({ label: 'Marine-Verstärkung!', clip: 'Ranged_Magic_Summon', speed: 1.0, windup: 1.3, hitAt: 0.12, range: 40, arc: 6.3, dmg: 0.6, knock: 6, fx: 'magic',
      mech: { kind: 'summon', what: 'squad', typ: 'musketier', heads: 9, shape: 'flank', n: 2, label: 'Marine-Verstärkung' }, zones: [{ shape: 'ring', size: 7, inner: 4, extra: 0.4 }] }),
  ],
  phaseAttacks: {
    2: [
      EA({ label: 'Gerechtigkeits-Salve', clip: 'Melee_Unarmed_Attack_Punch_A', speed: 1.0, windup: 0.9, range: 16, arc: 0.9, dmg: 1.4, knock: 14, fx: 'heavy', zones: [{ shape: 'line', size: 16, width: 3.6 }, { shape: 'line', size: 16, width: 3, turn: 0.42, extra: 0.4 }, { shape: 'line', size: 16, width: 3, turn: -0.42, extra: 0.4 }] }),
      EA({ label: 'Schockwellen-Hiebe', clip: 'Melee_2H_Attack_Chop', speed: 1.0, windup: 0.9, range: 15, arc: 6.3, dmg: 1.35, knock: 14, fx: 'heavy', zones: [{ shape: 'ring', size: 5.5, inner: 1.5, extra: 0.3 }, { shape: 'ring', size: 10, inner: 5.5, extra: 0.8 }, { shape: 'ring', size: 15, inner: 10, extra: 1.3 }] }),
      EA({ label: 'Seestein-Ketten', clip: 'Ranged_Magic_Raise', speed: 1.1, windup: 1.0, range: 30, arc: 6.3, dmg: 0.9, knock: 4, fx: 'magic', zones: [{ shape: 'circle', size: 3.2, at: 'allies', extra: 1.5, prop: 'kette', bind: { dur: 4.5, slow: 0.7 } }, { shape: 'circle', size: 3, at: 'scatter', count: 5, scatter: 10, stagger: 0.24, extra: 1.7, prop: 'kette', bind: { dur: 4.5, slow: 0.7 } }] }),
      EA({ label: 'Elite-Marine!', clip: 'Ranged_Magic_Summon', speed: 1.1, windup: 1.2, hitAt: 0.12, range: 40, arc: 6.3, dmg: 0.6, knock: 6, fx: 'magic',
        mech: { kind: 'summon', what: 'squad', typ: 'schwert', heads: 10, shape: 'wall', n: 3, label: 'Elite-Marine' }, zones: [{ shape: 'ring', size: 8, inner: 4.5, extra: 0.4 }] }),
    ],
  },
});

export const RAID_BOSSES: Record<FactionId, RaidBossDef> = {
  england: { id: 'blackwood', factionId: 'england', islandId: 'albion', name: 'Lord-Admiral Blackwood', title: 'Oberbefehlshaber der Royal Navy', def: BLACKWOOD,
    intro: 'Die Admiralität feuert ihre Salven nach Plan.', phase2: 'Blackwood ruft die Flotte zur Breitseite', trophy: 'Admiralsrock der Royal Navy' },
  niederlande: { id: 'vanderberg', factionId: 'niederlande', islandId: 'oranjehaven', name: 'Generalgouverneur Van Der Berg', title: 'Herr der Handelskompanie', def: VAN_DER_BERG,
    intro: 'Das Kontor kennt für jede Rechnung eine Hellebarde.', phase2: 'Van Der Berg wirft die Söldner in die Schlacht', trophy: 'Hellebarde des Generalgouverneurs' },
  deutschland: { id: 'eisenstein', factionId: 'deutschland', islandId: 'adlerstein', name: 'Großkomtur von Eisenstein', title: 'Hochmeister der Preußischen Marine', def: EISENSTEIN,
    intro: 'Granit weicht nicht. Der Komtur auch nicht.', phase2: 'Eisenstein legt den Panzerhandschuh an', trophy: 'Eisenhelm des Großkomturs' },
  frankreich: { id: 'devalois', factionId: 'frankreich', islandId: 'soleilmont', name: 'Marquis-Amiral De Valois', title: 'Erster Degen der Armada Royale', def: DE_VALOIS,
    intro: 'Eleganz ist die tödlichste Waffe.', phase2: 'De Valois zieht die zweite Klinge der Königsgarde', trophy: 'Hofdegen des Marquis' },
  kurogane: { id: 'kurogane', factionId: 'kurogane', islandId: 'yamikura', name: 'Schattenfürst Kurogane', title: 'Herr der dunklen Klinge', def: KUROGANE,
    intro: 'Das Licht der roten Laternen erlischt.', phase2: 'Die Schatten des Fürsten erheben sich', trophy: 'Doppelkatana der Nacht' },
  marine: { id: 'valken', factionId: 'marine', islandId: 'weisswacht', name: 'Großadmiral Valken', title: 'Oberster Gefängniswärter der Marine', def: VALKEN,
    intro: 'Wer hier einsitzt, kommt nie wieder hinaus.', phase2: 'Valken ruft die Eliten der Marine', trophy: 'Kanonenfaust der Gerechtigkeit' },
};

// Der Titel steht nur hier (RaidBossDef.title); die Boss-Leiste liest ihn aus der Definition des Gegners
for (const b of Object.values(RAID_BOSSES)) b.def.title = b.title;

/** Alle Angriffe eines Bosses (beide Phasen) – für Prüfungen und Anzeigen */
export function allBossAttacks(b: RaidBossDef): EnemyAttack[] {
  return [...b.def.attacks, ...(b.def.phaseAttacks?.[2] ?? []), ...(b.def.phaseAttacks?.[3] ?? [])];
}
