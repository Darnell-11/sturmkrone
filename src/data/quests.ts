import { CREW_QUESTS } from './crew';
// Aufträge: Hauptgeschichte und Nebenaufträge. Neue Aufträge = neuer Eintrag, keine Codeänderung nötig.
import type { Faction } from '../core/save/types';
import type { EnemyKind } from './combat';

export type QuestStep =
  | { type: 'talk'; npc: string; text: string }
  | { type: 'goto'; island: string; text: string }
  | { type: 'clear'; island: string; text: string }
  | { type: 'kill'; kind?: EnemyKind; count: number; text: string }
  | { type: 'sink'; count: number; text: string }
  | { type: 'board'; count: number; text: string }
  | { type: 'treasure'; island: string; text: string }
  | { type: 'rescue'; count: number; text: string };

export interface QuestDef {
  id: string;
  title: string;
  /** Wer den Auftrag vergibt (NPC-ID) */
  giver: string;
  main?: boolean;
  /** Nur für eine Fraktion */
  faction?: Faction;
  /** Erst nach diesem Auftrag verfügbar */
  after?: string;
  intro: Record<Faction, string> | string;
  outro: string;
  steps: QuestStep[];
  reward: { gold: number; xp: number; fame: number; sp?: number };
}

export const QUESTS: QuestDef[] = [
  {
    id: 'k1', title: 'Kapitel 1: Salz im Blut', giver: 'ilse', main: true,
    intro: {
      pirat: 'Frisch angeheuert und schon großes Maul? Gut so. Wer in der Bernsteinsee überleben will, braucht Mut – und Beweise. Fahr zum alten Leuchtfeuer, dort erfährst du, wer uns das Leben schwer macht.',
      marine: 'Rekrut, die Admiralität hat Sie nach Ankerglück versetzt, um für Ordnung zu sorgen. Melden Sie sich zuerst am Leuchtfeuer – von dort sieht man jedes Schiff, das in die Bucht fährt.',
    },
    outro: 'Nicht schlecht. Die See hat dich bemerkt … und nicht nur sie. Draußen, hinter dem Sturmgürtel, soll die Sturmkrone liegen – die Krone, aus der alles Faji stammt. Wer sie trägt, befiehlt den Meeren. Halte die Augen offen.',
    steps: [
      { type: 'goto', island: 'leuchtfeuer', text: 'Segle zum Leuchtfeuer' },
      { type: 'clear', island: 'kraehenfels', text: 'Räume das Lager auf Krähenfels' },
      { type: 'sink', count: 2, text: 'Versenke 2 feindliche Schiffe' },
      { type: 'talk', npc: 'ilse', text: 'Berichte Hafenmeisterin Ilse' },
    ],
    reward: { gold: 400, xp: 250, fame: 60, sp: 1 },
  },
  {
    id: 'k2', title: 'Kapitel 2: Die Legende von Sturmzahn', giver: 'ilse', main: true, after: 'k1',
    intro: 'Auf Sturmzahn haust eine Legende, die jedes Schiff ausnimmt, das ihr zu nahe kommt. Solange sie dort herrscht, traut sich kein Händler in die Bernsteinsee. Bereite dich gut vor – und dann zeig ihr, wer jetzt das Sagen hat.',
    outro: 'Die ganze Bernsteinsee spricht von dir! Mit dieser Tat steigst du in der Rangliste der Legenden auf. Der Weg nach Norden, ins Nebelarchipel, steht dir offen.',
    steps: [
      { type: 'board', count: 1, text: 'Entere ein Schiff, um Kampferfahrung zu sammeln' },
      { type: 'clear', island: 'sturmzahn', text: 'Besiege die Legende auf Sturmzahn' },
      { type: 'talk', npc: 'ilse', text: 'Kehre nach Ankerglück zurück' },
    ],
    reward: { gold: 1200, xp: 800, fame: 250, sp: 2 },
  },
  {
    id: 'netze', title: 'Verlorene Netze', giver: 'ole',
    intro: 'Ein Sturm hat meine Netze nach Möwennest getrieben. Ohne Netze kein Fisch, ohne Fisch kein Essen! Bringst du sie mir zurück?',
    outro: 'Meine Netze! Heute Abend gibt es Fischsuppe für alle – und das hier ist für dich.',
    steps: [{ type: 'treasure', island: 'moewennest', text: 'Finde die Netze auf Möwennest' }, { type: 'talk', npc: 'ole', text: 'Bring die Netze zu Fischer Ole' }],
    reward: { gold: 120, xp: 80, fame: 10 },
  },
  {
    id: 'muschelgold', title: 'Das Gold von Muschelruh', giver: 'wirt',
    intro: 'Psst. Ein Gast hat mir eine Karte dagelassen, statt seine Rechnung zu zahlen. Ein X auf Muschelruh. Ich bin zu alt zum Graben – teilen wir?',
    outro: 'Ha! Ich wusste, dass der Halunke nicht gelogen hat. Behalt den Großteil, ich nehm nur, was er mir schuldet.',
    steps: [{ type: 'treasure', island: 'muschelruh', text: 'Grabe den Schatz auf Muschelruh aus' }, { type: 'talk', npc: 'wirt', text: 'Teile die Beute mit dem Wirt' }],
    reward: { gold: 350, xp: 120, fame: 15 },
  },
  {
    id: 'rabenriff', title: 'Das Lager am Rabenriff', giver: 'grete',
    intro: 'Die Kerle am Rabenriff haben meine letzte Lieferung Erz gestohlen. Wenn du sie verjagst, schmiede ich dir einen Rabatt – versprochen.',
    outro: 'Mein Erz ist wieder da! Komm vorbei, wenn du eine bessere Klinge brauchst.',
    steps: [{ type: 'clear', island: 'rabenriff', text: 'Räume das Lager am Rabenriff' }, { type: 'talk', npc: 'grete', text: 'Kehre zu Grete in die Schmiede zurück' }],
    reward: { gold: 300, xp: 200, fame: 30 },
  },
  {
    id: 'schiffbruch', title: 'Schiffbrüchige', giver: 'ilse',
    intro: 'Nach dem letzten Sturm treiben Überlebende auf Flößen in der Bernsteinsee. Halt die Augen offen und bring sie in Sicherheit.',
    outro: 'Zwei Leben gerettet. Das vergisst hier niemand.',
    steps: [{ type: 'rescue', count: 2, text: 'Rette 2 Schiffbrüchige auf See' }, { type: 'talk', npc: 'ilse', text: 'Melde dich bei Ilse' }],
    reward: { gold: 200, xp: 150, fame: 40 },
  },
  {
    id: 'bucht', title: 'Der Hauptmann der Bucht', giver: 'grete', after: 'rabenriff',
    intro: 'In der Bernsteinbucht hält ein Hauptmann alle Händler auf. Mit dir an der Klinge wäre der schnell Geschichte.',
    outro: 'Die Bucht ist frei! Die Händler kommen zurück – und die Preise sinken.',
    steps: [{ type: 'clear', island: 'bernsteinbucht', text: 'Besiege das Lager in der Bernsteinbucht' }, { type: 'talk', npc: 'grete', text: 'Erzähl Grete davon' }],
    reward: { gold: 500, xp: 350, fame: 60, sp: 1 },
  },
];

