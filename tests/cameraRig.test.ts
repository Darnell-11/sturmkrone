// Kamera-Engine (Phase 4.4, Abschluss): Spring-Arm gegen Gelände, Brücken und Rümpfe, Sichtfeld-Kurve in Windstraßen, gerichtete
// Treffer-Erschütterung samt 0-%-Regler und weiche Übergänge ohne NaN – alles gegen eine kleine Attrappen-Welt ohne three.js-Szene.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  BLEND_ARM,
  CameraBlend,
  DampedValue,
  dynamicFovExtra,
  FocusPulse,
  FOOT_ARM,
  FOV_BOOST,
  HitShake,
  navalFrame,
  orbitBlend,
  raisedPoint,
  SEA_ARM,
  SHIP_L_RANGE,
  SpringArm,
  SwellFollow,
  type CameraWorld,
  type NavalFrame,
} from '../src/graphics/cameraRig';

// ---------------------------------------------------------------------------------------------------------------
// Attrappen-Welt
// ---------------------------------------------------------------------------------------------------------------

interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; walk?: boolean }

/**
 * Meer auf Höhe 0, optional ein Hang (Gelände steigt ab `slopeX` mit `slope` m je m), dazu Kästen: Brückendecks (`walk` = begehbar, zählt als
 * Boden, wenn darunter `yRef` liegt), Hauswände, Schiffsrümpfe.
 */
class FakeWorld implements CameraWorld {
  boxes: Box[] = [];
  slopeX = Infinity;
  slope = 0;
  terrain(x: number): number { return x > this.slopeX ? (x - this.slopeX) * this.slope : -Infinity; }
  floorAt(x: number, z: number, yRef: number): number {
    let f = Math.max(0, this.terrain(x));
    for (const b of this.boxes) {
      if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 <= yRef + 0.3) f = Math.max(f, b.y1);
    }
    return f;
  }
  solid(x: number, y: number, z: number): boolean {
    if (y < this.terrain(x) - 0.05) return true;
    for (const b of this.boxes) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1) return true;
    return false;
  }
}

const DT = 1 / 60;
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Arm über viele Bilder laufen lassen; prüft je Bild, dass die Kamera nie in festem Material und nie unter dem Mindestabstand steht */
function run(arm: SpringArm, world: FakeWorld, anchor: Vector3, desired: Vector3, frames: number, out = new Vector3()) {
  let maxStep = 0;
  const prev = new Vector3();
  for (let i = 0; i < frames; i++) {
    prev.copy(out);
    arm.solve(anchor, desired, world, DT, out);
    expect(Number.isFinite(out.x + out.y + out.z)).toBe(true);
    expect(world.solid(out.x, out.y, out.z)).toBe(false);
    expect(out.y).toBeGreaterThanOrEqual(world.floorAt(out.x, out.z, anchor.y) + arm.opts.clearance - 1e-6);
    if (i > 0) maxStep = Math.max(maxStep, out.distanceTo(prev));
  }
  return { out, maxStep };
}

// ---------------------------------------------------------------------------------------------------------------
// Spring-Arm
// ---------------------------------------------------------------------------------------------------------------

describe('Spring-Arm: freie Sicht', () => {
  it('steht bei freier Sicht genau an der Wunschposition (volle Armlänge, keine Kürzung)', () => {
    const w = new FakeWorld();
    const arm = new SpringArm(FOOT_ARM);
    const anchor = v(0, 1.4, 0), desired = v(0, 3, -6);
    const { out } = run(arm, w, anchor, desired, 30);
    expect(out.distanceTo(desired)).toBeLessThan(1e-3);
    expect(arm.hit).toBe(false);
    expect(arm.lift.value).toBe(0);
  });

  it('hebt eine Wunschposition unter dem Meer über die Wasserlinie (garantierter Mindestabstand)', () => {
    const w = new FakeWorld();
    const arm = new SpringArm(SEA_ARM);
    const anchor = v(0, 4, 0), desired = v(0, -3, -30);
    const { out } = run(arm, w, anchor, desired, 20);
    expect(out.y).toBeGreaterThanOrEqual(SEA_ARM.clearance - 1e-6);
  });
});

