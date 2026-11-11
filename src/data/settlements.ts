// Handgebaute Länder: Landform, Siedlungen und Bewuchs für das Festland und die neuen Inseln.
// Alles hier sind reine Daten – neue Dörfer, Türme oder Wälder entstehen durch Einträge, nicht durch Code.

/** Bauten aus world/architecture.ts */
export type StructureType =
  | 'holzhuette' | 'stelzenhuette' | 'steinhaus' | 'gasthaus' | 'scheune'
  | 'wachturm' | 'steinturm'
  | 'ruine' | 'ruinenbogen' | 'saeulen'
  | 'zaun' | 'mauer' | 'steg'
  | 'kisten' | 'fass' | 'faesser'
  | 'brunnen' | 'laterne' | 'feld' | 'heu' | 'boot' | 'netz' | 'feuer';

export interface StructureDef {
  t: StructureType;
  /** Lage im Siedlungsraster in Metern: +z zeigt nach „vorn“ (zur Küste), +x nach rechts */
  x: number;
  z: number;
  /** Drehung in Grad gegenüber dem Raster (0 = Tür/Vorderseite nach vorn) */
  yaw?: number;
  /** Länge in Metern (Zaun, Mauer, Steg) */
  len?: number;
}

/** Eine Siedlung oder ein einzelnes Bauwerk: Lage auf der Insel und alles, was dort steht */
export interface ClusterDef {
  name: string;
  /** Lage an der Küste: Richtung in Grad (0 = Norden/+z, 90 = Osten/+x) und Abstand als Anteil des Küstenradius … */
  deg?: number;
  d?: number;
  /** … oder fest in Metern ab Inselmitte */
  at?: [number, number];
  /** Zusätzliche Drehung in Grad (ohne Angabe zeigt „vorn“ von der Inselmitte weg) */
  turn?: number;
  /** In diesem Umkreis (Meter) wachsen keine Bäume, Büsche und Felsen */
  clear: number;
  items: StructureDef[];
}

/** Pflanzen und Felsen aus world/vegetation.ts */
export type FloraId = 'palme' | 'laubbaum' | 'birke' | 'windkiefer' | 'busch' | 'farn' | 'gras' | 'halme' | 'blume' | 'fels' | 'basalt' | 'basaltblock';

export interface ScatterLayer {
  flora: FloraId;
  /** Stück je Hektar (100 m × 100 m) bei normaler Detailstufe */
  perHa: number;
  /** Gürtel als Anteil des Küstenradius: 0 = Inselmitte, 1 = Wasserlinie */
  zone: [number, number];
  /** Größe (Faktor) von … bis */
  size: [number, number];
  /** Haine statt Gleichverteilung: [Größe der Flecken in Metern, Schwelle 0 … 1 (höher = weniger, dichtere Flecken)] */
  grove?: [number, number];
  /** Mindestabstand zu anderen Objekten in Metern */
  space: number;
  /** Nur auf Hängen (true) oder nur im Flachen (false); ohne Angabe überall */
  slope?: boolean;
}

export interface SiteDef {
  /** Unterzeile des Inselschilds */
  label: string;
  /** Küstenlinie: Radius × (1 + Σ a·sin(f·Winkel + p)) */
  coast: { a: number; f: number; p: number }[];
  /** Hügel in Metern ab Inselmitte: Radius r, Höhe = r × h. Zu große Hügel werden an die Küste angepasst. */
  hills: { x: number; z: number; r: number; h: number }[];
  /** Anteil der Grasfläche (Rest ist Strand) */
  grass: number;
  clusters: ClusterDef[];
  /** Wege als Linienzüge in Metern ab Inselmitte, mit Breite */
  roads: { w: number; pts: [number, number][] }[];
  scatter: ScatterLayer[];
  /** Bewohner, die beim Landgang um die erste Siedlung schlendern */
  villagers: number;
}

const S = (t: StructureType, x: number, z: number, yaw = 0, len?: number): StructureDef => ({ t, x, z, yaw, len });
/** Rechteckiger Zaun (oder Mauer) um einen Platz, mit einer Lücke als Tor an der Vorderseite */
function pen(t: 'zaun' | 'mauer', cx: number, cz: number, w: number, d: number): StructureDef[] {
  const g = 2.4;
  return [
    S(t, cx, cz - d / 2, 0, w),
    S(t, cx - w / 2, cz, 90, d),
    S(t, cx + w / 2, cz, 90, d),
    S(t, cx - (w / 4 + g / 4), cz + d / 2, 0, w / 2 - g / 2),
    S(t, cx + (w / 4 + g / 4), cz + d / 2, 0, w / 2 - g / 2),
  ];
}

