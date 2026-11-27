// Phase 4.8A – Rechtsklick-Spielermenü und Betrachten (rein: kein DOM). Das Menü öffnet sich auf einem Mitspieler in der 3D-Welt, auf seinem
// Schiff, auf seinem Zielfenster, auf seinem Namen im Chat oder auf seinem Gruppenfenster; auf dem eigenen Charakter bzw. Gruppenkopf gibt es
// „Gruppe verlassen“. Ob „In Gruppe einladen“ geht, entscheidet die Diplomatie der Welt-KI (`partyRules.groupAllowed`), die Gruppengröße und
// wer anführt. Die Oberfläche (`ui/playerMenuUi.ts`) zeigt die Einträge nur an.
import { MMO, type InspectInfo } from '../net/mmoProtocol';
import { STANCE_LABEL, STANCE_TONE, groupAllowed, type PartyStance } from '../net/partyRules';
import { TIER_DEFS, type Tier } from '../data/balanceConfig';
import { SHIP_CLASSES } from '../data/ships';

export type PlayerMenuAction = 'invite' | 'whisper' | 'inspect' | 'target' | 'ride' | 'promote' | 'kick' | 'leave' | 'unride';

export interface PlayerMenuItem {
  id: PlayerMenuAction;
  label: string;
  enabled: boolean;
  /** kleine Zeile unter dem Eintrag (Diplomatie, Grund der Sperre) */
  hint: string;
  danger: boolean;
}

export interface PlayerMenuCtx {
  /** Menü auf dem eigenen Charakter bzw. dem eigenen Gruppenkopf */
  self: boolean;
  targetName: string;
  /** Haltung zwischen den Teams (Welt-KI) */
  stance: PartyStance;
  /** Größe der eigenen Gruppe (0 = keine) und ob man sie anführt */
  partySize: number;
  leader: boolean;
  /** Ziel ist in der eigenen Gruppe */
  member: boolean;
  /** Ziel lässt sich anvisieren (in Reichweite) */
  canTarget: boolean;
  /** Ziel ist der Anführer, sein Schiff liegt in Mitfahr-Reichweite */
  rideable: boolean;
  /** man fährt gerade bei jemandem mit */
  riding: boolean;
}

const item = (id: PlayerMenuAction, label: string, enabled: boolean, hint = '', danger = false): PlayerMenuItem => ({ id, label, enabled, hint, danger });

/** Einträge des Menüs (Reihenfolge wie angezeigt) */
export function buildPlayerMenu(c: PlayerMenuCtx): PlayerMenuItem[] {
  const out: PlayerMenuItem[] = [];
  if (c.self) {
    out.push(item('leave', 'Gruppe verlassen', c.partySize > 0, c.partySize > 0 ? `Gruppe ${c.partySize}/${MMO.partyMax}` : 'Du bist in keiner Gruppe', true));
    if (c.riding) out.push(item('unride', 'Zurück an Bord deines Schiffs', true));
    return out;
  }
  const diplo = `Diplomatie: ${STANCE_LABEL[c.stance]}`;
  if (c.member) out.push(item('invite', 'In Gruppe einladen', false, 'Schon in deiner Gruppe'));
  else if (!groupAllowed(c.stance)) out.push(item('invite', 'In Gruppe einladen — Gesperrt (Kriegszustand)', false, diplo));
  else if (c.partySize >= MMO.partyMax) out.push(item('invite', 'In Gruppe einladen', false, `Gruppe voll (${MMO.partyMax}/${MMO.partyMax})`));
  else if (c.partySize > 0 && !c.leader) out.push(item('invite', 'In Gruppe einladen', false, 'Nur der Anführer lädt ein'));
  else out.push(item('invite', 'In Gruppe einladen', true, diplo));
  out.push(item('whisper', 'Flüstern', true));
  out.push(item('inspect', 'Betrachten', true));
  out.push(item('target', 'Anvisieren', c.canTarget, c.canTarget ? '' : 'Außer Reichweite'));
  if (c.member && c.rideable && !c.riding) out.push(item('ride', 'An Bord gehen (mitfahren)', true, 'Auf dem Schiff des Anführers'));
  if (c.member && c.leader) {
    out.push(item('promote', 'Zum Anführer ernennen', true));
    out.push(item('kick', 'Aus Gruppe entfernen', true, '', true));
  }
  return out;
}

/** Anzeige des Betrachten-Fensters */
export interface InspectView {
  name: string;
  levelText: string;
  classText: string;
  roleTag: string;
  teamName: string;
  teamColor: string;
  stanceText: string;
  stanceTone: 'friendly' | 'neutral' | 'hostile';
  gearText: string;
  shipText: string;
  whereText: string;
  partyText: string;
}

const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);

/** Betrachten: Name, Stufe, Klasse & Rolle, Team-Wappen, Diplomatie, Ausrüstungs- und Schiffs-Stufe */
export function inspectView(info: InspectInfo, nation: (team: string) => { name: string; color: string }): InspectView {
  const p = info.profile;
  const n = p.team ? nation(p.team) : { name: 'Ungebunden', color: '#9AA3AE' };
  const tier = Math.max(1, Math.min(5, Math.round(p.gearTier))) as Tier;
  const cls = SHIP_CLASSES[Math.max(0, Math.min(SHIP_CLASSES.length - 1, p.shipTier))];
  return {
    name: p.name,
    levelText: `Stufe ${p.level}`,
    classText: p.classLabel || 'Klasse noch offen',
    roleTag: p.role || '—',
    teamName: p.team ? `Team ${n.name}` : 'Ungebunden (vor dem Rat der Gesandten)',
    teamColor: n.color,
    stanceText: info.party ? 'In deiner Gruppe' : `Diplomatie: ${STANCE_LABEL[info.stance]}`,
    stanceTone: info.party ? 'friendly' : STANCE_TONE[info.stance],
    gearText: `Ausrüstung: Stufe ${tier} · ${TIER_DEFS[tier].name}`,
    shipText: `Schiff: ${p.shipName || cls.n} · Klasse ${p.shipTier + 1}`,
    whereText: info.zone ? `${info.zone} · ${fmtDist(info.dist)} entfernt` : `${fmtDist(info.dist)} entfernt`,
    partyText: info.party ? 'Gruppenmitglied' : '',
  };
}
