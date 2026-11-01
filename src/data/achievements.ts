// Erfolge: werden regelmäßig geprüft und im Spielstand (progress.flags) vermerkt.
import type { SaveData } from '../core/save/types';
import { REGIONS } from './regions';

export interface AchievementDef {
  id: string;
  n: string;
  d: string;
  /** Belohnung */
  gold: number;
  fame: number;
  check(s: SaveData): boolean;
  /** Fortschritt 0 … 1 für die Anzeige */
  prog?(s: SaveData): number;
}

const num = (s: SaveData, k: string) => Number(s.progress.flags[k] ?? 0);
const A = (id: string, n: string, d: string, gold: number, fame: number, value: (s: SaveData) => number, goal: number): AchievementDef =>
  ({ id, n, d, gold, fame, check: (s) => value(s) >= goal, prog: (s) => Math.min(1, value(s) / goal) });

export const ACHIEVEMENTS: AchievementDef[] = [
  A('k10', 'Erste Schrammen', 'Besiege 10 Gegner zu Fuß.', 50, 5, (s) => s.progress.stats.kills, 10),
  A('k100', 'Klingentänzer', 'Besiege 100 Gegner zu Fuß.', 300, 30, (s) => s.progress.stats.kills, 100),
  A('k500', 'Schrecken der Lager', 'Besiege 500 Gegner zu Fuß.', 1500, 100, (s) => s.progress.stats.kills, 500),
  A('s5', 'Kanonenfutter', 'Versenke 5 Schiffe.', 100, 10, (s) => s.progress.stats.sunk, 5),
  A('s25', 'Breitseitenkönig', 'Versenke 25 Schiffe.', 600, 50, (s) => s.progress.stats.sunk, 25),
  A('s100', 'Herr der Tiefe', 'Versenke 100 Schiffe.', 2500, 150, (s) => s.progress.stats.sunk, 100),
  A('b1', 'Enterhaken!', 'Entere dein erstes Schiff.', 100, 10, (s) => s.progress.stats.boarded, 1),
  A('b10', 'Deckstürmer', 'Entere 10 Schiffe.', 600, 50, (s) => s.progress.stats.boarded, 10),
  A('t1', 'X markiert die Stelle', 'Grabe deinen ersten Schatz aus.', 80, 5, (s) => s.progress.stats.treasures, 1),
  A('t10', 'Schatzjäger', 'Grabe 10 Schätze aus.', 800, 60, (s) => s.progress.stats.treasures, 10),
  A('r5', 'Rettungsanker', 'Rette 5 Schiffbrüchige.', 300, 40, (s) => s.progress.stats.rescued, 5),
  A('l1', 'Legendenjäger', 'Besiege eine Legende der Rangliste.', 300, 30, (s) => s.legends.length, 1),
  A('l5', 'Gefürchtet', 'Besiege 5 Legenden.', 1500, 100, (s) => s.legends.length, 5),
  A('l10', 'Lebende Legende', 'Besiege 10 Legenden.', 4000, 250, (s) => s.legends.length, 10),
  A('c1', 'Nicht mehr allein', 'Heuere dein erstes Crewmitglied an.', 50, 5, (s) => s.crew.hired.length, 1),
  A('c8', 'Volle Mannschaft', 'Heuere 8 Crewmitglieder an.', 800, 60, (s) => s.crew.hired.length, 8),
  A('c16', 'Die beste Crew der Meere', 'Heuere alle 16 Crewmitglieder an.', 3000, 200, (s) => s.crew.hired.length, 16),
  A('loyal', 'Bis ans Ende der Welt', 'Gewinne die volle Treue eines Crewmitglieds.', 500, 40, (s) => Object.values(s.crew.loyalty).filter((v) => v >= 100).length, 1),
  A('reg', 'Weltumsegler', 'Besuche alle sechs Meere.', 1500, 120, (s) => REGIONS.filter((r) => s.progress.flags[`region_${r.id}`]).length, REGIONS.length),
  A('lv10', 'Seebär', 'Erreiche Stufe 10.', 300, 0, (s) => s.player.level, 10),
  A('lv20', 'Sturmerprobt', 'Erreiche Stufe 20.', 1000, 0, (s) => s.player.level, 20),
  A('lv30', 'Unvergessen', 'Erreiche Stufe 30.', 3000, 0, (s) => s.player.level, 30),
  A('gold', 'Goldene Kiste', 'Besitze 10.000 Gold auf einmal.', 0, 50, (s) => s.player.gold, 10000),
  A('ship', 'Leviathan', 'Befehlige einen Leviathan.', 0, 200, (s) => (s.ship.owned.includes(6) ? 1 : 0), 1),
  A('up', 'Werftliebling', 'Baue Kanonen, Rumpf und Segel voll aus.', 1000, 80, (s) => s.ship.up.can + s.ship.up.hull + s.ship.up.sail, 15),
  A('aw', 'Erwacht', 'Lass einen Faji-Zweig erwachen.', 500, 50, (s) => s.skills.awakened.length, 1),
  A('aw4', 'Meister aller Wege', 'Lass alle vier Faji-Zweige erwachen.', 3000, 200, (s) => s.skills.awakened.length, 4),
  A('fish', 'Petri Heil', 'Fange 20 Fische.', 300, 20, (s) => num(s, 'fish'), 20),
  A('dice', 'Glückspilz', 'Gewinne 10-mal beim Würfeln.', 300, 10, (s) => num(s, 'dicewins'), 10),
  A('k3', 'Durch den Nebel', 'Schließe Kapitel 3 ab.', 500, 50, (s) => (s.progress.done.includes('k3') ? 1 : 0), 1),
  A('krone', 'Die Sturmkrone', 'Schließe die Hauptgeschichte ab.', 5000, 500, (s) => (s.progress.flags.krone ? 1 : 0), 1),
  A('rev', 'Keine zweite Chance', 'Gewinne eine Revanche gegen eine Legende.', 800, 60, (s) => Object.keys(s.progress.flags).filter((k) => k.startsWith('rev_')).length, 1),
];
