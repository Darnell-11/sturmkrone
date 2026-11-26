// Phase 4.7D – Daten der filmreifen 7-Szenen-Kino-Inszenierung (Prolog) rund um Kapitän Schwarzbart und „Die Schwarze Krone“ sowie der
// privaten Einführung „Ankerglück“ (Stufe 1 → 3). Rein: keine Szene, kein DOM, kein Zufall ohne Startwert.
//
// Aufbau des Prologs (Ablauf in story/prologueDirector.ts, Welt in world/prologueLive.ts, Musik in audio/prologueScore.ts):
//   1 Grünmarkt   friedlicher Sonnenuntergang, Klavier, Schwarzbart erzählt – Trommeln setzen ein, beschleunigen, dann 1,2 s Stille
//   2 Sturmfront  Vertigo-Anstieg über den Dächern, die sieben leuchtenden Admirals-Silhouetten im Nebel, „… dem Tod geweiht!“
//   3 Vernichtung Raid-Montage: Salven, Elementar-Angriffe, Brände, Landkampf, Grünmarkt wird dem Erdboden gleichgemacht
//   4 Gegenangriff Schwarzbarts Schrei, Sturmfahrt der Schwarzen Krone – spielbar: als Schiffsjunge zur freien Kanone
//   5 Urteil      sieben Auren bündeln den Sieben-Farben-Strahl, er spaltet das Flaggschiff und das Meer bis auf den Grund
//   6 Schwur      Schwarzbart unter Wasser: „Es wird jemand kommen …“, schwarze Willenskraft-Druckwelle, die Admirale weichen zurück
//   7 Erwachen    Ego-Sicht am Strand von Ankerglück, nur Meeresrauschen – dann beginnt die Steuerung
//
// Neue Zeilen, Einstellungen, Lichtstimmungen oder Häuser sind Einträge hier; Zeiten stehen in Sekunden der jeweiligen Szene.
import type { CharacterLook } from './characterParts';
import type { ExpressionId } from './characterRig';
import type { ShipLook } from './ships';

// ---------------------------------------------------------------------------------------------------------------
// Kapitän Schwarzbart und „Die Schwarze Krone“
// ---------------------------------------------------------------------------------------------------------------

export const SCHWARZBART = {
  id: 'schwarzbart',
  name: 'Kapitän Schwarzbart',
  title: 'Herr der Schwarzen Krone',
  /** imposante Statur: 1,65 × eine normale Figur */
  scale: 1.65,
  /** schwerer dunkler Kapitänsmantel, dichter Vollbart, Dreispitz, Narbe – Teile aus dem Baukasten (data/characterParts.ts) */
  look: {
    gender: 'male', body: 'kraeftig', height: 1.1, skin: '#B97E55', face: 'kantig', eyes: 'scharf', eyeColor: '#C77DFF', brows: 'dick', mouth: 'ernst',
    hair: 'lang', hairColor: '#141012', beard: 'vollbart', outfit: 'weste', outfitColor: '#231816', accentColor: '#B8892E', pantsColor: '#16121A',
    shoes: 'stiefel', shoesColor: '#141016', coat: 'kapitaen', coatColor: '#0E0B0C', hat: 'dreispitz', hatColor: '#0A0809', scar: true, earring: true,
    eyepatch: false, scarf: false, gloves: false,
  } as Partial<CharacterLook>,
  /** Körperbau und Haltung des Rigs (data/characterRig.ts): wuchtiger Koloss, breiter Stand */
  build: 'koloss' as const,
  stance: 'breit' as const,
  /** Farbe seiner Willenskraft (schwarze Druckwellen mit purpurnem Kern), Tusche-Mantel und Glühen der Augen */
  aura: '#9B4DFF',
  auraInk: '#07030C',
  eyeGlow: '#D9A8FF',
} as const;

/** Gesichtsausdrücke Schwarzbarts in den Nahaufnahmen (neu in 4.7D: `schrei` und `schwur`, data/characterRig.ts) */
export const SCHWARZBART_FACE: Readonly<Record<'ruhe' | 'blick' | 'schrei' | 'schwur', ExpressionId>> = {
  ruhe: 'grimmig', blick: 'entschlossen', schrei: 'schrei', schwur: 'schwur',
};

/**
 * Das rabenschwarze Flaggschiff: Leviathan (Klasse 7) mit pechschwarzen Segeln, der gekrönten Seeungeheuer-Galionsfigur, verziertem
 * Kronen-Steuerrad und dunklen Eisen- und Goldbeschlägen (`regal: 'krone'`, Modelle aus tools/blender/build_schwarze_krone.py).
 */
