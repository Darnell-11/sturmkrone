import { CanvasTexture, NoColorSpace, RepeatWrapping, type Texture } from 'three';
import { markShared } from './dispose';
import { texDetail } from './texDetail';

/**
 * PBR-Karten aus den gemalten Graustufen-Texturen (Holz, Kisten, Pflaster) – ohne zusätzliche Downloads.
 * Die Helligkeit dient als Höhe: dunkle Fugen und Maserung liegen tiefer.
 *  - normalMap: Flächenneigung aus dem Höhenverlauf (Sobel-Filter)
 *  - orm: R = Umgebungsverdeckung (Fugen dunkler), G = Rauheit, B = Metall (glTF-Anordnung)
 * Ergebnisse werden je Quelltextur einmal berechnet und geteilt (nie freigegeben).
 */
export interface PbrSet { normalMap: CanvasTexture; orm: CanvasTexture }

export interface PbrOpts {
  /** Stärke der Reliefs (1 = normal) */
  strength?: number;
  /** Grundrauheit 0 … 1 und wie stark helle (abgenutzte) Stellen glatter wirken */
  rough?: number;
  roughVar?: number;
  /** Metallanteil (0 = Holz/Stein) */
  metal?: number;
  /** Wie dunkel Fugen in der Verdeckung werden */
  ao?: number;
}

const cache = new Map<string, PbrSet>();

export function pbrFromHeight(src: Texture, o: PbrOpts = {}): PbrSet | null {
  const img = src.image as HTMLCanvasElement | undefined;
  if (!img || !(img as HTMLCanvasElement).getContext) return null;
  const key = `${src.uuid}:${JSON.stringify(o)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const strength = o.strength ?? 1, rough = o.rough ?? 0.8, roughVar = o.roughVar ?? 0.15, metal = o.metal ?? 0, aoK = o.ao ?? 0.6;
  // halbe Auflösung reicht für Reliefs (spart Speicher und Rechenzeit beim Start)
  const W = Math.max(16, Math.round(img.width / 2)), H = Math.max(16, Math.round(img.height / 2));
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const tg = tmp.getContext('2d', { willReadFrequently: true })!;
  tg.drawImage(img, 0, 0, W, H);
  const px = tg.getImageData(0, 0, W, H).data;
  const h = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) h[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
  const at = (x: number, y: number) => h[((y + H) % H) * W + ((x + W) % W)];
  // weiche Umgebung (5×5-Mittel) für die Verdeckung: Punkte unter ihrer Umgebung sind Fugen
  const blur = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += at(x + dx, y + dy);
    blur[y * W + x] = s / 25;
  }
  const nc = document.createElement('canvas'), oc = document.createElement('canvas');
  nc.width = oc.width = W; nc.height = oc.height = H;
  const ng = nc.getContext('2d')!, og = oc.getContext('2d')!;
  const nImg = ng.createImageData(W, H), oImg = og.createImageData(W, H);
  const k = strength * 6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -gx * k, ny = gy * k, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    nImg.data[i] = (nx * 0.5 + 0.5) * 255;
    nImg.data[i + 1] = (ny * 0.5 + 0.5) * 255;
    nImg.data[i + 2] = (nz * 0.5 + 0.5) * 255;
    nImg.data[i + 3] = 255;
    const v = h[y * W + x];
    const cavity = Math.max(0, blur[y * W + x] - v);
    oImg.data[i] = Math.max(0, 1 - cavity * aoK * 6) * 255;
    oImg.data[i + 1] = Math.min(1, Math.max(0.02, rough + (0.5 - v) * roughVar * 2)) * 255;
    oImg.data[i + 2] = metal * 255;
    oImg.data[i + 3] = 255;
  }
  ng.putImageData(nImg, 0, 0);
  og.putImageData(oImg, 0, 0);
  const mk = (c: HTMLCanvasElement) => {
    const t = new CanvasTexture(c);
    t.colorSpace = NoColorSpace;
    t.wrapS = src.wrapS; t.wrapT = src.wrapT;
    t.repeat.copy(src.repeat); t.offset.copy(src.offset); t.center.copy(src.center); t.rotation = src.rotation;
    t.anisotropy = texDetail.aniso;
    return markShared(t);
  };
  const set = { normalMap: mk(nc), orm: mk(oc) };
  if (src.wrapS === RepeatWrapping) set.normalMap.wrapS = set.orm.wrapS = RepeatWrapping;
  cache.set(key, set);
  return set;
}

/**
 * Fertige Toon-Optionen mit Relief, Verdeckung und Rauheit für eine gemalte Textur.
 * base: Ursprungstextur, wenn `tex` nur eine Kopie mit anderem Ausschnitt ist (z. B. Deck eines Schiffs) –
 * dann werden die Karten aus der Ursprungstextur übernommen und nur Ausschnitt/Drehung kopiert
 * (diese Kopien gehören dem Material und werden mit ihm freigegeben).
 */
export function toonPbr(tex: Texture, o: PbrOpts & { normalScale?: number } = {}, base?: Texture) {
  const set = pbrFromHeight(base ?? tex, o);
  if (!set) return {};
  let { normalMap, orm } = set as { normalMap: Texture; orm: Texture };
  if (base && base !== tex) {
    const fit = (t: Texture) => { const c = t.clone(); c.repeat.copy(tex.repeat); c.offset.copy(tex.offset); c.center.copy(tex.center); c.rotation = tex.rotation; return c; };
    normalMap = fit(normalMap);
    orm = fit(orm);
  }
  return { normalMap, normalScale: o.normalScale ?? 1, aoMap: orm, aoMapIntensity: 1, roughnessMap: orm };
}
