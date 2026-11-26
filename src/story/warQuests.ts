// Phase 4.7E – Live-Kriegs-Quests: entstehen von selbst aus der laufenden Welt-Simulation (world/factionWarEngine.ts) und hängen direkt an ihren
// Einheiten (Armadas, Konvois, Blockaden, Belagerungen, Inselbesitz).
//
// Rein und MMO-tauglich: kein three.js, kein DOM, kein `Math.random`; der Zustand (`WarQuestState`) ist JSON und steht im Spielstand
// (`world.warQuests`, Version 27). Die Ziele werden nie „gezählt“, sondern aus der Welt gelesen: versenken verbündete KI-Schiffe Angreifer, sinkt die
// Zahl im Auftrag genauso wie bei eigenen Treffern. Mitspieler (Phase 4.8A: Gruppen bis 5) teilen denselben Auftrag: `members` und `contrib`
// halten Teilnahme und Beitrag je Spieler, `join` nimmt eine ganze Gruppe auf, `rewardFor` gibt jedem seinen Lohn. Anzeige-Texte (Fortschritt in
// Worten) baut die Oberfläche aus den Zahlen – je Takt entsteht hier nichts Neues.
import { CONTRACT_TIER_K } from '../data/nations';
import type { Rarity } from '../data/rarity';
import { shipsAlive, type ArmadaState, type FactionWarEngine } from '../world/factionWarEngine';

/** Arten: Insel-Verteidigung, Invasions-Unterstützung, Konvoi-Geleitschutz, Nachschub-Sabotage, Blockade brechen, Gegenangriff (Rückeroberung) */
export type WarQuestKind = 'verteidigung' | 'invasion' | 'geleit' | 'sabotage' | 'blockade' | 'gegenangriff';
export const WAR_QUEST_KINDS: readonly WarQuestKind[] = ['verteidigung', 'invasion', 'geleit', 'sabotage', 'blockade', 'gegenangriff'];
export type WarQuestStatus = 'aktiv' | 'erfolg' | 'gescheitert';

export const WAR_QUEST_LABEL: Record<WarQuestKind, string> = {
  verteidigung: 'Insel-Verteidigung', invasion: 'Invasions-Unterstützung', geleit: 'Konvoi-Geleitschutz', sabotage: 'Nachschub-Sabotage',
  blockade: 'Blockade brechen', gegenangriff: 'Gegenangriff',
};

/** Zahlen der Live-Kriegs-Quests */
export const WAR_QUEST = {
  /** Gruppengröße für die gemeinsame Annahme (Phase 4.8A) */
  groupMax: 5,
  /** Teilnehmer je Auftrag höchstens (Welt-Server) */
  membersMax: 40,
  /** Einsatzgebiet um den Marker (m): wer hier ist, nimmt teil (Beitrag je Sekunde) */
  zone: 1500,
  presence: 0.4,
  /** ab diesem Beitrag gibt es Lohn (Kriegspunkte und Anwesenheit) */
  minContrib: 8,
  /** gleichzeitig laufende Aufträge eines Teams höchstens; beendete bleiben so lange (s) im Auftragsbuch */
  maxActive: 8,
  linger: 600,
  /** ab so vielen Transportern ist ein Konvoi ein eigener Auftrag (Belagerungs-Nachschub immer) */
  bigConvoy: 2,
  /** Laufzeit je Art (s) */
  deadline: { verteidigung: 1800, invasion: 2100, geleit: 1800, sabotage: 1500, blockade: 1500, gegenangriff: 2100 } as Record<WarQuestKind, number>,
  /** Grundlohn je Art: Gold, Ehre, Ansehen beim Team, Seltenheit der Ausrüstung */
  reward: {
    verteidigung: { gold: 900, honor: 30, standing: 10, gear: 'selten' },
    invasion: { gold: 1000, honor: 30, standing: 10, gear: 'selten' },
    geleit: { gold: 650, honor: 20, standing: 7, gear: 'gewoehnlich' },
    sabotage: { gold: 600, honor: 20, standing: 7, gear: 'gewoehnlich' },
    blockade: { gold: 750, honor: 24, standing: 8, gear: 'selten' },
    gegenangriff: { gold: 1150, honor: 35, standing: 12, gear: 'episch' },
  } as Record<WarQuestKind, { gold: number; honor: number; standing: number; gear: Rarity }>,
} as const;