export const FLAGSHIP = {
  name: 'Die Schwarze Krone',
  tier: 6,
  look: { hull: '#0B0A0D', stripe: '#B8892E', sail: '#0D0B0D', flag: 'totenkopf', flagColor: '#0A0809', figurehead: 'crowned_kraken', lanterns: true, regal: 'krone' } as ShipLook,
  /** Fahrt der Sturmjagd (m/s): sie jagt den Admirals-Schiffen hinterher, die Figur läuft an Deck mit */
  speed: 8.5,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Die sieben Marine-Admirale und ihre Farbspektren
// ---------------------------------------------------------------------------------------------------------------

export interface AdmiralDef {
  id: string;
  name: string;
  title: string;
  /** Kraft des Admirals in Worten */
  power: string;
  /** Farbspektrum, in dem sein Flaggschiff durch den Nebel leuchtet, und die Farbe dazu (Strahl, Aura, Silhouette) */
  spectrum: string;
  color: string;
  /** Platz in der Schlachtreihe: −3 … 3 (0 = Mitte, der Großadmiral) */
  slot: number;
}

export const ADMIRALS: readonly AdmiralDef[] = [
  { id: 'flammensold', name: 'Admiral Bastian Flammensold', title: 'Der Brandstifter der Krone', power: 'Höllenglut', spectrum: 'Purpurrot', color: '#FF1E3C', slot: -3 },
  { id: 'tiefwasser', name: 'Admiralin Maren Tiefwasser', title: 'Herrin der Strömungen', power: 'Tiefseeflut', spectrum: 'Abgrund-Violett', color: '#7A2CFF', slot: -2 },
  { id: 'sturmwall', name: 'Großadmiral Eisenhart von Sturmwall', title: 'Erster der Sieben', power: 'Donnerurteil', spectrum: 'Sonnengold', color: '#FFC21A', slot: 0 },
  { id: 'frostklinge', name: 'Admiralin Isolde Frostklinge', title: 'Die Eiswand der Nordsee', power: 'Ewiger Frost', spectrum: 'Gletscher-Cyan', color: '#38F2FF', slot: -1 },
  { id: 'windbrecher', name: 'Admiral Konrad Windbrecher', title: 'Der Sturmreiter', power: 'Orkanklinge', spectrum: 'Sturm-Smaragd', color: '#18F08C', slot: 1 },
  { id: 'mondsichel', name: 'Admiralin Selene Mondsichel', title: 'Die Nachtwache', power: 'Mondbann', spectrum: 'Obsidian-Magenta', color: '#FF1FC8', slot: 2 },
  { id: 'sonnenspeer', name: 'Admiral Aurel Sonnenspeer', title: 'Das Licht der Admiralität', power: 'Sonnenlanze', spectrum: 'Strahlendes Weißgold', color: '#FFF1C2', slot: 3 },
];

export const JUDGMENT_NAME = 'Vereintes Admirals-Urteil';

/**
 * Die Flaggschiffe der Admirale als dunkle Schattenhüllen (rabengrauer Rumpf, dunkle Segel, Zierstreifen in der Farbe des Admirals): im Nebel
 * stehen sie als Silhouetten vor ihrem farbigen Lichthof.
 */
export const admiralLook = (a: AdmiralDef): ShipLook => ({ hull: '#171A22', stripe: a.color, sail: '#232833', flag: 'marine', flagColor: '#1F2F4F', figurehead: 'royal_griffin', lanterns: true });

/** Lage der Flotten (m): Silhouetten draußen vor Grünmarkt, Angriffslinie vor dem Hafen, Schlachtreihe vor der Schwarzen Krone */
export const FLEET = {
  /** Szene 2: so weit draußen auf See stehen die Silhouetten (Grünmarkt-Rahmen), Abstand je Platz quer */
  silhouetteZ: 560, silhouetteGap: 74,
  /** Szene 3: Angriffslinie der Admirale und der Marine-Fregatten vor dem Hafen */
  attackZ: 300, attackGap: 58, frigateZ: 165, frigates: 3,
  /** Szenen 4 – 6: Schlachtreihe vor dem Bug der Schwarzen Krone (Abstand voraus, Abstand je Platz quer) */
  aheadZ: 360, aheadGap: 52,
  /** Die Admirals-Flaggschiffe sind riesig: Bühnen-Maßstab ihrer Modelle */
  scale: 1.45,
  /** Klasse der Admirals-Flaggschiffe und der Fregatten */
  admiralTier: 4, frigateTier: 2,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Szenen und Drehbuch
// ---------------------------------------------------------------------------------------------------------------

export type PrologueSceneId = 'gruenmarkt' | 'sturmfront' | 'vernichtung' | 'gegenangriff' | 'urteil' | 'schwur' | 'erwachen';
export const PROLOGUE_SCENE_IDS: readonly PrologueSceneId[] = ['gruenmarkt', 'sturmfront', 'vernichtung', 'gegenangriff', 'urteil', 'schwur', 'erwachen'];

export interface PrologueSceneDef {
  id: PrologueSceneId;
  nr: number;
  title: string;
  /** Dauer (s); bei der spielbaren Szene 4 die Zeitgrenze, nach der es von selbst weitergeht */
  dur: number;
  /** reine Film-Szene: 21:9-Kinobalken stehen (Szene 4 fährt sie zurück, sobald man an Deck läuft) */
  film: boolean;
}

export const PROLOGUE_SCENES: readonly PrologueSceneDef[] = [
  { id: 'gruenmarkt', nr: 1, title: 'Friedlicher Sonnenuntergang in Grünmarkt', dur: 26.0, film: true },
  { id: 'sturmfront', nr: 2, title: 'Die Gewitterfront und die sieben Silhouetten', dur: 10.6, film: true },
  { id: 'vernichtung', nr: 3, title: 'Die Vernichtung von Grünmarkt', dur: 22.0, film: true },
  { id: 'gegenangriff', nr: 4, title: 'Schwarzbarts Gegenangriff im Sturm', dur: 58, film: false },
  { id: 'urteil', nr: 5, title: 'Der Sieben-Farben-Strahl und die Spaltung des Ozeans', dur: 19.0, film: true },
  { id: 'schwur', nr: 6, title: 'Schwarzbarts Schwur', dur: 22.0, film: true },
  { id: 'erwachen', nr: 7, title: 'Erwachen am Strand von Ankerglück', dur: 8.0, film: true },
];

/** Spielbarer Teil von Szene 4: ab hier steuert man die Figur; Ziel erreicht → so lange gefechtsbereit, dann Szene 5 */
export const DECK_PLAY = { from: 9.6, hold: 1.5, reach: 1.7, autoAfter: 45 } as const;

/** Musik-Stücke des Prologs (audio/prologueScore.ts) */
export type ScoreCue = 'hafen' | 'untergang' | 'gegenangriff' | 'engel' | 'schwur' | 'hoffnung';
export const SCORE_CUE_IDS: readonly ScoreCue[] = ['hafen', 'untergang', 'gegenangriff', 'engel', 'schwur', 'hoffnung'];

/** Umgebungsklang je Abschnitt (Wellen, Möwen, Stadt, Wind, Regen …); `stille` = absolute Stille */
export type AmbienceId = 'hafen' | 'stille' | 'sturm' | 'krieg' | 'see' | 'tiefe' | 'strand';
/** Lichtstimmungen (world/environment.ts `grade`) */
export type GradeId = 'gold' | 'sturm' | 'brand' | 'nachtsturm' | 'spektrum' | 'tiefe' | 'hoffnung' | 'aus';

export type BeatKind = 'line' | 'music' | 'amb' | 'shot' | 'grade' | 'fx' | 'bars' | 'time' | 'black';
/**
 * Ein Taktschlag des Drehbuchs: `at` Sekunden nach Szenenbeginn. Je Art:
 *  line  Untertitel `id` (PROLOGUE_LINES)
 *  music Stück `id` mit Ziel-Lautstärke `v` (1 spielen, 0 ausblenden) über `d` Sekunden; `stop` = harter Schnitt aller Stücke
 *  amb   Umgebungsklang `id`
 *  shot  Kamera-Einstellung `id` (SHOTS bzw. eigene Fahrten der Welt), `v` = Nummer (Admirals-Schnitte)
 *  grade Lichtstimmung `id`, Überblendung `d`
 *  fx    Effekt-Takt `id` (Welt), `v` = Nummer
 *  bars  Kinobalken auf `v` in `d` Sekunden
 *  time  Zeitlupe: Zeitmaß `v` in `d` Sekunden
 *  black Schwarzblende auf `v` in `d` Sekunden
 */
export interface Beat { at: number; kind: BeatKind; id: string; v?: number; d?: number }

const b = (at: number, kind: BeatKind, id = '', v?: number, d?: number): Beat => ({ at, kind, id, v, d });

/** Wichtige Zeiten, die Musik und Bild teilen (Sekunden der jeweiligen Szene) */
export const SCORE_SYNC = {
  /** Szene 1: Klavier ab, Trommel-Einsatz (zweiter Satz), Wind dreht (Beschleunigung, Klavier fadet aus), letzter Satz (Crescendo), harter Stopp */
  hafenStart: 0.3, drumsIn: 5.6, windTurn: 15.8, pianoGone: 19.6, crescendo: 20.4, stop: 24.8,
  /** Länge der beklemmenden Stille nach dem Stopp (s) */
  silence: 1.2,
  /** Szene 2: Wörter von „… dem Tod geweiht!“ – genau auf „Tod“ bricht der Endkampf-Soundtrack los */
  todLine: 8.0, todWord: 8.45,
  /** Szene 4: Schrei und Einsatz des Orchesters */
  scream: 3.3, heroIn: 3.7,
  /** Szene 5: Strahl, Engelsgesang */
  beam: 6.0, engel: 8.6,
  /** Szene 6: Aufschrei (Trommeln und Chor), die sieben Schnitte, warmer Engelsgesang */
  oath: 8.0, oathIn: 7.6, reactFrom: 9.6, reactGap: 0.8, hoffnung: 15.0,
} as const;

/** Das Drehbuch: Taktschläge je Szene, nach Zeit sortiert */
export const PROLOGUE_SCRIPT: Readonly<Record<PrologueSceneId, readonly Beat[]>> = {
  gruenmarkt: [
    b(0, 'black', '', 0, 2.2), b(0, 'grade', 'gold', 1, 0), b(0, 'amb', 'hafen'), b(0, 'bars', '', 1, 0), b(0, 'shot', 's1_bucht'),
    b(SCORE_SYNC.hafenStart, 'music', 'hafen', 1, 0),
    b(2.2, 'line', 'leben1'),
    b(5.6, 'line', 'leben2'),
    b(9.2, 'shot', 's1_kai'),
    b(10.6, 'line', 'menschen'),
    b(SCORE_SYNC.windTurn, 'line', 'wind'), b(16.0, 'fx', 'windDreht'),
    b(17.2, 'shot', 's1_daecher'),
    b(SCORE_SYNC.crescendo, 'line', 'haefen'),
    b(SCORE_SYNC.stop, 'music', 'stop', 0, 0), b(SCORE_SYNC.stop, 'amb', 'stille'),
  ],
  sturmfront: [
    b(0, 'shot', 's2_vertigo'), b(0, 'grade', 'sturm', 1, 6.5), b(0, 'amb', 'sturm'), b(0.2, 'fx', 'front'),
    b(1.6, 'fx', 'silhouette', 0), b(2.0, 'fx', 'blitz', 0), b(2.35, 'fx', 'silhouette', 1), b(3.1, 'fx', 'silhouette', 2), b(3.7, 'fx', 'blitz', 1),
    b(3.85, 'fx', 'silhouette', 3), b(4.6, 'fx', 'silhouette', 4), b(5.2, 'fx', 'blitz', 2), b(5.35, 'fx', 'silhouette', 5), b(6.1, 'fx', 'silhouette', 6),
    b(6.9, 'fx', 'blitz', 3),
    b(SCORE_SYNC.todLine, 'line', 'tod'),
    b(SCORE_SYNC.todWord, 'music', 'untergang', 1, 0), b(SCORE_SYNC.todWord, 'fx', 'todBlitz'), b(SCORE_SYNC.todWord, 'shot', 's2_drohung'),
  ],
  vernichtung: [
    b(0, 'shot', 's3_salve'), b(0, 'grade', 'brand', 1, 3), b(0, 'amb', 'krieg'), b(0, 'fx', 'angriff'),
    b(0.4, 'fx', 'salve', 0), b(1.3, 'fx', 'salve', 1), b(2.2, 'fx', 'salve', 2), b(3.1, 'fx', 'salve', 3),
    b(4.6, 'shot', 's3_pier'),
    b(4.9, 'fx', 'element', 0), b(5.55, 'fx', 'element', 1), b(6.2, 'fx', 'element', 2), b(6.85, 'fx', 'element', 3), b(7.5, 'fx', 'element', 4),
    b(8.15, 'fx', 'element', 5), b(8.8, 'fx', 'element', 6),
    b(9.2, 'shot', 's3_strasse'), b(9.3, 'fx', 'brand'), b(9.6, 'fx', 'landkampf'), b(11.6, 'fx', 'einsturz', 0), b(12.6, 'fx', 'salve', 4),
    b(13.8, 'shot', 's3_luft'), b(14.2, 'fx', 'strahlen'), b(15.6, 'fx', 'einsturz', 1), b(16.8, 'fx', 'verwuestung'),
    b(18.6, 'shot', 's3_ruinen'),
    b(19.5, 'music', 'untergang', 0, 2.1),
    b(21.7, 'black', '', 1, 0.05),
  ],
  gegenangriff: [
    b(0, 'black', '', 0, 0), b(0, 'grade', 'nachtsturm', 1, 0), b(0, 'amb', 'see'), b(0, 'fx', 'flaggschiff'), b(0, 'shot', 's4_held'),
    b(3.2, 'shot', 's4_schrei'),
    b(SCORE_SYNC.scream, 'line', 'durchkommen'), b(SCORE_SYNC.scream, 'fx', 'schrei'),
    b(SCORE_SYNC.heroIn, 'music', 'gegenangriff', 1, 0),
    b(5.0, 'shot', 's4_jagd'), b(6.2, 'fx', 'blitz', 0), b(8.1, 'fx', 'blitz', 1),
    b(DECK_PLAY.from, 'bars', '', 0, 0.9), b(DECK_PLAY.from, 'fx', 'kontrolle'),
    b(10.1, 'line', 'kanonen'), b(10.1, 'fx', 'kanonen'),
  ],
  urteil: [
    b(0, 'bars', '', 1, 0.6), b(0, 'shot', 's5_aufladung'), b(0, 'fx', 'aufladung'), b(0, 'grade', 'spektrum', 1, 2.5),
    b(4.0, 'shot', 's5_kern'),
    b(SCORE_SYNC.beam, 'fx', 'strahl'), b(SCORE_SYNC.beam, 'shot', 's5_ritt'),
    b(6.35, 'fx', 'spaltung'),
    b(7.6, 'music', 'gegenangriff', 0, 1.6),
    b(7.8, 'shot', 's5_oben'), b(8.0, 'time', '', 0.32, 0.5),
    b(SCORE_SYNC.engel, 'music', 'engel', 1, 1.2),
    b(9.0, 'fx', 'sturz'),
    b(13.0, 'shot', 's5_fall'),
    b(16.4, 'grade', 'tiefe', 1, 1.2), b(16.4, 'amb', 'tiefe'), b(16.4, 'fx', 'eintauchen'),
    b(17.5, 'time', '', 1, 1.0),
  ],
  schwur: [
    b(0, 'shot', 's6_schwarzbart'), b(0, 'fx', 'wrack'), b(0, 'grade', 'tiefe', 1, 0),
    b(1.2, 'line', 'kommen1'),
    b(4.6, 'line', 'kommen2'),
    b(7.4, 'fx', 'sammeln'),
    b(SCORE_SYNC.oathIn, 'music', 'engel', 0, 0.6), b(SCORE_SYNC.oathIn, 'music', 'schwur', 1, 0),
    b(SCORE_SYNC.oath, 'line', 'aufhalten'), b(SCORE_SYNC.oath, 'fx', 'druckwelle'),
    ...Array.from({ length: 7 }, (_, i) => [
      b(SCORE_SYNC.reactFrom + i * SCORE_SYNC.reactGap, 'shot', 's6_admiral', i),
      b(SCORE_SYNC.reactFrom + i * SCORE_SYNC.reactGap, 'fx', 'zurueck', i),
    ]).flat(),
    b(SCORE_SYNC.hoffnung, 'music', 'hoffnung', 1, 1.5), b(15.2, 'music', 'schwur', 0, 1.6),
    b(15.2, 'shot', 's6_sinken'), b(15.2, 'grade', 'hoffnung', 1, 4), b(15.2, 'fx', 'sinken'),
    // der Engelsgesang verklingt mit der Schwarzblende: am Strand herrscht völlige musikalische Stille
    b(20.2, 'black', '', 1, 1.6), b(20.2, 'music', 'hoffnung', 0, 1.8),
  ],
  erwachen: [
    b(0, 'fx', 'strand'), b(0, 'amb', 'strand'), b(0, 'grade', 'aus', 0, 0), b(0, 'shot', 's7_pov'), b(0, 'black', '', 0, 0.5),
    b(5.0, 'fx', 'aufstehen'), b(5.0, 'shot', 's7_auf'),
    b(6.6, 'bars', '', 0, 0.8),
    b(7.6, 'fx', 'kontrolle'),
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Untertitel (deutsch) – Erzähler-Zeilen ohne Namen, Rufe mit Sprecher
// ---------------------------------------------------------------------------------------------------------------

export interface PrologueLine {
  who: string;
  text: string;
  /** Erzählung (Szene 1, 2, 6): mittig, kursiv, ohne Leiste */
  narr?: boolean;
  /** Ruf in Großbuchstaben: größer, mit Druckwelle im Bild */
  shout?: boolean;
  /** Anzeigedauer (s) */
  hold: number;
  /** Wort für Wort (Sekunden nach Zeilenbeginn): „… dem Tod geweiht!“ */
  words?: readonly (readonly [string, number])[];
}

export const PROLOGUE_LINES: Readonly<Record<string, PrologueLine>> = {
  leben1: { who: SCHWARZBART.name, text: 'Das Leben …', narr: true, hold: 2.6 },
  leben2: { who: SCHWARZBART.name, text: 'Das Leben kann so schön und ruhig sein …', narr: true, hold: 3.9 },
  menschen: { who: SCHWARZBART.name, text: 'So viele Menschen, die wir lieben und kennen …', narr: true, hold: 4.2 },
  wind: { who: SCHWARZBART.name, text: 'Doch wenn der Wind sich dreht …', narr: true, hold: 3.7 },
  haefen: { who: SCHWARZBART.name, text: '… sind auch die sichersten und ruhigsten Häfen …', narr: true, hold: 4.6 },
  tod: { who: SCHWARZBART.name, text: '… dem Tod geweiht!', narr: true, hold: 2.5, words: [['… dem', 0], ['Tod', 0.45], ['geweiht!', 0.8]] },
  durchkommen: { who: SCHWARZBART.name, text: 'WIR LASSEN SIE NICHT DAMIT DURCHKOMMEN!', shout: true, hold: 3.0 },
  kanonen: { who: SCHWARZBART.name, text: 'AN DIE KANONEN!', shout: true, hold: 2.4 },
  bereit: { who: 'Geschützmeister Krall', text: 'Gut so, Junge! Lunte bereit – und lass sie kommen!', hold: 2.6 },
  hinweis: { who: 'Geschützmeister Krall', text: 'Junge! Deine Kanone – Backbord, mittschiffs! Lauf!', hold: 3.2 },
  kommen1: { who: SCHWARZBART.name, text: 'Es wird jemand kommen …', narr: true, hold: 3.0 },
  kommen2: { who: SCHWARZBART.name, text: '… jemand kommen …', narr: true, hold: 2.4 },
  aufhalten: { who: SCHWARZBART.name, text: 'ES WIRD JEMAND KOMMEN, DER EUCH AUFHÄLT!', shout: true, hold: 3.6 },
};

/** Ziel-Hinweis der spielbaren Deck-Szene */
export const DECK_OBJECTIVE = 'Lauf zu deiner Kanone (Backbord, mittschiffs) und mach dich gefechtsbereit!';
export const DECK_HINT_AFTER = 14;

// ---------------------------------------------------------------------------------------------------------------
// Licht-Dramaturgie (world/environment.ts `grade`): goldene Abendstunde → eiskaltes Gewitterblau → Spektrum → Unterwasser-Licht
// ---------------------------------------------------------------------------------------------------------------

export interface GradeDef {
  /** Uhrzeit (Sonnenstand); null = unverändert */
  time: number | null;
  horizon: string; zenith: string; fog: string;
  /** Licht der Sonne (Farbe, Anteil der Stärke) und des Himmels */
  light: string; lightK: number;
  amb: string; ambK: number;
  /** Meer: Tönung und Anteil */
  sea: string; seaK: number;
  /** Nebel: Sichtweite (m, 0 = unverändert) und Form (0 Dunst … 1 dichter Nebel, −1 = unverändert) */
  fogFar: number; fogShape: number;
  exposure: number;
  /** Anteil der Stimmung über dem errechneten Licht (0 … 1) */
  k: number;
}

export const GRADES: Readonly<Record<GradeId, GradeDef>> = {
  // warmer, goldener Sonnenuntergang kurz vor der Dämmerung
  gold: { time: 18.45, horizon: '#FFB065', zenith: '#5875AE', fog: '#F4A86A', light: '#FFC07A', lightK: 1.12, amb: '#FFD9B0', ambK: 1.05, sea: '#2C5E7A', seaK: 0.25, fogFar: 1700, fogShape: 0, exposure: 1.06, k: 0.42 },
  // eiskaltes Gewitterblau: die schwarze Front verschluckt das Abendrot
  sturm: { time: null, horizon: '#2A3B58', zenith: '#0B1322', fog: '#22314A', light: '#8EB6FF', lightK: 0.55, amb: '#5A78B0', ambK: 0.8, sea: '#0E2236', seaK: 0.6, fogFar: 950, fogShape: 0.35, exposure: 0.98, k: 0.85 },
  // Brand: Gewitter, darunter der rote Widerschein der brennenden Stadt
  brand: { time: null, horizon: '#5C2A1E', zenith: '#140C10', fog: '#3A2220', light: '#FF8A4A', lightK: 0.72, amb: '#C0603A', ambK: 0.9, sea: '#2A1612', seaK: 0.45, fogFar: 900, fogShape: 0.3, exposure: 1.0, k: 0.82 },
  // Nacht-Sturm auf hoher See (Szene 4): tiefes Blauschwarz, Blitze tragen das Licht
  nachtsturm: { time: 23.2, horizon: '#1E2A40', zenith: '#070B14', fog: '#18233A', light: '#9EC2FF', lightK: 0.8, amb: '#40588C', ambK: 1.1, sea: '#0A1828', seaK: 0.55, fogFar: 760, fogShape: 0.4, exposure: 1.05, k: 0.75 },
  // Sieben-Farben-Spektrum (Szene 5): die Farbe wandert mit der Aufladung durch alle sieben Admirale (die Welt dreht `light` weiter)
  spektrum: { time: null, horizon: '#3A2A58', zenith: '#0A0A1A', fog: '#2A2440', light: '#FFFFFF', lightK: 1.4, amb: '#8A70C0', ambK: 1.2, sea: '#141030', seaK: 0.5, fogFar: 900, fogShape: 0.3, exposure: 1.08, k: 0.85 },
  // Unterwasser: dichtes Tiefblau, Licht fällt in Strahlen von oben
  tiefe: { time: null, horizon: '#0E4A66', zenith: '#03131E', fog: '#0B3A52', light: '#7FD8FF', lightK: 0.42, amb: '#2A7A9A', ambK: 1.1, sea: '#06283A', seaK: 0.8, fogFar: 62, fogShape: 1, exposure: 1.12, k: 1 },
  // Hoffnung: wärmeres, helleres Blaugrün, das Licht von oben wird golden
  hoffnung: { time: null, horizon: '#3A8A9A', zenith: '#0A2A3A', fog: '#2A6A7A', light: '#FFE2A8', lightK: 0.7, amb: '#6AB0B8', ambK: 1.25, sea: '#1A4A5A', seaK: 0.8, fogFar: 80, fogShape: 1, exposure: 1.2, k: 1 },
  aus: { time: null, horizon: '#000000', zenith: '#000000', fog: '#000000', light: '#FFFFFF', lightK: 1, amb: '#FFFFFF', ambK: 1, sea: '#000000', seaK: 0, fogFar: 0, fogShape: -1, exposure: 1, k: 0 },
};

/** Wetter je Abschnitt (gehaltene Werte über `Weather.hold`) */
export const PROLOGUE_WEATHER = {
  /** Szene 1: klarer Abend mit ein paar goldenen Wolken, ruhige See */
  klar: { clouds: 0.32, cloudDark: 0.1, visibility: 1, grey: 0, rain: 0, waves: 0.55, wind: 0.18, lightning: 0, light: 1 },
  /** Szene 2 – 3: die Front zieht auf (ohne zufällige Blitze – die Regie setzt sie) */
  front: { clouds: 1, cloudDark: 0.92, visibility: 0.62, grey: 0.72, rain: 0.25, waves: 0.85, wind: 0.75, lightning: 0, light: 0.42 },
  /** Szenen 4 – 5: Sturm auf hoher See: peitschender Regen, haushohe Wellen */
  sturm: { clouds: 1, cloudDark: 0.95, visibility: 0.5, grey: 0.86, rain: 1, waves: 3.1, wind: 1, lightning: 8, light: 0.32 },
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Kamera-Einstellungen: Catmull-Rom-Pfade in einem Bühnen-Rahmen (x quer – wie Schiffsraum: + Backbord/links –, y oben, z vorn)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Rahmen einer Einstellung:
 *  stadt      Hafen von Grünmarkt (Ursprung an der Kaimauer, z zeigt aufs Meer)
 *  schiff     Schwarze Krone (Mitte auf Wasserhöhe, z zum Bug)
 *  kapitaen   Schwarzbart auf dem Achterdeck (Fußpunkt, z wie das Schiff)
 *  kern       Bündelung der sieben Auren (z zeigt zur Schwarzen Krone)
 *  tiefe      Schwarzbart unter Wasser (z zur Kamera)
 *  figur      die Spielfigur (z wie das Schiff)
 *  kopf       Schwarzbarts Kopf (Kopf-Knochen, geglättet; z wie das Schiff) – Nahaufnahmen folgen dem Gesicht auch in Brüll- und Beugeposen
 */
export type ShotFrame = 'stadt' | 'schiff' | 'kapitaen' | 'kern' | 'tiefe' | 'figur' | 'kopf';
export type V3 = readonly [number, number, number];
export type ShotEase = 'linear' | 'ease' | 'out' | 'in';

export interface ShotDef {
  frame: ShotFrame;
  /** Dauer der Fahrt (s) – danach hält die Kamera am Ende */
  dur: number;
  path: readonly V3[];
  look: readonly V3[];
  /** Sichtfeld am Anfang und am Ende (Grad) */
  fov: readonly [number, number];
  ease: ShotEase;
  /** Vertigo (Dolly-Zoom): das Sichtfeld folgt dem Abstand zu diesem Punkt, das Motiv bleibt gleich groß, der Hintergrund wächst */
  dolly?: V3;
  /** Kamerazittern (0 … 1) */
  shake?: number;
}

/** Feste Fahrten; eigene Fahrten der Welt (Strahl-Ritt, Admirals-Schnitte, Fall, Ego-Sicht) stehen in `DYNAMIC_SHOTS` */
export const SHOTS: Readonly<Record<string, ShotDef>> = {
  // ---- 1: tief übers Wasser in den Hafen, an der Kaimauer entlang, langsam hinauf zu den Dächern
  s1_bucht: { frame: 'stadt', dur: 9.2, path: [[46, 4.5, 100], [22, 3.4, 62], [6, 3.2, 36], [-8, 4.2, 18]], look: [[0, 2.5, 0], [-4, 3.5, -10], [-10, 4, -22]], fov: [46, 41], ease: 'ease' },
  s1_kai: { frame: 'stadt', dur: 8.0, path: [[36, 2.9, 9], [10, 2.5, 6.5], [-18, 2.8, 7], [-32, 3.2, 9]], look: [[22, 2.2, -6], [-2, 2.3, -8], [-26, 2.6, -6], [-42, 3, -4]], fov: [40, 38], ease: 'linear' },
  s1_daecher: { frame: 'stadt', dur: 8.8, path: [[-6, 3.2, -14], [-5, 8.5, -20], [-3, 13.5, -26], [-2, 15, -28]], look: [[-2, 4, 12], [0, 6, 70], [0, 8, 140]], fov: [48, 50], ease: 'out' },
  // ---- 2: Vertigo-Anstieg – die Kamera steigt und fährt zurück, das Sichtfeld wird eng: die Dächer bleiben, die Front wächst
  s2_vertigo: { frame: 'stadt', dur: 8.45, path: [[-2, 12.5, -26], [-1.5, 13.8, -40], [-0.5, 15.6, -58], [0, 17, -74]], look: [[0, 9, 220], [0, 13, 420], [0, 17, 620]], fov: [52, 20], ease: 'ease', dolly: [0, 9, -12] },
  s2_drohung: { frame: 'stadt', dur: 2.2, path: [[0, 17, -74], [0, 20, -10], [0, 24, 40]], look: [[0, 17, 620], [0, 30, 600]], fov: [21, 30], ease: 'in', shake: 0.6 },
  // ---- 3: Raid-Montage
  s3_salve: { frame: 'stadt', dur: 4.6, path: [[170, 34, 340], [130, 26, 318], [92, 22, 300]], look: [[0, 6, -10], [-6, 6, -16]], fov: [50, 48], ease: 'linear' },
  s3_pier: { frame: 'stadt', dur: 4.6, path: [[-48, 2.6, 27], [-22, 2.7, 23], [6, 2.9, 21], [32, 3.1, 20]], look: [[-34, 1.6, 2], [-6, 2.2, -4], [20, 2.6, -6], [44, 3, -8]], fov: [55, 52], ease: 'linear', shake: 0.25 },
  s3_strasse: { frame: 'stadt', dur: 4.6, path: [[-48, 3.7, -20], [-24, 3.7, -20.5], [0, 3.9, -20], [20, 4, -20.5]], look: [[-30, 4.6, -21], [-4, 5, -21], [20, 5.4, -20], [42, 5.4, -21]], fov: [58, 56], ease: 'linear', shake: 0.3 },
  s3_luft: { frame: 'stadt', dur: 4.8, path: [[-96, 72, 40], [-40, 80, 82], [30, 84, 86], [88, 78, 44]], look: [[0, 6, -26], [0, 6, -30]], fov: [52, 50], ease: 'linear' },
  s3_ruinen: { frame: 'stadt', dur: 3.4, path: [[0, 20, 24], [0, 28, 52], [0, 34, 74]], look: [[0, 5, -28], [0, 4, -30]], fov: [44, 46], ease: 'out' },
  // ---- 4: Heldenfahrt auf Schwarzbart, Schrei in Nahaufnahme, Sturmjagd
  s4_held: { frame: 'kapitaen', dur: 3.2, path: [[-5.5, 0.6, 12], [-3.2, 1.6, 7.6], [-1.1, 2.4, 4.8]], look: [[0, 2.4, 0], [0, 2.8, 0], [0, 3.0, 0]], fov: [42, 34], ease: 'ease' },
  // Nahaufnahme am Gesicht (Rahmen = Kopf-Knochen am Halsansatz, die Augen liegen ≈ 0,13 m darüber und 0,2 m davor): leicht von unten,
  // Augen über der Bildmitte, der Mund über dem Untertitel
  s4_schrei: { frame: 'kopf', dur: 1.8, path: [[-0.45, -0.09, 2.6], [-0.3, -0.05, 2.05]], look: [[0, 0.03, 0.2], [0, 0.03, 0.2]], fov: [30, 23], ease: 'out', shake: 0.7 },
  s4_jagd: { frame: 'schiff', dur: 4.6, path: [[46, 16, -86], [34, 22, -64], [22, 27, -46]], look: [[0, 8, 10], [0, 10, 80], [0, 14, 220]], fov: [56, 58], ease: 'linear', shake: 0.25 },
  // ---- 5: Aufladung, Kern (Dolly-Zoom), Vogelperspektive, Fall
  s5_aufladung: { frame: 'schiff', dur: 4.0, path: [[2, 16, 40], [1, 18, 50], [0, 20, 58]], look: [[0, 24, 360], [0, 26, 370]], fov: [58, 50], ease: 'ease' },
  s5_kern: { frame: 'kern', dur: 2.0, path: [[4, 3, 90], [2.5, 2, 52], [1.4, 1.2, 30]], look: [[0, 0, 0], [0, 0, 0]], fov: [36, 18], ease: 'in', shake: 0.45 },
  s5_oben: { frame: 'schiff', dur: 5.2, path: [[10, 150, -46], [6, 128, -40]], look: [[0, -6, -6], [0, -8, -8]], fov: [50, 46], ease: 'linear' },
  // ---- 6: Schwarzbart unter Wasser, Sinken ins Licht
  s6_schwarzbart: { frame: 'tiefe', dur: 9.6, path: [[0.7, 2.3, 6.2], [0.5, 2.5, 4.6], [0.35, 2.7, 3.5]], look: [[0, 2.6, 0], [0, 2.75, 0]], fov: [36, 30], ease: 'out' },
};

/** Einstellungen, die die Welt selbst führt (Strahl-Ritt, Admirals-Schnitte, Fall ins Wasser, Sinken, Ego-Sicht am Strand) */
export const DYNAMIC_SHOTS = ['s5_ritt', 's5_fall', 's6_admiral', 's6_sinken', 's7_pov', 's7_auf'] as const;
export type DynamicShot = (typeof DYNAMIC_SHOTS)[number];

/** Strahl-Ritt (Szene 5): Kopf des Strahls in m/s, Abstand der Kamera hinter dem Kopf und darüber */
export const BEAM_RIDE = { speed: 210, behind: 11, above: 2.2, start: -14, through: 1.8, half: 18, depth: 38, open: 0.75 } as const;

/** Ego-Sicht am Strand: Lider (Zeit s → 0 offen … 1 geschlossen) und Unschärfe (px) */
export const EYELIDS: readonly (readonly [number, number])[] = [
  [0, 1], [0.7, 1], [1.5, 0.4], [2.0, 0.45], [2.25, 1], [2.6, 1], [3.3, 0.12], [4.05, 0.06], [4.2, 0.92], [4.42, 0.05], [5.1, 0],
];
export const EYE_BLUR: readonly (readonly [number, number])[] = [[0, 9], [1.5, 7], [3.3, 3.5], [4.6, 1], [5.4, 0]];

// ---------------------------------------------------------------------------------------------------------------
// Grünmarkt: die Bühnen-Hafenstadt (nur im Prolog; im Spiel existiert sie nicht mehr)
// ---------------------------------------------------------------------------------------------------------------

export type GmHouse = 'fachwerkhaus' | 'steinhaus' | 'gasthaus' | 'lagerhaus' | 'holzhuette' | 'kapelle' | 'leuchtturm' | 'kran' | 'marktstand';
export type GmProp = 'laterne' | 'kisten' | 'faesser' | 'fass' | 'netz' | 'brunnen';
export type GmClip = 'Fishing_Idle' | 'Working_A' | 'Hammering' | 'Walking_A' | 'Sit_Floor_Idle' | 'Waving' | 'Holding_B' | 'Idle_A' | 'Sawing';

export const GRUENMARKT = {
  name: 'Grünmarkt',
  /** Küstenradius (m) der Bühnen-Insel; die Mitte liegt landeinwärts der Kaimauer */
  r: 96,
  /** Höhe der Uferterrasse und des Hügels (m) */
  plateau: 1.7, hill: 11,
  /** Häuser: Art, Lage im Stadt-Rahmen (x quer, z: negativ landeinwärts), Blickrichtung (rad, 0 = zum Meer) */
  houses: [
    ['fachwerkhaus', -38, -12, 0.12], ['gasthaus', -20, -11, 0], ['fachwerkhaus', -2, -12, -0.05], ['lagerhaus', 18, -11, 0], ['fachwerkhaus', 38, -13, -0.14],
    ['steinhaus', -50, -27, 0.28], ['fachwerkhaus', -30, -29, 0.1], ['fachwerkhaus', -10, -30, 0], ['steinhaus', 10, -30, -0.05], ['fachwerkhaus', 30, -29, -0.12],
    ['holzhuette', 50, -28, -0.3], ['fachwerkhaus', -25, -44, 0.08], ['kapelle', -14, -60, 0.15], ['fachwerkhaus', 24, -46, -0.1], ['steinhaus', -42, -44, 0.3],
    ['leuchtturm', 62, -2, -0.6], ['kran', 6, -3, 0], ['marktstand', -12, -3.5, 0], ['marktstand', 28, -4, 0.1],
  ] as readonly (readonly [GmHouse, number, number, number])[],
  /** Kleinkram an der Kaimauer */
  props: [
    ['laterne', -44, -2.6], ['laterne', -26, -2.6], ['laterne', -8, -2.6], ['laterne', 12, -2.6], ['laterne', 32, -2.6], ['laterne', 48, -2.6],
    ['laterne', -30, -23.5], ['laterne', -10, -23.5], ['laterne', 10, -23.5],
    ['kisten', -16, -6], ['faesser', 22, -6.5], ['fass', -34, -5.5], ['netz', 40, -5], ['kisten', 2, -6.2], ['brunnen', -4, -40],
  ] as readonly (readonly [GmProp, number, number])[],
  /** Stege ins Hafenbecken: x und Länge */
  piers: [[-30, 26], [2, 30], [34, 24]] as readonly (readonly [number, number])[],
  /** Boote: Lage (x, z), Blickrichtung */
  boats: [[-36, 14, 0.3], [-24, 22, -0.4], [-4, 18, 0.9], [8, 30, -0.2], [28, 16, 0.6], [40, 26, -0.7], [18, 44, 1.2]] as readonly (readonly [number, number, number])[],
  /** Bewohner: Clip, Lage, Blickrichtung (rad, 0 = zum Meer); `walk` = Strecke entlang x (m), die er auf und ab geht */
  folk: [
    ['Fishing_Idle', 2.6, 22, 0], ['Fishing_Idle', -30.8, 18, 0.4], ['Sit_Floor_Idle', 34.8, 16, 0.2], ['Working_A', -16, -4.8, Math.PI],
    ['Hammering', 6, -4.6, 2.6], ['Walking_A', -20, -1.4, Math.PI / 2, 26], ['Waving', 28, 2.4, 0.6], ['Holding_B', 20, -1.2, -Math.PI / 2, 18],
    ['Idle_A', -38, -1.8, 0.4], ['Sawing', 40, -3.4, 2.2],
  ] as readonly (readonly [GmClip, number, number, number, number?])[],
  /** Dächer und Giebel, die in Szene 3 brennen (Index in `houses`), und welche einstürzen */
  burn: [0, 1, 2, 3, 4, 6, 7, 9, 11, 13, 17, 18],
  collapse: [[2, 7], [1, 11]] as readonly (readonly [number, number])[],
} as const;

/** Truppen der Landkämpfe in Szene 3 (instanzierte Soldaten): Marine gegen die Bürgerwehr von Grünmarkt */
export const RAID_TROOPS = {
  marine: { id: 'admiralitaet', cloth: '#ECE6DA', pants: '#1F2F4F', hat: '#18223C', trim: '#C9A64A' },
  wehr: { id: 'gruenmarkt', cloth: '#4E6B3A', pants: '#5A4630', hat: '#3A2A1E', trim: '#C8A46A' },
  /** Schwarzbarts Piraten-Crew (Szene 4 – 5): schwarz und blutrot */
  crew: { id: 'schwarzkrone', cloth: '#1E1719', pants: '#2C2328', hat: '#0E0B0C', trim: '#9A231C' },
} as const;

/** Crew an Deck (Szene 4): Geschützmannschaften je Kanone, Läufer, Takler – keine eigenen Truppen der Spielfigur */
export const DECK_CREW = {
  /** Köpfe je Geschütz (Hauptdeck) */
  perGun: 2,
  /** Läufer, die beim „An die Kanonen!“ von der Mitte zu den Geschützen rennen (Anteil) */
  runners: 0.5,
  /** Matrosen in der Takelage und am Achterdeck */
  extra: 10,
  /** Die freie Kanone des Schiffsjungen: Backbord, mittschiffs (Anteil der Länge, + Bug) */
  freeGunAt: -0.04,
  /** Start der Figur: Hauptdeck vorn (Anteil der Länge), Steuerbord-Seite (Anteil der halben Breite) */
  startAt: 0.2, startSide: -0.4,
} as const;

/** Keine brennenden Decks, keine Marine-Soldaten an Bord, keine eigenen Truppen: die Grundregeln des Prologs (geprüft) */
export const PROLOGUE_RULES = { shipFire: false, marinesOnDeck: 0, ownTroops: 0, playerClothes: 'leinen' } as const;

// ---------------------------------------------------------------------------------------------------------------
// Die Einführung „Ankerglück“ (private Instanz, Stufe 1 → 3)
// ---------------------------------------------------------------------------------------------------------------

/** Kleidung des Schiffsjungen und des Gestrandeten: schlichtes Leinenhemd, Leinenhose, einfache Schuhe – Gesicht, Haar und Statur bleiben */
export function linenLook<T extends Partial<CharacterLook>>(look: T): T {
  return {
    ...look, outfit: 'hemd', outfitColor: '#E6DBC2', accentColor: '#B5A27E', pantsColor: '#C9BB98', shoes: 'schuhe', shoesColor: '#5A3A22',
    coat: 'keiner', hat: 'keiner', glasses: 'keine', scarf: false, gloves: false, eyepatch: false, hairModel: '', extra: [],
  };
}

/** Die neuen Bewohner von Ankerglück für die Einführung (relativ zur Inselmitte wie TOWN_NPCS); Hafenmeisterin Ilse kennt man schon */
export const TUTORIAL_NPC_IDS = { pier: 'hinnerk', smith: 'bodo', master: 'konrad', harbor: 'ilse', mayor: 'gerstenkorn' } as const;

/** Startpunkt am Strand (relativ zur Inselmitte von Ankerglück): freier Sand südwestlich des Piers, Blick zum Pier und zu Hinnerk */
export const BEACH_START = { x: -54, z: -64, yaw: 1.47 };

/** Die Einführungs-Aufträge der Reihe nach (IDs in data/quests.ts) */
export const TUTORIAL_QUESTS = ['t1', 't2', 't3', 't4', 't5'] as const;
export type TutorialQuestId = (typeof TUTORIAL_QUESTS)[number];

/** Handlungen, die ein Einführungs-Schritt verlangt (QuestStep `act`, QuestEvent `act`) */
export type TutorialAct =
  | 'forge' | 'combo' | 'dash' | 'target' | 'level2' | 'talent' | 'ship' | 'hire' | 'helm' | 'scout' | 'crystal' | 'faji' | 'art' | 'raid';
export const TUTORIAL_ACTS: readonly TutorialAct[] = ['forge', 'combo', 'dash', 'target', 'level2', 'talent', 'ship', 'hire', 'helm', 'scout', 'crystal', 'faji', 'art', 'raid'];

/** Zahlen der Einführung */
export const TUTORIAL = {
  /** Schlagkette beim Waffenmeister: so viele Treffer an der Übungspuppe bzw. an Gegnern */
  comboHits: 5,
  /** Stufen, auf die Waffenmeister und Faji-Kristall heben */
  level2: 2, level3: 3,
  /** Spähboot: so weit vor dem Hafen (m) und auf welcher Stufe */
  scoutDist: 260, scoutLevel: 1,
  /** Kurogane-Stoßtrupp im Hafen: Gegnerarten und Stufe */
  raid: ['matrose', 'matrose', 'schlaeger', 'matrose'] as readonly ('matrose' | 'schlaeger' | 'musketier')[],
  raidLevel: 2,
  /** Nachzügler, falls der Trupp fällt, bevor man die neue Faji-Kunst eingesetzt hat */
  raidExtra: ['matrose', 'matrose'] as readonly ('matrose' | 'schlaeger' | 'musketier')[],
  /** Wartezeit (s), bis ein verschwundenes Spähboot neu ausläuft */
  scoutRespawn: 5,
  /** Erste Start-Crew: die Navigatorin heuert man über die Hafenmeisterin an (ohne Handgeld), dazu vier Deckmatrosen aus dem Hafen */
  starterCrew: 'nav',
  starterHands: 4,
  /** Leine der privaten Instanz: so weit (m) darf das Schiff vor der Einführung von Ankerglück weg */
  leash: 900,
  /** Gold am Ende der Einführung (der Bürgermeister zahlt den Dank) */
  thanksGold: 150,
  /** 4.7D: Bodos Schmiedestück (s): Hammerschläge mit Funkenflug, dann die fertige Ausrüstung */
  forgeTime: 3.4, forgeBlows: 5,
  /** 4.7D: Kurogane-Überfall: ein Kriegsschiff beschießt den Hafen, bevor der Trupp landet (s Vorlauf, Salven) */
  raidShipLead: 4.5, raidSalvos: 4,
} as const;

/** Lehrtafel der Einführung, sobald man das erste Mal am Steuer der Schaluppe steht (Tasten der Standardbelegung) – alle Schiffsanzeigen */
export const SHIP_COACH: readonly { title: string; text: string }[] = [
  { title: 'Segel', text: 'W setzt mehr Segel, S refft sie, A und D legen das Ruder. Mit dem Wind im Rücken bist du am schnellsten – der Pfeil am Kompass zeigt, woher er weht.' },
  { title: 'Kompass & Karte', text: 'Oben zeigt der Kompass deinen Kurs und den Pfeil zum nächsten Auftrag. M öffnet die Seekarte mit allen Inseln, die du schon entdeckt hast.' },
  { title: 'Rumpf', text: 'Die Leiste „Rumpf“ zeigt, was deine Schaluppe noch aushält. Fällt sie auf null, sinkt das Schiff. Im Hafen machen die Zimmerleute es wieder heil.' },
  { title: 'Segeltuch', text: 'Die Leiste „Segel“ zeigt zerrissenes Tuch: Kettenkugeln des Gegners zerfetzen es und machen dich langsam. Mit G flicken deine Leute die Segel.' },
  { title: 'Breitseiten', text: 'Kanonen feuern zur Seite: Q nach Backbord (links), E nach Steuerbord (rechts). Halte den Gegner seitlich im Zielbogen, dann trifft die Salve. Der Bogen zeigt, ob nachgeladen ist.' },
  { title: 'Crew & Moral', text: 'Die Crew-Anzeige zeigt deine Leute an Bord. Gute Moral (Sold und Siege) lädt schneller nach und segelt besser – die Navigatorin hält dich zudem auf Kurs.' },
];

/**
 * 4.7D – Lehrtafel des Waffenmeisters Konrad (klassenbezogen): die eigene Kombo aus 4.7C, der Sturm-Schritt, die Zielerfassung und der erste
 * Punkt im Sternbild-Klassenbaum. `combo` = Namen der Leicht-Kette der eigenen Klasse.
 */
export function combatCoach(classLabel: string, combo: readonly string[], ranged: boolean): { title: string; text: string }[] {
  const chain = combo.length ? combo.join(' → ') : 'Leicht-Kette';
  return [
    { title: `Deine Kombo · ${classLabel}`, text: `Linksklick (oder J) im Takt: ${chain}. Der letzte Schlag ist dein Finisher – fünf Treffer an der Übungspuppe genügen.${ranged ? ' Als Faji-Wirker hältst du dabei Abstand.' : ''}` },
    { title: 'Sturm-Schritt', text: 'Umschalt (oder die Ausweich-Taste) lässt dich blitzschnell durch Angriffe gleiten – im richtigen Moment ist er ein perfektes Ausweichen.' },
    { title: 'Ziel erfassen', text: 'Tab wählt das nächste Ziel, ein Mausklick (oder Tipp) auf einen Gegner erfasst ihn direkt. Das Ziel-Fenster oben zeigt Leben und Haltung.' },
    { title: 'Sternbild-Klassenbaum', text: 'Mit Stufe 2 bekommst du deinen ersten Talentpunkt: N öffnet deinen Klassenbaum. Der goldene Knoten ist dein nächster Schritt.' },
  ];
}

/** Wer in der geteilten Welt sichtbar wird (bis zum Netz in Phase 4.8 lokale Stellvertreter, siehe world/sharedPresence.ts) */
export const SHARED_PRESENCE = {
  /** Mitspieler zu Fuß in Ankerglück und Schiffe vor dem Hafen */
  townCaptains: 5,
  seaShips: 2,
  /** Namen der Kapitäne (deutsch, Sturmkrone-Universum) */
  names: ['Kapitänin Ragna Sturmhut', 'Kapitän Jorin Ankerfaust', 'Kapitänin Lene Salzwind', 'Kapitän Tjark Nebelsegel', 'Kapitänin Ylva Goldbug', 'Kapitän Bent Teerhand', 'Kapitänin Smilla Wellenbrand'],
} as const;