QUESTS.push(...CREW_QUESTS);
export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

// ---------- Bewohner von Ankerglück ----------

export type ShopKind = 'smith' | 'market' | 'shrine' | 'shipyard' | 'tavern' | 'harbor';

export interface TownNpcDef {
  id: string;
  name: string;
  role: 'haendler' | 'schmied' | 'wirt' | 'fischer' | 'koch' | 'buerger';
  title: string;
  shop?: ShopKind;
  /** Position auf der Stadtinsel relativ zum Mittelpunkt */
  x: number;
  z: number;
  yaw: number;
  greet: string[];
}

export const TOWN_NPCS: TownNpcDef[] = [
  { id: 'ilse', name: 'Ilse Tauwerk', role: 'haendler', title: 'Hafenmeisterin', shop: 'harbor', x: -10, z: -52, yaw: Math.PI, greet: ['Willkommen in Ankerglück! Hier legt jeder an, der in der Bernsteinsee etwas werden will.', 'Wind kommt aus Nordost. Gutes Segelwetter.'] },
  { id: 'wirt', name: 'Baldo Kessel', role: 'wirt', title: 'Wirt der Taverne „Zum Rostigen Anker“', shop: 'tavern', x: -26, z: -2, yaw: Math.PI / 2, greet: ['Setz dich! Ein Krug Ingwerbier und ein Bett für die Nacht – ganz wie du willst.', 'Die besten Geschichten hört man hier drinnen. Die schlimmsten auch.'] },
  { id: 'grete', name: 'Grete Amboss', role: 'schmied', title: 'Waffenschmiedin', shop: 'smith', x: 26, z: 14, yaw: -Math.PI / 2, greet: ['Gib mir zehn Minuten und Kohle, dann schneidet das Ding Wolken.', 'Stumpfe Klingen sind gefährlicher als scharfe – für dich.'] },
  { id: 'mara', name: 'Mara Pfeffer', role: 'haendler', title: 'Händlerin am Markt', shop: 'market', x: 4, z: 26, yaw: 0, greet: ['Frischer Proviant! Getrockneter Fisch, Zwieback, Bernsteinhonig!', 'Wer satt ist, kämpft besser.'] },
  { id: 'ilyas', name: 'Meister Ilyas', role: 'buerger', title: 'Hüter des Faji-Schreins', shop: 'shrine', x: 0, z: 52, yaw: 0, greet: ['Faji folgt nicht dem Muskel, sondern dem Willen.', 'Der Schrein spürt, was in dir schläft.'] },
  { id: 'jasper', name: 'Jasper Zahnrad', role: 'schmied', title: 'Schiffbaumeister der Werft', shop: 'shipyard', x: 40, z: -26, yaw: -Math.PI / 2, greet: ['Jedes Loch stopf ich – auch die im Plan.', 'Ein gutes Schiff ist wie ein guter Freund: Es lässt dich nicht absaufen.'] },
  { id: 'ole', name: 'Ole Kiemer', role: 'fischer', title: 'Fischer', x: 14, z: -60, yaw: Math.PI, greet: ['Die Möwen fliegen tief. Das heißt Fisch – oder Regen.', 'Früher war die See ruhiger. Glaub ich.'] },
];
