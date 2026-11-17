// Absichten (Intents): was eine Entität tun WILL, getrennt davon, wie es dargestellt wird. Ein Intent ist reine, serialisierbare
// Daten (nur Zahlen und Zeichenketten, keine three.js-Objekte) und trägt immer die `entityId` des Handelnden. Die Simulation
// (`combat/sweep.ts`, `naval/shipSim.ts`) wertet sie aus; das Rendering liest nur den Zustand. So läuft später jede weitere
// Spieler-Entität durch dieselbe Physik- und Schadens-Pipeline, ob sie lokal oder vom Server kommt.
import type { EntityId } from './entityId';

/** Art eines Vorwärts-Impulses */
export type DashKind = 'lunge' | 'roll' | 'knockback';

/**
 * Vorwärts-Impuls eines Kämpfers: Ausfallschritt eines Hiebs, Ausweichrolle oder Rückstoß.
 * Gilt für EIN Logikbild (die Simulation setzt ihn in Teilschritten von höchstens 0,15 m um).
 */
export interface DashIntent {
  type: 'dash';
  entityId: EntityId;
  kind: DashKind;
  /** Kennung der Aktion (z. B. Hieb-Nummer): wechselt sie, beginnt ein neuer Impuls und eine frühere Blockade ist aufgehoben */
  id: number;
  /** Richtung (Einheitsvektor in der Ebene) */
  dirX: number;
  dirZ: number;
  /** Tempo in m/s */
  speed: number;
}

/** Womit ein Segel auf See geflickt wird */
export type RepairMaterial = 'segeltuch' | 'planken' | 'hafen' | 'notsegel';

/** Segel (und Rumpf) auf See oder im Hafen ausbessern */
export interface SailRepairIntent {
  type: 'sailRepair';
  entityId: EntityId;
  shipId: EntityId;
  material: RepairMaterial;
}

/** Crew eines Schiffs aufstocken (Taverne, Hafen); `heads` = höchstens so viele Seeleute, `null` = bis zum Maximum */
export interface CrewRefillIntent {
  type: 'crewRefill';
  entityId: EntityId;
  shipId: EntityId;
  heads: number | null;
}

export type ShipIntent = SailRepairIntent | CrewRefillIntent;
