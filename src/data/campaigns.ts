// Phase 4.7E – die fünf Hauptkampagnen der Teams (Stufe 3 → 60+) mit offenem Horizont: reine Daten (JSON-tauglich, ohne three.js).
//
// Jedes Team hat eigene Kommandanten (Auftraggeber), einen Erzrivalen mit eigenen Admiralen (seine Kommandoschiffe tragen ihre Namen), einen
// Heimathafen für den Einstieg, die Hauptstadt und die Kaiserzitadelle des Rivalen im fünften Ring. Die sieben Kapitel sind Aufträge wie alle
// anderen (data/quests.ts, `team` = nur für dieses Team, `campaign` = Kapitelnummer) und verketten sich über `after`/`auto`. Kriegs-Schritte
// (`war`, `flagship`, `liberate`) hängen an der laufenden Welt-Simulation: Live-Kriegs-Quests, versenkte Kommandoschiffe, eroberte Inseln.
// Kapitel VII endet nicht im Abspann, sondern öffnet die „Unbekannten Äußeren Meere“ – die Kriege laufen weiter, künftige Kapitel und Raids
// schließen dort an (`OPEN_HORIZON`).
import type { PowerId } from './factions';
import type { QuestDef, QuestStep } from './quests';

/** Ein Kommandant einer Macht: Auftraggeber im eigenen Team, Gegner (Name des Kommandoschiffs) in fremden Kampagnen */
export interface Commander { id: string; name: string; short: string; title: string }

export const COMMANDERS: Record<PowerId, readonly Commander[]> = {
  england: [
    { id: 'en_ashcombe', name: 'Admiralin Eleanor Ashcombe', short: 'Ashcombe', title: 'Erste Seelordin der Royal Navy' },
    { id: 'en_whitlock', name: 'Kommodore Thomas Whitlock', short: 'Whitlock', title: 'Befehlshaber der Nebelflotte' },
  ],
  niederlande: [
    { id: 'nl_vandamme', name: 'Generaldirektor Pieter van Damme', short: 'Van Damme', title: 'Herr der Handelskompanie' },
    { id: 'nl_hoorn', name: 'Kapitänin Saskia Hoorn', short: 'Hoorn', title: 'Konvoi-Admiralin des Sturmgürtels' },
  ],
  deutschland: [
    { id: 'de_adlerstein', name: 'Großadmiral Hagen von Adlerstein', short: 'Von Adlerstein', title: 'Befehlshaber der Preußischen Marine' },
    { id: 'de_brandt', name: 'Kapitänleutnantin Wilhelmine Brandt', short: 'Brandt', title: 'Führerin der Nordwacht-Fregatten' },
  ],
  frankreich: [
    { id: 'fr_montclair', name: 'Admiral Lucien de Montclair', short: 'De Montclair', title: 'Großadmiral der Armada Royale' },
    { id: 'fr_duvernay', name: 'Kapitänin Élise Duvernay', short: 'Duvernay', title: 'Kommandantin der Lilienflotte' },
  ],
  kurogane: [
    { id: 'ku_akagane', name: 'Großadmiral Ren Akagane', short: 'Akagane', title: 'Schwert des Shōgunats zur See' },
    { id: 'ku_tsuyu', name: 'Kapitänin Hisame Tsuyu', short: 'Tsuyu', title: 'Führerin der Schwarzsegler' },
  ],
};

export const COMMANDER_BY_ID: Record<string, Commander & { nation: PowerId }> = Object.fromEntries(
  (Object.keys(COMMANDERS) as PowerId[]).flatMap((n) => COMMANDERS[n].map((c) => [c.id, { ...c, nation: n }])),
);

/** Name des Kommandoschiffs einer Armada (deterministisch aus der Kennung): „Kommandoschiff von Admiralin Ashcombe“ */
export function flagshipName(nation: string, armadaId: string): string | null {
  const list = COMMANDERS[nation as PowerId];
  if (!list?.length) return null;
  let h = 0;
  for (let i = 0; i < armadaId.length; i++) h = (h * 31 + armadaId.charCodeAt(i)) >>> 0;
  return `Kommandoschiff von ${list[h % list.length].name}`;
}

