import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { distToSegment, wrapAngle } from '../src/core/mathUtil';
import { HOME_SPAWN } from '../src/data/world';
import { BERNSTEINSEE } from '../src/data/regions';
import { SHIP_CLASSES, TITLE_SHIP } from '../src/data/ships';
import { bearingOf, fitFor, headingOf, layoutShift, lensShift, TITLE_SHOTS, TitleDirector, type TitleHost, type TitleShip, type WeatherValues } from '../src/world/titleDirector';

/** Attrappe eines Schiffs: fährt geradeaus mit dem eingestellten Tempo (die echte Fahrphysik testet shipSim) */
function fakeShip(): TitleShip & { moved: number } {
  const group = new Object3D();
  const ship = {
    x: 0, z: 0, heading: 0, speed: 0, speedCap: null as number | null, throttle: null as number | null,
    sim: { sailSet: 0 },
    cls: { L: 46, W: 12.5, mh: 27 },
    model: { group, helm: new Vector3(0, 4, -12) },
    moved: 0,
    place(x: number, z: number, h: number) { ship.x = x; ship.z = z; ship.heading = h; group.position.set(x, 0, z); group.rotation.y = h; },
    steer(dt: number) {
      ship.x += Math.sin(ship.heading) * ship.speed * dt;
      ship.z += Math.cos(ship.heading) * ship.speed * dt;
      group.position.set(ship.x, 0, ship.z);
      group.rotation.y = ship.heading;
    },
  };
  return ship;
}

function fakeHost() {
  const ship = fakeShip();
  const log = { time: [] as number[], held: [] as (WeatherValues | null)[], strikes: 0, cuts: 0 };
  const env = {
    windDir: 0,
    timeSpeed: 1,
    setState(s: { time: number }) { log.time.push(s.time); },
    weather: {
      auto: true,
      hold(v: WeatherValues | null) { log.held.push(v); },
      strikeAt() { log.strikes++; },
    },
  };
  const host: TitleHost = {
    env, ship,
    seaEnv: () => ({ heightAt: () => 0, windDir: 0, windStrength: 0.5, storm: 0, time: 0 }),
    sea: () => 0,
    free: () => true,
    moved: (cut) => { if (cut) log.cuts++; },
  };
  return { host, ship, env, log };
}

beforeEach(() => { vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 720); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Titelbild: Einstellungen', () => {
  it('Kennungen sind eindeutig, Dauer, Zeit, Tempo und Winkel liegen in vernünftigen Grenzen', () => {
    expect(new Set(TITLE_SHOTS.map((s) => s.id)).size).toBe(TITLE_SHOTS.length);
    for (const s of TITLE_SHOTS) {
      expect(s.length).toBeGreaterThanOrEqual(8);
      expect(s.length).toBeLessThanOrEqual(25);
      expect(s.hour).toBeGreaterThanOrEqual(0);
      expect(s.hour).toBeLessThan(24);
      expect(s.speed).toBeGreaterThan(0);
      expect(s.sails).toBeGreaterThan(0);
      expect(s.sails).toBeLessThanOrEqual(1);
      expect(s.fov).toBeGreaterThan(30);
      expect(s.fov).toBeLessThan(75);
    }
  });

  it('die Stimmungen halten, was ihre Namen sagen', () => {
    const by = (id: string) => TITLE_SHOTS.find((s) => s.id === id)!;
    // Abendgold: die Sonne berührt den Horizont (höchstens 3 Grad), das Meer wird nicht grau
    const gold = by('abendgold');
    expect(bearingOf(gold.hour, 'sun')).toBeDefined();
    expect(gold.weather.grey ?? 0).toBeLessThan(0.2);
    // Sturm: dicht bewölkt, grau, Regen, hohe Wellen; Blitze kommen von der Regie, nicht vom Wetter
    const storm = by('sturm');
    expect(storm.weather.grey ?? 0).toBeGreaterThan(0.6);
    expect(storm.weather.rain ?? 0).toBeGreaterThan(0.5);
    expect(storm.weather.waves ?? 0).toBeGreaterThan(2);
    expect(storm.weather.lightning ?? 0).toBe(0);
    expect(storm.bolts).toBeTruthy();
    // Mondnacht: Sonne unter dem Horizont, klar
    const night = by('mondnacht');
    expect(night.hour < 5 || night.hour > 20).toBe(true);
    expect(night.weather.rain ?? 0).toBe(0);
  });

  it('der Kurs relativ zur Sonne lässt sie rechts neben dem Bug stehen', () => {
    const gold = TITLE_SHOTS.find((s) => s.id === 'abendgold')!;
    const h = headingOf(gold);
    const diff = wrapAngle(bearingOf(gold.hour, 'sun') - h);
    expect(diff).toBeCloseTo(-0.5, 5);
  });

  it('das Prachtschiff ist die Galeone', () => {
    expect(SHIP_CLASSES[TITLE_SHIP.tier].id).toBe('galeone');
  });
});

