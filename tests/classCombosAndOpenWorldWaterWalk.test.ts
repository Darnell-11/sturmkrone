// Phase 4.7C – Sternbild-Klassenbaum (Knotengraph, SVG-Verbindungen, Medaillons, Wasserzeichen), ausgeblendete Welt-Hinweise bei offenem
// Baum, Umschalt + 1 … 5 ohne ungewollten Dash, eigene Kombos aller 15 Klassen (Elementar-Geschosse, Priester-Heil-Finisher), keine
// unsichtbaren Grenzen (Strand, Steg, Reling, Zaun, Einführungs-Leine) und Wasserlauf mit Ausdauer-Abzug bis 0.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ActionCombatEngine, createFighter, makeInput,
  type ActionBody, type ActionInput, type ActionTarget, type ActionWorld, type HitContext,
} from '../src/combat/actionCombatEngine';
import { ACTION_STYLES, FAJI_ARTS, PHYSICAL_STYLES, type ActionHit, type ActionMove, type ActionStyleId } from '../src/data/actionStyles';
import { SPECS, SPEC_IDS, classTree, emptyClass, autoFill, resetClass, awakenGeist, learnGeist, classSpent, type SpecId } from '../src/data/classes';
import { COMBO_NAMES, PRIEST_CHAIN_HEAL } from '../src/data/elementCombos';
import {
  NODE_SIZE, TREE_H, TREE_W, buffRanks, motifOf, roman, treeLayout, watermarkSvg,
} from '../src/ui/classTreeGraph';
import { classScreenHtml, newClassUi, type ClassView } from '../src/ui/classScreen';
import { ART_ACTIONS, DEFAULT_KEYS } from '../src/data/actions';
import { SHIFT_COMBO_MS, shiftVerdict } from '../src/core/input/shiftGate';
import { CompositeGround, DeckGround, IslandGround, RAIL_HOP, type WalkIsland } from '../src/world/islandGround';
import { WATER_WALK, isWater, newWaterWalk, stepWaterWalk, waterCap, waterDrain, waterRange } from '../src/data/waterWalk';

const DT = 1 / 60;
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ---------- 1. Sternbild-Klassenbaum ----------

function view(spec: SpecId, nodes: number): ClassView {
  const c = emptyClass(SPECS[spec].base, spec);
  autoFill(c, nodes);
  return { cls: c, level: 30, xp: 0, xpNeed: 100, pool: nodes, free: 0, keys: { forms: ART_ACTIONS.map((a) => DEFAULT_KEYS[a][0]), ult: 'V', geist: ['Q', 'R', 'T', 'G'] }, canChoose: true };
}

