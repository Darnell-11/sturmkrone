// Phase 4.7A – Daten des Gewitter-Prologs auf Kapitän Schwarzbarts Flaggschiff „Schwarze Krone“, der privaten Einführung „Ankerglück“
// (Stufe 1 → 3) und des Übergangs in die geteilte Welt. Rein: keine Szene, kein DOM, kein Zufall ohne Startwert. Neue Zeilen, Admirale,
// Gefahren oder Einführungs-Schritte sind Einträge hier – der Ablauf steht in story/prologueDirector.ts und story/tutorialInstance.ts.
import type { CharacterLook } from './characterParts';
import type { ShipLook } from './ships';

// ---------------------------------------------------------------------------------------------------------------
// Kapitän Schwarzbart und sein Flaggschiff
// ---------------------------------------------------------------------------------------------------------------

export const SCHWARZBART = {
  id: 'schwarzbart',
  name: 'Kapitän Schwarzbart',
  title: 'Herr der Schwarzen Flagge',
  /** imposante Statur: 1,65 × eine normale Figur */
  scale: 1.65,
  /** dunkler Kapitänsmantel, Vollbart, Dreispitz, Narbe – Teile aus dem Baukasten (data/characterParts.ts) */
  look: {
    gender: 'male', body: 'kraeftig', height: 1.08, skin: '#C68A5E', face: 'kantig', eyes: 'scharf', eyeColor: '#B8343A', brows: 'dick', mouth: 'ernst',
    hair: 'lang', hairColor: '#1E1A18', beard: 'vollbart', outfit: 'weste', outfitColor: '#2A1E1A', accentColor: '#8A1F1A', pantsColor: '#1E1A20',
    shoes: 'stiefel', shoesColor: '#1E1A20', coat: 'kapitaen', coatColor: '#14100E', hat: 'dreispitz', hatColor: '#0E0C0C', scar: true, earring: true,
    eyepatch: false, scarf: false, gloves: false,
  } as Partial<CharacterLook>,
  /** Farbe seiner Faji-Kraft (dunkle Schockwellen mit purpurnem Kern) und des Tusche-Mantels */
  aura: '#B23BFF',
  auraInk: '#0A0410',
} as const;

