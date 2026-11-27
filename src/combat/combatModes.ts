// Phase 4.93A – strikte Trennung der beiden Kampfmodi (rein, ohne three.js; getestet):
//
//   Modus A – am Steuerrad (reine Seeschlacht): Wirkung AUSSCHLIESSLICH auf Schiffe, Flotten, Forts und See-Bosse, bis 650 m.
//             Der Standard-Angriff (Linksklick) sind die Schiffs-Kanonen: Breitseite Backbord, Breitseite Steuerbord, Bugjagd.
//             Formen I – X (1 – 5, Umschalt + 1 – 5), Geistes-Faji (Umschalt + Q/R/T/G) und beide Ultimates (Stufe 60 und 101) wirken vom
//             Steuerrad aus über das Meer, im Maßstab der Schiffe, und rasten auf das mit Tab/Klick angewählte Gegnerschiff ein.
//   Modus B – zu Fuß (Insel, Enter-Deck, Wasserlauf): Wirkung AUSSCHLIESSLICH auf Gegner zu Fuß (Insel-Truppen, Land-Bosse, Enter-Crew an
//             Deck, gegnerische Spieler zu Fuß). An Schiffsrümpfen prallen Angriffe zu Fuß wirkungslos ab.
//
// Jede Schadensquelle der Spielfigur fragt `canImpact(mode, ziel)`; die Welt bestimmt den Modus mit `combatModeOf`.

export type CombatMode = 'helm' | 'foot';

/** Was getroffen werden kann */
export type ImpactTarget =
  /** See: einzelnes Schiff, Flotte (Flächenwirkung über mehreren Schiffen), Fort/Küstenbatterie, See-Boss (Leviathan, Weltboss-Schiff) */
  | 'ship' | 'fleet' | 'fort' | 'seaBoss'
  /** Fuß: Gegner zu Fuß, Land-Boss, Enter-Crew an Deck, Verband (Truppen), gegnerischer Spieler zu Fuß */
  | 'footEnemy' | 'landBoss' | 'boardingCrew' | 'troop' | 'footPlayer';

export const SEA_TARGETS: readonly ImpactTarget[] = ['ship', 'fleet', 'fort', 'seaBoss'];
export const FOOT_TARGETS: readonly ImpactTarget[] = ['footEnemy', 'landBoss', 'boardingCrew', 'troop', 'footPlayer'];
export const MODE_TARGETS: Readonly<Record<CombatMode, readonly ImpactTarget[]>> = { helm: SEA_TARGETS, foot: FOOT_TARGETS };

/** Reichweite aller Kräfte am Steuerrad (m) */
export const HELM_RANGE = 650;

export const MODE_LABEL: Readonly<Record<CombatMode, string>> = { helm: 'Am Steuerrad (Seeschlacht)', foot: 'Zu Fuß (Boden & Deck)' };

/** Darf eine Aktion dieses Modus dieses Ziel treffen? */
export function canImpact(mode: CombatMode, target: ImpactTarget): boolean {
  return MODE_TARGETS[mode].includes(target);
}

/** Schaden nach der Modus-Regel: 0, wenn das Ziel nicht zum Modus gehört */
export function modeDamage(mode: CombatMode, target: ImpactTarget, dmg: number): number {
  return canImpact(mode, target) ? dmg : 0;
}

/** Prallt ein Angriff dieses Modus an einem Schiffsrumpf ab (sichtbar: Funken und Druckring, keine Wirkung)? */
export function deflectsOffHull(mode: CombatMode): boolean { return mode === 'foot'; }

/**
 * Modus einer Aktion der Spielfigur: am Steuerrad, sobald sie segelt (`sail`) oder ein Wirken vom Steuerrad läuft (das Ultimate entfesselt
 * der Kapitän von der Bugreling aus – es bleibt ein Wirken vom Steuerrad); sonst zu Fuß.
 */
export function combatModeOf(s: { sailing: boolean; helmCast: boolean }): CombatMode {
  return s.sailing || s.helmCast ? 'helm' : 'foot';
}

/** Standard-Angriff (Linksklick) je Modus */
export type AutoAttack = 'cannons' | 'classCombo';
export function autoAttackOf(mode: CombatMode): AutoAttack { return mode === 'helm' ? 'cannons' : 'classCombo'; }

/** Geschütz-Stellung der Schiffs-Kanonen: Breitseite Backbord, Breitseite Steuerbord, Bugjagd (Jagdgeschütze im Bug) */
export type CannonStation = 'backbord' | 'steuerbord' | 'bugjagd';
export const CANNON_STATIONS: readonly CannonStation[] = ['backbord', 'steuerbord', 'bugjagd'];
export const CANNON_LABEL: Readonly<Record<CannonStation, string>> = { backbord: 'Breitseite Backbord', steuerbord: 'Breitseite Steuerbord', bugjagd: 'Bugjagd' };
/** halber Öffnungswinkel der Bugjagd (rad): liegt das Ziel so nah am Bug, feuern die Jagdgeschütze */
export const BOW_CHASE_CONE = 0.42;

/**
 * Welche Geschütze feuert der Linksklick am Steuerrad? Peilung zum Ziel relativ zum Kurs (rad; + = Backbord, wie die Seiten des
 * Seesystems: +1 links, −1 rechts): voraus im Kegel die Bugjagd, sonst die Breitseite der Seite, auf der das Ziel liegt. Ohne Ziel die
 * Bugjagd (der Schuss geht geradeaus – wie bisher der Linksklick am Steuer).
 */
export function cannonStationFor(bearing: number | null): CannonStation {
  if (bearing === null || !Number.isFinite(bearing)) return 'bugjagd';
  let b = bearing % (Math.PI * 2);
  if (b > Math.PI) b -= Math.PI * 2;
  if (b < -Math.PI) b += Math.PI * 2;
  if (Math.abs(b) <= BOW_CHASE_CONE) return 'bugjagd';
  return b > 0 ? 'backbord' : 'steuerbord';
}

/** Seite einer Geschütz-Stellung im Seesystem (+1 Backbord, −1 Steuerbord, 0 Bug) */
export function stationSide(st: CannonStation): number { return st === 'backbord' ? 1 : st === 'steuerbord' ? -1 : 0; }

/** Peilung (rad, + = Backbord) von einem Schiff mit Kurs `heading` (0 = +Z, vorn = (sin, cos)) zu einem Punkt */
export function bearingTo(x: number, z: number, heading: number, tx: number, tz: number): number {
  const b = Math.atan2(tx - x, tz - z) - heading;
  return Math.atan2(Math.sin(b), Math.cos(b));
}