describe('Titelbild: Bildaufbau', () => {
  it('lensShift stellt das Ziel an die gewünschte Stelle im Bild', () => {
    const tanV = Math.tan((50 * Math.PI) / 360);
    const aspect = 16 / 9;
    const tanH = tanV * aspect;
    // ohne Verschiebung bleibt die Blickrichtung
    const same = lensShift(1.2, 0.1, 0, 0, tanH, tanV);
    expect(same.yaw).toBeCloseTo(1.2, 10);
    expect(same.pitch).toBeCloseTo(0.1, 10);
    // Ziel bei x = −0,4 (links): Blick geht nach rechts am Ziel vorbei (kleinere Gier), das Ziel steht dann bei −0,4
    const a = lensShift(0.5, 0, -0.4, 0.3, tanH, tanV);
    expect(a.yaw).toBeLessThan(0.5);
    expect(a.pitch).toBeLessThan(0);
    // Gegenprobe: Winkel zwischen Ziel und Blickachse → Bildposition
    expect(-Math.tan(0.5 - a.yaw) / tanH).toBeCloseTo(-0.4, 10);
    expect(Math.tan(0 - a.pitch) / tanV).toBeCloseTo(0.3, 10);
  });

  it('Querformat schiebt das Schiff links vom Menü, Hochformat über das Menü', () => {
    const wide = layoutShift(1280, 720);
    expect(wide.wide).toBe(true);
    expect(wide.ndcX).toBeLessThan(-0.2);
    expect(wide.ndcX).toBeGreaterThan(-0.6);
    const tall = layoutShift(390, 844);
    expect(tall.wide).toBe(false);
    expect(tall.ndcX).toBe(0);
    expect(tall.ndcY).toBeGreaterThan(0);
    // Handy im Querformat zählt als breit
    expect(layoutShift(844, 390).wide).toBe(true);
    // schmale Bildschirme stehen weiter weg vom Schiff
    expect(fitFor(390 / 844)).toBeGreaterThan(1.5);
    expect(fitFor(16 / 9)).toBe(1);
  });
});