describe('Spring-Arm: Gelände und Klippen', () => {
  it('zieht vor einem Hang sofort heran und steckt nie im Fels', () => {
    const w = new FakeWorld();
    w.slopeX = 2; w.slope = 3; // steiler Hang 2 m hinter der Figur
    const arm = new SpringArm({ ...FOOT_ARM, raise: 0 });
    const anchor = v(0, 1.4, 0), desired = v(7, 2.5, 0);
    const { out } = run(arm, w, anchor, desired, 30);
    expect(arm.hit).toBe(true);
    expect(out.distanceTo(anchor)).toBeLessThan(desired.distanceTo(anchor));
  });

  it('weicht vor einer Klippe weich nach oben aus, statt bis an den Kopf heranzurücken', () => {
    const w = new FakeWorld();
    w.slopeX = 1.5; w.slope = 2.2;
    const flat = new SpringArm({ ...FOOT_ARM, raise: 0 });
    const lifted = new SpringArm(FOOT_ARM);
    const anchor = v(0, 1.4, 0), desired = v(6.2, 2.9, 0);
    const a = run(flat, w, anchor, desired, 60).out.distanceTo(anchor);
    const b = run(lifted, w, anchor, desired, 60).out.distanceTo(anchor);
    expect(lifted.lift.value).toBeGreaterThan(0.3);
    expect(b).toBeGreaterThan(a);
  });

  it('gleitet nach dem Hindernis weich auf die volle Länge zurück (kein Springen)', () => {
    const w = new FakeWorld();
    w.boxes.push({ x0: -3, x1: 3, y0: 0, y1: 8, z0: -3.2, z1: -2.6 }); // Wand 2,6 m hinter der Figur
    const arm = new SpringArm({ ...FOOT_ARM, raise: 0 });
    const anchor = v(0, 1.4, 0), desired = v(0, 3, -6.5);
    const out = new Vector3();
    run(arm, w, anchor, desired, 20, out);
    // vor der Wand, nicht dahinter
    expect(out.z).toBeGreaterThan(-2.6);
    expect(out.distanceTo(anchor)).toBeLessThan(2.8);
    // Wand weg: die Länge wächst Bild für Bild, ohne Sprung, und erreicht die Wunschlänge
    w.boxes.length = 0;
    const lens: number[] = [];
    for (let i = 0; i < 180; i++) { arm.solve(anchor, desired, w, DT, out); lens.push(out.distanceTo(anchor)); }
    for (let i = 1; i < lens.length; i++) {
      expect(lens[i]).toBeGreaterThanOrEqual(lens[i - 1] - 1e-6);
      expect(lens[i] - lens[i - 1]).toBeLessThan(0.25);
    }
    expect(lens[lens.length - 1]).toBeCloseTo(desired.distanceTo(anchor), 2);
  });

  it('springt beim Heranziehen sofort (kein Bild in der Wand), beim Zurückgleiten nie', () => {
    const w = new FakeWorld();
    const arm = new SpringArm({ ...FOOT_ARM, raise: 0 });
    const anchor = v(0, 1.4, 0), desired = v(0, 3, -6.5);
    const out = new Vector3();
    run(arm, w, anchor, desired, 10, out);
    w.boxes.push({ x0: -3, x1: 3, y0: 0, y1: 8, z0: -2.4, z1: -1.8 });
    arm.solve(anchor, desired, w, DT, out);
    expect(out.distanceTo(anchor)).toBeLessThan(1.9);
    expect(w.solid(out.x, out.y, out.z)).toBe(false);
  });

  it('Rücken an der Wand: lieber nah am Kopf als in der Wand (Untergrenze hardMin, Ausweg zur Figur hin)', () => {
    const w = new FakeWorld();
    w.boxes.push({ x0: -3, x1: 3, y0: 0, y1: 9, z0: -1.2, z1: -0.55 }); // Wand 0,55 m hinter dem Kopf, höher als jeder Ausweichwinkel
    w.boxes.push({ x0: -3, x1: 3, y0: 2.2, y1: 9, z0: -0.55, z1: 0.4 }); // Vordach direkt über der Figur
    const arm = new SpringArm(FOOT_ARM);
    const anchor = v(0, 1.4, 0.8), desired = v(0, 3, -5.5);
    run(arm, w, anchor, desired, 40);
  });
});

