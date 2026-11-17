// Eindeutige Kennungen für alles, was simuliert wird: Kämpfer (Spielfiguren, Gegner, Crew) und Schiffe.
// Keine Einzelspieler-Annahme im Code: wer eine Figur oder ein Schiff anspricht, tut es über seine `EntityId`, nicht über
// ein globales „Spieler“-Objekt. Ein Server kann später dieselben Kennungen vergeben (Ausweich- und Schadenspfade bleiben gleich).

/** Kennung einer Spielfigur, eines Gegners, einer Crew-Figur oder eines Schiffs: `<art>-<nummer>` */
export type EntityId = string;

export type EntityKind = 'foot' | 'enemy' | 'ally' | 'ship' | 'npc';

const counters = new Map<EntityKind, number>();

/** Neue Kennung vergeben (lokal fortlaufend; eine Mehrspieler-Instanz ersetzt diese Funktion durch die des Servers) */
export function mintEntityId(kind: EntityKind): EntityId {
  const n = (counters.get(kind) ?? 0) + 1;
  counters.set(kind, n);
  return `${kind}-${n}`;
}

/** Art einer Kennung (der Teil vor dem Bindestrich) */
export function entityKind(id: EntityId): string {
  const i = id.indexOf('-');
  return i < 0 ? id : id.slice(0, i);
}