describe('4.7C Klassenbaum als Sternbild: Knotengraph und SVG-Leitlinien', () => {
  it('60 Knoten auf einem aufsteigenden Pfad: Form I unten, Apex-Wappen (Knoten 60) oben in der Mitte, alle in der Zeichenfläche', () => {
    const { nodes, edges } = treeLayout();
    expect(nodes).toHaveLength(60);
    expect(nodes.map((n) => n.n)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(nodes.filter((n) => n.kind === 'form').map((n) => n.n)).toEqual([1, 6, 12, 18, 24, 30, 36, 42, 48, 54]);
    expect(nodes.filter((n) => n.kind === 'buff')).toHaveLength(49);
    expect(nodes[59].kind).toBe('ult');
    expect(nodes[59].x).toBeCloseTo(TREE_W / 2, 5);
    // aufsteigend: jeder Meilenstein liegt höher (kleineres y) als der vorige, die Krone ganz oben
    const ms = nodes.filter((n) => n.kind !== 'buff');
    for (let i = 1; i < ms.length; i++) expect(ms[i].y).toBeLessThan(ms[i - 1].y);
    expect(Math.min(...nodes.map((n) => n.y))).toBe(nodes[59].y);
    for (const n of nodes) { expect(n.x).toBeGreaterThanOrEqual(20); expect(n.x).toBeLessThanOrEqual(TREE_W - 20); expect(n.y).toBeGreaterThan(0); expect(n.y).toBeLessThan(TREE_H); }
    // Seitenzweige: die Stärkungen eines Abschnitts schwingen deutlich von der Mittellinie aus
    const seg = nodes.slice(6, 11);
    const mid = (nodes[5].x + nodes[11].x) / 2;
    expect(Math.max(...seg.map((n) => Math.abs(n.x - mid)))).toBeGreaterThan(80);
    // gestochen scharf statt Gedränge: kein Knoten näher als 46 Einheiten an einem anderen (Sockel 32, Medaillon 58)
    let min = Infinity;
    for (let i = 0; i < 60; i++) for (let j = i + 1; j < 60; j++) min = Math.min(min, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y));
    expect(min).toBeGreaterThanOrEqual(46);
    // Leitlinien: 59 Verbindungen in Lernreihenfolge, keine doppelt
    expect(edges).toHaveLength(59);
    edges.forEach((e, i) => { expect(e.a).toBe(i + 1); expect(e.b).toBe(i + 2); });
  });

  it('Größen nach Vorgabe: Sockel 30 – 34 px, Medaillons 54 – 60 px, Apex 76 px; römische Form-Nummern; Rang-Zähler je Stat', () => {
    expect(NODE_SIZE.buff).toBeGreaterThanOrEqual(30); expect(NODE_SIZE.buff).toBeLessThanOrEqual(34);
    expect(NODE_SIZE.form).toBeGreaterThanOrEqual(54); expect(NODE_SIZE.form).toBeLessThanOrEqual(60);
    expect(NODE_SIZE.ult).toBe(76);
    expect([1, 4, 9, 10].map(roman)).toEqual(['I', 'IV', 'IX', 'X']);
    for (const id of SPEC_IDS) {
      const tree = classTree(id);
      const r = buffRanks(tree);
      for (let i = 0; i < 60; i++) {
        if (!tree[i].buff) { expect(r[i]).toEqual({ k: 0, n: 0 }); continue; }
        expect(r[i].k).toBeGreaterThanOrEqual(1);
        expect(r[i].k).toBeLessThanOrEqual(r[i].n);
        expect(r[i].n).toBe(7);
      }
    }
  });

  it('SVG: 60 Knoten, 59 Leitlinien – freigeschaltete leuchten, gesperrte bleiben dunkel; Medaillons mit Emblem und Nummer, gekröntes Apex-Wappen', () => {
    const html = classScreenHtml(view('saebel', 24), { ...newClassUi(), sel: 25 });
    expect(html.match(/<g class="cn /g)).toHaveLength(60);
    expect(html.match(/<line class="ce /g)).toHaveLength(59);
    expect(html.match(/<line class="ce on"/g)).toHaveLength(23);
    expect(html.match(/<line class="ce next"/g)).toHaveLength(1);
    expect(html.match(/<line class="ce off"/g)).toHaveLength(35);
    expect(html.match(/class="cn form/g)).toHaveLength(10);
    expect(html.match(/class="cn-num"/g)!.length).toBeGreaterThanOrEqual(10);
    expect(html).toContain('class="cn-crown"');
    expect(html).toContain('class="cn-aura"');
    expect(html).toContain('class="em-motif"');
    expect(html).toContain('<polygon class="cn-sock"');
    // kein altes Kastenraster mehr
    expect(html).not.toContain('cls-row');
  });

  it('Wasserzeichen je Klasse: Säbel (Kompassrose, Säbel), Priester (Rosette), Feuer (Drachen-Runen), Großschwert/Kräftig (Bastions-Schilde)', () => {
    const marks = new Map(SPEC_IDS.map((id) => [id, watermarkSvg(id)]));
    for (const [id, m] of marks) expect(m.length, id).toBeGreaterThan(80);
    // jede Klasse hat ihr eigenes Bild (Großschwert und Kräftiger Faustkämpfer teilen die Bastions-Schilde)
    const distinct = new Set([...marks.entries()].filter(([id]) => id !== 'kraeftig').map(([, m]) => m));
    expect(distinct.size).toBe(14);
    expect(marks.get('kraeftig')).toBe(marks.get('grossschwert'));
    expect(motifOf('priester')).toBe('holy');
    expect(motifOf('doppel')).toBe('twin');
    const html = classScreenHtml(view('priester', 3), newClassUi());
    expect(html).toContain('class="ct-wm"');
  });

  it('Fester Kopf und Fuß: Zurücksetzen und Zurück stehen außerhalb des rollenden Inhalts; Zurücksetzen erstattet alle Punkte', () => {
    const html = classScreenHtml(view('feuer', 12), newClassUi());
    const foot = html.slice(html.indexOf('class="ct-foot"'));
    expect(foot).toContain('data-a="reset"');
    expect(foot).toContain('data-a="back"');
    expect(html.indexOf('class="ct-foot"')).toBeGreaterThan(html.indexOf('class="ct-body"'));
    const css = read('src/ui/css/classes.css');
    expect(css).toMatch(/\.card\.classtree \{[^}]*display: flex/);
    expect(css).toMatch(/\.ct-foot \{[^}]*flex: none/);
    const c = emptyClass('faji', 'feuer'); autoFill(c, 20); awakenGeist(c); learnGeist(c, 3, 25);
    expect(classSpent(c)).toBe(21);
    expect(resetClass(c)).toBe(21);
    expect(c.nodes).toBe(0);
    expect(c.geist).toEqual([1, 1, 1, 1]);
    expect(c.slots[0].spec).toBe('feuer');
  });
});

// ---------- 1b. Welt-Hinweise und Umschalt ----------

describe('4.7C Bedienung: keine Welt-Hinweise hinter offenen Menüs, Umschalt + 1 … 5 ohne Dash', () => {
  it('offene Menüs blenden die Sprechen-Plakette und die Aktionsleiste der Welt aus', () => {
    expect(read('src/ui/css/classes.css')).toMatch(/\.menu-open \.npcm, \.menu-open \.hud-ctx \{ visibility: hidden/);
    const menus = read('src/ui/menus.ts');
    expect(menus).toContain("classList.add('menu-open')");
    expect(menus).toContain("classList.remove('menu-open')");
  });

  it('Umschalt wartet kurz: kommt Umschalt + 1 … 5, verfällt der Dash – auch im Laufen; sonst weicht die Figur nach der Wartezeit aus', () => {
    expect(SHIFT_COMBO_MS).toBeLessThanOrEqual(120);
    expect(shiftVerdict({ heldMs: 30, moving: true, released: false, combo: true, hasCombos: true })).toBe('drop');
    expect(shiftVerdict({ heldMs: 30, moving: true, released: false, combo: false, hasCombos: true })).toBe('wait');
    expect(shiftVerdict({ heldMs: SHIFT_COMBO_MS, moving: true, released: false, combo: false, hasCombos: true })).toBe('dash');
    expect(shiftVerdict({ heldMs: 10, moving: false, released: true, combo: false, hasCombos: true })).toBe('dash');
    expect(shiftVerdict({ heldMs: 5000, moving: false, released: false, combo: false, hasCombos: true })).toBe('wait');
    // ohne belegte Umschalt-Kombinationen bleibt der Dash im Laufen sofort
    expect(shiftVerdict({ heldMs: 0, moving: true, released: false, combo: false, hasCombos: false })).toBe('dash');
    expect(DEFAULT_KEYS.art6).toEqual(['Shift+Digit1']);
  });
});

// ---------- 2. Kombos aller 15 Klassen ----------

const SPEC_STYLE = (id: SpecId): ActionStyleId => SPECS[id].style;

interface Foe { x: number; z: number; hits: number }
class World implements ActionWorld {
  foes: Foe[] = [];
  shots: string[] = [];
  log: string[] = [];
  height(): number { return 0; }
  move(b: ActionBody, dx: number, dz: number): void { b.x += dx; b.z += dz; }
  teleport(b: ActionBody, x: number, z: number): boolean { b.x = x; b.z = z; return true; }
  targets(x: number, z: number, r: number, out: ActionTarget[]): number {
    let n = 0;
    this.foes.forEach((f, i) => {
      if (n >= out.length || Math.hypot(f.x - x, f.z - z) > r + 0.45) return;
      const t = out[n++];
      t.id = `f${i}`; t.x = f.x; t.y = 0; t.z = f.z; t.radius = 0.45; t.height = 1.8; t.yaw = 0;
      t.alive = true; t.airborne = false; t.mass = false; t.broken = false; t.boss = false; t.ref = i;
    });
    return n;
  }
  hit(t: ActionTarget, _h: ActionHit, m: ActionMove, _c: HitContext): number { this.foes[t.ref].hits++; this.log.push(m.id); return 1; }
  drag(): void {}
  shoot(_h: ActionHit, m: ActionMove): void { this.shots.push(m.id); }
}

function chain(style: ActionStyleId, foeZ = 6.4) {
  const w = new World();
  w.foes.push({ x: 0, z: foeZ, hits: 0 });
  const eng = new ActionCombatEngine(createFighter('k', style));
  const inp: ActionInput = makeInput();
  const ev: string[] = [];
  const press = (n: number, light: boolean) => {
    for (let i = 0; i < n; i++) {
      Object.assign(inp, { light: light && i === 0, heavy: false, jump: false, dash: false, skill: 0, geist: 0, awaken: false, aura: false });
      eng.step(inp, w, DT);
      for (let k = 0; k < eng.events.n; k++) ev.push(`${eng.events.items[k].type}:${eng.f.moveId}`);
    }
  };
  for (let i = 0; i < ACTION_STYLES[style].light.length + 1; i++) press(12, true);
  press(50, false);
  return { w, ev, eng };
}

describe('4.7C eigene Standardangriffe und Kombos aller 15 Klassen', () => {
  it('jede Spezialisierung hat ihre eigene Kette (Namen nirgends doppelt) mit Finisher am Ende', () => {
    const seen = new Map<string, string>();
    for (const id of SPEC_IDS) {
      const st = ACTION_STYLES[SPEC_STYLE(id)];
      // 4.93A: die beiden Faustkämpfer-Pfade führen eine 4er-Kombo (der vierte Schlag ist der Flächen-Finisher)
      expect(st.light.length, id).toBeGreaterThanOrEqual(id === 'schnell' || id === 'kraeftig' ? 4 : 5);
      expect(st.light[st.light.length - 1].finisher, id).toBe(true);
      for (const m of st.light) {
        const prev = seen.get(m.label);
        expect(prev, `${m.label} (${id} / ${prev})`).toBeUndefined();
        seen.set(m.label, id);
      }
    }
  });

  it('Faji-Wirker: reiner Elementarkampf – nur Zauber-Clips, jede Stufe ein Geschoss, Strahl oder elementare Fläche, eigener Finisher', () => {
    for (const id of [...FAJI_ARTS, 'priester'] as ActionStyleId[]) {
      const st = ACTION_STYLES[id];
      expect(st.light.map((m) => m.label), id).toEqual(COMBO_NAMES[id].l);
      for (const m of [...st.light, ...st.branch, st.heavy, ...st.air]) {
        expect(m.clip.startsWith('Ranged_Magic_'), `${m.id}: ${m.clip}`).toBe(true);
        for (const h of m.hits) expect(!!h.projectile || h.shape === 'line' || h.shape === 'circle', `${m.id}`).toBe(true);
        expect(m.push, m.id).toBeLessThan(0.05);
      }
      // Geschosse in der Kette: Elementar-Projektile (Wasser peitscht mit Strahlen, Blitz und Sonne mischen Bögen und Geschosse)
      const projectiles = st.light.flatMap((m) => m.hits).filter((h) => h.projectile);
      if (id !== 'wasser') expect(projectiles.length, id).toBeGreaterThanOrEqual(1);
      // Finisher: elementare Fläche oder Salve, getragen vom Element (vfx)
      const fin = st.light[st.light.length - 1];
      expect(fin.hits.length, id).toBeGreaterThan(0);
      expect(fin.vfx, id).toBe(st.element);
    }
    // die Elemente schießen ihre eigenen Geschosse
    const kindOf = (id: ActionStyleId) => new Set(ACTION_STYLES[id].light.flatMap((m) => m.hits).map((h) => h.projectile?.kind).filter(Boolean));
    expect(kindOf('feuer').has('flame')).toBe(true);
    expect(kindOf('eis').has('frost')).toBe(true);
    expect(kindOf('wind').has('wind')).toBe(true);
    expect(kindOf('mond').has('crescent')).toBe(true);
    expect(kindOf('schwarzloch').has('void')).toBe(true);
    expect(kindOf('blitz').has('bolt')).toBe(true);
    expect(ACTION_STYLES.eis.light[2].hits[0].projectile!.count).toBeGreaterThanOrEqual(5);
    expect(ACTION_STYLES.wasser.light[0].hits[0].shape).toBe('line');
  });

  it('Engine: die Elementar-Kette schießt (L1 – L4) und trifft mit dem Finisher, ohne die Figur nach vorn zu schieben', () => {
    for (const id of ['feuer', 'eis', 'wind', 'schwarzloch', 'priester'] as ActionStyleId[]) {
      const { w, ev, eng } = chain(id);
      expect(w.shots.length, id).toBeGreaterThanOrEqual(2);
      expect(w.log.some((m) => m === `${id}.l5`), `${id}: ${w.log.join(',')}`).toBe(true);
      expect(Math.hypot(eng.f.x, eng.f.z), id).toBeLessThan(0.5);
      expect(ev.some((e) => e.startsWith(`move:${id}.l5`)), id).toBe(true);
    }
  });

  it('Priester: Lichtlanzen und Glyphen-Salve, der Kombo-Finisher sendet eine heilende Lichtwelle für dich und Verbündete', () => {
    const st = ACTION_STYLES.priester;
    expect(st.light[0].hits[0].projectile?.pierce).toBe(true);
    expect(st.light[2].hits[0].projectile?.count).toBe(3);
    const fin = st.light[4];
    expect(fin.heal).toBeCloseTo(PRIEST_CHAIN_HEAL.heal, 5);
    expect(fin.healR).toBeGreaterThanOrEqual(10);
    const { ev } = chain('priester');
    expect(ev.filter((e) => e.startsWith('heal:priester.l5')).length).toBe(1);
  });

  it('Waffen und Fäuste: Kreuzschnitt-Dash, Luft-Wirbel, weitreichender Iai-Schnitt, Überkopf-Spalter, Nachbild- und Schockwellen-Fäuste', () => {
    const last = (id: ActionStyleId) => { const l = ACTION_STYLES[id].light; return l[l.length - 1]; };
    const d = last('doppel');
    expect(d.label).toBe('Kreuzschnitt-Dash'); expect(d.dashTo).toBeGreaterThan(5); expect(d.through).toBe(true);
    const s = last('saebel');
    expect(s.label).toContain('Luftwirbel'); expect(s.rise).toBeGreaterThan(4);
    const l = last('langklinge');
    expect(l.label).toBe('Iai-Fernschnitt'); expect(Math.max(...l.hits.map((h) => (h.shape === 'line' ? h.range : 0)))).toBeGreaterThanOrEqual(10);
    const z = last('zweihaender');
    expect(z.label).toBe('Überkopf-Spalter'); expect(z.hyper).toBe(true); expect(z.hits.some((h) => h.shape === 'line')).toBe(true);
    // 4.93A: Linker Blitz-Jab → Rechter Haken → Wirbel-Drehkick → Vakuum-Stoß (komprimierte Luftdruckkugel, 18 m weit)
    expect(ACTION_STYLES.sturmfaust.light.map((m) => m.label)).toEqual(['Linker Blitz-Jab', 'Rechter Haken', 'Wirbel-Drehkick', 'Vakuum-Stoß']);
    expect(last('sturmfaust').afterimage).toBe(true);
    expect(last('sturmfaust').hits.some((h) => h.shape === 'line' && h.range === 18)).toBe(true);
    // Rammfaust → Schulterstoß → Aufwärtshaken → Erd-Schmetterschlag (erschüttert 6 m, bricht Haltungen)
    expect(ACTION_STYLES.erdspalter.light.map((m) => m.label)).toEqual(['Rammfaust', 'Schulterstoß', 'Aufwärtshaken', 'Erd-Schmetterschlag']);
    const e = last('erdspalter');
    expect(e.hyper).toBe(true); expect(e.hits.some((h) => h.shape === 'circle' && h.range === 6 && h.poise >= 80)).toBe(true);
    // Rhythmus: Doppelklinge schnell und viele Schritte, Großschwert langsam und wuchtig
    const avg = (id: ActionStyleId) => ACTION_STYLES[id].light.reduce((a, m) => a + m.dur, 0) / ACTION_STYLES[id].light.length;
    expect(avg('doppel')).toBeLessThan(avg('zweihaender'));
    expect(ACTION_STYLES.doppel.light.length).toBeGreaterThan(ACTION_STYLES.zweihaender.light.length);
    for (const id of PHYSICAL_STYLES) expect(ACTION_STYLES[id].light.every((m) => !m.clip.startsWith('Ranged_Magic_')), id).toBe(true);
  });
});

// ---------- 3. Keine unsichtbaren Grenzen ----------

function isle(blockers: WalkIsland['blockers'] = []): WalkIsland {
  return { x: 0, z: 0, r: 40, coast: [], hills: [], shelf: 0.25, beachY: 1, hillY: 1, blockers } as unknown as WalkIsland;
}

describe('4.7C keine unsichtbaren Grenzen', () => {
  it('Strand: Gegner bleiben an der Wasserlinie, die Spielfigur (freier Läufer) läuft ins Meer', () => {
    const g = new IslandGround();
    g.add(isle());
    // knapp jenseits der Wasserlinie (Küste 40 m, Böschung bis 41,6 m)
    const beyond = { x: 43, z: 0 };
    const clamped = g.constrain(beyond.x, beyond.z, 0.35, 1);
    expect(Math.hypot(clamped.x, clamped.z)).toBeLessThan(42);
    const free = g.constrain(beyond.x, beyond.z, 0.35, 1, true);
    expect(free).toEqual(beyond);
    // weit draußen auf See: niemand wird zurückgeschoben
    expect(g.constrain(300, 0, 0.35, 0, true)).toEqual({ x: 300, z: 0 });
  });

  it('Steg: die Spielfigur tritt seitlich und an der Spitze ins Wasser, alle anderen bleiben auf den Bohlen', () => {
    const g = new IslandGround();
    g.piers = [{ ax: 100, az: 0, bx: 130, bz: 0, hw: 1.5, y: 1.45 } as never];
    const side = g.constrain(115, 2.2, 0.35, 1.45);
    expect(Math.abs(side.z)).toBeLessThan(1.5);
    expect(g.constrain(115, 2.2, 0.35, 1.45, true)).toEqual({ x: 115, z: 2.2 });
    const tip = g.constrain(130.3, 0, 0.35, 1.45);
    expect(tip.x).toBeLessThan(130);
    expect(g.constrain(130.3, 0, 0.35, 1.45, true).x).toBeCloseTo(130.3, 5);
  });

  it('Zäune, Trockenmauern, Fässer: im Gehen eine Wand, im Sprung darüber hinweg; Häuser bleiben Wände', () => {
    const fence = { x: 10, z: 0, r: 2, hw: 2, hd: 0.15, yaw: Math.PI / 2, low: 1.0 };
    const house = { x: -10, z: 0, r: 4, hw: 3, hd: 3, yaw: 0 };
    const g = new IslandGround();
    g.add(isle([fence, house]));
    const walk = g.constrain(10, 0.1, 0.35, 1, true);
    expect(Math.abs(walk.x - 10)).toBeGreaterThan(0.1);
    const jump = g.constrain(10, 0.1, 0.35, 1 + 1.2, true);
    expect(jump).toEqual({ x: 10, z: 0.1 });
    // ein Haus ohne Dach-Angabe bleibt in jeder Höhe eine Wand
    const into = g.constrain(-10, 0.5, 0.35, 1 + 1.5, true);
    expect(Math.abs(into.x + 10) > 2 || Math.abs(into.z) > 2).toBe(true);
    // Bauwerke tragen ihre Höhe (Zaun, Mauer, Fass, Kisten, Heu)
    const arch = read('src/world/architecture.ts');
    for (const m of ["circles: [], low: 1.0 };", "low: 1.35 };", "circles: [[0.5]], low: 1.0 };", "circles: [[1.05]], low: 1.2 };"]) expect(arch).toContain(m);
  });

  it('Schiffsdeck: im Gehen hält die Reling, im Sprung über Relingshöhe geht es frei über Bord', () => {
    const m = new Array(16).fill(0); m[0] = m[5] = m[10] = m[15] = 1;
    const s = { entityId: 'ship-W', x: 0, z: 0, heading: 0, cls: { L: 30 }, model: { deckY: 2, group: { position: { y: 0 }, matrixWorld: { elements: m }, updateMatrixWorld() { /* Einheit */ } }, halfWidth: () => 4, blockers: [], quarter: null, fore: null, cabinRoof: null } };
    const dg = new DeckGround(s as never);
    const comp = new CompositeGround(new IslandGround());
    comp.setDecks(dg);
    const walking = comp.constrain(3.9, 0, 0.35, 2, true);
    expect(Math.abs(walking.x)).toBeLessThan(3.6);
    const hop = comp.constrain(3.9, 0, 0.35, 2 + RAIL_HOP + 0.2, true);
    expect(hop.x).toBeCloseTo(3.9, 5);
    // Gegner und Crew (kein freier Läufer) bleiben an Bord, auch im Sprung
    expect(Math.abs(comp.constrain(3.9, 0, 0.35, 3.5).x)).toBeLessThan(3.6);
  });

  it('Einführung: keine unsichtbare Leine mehr um Ankerglück – nur eine Erinnerung, das Schiff wird nicht zurückgeschoben', () => {
    const src = read('src/world/seaWorld.ts');
    const body = src.slice(src.indexOf('private keepOnLeash('), src.indexOf('private keepOnLeash(') + 900);
    expect(body).not.toMatch(/s\.x = |s\.z = |s\.speed \*=/);
    expect(body).toContain('onMessage');
  });
});

// ---------- 4. Wasserlauf ----------

describe('4.7C Wasserlauf zu Fuß, begrenzt durch die Ausdauer', () => {
  it('Wasser unter den Füßen: Meer (kein Land) oder Boden deutlich unter der Oberfläche; an Land nicht', () => {
    expect(isWater(-Infinity, 0)).toBe(true);
    expect(isWater(-2, 0.1)).toBe(true);
    expect(isWater(0.5, 0)).toBe(false);
    expect(isWater(-0.05, 0)).toBe(false);
    expect(isWater(-Infinity, Number.NaN)).toBe(false);
  });

  it('Ausdauer-Verbrauch: Stehen < Gehen < Laufen; an Land keine Wirkung', () => {
    expect(waterDrain(0)).toBeLessThan(waterDrain(0.5));
    expect(waterDrain(0.5)).toBeLessThan(waterDrain(1));
    const s = newWaterWalk();
    expect(stepWaterWalk(s, false, 50, 100, 1, 1).stamina).toBe(50);
    expect(s.onWater).toBe(false);
  });

  it('bis 0: der Wasserlauf endet, die Figur schwimmt, erholt sich langsam und steigt wieder aufs Wasser; Seemüdigkeit senkt die Höchst-Ausdauer', () => {
    const s = newWaterWalk();
    let st = 100, t = 0, ev = '';
    while (!s.swimming && t < 60) { const r = stepWaterWalk(s, true, st, 100, 1, DT); st = r.stamina; ev = r.ev; t += DT; }
    expect(s.swimming).toBe(true);
    expect(ev).toBe('sink');
    expect(st).toBe(0);
    expect(t).toBeCloseTo(100 / WATER_WALK.drainRun, 0);
    expect(s.fatigue).toBeCloseTo(WATER_WALK.fatigueStep, 5);
    // schwimmen: langsame Erholung bis zum Wiederaufstieg
    let rise = 0;
    for (let i = 0; i < 60 * 60 && s.swimming; i++) { const r = stepWaterWalk(s, true, st, 100, 1, DT); st = r.stamina; if (r.ev === 'rise') rise++; }
    expect(rise).toBe(1);
    expect(st).toBeGreaterThanOrEqual(waterCap(s, 100) * WATER_WALK.resumeAt - 1e-6);
    expect(st).toBeLessThanOrEqual(waterCap(s, 100));
    // an Land: alles zurück
    stepWaterWalk(s, false, st, 100, 0, DT);
    expect(s.fatigue).toBe(0);
    expect(s.swimming).toBe(false);
  });

  it('kalibriert: genug für Küstenkämpfe und Hafen-Überquerungen, aber nie von Insel zu Insel (Inseln liegen hunderte Meter auseinander)', () => {
    const r = waterRange(6.2);
    expect(r.walk).toBeGreaterThan(60);
    expect(r.walk).toBeLessThan(260);
    expect(r.cycles).toBeGreaterThanOrEqual(2);
    expect(WATER_WALK.swimSpeedK).toBeLessThan(0.5);
    // Schwimmen: kein Kampf, Sprung aus dem Wasser kostet Ausdauer
    const foot = read('src/entities/player/playerFoot.ts');
    expect(foot).toMatch(/if \(this\.water\.swimming\) \{\s*inp\.light = inp\.heavy = inp\.dash/);
    expect(foot).toContain('WATER_WALK.jumpCost');
  });
});
