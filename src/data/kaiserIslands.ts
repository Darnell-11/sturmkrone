// Die fünf Kaiser-Zitadellen der Äußeren Kaiser-Meere (Ring 5, Phase 4.5D): je Kuchenstück der Mächte eine monumentale Festungsinsel auf dem
// reservierten Bauplatz (data/worldRings.ts `KAISER_SITES`, 14 200 m). Reine Daten und Rechnung ohne three.js (JSON-tauglich, testbar): Küste mit
// Hafenbucht zur Weltmitte, doppelter Festungsring (Mauern mit Toren, davor Wasser-, Kluft- oder Lavagräben mit breiten, freien Brücken),
// Thron-Zitadelle in der Mitte, Küstengeschütze und die Lage der Seesperre (zwei Ketten-Bastionen im Wasser vor der Bucht, dazwischen die
// Hafenkette). Die Inseln nutzen das Datenformat der Mega-Inseln (data/megaIslands.ts) und werden dort eingetragen (`registerMegaSpec`);
// gebaut werden sie wie alle Siedlungs-Inseln (world/settlement.ts), gestreamt vom WorldStreamer. Die Schlacht selbst: data/kaiserBattle.ts (Regeln)
// und world/kaiserLive.ts (Schiffe, Bastionen, Verbände, Boss).
import type { IslandDef } from './regions';
import type { PowerId } from './factions';
import type { GoodId } from './economy';
import type { ClusterDef, SiteDef, StructureDef } from './settlements';
import { S, scatterOf, themeItems, type SiteBiome } from './openWorld';
import { KAISER_SITES, KAISER_SITE_DIST } from './worldRings';
import { C, V, fine, megaItems, polarPt, polylineT, registerMegaSpec, ringPts, wallLine, type KaiserId, type MegaIslandSpec, type MegaPlot } from './megaIslands';

export type { KaiserId } from './megaIslands';
export const KAISER_IDS: readonly KaiserId[] = ['britannia', 'batavia', 'kaiserdom', 'solis', 'tenkoku'];

/** Stufe der Kaiser-Inseln (Gegner der Festungsringe; Offiziere +1, Kaiser +3) */
export const KAISER_LEVEL = 27;

type RiftKind = 'kanal' | 'lava' | 'kluft' | 'sund';

/** Bauteile nur der Kaiser-Inseln (zusätzlich zu den Bausteinen der Mega- und Themen-Inseln) */
export type KaiserTheme = 'thronsaal' | 'admiralspalast' | 'schatzgewoelbe' | 'hochofen' | 'kolonnade' | 'pagodenburg';

export interface KaiserBossSpec {
  name: string;
  title: string;
  /** Banner beim Auftritt und beim Phasenwechsel (50 %) */
  intro: string;
  phase2: string;
}

export interface KaiserIslandSpec {
  id: KaiserId;
  power: PowerId;
  name: string;
  title: string;
  r: number;
  biome: SiteBiome;
  label: string;
  info: string;
  /** Fahne und Statuen der Macht */
  flag: string;
  statue: string;
  keep: 'bergfried' | 'pagode';
  /** Gräben vor dem äußeren und dem inneren Ring (Art, Brücke, Name) */
  moats: [{ kind: RiftKind; bridge: string; name: string }, { kind: RiftKind; bridge: string; name: string }];
  /** Besonderer Bau zwischen den Ringen (gegenüber der Bucht) und weitere Bauplätze der Insel */
  special: KaiserTheme;
  extra: MegaPlot[];
  grass: number;
  goods: GoodId[];
  boss: KaiserBossSpec;
  /** Mythischer Bauplan, den der erste Sieg über den Kaiser bringt */
  relic: { id: string; name: string; info: string };
  /** Namen der Wachschiffe der Seesperre */
  fleet: string[];
}

const deg = (power: PowerId): number => KAISER_SITES.find((k) => k.power === power)!.deg;
/** Bucht zur Weltmitte hin (Peilung in Grad, 0 = Norden/+z) */
export const bayOf = (power: PowerId): number => (deg(power) + 180) % 360;

// ---------- Die fünf Kaiser-Inseln ----------

