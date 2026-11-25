// 4.6G.3: Haar-Netze unter Standard-Hüten (Grundfrisur und Frisur-Modelle teilen dieselbe Rechnung aus hatFit.ts).
import { BufferAttribute, Matrix4, Vector3 } from 'three';
import { markShared } from '../../render/dispose';
import { squeezeUnderHat, type HatSeat } from './hatFit';

const _v = new Vector3(), _inv = new Matrix4();
const _p = { x: 0, y: 0, z: 0 };

/**
 * Lage eines Haar-Netzes unter einem Hut: `toHead` bringt einen Netzpunkt in den Kopfraum. Liefert eine neue, geteilte Lage oder null, wenn
 * kein Punkt über dem Band liegt. Normalen bleiben (das gedrückte Haar liegt unter dem Hut).
 */
export function squeezePositions(src: BufferAttribute, toHead: Matrix4, seat: HatSeat): BufferAttribute | null {
  const back = _inv.copy(toHead).invert();
  const pos = new Float32Array(src.count * 3);
  let moved = 0;
  for (let i = 0; i < src.count; i++) {
    _v.fromBufferAttribute(src, i).applyMatrix4(toHead);
    _p.x = _v.x; _p.y = _v.y; _p.z = _v.z;
    if (squeezeUnderHat(seat, _p)) { _v.set(_p.x, _p.y, _p.z); moved++; }
    _v.applyMatrix4(back).toArray(pos, i * 3);
  }
  return moved ? markShared(new BufferAttribute(pos, 3)) : null;
}
