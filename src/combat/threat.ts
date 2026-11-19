// Bedrohungstabelle (Threat/Aggro) nach Art der Schlachtzüge: Hauptmänner und Endbosse wählen ihr Ziel nicht fest, sondern nach der
// Gefahr, die jeder Angreifer für sie darstellt. Schlüssel ist die `EntityId`: Spielfigur, Offiziere, Trupps und später Mitspieler
// laufen durch dieselbe Tabelle (keine Einzelspieler-Annahme). Reine Daten und Rechnung ohne three.js: testbar, JSON-tauglich.
//
// Regeln (wie im Vorbild):
// - Schaden erzeugt Bedrohung in Höhe des Schadens, Heilung die Hälfte der geheilten Menge (bei allen Gegnern im Kampf).
// - Wer das aktuelle Ziel ablösen will, braucht 110 % von dessen Bedrohung im Nahkampf, 130 % aus der Ferne.
// - Spott (Tank) zwingt das Ziel für kurze Zeit auf den Spötter und hebt ihn auf die höchste Bedrohung.
// - Die Bedrohung verblasst langsam, damit sich der Boss neu orientiert; Gefallene und Abgereiste fallen aus der Tabelle.
import type { EntityId } from '../sim/entityId';

export const THREAT = {
  /** Faktor, um ein Nahkampf-Ziel abzulösen (110 %) bzw. ein Fernkampf-Ziel (130 %) */
  meleeOvertake: 1.1,
  rangedOvertake: 1.3,
  /** Anteil der Heilung, der als Bedrohung zählt */
  healShare: 0.5,
  /** Verfall je Sekunde (Anteil) */
  decay: 0.02,
  /** Grundbedrohung durch bloße Nähe: je Sekunde, solange jemand im Umkreis steht */
  proximity: 3,
  proximityRange: 14,
  /** Spott: Dauer in Sekunden und Aufschlag über die Spitze */
  tauntDur: 3.2,
  tauntLead: 1.15,
  /** Einträge unter diesem Wert werden gestrichen */
  floor: 0.5,
};

export interface ThreatEntry { id: EntityId; value: number; ranged: boolean }

export class ThreatTable {
  private readonly map = new Map<EntityId, number>();
  private readonly ranged = new Set<EntityId>();
  private cur: EntityId | null = null;
  private tauntId: EntityId | null = null;
  private tauntT = 0;

  /** Das Ziel, das die Tabelle zuletzt gewählt hat (null = niemand) */
  get current(): EntityId | null { return this.cur; }
  get size() { return this.map.size; }
  get taunted() { return this.tauntT > 0 ? this.tauntId : null; }
  get(id: EntityId): number { return this.map.get(id) ?? 0; }
  has(id: EntityId): boolean { return this.map.has(id); }

  /** Schaden (oder anderer Angriff) erzeugt Bedrohung; `ranged` merkt sich, dass der Angreifer aus der Ferne wirkt */
  add(id: EntityId, amount: number, o: { ranged?: boolean } = {}): void {
    if (!(amount > 0) || !Number.isFinite(amount)) return;
    this.map.set(id, (this.map.get(id) ?? 0) + amount);
    if (o.ranged) this.ranged.add(id); else if (o.ranged === false) this.ranged.delete(id);
  }

  /** Heilung: halbe Bedrohung (Heiler ziehen so Aufmerksamkeit, aber weniger als Schadensausteiler) */
  addHeal(id: EntityId, healed: number): void { this.add(id, healed * THREAT.healShare); }

  /** Nähe: wer im Kampfbereich steht, kommt in die Tabelle (damit der Boss auch Ziele kennt, die noch nicht zugeschlagen haben) */
  touch(id: EntityId, dist: number, dt: number): void {
    if (dist > THREAT.proximityRange) return;
    this.add(id, THREAT.proximity * dt * (1 - dist / (THREAT.proximityRange * 1.4)));
  }

  /** Spott: der Spötter springt auf die Spitze (mit Aufschlag) und bleibt für `dur` Sekunden das Ziel */
  taunt(id: EntityId, dur: number = THREAT.tauntDur): void {
    let top = 0;
    for (const v of this.map.values()) if (v > top) top = v;
    this.map.set(id, Math.max(this.map.get(id) ?? 0, top * THREAT.tauntLead + 1));
    this.tauntId = id;
    this.tauntT = dur;
  }

  /** Aus der Tabelle streichen (gefallen, abgereist) */
  forget(id: EntityId): void {
    this.map.delete(id);
    this.ranged.delete(id);
    if (this.cur === id) this.cur = null;
    if (this.tauntId === id) { this.tauntId = null; this.tauntT = 0; }
  }

  clear(): void { this.map.clear(); this.ranged.clear(); this.cur = null; this.tauntId = null; this.tauntT = 0; }

  /** Zeit vorrücken: Spott läuft ab, Bedrohung verblasst */
  update(dt: number): void {
    if (this.tauntT > 0) { this.tauntT -= dt; if (this.tauntT <= 0) { this.tauntT = 0; this.tauntId = null; } }
    const k = Math.max(0, 1 - THREAT.decay * dt);
    for (const [id, v] of this.map) {
      const nv = v * k;
      if (nv < THREAT.floor) { this.map.delete(id); this.ranged.delete(id); if (this.cur === id) this.cur = null; } else this.map.set(id, nv);
    }
  }

  /** Rangfolge (höchste Bedrohung zuerst); `valid` filtert Gefallene und Unerreichbare */
  ranked(valid?: (id: EntityId) => boolean): ThreatEntry[] {
    const out: ThreatEntry[] = [];
    for (const [id, value] of this.map) if (!valid || valid(id)) out.push({ id, value, ranged: this.ranged.has(id) });
    return out.sort((a, b) => b.value - a.value);
  }

  /**
   * Ziel wählen: Spott zuerst, sonst der Angreifer mit der höchsten Bedrohung – das bisherige Ziel bleibt, bis jemand 110 % (Nahkampf)
   * bzw. 130 % (Fernkampf) seiner Bedrohung erreicht. Liefert null, wenn die Tabelle leer ist (der Aufrufer nimmt dann das nächste Ziel).
   */
  pick(valid: (id: EntityId) => boolean = () => true): EntityId | null {
    if (this.tauntT > 0 && this.tauntId && valid(this.tauntId)) { this.cur = this.tauntId; return this.cur; }
    let best: ThreatEntry | null = null;
    for (const [id, value] of this.map) {
      if (!valid(id)) continue;
      if (!best || value > best.value) best = { id, value, ranged: this.ranged.has(id) };
    }
    if (!best) { this.cur = null; return null; }
    const cur = this.cur && valid(this.cur) && this.map.has(this.cur) ? this.cur : null;
    if (!cur || cur === best.id) { this.cur = best.id; return this.cur; }
    const need = this.map.get(cur)! * (best.ranged ? THREAT.rangedOvertake : THREAT.meleeOvertake);
    if (best.value > need) this.cur = best.id;
    return this.cur;
  }

  /** Reiner Schnappschuss (JSON): Rangfolge für Anzeige, Prüfung und Server */
  toJSON(): { current: EntityId | null; entries: { id: EntityId; value: number; ranged: boolean }[] } {
    return { current: this.cur, entries: this.ranked().map((e) => ({ id: e.id, value: Math.round(e.value * 10) / 10, ranged: e.ranged })) };
  }
}