export const KAISER_SPECS: readonly KaiserIslandSpec[] = [
  {
    id: 'britannia', power: 'england', name: 'Kaiserzitadelle Britannia', title: 'Thron der Seekaiser', r: 610, biome: 'kreide',
    label: 'Kaiserzitadelle der Krone', flag: 'krone', statue: 'koenig', keep: 'bergfried',
    info: 'Weiße Bastionsmauern auf Kreideklippen, zwei Hafenmolen und der Admiralspalast der Seekaiser. Eine Hafenkette zwischen zwei Bastionen sperrt die Bucht; dahinter wachen zwei Festungsringe über den Thronsaal.',
    moats: [{ kind: 'sund', bridge: 'stein', name: 'Kronengraben' }, { kind: 'sund', bridge: 'marmor', name: 'Thronkanal' }],
    special: 'admiralspalast',
    extra: [{ theme: 'mole', deg: -24, d: 0.86 }, { theme: 'mole', deg: 24, d: 0.86 }, { theme: 'exerzierplatz', deg: 150, d: 0.74 }, { theme: 'kontorviertel', deg: -150, d: 0.74 }],
    grass: 0.84, goods: ['tuch', 'tee', 'marineausruestung'],
    boss: { name: 'Seekaiser Edmund Ravenscourt', title: 'Herr der Kaiserzitadelle Britannia', intro: 'Die Krone kennt keine Kapitulation – nur Breitseiten.', phase2: 'Ravenscourt ruft die Garde der Krone und entfesselt die Kronen-Aura' },
    relic: { id: 'bauplan_britannia', name: 'Mythischer Bauplan: Kronenbug der Seekaiser', info: 'Die Bugzier der kaiserlichen Flaggschiffe – ein Löwe aus weißem Kreidestein.' },
    fleet: ['HMS Imperatrix', 'HMS Dreadnought Crown', 'HMS Sovereign Gale', 'HMS Royal Bastion', 'HMS Ironclad Rose', 'HMS Albion Ward'],
  },
  {
    id: 'batavia', power: 'niederlande', name: 'Imperiale Kontor-Festung Batavia', title: 'Schatzkammer der Kompanie', r: 560, biome: 'festland',
    label: 'Seefestung der Kompanie', flag: 'kompanie', statue: 'koenig', keep: 'bergfried',
    info: 'Eine Seefestung aus Backstein: Kanal-Zitadelle, Zugbrücken und die Schatzgewölbe der Kompanie. Zwei Ketten-Bastionen sperren die Hafeneinfahrt.',
    moats: [{ kind: 'kanal', bridge: 'holz', name: 'Keizersgracht' }, { kind: 'kanal', bridge: 'stein', name: 'Schatzgracht' }],
    special: 'schatzgewoelbe',
    extra: [{ theme: 'kontor', deg: -24, d: 0.86 }, { theme: 'lagerviertel', deg: 24, d: 0.78 }, { theme: 'kontorviertel', deg: 150, d: 0.74 }, { theme: 'werft', deg: -150, d: 0.84 }],
    grass: 0.88, goods: ['gewuerze', 'luxusgueter', 'stoffe'],
    boss: { name: 'Generalstatthalter Maurits van Oranjeveld', title: 'Schatzkaiser von Batavia', intro: 'Jeder Gulden dieser Insel ist mit Blut bewacht.', phase2: 'Van Oranjeveld öffnet die Söldnerkasse und entfesselt die Gold-Aura' },
    relic: { id: 'bauplan_batavia', name: 'Mythischer Bauplan: Goldener Kontorrumpf', info: 'Ein Rumpf aus Teak und Kupfer, gebaut für die Schatzflotten der Kompanie.' },
    fleet: ['Keizerlijke Leeuw', 'Gouden Vloot', 'Zeven Provinciën', 'Oranje Kroon', 'Schatkist', 'Batavische Wacht'],
  },
  {
    id: 'kaiserdom', power: 'deutschland', name: 'Eiserner Kaiserdom', title: 'Hochofen-Zitadelle der Hanse', r: 540, biome: 'klippe',
    label: 'Eiserne Kaiserfestung', flag: 'hanse', statue: 'krieger', keep: 'bergfried',
    info: 'Schwarzer Stahl und Granit: Artillerietürme, eine glühende Hochofen-Zitadelle und ein Dom aus Eisen. Über die Kluft und den Glutgraben führen nur breite Steinbrücken.',
    moats: [{ kind: 'kluft', bridge: 'stein', name: 'Eisenkluft' }, { kind: 'lava', bridge: 'obsidian', name: 'Glutgraben' }],
    special: 'hochofen',
    extra: [{ theme: 'werft', deg: -24, d: 0.84 }, { theme: 'giesserei', deg: 24, d: 0.8 }, { theme: 'erzterrassen', deg: 150, d: 0.74 }, { theme: 'exerzierplatz', deg: -150, d: 0.74 }],
    grass: 0.5, goods: ['kanonenstahl', 'werkzeuge', 'schmiedekohle'],
    boss: { name: 'Eiserner Kaiser Konrad von Hohenwacht', title: 'Herr des Eisernen Kaiserdoms', intro: 'Stahl bricht nicht. Der Kaiser auch nicht.', phase2: 'Von Hohenwacht feuert die Hochöfen an und entfesselt die Eisen-Aura' },
    relic: { id: 'bauplan_kaiserdom', name: 'Mythischer Bauplan: Eiserne Panzerplatten', info: 'Geschmiedet im Hochofen des Kaiserdoms – schwarzer Stahl für den Rumpf.' },
    fleet: ['SMS Kaiserdom', 'SMS Eisenwall', 'SMS Hochofen', 'SMS Granitfaust', 'SMS Reichsadler', 'SMS Hohenwacht'],
  },
  {
    id: 'solis', power: 'frankreich', name: 'Palais Impérial Solis', title: 'Sonnenthron der Armada', r: 580, biome: 'weinland',
    label: 'Terrassen-Zitadelle der Armada', flag: 'lilie', statue: 'koenigin', keep: 'bergfried',
    info: 'Eine Terrassen-Zitadelle aus Marmor: Kolonnaden, goldene Kuppeln und die Kaiserliche Garde. Hinter der Hafenkette liegen zwei Ringe aus Marmormauern.',
    moats: [{ kind: 'sund', bridge: 'marmor', name: 'Canal Impérial' }, { kind: 'sund', bridge: 'marmor', name: 'Canal du Trône' }],
    special: 'kolonnade',
    extra: [{ theme: 'kontor', deg: -24, d: 0.86 }, { theme: 'terrassengarten', deg: 24, d: 0.76 }, { theme: 'weinberg', deg: 150, d: 0.76 }, { theme: 'amphitheater', deg: -150, d: 0.72 }],
    grass: 0.9, goods: ['wein', 'seide', 'fechtklingen'],
    boss: { name: 'Sonnenkaiser Aurélien de Solis', title: 'Herr des Palais Impérial', intro: 'Die Sonne geht für niemanden unter – am wenigsten für dich.', phase2: 'De Solis ruft die Kaiserliche Garde und entfesselt die Sonnen-Aura' },
    relic: { id: 'bauplan_solis', name: 'Mythischer Bauplan: Sonnensegel der Armada', info: 'Goldbestickte Segel aus der Werkstatt des Palais – sie fangen jeden Wind.' },
    fleet: ['Soleil Impérial', 'Lys de Fer', 'Garde du Trône', 'Marbre Royal', 'Couronne d’Or', 'Aube Éternelle'],
  },
  {
    id: 'tenkoku', power: 'kurogane', name: 'Shogunats-Zitadelle Tenkoku', title: 'Himmelsfestung des Vulkans', r: 620, biome: 'glut',
    label: 'Vulkan-Pagodenfestung', flag: 'kurogane', statue: 'krieger', keep: 'pagode',
    info: 'Eine Pagodenfestung im Krater eines Vulkans: Lavagräben, Obsidianbrücken und der Thron des Shōguns über glühendem Fels.',
    moats: [{ kind: 'lava', bridge: 'obsidian', name: 'Feuergraben' }, { kind: 'lava', bridge: 'obsidian', name: 'Himmelsgraben' }],
    special: 'pagodenburg',
    extra: [{ theme: 'werft', deg: -24, d: 0.84 }, { theme: 'korsarenlager', deg: 24, d: 0.78 }, { theme: 'dojo', deg: 150, d: 0.74 }, { theme: 'dojo', deg: -150, d: 0.74 }],
    grass: 0.32, goods: ['schwefel', 'obsidian', 'medizin'],
    boss: { name: 'Shōgun Kurenai Tenkoku', title: 'Herr der Himmelsfestung', intro: 'Der Vulkan atmet. Und mit ihm der Shōgun.', phase2: 'Der Shōgun ruft die Leibgarde und entfesselt die Glut-Aura' },
    relic: { id: 'bauplan_tenkoku', name: 'Mythischer Bauplan: Obsidian-Ramme', info: 'Ein Rammsporn aus Vulkanglas, gehärtet im Feuer des Kraters.' },
    fleet: ['Tenkoku-maru', 'Kaen-maru', 'Raijin-maru', 'Kurogane-maru', 'Akatsuki-maru', 'Yamikaze-maru'],
  },
];