/** Das brennende schwarze Flaggschiff: Leviathan (Klasse 7), schwarzer Rumpf, blutrote Zier, schwarze Segel mit Totenkopf */
export const FLAGSHIP = {
  name: 'Schwarze Krone',
  tier: 6,
  look: { hull: '#16110E', stripe: '#7A1F1A', sail: '#2A2524', flag: 'totenkopf', flagColor: '#0E0C0C', figurehead: 'drache', lanterns: true } as ShipLook,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Die sieben Marine-Admirale
// ---------------------------------------------------------------------------------------------------------------

export interface AdmiralDef {
  id: string;
  name: string;
  title: string;
  /** Kraft des Admirals in Worten und ihre Farbe (Strahl des Vereinten Urteils) */
  power: string;
  color: string;
  /** Platz im Halbkreis vor dem Flaggschiff: Winkel zur Bugrichtung (rad, + links) und Abstand (m) */
  angle: number;
  dist: number;
}

export const ADMIRALS: readonly AdmiralDef[] = [
  { id: 'sturmwall', name: 'Großadmiral Eisenhart von Sturmwall', title: 'Erster der Sieben', power: 'Donnerurteil', color: '#FFD34A', angle: 0, dist: 250 },
  { id: 'frostklinge', name: 'Admiralin Isolde Frostklinge', title: 'Die Eiswand der Nordsee', power: 'Ewiger Frost', color: '#9EE7FF', angle: 0.34, dist: 240 },
  { id: 'flammensold', name: 'Admiral Bastian Flammensold', title: 'Der Brandstifter der Krone', power: 'Höllenglut', color: '#FF6A2A', angle: -0.34, dist: 240 },
  { id: 'tiefwasser', name: 'Admiralin Maren Tiefwasser', title: 'Herrin der Strömungen', power: 'Tiefseeflut', color: '#3AA8FF', angle: 0.68, dist: 225 },
  { id: 'windbrecher', name: 'Admiral Konrad Windbrecher', title: 'Der Sturmreiter', power: 'Orkanklinge', color: '#6CF0B4', angle: -0.68, dist: 225 },
  { id: 'mondsichel', name: 'Admiralin Selene Mondsichel', title: 'Die Nachtwache', power: 'Mondbann', color: '#C8A8FF', angle: 1.0, dist: 210 },
  { id: 'sonnenspeer', name: 'Admiral Aurel Sonnenspeer', title: 'Das Licht der Admiralität', power: 'Sonnenlanze', color: '#FFF2B0', angle: -1.0, dist: 210 },
];

export const JUDGMENT_NAME = 'Vereintes Admirals-Urteil';

// ---------------------------------------------------------------------------------------------------------------
// Ablauf und Zahlen
// ---------------------------------------------------------------------------------------------------------------

export type ProloguePhase = 'intro' | 'deck' | 'assemble' | 'charge' | 'impact' | 'overboard' | 'blackout' | 'done';
export const PROLOGUE_PHASES: readonly ProloguePhase[] = ['intro', 'deck', 'assemble', 'charge', 'impact', 'overboard', 'blackout', 'done'];

/** Zeiten (Sekunden) und Grenzen des Prologs */
export const PROLOGUE = {
  /** Einstieg: Kamerafahrt über das brennende Schiff, Titel, Schwarzbarts Ruf */
  intro: 5.5,
  /** Deck: Hinweis nach so langer Zeit ohne Ziel, danach geht es von selbst weiter (kein Festhängen) */
  hintAfter: 55,
  autoAfter: 150,
  /** Drei Akte des Finales: Admirale formieren sich, Vereintes Urteil lädt, Einschlag (Doppel-Impact-Frame) */
  assemble: 4.2,
  charge: 3.4,
  impact: 3.2,
  /** Druckwelle schleudert die Figur über Bord, dann Schwarzblende mit Herzschlag */
  overboard: 2.6,
  blackout: 4.2,
  /** Impact-Bilder im Treffermoment (invertiert → Tusche, wie die Ultimates) */
  impactFrames: 4,
  /** Gefahren an Deck: Kanoneneinschlag (Warnring, Zeit, Radius, Schaden als Anteil der Lebenspunkte) und brennende Trümmer */
  cannon: { every: 2.3, jitter: 0.7, warn: 1.1, radius: 2.4, dmg: 0.16, knock: 7 },
  debris: { every: 4.1, jitter: 1.2, warn: 0.95, radius: 1.7, dmg: 0.12, knock: 5 },
  /** Gefahren fallen so weit vor der Figur (Richtung Achterdeck, m) und so weit zur Seite (Anteil der halben Breite) */
  ahead: [3, 11] as readonly [number, number],
  side: 0.75,
  /** Die Figur fällt nie unter diesen Lebensanteil (der Prolog lässt sich nicht verlieren) */
  hpFloor: 0.55,
  /** Schwarzbarts Schockwellen zerschmettern Marine-Schiffe (Sekunden seit Deck-Beginn, Schiff 0 … 2) */
  shocks: [7, 16, 26] as readonly number[],
  /** Abstand der Schockwellen, wenn man früh am Achterdeck ist, und Nachwirken der letzten bis zum Finale (s) */
  shockGap: 1.9,
  /** Blitze schlagen gezielt neben dem Schiff ein (zusätzlich zum Gewitter) */
  strikeEvery: 3.4,
  /** Das Achterdeck gilt als erreicht, so nah (m, längs) am Steuerrad */
  goalReach: 4,
} as const;

/** Sturmwetter des Prologs (Werte über dem Wetter-Typ, `Weather.hold`) und Uhrzeit */
export const PROLOGUE_WEATHER = { clouds: 1, cloudDark: 0.95, visibility: 0.36, grey: 0.86, rain: 1, waves: 2.9, wind: 1, lightning: 11, light: 0.3, weight: 0.85 } as const;
export const PROLOGUE_TIME = 23.2;

/** Untertitel und Rufe (deutsch, im Sturmkrone-Universum) */
export const PROLOGUE_LINES: Readonly<Record<string, { who: string; text: string }>> = {
  title: { who: '', text: 'Die letzte Nacht der Schwarzen Krone' },
  call: { who: SCHWARZBART.name, text: 'Haltet das Deck, ihr Hunde! Keiner von denen setzt einen Fuß auf mein Achterdeck!' },
  bootsmann: { who: 'Bootsmann Kral', text: 'Junge! Lauf zum Kapitän – die Marine entert von Steuerbord!' },
  run: { who: '', text: 'Lauf zum Achterdeck – weiche Kanonenkugeln und brennenden Trümmern aus!' },
  shock1: { who: SCHWARZBART.name, text: 'Die See gehört der Schwarzen Flagge!' },
  shock2: { who: SCHWARZBART.name, text: 'Noch einer? Dann sinkt eben noch einer!' },
  shock3: { who: SCHWARZBART.name, text: 'Ist das alles, was die Admiralität schickt?' },
  hint: { who: 'Bootsmann Kral', text: 'Zum Achterdeck, Junge! Zum Kapitän – schnell!' },
  arrive: { who: SCHWARZBART.name, text: 'Du bist ja noch ein Kind … Bleib hinter mir.' },
  admirals: { who: 'Ausguck', text: 'Sieben Flaggen am Horizont! Die Admirale – alle sieben!' },
  charge: { who: 'Großadmiral Eisenhart von Sturmwall', text: 'Schwarzbart! Im Namen der Krone: das Vereinte Admirals-Urteil!' },
  defiance: { who: SCHWARZBART.name, text: 'Dann kommt doch – und holt euch meine Krone!' },
  fall: { who: SCHWARZBART.name, text: 'Die Sturmkrone … sie wird … einen Neuen … finden …' },
  dark: { who: '', text: '… Rauschen … Kälte … ein Herzschlag …' },
};

/** Wann eine Zeile im Deck-Abschnitt kommt (Sekunden seit Deck-Beginn) */
export const DECK_LINES: readonly { at: number; id: string }[] = [
  { at: 0.4, id: 'bootsmann' }, { at: 4.2, id: 'run' },
];

/** Untertitel-Länge (s) */
export const LINE_HOLD = 3.6;

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
  /** Erste Start-Crew: die Navigatorin heuert man über die Hafenmeisterin an (ohne Handgeld) */
  starterCrew: 'nav',
  /** Leine der privaten Instanz: so weit (m) darf das Schiff vor der Einführung von Ankerglück weg */
  leash: 900,
  /** Gold am Ende der Einführung (der Bürgermeister zahlt den Dank) */
  thanksGold: 150,
} as const;