export interface CampaignDef {
  team: PowerId;
  /** Titel der Kampagne */
  title: string;
  /** Erzrivale (sein Kaiser ist das Ziel von Kapitel VI) */
  rival: PowerId;
  /** Heimathafen für Kapitel I (nächster Hafen des Teams bei Ankerglück) und Hauptstadt (Kapitel III) */
  hub: { id: string; name: string };
  capital: { id: string; name: string };
  /** Kaiserzitadelle des Rivalen (Insel-Kennung = Kaiser-Kennung) und ihr Kaiser */
  kaiser: { id: string; name: string; boss: string };
}

/** Namen und Adjektive der Mächte für die Texte (ohne Abhängigkeit von den großen Datenmodulen) */
const NAME: Record<PowerId, { name: string; gen: string; adj: string; pl: boolean }> = {
  england: { name: 'England', gen: 'Englands', adj: 'englische', pl: false },
  niederlande: { name: 'die Niederlande', gen: 'der Niederlande', adj: 'niederländische', pl: true },
  deutschland: { name: 'Deutschland', gen: 'Deutschlands', adj: 'deutsche', pl: false },
  frankreich: { name: 'Frankreich', gen: 'Frankreichs', adj: 'französische', pl: false },
  kurogane: { name: 'Kurogane', gen: 'Kuroganes', adj: 'kuroganische', pl: false },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Die fünf Kampagnen (Erzrivalen nach den alten Feindschaften aus data/nations.ts `START_RELATIONS`) */
export const CAMPAIGNS: Record<PowerId, CampaignDef> = {
  england: {
    team: 'england', title: 'Die Krone der Wellen', rival: 'frankreich',
    hub: { id: 'nebelhafen', name: 'Nebelhafen' }, capital: { id: 'albion', name: 'Albion' },
    kaiser: { id: 'solis', name: 'Palais Impérial Solis', boss: 'Sonnenkaiser Aurélien de Solis' },
  },
  niederlande: {
    team: 'niederlande', title: 'Gold und Pulver', rival: 'kurogane',
    hub: { id: 'donnerbucht', name: 'Donnerbucht' }, capital: { id: 'oranjehaven', name: 'Oranjehaven' },
    kaiser: { id: 'tenkoku', name: 'Shogunats-Zitadelle Tenkoku', boss: 'Shōgun Kurenai Tenkoku' },
  },
  deutschland: {
    team: 'deutschland', title: 'Eiserne Treue', rival: 'kurogane',
    hub: { id: 'kiefernhafen', name: 'Kiefernhafen' }, capital: { id: 'adlerstein', name: 'Adlerstein' },
    kaiser: { id: 'tenkoku', name: 'Shogunats-Zitadelle Tenkoku', boss: 'Shōgun Kurenai Tenkoku' },
  },
  frankreich: {
    team: 'frankreich', title: 'Die Sonne über den Meeren', rival: 'england',
    hub: { id: 'letzterhafen', name: 'Letzter Hafen' }, capital: { id: 'soleilmont', name: 'Soleilmont' },
    kaiser: { id: 'britannia', name: 'Kaiserzitadelle Britannia', boss: 'Seekaiser Edmund Ravenscourt' },
  },
  kurogane: {
    team: 'kurogane', title: 'Glut und Klinge', rival: 'deutschland',
    hub: { id: 'glutheim', name: 'Glutheim' }, capital: { id: 'yamikura', name: 'Yamikura' },
    kaiser: { id: 'kaiserdom', name: 'Eiserner Kaiserdom', boss: 'Eiserner Kaiser Konrad von Hohenwacht' },
  },
};

/** Offener Horizont: so weit (m vom Weltzentrum) muss man hinaus, um die Unbekannten Äußeren Meere zu sichten */
export const OPEN_HORIZON = {
  dist: 15000,
  title: 'Die Unbekannten Äußeren Meere',
  text: 'Jenseits der Sturmmauer liegen Meere ohne Karte. Die Kriege der fünf Mächte laufen weiter – neue Kapitel, Inseln und Raids folgen in künftigen Updates.',
} as const;

/** Stufen-Schranken der sieben Kapitel (Stufe 3 nach der Einführung bis 60+) */
export const CHAPTER_LEVELS: readonly number[] = [3, 10, 20, 30, 40, 52, 60];
export const CAMPAIGN_CHAPTERS = 7;
export const chapterId = (team: string, n: number): string => `c_${team}_${n}`;

/** Sieben Kapitel einer Kampagne als Aufträge (Texte mit den Namen des Teams, seiner Kommandanten und des Rivalen) */
export function campaignQuests(c: CampaignDef): QuestDef[] {
  const T = NAME[c.team], R = NAME[c.rival];
  const [A, B] = COMMANDERS[c.team];
  const [RA, RB] = COMMANDERS[c.rival];
  const step = (s: QuestStep) => s;
  const q = (n: number, title: string, giver: Commander, intro: string, outro: string, steps: QuestStep[], reward: QuestDef['reward']): QuestDef => ({
    id: chapterId(c.team, n), title: `Kapitel ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][n - 1]}: ${title}`, giver: giver.id, main: true, team: c.team, campaign: n,
    auto: true, after: n === 1 ? 'rat' : chapterId(c.team, n - 1), noOffer: true, intro, outro, steps, reward,
  });
  return [
    q(1, 'Unter neuer Flagge', A,
      `${A.name} erwartet dich in ${c.hub.name}: „Ein Schwur ist ein Anfang, Kapitän – kein Verdienst. Zeig mir, dass ${T.name} sich auf dich verlassen ${T.pl ? 'können' : 'kann'}.“`,
      `„Gut gefochten.“ ${A.short} heftet dir das Abzeichen der Flotte an. „${cap(T.name)} ${T.pl ? 'vergessen ihre' : 'vergisst seine'} Kapitäne nicht.“`,
      [
        step({ type: 'goto', island: c.hub.id, text: `Segle nach ${c.hub.name} und melde dich bei ${A.short}` }),
        step({ type: 'sink', count: 2, text: 'Versenke 2 feindliche Schiffe' }),
        step({ type: 'war', count: 1, text: `Kämpfe in einem Live-Kriegs-Einsatz für ${T.name} (Funkspruch und Kompass-Marker)` }),
      ],
      { gold: 500, xp: 600, fame: 60, sp: 1 }),
    q(2, 'Pulverdampf an der Grenze', B,
      `Späher melden ${R.adj} Kommandoschiffe an unseren Grenzen. ${B.name}: „Ohne Kopf keine Flotte. Hol mir ein Flaggschiff – und halte unsere Seewege offen.“`,
      `Das Flaggschiff sinkt, die Grenzflotte zerstreut sich. In ${c.capital.name} spricht man zum ersten Mal deinen Namen.`,
      [
        step({ type: 'level', level: CHAPTER_LEVELS[1], text: `Erreiche Stufe ${CHAPTER_LEVELS[1]}` }),
        step({ type: 'flagship', count: 1, text: 'Versenke ein feindliches Kommandoschiff (Tab erfasst das Flaggschiff)' }),
        step({ type: 'war', count: 2, text: 'Bestehe 2 Live-Kriegs-Einsätze deines Teams' }),
      ],
      { gold: 1200, xp: 1600, fame: 140, sp: 2 }),
    q(3, `Audienz in ${c.capital.name}`, A,
      `${A.name} ruft dich in die Hauptstadt ${c.capital.name}. Der Krieg gegen ${R.name} ist kein Scharmützel mehr – er entscheidet, wem die Meere gehören.`,
      `Im Saal der Admiralität hängt eine neue Karte. Dein Kurs ist darauf eingezeichnet – mitten durch ${R.adj} Gewässer.`,
      [
        step({ type: 'level', level: CHAPTER_LEVELS[2], text: `Erreiche Stufe ${CHAPTER_LEVELS[2]}` }),
        step({ type: 'goto', island: c.capital.id, text: `Segle nach ${c.capital.name} – die Admiralität erwartet dich` }),
        step({ type: 'war', count: 2, text: 'Schütze Konvois oder Inseln deines Teams in 2 Live-Kriegs-Einsätzen' }),
        step({ type: 'board', count: 1, text: 'Entere ein feindliches Schiff' }),
      ],
      { gold: 2200, xp: 3200, fame: 260, sp: 2 }),
    q(4, 'Befreite Küsten', B,
      `${B.name}: „${cap(R.adj)} Garnisonen halten Inseln, die uns gehören sollten. Wir holen sie – Insel für Insel. Und du gehst voran.“`,
      `Die Flagge ${T.gen} weht über einer befreiten Küste. Die Fischer bringen dir Brot und Salz.`,
      [
        step({ type: 'level', level: CHAPTER_LEVELS[3], text: `Erreiche Stufe ${CHAPTER_LEVELS[3]}` }),
        step({ type: 'liberate', count: 1, text: 'Erobere mit deinem Team eine Insel (Invasion oder Gegenangriff)' }),
        step({ type: 'flagship', count: 2, text: 'Versenke 2 feindliche Kommandoschiffe' }),
      ],
      { gold: 3200, xp: 5200, fame: 420, sp: 3 }),
    q(5, `Die Jagd auf ${RA.short}`, A,
      `${RA.name}, ${RA.title}, führt die ${R.adj}n Großangriffe selbst, und ${RB.name} sichert den Nachschub. ${A.short}: „Solange die beiden segeln, findet dieser Krieg kein Ende.“`,
      `Das Kommandoschiff von ${RA.short} brennt bis zur Wasserlinie, ${RB.short}s Konvois treiben führerlos. ${cap(R.name)} ${R.pl ? 'wanken' : 'wankt'} – die Kaiserzitadelle liegt offen.`,
      [
        step({ type: 'level', level: CHAPTER_LEVELS[4], text: `Erreiche Stufe ${CHAPTER_LEVELS[4]}` }),
        step({ type: 'war', count: 3, text: 'Bestehe 3 Live-Kriegs-Einsätze an der Front' }),
        step({ type: 'flagship', count: 2, text: `Versenke 2 Kommandoschiffe – eines führt ${RA.short}` }),
        step({ type: 'liberate', count: 1, text: 'Befreie mit deinem Team eine weitere Insel' }),
      ],
      { gold: 4600, xp: 8000, fame: 650, sp: 3 }),
    q(6, `Sturm auf ${c.kaiser.name}`, A,
      `Hinter dem fünften Ring thront ${c.kaiser.boss} in ${c.kaiser.name}. „Fällt der Kaiser, ${R.pl ? 'fallen' : 'fällt'} ${R.name}“, sagt ${A.short}. „Wir brechen die Seesperre – du trägst den Kampf in den Thronsaal.“`,
      `${c.kaiser.boss} sinkt auf die Knie. Über ${c.kaiser.name} weht für einen Herzschlag die Flagge ${T.gen} – und die Meere halten den Atem an.`,
      [
        step({ type: 'level', level: CHAPTER_LEVELS[5], text: `Erreiche Stufe ${CHAPTER_LEVELS[5]}` }),
        step({ type: 'goto', island: c.kaiser.id, text: `Segle zur ${c.kaiser.name} im fünften Ring` }),
        step({ type: 'kaiser', kaiser: c.kaiser.id, text: `Besiege ${c.kaiser.boss}` }),
      ],
      { gold: 7000, xp: 12000, fame: 1000, sp: 4 }),
    q(7, 'Über den Horizont', A,
      `Mit dem Fall des Kaisers endet der Krieg nicht – er wird größer. Jenseits der Sturmmauer liegen die Unbekannten Äußeren Meere. ${A.short}: „Niemand weiß, was dort wartet. Finde es heraus.“`,
      `Der Sturm reißt für einen Herzschlag auf. Dahinter: Meere ohne Karte, Inseln ohne Namen, Lichter, die keiner Macht gehören. Die Geschichte ${T.gen} ist nicht zu Ende – sie beginnt erst.`,
      [
        step({ type: 'level', level: CHAPTER_LEVELS[6], text: `Erreiche Stufe ${CHAPTER_LEVELS[6]}` }),
        step({ type: 'horizon', dist: OPEN_HORIZON.dist, text: 'Segle an die Sturmmauer am Rand der Welt und sichte die Unbekannten Äußeren Meere' }),
      ],
      { gold: 9000, xp: 15000, fame: 1400, sp: 5 }),
  ];
}

/** Alle Kapitel aller fünf Kampagnen */
export const CAMPAIGN_QUESTS: QuestDef[] = (Object.keys(CAMPAIGNS) as PowerId[]).flatMap((t) => campaignQuests(CAMPAIGNS[t]));
