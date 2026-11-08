import type { BufferGeometry, Material, Mesh, Object3D, Texture } from 'three';

/**
 * Speicherverwaltung: Grafikspeicher (Geometrien, Materialien, Texturen) wird beim Entfernen eines Objekts
 * freigegeben – außer bei geteilten Ressourcen (Caches, Modul-Konstanten), die viele Objekte gleichzeitig nutzen.
 */
const shared = new WeakSet<object>();
const forgetHooks: ((o: Object3D) => void)[] = [];

/** Ressource als geteilt markieren: disposeObject gibt sie nie frei. */
export function markShared<T extends object>(r: T): T {
  shared.add(r);
  return r;
}

export function isShared(r: object) {
  return shared.has(r);
}

/** Registrierungen (z. B. Kontur-Liste) melden sich hier, damit entfernte Objekte nicht festgehalten werden. */
export function onForget(fn: (o: Object3D) => void) {
  forgetHooks.push(fn);
}

export function disposeTexture(t: Texture | null | undefined) {
  if (t && !shared.has(t)) t.dispose();
}

export function disposeMaterial(m: Material | Material[] | null | undefined) {
  if (!m) return;
  if (Array.isArray(m)) { for (const x of m) disposeMaterial(x); return; }
  if (shared.has(m)) return;
  // alle Texturen des Materials (map, emissiveMap, Uniform-Texturen …)
  for (const k in m) {
    const v = (m as unknown as Record<string, unknown>)[k];
    if (v && (v as Texture).isTexture) disposeTexture(v as Texture);
  }
  const u = (m as unknown as { uniforms?: Record<string, { value: unknown }> }).uniforms;
  if (u) for (const k in u) { const v = u[k]?.value; if (v && (v as Texture).isTexture) disposeTexture(v as Texture); }
  m.dispose();
}

export function disposeGeometry(g: BufferGeometry | null | undefined) {
  if (g && !shared.has(g)) g.dispose();
}

/** Objekt aus der Szene nehmen und alles freigeben, was nur ihm gehört. */
export function disposeObject(root: Object3D | null | undefined) {
  if (!root) return;
  root.removeFromParent();
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry) disposeGeometry(m.geometry);
    if (m.material) disposeMaterial(m.material as Material | Material[]);
    for (const fn of forgetHooks) fn(o);
  });
}
