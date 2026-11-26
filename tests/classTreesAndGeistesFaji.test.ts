// Phase 4.7B – feste Klassen, Rollen, 15 Klassenbäume mit 60 Knoten (10 Formen, 49 Stärkungen, Ultimate an Knoten 60), Priester (DPS/Heilung),
// Geistes-Faji Q/R/T/G, strenges Verbergen fremder Klassen, einmalige Element-Wahl, kein Q-Waffenwechsel, Tutorial-Verzweigung, Spielstand 25.
import { describe, expect, it } from 'vitest';
import {
  ActionCombatEngine, createFighter, makeInput,
  type ActionBody, type ActionInput, type ActionTarget, type ActionWorld, type HitContext,
} from '../src/combat/actionCombatEngine';
import { ACTION_STYLES, type ActionHit, type ActionMove, type ActionStyleId } from '../src/data/actionStyles';
import {
  BUFF_KINDS, CLASS_BASE_IDS, FORM_NODES, GEIST, GEIST_VALUES, SPECS, SPECS_OF, SPEC_IDS, TREE_SIZE, ULT_NODE,
  autoFill, awakenGeist, chooseSpec, classBuffs, classFree, classFromLegacy, classOfCreation, classSpent, classStyle, classTree, cleanClass,
  emptyClass, fitClass, formsOpen, learnGeist, learnNext, lockElement, ultOpen,
} from '../src/data/classes';
import { ACTION_IDS, ART_ACTIONS, DEFAULT_KEYS, GEIST_ACTIONS } from '../src/data/actions';
import { TOUCH_FOOT, TOUCH_FOOT_PAGE2 } from '../src/data/touchLayout';
import { classScreenHtml, newClassUi, type ClassView } from '../src/ui/classScreen';
import { ULTIMATES } from '../src/data/cataclysms';
import { ULTIMATE_CINEMATICS } from '../src/graphics/ultimateCinematics';
import { CATACLYSM_DUR } from '../src/world/cataclysmDirector';
import { TutorialFlow, type TutorialHost, type TutorialProbe } from '../src/core/tutorialFlow';
import { migrateSave } from '../src/core/save/migrations';
import { SAVE_VERSION, createSave } from '../src/core/save/types';
import { poolTotal } from '../src/core/talentRules';
import { localRoster } from '../src/world/sharedPresence';

const DT = 1 / 60;

// ---------- kleine Prüfwelt für die Engine ----------

interface Foe { id: string; x: number; z: number; alive: boolean; boss: boolean; hits: { h: ActionHit; bonus: number; penAdd: number }[] }

class World implements ActionWorld {
  foes: Foe[] = [];
  foe(x: number, z: number, boss = false): Foe { const f = { id: `f${this.foes.length}`, x, z, alive: true, boss, hits: [] }; this.foes.push(f); return f; }
  height(): number { return 0; }
  move(b: ActionBody, dx: number, dz: number): void { b.x += dx; b.z += dz; }
  teleport(b: ActionBody, x: number, z: number): boolean { b.x = x; b.z = z; return true; }
  targets(x: number, z: number, r: number, out: ActionTarget[]): number {
    let n = 0;
    this.foes.forEach((f, i) => {
      if (n >= out.length || !f.alive || Math.hypot(f.x - x, f.z - z) > r + 0.45) return;
      const t = out[n++];
      t.id = f.id; t.x = f.x; t.y = 0; t.z = f.z; t.radius = 0.45; t.height = 1.8; t.yaw = 0;
      t.alive = true; t.airborne = false; t.mass = false; t.broken = false; t.boss = f.boss; t.ref = i;
    });
    return n;
  }
  hit(t: ActionTarget, h: ActionHit, _m: ActionMove, c: HitContext): number { this.foes[t.ref].hits.push({ h: { ...h }, bonus: c.bonus, penAdd: c.penAdd }); return 1; }
  drag(): void {}
  shoot(): void {}
}

function setup(style: ActionStyleId) {
  const w = new World();
  const eng = new ActionCombatEngine(createFighter('klasse', style));
  return { w, eng, inp: makeInput() };
}