export const KAISER_SPEC_BY_ID: Record<KaiserId, KaiserIslandSpec> = Object.fromEntries(KAISER_SPECS.map((k) => [k.id, k])) as Record<KaiserId, KaiserIslandSpec>;
export const isKaiserId = (id: string): id is KaiserId => id in KAISER_SPEC_BY_ID;

// ---------- Aufbau: Ringe, Tore, Bucht ----------

/**
 * Grundriss einer Kaiser-Insel in Inselkoordinaten (Meter ab Inselmitte, Peilungen in Grad): Bucht, die beiden Mauerringe mit ihren Gräben und
 * Toren, Thron-Zitadelle. Äußerer Ring: Tore zur Bucht und gegenüber; innerer Ring: Tore quer dazu (der Weg zum Thron führt um den Ring herum).
 */
export interface KaiserLayout {
  bay: number;
  /** Mauer- und Grabenradien */
  outerWall: number; outerMoat: number; innerWall: number; innerMoat: number;
  outerGates: [number, number];
  innerGates: [number, number];
  /** Mitte des Gürtels zwischen den Ringen */
  mid: number;
  /** Ringweg im Gürtel (knapp innerhalb der äußeren Mauer) */
  road: number;
}

export function kaiserLayout(k: Pick<KaiserIslandSpec, 'r' | 'power'>): KaiserLayout {
  const bay = bayOf(k.power);
  const outerWall = Math.round(k.r * 0.5), innerWall = Math.round(k.r * 0.25);
  return {
    bay, outerWall, outerMoat: outerWall + 20, innerWall, innerMoat: innerWall + 16,
    outerGates: [bay, (bay + 180) % 360], innerGates: [(bay + 90) % 360, (bay + 270) % 360],
    mid: Math.round((outerWall + innerWall + 16) / 2),
    road: outerWall - 28,
  };
}