describe('Titelbild: Ablauf', () => {
  it('blendet auf, wechselt die Einstellung über Schwarz und setzt Stimmung, Kurs und Tempo je Schnitt', () => {
    const { host, ship, env, log } = fakeHost();
    const dir = new TitleDirector(host);
    dir.start();
    expect(dir.active).toBe(true);
    expect(dir.fade).toBe(1);
    expect(dir.shot.id).toBe(TITLE_SHOTS[0].id);
    expect(log.time[0]).toBe(TITLE_SHOTS[0].hour);
    expect(env.timeSpeed).toBe(0);
    expect(env.weather.auto).toBe(false);
    expect(ship.speedCap).toBe(TITLE_SHOTS[0].speed);

    // Aufblenden (Intro) in rund 2,4 s
    for (let t = 0; t < 3; t += 1 / 30) dir.update(1 / 30);
    expect(dir.fade).toBe(0);

    // eine ganze Runde: jede Einstellung kommt der Reihe nach, die Blende erreicht zwischen den Schnitten Schwarz
    const seen: string[] = [dir.shot.id];
    let maxFade = 0;
    let darkAtCut = true;
    let prev = dir.shot.id;
    for (let t = 0; t < 70; t += 1 / 30) {
      dir.update(1 / 30);
      maxFade = Math.max(maxFade, dir.fade);
      if (dir.shot.id !== prev) {
        // im Moment des Schnitts ist das Bild schwarz
        if (dir.fade < 0.95) darkAtCut = false;
        prev = dir.shot.id;
        seen.push(prev);
      }
    }
    expect(seen.slice(0, 4)).toEqual([TITLE_SHOTS[0].id, TITLE_SHOTS[1].id, TITLE_SHOTS[2].id, TITLE_SHOTS[0].id]);
    expect(darkAtCut).toBe(true);
    expect(maxFade).toBeGreaterThan(0.99);
    // jeder Schnitt hat Stimmung gesetzt (Uhrzeit, Wetterwerte) und das Schiff neu gestellt
    expect(log.cuts).toBeGreaterThanOrEqual(4);
    expect(log.time).toEqual(expect.arrayContaining(TITLE_SHOTS.map((s) => s.hour)));
    expect(log.held.filter(Boolean).length).toBeGreaterThanOrEqual(4);
  });

  it('das Schiff fährt mit dem Reisetempo und die Sturmfront wirft Blitze', () => {
    const { host, ship, log } = fakeHost();
    const dir = new TitleDirector(host);
    dir.jump(1, 0); // Sturm
    const x0 = ship.x, z0 = ship.z;
    ship.speed = TITLE_SHOTS[1].speed;
    for (let t = 0; t < 6; t += 1 / 30) dir.update(1 / 30);
    expect(Math.hypot(ship.x - x0, ship.z - z0)).toBeGreaterThan(TITLE_SHOTS[1].speed * 4);
    expect(log.strikes).toBeGreaterThanOrEqual(2);
  });

  it('beim Spielstart gibt stop() Wetter und Tempo zurück', () => {
    const { host, ship, log } = fakeHost();
    const dir = new TitleDirector(host);
    dir.start();
    dir.update(0.5);
    dir.stop();
    expect(dir.active).toBe(false);
    expect(dir.fade).toBe(0);
    expect(ship.speedCap).toBeNull();
    expect(log.held[log.held.length - 1]).toBeNull();
    // danach tut update() nichts mehr
    const before = ship.x;
    dir.update(1);
    expect(ship.x).toBe(before);
  });

  it('weicht aus, wenn die Bühne belegt ist (Insel im Weg)', () => {
    const { host, ship } = fakeHost();
    const s0 = TITLE_SHOTS[0].stage;
    host.free = (x, z, r) => Math.hypot(x - s0.x, z - s0.z) > r + 300;
    const dir = new TitleDirector(host);
    dir.jump(0, 0);
    expect(Math.hypot(ship.x - s0.x, ship.z - s0.z)).toBeGreaterThan(300);
  });

  it('Kamera: tief über dem Wasser, Schiff steht im freien Teil links vom Menü', () => {
    const { host, ship } = fakeHost();
    host.sea = () => 0.3;
    const dir = new TitleDirector(host);
    dir.jump(0, 4);
    const cam = new PerspectiveCamera(55, 1280 / 720, 0.5, 3000);
    // einmal das Bild rechnen, dann die Kamera-Matrizen aktualisieren und das Schiff in den Bildschirm projizieren
    dir.frame(cam, 1280 / 720);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    expect(cam.position.y).toBeGreaterThan(1.4);
    const p = new Vector3(ship.x, 9, ship.z).project(cam);
    const lay = layoutShift(1280, 720);
    expect(Math.abs(p.x - lay.ndcX)).toBeLessThan(0.3);
    expect(p.x).toBeLessThan(0);
    // das Schiff liegt hinter der Kamera nicht: z im Bildraum < 1
    expect(p.z).toBeLessThan(1);
  });
});

describe('Heimatplatz des Schiffs', () => {
  it('liegt im freien Wasser vor dem Steg, auch für das größte Schiff (kein Hängen im Steg wie bei (0, 12))', () => {
    const town = BERNSTEINSEE.islands.find((i) => i.id === 'ankerglueck')!;
    // der Steg läuft nach Süden von der Küste hinaus; der Inselradius ist im Spiel etwas größer als in den Daten (Küstenböschung)
    for (const r of [town.r, town.r * 1.1, town.r * 1.25]) {
      const pier = { ax: town.x, az: town.z - r + 5, bx: town.x, bz: town.z - r - 75, hw: 2.4 };
      for (const cls of SHIP_CLASSES) {
        const f = { x: Math.sin(HOME_SPAWN.heading), z: Math.cos(HOME_SPAWN.heading) };
        for (const k of [-0.46, -0.3, 0, 0.3, 0.46]) {
          const px = HOME_SPAWN.x + f.x * cls.L * k, pz = HOME_SPAWN.z + f.z * cls.L * k;
          const d = distToSegment(px, pz, pier.ax, pier.az, pier.bx, pier.bz);
          expect(d, `${cls.id} bei k=${k}, r=${Math.round(r)}`).toBeGreaterThan(pier.hw + cls.W * 0.5 + 0.35 + 8);
        }
      }
    }
    // und weit genug von der Küste: der Bug zeigt zum Hafen, die Entfernung bis zum Strand reicht für einige Sekunden Fahrt
    expect(Math.hypot(HOME_SPAWN.x - town.x, HOME_SPAWN.z - town.z)).toBeGreaterThan(town.r * 1.25 + 80);
  });
});