/** Ziel in Zahlen (die Oberfläche macht Worte daraus): `left` von `total` (Schiffe, Garnison), `progress` 0 … 1 (Belagerung, Fahrt, Zeit) */
export interface WarQuestObjective { total: number; left: number; progress: number }
export interface WarQuestReward { gold: number; xp: number; honor: number; standing: number; gear: Rarity | null }

export interface WarQuest {
  id: string;
  /** Art und Bezug (`verteidigung:ar12`): nie zwei Aufträge für dieselbe Einheit */
  key: string;
  kind: WarQuestKind;
  /** Team, für das der Auftrag gilt, und der Gegner */
  team: string;
  foe: string | null;
  islandId: string;
  islandName: string;
  /** Einheiten der Welt-Simulation, an denen der Auftrag hängt */
  armadaId: string | null;
  siegeId: string | null;
  title: string;
  text: string;
  /** 1 = Auftrag, 2 = umgeschlagen (Insel gefallen → Gegenangriff) */
  stage: number;
  status: WarQuestStatus;
  createdAt: number;
  endedAt: number;
  deadline: number;
  /** Marker (Seekarte, Kompass, Minikarte): folgt der Einheit */
  x: number;
  z: number;
  obj: WarQuestObjective;
  /** Teilnehmer (Spieler-Kennungen) und Beitrag je Spieler */
  members: string[];
  contrib: Record<string, number>;
  reward: WarQuestReward;
  /** Spieler, die ihren Lohn schon bekommen haben */
  paid: string[];
  /** Ausgang in Worten */
  note: string;
}

export interface WarQuestState { v: 1; seq: number; quests: WarQuest[] }

export type WarQuestEvent = { type: 'neu' | 'stufe' | 'ende'; quest: WarQuest };

export const newWarQuestState = (): WarQuestState => ({ v: 1, seq: 0, quests: [] });

const num = (v: unknown, d: number, lo = -1e12, hi = 1e12) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const str = (v: unknown, d = '', n = 160) => (typeof v === 'string' ? v.slice(0, n) : d);
const RARITY: readonly Rarity[] = ['gewoehnlich', 'selten', 'episch', 'legendaer'];

/** Säubern beim Laden (kaputt oder fremd: leer beginnen; laufende Aufträge prüft der nächste Takt gegen die Welt) */
export function cleanWarQuests(raw: unknown): WarQuestState {
  const s = newWarQuestState();
  if (!raw || typeof raw !== 'object') return s;
  const o = raw as Record<string, any>;
  if (o.v !== 1) return s;
  s.seq = Math.round(num(o.seq, 0, 0, 1e9));
  if (!Array.isArray(o.quests)) return s;
  for (const q of o.quests.slice(0, 32)) {
    if (!q || typeof q !== 'object' || !WAR_QUEST_KINDS.includes(q.kind) || typeof q.team !== 'string' || typeof q.islandId !== 'string') continue;
    const contrib: Record<string, number> = {};
    if (q.contrib && typeof q.contrib === 'object') for (const [k, v] of Object.entries(q.contrib)) contrib[k.slice(0, 64)] = num(v, 0, 0, 1e6);
    const rw = q.reward && typeof q.reward === 'object' ? q.reward : {};
    s.quests.push({
      id: str(q.id, `wq${++s.seq}`, 32), key: str(q.key, `${q.kind}:alt`, 64), kind: q.kind, team: str(q.team, '', 32), foe: typeof q.foe === 'string' ? str(q.foe, '', 32) : null,
      islandId: str(q.islandId, '', 64), islandName: str(q.islandName, q.islandId, 64), armadaId: typeof q.armadaId === 'string' ? str(q.armadaId, '', 32) : null,
      siegeId: typeof q.siegeId === 'string' ? str(q.siegeId, '', 32) : null, title: str(q.title, WAR_QUEST_LABEL[q.kind as WarQuestKind]), text: str(q.text, '', 400),
      stage: Math.round(num(q.stage, 1, 1, 2)), status: q.status === 'erfolg' || q.status === 'gescheitert' ? q.status : 'aktiv',
      createdAt: num(q.createdAt, 0, 0, 1e10), endedAt: num(q.endedAt, -1, -1, 1e10), deadline: num(q.deadline, 0, 0, 1e10), x: num(q.x, 0), z: num(q.z, 0),
      obj: { total: num(q.obj?.total, 0, 0, 1e5), left: num(q.obj?.left, 0, 0, 1e5), progress: num(q.obj?.progress, 0, 0, 1) },
      members: Array.isArray(q.members) ? q.members.filter((m: unknown): m is string => typeof m === 'string').slice(0, WAR_QUEST.membersMax).map((m: string) => m.slice(0, 64)) : [],
      contrib,
      reward: { gold: num(rw.gold, 0, 0, 1e5), xp: num(rw.xp, 0, 0, 1e6), honor: num(rw.honor, 0, 0, 500), standing: num(rw.standing, 0, 0, 50), gear: RARITY.includes(rw.gear) ? rw.gear : null },
      paid: Array.isArray(q.paid) ? q.paid.filter((m: unknown): m is string => typeof m === 'string').slice(0, WAR_QUEST.membersMax) : [],
      note: str(q.note, '', 200),
    });
  }
  return s;
}

