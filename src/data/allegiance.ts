// Phase 4.7E – einmalige, dauerhafte Team-Wahl vor dem „Rat der Gesandten“: reine Daten und Regeln (JSON-tauglich, ohne three.js und DOM).
//
// Nach Kapitel 0 („Leinen los“) tritt der Kapitän im Ratssaal von Ankerglück vor die Gesandten der fünf Mächte und schwört genau EINER die Treue –
// einmalig und für immer. Ab dann gelten Kriegsschiffe, Hafenwachen, Trupps und Inseln dieses Teams als verbündet (kein Eigenbeschuss), seine
// Kriegsgegner als Feinde, die Live-Kriegs-Quests und die Hauptkampagne folgen dem Team. Ein Wechsel ist nicht vorgesehen (`canSwitch`), der
// Marine-Pfad ist als gesperrter Pfad vorbereitet und öffnet sich mit einem späteren Story-Update.
import { FACTIONS, type FactionId, type PowerId } from './factions';

/** Die fünf wählbaren Teams (die Mächte mit eigenem Kuchenstück) */
export const TEAM_IDS: readonly PowerId[] = ['england', 'niederlande', 'deutschland', 'frankreich', 'kurogane'];
export const isTeamId = (v: unknown): v is PowerId => typeof v === 'string' && (TEAM_IDS as readonly string[]).includes(v);

/** Der Hinweis im Bestätigungs-Dialog (wörtlich) */
export const PLEDGE_TEXT = 'Einmalige Entscheidung — Du verpflichtest dich dauerhaft diesem Team und kämpfst fortan an seiner Seite';

/** Ansehen beim eigenen Team nach dem Schwur (mindestens; Dienststatus, Hafenrabatte, friedliche Durchfahrt) */
export const PLEDGE_STANDING = 70;

/**
 * Pfade der Treue. Die fünf Mächte sind wählbar; die Marine ist vorbereitet, aber gesperrt – ein späteres großes Story-Update schaltet sie frei
 * (`locked` → false und eine eigene Kampagne), ohne dass sich am Spielstand etwas ändern muss.
 */
export interface AllegiancePath { id: FactionId; locked: boolean; lockText: string }
export const ALLEGIANCE_PATHS: readonly AllegiancePath[] = [
  ...TEAM_IDS.map((id) => ({ id, locked: false, lockText: '' })),
  { id: 'marine', locked: true, lockText: 'Der Marine-Pfad ist versiegelt – er öffnet sich mit einem späteren großen Story-Update.' },
];

/** Was die Gesandten über ihr Team sagen (Rat der Gesandten) */
export interface TeamPitch { envoy: string; motto: string; pitch: string; strengths: string }
export const TEAM_PITCH: Record<PowerId, TeamPitch> = {
  england: {
    envoy: 'Lady Margaret Fairhaven, Gesandte der Admiralität',
    motto: 'Die Krone hält die Wellen.',
    pitch: 'Die Royal Navy beherrscht den Nebelarchipel mit Sternfestungen aus Kalkstein und der diszipliniertesten Schlachtlinie der Meere. Wer für England segelt, segelt in der Linie – und die Linie bricht nicht.',
    strengths: 'Starke Linienschiffe · planvolle Großoffensiven · Meerengen und Festungen',
  },
  niederlande: {
    envoy: 'Mijnheer Cornelis Brouwer, Gesandter der Handelskompanie',
    motto: 'Wer den Handel hält, hält die Welt.',
    pitch: 'Die Kompanie regiert den Sturmgürtel mit Kontoren, Kränen und bauchigen Galeonen. Ihre Konvois tragen das Gold der Meere – und ihre Kanonen sorgen dafür, dass es ankommt.',
    strengths: 'Reiche Kasse · Handelspakte · gut geschützte Nachschub-Konvois',
  },
  deutschland: {
    envoy: 'Freiherr Ottokar von Steinbach, Gesandter der Preußischen Marine',
    motto: 'Eisen, Ordnung und Treue.',
    pitch: 'Aus den Granitbastionen der Nordwacht laufen schwere Eichenschiffe mit schwarz-weißen Segeln aus. Deutschland hält die Meerengen und erobert, was es braucht – Stück für Stück, Bastion um Bastion.',
    strengths: 'Schwere Rümpfe · Meerengen und Grenzfesten · zähe Garnisonen',
  },
  frankreich: {
    envoy: 'Comtesse Héloïse de Rocheclaire, Gesandte der Armada Royale',
    motto: 'Für den Ruhm der Sonnenkrone.',
    pitch: 'Weiß-goldene Schiffe unter königsblauen Lilienseiden: die Armada Royale segelt prunkvoll und kühn. Frankreich greift nach den großen Inseln – und nach dem Thron der Meere.',
    strengths: 'Kühne Angriffe auf Mega-Inseln · prächtige Flotten · Sonnenzitadellen',
  },
  kurogane: {
    envoy: 'Meisterin Shirakawa Yūgiri, Gesandte des Shōgunats',
    motto: 'Der Vulkan vergisst nicht.',
    pitch: 'Schwarzsegler aus dem Glutring, rote Laternen über Vulkanfels: Kurogane ist die dunkle Eigenmacht, die keinen Herrn kennt. Ihre Klingen fürchtet jede Flotte – und ihre Rache noch mehr.',
    strengths: 'Höchste Angriffslust · gefürchtete Klingen · schnelle Überfälle',
  },
};

