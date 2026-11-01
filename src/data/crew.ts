// Die Crew aus Sturmkrone 1.0 – ausgebaut mit Kampfrolle, Sprüchen an Deck, Treue und persönlichem Auftrag.
import type { CharacterLook } from './characterParts';
import type { QuestDef } from './quests';
import type { StyleId } from './animations';

export type CrewRole = 'tank' | 'heiler' | 'schaden' | 'unterstuetzung' | 'keine';

export interface CrewDef {
  id: string;
  name: string;
  /** Beruf an Bord */
  job: string;
  perk: string;
  price: number;
  /** Benötigter Rang (Index) */
  rank: number;
  col: string;
  /** Erster Satz beim Anheuern */
  quote: string;
  role: CrewRole;
  /** Waffe im Kampf */
  style?: StyleId;
  /** Kampffähigkeit (Name und Beschreibung) */
  skill?: { n: string; d: string };
  /** Größe (Riese, Kraftpakete) */
  big?: number;
  /** Teile des Aussehens; der Rest kommt aus dem NPC-Baukasten */
  look?: Partial<CharacterLook>;
  /** Sprüche an Deck */
  lines: string[];
  /** Die Schiffskatze ist keine Kämpferin */
  cat?: boolean;
}

export const CREW: CrewDef[] = [
  { id: 'cat', name: 'Brömmel', job: 'Schiffskatze', perk: 'Findet 30 % mehr Gold.', price: 150, rank: 0, col: '#C08A2E', quote: 'Miau. (Er meint: „Wo ist das Gold?“)', role: 'keine', cat: true,
    lines: ['Miau.', '*schnurrt auf der Kanone*', '*jagt eine Möwe – erfolglos*', '*sitzt auf der Seekarte, genau auf dem Ziel*'] },
  { id: 'cook', name: 'Tante Rosmarin', job: 'Schiffsköchin', perk: 'Proviant heilt doppelt, der Rumpf flickt sich auf See langsam.', price: 200, rank: 0, col: '#6E8B3D', quote: 'Erst essen, dann kämpfen. So ist das an Bord.', role: 'heiler', style: 'faust',
    skill: { n: 'Kräftige Brühe', d: 'Heilt dich im Kampf regelmäßig.' },
    look: { skin: '#F0C8A8', outfit: 'hemd', outfitColor: '#6E8B3D', hair: 'dutt', hairColor: '#BDBDBD', hat: 'kochmuetze', hatColor: '#FFFFFF', body: 'kraeftig' },
    lines: ['Wer hat schon wieder vom Zwieback genascht?', 'Heute gibt’s Fischsuppe. Morgen auch.', 'Iss was, du siehst blass aus!', 'Ein leerer Magen hat noch keine Schlacht gewonnen.'] },
  { id: 'nav', name: 'Mira Windblatt', job: 'Navigatorin', perk: 'Das Schiff segelt 15 % schneller.', price: 250, rank: 0, col: '#2F8F9D', quote: 'Ich riech den Wind, bevor er dreht.', role: 'schaden', style: 'saebel',
    skill: { n: 'Böenschnitt', d: 'Flinke Hiebe, wirft Gegner zurück.' },
    look: { skin: '#8D5A3B', outfit: 'weste', outfitColor: '#EDE6D6', hair: 'zopf', hairColor: '#2A1B12', hat: 'bandana', hatColor: '#2F8F9D', body: 'schmal' },
    lines: ['Wind dreht auf Nordost. Perfekt.', 'Hinter dem Horizont wartet immer etwas.', 'Die Karte lügt nicht. Meistens.', 'Spürst du das? Das ist Freiheit.'] },
  { id: 'gun', name: 'Kalle Pulverhand', job: 'Kanonier', perk: 'Kanonen laden 30 % schneller nach.', price: 300, rank: 1, col: '#B4472F', quote: 'Mehr Pulver! Immer mehr Pulver!', role: 'schaden', style: 'faust',
    skill: { n: 'Pulverfass', d: 'Wirft kleine Sprengladungen.' },
    look: { skin: '#E0B08A', outfit: 'hemd', outfitColor: '#B4472F', hair: 'glatze', hat: 'muetze', hatColor: '#5C5C66', beard: 'vollbart', hairColor: '#1E1A18', body: 'kraeftig' },
    lines: ['BUMM! … Entschuldigung, falsche Kanone.', 'Meine Ohren klingeln seit zwölf Jahren.', 'Mehr Pulver!', 'Eine Kanone ist auch nur ein Freund mit Temperament.'] },
  { id: 'carp', name: 'Jasper Zahnrad', job: 'Zimmermann', perk: '+40 Rumpfpunkte für jedes Schiff.', price: 350, rank: 1, col: '#8A5A2B', quote: 'Jedes Loch stopf ich – auch die im Plan.', role: 'tank', style: 'zweihaender',
    skill: { n: 'Hammerschlag', d: 'Langsam, aber Gegner fallen um.' },
    look: { skin: '#C68A5E', outfit: 'weste', outfitColor: '#8A5A2B', hair: 'igel', hairColor: '#5A3A22', hat: 'brille', hatColor: '#C9A13B' },
    lines: ['Diese Planke knarzt. Ich hör sie.', 'Ein gutes Schiff hält mehr aus als sein Kapitän.', 'Wer hat da wieder ein Loch reingeschossen?', 'Holz lebt. Behandel es auch so.'] },
  { id: 'look', name: 'Selma Schwarzauge', job: 'Ausguck', perk: 'Kanonen schießen weiter, Inseln werden früher entdeckt.', price: 450, rank: 2, col: '#4A4E8C', quote: 'Ein Auge reicht, wenn’s das richtige ist.', role: 'schaden', style: 'langklinge',
    skill: { n: 'Adlerstich', d: 'Präzise Stiche mit hoher Kritchance.' },
    look: { skin: '#F5D6BE', outfit: 'jacke', outfitColor: '#4A4E8C', hair: 'lang', hairColor: '#D8D8E8', hat: 'keiner', eyepatch: true, body: 'schmal' },
    lines: ['Segel am Horizont! … Ach nein, eine Wolke.', 'Ich seh die Möwe da hinten. Sie sieht mich auch.', 'Ruhig heute. Zu ruhig.', 'Land in Sicht – irgendwann.'] },
  { id: 'arzt', name: 'Doktor Lina Feder', job: 'Schiffsärztin', perk: 'Proviant heilt 40 % mehr, ausgeknockte Crew steht im Kampf wieder auf.', price: 600, rank: 2, col: '#D96C8A', quote: 'Halt still, das tut nur kurz weh. Meistens.', role: 'heiler', style: 'effekt',
    skill: { n: 'Feldlazarett', d: 'Heilt dich und weckt ausgeknockte Crew.' },
    look: { skin: '#F0C8A8', outfit: 'hemd', outfitColor: '#FFFFFF', hair: 'zopf', hairColor: '#7A3A22', coat: 'lang', coatColor: '#D96C8A' },
    lines: ['Hast du dir die Hände gewaschen?', 'Das ist kein Kratzer, das ist ein Abenteuer.', 'Nächstes Mal bitte weniger Säbel im Gesicht.', 'Ruhe dich aus. Das ist ärztlicher Befehl.'] },
  { id: 'musik', name: 'Pippo Fiedel', job: 'Musiker', perk: 'Seine Lieder geben der Crew +15 % Schaden, dir +5 %.', price: 550, rank: 2, col: '#E8B33A', quote: 'Ein Lied für jeden Sturm – und eins für danach!', role: 'unterstuetzung', style: 'faust',
    skill: { n: 'Schlachtlied', d: 'Stärkt alle Verbündeten in der Nähe.' },
    look: { skin: '#E0B08A', outfit: 'tunika', outfitColor: '#E8B33A', hair: 'igel', hairColor: '#A8442A', hat: 'dreispitz', hatColor: '#5A2E5E' },
    lines: ['♪ Hoch die Krüge, hoch das Segel! ♪', 'Ich hab ein neues Lied geschrieben. Es heißt „Pippo ist toll“.', '♪ Die See ist weit, die See ist tief … ♪', 'Applaus ist auch eine Bezahlung!'] },
  { id: 'helm', name: 'Ole Donner', job: 'Steuermann', perk: 'Das Schiff wendet viel schneller.', price: 500, rank: 3, col: '#3B6E5A', quote: 'Hart Steuerbord – und festhalten!', role: 'tank', style: 'saebel',
    skill: { n: 'Sturmbrecher', d: 'Fängt Schläge ab, die dir gelten.' },
    look: { skin: '#D9A27C', outfit: 'jacke', outfitColor: '#3B6E5A', hair: 'kurz', hairColor: '#EDEDED', hat: 'suedwester', hatColor: '#E8C22B', beard: 'vollbart' },
    lines: ['Hart Steuerbord!', 'Das Ruder fühlt sich heute gut an.', 'Vierzig Jahre auf See – und immer noch nicht seekrank.', 'Festhalten, Landratten!'] },
  { id: 'kiko', name: 'Kiko Wellenreiter', job: 'Taucherin', perk: 'Truhen und Treibgut bringen 50 % mehr.', price: 800, rank: 3, col: '#2FA8C8', quote: 'Unter Wasser ist es ruhiger. Und da liegt das Gold.', role: 'schaden', style: 'doppel',
    skill: { n: 'Strudeltanz', d: 'Wirbelt mit zwei Klingen durch Gruppen.' },
    look: { skin: '#E8BE96', outfit: 'matrose', outfitColor: '#2FA8C8', hair: 'lang', hairColor: '#2E4F8C', hat: 'bandana', hatColor: '#FFFFFF', body: 'schmal' },
    lines: ['Ich könnte schwören, da unten glitzert was.', 'Fische sind die besseren Zuhörer.', 'Eine Perle für jeden Tag auf See!', 'Wann tauchen wir wieder?'] },
  { id: 'schmied', name: 'Grete Amboss', job: 'Waffenschmiedin', perk: '+12 % Waffenschaden für dich.', price: 900, rank: 3, col: '#8C5A3A', quote: 'Gib mir zehn Minuten und Kohle, dann schneidet das Ding Wolken.', role: 'tank', style: 'zweihaender', big: 1.12,
    skill: { n: 'Ambossschlag', d: 'Betäubt Gegner mit wuchtigen Schlägen.' },
    look: { skin: '#C68A5E', outfit: 'weste', outfitColor: '#5A4A3A', hair: 'kurz', hairColor: '#1E1A18', hat: 'brille', hatColor: '#C9A13B', body: 'kraeftig' },
    lines: ['Deine Klinge braucht Liebe. Und einen Schleifstein.', 'Feuer, Eisen, Geduld.', 'Ich hör schon, dass die Kanone verzogen ist.', 'Stumpfe Klingen sind gefährlicher als scharfe – für dich.'] },
  { id: 'ram', name: 'Hagen Eisenbug', job: 'Enterkämpfer', perk: '+10 % Angriff, deine Crew kämpft härter.', price: 650, rank: 4, col: '#7A3346', quote: 'Entern? Endlich!', role: 'tank', style: 'zweihaender', big: 1.18,
    skill: { n: 'Enterrausch', d: 'Stürmt vor und zieht Gegner auf sich.' },
    look: { skin: '#B9805A', outfit: 'jacke', outfitColor: '#7A3346', hair: 'kurz', hairColor: '#7A4A22', hat: 'helm', hatColor: '#8C8F96', beard: 'vollbart', body: 'kraeftig' },
    lines: ['Wann entern wir endlich?', 'Mein Helm hat schon drei Kanonenkugeln überlebt.', 'Mehr Feinde! Ich bin noch nicht warm!', 'Schlafen kann ich, wenn ich tot bin.'] },
  { id: 'lehrer', name: 'Meister Ilyas', job: 'Faji-Lehrer', perk: '+1 Faji-Punkt beim Anheuern, +20 % Faji-Regeneration.', price: 1500, rank: 4, col: '#B98CFF', quote: 'Faji folgt nicht dem Muskel, sondern dem Willen.', role: 'schaden', style: 'effekt',
    skill: { n: 'Geistlanze', d: 'Faji-Geschosse aus der Ferne.' },
    look: { skin: '#8D5A3B', outfit: 'tunika', outfitColor: '#4A2E6E', hair: 'glatze', hairColor: '#EDEDED', beard: 'vollbart', coat: 'lang', coatColor: '#F2EEE6' },
    lines: ['Atme. Der Wind atmet mit.', 'Faji ist überall – sogar in Kalles Pulver.', 'Geduld ist auch eine Waffe.', 'Dein Wille wird stärker. Ich spüre es.'] },
  { id: 'esra', name: 'Esra Windgarn', job: 'Segelmacherin', perk: 'Das Schiff segelt 10 % schneller.', price: 1200, rank: 4, col: '#7FB86A', quote: 'Jede Naht ein Versprechen an den Wind.', role: 'unterstuetzung', style: 'langklinge',
    skill: { n: 'Fadennetz', d: 'Verlangsamt Gegner um dich herum.' },
    look: { skin: '#F5D6BE', outfit: 'weste', outfitColor: '#7FB86A', hair: 'zopf', hairColor: '#D9B25A', hat: 'keiner', scarf: true },
    lines: ['Das Großsegel hat einen Riss. Ich hab ihn schon.', 'Hörst du, wie das Tuch singt?', 'Ein gutes Segel fängt sogar Hoffnung.', 'Nadel und Faden retten mehr Schiffe als Kanonen.'] },
  { id: 'bruno', name: 'Bruno Donnerrohr', job: 'Meisterkanonier', perk: '+20 % Kanonenschaden.', price: 1800, rank: 5, col: '#5A5A66', quote: 'Zielen ist was für Leute mit zu wenig Kanonen.', role: 'schaden', style: 'faust', big: 1.15,
    skill: { n: 'Donnerfaust', d: 'Schwere Schläge mit Druckwelle.' },
    look: { skin: '#B9805A', outfit: 'jacke', outfitColor: '#3A3A44', hair: 'kurz', hairColor: '#5A3A22', hat: 'muetze', hatColor: '#7A1F1A', beard: 'vollbart', body: 'kraeftig' },
    lines: ['Zielen? Wozu?', 'Kalle, das ist MEINE Kanone.', 'Ein Schuss, ein Treffer. Oder zwölf Schüsse, ein Treffer.', 'Riechst du das? Frisches Pulver.'] },
  { id: 'tomo', name: 'Big Tomo', job: 'Riese', perk: 'Kämpft mit zweieinhalbfacher Ausdauer an deiner Seite.', price: 2500, rank: 6, col: '#A8442A', quote: '… (Er nickt. Das reicht.)', role: 'tank', style: 'faust', big: 1.55,
    skill: { n: 'Bergsturz', d: 'Stampft, dass alle in der Nähe umfallen.' },
    look: { skin: '#C68A5E', outfit: 'tunika', outfitColor: '#A8442A', hair: 'glatze', beard: 'vollbart', hairColor: '#1E1A18', body: 'kraeftig' },
    lines: ['…', '*nickt*', '*trägt eine Kanone unter dem Arm*', 'Tomo … hungrig.'] },
];