/** Phase einer Küstenwelle, deren Tal genau in der Bucht liegt: Radius × (1 + a·sin(f·Winkel + p)) ist dort am kleinsten */
const bayPhase = (bay: number, f: number): number => {
  const a0 = Math.PI / 2 - (bay * Math.PI) / 180;
  const p = -Math.PI / 2 - f * a0;
  return ((p % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
};

/** Bogen als Linienzug (Peilung von → bis, Schritte von höchstens `step` Grad) */
export function arcPts(R: number, from: number, to: number, step = 10): [number, number][] {
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / step));
  return Array.from({ length: n + 1 }, (_, i) => polarPt(from + ((to - from) * i) / n, R));
}

const TANGENT_YAW = (b: number): number => {
  const t = (b * Math.PI) / 180;
  return (Math.atan2(Math.cos(t), -Math.sin(t)) * 180) / Math.PI - 90;
};

/**
 * Mauerring aus Zinnenmauer-Modulen (je 6,1 m) mit Türmen alle 30° und offenen Toren: am äußeren Ring flankieren zwei Türme ein 20 m breites Kaiser-Tor
 * (Platz für die Verbände), am inneren Ring steht ein Torhaus im Tor.
 */
export function ringWall(R: number, gates: readonly number[], flag: string, gatehouse: boolean): StructureDef[] {
  const out: StructureDef[] = [];
  const n = Math.round((2 * Math.PI * R) / 6.1);
  const half = ((gatehouse ? 9 : 12) / R) * (180 / Math.PI);
  const angDist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  for (let i = 0; i < n; i++) {
    const b = ((i + 0.5) / n) * 360;
    if (gates.some((g) => angDist(b, g) < half)) continue;
    const [x, z] = polarPt(b, R);
    out.push({ t: 'zinnenmauer', x, z, yaw: TANGENT_YAW(b) });
  }
  // Türme im Ring (nicht an den Toren)
  for (let b = 15; b < 360; b += 30) {
    if (gates.some((g) => angDist(b, g) < half + 6)) continue;
    const [x, z] = polarPt(b, R);
    out.push(S('zinnenturm', x, z));
  }
  for (const g of gates) {
    const side = ((gatehouse ? 10 : 13.5) / R) * (180 / Math.PI);
    for (const s of [-1, 1]) { const [x, z] = polarPt(g + s * side, R); out.push(S('zinnenturm', x, z)); }
    const [fx, fz] = polarPt(g + side * 0.55, R - 6), [gx, gz] = polarPt(g - side * 0.55, R - 6);
    out.push(V('fahne', fx, fz, TANGENT_YAW(g), flag), V('fahne', gx, gz, TANGENT_YAW(g), flag));
    if (gatehouse) { const [x, z] = polarPt(g, R); out.push(S('torhaus', x, z, TANGENT_YAW(g) + 0)); }
    const [lx, lz] = polarPt(g - side * 0.3, R + 9), [rx, rz] = polarPt(g + side * 0.3, R + 9);
    out.push(S('laterne', lx, lz, 0), S('laterne', rx, rz, 0));
  }
  return out;
}