export interface AllegianceStats {
  /** abgeschlossene Live-Kriegs-Quests mit eigenem Beitrag */
  quests: number;
  /** mit dem Team eroberte oder zurückeroberte Inseln */
  liberated: number;
  /** versenkte Kommandoschiffe der Gegner */
  flagships: number;
  /** abgewehrte Angriffe auf Inseln des Teams */
  defended: number;
  /** geleitete eigene bzw. versenkte feindliche Konvois */
  convoys: number;
}

/** Spielstand (seit Version 26): Treue und Fortschritt der Hauptkampagne */
export interface AllegianceSave {
  v: 1;
  /** gewähltes Team (null = der Rat wartet noch) */
  team: PowerId | null;
  /** Spielzeit des Schwurs (s), −1 = noch offen */
  pledgedAt: number;
  stats: AllegianceStats;
  /** Offener Horizont: das letzte Hauptkapitel ist erfüllt, die Unbekannten Äußeren Meere sind gesichtet */
  horizon: boolean;
}

export const emptyAllegianceStats = (): AllegianceStats => ({ quests: 0, liberated: 0, flagships: 0, defended: 0, convoys: 0 });
export const newAllegiance = (): AllegianceSave => ({ v: 1, team: null, pledgedAt: -1, stats: emptyAllegianceStats(), horizon: false });

/** Säubern beim Laden (fehlt das Feld: der Rat wartet noch; ein gewähltes Team bleibt für immer) */
export function cleanAllegiance(raw: unknown): AllegianceSave {
  const s = newAllegiance();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  if (isTeamId(r.team)) s.team = r.team;
  s.pledgedAt = s.team && typeof r.pledgedAt === 'number' && Number.isFinite(r.pledgedAt) ? Math.max(0, r.pledgedAt) : s.team ? 0 : -1;
  const st = r.stats && typeof r.stats === 'object' ? (r.stats as Record<string, unknown>) : {};
  for (const k of Object.keys(s.stats) as (keyof AllegianceStats)[]) {
    const v = st[k];
    s.stats[k] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1e6, Math.floor(v))) : 0;
  }
  s.horizon = r.horizon === true && !!s.team;
  return s;
}

/** Ein Teamwechsel ist nicht vorgesehen: die Wahl ist dauerhaft (spätere Story-Updates können eigene Wege öffnen, nie diese Regel) */
export const canSwitch = (s: AllegianceSave): boolean => s.team === null;

export type PledgeResult = { ok: true; team: PowerId } | { ok: false; reason: string };

/**
 * Den Schwur leisten: genau einmal und nur für eines der fünf Teams. Liefert einen deutschen Grund, wenn es nicht geht (schon gewählt,
 * gesperrter Pfad, unbekannt). Ändert nur den Treue-Stand – Ansehen, Bündnisse und Kampagne setzt das Spiel.
 */
export function pledge(s: AllegianceSave, team: string, playTime: number): PledgeResult {
  if (s.team) return { ok: false, reason: `Du hast ${FACTIONS[s.team].name} bereits die Treue geschworen – ein Wechsel ist nicht möglich.` };
  const path = ALLEGIANCE_PATHS.find((p) => p.id === team);
  if (!path) return { ok: false, reason: 'Diesen Gesandten gibt es im Rat nicht.' };
  if (path.locked || !isTeamId(team)) return { ok: false, reason: path.lockText || 'Dieser Pfad ist gesperrt.' };
  s.team = team;
  s.pledgedAt = Math.max(0, playTime);
  return { ok: true, team };
}

/** Lage eines Teams für den Rat (füllt das Spiel aus der Welt-Simulation) */
export interface TeamSituation { islands: number; megas: number; wars: string[]; allies: string[]; fleets: number }

/** Karte eines Gesandten im Rat (Anzeige) */
export interface CouncilCard {
  id: FactionId;
  name: string;
  epithet: string;
  color: string;
  locked: boolean;
  lockText: string;
  envoy: string;
  motto: string;
  pitch: string;
  strengths: string;
  situation: string;
}

/** Karten des Rats in fester Reihenfolge (fünf Teams, dann der gesperrte Marine-Pfad) */
export function councilCards(sit: (id: PowerId) => TeamSituation | null): CouncilCard[] {
  return ALLEGIANCE_PATHS.map((p) => {
    const f = FACTIONS[p.id];
    if (!isTeamId(p.id)) {
      return {
        id: p.id, name: f.name, epithet: f.epithet, color: f.color, locked: true, lockText: p.lockText, envoy: 'Ein leerer Stuhl mit dem Anker der Marine',
        motto: 'Ordnung über allen Meeren.', pitch: 'Die Marine schickt keinen Gesandten in diesen Rat. Ihr Weg ist versiegelt.', strengths: '', situation: '',
      };
    }
    const t = TEAM_PITCH[p.id];
    const s = sit(p.id);
    const parts: string[] = [];
    if (s) {
      parts.push(`${s.islands} Inseln${s.megas ? ` (${s.megas} Mega)` : ''}`);
      parts.push(s.wars.length ? `im Krieg mit ${s.wars.join(', ')}` : 'derzeit ohne Krieg');
      if (s.allies.length) parts.push(`verbündet mit ${s.allies.join(', ')}`);
      parts.push(`${s.fleets} Verbände auf See`);
    }
    return {
      id: p.id, name: f.name, epithet: f.epithet, color: f.color, locked: p.locked, lockText: p.lockText,
      envoy: t.envoy, motto: t.motto, pitch: t.pitch, strengths: t.strengths, situation: parts.join(' · '),
    };
  });
}
