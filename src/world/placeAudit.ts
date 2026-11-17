import { Box3, type Object3D } from 'three';

/**
 * Prüfung der Bodenhaftung beim Aufbau der Welt (nur Entwicklung, `import.meta.env.DEV`): jedes aufgestellte Objekt meldet seine
 * Bounding-Box und den Boden unter seinem Fuß. Der Fußabdruck wird im Objektraum gemessen (gedrehtes Rechteck, nicht die Weltbox) und in
 * einem Raster von 5 × 5 Punkten abgetastet. Gemeldet wird, was schwebt (Unterkante mehr als `FLOAT` m über dem tiefsten Boden darunter)
 * oder wo der Boden unter dem Fuß um mehr als `SLOPE` m schwankt (Hang: eine Seite versinkt oder schwebt).
 * Abfrage in der Konsole: `__placeAudit` (Liste) oder `__placeAuditSummary()`.
 */
export interface PlaceRow { island: string; kind: string; x: number; z: number; w: number; d: number; low: number; range: number; float: number; sink: number }

const FLOAT = 0.12;
const SLOPE = 0.3;
const _b = new Box3();

type Hook = ((island: string, kind: string, obj: Object3D, hAt: (x: number, z: number) => number) => void) | null;

/** Ein Objekt prüfen. Das Objekt muss seine endgültige Lage haben und noch ohne Eltern sein (Koordinaten = Inselkoordinaten). */
export const auditPlacement: Hook = import.meta.env.DEV ? (island, kind, obj, hAt) => {
  // Box im Objektraum: Drehung kurz auf 0 (die Bounding-Box dreht sonst mit und wird zur Weltbox mit Ecken weit neben dem Fuß)
  const yaw = obj.rotation.y;
  obj.rotation.y = 0;
  obj.updateMatrixWorld(true);
  _b.setFromObject(obj);
  obj.rotation.y = yaw;
  obj.updateMatrixWorld(true);
  if (_b.isEmpty()) return;
  const px = obj.position.x, pz = obj.position.z;
  const w = _b.max.x - _b.min.x, d = _b.max.z - _b.min.z;
  if (w > 60 || d > 60) return;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let lo = Infinity, hi = -Infinity;
  const N = Math.min(9, Math.max(5, Math.ceil(Math.max(w, d) / 2)));
  for (let i = 0; i < N; i++) for (let j = 0; j < 5; j++) {
    // lokaler Punkt (u, v) im Fußabdruck, gedreht um yaw (wie rotation.y: x' = u cos + v sin, z' = −u sin + v cos)
    const u = _b.min.x + (w * i) / (N - 1) - px, v = _b.min.z + (d * j) / 4 - pz;
    const hgt = hAt(px + u * c + v * s, pz - u * s + v * c);
    if (hgt < lo) lo = hgt;
    if (hgt > hi) hi = hgt;
  }
  const row: PlaceRow = { island, kind, x: px, z: pz, w, d, low: _b.min.y, range: hi - lo, float: _b.min.y - lo, sink: hi - _b.min.y };
  if (row.float > FLOAT || row.range > SLOPE) {
    const w2 = window as unknown as { __placeAudit?: PlaceRow[]; __placeAuditSummary?: () => unknown };
    (w2.__placeAudit ??= []).push(row);
    w2.__placeAuditSummary ??= () => {
      const by = new Map<string, { n: number; floatMax: number; rangeMax: number; sinkMax: number }>();
      for (const r of w2.__placeAudit!) {
        const e = by.get(r.kind) ?? { n: 0, floatMax: 0, rangeMax: 0, sinkMax: 0 };
        e.n++; e.floatMax = Math.max(e.floatMax, r.float); e.rangeMax = Math.max(e.rangeMax, r.range); e.sinkMax = Math.max(e.sinkMax, r.sink);
        by.set(r.kind, e);
      }
      return [...by.entries()].map(([k, e]) => `${k}: ${e.n}x, schwebt max ${e.floatMax.toFixed(2)} m, Hang max ${e.rangeMax.toFixed(2)} m, steckt max ${e.sinkMax.toFixed(2)} m`);
    };
  }
} : null;
