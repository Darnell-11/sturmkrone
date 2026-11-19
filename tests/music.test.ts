import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MUSIC_GROUPS, MUSIC_SECTORS, MUSIC_TRACKS, groupTracks, trackById, type MusicSector } from '../src/data/musicTracks';
import { IDLE_MUSIC, chooseScene, type MusicContext } from '../src/audio/musicDirector';
import { defaultSettings, sanitizeSettings } from '../src/core/settings';

const AUDIO = join(__dirname, '..', 'public', 'audio');
const ctx = (o: Partial<MusicContext> = {}): MusicContext => ({ ...IDLE_MUSIC, mode: 'sail', ...o });

describe('Musik-Manifest', () => {
  it('Kennungen sind eindeutig, Pfade gültig, Schleifen liegen in der Datei', () => {
    const ids = new Set<string>();
    for (const t of MUSIC_TRACKS) {
      expect(ids.has(t.trackId), t.trackId).toBe(false);
      ids.add(t.trackId);
      expect(t.trackId).toBe(`${t.group}_${t.layer}`);
      expect(t.file.startsWith('music/')).toBe(true);
      expect(t.loopStart).toBeGreaterThanOrEqual(0);
      expect(t.loopEnd).toBeGreaterThan(t.loopStart + 1);
      expect(t.bpm).toBeGreaterThan(40);
    }
  });

  it('jede Region, jeder Hafen und jeder Endboss hat sein Stück, alle Schichten einer Gruppe sind gleich lang', () => {
    for (const s of MUSIC_SECTORS) {
      expect(groupTracks(`reg_${s}`).map((t) => t.layer).sort(), s).toEqual(['calm', 'combat', 'tension']);
      expect(groupTracks(`harbor_${s}`).length, `harbor_${s}`).toBe(1);
    }
    for (const f of ['england', 'niederlande', 'deutschland', 'frankreich', 'kurogane', 'marine']) expect(groupTracks(`boss_${f}`).map((t) => t.layer).sort()).toEqual(['p1', 'p2']);
    for (const g of ['storm', 'battle_sea', 'siege_a', 'siege_b']) expect(groupTracks(g).map((t) => t.layer).sort(), g).toEqual(['base', 'intense']);
    expect(groupTracks('boarding').length).toBe(1);
    expect(trackById('sting_conquest_main')?.loop).toBe(false);
    expect(trackById('sting_alarm_main')?.loop).toBe(false);
    for (const g of MUSIC_GROUPS) {
      const l = groupTracks(g);
      for (const t of l) expect(Math.abs(t.loopEnd - l[0].loopEnd), g).toBeLessThan(0.01);
    }
  });

  const haveFiles = existsSync(join(AUDIO, 'music', 'manifest.json'));
  it.runIf(haveFiles)('gerenderte Dateien sind da (Ogg), stimmen in Dauer und BPM mit dem Manifest überein und clippen nicht', () => {
    const json = JSON.parse(readFileSync(join(AUDIO, 'music', 'manifest.json'), 'utf8')) as { sampleRate: number; tracks: { id: string; file: string; bpm: number; duration: number; peak: number }[] };
    expect(json.sampleRate).toBe(44100);
    expect(json.tracks.length).toBe(MUSIC_TRACKS.length);
    for (const m of json.tracks) {
      const t = trackById(m.id);
      expect(t, m.id).toBeTruthy();
      expect(t!.file, m.id).toBe(m.file);
      expect(t!.bpm, m.id).toBe(m.bpm);
      expect(Math.abs(t!.loopEnd - m.duration), m.id).toBeLessThan(0.02);
      expect(m.peak, m.id).toBeLessThanOrEqual(0.95);
      const p = join(AUDIO, m.file);
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(20_000);
      expect(readFileSync(p).subarray(0, 4).toString('latin1')).toBe('OggS');
    }
  });
});

