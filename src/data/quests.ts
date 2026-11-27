import { CREW_QUESTS } from './crew';
import { CAMPAIGN_QUESTS } from './campaigns';
// Aufträge: Hauptgeschichte und Nebenaufträge. Neue Aufträge = neuer Eintrag, keine Codeänderung nötig.
import type { Faction } from '../core/save/types';
import type { EnemyKind } from './combat';
import type { TutorialAct } from './prologue';

export type QuestStep =
  | { type: 'talk'; npc: string; text: string }
  | { type: 'goto'; island: string; text: string }
  | { type: 'clear'; island: string; text: string }
  | { type: 'kill'; kind?: EnemyKind; count: number; text: string }
  | { type: 'sink'; count: number; text: string }
  | { type: 'board'; count: number; text: string }
  | { type: 'slay'; target: string; text: string }
  | { type: 'treasure'; island: string; text: string }
  | { type: 'rescue'; count: number; text: string }
  /** 4.7A: Handlung der Einführung (Schlagkette, Sturm-Schritt, Ziel erfassen, Talentpunkt, Crew, Steuer, Faji-Kunst …) */
  | { type: 'act'; act: TutorialAct; text: string; count?: number }
  // ---- 4.7E: Rat der Gesandten und Hauptkampagnen der Teams (an die Welt-Simulation gekoppelt) ----
  /** vor dem Rat der Gesandten einem Team die Treue schwören (einmalig, data/allegiance.ts) */
  | { type: 'pledge'; text: string }
  /** Live-Kriegs-Quests des eigenen Teams mit eigenem Beitrag abschließen (optional nur einer Art, story/warQuests.ts) */
  | { type: 'war'; count: number; kind?: string; text: string }
  /** Kommandoschiffe (Flaggschiffe) feindlicher Verbände versenken */
  | { type: 'flagship'; count: number; text: string }
  /** mit dem Team Inseln erobern oder zurückerobern (Invasion, Gegenangriff) */
  | { type: 'liberate'; count: number; text: string }
  /** Stufe erreichen (Story-Schranke der Kampagne; zählt sofort, wenn sie schon erreicht ist) */
  | { type: 'level'; level: number; text: string }
  /** einen Kaiser im fünften Ring besiegen (`kaiser`: eine bestimmte Zitadelle) */
  | { type: 'kaiser'; kaiser?: string; text: string }
  /** so weit hinaus segeln (m vom Weltzentrum): die Unbekannten Äußeren Meere sichten */
  | { type: 'horizon'; dist: number; text: string };

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
  /** Wird nie im Gespräch angeboten (Prolog startet mit dem neuen Spiel) */
  noOffer?: boolean;
  /** 4.7E: nur für dieses Team (Hauptkampagne, data/campaigns.ts) */
  team?: string;
  /** 4.7E: Kapitelnummer der Hauptkampagne (1 … 7) */
  campaign?: number;
  intro: Record<Faction, string> | string;
  outro: string;
  steps: QuestStep[];
  reward: { gold: number; xp: number; fame: number; sp?: number };
}

/** 4.9: entfallene Aufträge (alte Schaluppen-Startquest „Kapitel 0: Leinen los“) – laufende Einträge alter Spielstände gelten als erledigt */
export const RETIRED_QUESTS: readonly string[] = ['k0'];

/**
 * 4.9: Entfallene Aufträge aus einem Spielstand räumen (laufend → erledigt), damit keine Auftragszeichen mehr bei ihren Gebern erscheinen.
 * Liefert true, wenn sich etwas geändert hat. Rein, auf jedem Stand mehrfach aufrufbar.
 */
export function retireQuests(p: { quests: { id: string }[]; done: string[]; flags: Record<string, unknown> }): boolean {
  let changed = false;
  for (const id of RETIRED_QUESTS) {
    const i = p.quests.findIndex((q) => q.id === id);
    if (i >= 0) { p.quests.splice(i, 1); changed = true; }
    if (i >= 0 && !p.done.includes(id)) p.done.push(id);
    if (p.flags.tracked === id) { delete p.flags.tracked; changed = true; }
  }
  return changed;
}