/** Bauten eines Kaiser-Bausteins (+z = vorn) und der Freiraum, den er braucht */
export function kaiserItems(theme: string, k: Pick<KaiserIslandSpec, 'flag' | 'statue' | 'keep' | 'biome'>): { items: StructureDef[]; clear: number } {
  const f = k.flag;
  switch (theme as KaiserTheme) {
    case 'thronsaal': return { clear: 48, items: [
      // Thron-Zitadelle: Mauergeviert 56 × 56 m mit Torhaus vorn, Ecktürme, Bergfried (oder Pagode) hinten, Hof als Kampfplatz des Kaisers
      ...wallLine(-28, -28, 28, -28), ...wallLine(-28, -28, -28, 28), ...wallLine(28, -28, 28, 28), ...wallLine(-28, 28, -9, 28), ...wallLine(9, 28, 28, 28),
      S('torhaus', 0, 28, 0), S('zinnenturm', -29, -29), S('zinnenturm', 29, -29), S('zinnenturm', -29, 29), S('zinnenturm', 29, 29),
      ...(k.keep === 'pagode' ? [S('pagode', 0, -15, 0), S('pagode', -17, -18, 20), S('pagode', 17, -18, -20)] : [S('bergfried', 0, -15), S('zinnenturm', -17, -15), S('zinnenturm', 17, -15)]),
      V('statue', -9, 4, 0, k.statue), V('statue', 9, 4, 0, k.statue), V('statue', 0, -5, 0, 'kaiser'),
      V('fahne', -22, 22, 0, f), V('fahne', 22, 22, 0, f), V('fahne', -22, -4, 0, f), V('fahne', 22, -4, 0, f),
      S('feuer', -14, 12), S('feuer', 14, 12), S('laterne', -5, 24, 0), S('laterne', 5, 24, 0), S('laterne', -20, 8, 0), S('laterne', 20, 8, 0),
    ] };
    case 'admiralspalast': return { clear: 40, items: [
      S('bergfried', 0, -10), S('zinnenturm', -18, -10), S('zinnenturm', 18, -10), S('kolonialhaus', -16, 8, 0), S('kolonialhaus', 16, 8, 0), S('kapelle', 0, -30, 0),
      S('brunnen', 0, 12), V('statue', -8, 20, 0, 'koenig'), V('statue', 8, 20, 0, 'koenigin'), V('fahne', -24, 14, 0, f), V('fahne', 24, 14, 0, f), V('fahne', 0, 22, 0, f),
      S('laterne', -4, 18, 0), S('laterne', 4, 18, 0), S('laterne', -22, -22, 0), S('laterne', 22, -22, 0),
    ] };
    case 'schatzgewoelbe': return { clear: 34, items: [
      ...themeItems('schatz', k.biome).items, S('lagerhaus', -16, -14, 0), S('lagerhaus', 16, -14, 0), S('zinnenturm', -22, 4), S('zinnenturm', 22, 4),
      V('fahne', -10, 10, 0, f), V('fahne', 10, 10, 0, f), S('kisten', -6, 12, 0), S('faesser', 6, 12, 0), S('laterne', 0, 14, 0),
    ] };
    case 'hochofen': return { clear: 34, items: [
      ...themeItems('giesserei', k.biome).items, S('steinturm', -18, -16), S('steinturm', 18, -16), S('feuer', -9, -18), S('feuer', 9, -18), S('feuer', 0, -26),
      V('fahne', -14, 10, 0, f), V('fahne', 14, 10, 0, f), V('statue', 0, 14, 0, 'krieger'),
    ] };
    case 'kolonnade': return { clear: 36, items: [
      S('saeulen', -14, -10, 90), S('saeulen', -14, 2, 90), S('saeulen', -14, 14, 90), S('saeulen', 14, -10, 90), S('saeulen', 14, 2, 90), S('saeulen', 14, 14, 90),
      V('statue', 0, -18, 0, 'koenigin'), V('statue', -7, 20, 0, 'koenig'), V('statue', 7, 20, 0, 'koenig'), S('brunnen', 0, 2), S('kapelle', 0, -32, 0),
      V('fahne', -22, -20, 0, f), V('fahne', 22, -20, 0, f), S('laterne', -5, 24, 0), S('laterne', 5, 24, 0),
    ] };
    case 'pagodenburg': return { clear: 34, items: [
      S('pagode', 0, -12, 0), S('pagode', -18, 2, 30), S('pagode', 18, 2, -30), S('zaun', -10, 16, 0, 12), S('zaun', 10, 16, 0, 12),
      S('laterne', -4, 16, 0), S('laterne', 4, 16, 0), S('feuer', -8, 6), S('feuer', 8, 6), V('fahne', 0, 10, 0, f), V('statue', 0, -28, 0, 'krieger'),
    ] };
    default: return megaItems(theme as MegaPlot['theme'], k.biome);
  }
}

/** Hügel der Insel: Thronhügel in der Mitte, Wachhügel im äußeren Gürtel (Tenkoku: Kraterrand) */
function kaiserHills(k: KaiserIslandSpec, L: KaiserLayout): SiteDef['hills'] {
  // Thronhügel: rund 50 m über dem Gürtel, die Thron-Zitadelle thront weithin sichtbar über beiden Ringen
  const hills: SiteDef['hills'] = [{ x: 0, z: 0, r: Math.round(L.innerWall * 0.82), h: 0.42 }];
  const belt = Math.round((L.outerMoat + 8 + k.r * 0.93) / 2), hr = Math.round((k.r * 0.93 - L.outerMoat - 8) / 2 * 0.95);
  const rim = k.id === 'tenkoku';
  const bearings = rim ? [70, 110, 150, 180, 210, 250, 290] : [125, 235];
  for (const b of bearings) {
    const [x, z] = polarPt(L.bay + b, belt);
    hills.push({ x, z, r: hr, h: rim ? 0.55 : 0.45 });
  }
  return hills;
}