describe('MusicDirector: Auswahl der Lage', () => {
  const exists = (g: string) => groupTracks(g).length > 0;

  it('Menü: keine Dateimusik (die prozedurale Menümusik spielt)', () => {
    expect(chooseScene(IDLE_MUSIC)).toBeNull();
  });

  it('offene See: ruhig, mit voller Fahrt im starken Wind kommen Trommeln und Streicher (Spannung) dazu, im Kampf die Kampfschicht', () => {
    const calm = chooseScene(ctx({ sector: 'england', speed: 0.05, wind: 0.2 }))!;
    expect(calm.group).toBe('reg_england');
    expect(calm.levels.calm).toBe(1);
    expect(calm.levels.tension ?? 0).toBeLessThan(0.1);
    const drive = chooseScene(ctx({ sector: 'england', speed: 1, wind: 1 }))!;
    expect(drive.levels.tension!).toBeGreaterThan(0.7);
    expect(drive.levels.combat ?? 0).toBeLessThan(0.05);
    const slow = chooseScene(ctx({ sector: 'england', speed: 1, wind: 0.1 }))!;
    expect(slow.levels.tension!).toBeLessThan(drive.levels.tension!);
    const fight = chooseScene(ctx({ mode: 'foot', sector: 'kurogane', threat: 0.9 }))!;
    expect(fight.group).toBe('reg_kurogane');
    expect(fight.levels.combat!).toBeGreaterThan(0.9);
    expect(fight.levels.calm!).toBeLessThan(0.6);
  });

  it('Region folgt dem Sektor, jeder Sektor hat sein Stück', () => {
    for (const s of MUSIC_SECTORS) expect(chooseScene(ctx({ sector: s }))!.group).toBe(`reg_${s}`);
  });

  it('Sturm wechselt in das Sturm-Arrangement, die zweite Schicht kommt mit dem Gewitter', () => {
    expect(chooseScene(ctx({ storm: 0.3 }))!.group).toBe('reg_ankergluck');
    const s1 = chooseScene(ctx({ storm: 0.6, wind: 0.6 }))!;
    expect(s1.group).toBe('storm');
    const s2 = chooseScene(ctx({ storm: 1, wind: 1 }))!;
    expect(s2.levels.intense!).toBeGreaterThan(s1.levels.intense!);
    // zu Fuß kein Sturm-Stück
    expect(chooseScene(ctx({ mode: 'foot', storm: 1 }))!.group).toBe('reg_ankergluck');
  });

  it('Hafen: Tavernenmusik der Macht der Stadt, bei Gefahr nicht', () => {
    expect(chooseScene(ctx({ harbor: true, harborSector: 'niederlande', sector: 'england' }))!.group).toBe('harbor_niederlande');
    expect(chooseScene(ctx({ harbor: true, harborSector: 'niederlande', threat: 0.8 }))!.group).not.toBe('harbor_niederlande');
  });

  it('Seeschlacht und Grenzschlacht: Schlachtstück mit Ostinato, die volle Schicht mit der Bedrohung', () => {
    const a = chooseScene(ctx({ seaBattle: true }))!;
    expect(a.group).toBe('battle_sea');
    expect(a.urgent).toBe(true);
    const b = chooseScene(ctx({ threat: 0.95 }))!;
    expect(b.group).toBe('battle_sea');
    expect(b.levels.intense!).toBeGreaterThan(a.levels.intense!);
  });

  it('Entern hat Vorrang vor Seeschlacht und Sturm und setzt sofort ein (kurze Überblendung)', () => {
    const b = chooseScene(ctx({ boarding: true, seaBattle: true, storm: 1, threat: 1 }))!;
    expect(b.group).toBe('boarding');
    expect(b.fade).toBeLessThan(0.5);
  });

  it('Belagerung: Route A (Bresche) und Route B (Viertel) haben eigene Musik; der Endboss hat Vorrang, Phase 2 ab 50 % Leben', () => {
    const raid = (route: 'A' | 'B' | null, boss: MusicContext['raid'] extends infer R ? R extends { boss: infer B } ? B : never : never = null) => ({ route, phase: 'assault', over: false, boss });
    expect(chooseScene(ctx({ raid: raid('A') }))!.group).toBe('siege_a');
    expect(chooseScene(ctx({ raid: raid(null) }))!.group).toBe('siege_a');
    expect(chooseScene(ctx({ raid: raid('B') }))!.group).toBe('siege_b');
    for (const f of ['england', 'niederlande', 'deutschland', 'frankreich', 'kurogane', 'marine'] as MusicSector[]) {
      const hi = chooseScene(ctx({ mode: 'foot', raid: raid('B', { faction: f, hp: 0.8, phase: 1 }) }))!;
      expect(hi.group).toBe(`boss_${f}`);
      expect(hi.levels.p2).toBe(0);
      const lo = chooseScene(ctx({ mode: 'foot', raid: raid('B', { faction: f, hp: 0.5, phase: 1 }) }))!;
      expect(lo.levels.p2).toBe(1);
      expect(chooseScene(ctx({ mode: 'foot', raid: raid('B', { faction: f, hp: 0.9, phase: 2 }) }))!.levels.p2).toBe(1);
    }
    // beendet: wieder die Region
    expect(chooseScene(ctx({ sector: 'frankreich', raid: { route: 'A', phase: 'victory', over: true, boss: null } }))!.group).toBe('reg_frankreich');
  });

  it('jede mögliche Lage liefert ein Stück, das es gibt, und nur Schichten, die dieses Stück hat', () => {
    const bools = [false, true];
    const raids: MusicContext['raid'][] = [null, { route: 'A', phase: 'sea', over: false, boss: null }, { route: 'B', phase: 'assault', over: false, boss: { faction: 'kurogane', hp: 0.4, phase: 2 } }];
    for (const mode of ['sail', 'foot'] as const) for (const sector of MUSIC_SECTORS) for (const harbor of bools) for (const boarding of bools) for (const seaBattle of bools) for (const raid of raids) {
      for (const threat of [0, 0.5, 1]) for (const storm of [0, 1]) for (const speed of [0, 1]) {
        const c = ctx({ mode, sector, harbor, harborSector: sector, boarding, seaBattle, raid, threat, storm, speed, wind: speed });
        const sc = chooseScene(c)!;
        expect(sc && exists(sc.group), JSON.stringify(c)).toBe(true);
        const layers = new Set(groupTracks(sc.group).map((t) => t.layer));
        for (const [k, v] of Object.entries(sc.levels)) { expect(layers.has(k as never), `${sc.group}:${k}`).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
        expect(sc.fade).toBeGreaterThanOrEqual(0.3);
        expect(sc.fade).toBeLessThanOrEqual(3.0);
      }
    }
  });
});

describe('Audio-Einstellungen', () => {
  it('muteWhenUnfocused ist gespeichert, standardmäßig an, und fehlende oder kaputte Werte fallen auf den Standard zurück', () => {
    expect(defaultSettings().muteWhenUnfocused).toBe(true);
    expect(sanitizeSettings({ muteWhenUnfocused: false }).muteWhenUnfocused).toBe(false);
    expect(sanitizeSettings({ muteWhenUnfocused: 'ja' }).muteWhenUnfocused).toBe(true);
    expect(sanitizeSettings({}).muteWhenUnfocused).toBe(true);
    expect(sanitizeSettings({ volume: { master: 5, music: -1, sfx: 'x', ambient: 0.3 } }).volume).toMatchObject({ master: 1, music: 0, ambient: 0.3 });
  });
});
