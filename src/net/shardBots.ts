// Phase 4.8A – MMO-Kapitäne des lokalen Shards (rein: kein DOM, kein three.js). Solange kein echter Server läuft, bevölkern sie die geteilte
// Welt nach dem Verlassen der privaten Ankerglück-Instanz: Kapitäne aller fünf Mächte und ungebundene Neulinge – zu Fuß in Ankerglück und mit
// eigenen Schiffen vor dem Hafen. Sie laufen über denselben autoritativen Shard (`MmoAuthority`) wie echte Mitspieler: Einladungen (Annehmen
// nach kurzem Zögern, manche lehnen ab), Flüstern (Antworten, „lad mich ein“ lädt dich ein), Sagen in der Nähe, Welt-Chat, Heilung und
// Sturmhorn wirken auf ihr Leben, in einer Gruppe folgen sie dir (an Land zu Fuß, auf See im Flotten-Verbund oder an Deck deines Schiffs).
// Bewegung und Zufall sind deterministisch (eigener Startwert), je Takt entsteht nichts Neues.
import { MMO, newPlayerState, newProfile, type PartyView, type PlayerProfile, type PlayerState } from './mmoProtocol';
import type { MmoAuthority } from './mmoAuthority';
import { rideSlot } from './partyRules';
import { SPECS, CLASS_BASES, type SpecId } from '../data/classes';
import { SHIP_CLASSES } from '../data/ships';

/** Was die Kapitäne von der Welt wissen müssen (lokaler Shard: die Seewelt des leitenden Tabs) */
export interface BotWorld {
  /** Ankerglück: Mitte und Radius */
  home(): { x: number; z: number; r: number };
  /** begehbare Punkte der Stadt (Straßen); leer = Kreis um die Mitte */
  townPoints(): readonly { x: number; z: number }[];
  /** Punkt aus Hindernissen schieben (Häuser, Küste) */
  constrain(x: number, z: number, out: { x: number; z: number }): void;
  /** freies Wasser für Schiffe? */
  seaFree(x: number, z: number): boolean;
  /** Ort für das Gruppenfenster */
  zoneAt(x: number, z: number, sea: boolean): string;
}

export interface BotDef {
  id: string;
  name: string;
  team: string;
  spec: SpecId;
  level: number;
  atSea: boolean;
  gender: 'm' | 'w';
  ship: number;
  shipName: string;
  /** Anteil fehlender Lebenspunkte beim Start (verwundet, für Heilungen) */
  hurt: number;
  /** lehnt Einladungen ab */
  busy: boolean;
  lines: readonly string[];
}

const B = (id: string, name: string, team: string, spec: SpecId, level: number, atSea: boolean, gender: 'm' | 'w', ship: number, shipName: string, hurt: number, busy: boolean, lines: string[]): BotDef =>
  ({ id: `bot:${id}`, name, team, spec, level, atSea, gender, ship, shipName, hurt, busy, lines });

