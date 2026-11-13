import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/core/storage';
import { SaveManager } from '../src/core/save/saveManager';
import { migrateSave, MIGRATIONS } from '../src/core/save/migrations';
import { createSave, SAVE_VERSION } from '../src/core/save/types';
import { LEGACY_KEY } from '../src/core/save/legacy';

const V = '2.0.0-test';

// Ausschnitt eines echten 1.0-Spielstands (Felder wie in newSave() der Referenz)
const legacy10 = {
  v: 1, name: 'Kira', faction: 'marine', style: 'faust', blade: 'saebel',
  look: { skin: '#E8BE96', hair: 'kurz', hairCol: '#5A3A22', outfit: '#1F4E79', hat: 'dreispitz', beard: 0 },
  lvl: 7, xp: 120, gold: 3400, flags: { intro: 1 }, quest: 5, ruhm: 950, tier: 2,
  crew: ['cat', 'cook'], sk: { eisenfaust: 2 }, sp: 1, slots: ['bergbrecher', null, null], gfx: 'hoch', pos: { x: 2100, z: 2000, a: 1 },
};

describe('Spielstände', () => {

  it('legt alten Anime-Figuren einmal Mantel und Stiefel an (8 → 9)', () => {
    const old = { ...createSave('Fynn', 'pirat', V), version: 8 } as Record<string, any>;
    old.player = { ...old.player, look: { ...old.player.look, coat: 'keiner', shoes: 'schuhe' } };
    const r = migrateSave(old, V);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.player.look.coat).toBe('lang');
    expect(r.data.player.look.shoes).toBe('stiefel');
    const kept = { ...createSave('Ada', 'marine', V), version: 8 } as Record<string, any>;
    kept.player = { ...kept.player, look: { ...kept.player.look, coat: 'kurz', coatColor: '#2F6E4F' } };
    const k = migrateSave(kept, V);
    if (!k.ok) throw new Error(k.error);
    expect(k.data.player.look.coatColor).toBe('#2F6E4F');
  });

  it('rückt das Schiff mit der größeren Karte nach außen, nur vor Ankerglück bleibt es liegen (9 → 10)', () => {
    const far = MIGRATIONS[9]({ version: 9, world: { boat: { x: -500, z: 900, heading: 1 }, time: 9, weather: 'klar' } });
    expect(far.version).toBe(10);
    expect(far.world.boat).toEqual({ x: -1000, z: 1800, heading: 1 });
    const home = MIGRATIONS[9]({ version: 9, world: { boat: { x: 10, z: 30, heading: 0 }, time: 9, weather: 'klar' } });
    expect(home.world.boat).toEqual({ x: 10, z: 30, heading: 0 });
    expect(MIGRATIONS[9]({ version: 9, world: { boat: null, time: 9, weather: 'klar' } }).world.boat).toBeNull();
  });

  it('speichert und lädt einen Platz', () => {
    const m = new SaveManager(new MemoryStore(), V);
    const s = createSave('Fynn', 'pirat', V);
    s.player.gold = 999;
    expect(m.save(1, s)).toBe(true);
    const r = m.load(1);
    expect(r.data?.player.gold).toBe(999);
    expect(r.data?.version).toBe(SAVE_VERSION);
    expect(m.load(2).data).toBeNull();
  });

  it('nutzt die Sicherung, wenn der Hauptstand kaputt ist', () => {
    const store = new MemoryStore();
    const m = new SaveManager(store, V);
    const s = createSave('Fynn', 'pirat', V);
    m.save(1, s);
    s.player.level = 2;
    m.save(1, s); // erzeugt Sicherung mit Stufe 1
    store.setItem('sturmkrone2-slot-1', '{kaputt');
    const r = m.load(1);
    expect(r.data?.player.level).toBe(1);
    expect(r.error).toMatch(/Sicherung/);
  });

  it('löscht Haupt- und Sicherungsstand', () => {
    const m = new SaveManager(new MemoryStore(), V);
    const s = createSave('Fynn', 'pirat', V);
    m.save(1, s);
    m.save(1, s);
    m.delete(1);
    expect(m.load(1).data).toBeNull();
  });

  it('Export und Import ergeben denselben Stand', () => {
    const m = new SaveManager(new MemoryStore(), V);
    const s = createSave('Ylva', 'marine', V);
    s.meta.playTime = 1234;
    const r = m.importJson(m.exportJson(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(s);
  });

  it('lehnt kaputte Dateien und neuere Versionen ab', () => {
    const m = new SaveManager(new MemoryStore(), V);
    expect(m.importJson('kein json').ok).toBe(false);
    expect(m.importJson('{"foo":1}').ok).toBe(false);
    const future = { ...createSave('X', 'pirat', V), version: SAVE_VERSION + 1 };
    const r = m.importJson(JSON.stringify(future));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/neueren Version/);
  });

  it('ergänzt fehlende Felder mit Standardwerten', () => {
    const partial = { version: SAVE_VERSION, player: { name: 'Alt', faction: 'marine', level: 3 } };
    const r = migrateSave(partial, V);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.player.name).toBe('Alt');
      expect(r.data.player.level).toBe(3);
      expect(r.data.player.gold).toBe(200);
      expect(r.data.world.boat).toBeNull();
      expect(r.data.progress.flags).toEqual({});
    }
  });

  it('wandelt 1.0-Spielstände um und behält alle Originaldaten', () => {
    const r = migrateSave(legacy10, V);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe('legacy10');
    expect(r.data.player).toMatchObject({ name: 'Kira', faction: 'marine', style: 'faust', level: 7, gold: 3400, fame: 950 });
    expect(r.data.progress.quest).toBe(5);
    expect(r.data.legacy10?.crew).toEqual(['cat', 'cook']);
    // Look aus 1.0 im Charakter-Editor 2.0
    expect(r.data.player.look).toMatchObject({ skin: '#E8BE96', hair: 'kurz', hairColor: '#5A3A22', outfitColor: '#1F4E79', hat: 'dreispitz', gloves: true });
  });

  it('hebt Version-2-Stände auf den neuen Look', () => {
    const v2 = { ...createSave('Ole', 'pirat', V), version: 2 } as any;
    v2.player.look = { skin: '#8D5A3B', hair: 'glatze', beard: 1, patch: 1, hat: 'keine' };
    const r = migrateSave(v2, V);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.player.look).toMatchObject({ skin: '#8D5A3B', hair: 'glatze', beard: 'vollbart', eyepatch: true, hat: 'keiner' });
  });

  it('findet einen 1.0-Stand im Browser-Speicher', () => {
    const store = new MemoryStore();
    store.setItem(LEGACY_KEY, JSON.stringify(legacy10));
    expect(new SaveManager(store, V).findLegacy()?.player.name).toBe('Kira');
  });

  it('hebt Version-1-Stände (Tag/Nacht) auf Uhrzeit und Wetter', () => {
    const v1 = { ...createSave('Nachteule', 'pirat', V), version: 1, world: { boat: { x: 5, z: 6, heading: 1 }, night: true } };
    const r = migrateSave(v1, V);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migratedFrom).toBe(1);
      expect(r.data.world).toEqual({ boat: { x: 5, z: 6, heading: 1 }, time: 22, weather: 'klar' });
    }
  });

  it('führt Migrationen der Reihe nach aus', () => {
    // Simuliert eine künftige Version: alter Stand mit Version 0 → 1
    MIGRATIONS[0] = (d) => ({ ...d, version: 1, player: { ...d.player, name: d.player.name + '!' } });
    try {
      const old = { ...createSave('Ole', 'pirat', V), version: 0 };
      const r = migrateSave(old, V);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.player.name).toBe('Ole!');
        expect(r.migratedFrom).toBe(0);
      }
    } finally {
      delete MIGRATIONS[0];
    }
  });

  it('alte Stände bekommen leere Plätze für Hände, Beine, Füße und Nebenhand (10 → 11), nichts geht verloren', () => {
    const old = { ...createSave('Fynn', 'pirat', V), version: 10 } as Record<string, any>;
    old.gear = { weapon: 2, armor: 3, potions: 4, shrine: 1, trinkets: ['x'], trinket: null, heads: ['kopftuch'], head: 'kopftuch' };
    const r = migrateSave(old, V);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(r.data.gear.owned).toEqual([]);
    expect(r.data.gear.worn).toEqual({});
    expect(r.data.gear.armor).toBe(3);
    expect(r.data.gear.head).toBe('kopftuch');
  });
});