/** Transporter eines Verbands (lebend) */
function transportsAlive(a: ArmadaState): number {
  let n = 0;
  for (const sh of a.ships) if (!sh.down && sh.role === 'transport') n++;
  return n;
}

/** Anteil der zurückgelegten Route (ohne Zuweisung) */
function routeProgress(a: ArmadaState): number {
  const n = a.route.length / 2;
  return n <= 1 ? 1 : Math.max(0, Math.min(1, (a.leg - 1) / (n - 1)));
}

/**
 * Erzeugt, führt und beendet die Live-Kriegs-Quests eines Teams aus dem Zustand der Engine. Der Takt (`update`) liest nur: Armadas, Konvois,
 * Blockaden, Belagerungen und Besitz; Ereignisse (neu, Stufe, Ende) gehen an die Oberfläche (Funkspruch, Belohnung).
 */
export class WarQuestDirector {
  constructor(public state: WarQuestState = newWarQuestState()) {}

  /** Aufträge nach Kennung bzw. Bezug (wenige Einträge, Schleife statt Tabelle) */
  byId(id: string): WarQuest | null { for (const q of this.state.quests) if (q.id === id) return q; return null; }
  private hasKey(kind: WarQuestKind, armadaId: string): boolean {
    for (const q of this.state.quests) if (q.armadaId === armadaId && (q.kind === kind || (kind === 'verteidigung' && q.kind === 'gegenangriff'))) return true;
    return false;
  }

  /** Laufende Aufträge eines Teams (in `out`) */
  active(team: string | null, out: WarQuest[]): WarQuest[] {
    out.length = 0;
    if (!team) return out;
    for (const q of this.state.quests) if (q.team === team && q.status === 'aktiv') out.push(q);
    return out;
  }

  private activeCount(team: string): number {
    let n = 0;
    for (const q of this.state.quests) if (q.team === team && q.status === 'aktiv') n++;
    return n;
  }

