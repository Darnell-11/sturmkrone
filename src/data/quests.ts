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
  | { type: 'slay'; target: string; text: string }
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
  /** Startet von selbst, sobald „after“ erledigt ist (Hauptgeschichte) */
  auto?: boolean;
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
    outro: 'Die ganze Bernsteinsee spricht von dir! Mit dieser Tat steigst du in der Rangliste der Legenden auf. Grimmbart hatte etwas bei sich: ein Siegel aus Sturmglas, warm wie ein Herzschlag. Der Weg nach Norden, ins Nebelarchipel, steht dir offen.',
    steps: [
      { type: 'board', count: 1, text: 'Entere ein Schiff, um Kampferfahrung zu sammeln' },
      { type: 'clear', island: 'sturmzahn', text: 'Besiege die Legende auf Sturmzahn' },
      { type: 'talk', npc: 'ilse', text: 'Kehre nach Ankerglück zurück' },
    ],
    reward: { gold: 1200, xp: 800, fame: 250, sp: 2 },
  },
  {
    id: 'k3', title: 'Kapitel 3: Stimmen im Nebel', giver: 'ilse', main: true, auto: true, after: 'k2',
    intro: 'Das Siegel aus Sturmglas zieht nach Norden, als wolle es heim. Im Nebelarchipel, so erzählen die Fischer, ruft nachts ein Kapitän nach seinem verlorenen Schatz. Vielleicht weiß er, was es mit dem Siegel auf sich hat.',
    outro: 'Moderherz zerfällt zu Nebel. Seine letzten Worte: „Fünf Siegel … fünf Meere … wer sie vereint, öffnet den Schlund – und findet die Krone, aus der das Faji kam.“ In seinem Wrack liegt ein zweites Siegel.',
    steps: [
      { type: 'goto', island: 'nebelhafen', text: 'Segle ins Nebelarchipel nach Nebelhafen' },
      { type: 'clear', island: 'versunkenertempel', text: 'Durchsuche den Versunkenen Tempel' },
      { type: 'clear', island: 'geisterriff', text: 'Stelle Kapitän Moderherz am Geisterriff' },
    ],
    reward: { gold: 1800, xp: 1400, fame: 400, sp: 2 },
  },
  {
    id: 'k4', title: 'Kapitel 4: Die Festung im Norden', giver: 'ilse', main: true, auto: true, after: 'k3',
    intro: {
      pirat: 'Die Marine hat von den Siegeln erfahren. In der Festung Nordwacht sammelt Kommandant Eisenfaust Schiffe, um dir zuvorzukommen. Zeit, ihm die Flotte zu versenken – und sein Siegel zu holen.',
      marine: 'Kommandant Eisenfaust hat sich mit der Festung Nordwacht von der Admiralität losgesagt. Er will die Siegel für sich. Holen Sie es zurück, bevor er die Meere in Brand steckt.',
    },
    outro: 'Eisenfaust liegt geschlagen auf den Zinnen. Er lacht: „Du glaubst, die Krone macht dich frei? Sie macht dich zum Ziel.“ Das dritte Siegel glüht in deiner Hand.',
    steps: [
      { type: 'goto', island: 'kiefernhafen', text: 'Segle nach Kiefernhafen in der Nordwacht' },
      { type: 'sink', count: 4, text: 'Versenke 4 Schiffe der Nordflotte' },
      { type: 'clear', island: 'festungnordwacht', text: 'Erstürme die Festung Nordwacht' },
    ],
    reward: { gold: 2600, xp: 2200, fame: 600, sp: 2 },
  },
  {
    id: 'k5', title: 'Kapitel 5: Das Herz des Feuers', giver: 'ilse', main: true, auto: true, after: 'k4',
    intro: 'In der Schmiedestadt Glutheim erzählt man von Ignara, die auf dem Gipfel des Glutbergs das Feuer-Faji bewacht. Wer ihr Siegel will, muss durch ihr Feuer gehen – und vielleicht erwacht dabei etwas in dir.',
    outro: 'Als Ignara fällt, schießt eine Säule aus Licht in den Himmel. Das vierte Siegel brennt sich warm in deine Hand – und tief in dir regt sich ein Faji, das du nicht kanntest.',
    steps: [
      { type: 'goto', island: 'glutheim', text: 'Segle nach Glutheim im Glutring' },
      { type: 'clear', island: 'ascheinsel', text: 'Räume das Lager auf der Ascheinsel' },
      { type: 'clear', island: 'glutberg', text: 'Besiege Ignara auf dem Glutberg' },
    ],
    reward: { gold: 3400, xp: 3000, fame: 800, sp: 3 },
  },
  {
    id: 'k6', title: 'Kapitel 6: Im Auge des Sturms', giver: 'ilse', main: true, auto: true, after: 'k5',
    intro: 'Das letzte Siegel liegt im Sturmgürtel, bei Voltar, dem Blitzrufer. Er hält den Sturm am Leben, der den Weg zum Weltrand versperrt. Bring deine stärkste Crew mit.',
    outro: 'Der Sturm verstummt zum ersten Mal seit hundert Jahren. Fünf Siegel summen in einem Ton. Im Westen, am Rand der Welt, öffnet sich das Meer.',
    steps: [
      { type: 'goto', island: 'donnerbucht', text: 'Kämpf dich durch den Sturm nach Donnerbucht' },
      { type: 'clear', island: 'seemannsgrab', text: 'Durchquere das Seemannsgrab' },
      { type: 'clear', island: 'blitzspitze', text: 'Bezwinge Voltar auf der Blitzspitze' },
    ],
    reward: { gold: 4200, xp: 4000, fame: 1100, sp: 3 },
  },
  {
    id: 'k7', title: 'Kapitel 7: Die Sturmkrone', giver: 'ilse', main: true, auto: true, after: 'k6',
    intro: 'Die Siegel weisen zum Schlundriff am Weltrand. Dort, wo das Meer in die Tiefe stürzt, ruht die Sturmkrone – bewacht vom Tiefenschlund, einem Ungeheuer, älter als jedes Schiff. Es gibt kein Zurück.',
    outro: 'Die Sturmkrone liegt in deinen Händen. Sie ist leichter, als du dachtest – und schwerer. Das Faji der ganzen Welt atmet mit dir. Was du jetzt daraus machst, entscheidest du allein.',
    steps: [
      { type: 'goto', island: 'letzterhafen', text: 'Segle zum Letzten Hafen am Weltrand' },
      { type: 'clear', island: 'tiefentor', text: 'Öffne das Tiefentor' },
      { type: 'slay', target: 'tiefenschlund', text: 'Besiege den Tiefenschlund auf See' },
      { type: 'clear', island: 'schlundkrone', text: 'Bezwinge den Hüter der Tiefe' },
    ],
    reward: { gold: 8000, xp: 8000, fame: 2500, sp: 5 },
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