export const QUESTS: QuestDef[] = [
  // ---------- 4.7A: Einführung „Ankerglück“ (private Instanz, Stufe 1 → 3) – startet nach dem Gewitter-Prolog ----------
  {
    id: 't1', title: 'Einführung: Gestrandet', giver: 'hinnerk', main: true, noOffer: true,
    intro: 'Du wachst im nassen Sand auf. Grünmarkt, die Schwarze Krone, Schwarzbarts letzter Schrei – alles fort. Am Pier winkt ein alter Fischer.',
    outro: 'Bei allen Fischen, du lebst! Die See hat dich ausgespuckt wie Treibholz – in Leinen, ohne Waffe, ohne einen Kupferling. Von der Schwarzen Krone, sagst du? Dann hast du Glück, dass du atmest. Hör zu, Junge: Ohne Klinge kommst du hier nicht weit. Geh ins Dorf zu Bodo, dem Hammerschmied, und sag ihm, Hinnerk schickt dich. Das ist ab heute dein Weg.',
    steps: [{ type: 'talk', npc: 'hinnerk', text: 'Sprich mit dem Fischer Hinnerk am Pier' }],
    reward: { gold: 0, xp: 0, fame: 0 },
  },
  {
    id: 't2', title: 'Einführung: Die erste Ausrüstung', giver: 'bodo', main: true, auto: true, after: 't1',
    intro: 'Hinnerk schickt dich zum Hammerschmied ins Dorf.',
    outro: 'Ein Schiffbrüchiger von der Schwarzen Krone? Dann brauchst du Ausrüstung – und zwar keine von der Stange. Tritt zurück, gleich fliegen Funken! … So. Frisch vom Amboss, noch warm, genau für deine Hand geschmiedet. Jetzt lern, damit umzugehen: Waffenmeister Konrad wartet bei den Übungspuppen.',
    steps: [{ type: 'talk', npc: 'bodo', text: 'Geh ins Dorf zum Hammerschmied Bodo' }],
    reward: { gold: 0, xp: 0, fame: 0 },
  },
  {
    id: 't3', title: 'Einführung: Grundlagen des Kampfes', giver: 'konrad', main: true, auto: true, after: 't2',
    intro: 'Bodo hat dir deine Klassen-Ausrüstung gegeben. Waffenmeister Konrad soll dir zeigen, wie man kämpft.',
    outro: 'Nicht schlecht für einen, der gestern noch Deckplanken geschrubbt hat. Du hast das Zeug zum Kämpfer. Jetzt brauchst du ein Schiff – Hafenmeisterin Ilse hat da etwas … sagen wir: Erfahrenes.',
    steps: [
      { type: 'talk', npc: 'konrad', text: 'Melde dich bei Waffenmeister Konrad an den Übungspuppen' },
      // 4.9: Faji-Wirker üben statt der Nahkampf-Kombo eine Element-Salve aus der Ferne (core/tutorialFlow.ts `salvoDone`)
      { type: 'act', act: 'combo', text: 'Übungspuppe: Klassen-Kombo mit 5 Treffern – als Faji-Wirker eine Element-Salve aus der Ferne (Linksklick / J)' },
      { type: 'act', act: 'dash', text: 'Weiche mit dem Sturm-Schritt aus (Umschalt)' },
      { type: 'act', act: 'target', text: 'Erfasse ein Ziel mit Tab oder Mausklick' },
      { type: 'act', act: 'talent', text: 'Du bist Stufe 2: setze deinen ersten Punkt im Sternbild-Klassenbaum (Taste N)' },
    ],
    reward: { gold: 0, xp: 0, fame: 5 },
  },
  {
    id: 't4', title: 'Einführung: Die ranzige Schaluppe', giver: 'ilse', main: true, auto: true, after: 't3',
    intro: 'Der Waffenmeister schickt dich zur Hafenmeisterin: Ohne Schiff bleibt man in Ankerglück ein Landratte.',
    outro: 'Das Spähboot ist versenkt? Dann taugt die alte Schaluppe noch was – und du auch. Der Bürgermeister will dich sehen. Und beeil dich: Seit heute früh treiben sich Kurogane-Segel vor der Bucht herum.',
    steps: [
      { type: 'talk', npc: 'ilse', text: 'Hol dir bei Hafenmeisterin Ilse dein erstes Schiff' },
      { type: 'act', act: 'hire', text: 'Heuere deine erste kleine Crew an' },
      { type: 'act', act: 'helm', text: 'Geh an Bord deiner Schaluppe und übernimm das Steuer' },
      { type: 'sink', count: 1, text: 'Küstengefecht: versenke das Kurogane-Spähboot vor der Bucht' },
    ],
    reward: { gold: 0, xp: 0, fame: 10 },
  },
  {
    id: 't5', title: 'Einführung: Der Kurogane-Überfall', giver: 'gerstenkorn', main: true, auto: true, after: 't4',
    intro: 'Die Hafenmeisterin schickt dich zum Bürgermeister von Ankerglück – doch vor der Bucht tauchen schwarze Kurogane-Segel auf.',
    outro: 'Du hast Ankerglück gerettet – mit einer Kunst, die du heute Morgen noch nicht kanntest. Ankerglück steht in deiner Schuld, Kapitän. Nimm dieses Gold und ordentliche Seemannskleidung. Und dann: Die Bernsteinsee wartet. Andere Kapitäne laufen schon aus – zeig ihnen, wer von der Schwarzen Krone übrig ist.',
    steps: [
      { type: 'talk', npc: 'gerstenkorn', text: 'Melde dich bei Bürgermeister Gerstenkorn' },
      { type: 'act', act: 'faji', text: 'Berühre den Faji-Kristall: Stufe 3 – deine Geistes-Faji erwacht (Faji-Wirker wählen Element oder Priester)' },
      { type: 'act', act: 'art', text: 'Setze deine neue Kraft im Kampf ein: Geistes-Faji (Q)' },
      { type: 'act', act: 'raid', text: 'Wehre den Kurogane-Stoßtrupp im Hafen ab' },
      { type: 'talk', npc: 'gerstenkorn', text: 'Kehre zum Bürgermeister zurück' },
    ],
    reward: { gold: 150, xp: 0, fame: 25 },
  },
  {
    // 4.7E: der Rat der Gesandten – einmalige, dauerhafte Team-Wahl; danach beginnt die Hauptkampagne des Teams.
    // 4.9: folgt direkt auf die Einführung (die alte Schaluppen-Startquest „Kapitel 0: Leinen los“ bei Hafenmeisterin Ilse ist entfallen)
    id: 'rat', title: 'Der Rat der Gesandten', giver: 'gerstenkorn', main: true, auto: true, after: 't5', noOffer: true,
    intro: 'Die Kunde von deinem Sieg über den Kurogane-Stoßtrupp ist bis in die Hauptstädte gedrungen. Im Ratssaal von Ankerglück warten die Gesandten der fünf Mächte – jede will dich in ihren Reihen. Doch Treue schwört man nur einmal.',
    outro: 'Der Rat erhebt sich. Dein Schwur ist gesprochen, deine Flagge gesetzt – von heute an segelst du für dein Team, und dein Team segelt mit dir.',
    steps: [
      { type: 'talk', npc: 'gerstenkorn', text: 'Sprich mit Bürgermeister Gerstenkorn – er führt dich in den Ratssaal' },
      { type: 'pledge', text: 'Tritt vor den Rat der Gesandten und schwöre einem der fünf Teams die Treue (einmalig)' },
    ],
    reward: { gold: 250, xp: 300, fame: 30, sp: 1 },
  },
  {
    // 4.9: die „Legende der Sturmkrone“ öffnet sich erst nach dem Rat (kein Auftragszeichen bei Ilse, solange der Rat ansteht)
    id: 'k1', title: 'Kapitel 1: Salz im Blut', giver: 'ilse', main: true, after: 'rat',
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

// Nebenaufträge der Dorfbewohner (Festland und Küstenländer)
QUESTS.push(
  {
    id: 'ruinen', title: 'Die Säulen im Norden', giver: 'wanda', after: 'k2',
    intro: 'Mein Großvater erzählt von einer Insel mit versunkenen Säulen, ein Tempel aus der Zeit vor dem Faji. Sieh dir den Ort an und berichte mir – ich will wissen, ob er wahr ist.',
    outro: 'Also stimmt es! Ein Tempel unter Wasser … Mein Großvater wird weinen vor Freude. Hier, für deine Mühe.',
    steps: [
      { type: 'goto', island: 'versunkenertempel', text: 'Erkunde die Ruinen-Insel „Versunkener Tempel“' },
      { type: 'talk', npc: 'wanda', text: 'Berichte Wanda in Weidenbrück' },
    ],
    reward: { gold: 450, xp: 300, fame: 45, sp: 1 },
  },
  {
    id: 'pluenderer', title: 'Plünderer an der Küste', giver: 'toni',
    intro: 'Plünderer treiben sich an der Küste herum und scheuchen meine Schafe auf. Wenn du fünf von ihnen vertreibst, kehrt hier wieder Ruhe ein.',
    outro: 'Ruhe! Ich höre die Schafe wieder blöken. Nimm das, du hast es verdient.',
    steps: [
      { type: 'kill', count: 5, text: 'Besiege 5 Gegner an Land' },
      { type: 'talk', npc: 'toni', text: 'Berichte Toni in Weidenbrück' },
    ],
    reward: { gold: 220, xp: 160, fame: 25 },
  },
  {
    id: 'muscheln', title: 'Muscheln für den Markt', giver: 'kiri',
    intro: 'Die Flut hat Dinge angespült, die ich nicht allein heben kann. Siehst du die Insel dort im Dunst? Sieh nach, ob dort etwas liegt, das uns nützt.',
    outro: 'Du hast es gefunden! Das bringt auf dem Markt ein hübsches Sümmchen. Hier dein Anteil.',
    steps: [
      { type: 'goto', island: 'muschelruh', text: 'Erkunde die Insel Muschelruh' },
      { type: 'talk', npc: 'kiri', text: 'Kehre zu Kiri zurück' },
    ],
    reward: { gold: 180, xp: 140, fame: 20 },
  },
);

QUESTS.push(...CREW_QUESTS);
// 4.7E: die sieben Kapitel jeder der fünf Hauptkampagnen (nur für das eigene Team sichtbar und startbar)
QUESTS.push(...CAMPAIGN_QUESTS);

/** Dorfbewohner der handgebauten Länder (Schlüssel = Insel-ID): sprechen, Aufträge vergeben; Plätze wählt die Welt */
export const VILLAGE_NPCS: Record<string, TownNpcDef[]> = {
  gruenmark: [
    { id: 'wanda', name: 'Wanda Kornblum', role: 'buerger', title: 'Bäuerin in Weidenbrück', x: 0, z: 0, yaw: 0, greet: ['Guten Tag, Fremde! Frisch gemähtes Heu und kalte Milch – nimm dir, was du brauchst.', 'Hier draußen ist es still. Das mag ich.'] },
    { id: 'toni', name: 'Toni Hirtenstab', role: 'buerger', title: 'Schäfer', x: 0, z: 0, yaw: 0, greet: ['Pst! Du verschreckst die Schafe. Na gut, einen Gruß bekommst du trotzdem.', 'Der Wind riecht nach Regen.'] },
  ],
  palmenkueste: [
    { id: 'kiri', name: 'Kiri Muschelsang', role: 'fischer', title: 'Strandsammlerin', x: 0, z: 0, yaw: 0, greet: ['Salzwind und Sonne – was braucht man mehr?', 'Hör mal, die Brandung klingt heute anders.'] },
  ],
  sturmklippe: [
    { id: 'sven', name: 'Sven Windfang', role: 'fischer', title: 'Einsiedler der Klippe', x: 0, z: 0, yaw: 0, greet: ['Wer kommt da? Ach, ein Mensch. Selten geworden.', 'Wenn die Möwen schreien, kommt Sturm.'] },
  ],
  faehrholm: [
    { id: 'fenna', name: 'Fenna Ruderblatt', role: 'fischer', title: 'Fährfrau', x: 0, z: 0, yaw: 0, greet: ['Willkommen auf Fährholm! Wohin soll es gehen?', 'Das Wasser ist heute freundlich. Heute.'] },
  ],
};

export const VILLAGE_NPC_BY_ID: Record<string, TownNpcDef> = Object.fromEntries(Object.values(VILLAGE_NPCS).flat().map((n) => [n.id, n]));
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
  // 4.7A: Bewohner der Einführung (bleiben danach in Ankerglück)
  { id: 'hinnerk', name: 'Hinnerk Treibholz', role: 'fischer', title: 'Fischer am Pier', x: 4, z: -58, yaw: Math.PI, greet: ['Die See nimmt, die See gibt. Heute hat sie dich gegeben.', 'Treibholz und Netze – mehr braucht ein alter Mann nicht.'] },
  { id: 'bodo', name: 'Bodo Hammerschlag', role: 'schmied', title: 'Hammerschmied', x: 30, z: 22, yaw: -Math.PI / 2, greet: ['Klong! Klong! – Was? Ach, du bist es. Gute Klinge, die du da trägst.', 'Feuer, Hammer, Geduld. Mehr Geheimnisse hat das Schmieden nicht.'] },
  { id: 'konrad', name: 'Konrad Klingenstein', role: 'buerger', title: 'Waffenmeister', x: 0, z: -36, yaw: Math.PI, greet: ['Schultern locker, Füße fest. Und nie den Gegner aus den Augen lassen.', 'Die Puppen schlagen nicht zurück. Die Kurogane schon.'] },
  { id: 'gerstenkorn', name: 'Theodor Gerstenkorn', role: 'buerger', title: 'Bürgermeister von Ankerglück', x: -8, z: 12, yaw: 0, greet: ['Ankerglück grüßt dich, Kapitän! Na ja – fast Kapitän.', 'Eine friedliche Stadt braucht wache Augen. Und gelegentlich eine scharfe Klinge.'] },
  { id: 'ole', name: 'Ole Kiemer', role: 'fischer', title: 'Fischer', x: 14, z: -60, yaw: Math.PI, greet: ['Die Möwen fliegen tief. Das heißt Fisch – oder Regen.', 'Früher war die See ruhiger. Glaub ich.'] },
];