/** Bauplätze in Inselkoordinaten: Hafen in der Bucht, Küstengeschütze, Leuchtfeuer, Deckungen und der besondere Bau zwischen den Ringen */
function kaiserPlots(k: KaiserIslandSpec, L: KaiserLayout): MegaPlot[] {
  const B = L.bay;
  const plots: MegaPlot[] = [
    { theme: 'hafen', deg: B, d: 0.86 },
    ...k.extra.map((p) => ({ ...p, deg: B + (p.deg ?? 0) })),
    // Küstengeschütze auf beiden Seiten der Bucht und auf der Rückseite
    { theme: 'batterie', deg: B - 62, d: 0.9 }, { theme: 'batterie', deg: B + 62, d: 0.9 }, { theme: 'batterie', deg: B - 112, d: 0.9 }, { theme: 'batterie', deg: B + 112, d: 0.9 },
    { theme: 'leuchtfeuer', deg: B + 180, d: 0.9 },
    // Deckungsmauern vor den Toren des inneren Rings
    { theme: 'deckung', at: polarPt(B + 60, L.mid - 12), turn: 90 }, { theme: 'deckung', at: polarPt(B - 60, L.mid - 12), turn: -90 },
    { theme: 'deckung', at: polarPt(B + 125, L.mid - 12), turn: 90 }, { theme: 'deckung', at: polarPt(B - 125, L.mid - 12), turn: -90 },
    { theme: k.special as MegaPlot['theme'], at: polarPt(B + 180, L.innerMoat + 46), turn: 180 },
  ];
  return plots;
}

/** Wege: vom Hafen durch das äußere Tor, im Gürtel um den inneren Ring zu seinen Toren und hinauf zur Thron-Zitadelle; Küstenweg zu den Geschützen */
function kaiserRoads(k: KaiserIslandSpec, L: KaiserLayout): SiteDef['roads'] {
  const B = L.bay, surface = k.biome === 'weinland' ? 'marmor' as const : 'stein' as const;
  const coast = Math.round(k.r * 0.74);
  return [
    { w: 5, surface, pts: [polarPt(B, k.r * 0.8), polarPt(B, L.outerMoat + 30), polarPt(B, L.outerMoat), polarPt(B, L.outerWall - 20)] },
    { w: 4.4, surface, pts: [polarPt(B, L.outerWall - 20), ...arcPts(L.road, B + 4, B + 176), polarPt(B + 180, L.outerWall - 20)] },
    { w: 4.4, surface, pts: [polarPt(B, L.outerWall - 20), ...arcPts(L.road, B - 4, B - 176), polarPt(B + 180, L.outerWall - 20)] },
    { w: 4.6, surface, pts: [polarPt(B + 90, L.road), polarPt(B + 90, L.innerMoat + 14), polarPt(B + 90, L.innerMoat), polarPt(B + 90, L.innerWall - 14), polarPt(B + 40, 30)] },
    { w: 4.6, surface, pts: [polarPt(B - 90, L.road), polarPt(B - 90, L.innerMoat + 14), polarPt(B - 90, L.innerMoat), polarPt(B - 90, L.innerWall - 14), polarPt(B - 40, 30)] },
    { w: 4.2, surface, pts: [polarPt(B + 180, L.outerWall - 20), polarPt(B + 180, L.outerMoat), polarPt(B + 180, L.outerMoat + 30), polarPt(B + 180, k.r * 0.84)] },
    { w: 3.4, surface, pts: [polarPt(B, k.r * 0.8), ...arcPts(coast, B + 8, B + 100)] },
    { w: 3.4, surface, pts: [polarPt(B, k.r * 0.8), ...arcPts(coast, B - 8, B - 100)] },
  ];
}

/** Die Kaiser-Insel im Datenformat der Mega-Inseln */
export function kaiserMegaSpec(k: KaiserIslandSpec): MegaIslandSpec {
  const L = kaiserLayout(k);
  const site = KAISER_SITES.find((s) => s.power === k.power)!;
  const p = KAISER_IDS.indexOf(k.id) * 1.3 + 0.7;
  return {
    id: k.id, name: k.name, title: k.title, power: k.power, deg: site.deg, dist: KAISER_SITE_DIST, r: k.r, kind: 'harbor', biome: k.biome, tier: 5,
    // feine Grundwellen und drei große Wellen, deren Täler alle in der Bucht liegen: eine weite Hafenbucht zur Weltmitte hin
    coast: [...fine(p), C(0.055, 2, bayPhase(L.bay, 2)), C(0.04, 3, bayPhase(L.bay, 3)), C(0.025, 5, bayPhase(L.bay, 5))],
    hills: kaiserHills(k, L), grass: k.grass, villagers: 0, label: k.label, info: k.info,
    plots: kaiserPlots(k, L),
    roads: kaiserRoads(k, L),
    rifts: [
      { kind: k.moats[0].kind, w: 14, name: k.moats[0].name, bridge: k.moats[0].bridge, wide: true, pts: ringPts(L.outerMoat, 40), crossAt: L.outerGates.map((g) => polarPt(g, L.outerMoat)) },
      { kind: k.moats[1].kind, w: 12, name: k.moats[1].name, bridge: k.moats[1].bridge, wide: true, pts: ringPts(L.innerMoat, 28), crossAt: L.innerGates.map((g) => polarPt(g, L.innerMoat)) },
    ],
    districts: [
      { id: 'ring1', name: 'Äußerer Festungsring', kind: 'garnison', at: polarPt(L.bay, L.outerWall), r: 60, squad: ['hauptmann', 'schildtraeger', 'musketier'], lvl: 0 },
      { id: 'ring2', name: 'Innerer Festungsring', kind: 'engpass', at: polarPt(L.innerGates[0], L.innerWall), r: 50, squad: ['hauptmann', 'schildtraeger', 'musketier'], lvl: 1 },
      { id: 'thron', name: 'Thronsaal', kind: 'hof', at: [0, 0], r: 40, squad: ['legende'], lvl: 3 },
    ],
    commander: { name: k.boss.name, title: k.boss.title, lvl: 3, guard: ['hauptmann', 'hauptmann'], route: ['thron'] },
    skerries: [],
    goods: k.goods,
  };
}