describe('Spring-Arm: Brücken und Rümpfe', () => {
  // Brückendeck 6 m über dem Meer, 0,9 m stark, 10 m breit
  const bridge = (): Box => ({ x0: -5, x1: 5, y0: 5.1, y1: 6.1, z0: -30, z1: 30, walk: true });

  it('unter einer Brücke: die Kamera bleibt unter dem Deck (Deck über dem Kopf ist kein Boden)', () => {
    const w = new FakeWorld();
    w.boxes.push(bridge());
    const arm = new SpringArm(FOOT_ARM);
    const anchor = v(0, 1.4, 0), desired = v(-2, 7.5, -5);
    const { out } = run(arm, w, anchor, desired, 40);
    expect(out.y).toBeLessThan(5.1);
  });

  it('auf einer Brücke: das Deck ist Boden, die Kamera fällt nie hindurch', () => {
    const w = new FakeWorld();
    w.boxes.push(bridge());
    const arm = new SpringArm(FOOT_ARM);
    const anchor = v(0, 6.1 + 1.4, 0), desired = v(0, 5.5, -6); // Wunschposition unter der Deckoberkante
    const { out } = run(arm, w, anchor, desired, 40);
    expect(out.y).toBeGreaterThanOrEqual(6.1 + FOOT_ARM.clearance - 1e-6);
  });

  it('See-Kamera hinter einem fremden Rumpf: heran oder darüber, nie hinein', () => {
    const w = new FakeWorld();
    w.boxes.push({ x0: -6, x1: 6, y0: -4, y1: 3.5, z0: -40, z1: -16 }); // Schiff achteraus
    const arm = new SpringArm(SEA_ARM);
    const anchor = v(0, 4.5, 0), desired = v(0, 6, -36);
    const { out } = run(arm, w, anchor, desired, 60);
    expect(out.distanceTo(anchor)).toBeGreaterThanOrEqual(SEA_ARM.minLength - 1e-6);
  });

  it('Werft und See: ein Anker im eigenen Rumpf zählt erst ab dem ersten freien Punkt', () => {
    const w = new FakeWorld();
    w.boxes.push({ x0: -5, x1: 5, y0: -4, y1: 3, z0: -15, z1: 15 }); // eigener Rumpf um den Anker
    const arm = new SpringArm(SEA_ARM);
    const anchor = v(0, 2, 0), desired = v(0, 14, -30);
    const { out } = run(arm, w, anchor, desired, 20);
    expect(out.distanceTo(desired)).toBeLessThan(1e-3);
  });

  it('raisedPoint dreht steiler über den Anker und behält die Armlänge', () => {
    const a = v(0, 1, 0), d = v(0, 2, -6), out = new Vector3();
    raisedPoint(a, d, 0.5, out);
    expect(out.distanceTo(a)).toBeCloseTo(d.distanceTo(a), 6);
    expect(out.y).toBeGreaterThan(d.y);
    expect(out.z).toBeLessThan(0);
    // nie über die Senkrechte hinaus
    raisedPoint(a, d, 3, out);
    expect(Math.atan2(out.y - a.y, Math.hypot(out.x - a.x, out.z - a.z))).toBeLessThanOrEqual(1.35 + 1e-9);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// See-Kamera und Sichtfeld
// ---------------------------------------------------------------------------------------------------------------

describe('Sichtfeld-Kurve (Fahrt, Windstraßen, Rammstoß)', () => {
  it('bleibt unter halber Fahrt unverändert und wächst mit der Fahrt bis +4°', () => {
    expect(dynamicFovExtra(0, 0, 0)).toBe(0);
    expect(dynamicFovExtra(0.5, 0, 0)).toBe(0);
    expect(dynamicFovExtra(1, 0, 0)).toBeCloseTo(FOV_BOOST.speed, 6);
    let last = -1;
    for (let k = 0; k <= 1.0001; k += 0.05) { const f = dynamicFovExtra(k, 0, 0); expect(f).toBeGreaterThanOrEqual(last); last = f; }
  });

  it('Windstraße (+35 % Strömung) öffnet mehr als reine Fahrt, nie über +8°', () => {
    const sail = dynamicFovExtra(1, 0, 0);
    const lane = dynamicFovExtra(1, 0.35, 0);
    expect(lane).toBeGreaterThan(sail);
    expect(lane).toBeGreaterThanOrEqual(FOV_BOOST.current);
    expect(lane).toBeLessThanOrEqual(8);
    // monoton im Schub der Strömung
    let last = -1;
    for (let f = 0; f <= 0.35001; f += 0.035) { const x = dynamicFovExtra(0.9, f, 0); expect(x).toBeGreaterThanOrEqual(last - 1e-9); last = x; }
    // Treibende Schiffe ohne Fahrt bekommen keinen Zuschlag aus der Strömung
    expect(dynamicFovExtra(0.1, 0.35, 0)).toBe(0);
  });

  it('Rammstoß gibt +8°, mehr gibt es nie', () => {
    expect(dynamicFovExtra(0, 0, 1)).toBeCloseTo(FOV_BOOST.ram, 6);
    expect(dynamicFovExtra(1.4, 0.6, 1)).toBeLessThanOrEqual(8);
    expect(dynamicFovExtra(1, 0.35, 0.5)).toBeLessThanOrEqual(8);
  });

  it('weich nachgeführt: kritisch gedämpft, ohne Überschwingen', () => {
    const d = new DampedValue(0);
    let max = 0;
    for (let i = 0; i < 240; i++) max = Math.max(max, d.step(dynamicFovExtra(1, 0.35, 0), 2.2, DT));
    expect(max).toBeLessThanOrEqual(dynamicFovExtra(1, 0.35, 0) + 1e-9);
    expect(d.value).toBeGreaterThan(dynamicFovExtra(1, 0.35, 0) * 0.95);
  });
});

describe('See-Kamera: Klassen, Breitseiten, Dünung', () => {
  const f = (L: number, aim = 0, portrait = false, waves = 1): NavalFrame => navalFrame(L, portrait, 0, false, 1, aim, waves, { back: 0, up: 0 });

  it('wächst mit der Klasse: Schaluppe nah, Leviathan weit', () => {
    const a = f(SHIP_L_RANGE[0]), b = f(SHIP_L_RANGE[1]);
    expect(b.back).toBeGreaterThan(a.back * 2);
    expect(b.up).toBeGreaterThan(a.up * 2);
  });

  it('hebt sich beim Zielen mit Breitseiten, bei hohem Seegang mehr', () => {
    const calm = f(40, 0), aim = f(40, 1), aimStorm = f(40, 1, false, 2.5);
    expect(aim.up).toBeGreaterThan(calm.up * 1.1);
    expect(aimStorm.up).toBeGreaterThan(aim.up);
    expect(aim.back).toBeLessThan(calm.back);
  });

  it('Dünung: begrenzt auf ±0,9 m und 1,4 m/s (verträglich gegen Reisekrankheit)', () => {
    const s = new SwellFollow();
    let prev = 0, maxV = 0, maxAbs = 0;
    for (let i = 0; i < 600; i++) {
      const t = i * DT;
      const o = s.update(Math.sin(t * 2.1) * 4 + Math.sin(t * 7.3) * 1.5, DT);
      maxV = Math.max(maxV, Math.abs(o - prev) / DT);
      maxAbs = Math.max(maxAbs, Math.abs(o));
      prev = o;
    }
    expect(maxAbs).toBeLessThanOrEqual(0.9 + 1e-9);
    expect(maxV).toBeLessThanOrEqual(1.4 + 1e-6);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Kampf-Kamera
// ---------------------------------------------------------------------------------------------------------------

/** feste Zufallsfolge */
const seq = () => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

describe('Treffer-Erschütterung', () => {
  it('stößt in Schlagrichtung und schwingt zurück', () => {
    const h = new HitShake();
    h.impulse(1, 0, 0, 1);
    const r = seq();
    let peakX = 0, peakZ = 0;
    for (let i = 0; i < 12; i++) { const o = h.update(DT, r); peakX = Math.max(peakX, o.x); peakZ = Math.max(peakZ, Math.abs(o.z)); }
    expect(peakX).toBeGreaterThan(0.02);
    expect(peakZ).toBeLessThan(peakX * 0.05);
    // nach zwei Sekunden ist alles verklungen
    for (let i = 0; i < 120; i++) h.update(DT, r);
    expect(h.offset.length()).toBeLessThan(1e-3);
  });

  it('richtet sich nach der Trefferrichtung (Rammstoß von vorn, Salve von der Seite)', () => {
    const a = new HitShake(), b = new HitShake();
    a.impulse(0, 0, -1, 1.2);
    b.impulse(-1, 0, 0, 0.8);
    const r = seq();
    let az = 0, bx = 0;
    for (let i = 0; i < 8; i++) { az = Math.min(az, a.update(DT, r).z); bx = Math.min(bx, b.update(DT, r).x); }
    expect(az).toBeLessThan(-0.02);
    expect(bx).toBeLessThan(-0.01);
  });

  it('„Kamera-Erschütterung“ 0 %: kein Versatz, egal wie stark der Treffer', () => {
    const h = new HitShake();
    h.scale = 0;
    const r = seq();
    h.impulse(1, 0.2, -0.4, 1.5);
    h.shake(1);
    for (let i = 0; i < 90; i++) {
      const o = h.update(DT, r);
      expect(Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.z)).toBe(0);
    }
  });

  it('50 % halbiert den Versatz', () => {
    const full = new HitShake(), half = new HitShake();
    half.scale = 0.5;
    full.impulse(1, 0, 0, 1); half.impulse(1, 0, 0, 1);
    for (let i = 0; i < 5; i++) { full.update(DT, () => 0.5); half.update(DT, () => 0.5); }
    expect(half.offset.x).toBeCloseTo(full.offset.x * 0.5, 9);
  });

  it('ungültige Eingaben ergeben nie NaN', () => {
    const h = new HitShake();
    h.impulse(Number.NaN, 0, 0, 1);
    h.impulse(0, 0, 0, Number.NaN);
    h.impulse(0, 0, 0, 1); // Richtung null
    for (let i = 0; i < 30; i++) {
      const o = h.update(i === 3 ? Number.NaN : DT, seq());
      expect(Number.isFinite(o.x + o.y + o.z)).toBe(true);
    }
  });
});

describe('Fokus-Puls (Parade, Boss-Finisher)', () => {
  it('rückt kurz heran, zieht das Sichtfeld zusammen und klingt ganz ab', () => {
    const p = new FocusPulse();
    p.trigger(1, 1.3);
    let peak = 0;
    for (let i = 0; i < 20; i++) peak = Math.max(peak, p.update(DT));
    expect(peak).toBeGreaterThan(0.9);
    expect(p.distK).toBeLessThan(0.8);
    expect(p.fovDelta).toBeLessThan(-2.5);
    for (let i = 0; i < 120; i++) p.update(DT);
    expect(p.value).toBe(0);
    expect(p.distK).toBe(1);
  });

  it('ein schwacher Puls unterbricht keinen starken', () => {
    const p = new FocusPulse();
    p.trigger(1, 1.3);
    for (let i = 0; i < 10; i++) p.update(DT);
    const v0 = p.value;
    p.trigger(0.3, 0.9);
    p.update(DT);
    expect(p.value).toBeGreaterThan(0.3);
    expect(p.value).toBeGreaterThan(v0 * 0.9);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Übergänge
// ---------------------------------------------------------------------------------------------------------------

describe('Weiche Übergänge (Anlegen, Leiter, Entern, Schnellreise)', () => {
  const cam = () => { const c = new PerspectiveCamera(55, 16 / 9, 0.1, 4800); c.updateMatrixWorld(); return c; };

  /** einen Stand zeichnen: Kamera an `pos`, Blick auf `look`, Sichtfeld `fov` */
  const pose = (c: PerspectiveCamera, pos: Vector3, look: Vector3, fov: number) => { c.position.copy(pos); c.lookAt(look); c.fov = fov; };

  it('überblendet Position, Blickrichtung und Sichtfeld ohne NaN und endet genau am Ziel', () => {
    const c = cam(), b = new CameraBlend();
    const f1 = v(0, 2, 0), f2 = v(0, 7.5, -3);
    pose(c, v(0, 20, 40), f1, 61); b.apply(c, f1, DT); // Segelkamera
    b.start(f2, 0.7);
    expect(b.blending).toBe(true);
    let last = new Vector3(0, 20, 40), maxStep = 0;
    for (let i = 0; i < 60; i++) {
      pose(c, v(0, 9.5, -9.5), f2, 55); // Fußkamera an Deck
      b.apply(c, f2, DT);
      expect(Number.isFinite(c.position.x + c.position.y + c.position.z + c.fov + c.quaternion.w)).toBe(true);
      expect(c.fov).toBeGreaterThanOrEqual(55 - 1e-9);
      expect(c.fov).toBeLessThanOrEqual(61 + 1e-9);
      maxStep = Math.max(maxStep, c.position.distanceTo(last));
      last = c.position.clone();
    }
    expect(b.blending).toBe(false);
    expect(c.position.distanceTo(v(0, 9.5, -9.5))).toBeLessThan(1e-6);
    expect(c.fov).toBeCloseTo(55, 6);
    // weich: kein Bild springt mehr als ein Bruchteil des Wegs
    expect(maxStep).toBeLessThan(v(0, 20, 40).distanceTo(v(0, 9.5, -9.5)) * 0.12);
  });

  it('läuft auf einer Kugelbahn um den Fokus: von einer Seite der Figur zur anderen nie durch den Kopf', () => {
    const focus = v(0, 1, 0), from = v(0, 1.5, 5), to = v(0, 1.5, -5), out = new Vector3();
    for (let e = 0; e <= 1.0001; e += 0.05) {
      orbitBlend(from, false, to, focus, e, out);
      expect(out.distanceTo(focus)).toBeGreaterThan(4.9);
    }
    // genau entgegengesetzt: über die Figur hinweg
    orbitBlend(v(0, 1, 5), false, v(0, 1, -5), focus, 0.5, out);
    expect(out.y).toBeGreaterThan(focus.y + 4);
    expect(orbitBlend(from, false, to, focus, 0, out).distanceTo(from)).toBeLessThan(1e-9);
    expect(orbitBlend(from, false, to, focus, 1, out).distanceTo(to)).toBeLessThan(1e-9);
  });

  it('Schnellreise: bei großen Sprüngen gilt der alte Stand relativ zum Fokus', () => {
    const c = cam(), b = new CameraBlend();
    const f1 = v(0, 2, 0), f2 = v(3000, 2, -1500);
    pose(c, v(0, 18, 40), f1, 58); b.apply(c, f1, DT);
    b.start(f2, 1.1);
    pose(c, v(3000, 18, -1460), f2, 55);
    b.apply(c, f2, DT);
    // erstes Bild: am neuen Ort, im alten Abstand zum Fokus
    expect(c.position.distanceTo(f2)).toBeCloseTo(v(0, 18, 40).distanceTo(f1), 0);
    expect(c.position.distanceTo(f2)).toBeLessThan(60);
  });

  it('ein entarteter Stand (Kamera am Fokus) wird bei Sprüngen ein Schnitt statt einer Überblendung durch den Kopf', () => {
    const c = cam(), b = new CameraBlend();
    const f1 = v(0, 2, 0), f2 = v(500, 2, 0);
    pose(c, v(0.3, 2.4, 0.2), f1, 55); b.apply(c, f1, DT);
    b.start(f2, 1.1);
    expect(b.blending).toBe(false);
  });

  it('bleibt bei NaN im Ziel endlich', () => {
    const c = cam(), b = new CameraBlend();
    const f = v(0, 2, 0);
    pose(c, v(0, 10, 20), f, 55); b.apply(c, f, DT);
    b.start(f, 0.7);
    c.position.set(Number.NaN, 0, 0);
    b.apply(c, f, DT);
    expect(Number.isFinite(c.position.x + c.position.y + c.position.z)).toBe(true);
  });
});

describe('Übergangs-Arm', () => {
  it('zieht nie sprunghaft heran (Überblendung bleibt weich), steckt aber auch nie in festem Material', () => {
    const w = new FakeWorld();
    const arm = new SpringArm(BLEND_ARM);
    const anchor = v(0, 1.4, 0), out = new Vector3();
    const desired = v(0, 3, -12);
    arm.solve(anchor, desired, w, DT, out);
    w.boxes.push({ x0: -3, x1: 3, y0: 0, y1: 2.6, z0: -6, z1: -5 }); // niedrige Mauer: über ihr ist Platz
    let prev = out.distanceTo(anchor), maxDrop = 0;
    for (let i = 0; i < 30; i++) {
      arm.solve(anchor, desired, w, DT, out);
      const l = out.distanceTo(anchor);
      maxDrop = Math.max(maxDrop, prev - l);
      prev = l;
      expect(w.solid(out.x, out.y, out.z)).toBe(false);
    }
    expect(maxDrop).toBeLessThan(3);
  });
});