/** n Bilder, beim ersten mit `press`; gesammelte Ereignisse (Art, a, b) */
function run(eng: ActionCombatEngine, w: World, inp: ActionInput, n: number, press: Partial<ActionInput> = {}) {
  const seen: { type: string; a: number; b: number; c: number }[] = [];
  for (let i = 0; i < n; i++) {
    Object.assign(inp, { light: false, heavy: false, jump: false, dash: false, skill: 0, geist: 0, blockPressed: false, awaken: false, aura: false }, i === 0 ? press : {});
    eng.step(inp, w, DT);
    for (let k = 0; k < eng.events.n; k++) { const e = eng.events.items[k]; seen.push({ type: e.type, a: e.a, b: e.b, c: e.c }); }
  }
  return seen;
}

// ---------- 1. Klassen und Rollen ----------

describe('4.7B Klassen und Rollen: drei Klassen, 15 Spezialisierungen', () => {
  it('Faustkämpfer 2, Schwertkämpfer 4, Faji-Wirker 9 (8 Elemente + Priester) – jede mit Rolle, Stil, Rune und Wappen', () => {
    expect(CLASS_BASE_IDS).toEqual(['faust', 'schwert', 'faji']);
    expect(SPEC_IDS).toHaveLength(15);
    expect(SPECS_OF.faust).toEqual(['schnell', 'kraeftig']);
    expect(SPECS_OF.schwert).toEqual(['doppel', 'saebel', 'langschwert', 'grossschwert']);
    expect(SPECS_OF.faji).toHaveLength(9);
    expect(SPECS_OF.faji).toContain('priester');
    const roles: Record<string, string> = {
      schnell: 'DPS', kraeftig: 'Tank-DPS', doppel: 'Assassinen-DPS', saebel: 'Kombo-DPS', langschwert: 'Midrange-DPS', grossschwert: 'Tank-DPS', priester: 'DPS/Heal',
    };
    for (const id of SPEC_IDS) {
      const s = SPECS[id];
      expect(s.role, id).toBe(roles[id] ?? 'Elementar-DPS');
      expect(ACTION_STYLES[s.style], id).toBeTruthy();
      expect(s.rune.length + s.crest.length, id).toBeGreaterThan(1);
      expect(s.desc.length, id).toBeGreaterThan(20);
    }
    // jede Spezialisierung kämpft mit einem eigenen Stil
    expect(new Set(SPEC_IDS.map((id) => SPECS[id].style)).size).toBe(15);
  });

  it('Erschaffung: Schwertkämpfer legen ihre Klinge fest, Faustkämpfer und Faji-Wirker wählen später', () => {
    expect(classOfCreation('schwert', 'zweihaender').slots).toEqual([{ base: 'schwert', spec: 'grossschwert' }]);
    expect(classOfCreation('schwert', 'langklinge').slots[0].spec).toBe('langschwert');
    expect(classOfCreation('faust', 'saebel').slots).toEqual([{ base: 'faust', spec: null }]);
    expect(classOfCreation('effekt', 'saebel').slots).toEqual([{ base: 'faji', spec: null }]);
    // vor der Wahl: Faust mit der Sturmfaust, Faji-Wirker mit Faji-Wirken
    expect(classStyle(classOfCreation('faust', ''))).toBe('sturmfaust');
    expect(classStyle(classOfCreation('effekt', ''))).toBe('effekt');
  });

  it('streng eine Klasse: ein Platz im Modell, Spezialisierung nur einmal und nur aus der eigenen Klasse', () => {
    const c = emptyClass('faust', null);
    expect(c.slots).toHaveLength(1);
    expect(chooseSpec(c, 'saebel')).toMatch(/gehört nicht/);
    expect(chooseSpec(c, 'kraeftig')).toBeNull();
    expect(chooseSpec(c, 'schnell')).toMatch(/steht fest/);
    expect(classStyle(c)).toBe('erdspalter');
    // ein verbogener Stand mit fremder Spezialisierung fällt auf die eigene Klasse zurück
    const bad = cleanClass({ v: 1, slots: [{ base: 'schwert', spec: 'feuer' }, { base: 'faji', spec: 'eis' }], nodes: 99 }, emptyClass('schwert', 'saebel'));
    expect(bad.slots).toEqual([{ base: 'schwert', spec: 'saebel' }]);
    expect(bad.nodes).toBe(60);
  });
});

// ---------- 2. Klassenbäume ----------

