/**
 * Kleiner Verhaltensbaum (Behavior Tree).
 * Der Baum wird einmal gebaut und von allen Figuren eines Typs geteilt; alles Veränderliche steht im
 * Agenten selbst (Tafel / Blackboard). Jeder Logikschritt wertet den Baum von der Wurzel neu aus –
 * so reagieren Gegner sofort, wenn sich die Lage ändert (z. B. Rückzug bei wenig Leben mitten in der Jagd).
 */
export const BT = { Success: 0, Failure: 1, Running: 2 } as const;
export type BT = (typeof BT)[keyof typeof BT];

export interface BtNode<A, C> {
  readonly name: string;
  tick(a: A, c: C): BT;
}

/** Erster Kindknoten, der nicht scheitert, gewinnt */
export function selector<A, C>(name: string, ...kids: BtNode<A, C>[]): BtNode<A, C> {
  return {
    name,
    tick(a, c) {
      for (const k of kids) {
        const r = k.tick(a, c);
        if (r !== BT.Failure) return r;
      }
      return BT.Failure;
    },
  };
}

/** Alle Kindknoten der Reihe nach; bricht beim ersten Scheitern ab */
export function sequence<A, C>(name: string, ...kids: BtNode<A, C>[]): BtNode<A, C> {
  return {
    name,
    tick(a, c) {
      for (const k of kids) {
        const r = k.tick(a, c);
        if (r !== BT.Success) return r;
      }
      return BT.Success;
    },
  };
}

/** Bedingung: Erfolg oder Scheitern, nie „läuft“ */
export function cond<A, C>(name: string, fn: (a: A, c: C) => boolean): BtNode<A, C> {
  return { name, tick: (a, c) => (fn(a, c) ? BT.Success : BT.Failure) };
}

/** Handlung: liefert ihren Zustand selbst */
export function action<A, C>(name: string, fn: (a: A, c: C) => BT): BtNode<A, C> {
  return { name, tick: fn };
}

/** Merkt sich, welcher Blattknoten zuletzt lief (für Anzeige und Tests) */
export function tracked<A extends { btLeaf: string }, C>(node: BtNode<A, C>): BtNode<A, C> {
  return {
    name: node.name,
    tick(a, c) {
      const r = node.tick(a, c);
      if (r !== BT.Failure) a.btLeaf = node.name;
      return r;
    },
  };
}