/** Die Kapitäne des lokalen Shards (alle Namen eigene Schöpfungen des Sturmkrone-Universums) */
export const SHARD_BOTS: readonly BotDef[] = [
  B('ragna', 'Ragna Sturmhut', 'deutschland', 'grossschwert', 18, false, 'w', 2, 'Eisenmöwe', 0.15, false, ['Moin! Wenn du Hilfe gegen die Kurogane brauchst – sag Bescheid.', 'Ich warte an der Schmiede, Grete schleift meine Klinge.']),
  B('maren', 'Maren Ashford', 'england', 'priester', 22, false, 'w', 3, 'Morgenlicht', 0, false, ['Möge das Licht deine Segel füllen. Brauchst du Heilung?', 'Ich bleibe in Ankerglück, falls jemand verwundet zurückkommt.']),
  B('femke', 'Femke van Dijkstra', 'niederlande', 'wasser', 15, false, 'w', 2, 'Goldene Gans', 0.35, false, ['Ein Händler hat mich übers Ohr gehauen – und ein Kurogane-Säbel auch. Hast du einen Heiler?', 'Gold und Pulver, Kapitän!']),
  B('aurelie', 'Aurélie Brisant', 'frankreich', 'doppel', 27, false, 'w', 3, 'Lune Rouge', 0, false, ['Bonjour! Leise Schritte, scharfe Klingen.', 'Die Sonne über den Meeren gehört Frankreich – vergiss das nicht.']),
  B('hayato', 'Hayato Kurose', 'kurogane', 'blitz', 31, false, 'm', 4, 'Raikiri-Maru', 0, false, ['Glut und Klinge. Was willst du?', 'Ich höre zu, Fremder.']),
  B('lene', 'Lene Salzwind', '', 'schnell', 6, false, 'w', 0, 'Salzkrähe', 0.25, false, ['Ich bin auch neu hier! Hast du schon den Rat der Gesandten gesehen?', 'Weißt du, wo man in Ankerglück gute Fäuste trainiert?']),
  B('bent', 'Bent Teerhand', '', 'feuer', 9, false, 'm', 1, 'Teerkessel', 0, true, ['Keine Zeit, ich muss Pech für meinen Rumpf kochen.', 'Später, Kapitän – später!']),
  B('tjark', 'Tjark Nebelsegel', 'deutschland', 'langschwert', 24, true, 'm', 3, 'Nordlicht', 0, false, ['Volle Fahrt voraus! Ich kreuze vor Ankerglück.', 'Der Wind steht gut aus Nordost.']),
  B('tobias', 'Tobias Greywater', 'england', 'saebel', 20, true, 'm', 2, 'Grey Herald', 0, false, ['Die Krone der Wellen grüßt dich.', 'Brauchst du Geleitschutz? Meine Brigg ist schnell.']),
  B('joost', 'Joost Zeewind', 'niederlande', 'kraeftig', 16, true, 'm', 2, 'Zeewind', 0.2, false, ['Ahoi! Handel oder Kampf?', 'Mein Laderaum ist voll Gewürze – willst du kaufen?']),
  B('gaspard', 'Gaspard Lunelle', 'frankreich', 'sonne', 29, true, 'm', 4, 'Soleil d’Or', 0, false, ['Die Sonne blendet die Feinde – und die Langweiler.', 'Ich fahre bald nach Soleilmont.']),
  B('suzu', 'Suzu Amagiri', 'kurogane', 'mond', 26, true, 'w', 3, 'Tsukikage', 0, false, ['Der Mond sieht alles, Kapitän.', 'Nebel zieht auf. Bleib wachsam.']),
];

/** Welt-Chat der Kapitäne (alle 50 – 110 s eine Zeile) */
const WORLD_LINES: readonly string[] = [
  'Suche Gruppe für Konvoi-Geleitschutz vor Kiefernhafen – wer segelt mit?',
  'Verkaufe Hartholz in Ankerglück, fairer Preis!',
  'Kurogane-Schwarzsegler südöstlich der Bernsteinsee gesichtet. Augen auf!',
  'Hat jemand die Schatzkarte von den Nebelinseln entziffert?',
  'Heilerin sucht Mitstreiter für eine Insel-Verteidigung – meldet euch per Flüstern.',
  'Wer kommt mit zur Sturmmauer? Ich will die Äußeren Meere sehen.',
  'Gute Winde heute – ideal zum Auslaufen!',
  'Die Bernsteinsee ist ruhig. Zu ruhig.',
  'Grete in Ankerglück schmiedet gerade Doppelklingen – wer will eine?',
  'Gruppe sucht noch einen Tank für die Rückeroberung – Stufe 15 aufwärts!',
];

const GREETINGS: readonly string[] = ['Ahoi, Kapitän!', 'Moin! Schöner Tag für ein Abenteuer.', 'Na, auch hinter der Sturmkrone her?', 'Willkommen in Ankerglück!'];

interface BotRun {
  def: BotDef;
  id: string;
  profile: PlayerProfile;
  /** Ziel beim Gehen bzw. Segeln */
  tx: number; tz: number;
  wait: number;
  pace: number;
  leg: number;
  loop: number[];
  party: PartyView | null;
  replyAt: number; replyTo: string; replyText: string; replyInvite: boolean;
  answerAt: number; answerParty: string; answerYes: boolean;
  greetT: number;
  fleeT: number;
  sunkT: number;
  slot: number;
}