export const CREW_BY_ID: Record<string, CrewDef> = Object.fromEntries(CREW.map((c) => [c.id, c]));

/** Landtrupp aus den angeheuerten: bis zu drei Kämpfer, Tanks und Heiler zuerst */
export function defaultParty(hired: string[]): string[] {
  const order: CrewRole[] = ['tank', 'heiler', 'schaden', 'unterstuetzung'];
  return hired.filter((id) => CREW_BY_ID[id] && !CREW_BY_ID[id].cat)
    .sort((a, b) => order.indexOf(CREW_BY_ID[a].role) - order.indexOf(CREW_BY_ID[b].role)).slice(0, 3);
}

export const CREW_ROLE_LABEL: Record<CrewRole, string> = { tank: 'Beschützer', heiler: 'Heiler', schaden: 'Angreifer', unterstuetzung: 'Unterstützer', keine: 'Maskottchen' };

/** Persönliche Aufträge der Crew (Auftraggeber = Crewmitglied, Gespräch im Crew-Menü) */
export const CREW_QUESTS: QuestDef[] = [
  { id: 'c_cat', title: 'Brömmels Beutezug', giver: 'cat', intro: 'Miau! (Brömmel kratzt an einer Schatzkarte. Er will Gold sehen.)', outro: '*Brömmel rollt sich zufrieden auf dem Goldhaufen zusammen.*',
    steps: [{ type: 'treasure', island: 'sonnenstrand', text: 'Grabe mit Brömmel am Sonnenstrand' }, { type: 'talk', npc: 'cat', text: 'Zeig Brömmel die Beute' }], reward: { gold: 150, xp: 80, fame: 10 } },
  { id: 'c_cook', title: 'Das Geheimrezept', giver: 'cook', intro: 'Für meine berühmte Sturmsuppe fehlen mir Muscheln von Muschelruh. Ohne die schmeckt sie nach Salzwasser!', outro: 'Riech mal! DAS ist eine Sturmsuppe. Ab heute heilt dich mein Essen noch besser.',
    steps: [{ type: 'goto', island: 'muschelruh', text: 'Sammle Muscheln auf Muschelruh' }, { type: 'talk', npc: 'cook', text: 'Bring die Muscheln zu Tante Rosmarin' }], reward: { gold: 100, xp: 120, fame: 10 } },
  { id: 'c_nav', title: 'Die alte Karte', giver: 'nav', intro: 'Meine Mutter hat eine Seekarte gezeichnet, die bis zum Weltrand reicht. Ein Stück liegt im Möwennest versteckt.', outro: 'Das ist ihre Handschrift … Danke. Mit dieser Karte finden wir jeden Weg.',
    steps: [{ type: 'treasure', island: 'moewennest', text: 'Finde das Kartenstück im Möwennest' }, { type: 'talk', npc: 'nav', text: 'Bring Mira das Kartenstück' }], reward: { gold: 200, xp: 150, fame: 15 } },
  { id: 'c_gun', title: 'Pulverprobe', giver: 'gun', intro: 'Ich hab eine neue Pulvermischung! Zum Testen brauche ich ein paar Ziele. Große Ziele. Mit Segeln.', outro: 'HA! Hast du gesehen, wie die Planken geflogen sind? Die Mischung bleibt!',
    steps: [{ type: 'sink', count: 3, text: 'Versenke 3 Schiffe mit Kalles Pulver' }, { type: 'talk', npc: 'gun', text: 'Erstatte Kalle Bericht' }], reward: { gold: 250, xp: 200, fame: 25 } },
  { id: 'c_carp', title: 'Holz vom Rabenriff', giver: 'carp', intro: 'Auf dem Rabenriff wächst Eisenholz. Das beste Holz der Bernsteinsee – aber die Halsabschneider dort lassen niemanden ran.', outro: 'Eisenholz! Daraus bau ich Planken, die halten selbst einer Breitseite stand.',
    steps: [{ type: 'clear', island: 'rabenriff', text: 'Vertreibe die Bande vom Rabenriff' }, { type: 'talk', npc: 'carp', text: 'Bring Jasper das Eisenholz' }], reward: { gold: 250, xp: 220, fame: 25 } },
  { id: 'c_look', title: 'Schwarzauges Rache', giver: 'look', intro: 'Den Kerl, der mir das Auge genommen hat, nennen sie „den Hauptmann der Bucht“. Ich will, dass er mich sieht – mit meinem einen Auge.', outro: 'Er hat mich erkannt. Und dann hat er nichts mehr gesehen. Danke, Kapitän.',
    steps: [{ type: 'clear', island: 'bernsteinbucht', text: 'Stelle den Hauptmann der Bucht' }, { type: 'talk', npc: 'look', text: 'Sprich mit Selma' }], reward: { gold: 300, xp: 300, fame: 40 } },
  { id: 'c_arzt', title: 'Heilkräuter', giver: 'arzt', intro: 'Auf Schiffbrüchigen-Flößen treiben oft Kräuter aus fernen Ländern. Rette ein paar Leute – und bring mir die Kräuter.', outro: 'Damit kann ich Wunden in Minuten schließen. Und die Geretteten danken es dir auch.',
    steps: [{ type: 'rescue', count: 2, text: 'Rette 2 Schiffbrüchige' }, { type: 'talk', npc: 'arzt', text: 'Bring Lina die Kräuter' }], reward: { gold: 200, xp: 200, fame: 30 } },
  { id: 'c_musik', title: 'Das Lied der Tiefe', giver: 'musik', intro: 'Ich brauche Inspiration! Echte Abenteuer! Kämpfe! Lass mich zusehen, wie du ein Schiff enterst – für mein neues Lied!', outro: '♪ Und der Kapitän sprang hinüber, die Klinge im Wind … ♪ Das wird ein Hit!',
    steps: [{ type: 'board', count: 2, text: 'Entere 2 Schiffe vor Pippos Augen' }, { type: 'talk', npc: 'musik', text: 'Hör dir Pippos Lied an' }], reward: { gold: 200, xp: 250, fame: 50 } },
  { id: 'c_helm', title: 'Der Sturm von damals', giver: 'helm', intro: 'Bei Sturmzahn habe ich vor zwanzig Jahren mein erstes Schiff verloren. Bring mich dahin. Ich muss das hinter mir lassen.', outro: 'Jetzt ist es vorbei. Danke, dass du mich mitgenommen hast. Das Ruder gehört dir – und mir.',
    steps: [{ type: 'goto', island: 'sturmzahn', text: 'Segle mit Ole nach Sturmzahn' }, { type: 'talk', npc: 'helm', text: 'Sprich mit Ole' }], reward: { gold: 250, xp: 250, fame: 30 } },
  { id: 'c_kiko', title: 'Perlen am Leuchtfeuer', giver: 'kiko', intro: 'Unter dem Leuchtfeuer liegt ein Wrack voller Perlen. Ich tauche, du gräbst den Rest aus dem Sand!', outro: 'Schau dir die an! So groß wie Kanonenkugeln. Fast.',
    steps: [{ type: 'treasure', island: 'leuchtfeuer', text: 'Grabe am Leuchtfeuer nach Perlen' }, { type: 'talk', npc: 'kiko', text: 'Zeig Kiko den Fund' }], reward: { gold: 400, xp: 200, fame: 20 } },
  { id: 'c_schmied', title: 'Erz für die Esse', giver: 'schmied', intro: 'Ich brauche Kampferfahrung – nicht meine, deine. Zeig mir, wie du kämpfst, dann schmiede ich dir etwas, das passt.', outro: 'Jetzt weiß ich, wie du schlägst. Deine Klinge wird ab heute noch besser in der Hand liegen.',
    steps: [{ type: 'kill', count: 15, text: 'Besiege 15 Gegner zu Fuß' }, { type: 'talk', npc: 'schmied', text: 'Lass Grete deine Klinge prüfen' }], reward: { gold: 300, xp: 300, fame: 30 } },
  { id: 'c_ram', title: 'Hagens Herausforderung', giver: 'ram', intro: 'Ein Hauptmann gilt erst etwas, wenn er einen anderen Hauptmann besiegt hat. Such dir einen!', outro: 'HA! Du bist echt. Ich folge dir überallhin – Hauptsache, es gibt was zu entern.',
    steps: [{ type: 'kill', kind: 'hauptmann', count: 1, text: 'Besiege einen Hauptmann' }, { type: 'talk', npc: 'ram', text: 'Prahle bei Hagen' }], reward: { gold: 300, xp: 350, fame: 50 } },
  { id: 'c_lehrer', title: 'Die Prüfung des Willens', giver: 'lehrer', intro: 'Faji wächst im Kampf gegen jene, die es ebenfalls beherrschen. Besiege drei Faji-Wirker, dann zeige ich dir einen neuen Weg.', outro: 'Dein Wille ist geschärft. Nimm diesen Funken Faji – er gehört jetzt dir.',
    steps: [{ type: 'kill', kind: 'fajiwirker', count: 3, text: 'Besiege 3 Faji-Wirker' }, { type: 'talk', npc: 'lehrer', text: 'Kehre zu Meister Ilyas zurück' }], reward: { gold: 200, xp: 400, fame: 40, sp: 2 } },
  { id: 'c_esra', title: 'Seide aus dem Süden', giver: 'esra', intro: 'Händler bringen Sturmseide in die Bernsteinsee – leider meist unter Piratenbewachung. Sichere mir eine Ladung!', outro: 'Sturmseide! Daraus nähe ich Segel, die sogar Gegenwind lieben.',
    steps: [{ type: 'board', count: 1, text: 'Entere ein Schiff und sichere die Seide' }, { type: 'talk', npc: 'esra', text: 'Bring Esra die Seide' }], reward: { gold: 300, xp: 250, fame: 30 } },
  { id: 'c_bruno', title: 'Kanonenduell', giver: 'bruno', intro: 'Kalle behauptet, er sei der bessere Kanonier. Versenke fünf Schiffe, und wir klären das ein für alle Mal.', outro: 'Fünf! Kalle schuldet mir einen Krug. Und dir gebe ich zwei.',
    steps: [{ type: 'sink', count: 5, text: 'Versenke 5 Schiffe für Bruno' }, { type: 'talk', npc: 'bruno', text: 'Melde dich bei Bruno' }], reward: { gold: 500, xp: 400, fame: 60 } },
  { id: 'c_tomo', title: 'Tomos Freund', giver: 'tomo', intro: '… Freund … Legende … (Tomo zeigt auf Sturmzahn und ballt die Faust.)', outro: '… *Tomo umarmt dich. Es knackt.* … Freund.',
    steps: [{ type: 'clear', island: 'sturmzahn', text: 'Besiege mit Tomo die Legende von Sturmzahn' }, { type: 'talk', npc: 'tomo', text: 'Sprich mit Tomo' }], reward: { gold: 600, xp: 500, fame: 80, sp: 1 } },
];