/** Lehrtafel der Einführung, sobald man das erste Mal am Steuer der Schaluppe steht (Tasten der Standardbelegung) */
export const SHIP_COACH: readonly { title: string; text: string }[] = [
  { title: 'Segel', text: 'W setzt mehr Segel, S refft sie, A und D legen das Ruder. Mit dem Wind im Rücken bist du am schnellsten – der Pfeil am Kompass zeigt, woher er weht.' },
  { title: 'Rumpf', text: 'Die Leiste „Rumpf“ zeigt, was deine Schaluppe noch aushält. Fällt sie auf null, sinkt das Schiff. Im Hafen machen die Zimmerleute es wieder heil.' },
  { title: 'Breitseiten', text: 'Kanonen feuern zur Seite: Q nach Backbord (links), E nach Steuerbord (rechts). Halte den Gegner seitlich im Zielbogen, dann trifft die Salve.' },
  { title: 'Crew-Moral', text: 'Deine Seeleute brauchen Sold und Siege. Gute Moral lädt schneller nach und segelt besser; mit G flicken sie zerrissene Segel.' },
];

/** Wer in der geteilten Welt sichtbar wird (bis zum Netz in Phase 4.8 lokale Stellvertreter, siehe world/sharedPresence.ts) */
export const SHARED_PRESENCE = {
  /** Mitspieler zu Fuß in Ankerglück und Schiffe vor dem Hafen */
  townCaptains: 5,
  seaShips: 2,
  /** Namen der Kapitäne (deutsch, Sturmkrone-Universum) */
  names: ['Kapitänin Ragna Sturmhut', 'Kapitän Jorin Ankerfaust', 'Kapitänin Lene Salzwind', 'Kapitän Tjark Nebelsegel', 'Kapitänin Ylva Goldbug', 'Kapitän Bent Teerhand', 'Kapitänin Smilla Wellenbrand'],
} as const;