const _p = { x: 0, z: 0 };
const _slot = { x: 0, z: 0 };
const wrap = (a: number) => { let v = (a + Math.PI) % (Math.PI * 2); if (v < 0) v += Math.PI * 2; return v - Math.PI; };

export class ShardBots {
  readonly bots: BotRun[] = [];
  private rnd: () => number;
  private chatterT: number;
  private spawned = false;
  private now = 0;
  readonly stats = { replies: 0, accepted: 0, declined: 0, world: 0, greets: 0 };

  constructor(private readonly auth: MmoAuthority, private readonly world: BotWorld, seed = 0x4b0d, readonly roster: readonly BotDef[] = SHARD_BOTS) {
    let s = seed >>> 0 || 1;
    this.rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    this.chatterT = 40 + this.rnd() * 30;
  }

  /** Alle Kapitäne in den Shard setzen (Zeit in s) */
  spawn(t: number) {
    if (this.spawned) return;
    this.spawned = true;
    this.now = t;
    const h = this.auth.hooks;
    h.invited = (id, party, from, tt) => this.onInvite(id, party, from, tt);
    h.whispered = (id, from, text, tt) => this.onWhisper(id, from, text, tt);
    h.said = (id, from, text, tt) => this.onSay(id, from, text, tt);
    h.healed = (id, frac) => { const st = this.auth.botState(id); if (st) st.hp = Math.min(st.mhp, st.hp + st.mhp * frac); };
    h.horned = (id, heal, will) => { const st = this.auth.botState(id); if (st) { st.hp = Math.min(st.mhp, st.hp + st.mhp * heal); st.will = Math.min(st.mwill, st.will + will); } };
    h.hit = (id, from, dmg) => this.onHit(id, from, dmg, this.now);
    h.partyChanged = (view, ids) => { for (const b of this.bots) if (ids.includes(b.id)) b.party = view && view.members.some((m) => m.id === b.id) ? view : null; };
    const home = this.world.home();
    let landK = 0, seaK = 0;
    for (const def of this.roster) {
      const sp = SPECS[def.spec];
      const profile = newProfile(def.id);
      profile.name = def.name; profile.level = def.level; profile.base = sp.base; profile.spec = def.spec; profile.role = sp.role;
      profile.classLabel = `${CLASS_BASES[sp.base].label} · ${sp.label}`; profile.team = def.team;
      profile.gearTier = Math.max(1, Math.min(5, 1 + Math.floor(def.level / 9))); profile.shipTier = def.ship; profile.shipName = def.shipName;
      profile.gender = def.gender; profile.look = Math.floor(this.rnd() * 1e6); profile.bot = true;
      const st = newPlayerState();
      st.mhp = 820 + def.level * 55; st.hp = st.mhp * (1 - def.hurt); st.mwill = 100; st.will = 20 + Math.floor(this.rnd() * 60);
      const b: BotRun = {
        def, id: def.id, profile, tx: 0, tz: 0, wait: this.rnd() * 4, pace: 1.2 + this.rnd() * 0.5, leg: 0, loop: [], party: null,
        replyAt: -1, replyTo: '', replyText: '', replyInvite: false, answerAt: -1, answerParty: '', answerYes: false, greetT: -999, fleeT: 0, sunkT: 0, slot: 0,
      };
      if (def.atSea) {
        // zwei Schiffe kreuzen vor Ankerglück, die übrigen fahren weiter draußen ihre Runden (die Stadt bleibt sichtbar, nicht überfüllt)
        const a0 = 0.6 + seaK * 1.27, r = seaK < 2 ? home.r + 280 + seaK * 140 : home.r + 1250 + (seaK % 3) * 380;
        for (let i = 0; i < 6; i++) { const a = a0 + (i / 6) * Math.PI * 2; b.loop.push(home.x + Math.sin(a) * r, home.z + Math.cos(a) * r); }
        st.dom = 'sea'; st.x = b.loop[0]; st.z = b.loop[1]; st.hdg = a0 + Math.PI / 2; st.yaw = st.hdg;
        const cls = SHIP_CLASSES[Math.min(SHIP_CLASSES.length - 1, def.ship)];
        st.mhull = cls.hp * 2; st.hull = st.mhull;
        b.leg = 1;
        seaK++;
      } else {
        const p = this.townPoint(landK * 3 + 1);
        st.dom = 'land'; st.x = p.x; st.z = p.z; st.yaw = this.rnd() * Math.PI * 2;
        b.tx = st.x; b.tz = st.z;
        landK++;
      }
      st.zone = this.world.zoneAt(st.x, st.z, def.atSea);
      this.auth.join(profile, st, t);
      this.bots.push(b);
    }
  }