export const KAISER_ISLANDS: readonly MegaIslandSpec[] = KAISER_SPECS.map(kaiserMegaSpec);
for (const m of KAISER_ISLANDS) registerMegaSpec(m);

/** Siedlungsdaten einer Kaiser-Insel: Bauplätze, beide Mauerringe, Thron-Zitadelle, Wege und Gräben */
export function kaiserSite(k: KaiserIslandSpec): SiteDef {
  const m = KAISER_ISLANDS.find((x) => x.id === k.id)!;
  const L = kaiserLayout(k);
  const clusters: ClusterDef[] = m.plots.map((pl, i) => {
    const t = kaiserItems(pl.theme, k);
    return { name: `${k.name} · ${pl.theme}`, ...(pl.at ? { at: pl.at } : { deg: pl.deg ?? 0, d: pl.d ?? 0.7 }), turn: pl.turn, clear: t.clear * (i === 0 ? 1 : 0.92), items: t.items };
  });
  // Thron-Zitadelle (Front zum ersten inneren Tor) und die beiden Mauerringe (Mitte der Insel, ohne Drehung)
  clusters.push({ name: `${k.name} · Thronsaal`, at: [0, 0], turn: L.innerGates[0], clear: 46, items: kaiserItems('thronsaal', k).items });
  clusters.push({ name: `${k.name} · Äußerer Ring`, at: [0, 0], turn: 0, clear: 1, items: ringWall(L.outerWall, L.outerGates, k.flag, false) });
  clusters.push({ name: `${k.name} · Innerer Ring`, at: [0, 0], turn: 0, clear: 1, items: ringWall(L.innerWall, L.innerGates, k.flag, true) });
  return {
    label: m.label,
    coast: m.coast,
    hills: m.hills,
    grass: m.grass,
    clusters,
    roads: m.roads ?? [],
    rifts: m.rifts.map((r) => ({ kind: r.kind, w: r.w, pts: r.pts, cross: r.crossAt.map((c) => polylineT(r.pts, c)), bridge: r.bridge, name: r.name, wide: r.wide })),
    // Festungsinseln: weniger Bewuchs als die Mega-Inseln (Mauern, Plätze, Wege), Gras nur halb so dicht
    scatter: scatterOf(k.biome).map((l) => ({ ...l, perHa: l.perHa * (l.flora === 'gras' || l.flora === 'halme' || l.flora === 'blume' ? 0.4 : 0.55) })),
    villagers: 0,
    themed: true,
  };
}

export const KAISER_SITE_DEFS: Record<string, SiteDef> = Object.fromEntries(KAISER_SPECS.map((k) => [k.id, kaiserSite(k)]));

/** Die Kaiser-Inseln als Insel-Definitionen (fertige Weltkoordinaten, Ring 5, Gefahrenstufe 5) */
export function kaiserIslandDefs(): IslandDef[] {
  return KAISER_ISLANDS.map((m) => {
    const a = (m.deg * Math.PI) / 180;
    return {
      id: m.id, name: m.name, x: Math.round(Math.sin(a) * m.dist), z: Math.round(Math.cos(a) * m.dist), r: m.r, hill: 0.2, kind: m.kind, palms: 0, rocks: 0, info: m.info,
      biome: m.biome, site: m.id, placed: true, themePower: m.power, mega: true, kaiser: true, level: KAISER_LEVEL, dangerTier: 5,
    };
  });
}

// ---------- Seesperre: Ketten-Bastionen, Hafenkette, Wachflotte (Inselkoordinaten) ----------

export interface KaiserBlockade {
  /** Die beiden Ketten-Bastionen im Wasser vor der Bucht (Mitte, Radius des Sockels) */
  bastions: { x: number; z: number; r: number }[];
  /** Hafenkette zwischen den Bastionen */
  chain: { ax: number; az: number; bx: number; bz: number };
  /** Stationen der Wachschiffe (seewärts der Kette) und ihre Fahrtrichtung (rad, wie `Ship.heading`) */
  guards: { x: number; z: number; heading: number }[];
  /** Ankerplatz für den Angriff (außerhalb der Reichweite der Bastionen) */
  approach: { x: number; z: number };
}