  /** Ein Takt (alle 0,5 s genügt): neue Aufträge aus der Welt, laufende nachführen, beendete entfernen. Ereignisse in `out` */
  update(eng: FactionWarEngine, team: string | null, t: number, out: WarQuestEvent[]): WarQuestEvent[] {
    out.length = 0;
    if (team) {
      this.spawn(eng, team, t, out);
      for (const q of this.state.quests) if (q.status === 'aktiv' && q.team === team) this.step(eng, q, t, out);
    }
    // beendete Aufträge stehen noch eine Weile im Auftragsbuch
    const list = this.state.quests;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].status !== 'aktiv' && t - list[i].endedAt > WAR_QUEST.linger) list.splice(i, 1);
    return out;
  }

  // ---------- Entstehen ----------

  private spawn(eng: FactionWarEngine, team: string, t: number, out: WarQuestEvent[]) {
    const s = eng.state;
    for (let k = 0; k < s.armadas.length; k++) {
      if (this.activeCount(team) >= WAR_QUEST.maxActive) return;
      const a = s.armadas[k];
      if (a.status === 'aufgeloest' || a.status === 'heimkehr') continue;
      const owner = eng.ownerOf(a.target);
      if (a.nation === team) {
        // eigene Invasion (auch Gegenschlag) und große eigene Konvois
        if (a.purpose === 'angriff' && owner !== team && !this.hasKey('invasion', a.id)) this.create(eng, 'invasion', team, owner, a, t, out);
        else if (a.purpose === 'konvoi' && !a.delivered && a.cargo && (a.supplies || transportsAlive(a) >= WAR_QUEST.bigConvoy) && !this.hasKey('geleit', a.id)) this.create(eng, 'geleit', team, null, a, t, out);
        continue;
      }
      if (!eng.atWar(team, a.nation)) continue;
      if (a.purpose === 'angriff' && owner === team && !this.hasKey('verteidigung', a.id)) this.create(eng, 'verteidigung', team, a.nation, a, t, out);
      else if (a.purpose === 'blockade' && a.status === 'blockade' && owner === team && !this.hasKey('blockade', a.id)) this.create(eng, 'blockade', team, a.nation, a, t, out);
      else if (a.purpose === 'konvoi' && !a.delivered && a.cargo && !this.hasKey('sabotage', a.id)) {
        // feindlicher Nachschub: für eine Belagerung gegen das Team oder ein großer Front-Konvoi
        const sup = eng.armadaById(a.supplies);
        const vsTeam = !!sup && eng.ownerOf(sup.target) === team;
        if (vsTeam || transportsAlive(a) >= WAR_QUEST.bigConvoy) this.create(eng, 'sabotage', team, a.nation, a, t, out);
      }
    }
  }

  private create(eng: FactionWarEngine, kind: WarQuestKind, team: string, foe: string | null, a: ArmadaState, t: number, out: WarQuestEvent[]) {
    const w = eng.island(a.target);
    if (!w) return;
    const st = this.state;
    const sg = eng.siegeOf(w.id);
    const q: WarQuest = {
      id: `wq${++st.seq}`, key: `${kind}:${a.id}`, kind, team, foe: foe ?? (kind === 'geleit' ? null : eng.ownerOf(w.id)), islandId: w.id, islandName: w.name,
      armadaId: a.id, siegeId: sg?.id ?? null, title: '', text: '', stage: 1, status: 'aktiv', createdAt: t, endedAt: -1, deadline: t + WAR_QUEST.deadline[kind],
      x: a.x, z: a.z, obj: { total: 0, left: 0, progress: 0 }, members: [], contrib: {}, reward: this.rewardOf(kind, w.tier), paid: [], note: '',
    };
    if (kind === 'invasion') { const iw = eng.state.islands[w.id]; q.obj.total = Math.max(1, Math.round(sg ? sg.garrison : iw?.garrison ?? w.garrisonMax)); }
    else q.obj.total = kind === 'geleit' || kind === 'sabotage' ? Math.max(1, transportsAlive(a)) : Math.max(1, shipsAlive(a));
    this.describe(eng, q);
    st.quests.push(q);
    this.step(eng, q, t, null);
    out.push({ type: 'neu', quest: q });
  }

  /** Titel und Auftrags-Text (bei Entstehen und Stufenwechsel) */
  private describe(eng: FactionWarEngine, q: WarQuest) {
    const foe = q.foe ? eng.registry.get(q.foe)?.name ?? q.foe : 'Der Feind';
    const foeIn = foe.replace(/^Die /, 'die ');
    const isl = q.islandName;
    switch (q.kind) {
      case 'verteidigung':
        q.title = `Insel-Verteidigung: ${isl}`;
        q.text = `${foe} greift ${isl} an! Versenke die Angreifer – besonders ihre Transporter und das Kommandoschiff – und halte an Land die Kontrollpunkte.`;
        break;
      case 'gegenangriff':
        q.title = `Gegenangriff: ${isl} zurückerobern`;
        q.text = `${isl} ist an ${foeIn} gefallen. Dein Team sammelt eine Gegenflotte – erobere die Insel zurück, bevor sich die Besatzer eingraben.`;
        break;
      case 'invasion':
        q.title = `Invasions-Unterstützung: ${isl}`;
        q.text = `Eine Armada deines Teams läuft gegen ${isl} aus. Begleite sie, versenke die Verteidiger und erobere an Land die Kontrollpunkte.`;
        break;
      case 'geleit':
        q.title = `Konvoi-Geleitschutz nach ${isl}`;
        q.text = `Ein Nachschub-Konvoi deines Teams bringt Rekruten, Proviant und Kriegsgut nach ${isl}. Schütze die Transporter vor Patrouillen und Kaperern.`;
        break;
      case 'sabotage':
        q.title = `Nachschub-Sabotage: Konvoi nach ${isl}`;
        q.text = `Ein Konvoi ${foe === 'Der Feind' ? 'des Feindes' : `von ${foeIn}`} versorgt die Front bei ${isl}. Versenke seine Transporter, bevor sie ankommen – ohne Nachschub bricht die Moral der Feinde.`;
        break;
      case 'blockade':
        q.title = `Blockade brechen: ${isl}`;
        q.text = `${foe} blockiert den Hafen von ${isl}: die Insel liefert nichts mehr an deine Kriegskasse. Versenke die Blockadeflotte und öffne den Hafen.`;
        break;
    }
  }

  /** Lohn nach Art und Größe der Insel (wie bei Kriegsaufträgen) */
  private rewardOf(kind: WarQuestKind, tier: keyof typeof CONTRACT_TIER_K): WarQuestReward {
    const b = WAR_QUEST.reward[kind], k = CONTRACT_TIER_K[tier] ?? 0;
    const gold = Math.round((b.gold * (1 + k)) / 10) * 10;
    const gear: Rarity = (tier === 'mega' || tier === 'festung') && b.gear === 'selten' ? 'episch' : b.gear;
    return { gold, xp: Math.round(gold * 1.6), honor: Math.round(b.honor * (1 + 0.5 * k)), standing: b.standing, gear };
  }

  // ---------- Nachführen ----------

  /** Ziel und Marker aus der Welt lesen, Ausgang prüfen (ohne Zuweisung, außer beim Stufenwechsel) */
  private step(eng: FactionWarEngine, q: WarQuest, t: number, out: WarQuestEvent[] | null) {
    const a = eng.armadaById(q.armadaId);
    const owner = eng.ownerOf(q.islandId);
    const w = eng.island(q.islandId);
    const sg = eng.siegeOf(q.islandId);
    if (sg) q.siegeId = sg.id;
    const gone = !a || a.status === 'aufgeloest';
    switch (q.kind) {
      case 'verteidigung': {
        if (a && !gone) { q.obj.left = shipsAlive(a); if (a.status === 'anmarsch' || a.status === 'gefecht') { q.x = a.x; q.z = a.z; } else if (w) { q.x = w.x; q.z = w.z; } }
        else q.obj.left = 0;
        q.obj.progress = sg && sg.attacker === q.foe ? sg.progress : 0;
        if (owner !== q.team) { this.turn(eng, q, t, out); return; }
        if ((gone || a.status === 'heimkehr') && !(sg && sg.attacker === q.foe)) { this.end(q, 'erfolg', 'Angriff abgewehrt – die Insel bleibt in der Hand deines Teams', t, out); return; }
        break;
      }
      case 'gegenangriff': {
        const st = eng.state.islands[q.islandId];
        q.obj.left = Math.round(sg && sg.defender === owner ? sg.garrison : st?.garrison ?? 0);
        q.obj.progress = sg && sg.attacker === q.team ? sg.progress : 0;
        // Marker: die Gegenflotte des Teams, sonst die Insel
        const counter = this.counterFleet(eng, q);
        if (counter && counter.status === 'anmarsch') { q.x = counter.x; q.z = counter.z; } else if (w) { q.x = w.x; q.z = w.z; }
        if (owner === q.team) { this.end(q, 'erfolg', 'Insel zurückerobert – die Flagge deines Teams weht wieder', t, out); return; }
        break;
      }
      case 'invasion': {
        const st = eng.state.islands[q.islandId];
        q.obj.left = Math.round(sg && sg.attacker === q.team ? sg.garrison : st?.garrison ?? 0);
        q.obj.progress = sg && sg.attacker === q.team ? sg.progress : 0;
        if (a && !gone && (a.status === 'anmarsch' || a.status === 'gefecht')) { q.x = a.x; q.z = a.z; } else if (w) { q.x = w.x; q.z = w.z; }
        if (owner === q.team) { this.end(q, 'erfolg', 'Die Insel ist erobert', t, out); return; }
        if (gone || a.status === 'heimkehr') { this.end(q, 'gescheitert', 'Die Armada hat abgedreht', t, out); return; }
        break;
      }
      case 'geleit':
      case 'sabotage': {
        if (a && !gone) { q.obj.left = transportsAlive(a); q.obj.progress = routeProgress(a); q.x = a.x; q.z = a.z; }
        const delivered = !!a?.delivered;
        const lost = !delivered && (gone || !a || transportsAlive(a) === 0 || a.status === 'heimkehr');
        if (q.kind === 'geleit') {
          if (delivered) { this.end(q, 'erfolg', 'Der Konvoi hat seine Ladung abgeliefert', t, out); return; }
          if (lost) { q.obj.left = 0; this.end(q, 'gescheitert', 'Der Konvoi ist verloren', t, out); return; }
        } else {
          if (delivered) { this.end(q, 'gescheitert', 'Der feindliche Nachschub ist angekommen', t, out); return; }
          if (lost) { q.obj.left = 0; this.end(q, 'erfolg', 'Der feindliche Nachschub ist versenkt', t, out); return; }
        }
        break;
      }
      case 'blockade': {
        if (a && !gone) { q.obj.left = shipsAlive(a); if (a.until > a.createdAt) q.obj.progress = Math.max(0, Math.min(1, (t - q.createdAt) / Math.max(1, a.until - q.createdAt))); }
        if (w) { q.x = w.x; q.z = w.z; }
        if (owner !== q.team) { this.end(q, 'gescheitert', 'Die Insel ist verloren', t, out); return; }
        const st = eng.state.islands[q.islandId];
        const standing = !!a && !gone && a.status === 'blockade' && st?.blockadeId === a.id;
        if (!standing) {
          // vorzeitig gebrochen (versenkt, geschlagen, abgezogen) = Erfolg; bis zum Ende gehalten = gescheitert
          const broke = !a || gone || shipsAlive(a) < q.obj.total || t < a.until - 30;
          this.end(q, broke ? 'erfolg' : 'gescheitert', broke ? 'Die Blockade ist gebrochen – der Hafen liefert wieder' : 'Die Blockade hielt bis zuletzt', t, out);
          return;
        }
        break;
      }
    }
    if (t > q.deadline) this.end(q, 'gescheitert', 'Die Zeit ist abgelaufen', t, out);
  }

  /** Gegenflotte des Teams gegen die gefallene Insel (Gegenschlag), falls schon unterwegs */
  private counterFleet(eng: FactionWarEngine, q: WarQuest): ArmadaState | null {
    for (const a of eng.state.armadas) if (a.nation === q.team && a.purpose === 'angriff' && a.target === q.islandId && a.status !== 'aufgeloest') return a;
    return null;
  }

  /** Die Insel ist trotz Gegenwehr gefallen: der Auftrag schlägt um in „Gegenangriff: Insel zurückerobern“ */
  private turn(eng: FactionWarEngine, q: WarQuest, t: number, out: WarQuestEvent[] | null) {
    q.kind = 'gegenangriff';
    q.stage = 2;
    q.foe = eng.ownerOf(q.islandId);
    q.deadline = t + WAR_QUEST.deadline.gegenangriff;
    const w = eng.island(q.islandId);
    q.reward = this.rewardOf('gegenangriff', w?.tier ?? 'hafen');
    const st = eng.state.islands[q.islandId];
    q.obj.total = Math.max(1, Math.round(st?.garrison ?? 1));
    q.obj.left = q.obj.total;
    q.obj.progress = 0;
    this.describe(eng, q);
    out?.push({ type: 'stufe', quest: q });
  }

  private end(q: WarQuest, status: WarQuestStatus, note: string, t: number, out: WarQuestEvent[] | null) {
    if (q.status !== 'aktiv') return;
    q.status = status;
    q.note = note;
    q.endedAt = t;
    out?.push({ type: 'ende', quest: q });
  }

  // ---------- Teilnahme (Mehrspieler-tauglich) ----------

  /**
   * Eine Gruppe (bis `WAR_QUEST.groupMax` Spieler) nimmt den Auftrag gemeinsam an. Liefert false, wenn der Auftrag nicht läuft, die Gruppe zu
   * groß ist oder kein Platz mehr frei ist.
   */
  join(questId: string, playerIds: readonly string[]): boolean {
    const q = this.byId(questId);
    if (!q || q.status !== 'aktiv' || !playerIds.length || playerIds.length > WAR_QUEST.groupMax) return false;
    let fresh = 0;
    for (const p of playerIds) if (!q.members.includes(p)) fresh++;
    if (q.members.length + fresh > WAR_QUEST.membersMax) return false;
    for (const p of playerIds) if (!q.members.includes(p)) { q.members.push(p); q.contrib[p] ??= 0; }
    return true;
  }

  /** Beitrag eines Spielers gutschreiben (Kriegspunkte, Anwesenheit); er nimmt damit teil */
  contribute(q: WarQuest, playerId: string, amount: number) {
    if (q.status !== 'aktiv' || !(amount > 0)) return;
    if (!q.members.includes(playerId)) { if (q.members.length >= WAR_QUEST.membersMax) return; q.members.push(playerId); }
    q.contrib[playerId] = (q.contrib[playerId] ?? 0) + amount;
  }

  /** Anwesenheit im Einsatzgebiet (je Takt): wer dort ist, hilft – Beitrag je Sekunde */
  presence(team: string | null, playerId: string, x: number, z: number, dt: number) {
    if (!team) return;
    const r2 = WAR_QUEST.zone * WAR_QUEST.zone;
    for (const q of this.state.quests) {
      if (q.status !== 'aktiv' || q.team !== team) continue;
      const dx = q.x - x, dz = q.z - z;
      if (dx * dx + dz * dz < r2) this.contribute(q, playerId, WAR_QUEST.presence * dt);
    }
  }

  /** Kriegspunkte für das Team (Engine-Meldung): gehen an den Auftrag dieser Insel bzw. an alle, in deren Einsatzgebiet der Spieler steht */
  merit(team: string | null, playerId: string, kp: number, x: number, z: number, islandId: string | null) {
    if (!team) return;
    const r2 = WAR_QUEST.zone * WAR_QUEST.zone;
    for (const q of this.state.quests) {
      if (q.status !== 'aktiv' || q.team !== team) continue;
      const dx = q.x - x, dz = q.z - z;
      if ((islandId && q.islandId === islandId) || dx * dx + dz * dz < r2) this.contribute(q, playerId, kp);
    }
  }

  /** Lohn eines Spielers für einen gewonnenen Auftrag (null: nicht gewonnen, zu wenig beigetragen oder schon ausgezahlt) */
  rewardFor(q: WarQuest, playerId: string): WarQuestReward | null {
    if (q.status !== 'erfolg' || q.paid.includes(playerId) || (q.contrib[playerId] ?? 0) < WAR_QUEST.minContrib) return null;
    return q.reward;
  }

  markPaid(q: WarQuest, playerId: string) { if (!q.paid.includes(playerId)) q.paid.push(playerId); }
}