describe('4.7B: 15 Klassenbäume mit je 60 Knoten', () => {
  it('jeder Baum: 10 Formen an den Knoten 1, 6, 12 … 54, 49 Stärkungen, das Ultimate an Knoten 60', () => {
    expect(FORM_NODES).toEqual([1, 6, 12, 18, 24, 30, 36, 42, 48, 54]);
    for (const id of SPEC_IDS) {
      const t = classTree(id);
      expect(t, id).toHaveLength(TREE_SIZE);
      expect(t.map((n) => n.n)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
      const forms = t.filter((n) => n.kind === 'form');
      expect(forms.map((n) => n.n), id).toEqual([...FORM_NODES]);
      expect(forms.map((n) => n.form), id).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(t.filter((n) => n.kind === 'buff'), id).toHaveLength(49);
      expect(t[ULT_NODE - 1].kind, id).toBe('ult');
      // Ultimate des Stils vorhanden
      expect(ACTION_STYLES[SPECS[id].style].ultimate, id).toBeTruthy();
      // Stärkungen: Heilkraft nur beim Priester; alle Werte positiv
      for (const n of t.filter((x) => x.kind === 'buff')) { expect(BUFF_KINDS).toContain(n.buff); expect(n.v).toBeGreaterThan(0); }
      expect(t.some((n) => n.buff === 'heal'), id).toBe(id === 'priester');
    }
  });

  it('150 Formen mit eigenen deutschen Namen, taktischer Beschreibung, Abklingzeit und Element für AnimeVfxForge', () => {
    const names = new Set<string>();
    for (const id of SPEC_IDS) {
      const st = ACTION_STYLES[SPECS[id].style];
      expect(st.skills, id).toHaveLength(10);
      st.skills.forEach((k, i) => {
        expect(k.slot, `${id} ${i}`).toBe(i + 1);
        expect(k.label.length).toBeGreaterThan(3);
        expect(k.desc.length).toBeGreaterThan(20);
        expect(k.cd).toBeGreaterThan(0);
        expect(k.vfx || st.element, k.id).toBeTruthy();
        expect(k.label).not.toMatch(/\b(the|and|of)\b/i);
        names.add(k.label);
      });
    }
    expect(names.size).toBe(150);
  });

  it('Lernen: ein Pfad von vorn, ein Punkt je Knoten; Formen und Ultimate werden mit ihren Knoten frei', () => {
    const c = emptyClass('schwert', 'saebel');
    expect(formsOpen(c)).toBe(0);
    expect(learnNext(c, 0)).toMatch(/Kein freier/);
    expect(learnNext(c, 1)).toBeNull();
    expect(formsOpen(c)).toBe(1);
    expect(learnNext(c, 1)).toMatch(/Kein freier/);
    expect(autoFill(c, 30)).toBe(29);
    expect(c.nodes).toBe(30);
    expect(formsOpen(c)).toBe(6);
    expect(ultOpen(c)).toBe(false);
    autoFill(c, 200);
    expect(c.nodes).toBe(60);
    expect(ultOpen(c)).toBe(true);
    expect(learnNext(c, 200)).toMatch(/vollständig/);
    // Stärkungen summieren sich je Art
    const b = classBuffs(c);
    expect(b.tempo).toBeGreaterThan(0);
    expect(b.heal).toBe(0);
    // zu wenige Punkte (Stand repariert): von hinten zurück
    fitClass(c, 40);
    expect(c.nodes).toBe(40);
  });

  it('Engine: gesperrte Form meldet ihren Knoten, das Ultimate erst mit Knoten 60', () => {
    const { w, eng, inp } = setup('saebel');
    w.foe(0, 3);
    eng.setClass(1, false);
    let ev = run(eng, w, inp, 2, { skill: 2 });
    const lock = ev.find((e) => e.type === 'locked');
    expect(lock?.a).toBe(2);
    expect(lock?.b).toBe(6);
    eng.setClass(2, false);
    ev = run(eng, w, inp, 60, { skill: 2 });
    expect(ev.some((e) => e.type === 'skill')).toBe(true);
    // Form 10 (Umschalt + 5)
    eng.setClass(10, false);
    ev = run(eng, w, inp, 90, { skill: 10 });
    expect(ev.some((e) => e.type === 'skill' && e.a === 10)).toBe(true);
    // Ultimate: Erwachen ja, Ultimate gesperrt
    eng.addWill(1000);
    run(eng, w, inp, 30, { awaken: true });
    ev = run(eng, w, inp, 3, { awaken: true });
    expect(ev.find((e) => e.type === 'locked')?.b).toBe(60);
    expect(eng.ultAvailable).toBe(false);
    eng.setClass(10, true);
    expect(eng.ultAvailable).toBe(true);
  });
});

// ---------- 3. Strenges Verbergen und Element-Sperre ----------

function view(c = emptyClass('schwert', 'saebel'), pool = 10): ClassView {
  return { cls: c, level: 10, xp: 0, xpNeed: 100, pool, free: classFree(c, pool), keys: { forms: ART_ACTIONS.map((a) => DEFAULT_KEYS[a][0]), ult: 'V', geist: ['Q', 'R', 'T', 'G'] }, canChoose: true };
}

describe('4.7B Talent-Fenster: nur der eigene Klassenbaum und die Geistes-Faji', () => {
  it('ein Säbel-Fechter sieht keine anderen Klassen, Klingen, Faust-Pfade oder Elemente', () => {
    const c = emptyClass('schwert', 'saebel');
    autoFill(c, 12);
    const html = classScreenHtml(view(c), newClassUi());
    expect(html).toContain('Säbel');
    expect(html).toContain('Kombo-DPS');
    for (const id of SPEC_IDS) if (id !== 'saebel') expect(html, id).not.toContain(`${SPECS[id].label}<`);
    for (const id of SPEC_IDS) if (id !== 'saebel') for (const k of ACTION_STYLES[SPECS[id].style].skills) expect(html.includes(`title="${k.label}`), k.label).toBe(false);
    expect(html).not.toMatch(/Feuer-Faji|Priester|Doppelklinge|Großschwert|Kräftiger/);
    // zwei Reiter: Klassenbaum und Geistes-Faji – keine Kapitäns-, Kosmos- oder Technik-Bäume
    expect(html.match(/data-a="tab"/g)).toHaveLength(2);
    expect(html).not.toMatch(/Kosmos|Admiral|Techniken/);
  });

  it('Faji-Wirker ohne Element sieht nur die neun Element-Karten seiner Klasse; der erste Punkt legt es für immer fest', () => {
    const c = emptyClass('faji', null);
    const html = classScreenHtml(view(c, 1), newClassUi());
    expect(html.match(/data-a="pick"/g)).toHaveLength(9);
    expect(html).toContain('für immer fest');
    expect(html).not.toMatch(/Säbel|Doppelklinge|Schneller Faustkämpfer/);
    // ohne freien Punkt nicht (außer am Kristall)
    expect(lockElement(emptyClass('faji', null), 'eis', 0)).toMatch(/freien Talentpunkt/);
    expect(lockElement(c, 'eis', 1)).toBeNull();
    expect(c.slots[0].spec).toBe('eis');
    expect(c.nodes).toBe(1);
    expect(lockElement(c, 'feuer', 5)).toMatch(/steht fest/);
    expect(c.slots[0].spec).toBe('eis');
    // danach: nur noch der Eis-Baum
    const after = classScreenHtml(view(c, 5), newClassUi());
    expect(after).toContain('Eis-Faji');
    expect(after).not.toContain('data-a="pick"');
    expect(after).not.toMatch(/Feuer-Faji|Priester|Wind-Faji/);
    // Kristall der Einführung: auch ohne Punkt
    const k = emptyClass('faji', null);
    expect(lockElement(k, 'priester', 0, true)).toBeNull();
    expect(k.slots[0].spec).toBe('priester');
    expect(k.nodes).toBe(0);
  });

  it('Detailvorschau einer Form: Emblem, Rolle, Wirkung, Abklingzeit/Kosten und animierte Vorschau; Klassen-Gestaltung über Rune und Rahmen', () => {
    const c = emptyClass('faji', 'priester');
    autoFill(c, 20);
    const html = classScreenHtml(view(c, 20), { tab: 'baum', sel: 6, pick: null, note: '' });
    expect(html).toContain('cls-emblem');
    expect(html).toContain('data-kind=');
    expect(html).toContain('DPS/Heal');
    expect(html).toContain('Abklingzeit');
    expect(html).toContain('Kosten: 1 Punkt');
    expect(html).toContain('data-base="faji"');
    expect(html).toContain(`--rune:'${SPECS.priester.rune}'`);
    const ult = classScreenHtml(view(c, 20), { tab: 'baum', sel: 60, pick: null, note: '' });
    expect(ult).toContain('Erzengel-Himmelsgericht');
  });
});

// ---------- 4. Kein Q-Waffenwechsel ----------

describe('4.7B: kein Waffen- oder Stilwechsel mehr', () => {
  it('Q, Z und X wechseln nichts: die Aktionen gibt es nicht mehr, Q gehört der Geistes-Faji', () => {
    for (const a of ['swap', 'weapon1', 'weapon2']) expect((ACTION_IDS as readonly string[]).includes(a), a).toBe(false);
    expect(DEFAULT_KEYS.geist1).toEqual(['KeyQ']);
    expect(GEIST_ACTIONS).toEqual(['geist1', 'geist2', 'geist3', 'geist4']);
  });

  it('der Stil folgt nur der Klasse (keine Faji-Kunst neben der Klinge)', () => {
    const c = emptyClass('schwert', 'grossschwert');
    expect(classStyle(c)).toBe('zweihaender');
    const f = emptyClass('faji', 'mond');
    expect(classStyle(f)).toBe('mond');
  });

  it('Aktionsleiste: zehn Formen (1 – 5, Umschalt + 1 – 5), am Handy zwei Seiten auf denselben Plätzen', () => {
    expect(ART_ACTIONS).toHaveLength(10);
    expect(TOUCH_FOOT_PAGE2.map((b) => b.action)).toEqual(['art6', 'art7', 'art8', 'art9', 'art10']);
    const p1 = TOUCH_FOOT.filter((b) => /^art[1-5]$/.test(b.action));
    TOUCH_FOOT_PAGE2.forEach((b, i) => { expect(b.right).toBe(p1[i].right); expect(b.bottom).toBe(p1[i].bottom); });
    for (const a of ['formPage', 'geist1', 'geist2', 'geist3', 'geist4']) expect(TOUCH_FOOT.some((b) => b.action === a), a).toBe(true);
  });
});

// ---------- 5. Geistes-Faji ----------

describe('4.7B Geistes-Faji: Q Willens-Entfesselung, R Lebensstrom-Fokus, T Erwachter Wille, G Königsdruck', () => {
  it('vier Kräfte für alle Klassen, Rang 1 mit dem Erwachen, Ränge 2 – 5 kosten Punkte', () => {
    expect(GEIST.map((g) => g.key)).toEqual(['Q', 'R', 'T', 'G']);
    expect(GEIST.map((g) => g.label)).toEqual(['Willens-Entfesselung', 'Lebensstrom-Fokus', 'Erwachter Wille', 'Königsdruck']);
    const c = emptyClass('faust', 'schnell');
    expect(learnGeist(c, 0, 10)).toMatch(/nicht erwacht/);
    awakenGeist(c);
    expect(c.geist).toEqual([1, 1, 1, 1]);
    expect(classSpent(c)).toBe(0);
    expect(learnGeist(c, 3, 1)).toBeNull();
    expect(c.geist[3]).toBe(2);
    expect(classSpent(c)).toBe(1);
    expect(learnGeist(c, 2, 1)).toMatch(/Kein freier/);
    for (const g of GEIST) for (let r = 1; r <= 5; r++) { expect(g.cd(r)).toBeGreaterThan(0); expect(g.desc(r).length).toBeGreaterThan(30); }
    // Königsdruck hat die längste Abklingzeit (eine Stufe unter einem Ultimate)
    expect(GEIST[3].cd(5)).toBeGreaterThan(GEIST[0].cd(1));
  });

  it('ohne Erwachen gesperrt, danach: Q stärkt Schaden und Durchschlag, R heilt, Abklingzeit sperrt die Wiederholung', () => {
    const { w, eng, inp } = setup('saebel');
    const foe = w.foe(0, 1.6);
    let ev = run(eng, w, inp, 1, { geist: 1 });
    expect(ev.find((e) => e.type === 'geist')?.b).toBe(-1);
    eng.setGeist([1, 1, 1, 1]);
    ev = run(eng, w, inp, 1, { geist: 1 });
    expect(ev.find((e) => e.type === 'geist')?.a).toBe(1);
    expect(eng.f.willT).toBeCloseTo(GEIST_VALUES.willeDur(1), 3);
    run(eng, w, inp, 30, { light: true });
    const h = foe.hits[foe.hits.length - 1];
    expect(h.bonus).toBeCloseTo(1 + GEIST_VALUES.willeDmg(1), 5);
    expect(h.penAdd).toBeGreaterThanOrEqual(1);
    ev = run(eng, w, inp, 1, { geist: 1 });
    expect(ev.find((e) => e.type === 'geist')?.b).toBe(-2);
    ev = run(eng, w, inp, 1, { geist: 2 });
    const heal = ev.find((e) => e.type === 'heal');
    expect(heal?.a).toBeCloseTo(GEIST_VALUES.lebenHeal(1), 5);
    expect(heal!.a).toBeLessThanOrEqual(0.3);
  });

  it('T betäubt und bricht die Haltung im Umkreis; G trifft weit mit Furcht und schwerem Schaden, aber unter einem Ultimate', () => {
    const { w, eng, inp } = setup('sturmfaust');
    eng.setGeist([1, 1, 1, 5]);
    const near = w.foe(0, 4), far = w.foe(0, 12);
    let ev = run(eng, w, inp, 1, { geist: 3 });
    const t = ev.find((e) => e.type === 'geist');
    expect(t?.a).toBe(3);
    expect(t?.c).toBe(1);
    expect(near.hits[0].h.status).toBe('stun');
    expect(near.hits[0].h.breakGuard).toBe(true);
    expect(near.hits[0].h.poise).toBeGreaterThanOrEqual(80);
    expect(far.hits).toHaveLength(0);
    ev = run(eng, w, inp, 1, { geist: 4 });
    const g = ev.find((e) => e.type === 'geist');
    expect(g?.a).toBe(4);
    expect(g?.b).toBe(GEIST_VALUES.koenigR(5));
    expect(far.hits).toHaveLength(1);
    expect(far.hits[0].h.status).toBe('fear');
    const kd = far.hits[0].h.dmg;
    expect(kd).toBeGreaterThan(2);
    // kein Boss-One-Shot: deutlich unter dem Treffer eines Ultimates (Zweihänder 7 ×)
    const ultDmg = Math.max(...ULTIMATES.zweihaender!.hits.map((h) => h.dmg));
    expect(kd).toBeLessThan(ultDmg * 0.6);
    expect(GEIST[3].cd(5)).toBeGreaterThanOrEqual(55);
  });
});

// ---------- Priester ----------

describe('4.7B Priester: Licht- & Lebens-Faji (DPS/Heilung)', () => {
  it('Heilung für sich und Verbündete, Segen; Ultimate „Erzengel-Himmelsgericht“ mit eigener Kino-Regie', () => {
    const st = ACTION_STYLES.priester;
    const heals = st.skills.filter((k) => (k.heal ?? 0) > 0);
    expect(heals.length).toBeGreaterThanOrEqual(4);
    expect(heals.some((k) => (k.healR ?? 0) === 0)).toBe(true);
    expect(heals.some((k) => (k.healR ?? 0) >= 10)).toBe(true);
    expect(st.skills.some((k) => k.buff?.kind === 'hyper')).toBe(true);
    const u = st.ultimate!;
    expect(u.label).toBe('Erzengel-Himmelsgericht');
    expect(u.ultimate!.kind).toBe('himmelsgericht');
    expect(u.heal).toBeGreaterThan(0.2);
    const cine = ULTIMATE_CINEMATICS.himmelsgericht;
    expect(cine.title).toBe('Erzengel-Himmelsgericht');
    expect(cine.beats).toHaveLength(3);
    expect(cine.shots).toHaveLength(3);
    expect(CATACLYSM_DUR.himmelsgericht).toBeGreaterThan(0);
    // Engine meldet die Heilung beim Wirken
    const { w, eng, inp } = setup('priester');
    w.foe(0, 3);
    // Form 1 heilt schon ab Knoten 1 (auch in der Einführung)
    const ev = run(eng, w, inp, 2, { skill: 1 });
    expect(ev.find((e) => e.type === 'heal')?.a).toBeCloseTo(0.16, 5);
  });

  it('Priester-Bäume tragen Heilkraft als Stärkung', () => {
    const c = emptyClass('faji', 'priester');
    autoFill(c, 60);
    expect(classBuffs(c).heal).toBeGreaterThan(0.2);
  });
});

// ---------- 4. Tutorial ----------

function fakeHost(o: { needsPath?: boolean; geist?: () => number; art?: () => number }) {
  const calls: string[] = [];
  const done = new Set<string>(['t1', 't2']);
  const flags: Record<string, boolean> = {};
  let stepNo = 0;
  const steps: { id: 't3' | 't5'; type: 'act'; act: 'talent' | 'faji' | 'art' }[] = [];
  const probe: TutorialProbe = { hits: 0, dashing: false, targeted: false, artSkills: 0, atHelm: false };
  const h: TutorialHost = {
    step: (id) => (steps[stepNo] && steps[stepNo].id === id ? { type: 'act', act: steps[stepNo].act, text: '' } as never : null),
    isDone: (id) => done.has(id),
    act: (a) => { calls.push(`act:${a}`); stepNo++; },
    probe: () => ({ ...probe, artSkills: o.art?.() ?? 0 }),
    spent: () => 0, level: () => 1, setLevel: () => {}, giveWeapon: () => calls.push('weapon'), grantShip: () => {}, offerHire: () => {}, crewHired: () => false,
    coachShip: () => {}, spawnScout: () => null, scoutLive: () => false,
    offerFaji: () => calls.push('crystal'), fajiEquipped: () => false,
    spawnRaid: () => 3, raidLeft: () => 3, dissolve: () => {}, shared: () => false,
    flag: (k) => !!flags[k], setFlag: (k) => { flags[k] = true; }, say: () => {},
    needsPath: () => !!o.needsPath, offerPath: () => calls.push('path'), geistUses: o.geist,
  };
  return { h, calls, steps };
}

describe('4.7B Einführung: Verzweigung nach Klasse', () => {
  it('Konrad: Faustkämpfer ohne Pfad bekommen die Wahlkarte Schnell/Kräftig, andere Klassen nicht', () => {
    const a = fakeHost({ needsPath: true });
    a.steps.push({ id: 't3', type: 'act', act: 'talent' });
    new TutorialFlow(a.h).update(DT);
    expect(a.calls).toContain('path');
    const b = fakeHost({ needsPath: false });
    b.steps.push({ id: 't3', type: 'act', act: 'talent' });
    new TutorialFlow(b.h).update(DT);
    expect(b.calls).not.toContain('path');
  });

  it('Kristall: Karte (Element bzw. Geistes-Erwachen); danach zählt der erste Einsatz einer Geistes-Faji im Kampf', () => {
    let uses = 0;
    const a = fakeHost({ geist: () => uses });
    a.steps.push({ id: 't5', type: 'act', act: 'faji' }, { id: 't5', type: 'act', act: 'art' });
    const flow = new TutorialFlow(a.h);
    flow.update(DT); flow.update(DT);
    expect(a.calls).toContain('crystal');
    a.h.act('faji');
    flow.update(DT); flow.update(DT);
    expect(a.calls).not.toContain('act:art');
    uses = 1;
    flow.update(DT);
    expect(a.calls).toContain('act:art');
  });

  it('Faji-Wirker: auch die erste Elementar-Form zählt', () => {
    let art = 0;
    const a = fakeHost({ geist: () => 0, art: () => art });
    a.steps.push({ id: 't5', type: 'act', act: 'art' });
    const flow = new TutorialFlow(a.h);
    flow.update(DT);
    art = 1;
    flow.update(DT);
    expect(a.calls).toContain('act:art');
  });
});

// ---------- 6. Spielstand 25 ----------

function legacySave(version: number, p: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const s = createSave('Alt', 'pirat', '4.7.0') as unknown as Record<string, any>;
  s.version = version;
  delete s.player.cls;
  Object.assign(s.player, p);
  s.talents = { ...s.talents, nodes: { 'zweihaender.stand': 1 }, bonus: 4 };
  s.skills = { learned: { feuerball: 2 }, slots: ['feuerball', null, null], sp: 0, awakened: [] };
  if (version >= 24) s.progress.instance = { mode: 'shared', skipped: false, ship: true, dissolvedAt: 0 };
  else delete s.progress.instance;
  Object.assign(s, extra);
  return JSON.parse(JSON.stringify(s));
}

describe('4.7B Spielstand 25: alte Stände (23/24) laden ohne Fehler und tragen Stufen und Punkte in den Klassenbaum', () => {
  it('Version 25; neue Stände tragen eine Klasse', () => {
    // 4.7E: seit 4.7E Version 27 (26: Team-Treue, 27: Live-Kriegs-Quests) – 25 bleibt die Klassen-Migration
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(25);
    const s = createSave('Neu', 'pirat', '4.7.2');
    expect(s.player.cls?.slots).toHaveLength(1);
  });

  it('Erdspalter (Version 24, Stufe 30): Kräftiger Faustkämpfer, alte Bäume und Techniken erstattet, Punkte im Klassenbaum, Geistes-Faji erwacht', () => {
    const m = migrateSave(legacySave(24, { level: 30, actionStyle: 'erdspalter', style: 'faust' }), '4.7.2');
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const d = m.data;
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.player.level).toBe(30);
    const c = d.player.cls!;
    expect(c.slots).toEqual([{ base: 'faust', spec: 'kraeftig' }]);
    expect(Object.keys(d.talents!.nodes)).toHaveLength(0);
    expect(Object.keys(d.skills.learned)).toHaveLength(0);
    const pool = poolTotal(d.talents!, d.player.level);
    expect(pool).toBeGreaterThanOrEqual(29 + 4);
    expect(c.nodes).toBe(Math.min(60, pool));
    expect(c.awake).toBe(true);
    expect(c.geist).toEqual([1, 1, 1, 1]);
    // ein zweites Laden ändert nichts mehr (keine doppelte Erstattung)
    const again = migrateSave(JSON.parse(JSON.stringify(d)), '4.7.2');
    expect(again.ok && again.data.player.cls).toEqual(c);
  });

  it('Faji-Kunst in der Hand (Version 23): Faji-Wirker dieses Elements; Säbel-Fechter bleibt Säbel; Stufe 100 füllt den Baum', () => {
    const a = migrateSave(legacySave(23, { level: 12, actionStyle: 'eis', faji: { equipped: 'eis', mastery: {}, aura: 0 } }), '4.7.2');
    expect(a.ok && a.data.player.cls!.slots[0]).toEqual({ base: 'faji', spec: 'eis' });
    const b = migrateSave(legacySave(24, { level: 100, style: 'schwert', blade: 'saebel', actionStyle: 'saebel' }), '4.7.2');
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.data.player.cls!.slots[0]).toEqual({ base: 'schwert', spec: 'saebel' });
    expect(b.data.player.cls!.nodes).toBe(60);
    expect(ultOpen(b.data.player.cls!)).toBe(true);
    // übrige Punkte bleiben frei für die Geistes-Faji
    expect(classFree(b.data.player.cls!, poolTotal(b.data.talents!, 100))).toBeGreaterThan(0);
  });

  it('Faji-Wirken ohne Kunst: Faji-Wirker ohne Element (Wahl im Klassenbaum); mitten in der Einführung (Version 24) noch nicht erwacht', () => {
    const a = migrateSave(legacySave(24, { level: 2, actionStyle: 'effekt', style: 'effekt', faji: { equipped: null, mastery: {}, aura: 0 } }, {}), '4.7.2');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.data.player.cls!.slots[0]).toEqual({ base: 'faji', spec: null });
    expect(a.data.player.cls!.nodes).toBe(0);
    const raw = legacySave(24, { level: 2, actionStyle: 'sturmfaust', style: 'faust' });
    raw.progress.instance = { mode: 'tutorial', skipped: false, ship: false, dissolvedAt: 0 };
    const b = migrateSave(raw, '4.7.2');
    expect(b.ok && b.data.player.cls!.awake).toBe(false);
    expect(classFromLegacy({ actionStyle: 'doppel' }).slots[0].spec).toBe('doppel');
  });
});

// ---------- Rollen in der geteilten Welt ----------

describe('4.7B: Rollen auch im Zielfenster anderer Kapitäne', () => {
  it('jeder Kapitän der geteilten Welt trägt Klasse und Rolle im Titel', () => {
    for (const k of localRoster()) {
      expect(k.spec && SPECS[k.spec]).toBeTruthy();
      expect(k.title).toContain(`(${k.role})`);
    }
  });
});

describe('4.7B: offene Spezialisierung bleibt offen', () => {
  it('ein Faustkämpfer bzw. Faji-Wirker ohne Wahl wird beim Laden nicht still festgelegt', () => {
    expect(cleanClass(emptyClass('faust', null), emptyClass('faust', 'schnell')).slots[0].spec).toBeNull();
    expect(cleanClass(emptyClass('faji', null), emptyClass('faji', 'feuer')).slots[0].spec).toBeNull();
    expect(cleanClass({ v: 1, slots: [{ base: 'schwert', spec: null }] }, emptyClass('schwert', 'doppel')).slots[0].spec).toBe('doppel');
  });
});