export function kaiserBlockade(k: Pick<KaiserIslandSpec, 'r' | 'power'>): KaiserBlockade {
  const B = kaiserLayout(k).bay;
  const far = k.r * 1.12;
  const [ax, az] = polarPt(B - 15, far), [bx, bz] = polarPt(B + 15, far);
  const out = (b: number, d: number) => polarPt(B + b, d);
  const head = (b: number) => ((B + b) * Math.PI) / 180;
  const guards = [-30, -15, 0, 15, 30, 0].map((b, i) => { const [x, z] = out(b, k.r * (i === 5 ? 1.62 : 1.38)); return { x, z, heading: head(b) + Math.PI / 2 }; });
  const [px, pz] = out(0, k.r * 2.6);
  return { bastions: [{ x: ax, z: az, r: 15 }, { x: bx, z: bz, r: 15 }], chain: { ax, az, bx, bz }, guards, approach: { x: px, z: pz } };
}

/**
 * Wo die Verbände der beiden Festungsringe stehen (Inselkoordinaten): Ring 1 vor und hinter den beiden Kaiser-Toren, Ring 2 vor den Toren des inneren
 * Rings. Je Ring zwei Elite-Offiziere (Hauptmänner mit Aura).
 */
export interface KaiserRingPosts {
  squads: { x: number; z: number; yaw: number; typ: 'schwert' | 'musketier' | 'schlaeger'; heads: number }[];
  officers: { x: number; z: number }[];
  /** Wo der Ring „betreten“ wird: Mittelpunkt und Radius der Weckzone */
  wake: { x: number; z: number; r: number }[];
}

export function kaiserRingPosts(k: Pick<KaiserIslandSpec, 'r' | 'power'>, ring: 0 | 1): KaiserRingPosts {
  const L = kaiserLayout(k);
  const posts: KaiserRingPosts = { squads: [], officers: [], wake: [] };
  const facing = (b: number) => ((b + 180) * Math.PI) / 180;
  if (ring === 0) {
    // Äußerer Ring: das Kaiser-Tor zur Bucht – zwei Verbände davor, zwei im Tor, zwei an den Flanken dahinter, zwei Elite-Offiziere
    const g = L.outerGates[0];
    const at = (b: number, d: number): [number, number] => polarPt(g + b, d);
    const put = (b: number, d: number, typ: 'schwert' | 'musketier' | 'schlaeger', heads: number) => { const [x, z] = at(b, d); posts.squads.push({ x, z, yaw: facing(g), typ, heads }); };
    put(-1.6, L.outerWall + 14, 'schwert', 14); put(1.6, L.outerWall + 14, 'schwert', 14);
    put(0, L.outerWall - 22, 'schwert', 12); put(0, L.outerWall - 40, 'schlaeger', 12);
    put(-7, L.outerWall - 30, 'musketier', 10); put(7, L.outerWall - 30, 'musketier', 10);
    for (const s of [-1, 1]) { const [x, z] = at(s * 3, L.outerWall - 16); posts.officers.push({ x, z }); }
    const [wx, wz] = at(0, L.outerWall + 30);
    posts.wake.push({ x: wx, z: wz, r: 130 });
  } else {
    // Innerer Ring: beide Tore, je drei Verbände und ein Elite-Offizier
    for (const g of L.innerGates) {
      const [ox, oz] = polarPt(g, L.innerMoat + 22), [ix, iz] = polarPt(g, L.innerWall - 16);
      const side = (12 / L.innerMoat) * (180 / Math.PI);
      const [mx, mz] = polarPt(g + side, L.innerMoat + 32);
      posts.squads.push({ x: ox, z: oz, yaw: facing(g), typ: 'schwert', heads: 14 }, { x: ix, z: iz, yaw: facing(g), typ: 'schwert', heads: 12 }, { x: mx, z: mz, yaw: facing(g), typ: 'musketier', heads: 10 });
      const [cx, cz] = polarPt(g, L.innerMoat + 10);
      posts.officers.push({ x: cx, z: cz });
      const [wx, wz] = polarPt(g, L.mid);
      posts.wake.push({ x: wx, z: wz, r: 110 });
    }
  }
  return posts;
}

/** Kampfplatz des Kaisers: Hof der Thron-Zitadelle (Inselkoordinaten), dazu der Radius, ab dem er erscheint */
export function kaiserThrone(k: Pick<KaiserIslandSpec, 'r' | 'power'>): { x: number; z: number; wake: number } {
  const L = kaiserLayout(k);
  const [x, z] = polarPt(L.innerGates[0], 12);
  return { x, z, wake: L.innerWall - 6 };
}
