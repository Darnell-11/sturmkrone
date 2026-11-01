import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from 'three';

/** Platzhalter-Schaluppe aus Grundformen. Wird in Meilenstein 5 durch echte Schiffsmodelle ersetzt. Bug zeigt nach +Z. */
export function buildTestBoat(): { group: Group; lantern: Mesh } {
  const g = new Group();
  const wood = new MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 });
  const darkWood = new MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.85 });
  const trim = new MeshStandardMaterial({ color: 0xe3b04b, roughness: 0.5, metalness: 0.3 });
  const sailMat = new MeshStandardMaterial({ color: 0xf3e6c8, roughness: 0.9, side: DoubleSide });

  // Rumpf: Kasten, vorne zugespitzt
  const hullGeo = new BoxGeometry(3.4, 1.8, 10, 1, 1, 4);
  const p = hullGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const y = p.getY(i);
    const bow = Math.max(0, (z - 1) / 4); // 0 hinten … 1 an der Spitze
    let x = p.getX(i) * (1 - bow * 0.92);
    if (y < 0) x *= 0.7; // Kiel schmaler
    p.setX(i, x);
    if (z > 4.5 && y > 0) p.setY(i, y + 0.35); // Bug leicht angehoben
  }
  hullGeo.computeVertexNormals();
  const hull = new Mesh(hullGeo, wood);
  hull.position.y = 0.3;
  g.add(hull);

  const deck = new Mesh(new BoxGeometry(3.0, 0.15, 8.2), darkWood);
  deck.position.set(0, 1.22, -0.5);
  g.add(deck);

  const rail = new Mesh(new BoxGeometry(3.5, 0.18, 0.18), trim);
  rail.position.set(0, 1.35, -5);
  g.add(rail);

  const cabin = new Mesh(new BoxGeometry(2.4, 1.1, 2.2), wood);
  cabin.position.set(0, 1.85, -3.6);
  g.add(cabin);

  const mast = new Mesh(new CylinderGeometry(0.14, 0.18, 9, 8), darkWood);
  mast.position.set(0, 5.6, 0.6);
  g.add(mast);

  const boom = new Mesh(new CylinderGeometry(0.08, 0.08, 4.6, 6), darkWood);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 2.4, -1.4);
  g.add(boom);

  // Segel leicht gewölbt
  const sailGeo = new PlaneGeometry(4.4, 6.4, 6, 6);
  const sp = sailGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const y = sp.getY(i);
    sp.setZ(i, Math.cos((x / 4.4) * Math.PI) * 0.5 * (1 - Math.abs(y) / 6.4));
  }
  sailGeo.computeVertexNormals();
  const sail = new Mesh(sailGeo, sailMat);
  sail.rotation.y = Math.PI / 2;
  sail.position.set(0.02, 5.8, -1.2);
  g.add(sail);

  const flag = new Mesh(new PlaneGeometry(1.2, 0.7), new MeshStandardMaterial({ color: 0xa8322a, side: DoubleSide }));
  flag.position.set(0, 10.3, 0.0);
  flag.rotation.y = Math.PI / 2;
  g.add(flag);

  // Laterne am Heck – leuchtet (Bloom) besonders nachts
  const lantern = new Mesh(new SphereGeometry(0.22, 12, 8), new MeshBasicMaterial({ color: new Color(4, 2.4, 0.9) }));
  lantern.position.set(0, 2.2, -4.9);
  g.add(lantern);

  g.traverse((o) => {
    if ((o as Mesh).isMesh && o !== lantern) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group: g, lantern };
}