export const SITES: Record<string, SiteDef> = {
  // ---------- Festland: Grasland, Laubwälder, Dorf, Höfe, Wachturm ----------
  gruenmark: {
    label: 'Festland',
    coast: [
      { a: 0.03, f: 7, p: 0.9 }, { a: 0.015, f: 13, p: 2.2 },
      { a: 0.11, f: 2, p: 0.6 }, { a: 0.07, f: 3, p: 2.1 }, { a: 0.04, f: 5, p: 4.0 },
    ],
    hills: [
      { x: 55, z: -35, r: 82, h: 0.2 },    // Wachhügel
      { x: -95, z: 35, r: 62, h: 0.13 },   // Schäferhügel
      { x: -40, z: -135, r: 66, h: 0.16 },
      { x: 120, z: 85, r: 48, h: 0.12 },
      { x: 135, z: -105, r: 52, h: 0.15 },
      { x: -150, z: -55, r: 44, h: 0.12 },
    ],
    grass: 0.9,
    villagers: 7,
    clusters: [
      {
        name: 'Weidenbrück', deg: 0, d: 0.8, clear: 46,
        items: [
          S('steinhaus', -10, -8, 90), S('steinhaus', -10, 4, 90), S('holzhuette', -10, 15, 90),
          S('steinhaus', 10, -10, -90), S('holzhuette', 10, 2, -90), S('steinhaus', 10.5, 14, -90),
          S('gasthaus', 0, -27, 0), S('steinhaus', -22, -22, 45), S('holzhuette', 23, -22, -45),
          S('brunnen', 0, -12), S('laterne', -4.2, -2, 90), S('laterne', 4.2, 9, -90), S('laterne', -3.4, 24, 90),
          S('kisten', 5, 24, 20), S('faesser', -5.5, 22, 0), S('fass', 6.5, 27.5), S('kisten', -4.5, 29, -30),
          S('heu', -20, -10), S('zaun', -18, 10, 90, 9), S('zaun', 18.5, 8, 90, 10),
          S('boot', 12, 30, 70), S('netz', -12, 29, 10),
          S('steg', 0, 0, 0, 34),
        ],
      },
      {
        name: 'Wachturm auf dem Wachhügel', at: [55, -35], turn: 180, clear: 13,
        items: [
          S('steinturm', 0, 0), S('feuer', 5.5, 3), S('kisten', -4.5, 3.5, 40), S('fass', -5.4, 1.2),
          S('zaun', 0, -8, 0, 12), S('zaun', -8, -2, 90, 9), S('laterne', 3.4, -3.5, 180),
        ],
      },
      {
        name: 'Hof Kornblum', at: [150, 15], turn: 180, clear: 34,
        items: [
          S('steinhaus', 0, 0, 0), S('scheune', -13, -2, 0), S('brunnen', 6, 8), S('heu', -12, 8), S('heu', -15.2, 9.4),
          S('feld', 4, -18, 0, 16), S('feld', 4, -28, 0, 16), S('feld', -14, -22, 90, 14),
          ...pen('zaun', 15, -1, 11, 12), S('faesser', -7, 6, 30), S('kisten', 8, -5, 15), S('laterne', 3, 5.5, 0),
        ],
      },
      {
        name: 'Alte Abtei', at: [-118, -72], turn: 20, clear: 22,
        items: [
          S('ruine', 0, 0, 0), S('ruinenbogen', 0, 12, 0), S('saeulen', -11, 2, 0), S('saeulen', 11, -3, 90),
          S('mauer', -9, -11, 12, 9), S('mauer', 10, 11, 80, 7),
        ],
      },
      {
        name: 'Fischerweiler Südstrand', deg: 178, d: 0.84, clear: 28,
        items: [
          S('stelzenhuette', -9, -3, 30), S('stelzenhuette', 2, -7, 0), S('holzhuette', 12, -2, -35),
          S('feuer', 1, 3), S('netz', -5, 9, 0), S('boot', 8, 10, 100), S('boot', 11.5, 12, 80),
          S('kisten', -11, 6, 0), S('faesser', 5, 6.5, 0), S('laterne', -2, 12, 0),
          S('steg', -1, 0, 0, 28),
        ],
      },
      {
        name: 'Fähranleger', deg: 308, d: 0.86, clear: 18,
        items: [
          S('holzhuette', -7, -3, 20), S('wachturm', 8, -4), S('kisten', -2, 5, 10), S('fass', 3, 6), S('laterne', 2.2, 9, 0),
          S('zaun', -9, 6, 0, 7), S('steg', 0, 0, 0, 30),
        ],
      },
      {
        name: 'Schäferhütte', at: [-95, 35], turn: 200, clear: 14,
        items: [S('holzhuette', 0, 0, 0), ...pen('zaun', 10, 0, 10, 9), S('heu', -5, 3), S('fass', 3.4, 2.6)],
      },
      {
        name: 'Ostwacht', deg: 92, d: 0.84, clear: 12,
        items: [S('wachturm', 0, 0), S('kisten', 4, 2, 0), S('fass', -3.5, 2.5), S('zaun', 0, -5, 0, 9)],
      },
    ],
    roads: [
      // Dorfstraße vom Steg durchs Dorf, hinauf zum Wachturm
      { w: 3.4, pts: [[2, 222], [0, 196], [-2, 172], [6, 140], [22, 96], [38, 52], [50, 10], [54, -22]] },
      // Abzweig zum Hof und weiter zur Ostwacht
      { w: 2.6, pts: [[22, 96], [70, 70], [112, 40], [142, 22], [180, 12], [214, -6]] },
      // nach Südwesten: Schäferhütte, Abtei, Südstrand
      { w: 2.4, pts: [[6, 140], [-40, 100], [-84, 44], [-104, -10], [-116, -56], [-80, -120], [-30, -176], [-6, -214]] },
      // zum Fähranleger
      { w: 2.4, pts: [[-84, 44], [-130, 82], [-168, 120], [-186, 138]] },
    ],
    scatter: [
      { flora: 'laubbaum', perHa: 30, zone: [0.05, 0.86], size: [0.75, 1.25], grove: [70, 0.5], space: 2.6 },
      { flora: 'laubbaum', perHa: 2.2, zone: [0.05, 0.86], size: [1, 1.45], space: 6 },
      { flora: 'birke', perHa: 10, zone: [0.1, 0.88], size: [0.8, 1.3], grove: [45, 0.62], space: 2.2 },
      { flora: 'busch', perHa: 22, zone: [0.04, 0.9], size: [0.7, 1.5], grove: [60, 0.42], space: 1.4 },
      { flora: 'farn', perHa: 26, zone: [0.05, 0.86], size: [0.7, 1.3], grove: [70, 0.52], space: 0.9 },
      { flora: 'gras', perHa: 520, zone: [0.02, 0.8], size: [0.7, 1.5], space: 0.3 },
      { flora: 'halme', perHa: 55, zone: [0.02, 0.8], size: [0.8, 1.4], grove: [38, 0.55], space: 0.4 },
      { flora: 'halme', perHa: 60, zone: [0.8, 0.95], size: [0.7, 1.2], grove: [26, 0.5], space: 0.4 },
      { flora: 'blume', perHa: 70, zone: [0.03, 0.8], size: [0.8, 1.3], grove: [28, 0.6], space: 0.3 },
      { flora: 'fels', perHa: 4.5, zone: [0.1, 1.06], size: [0.6, 2.2], space: 2 },
      { flora: 'fels', perHa: 8, zone: [0.15, 0.8], size: [0.5, 1.4], slope: true, space: 1.6 },
    ],
  },

  // ---------- Tropen-Küste: viel Sand, Palmen, Fischerdorf auf Stelzen ----------
  palmenkueste: {
    label: 'Tropenküste',
    coast: [
      { a: 0.03, f: 7, p: 3.1 }, { a: 0.012, f: 13, p: 0.4 },
      { a: 0.16, f: 1, p: 1.0 }, { a: 0.09, f: 2, p: 0.3 }, { a: 0.05, f: 4, p: 2.0 },
    ],
    hills: [{ x: -22, z: -14, r: 36, h: 0.13 }, { x: 28, z: 30, r: 20, h: 0.1 }],
    grass: 0.46,
    villagers: 5,
    clusters: [
      {
        name: 'Fischerdorf Korallenkai', deg: 60, d: 0.72, clear: 30,
        items: [
          S('stelzenhuette', -15, -4, 25), S('stelzenhuette', -6, -9, 8), S('stelzenhuette', 5, -9, -10), S('stelzenhuette', 15, -3, -28),
          S('holzhuette', 0, -20, 0), S('feuer', 0, 0), S('laterne', -7, 7, 0), S('laterne', 8, 8, 0),
          S('kisten', -11, 8, 15), S('faesser', 11.5, 4.5, 0), S('fass', -3.5, 11), S('kisten', 4.5, 12, -20),
          S('netz', -17, 9, 20), S('netz', 16.5, 11, -25), S('boot', -9, 17, 80), S('boot', 9.5, 18, 100),
          S('steg', -3, 0, 0, 30), S('steg', 13, 0, -12, 28),
        ],
      },
      {
        name: 'Ausguck', deg: 215, d: 0.7, clear: 10,
        items: [S('wachturm', 0, 0), S('fass', 3.2, 1.5), S('kisten', -3.6, 2, 30), S('zaun', 0, -5, 0, 8)],
      },
      {
        name: 'Strandlager', deg: 300, d: 0.74, clear: 9,
        items: [S('holzhuette', 0, -2, 0), S('boot', 5, 6, 60), S('kisten', -4.5, 4, 0), S('feuer', 1, 6)],
      },
    ],
    roads: [],
    scatter: [
      { flora: 'palme', perHa: 105, zone: [0.3, 0.93], size: [0.8, 1.35], grove: [34, 0.36], space: 2.2 },
      { flora: 'palme', perHa: 30, zone: [0.8, 0.97], size: [0.7, 1.1], space: 2.6 },
      { flora: 'busch', perHa: 60, zone: [0.05, 0.66], size: [0.7, 1.4], grove: [30, 0.4], space: 1.3 },
      { flora: 'farn', perHa: 150, zone: [0.05, 0.72], size: [0.8, 1.5], grove: [26, 0.4], space: 0.8 },
      { flora: 'gras', perHa: 420, zone: [0.02, 0.44], size: [0.7, 1.3], space: 0.3 },
      { flora: 'halme', perHa: 120, zone: [0.6, 0.9], size: [0.7, 1.2], grove: [18, 0.5], space: 0.4 },
      { flora: 'blume', perHa: 160, zone: [0.03, 0.44], size: [0.9, 1.5], grove: [20, 0.5], space: 0.3 },
      { flora: 'fels', perHa: 14, zone: [0.5, 1.08], size: [0.6, 1.8], space: 2 },
    ],
  },

  // ---------- Sturm-Klippe: Basaltsäulen, windschiefe Kiefern, Ruinen einer Warte ----------
  sturmklippe: {
    label: 'Basaltklippe',
    coast: [
      { a: 0.03, f: 9, p: 1.4 }, { a: 0.02, f: 14, p: 0.2 },
      { a: 0.1, f: 3, p: 0.7 }, { a: 0.07, f: 5, p: 1.9 }, { a: 0.05, f: 8, p: 0.4 },
    ],
    hills: [{ x: 6, z: 2, r: 46, h: 0.44 }, { x: -40, z: -30, r: 22, h: 0.4 }, { x: 34, z: 44, r: 18, h: 0.34 }],
    grass: 0.5,
    villagers: 2,
    clusters: [
      {
        name: 'Die alte Warte', at: [6, 2], turn: 30, clear: 12,
        items: [S('steinturm', 0, 0), S('mauer', -6.5, -4, 30, 7), S('mauer', 7, 3, -60, 6), S('feuer', 2, 6.5), S('laterne', -3.2, 4.5, 0)],
      },
      {
        name: 'Ruinenfeld', at: [-36, 36], turn: 140, clear: 15,
        items: [S('ruine', 0, 0, 0), S('saeulen', -9, 5, 0), S('ruinenbogen', 4, 11, 20), S('mauer', 9, -6, 70, 8)],
      },
      {
        name: 'Zerfallene Kapelle', at: [44, -34], turn: 250, clear: 12,
        items: [S('ruine', 0, 0, 0), S('saeulen', 8, 6, 45), S('kisten', -6, 5, 0)],
      },
      {
        name: 'Anleger', deg: 130, d: 0.86, clear: 10,
        items: [S('holzhuette', -6, -4, 20), S('kisten', 3.5, 2, 0), S('faesser', -2.5, 4.5, 0), S('laterne', 2, 7, 0), S('steg', 0, 0, 0, 26)],
      },
    ],
    roads: [{ w: 2, pts: [[60, -50], [46, -30], [30, -14], [14, -2]] }],
    scatter: [
      { flora: 'basalt', perHa: 62, zone: [0.72, 1.07], size: [0.8, 1.7], grove: [22, 0.34], space: 2.4 },
      { flora: 'basalt', perHa: 26, zone: [0.12, 0.7], size: [0.7, 1.5], slope: true, grove: [26, 0.45], space: 2.6 },
      { flora: 'basaltblock', perHa: 70, zone: [0.1, 1.05], size: [0.6, 1.6], space: 1.5 },
      { flora: 'windkiefer', perHa: 34, zone: [0.1, 0.84], size: [0.8, 1.3], grove: [28, 0.5], space: 2.4 },
      { flora: 'busch', perHa: 34, zone: [0.05, 0.8], size: [0.6, 1.1], space: 1.3 },
      { flora: 'gras', perHa: 330, zone: [0.02, 0.5], size: [0.7, 1.4], space: 0.3 },
      { flora: 'halme', perHa: 130, zone: [0.05, 0.86], size: [0.8, 1.5], grove: [20, 0.45], space: 0.4 },
      { flora: 'fels', perHa: 26, zone: [0.3, 1.1], size: [0.7, 2.4], space: 2 },
    ],
  },

  // ---------- Fährholm: Hirtenhof mit Steinhäusern, Mauern und Zäunen ----------
  faehrholm: {
    label: 'Hirteninsel',
    coast: [
      { a: 0.03, f: 7, p: 0.3 }, { a: 0.012, f: 13, p: 5.0 },
      { a: 0.1, f: 2, p: 0.4 }, { a: 0.05, f: 3, p: 1.2 },
    ],
    hills: [{ x: -14, z: 12, r: 25, h: 0.15 }],
    grass: 0.86,
    villagers: 3,
    clusters: [
      {
        name: 'Hirtenhof', at: [12, -8], turn: 0, clear: 26,
        items: [
          S('steinhaus', 0, 0, 0), S('scheune', -13, 1, 0), S('steinhaus', 12, -1, -15),
          S('brunnen', 0, 9), S('heu', -9, 8.5), S('faesser', 6, 6.5, 0), S('kisten', -16, 9, 25), S('laterne', 4, 11, 0),
          ...pen('mauer', -2, -14, 16, 10), S('feld', 14, -14, 10, 12),
        ],
      },
      {
        name: 'Fähre', deg: 128, d: 0.88, clear: 9,
        items: [S('kisten', -3, 3, 0), S('fass', 3, 4), S('laterne', 2, 7.5, 0), S('zaun', -7, 0, 0, 6), S('steg', 0, 0, 0, 26)],
      },
    ],
    roads: [{ w: 2.2, pts: [[44, -34], [28, -20], [14, -8]] }],
    scatter: [
      { flora: 'laubbaum', perHa: 38, zone: [0.1, 0.84], size: [0.8, 1.3], grove: [26, 0.5], space: 2.6 },
      { flora: 'birke', perHa: 22, zone: [0.1, 0.88], size: [0.8, 1.2], space: 2.2 },
      { flora: 'busch', perHa: 50, zone: [0.05, 0.88], size: [0.7, 1.3], space: 1.3 },
      { flora: 'gras', perHa: 420, zone: [0.02, 0.78], size: [0.7, 1.4], space: 0.3 },
      { flora: 'halme', perHa: 90, zone: [0.02, 0.9], size: [0.8, 1.3], grove: [18, 0.5], space: 0.4 },
      { flora: 'blume', perHa: 140, zone: [0.03, 0.78], size: [0.8, 1.3], grove: [16, 0.5], space: 0.3 },
      { flora: 'fels', perHa: 16, zone: [0.2, 1.06], size: [0.6, 1.7], space: 2 },
    ],
  },
};