  private townPoint(k: number): { x: number; z: number } {
    const pts = this.world.townPoints();
    if (pts.length) { const p = pts[k % pts.length]; _p.x = p.x; _p.z = p.z; return _p; }
    const h = this.world.home();
    const a = k * 2.399, r = h.r * (0.25 + (k % 4) * 0.1);
    _p.x = h.x + Math.sin(a) * r; _p.z = h.z + Math.cos(a) * r;
    return _p;
  }

  /** erster Mensch in der Gruppe eines Kapitäns (dem er folgt) */
  private humanOf(b: BotRun): string {
    if (!b.party) return '';
    for (const m of b.party.members) if (!m.bot) return m.id;
    return '';
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Rückmeldungen des Shards
  // ---------------------------------------------------------------------------------------------------------------

  private bot(id: string): BotRun | null { for (const b of this.bots) if (b.id === id) return b; return null; }

  private onInvite(id: string, party: string, _from: string, t: number) {
    const b = this.bot(id);
    if (!b) return;
    b.answerAt = t + 1.1 + this.rnd() * 1.4;
    b.answerParty = party;
    b.answerYes = !b.def.busy && b.sunkT <= 0;
  }

  private onWhisper(id: string, from: string, text: string, t: number) {
    const b = this.bot(id);
    if (!b) return;
    const wantsGroup = /einlad|gruppe|lad mich|invite|inv\b|mitnehm/i.test(text);
    b.replyAt = t + 1.3 + this.rnd() * 1.6;
    b.replyTo = from;
    b.replyInvite = wantsGroup && !b.def.busy;
    b.replyText = b.replyInvite ? 'Klar – komm in die Gruppe, ich lade dich ein!' : b.def.busy && wantsGroup ? 'Heute nicht, ich hab zu tun.' : b.def.lines[(this.stats.replies + id.length) % b.def.lines.length];
  }

  private onSay(id: string, _from: string, text: string, t: number) {
    const b = this.bot(id);
    if (!b || t - b.greetT < 30) return;
    if (!/hallo|moin|ahoi|servus|hi\b|tag\b|guten/i.test(text)) return;
    b.greetT = t;
    b.replyAt = t + 1.5 + this.rnd();
    b.replyTo = '';
    b.replyInvite = false;
    b.replyText = GREETINGS[Math.floor(this.rnd() * GREETINGS.length)];
  }

  private onHit(id: string, from: string, dmg: number, t: number) {
    const b = this.bot(id);
    const st = this.auth.botState(id);
    if (!b || !st) return;
    if (st.dom === 'sea' && st.mhull > 0) {
      st.hull = Math.max(0, st.hull - dmg);
      st.combat = true;
      if (st.hull <= st.mhull * 0.25 && b.fleeT <= 0) {
        b.fleeT = 60;
        const att = this.auth.peers.get(from)?.state;
        if (att) { const a = Math.atan2(st.x - att.x, st.z - att.z); b.tx = st.x + Math.sin(a) * 1500; b.tz = st.z + Math.cos(a) * 1500; }
        this.auth.handle(id, { k: 'chat', ch: 'sagen', text: 'Rückzug! Alle Segel setzen!', to: '' }, t);
      }
    } else {
      st.hp = Math.max(1, st.hp - dmg);
      st.combat = true;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Takt
  // ---------------------------------------------------------------------------------------------------------------

  tick(t: number, dt: number) {
    if (!this.spawned) return;
    this.now = t;
    for (const b of this.bots) this.step(b, t, dt);
    this.chatterT -= dt;
    if (this.chatterT <= 0) {
      this.chatterT = 50 + this.rnd() * 60;
      const b = this.bots[Math.floor(this.rnd() * this.bots.length)];
      if (b) { this.auth.handle(b.id, { k: 'chat', ch: 'welt', text: WORLD_LINES[Math.floor(this.rnd() * WORLD_LINES.length)], to: '' }, t); this.stats.world++; }
    }
  }

  private step(b: BotRun, t: number, dt: number) {
    const st = this.auth.botState(b.id);
    if (!st) return;
    // Antworten (Einladung, Flüstern, Gruß)
    if (b.answerAt >= 0 && t >= b.answerAt) {
      b.answerAt = -1;
      this.auth.handle(b.id, { k: 'reply', party: b.answerParty, accept: b.answerYes }, t);
      if (b.answerYes) this.stats.accepted++; else this.stats.declined++;
    }
    if (b.replyAt >= 0 && t >= b.replyAt) {
      b.replyAt = -1;
      if (b.replyTo) this.auth.handle(b.id, { k: 'chat', ch: 'fluestern', text: b.replyText, to: b.replyTo }, t);
      else this.auth.handle(b.id, { k: 'chat', ch: 'sagen', text: b.replyText, to: '' }, t);
      if (b.replyInvite && b.replyTo) this.auth.handle(b.id, { k: 'invite', to: b.replyTo }, t);
      this.stats.replies++;
    }
    // Leben: langsam heilen außerhalb des Gefechts, Willenskraft schwankt
    if (st.combat) { b.fleeT -= dt; if (b.fleeT <= 0) st.combat = false; }
    else if (st.hp < st.mhp) st.hp = Math.min(st.mhp, st.hp + st.mhp * 0.004 * dt);
    if (st.mhull > 0 && st.hull < st.mhull && !st.combat) st.hull = Math.min(st.mhull, st.hull + st.mhull * 0.01 * dt);
    st.will = Math.max(0, Math.min(st.mwill, st.will + Math.sin(t * 0.21 + b.pace * 7) * 1.5 * dt));
    // Begrüßung: kommt ein Mensch an Land nah heran, grüßt der Kapitän (höchstens alle 4 Minuten)
    if (!b.def.atSea && st.dom === 'land' && !b.party && t - b.greetT > 240) {
      for (const p of this.auth.list) {
        if (p.bot || p.state.dom !== 'land') continue;
        if (Math.hypot(p.state.x - st.x, p.state.z - st.z) < 14) {
          b.greetT = t;
          this.auth.handle(b.id, { k: 'chat', ch: 'sagen', text: GREETINGS[(this.stats.greets++ + b.id.length) % GREETINGS.length], to: '' }, t);
          break;
        }
      }
    }
    const human = this.humanOf(b);
    const hs = human ? this.auth.peers.get(human)?.state ?? null : null;
    if (hs) b.slot = Math.max(0, (b.party?.members.findIndex((m) => m.id === b.id) ?? 1) - 1);
    if (b.def.atSea) this.sail(b, st, hs, human, dt);
    else this.walk(b, st, hs, human, t, dt);
    st.zone = this.world.zoneAt(st.x, st.z, st.dom === 'sea');
  }

  /** Kapitän zu Fuß: schlendert durch Ankerglück, folgt in einer Gruppe dem Menschen (an Deck, wenn der auf See ist) */
  private walk(b: BotRun, st: PlayerState, hs: PlayerState | null, human: string, t: number, dt: number) {
    // in der Gruppe eines Menschen auf See: an Deck seines Schiffs mitfahren
    if (hs && hs.dom === 'sea' && !hs.ride) {
      const leader = b.party?.leader === human;
      if (leader) {
        if (st.ride !== human) { this.auth.botRide(b.id, human); rideSlot(b.slot, 18, 5.8, _slot); st.rx = _slot.x; st.ry = 0; st.rz = _slot.z; }
        st.dom = 'sea'; st.x = hs.x; st.z = hs.z; st.yaw = hs.hdg; st.spd = 0; st.hdg = hs.hdg;
        return;
      }
    }
    if (st.ride) { st.ride = ''; st.dom = 'land'; const p = this.townPoint(b.slot + 2); st.x = p.x; st.z = p.z; b.tx = st.x; b.tz = st.z; }
    let goalX = b.tx, goalZ = b.tz, fast = false;
    if (hs && hs.dom === 'land') {
      const back = hs.yaw + Math.PI + (b.slot - 1.5) * 0.5;
      goalX = hs.x + Math.sin(back) * (2.4 + b.slot * 0.9); goalZ = hs.z + Math.cos(back) * (2.4 + b.slot * 0.9);
      const d = Math.hypot(hs.x - st.x, hs.z - st.z);
      if (d > 150) { st.x = goalX; st.z = goalZ; }
      fast = d > 9;
    } else if (b.wait > 0) {
      b.wait -= dt; st.spd = 0;
      return;
    }
    const dx = goalX - st.x, dz = goalZ - st.z, d = Math.hypot(dx, dz);
    if (d < (hs ? 1.6 : 0.6)) {
      st.spd = 0;
      if (!hs) {
        b.wait = 3 + this.rnd() * 6;
        const p = this.townPoint(Math.floor(this.rnd() * 997));
        b.tx = p.x; b.tz = p.z;
      }
      return;
    }
    const want = Math.atan2(dx, dz);
    st.yaw += wrap(want - st.yaw) * Math.min(1, dt * 6);
    const v = Math.min(d / Math.max(dt, 1e-3), fast ? 4.6 : hs ? 2.2 : b.pace);
    _p.x = st.x + Math.sin(want) * v * dt; _p.z = st.z + Math.cos(want) * v * dt;
    this.world.constrain(_p.x, _p.z, _p);
    st.spd = Math.hypot(_p.x - st.x, _p.z - st.z) / Math.max(dt, 1e-3);
    st.x = _p.x; st.z = _p.z;
    void t;
  }

  /** Kapitän auf See: fährt seine Runde vor Ankerglück, in einer Gruppe im Flotten-Verbund hinter dem Menschen */
  private sail(b: BotRun, st: PlayerState, hs: PlayerState | null, _human: string, dt: number) {
    let gx: number, gz: number, cap = 7;
    if (b.fleeT > 0) { gx = b.tx; gz = b.tz; cap = 9; }
    else if (hs && hs.dom === 'sea' && !hs.ride) {
      const side = b.slot % 2 === 0 ? 1 : -1, back = 45 + Math.floor(b.slot / 2) * 40;
      const c = Math.cos(hs.hdg), s = Math.sin(hs.hdg), ox = side * 38, oz = -back;
      gx = hs.x + ox * c + oz * s; gz = hs.z - ox * s + oz * c;
      cap = Math.min(10, Math.max(3, hs.spd + Math.hypot(gx - st.x, gz - st.z) * 0.05));
    } else {
      gx = b.loop[b.leg * 2]; gz = b.loop[b.leg * 2 + 1];
      if (Math.hypot(gx - st.x, gz - st.z) < 70) { b.leg = (b.leg + 1) % (b.loop.length >> 1); gx = b.loop[b.leg * 2]; gz = b.loop[b.leg * 2 + 1]; }
      if (hs && hs.dom === 'land') cap = 0;
    }
    const dx = gx - st.x, dz = gz - st.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    st.hdg += Math.max(-0.22 * dt, Math.min(0.22 * dt, wrap(want - st.hdg)));
    const target = d < 12 ? 0 : cap * Math.max(0.2, Math.cos(wrap(want - st.hdg)));
    st.spd += (target - st.spd) * Math.min(1, dt * 0.4);
    const nx = st.x + Math.sin(st.hdg) * st.spd * dt, nz = st.z + Math.cos(st.hdg) * st.spd * dt;
    if (this.world.seaFree(nx, nz)) { st.x = nx; st.z = nz; } else { st.spd *= 0.5; st.hdg += 0.6 * dt; }
    st.yaw = st.hdg;
    st.dom = 'sea';
  }
}

/** Zahl der Kapitäne an Land bzw. auf See (Prüfungen) */
export function rosterCounts(list: readonly BotDef[] = SHARD_BOTS) {
  let land = 0, sea = 0;
  const teams = new Set<string>();
  for (const b of list) { if (b.atSea) sea++; else land++; teams.add(b.team || 'ungebunden'); }
  return { land, sea, teams: teams.size, total: list.length, rigPool: MMO.rigPool };
}
