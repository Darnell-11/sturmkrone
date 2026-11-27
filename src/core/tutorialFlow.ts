// Phase 4.7A – Ablauf der privaten Einführung „Ankerglück“ (Stufe 1 → 3) auf Spiel-Seite.
//
// Beobachtet die Einführungs-Aufträge t1 – t5 (data/quests.ts) und die Welt, meldet die verlangten Handlungen (`act`) an das Auftragssystem
// und setzt die Story-Momente um: erste Klinge (Bodo), Stufe 2 und erster Talentpunkt (Konrad), Schaluppe und Start-Crew (Ilse), Lehrtafel
// des Schiffs-HUD, Kurogane-Spähboot, Kurogane-Stoßtrupp mit Faji-Kristall und Stufe 3 (Gerstenkorn), danach das Auflösen der privaten
// Instanz in die geteilte Welt. Alles über `TutorialHost` (kein three.js, kein DOM): der Ablauf ist ohne Welt prüfbar. Was einmal geschehen
// sein muss (Klinge, Stufen, Schiff, Tafel), merkt sich der Spielstand in `progress.flags` – ein geladener Stand mitten in der Einführung
// setzt an derselben Stelle fort.
import { TUTORIAL, TUTORIAL_QUESTS, type TutorialAct, type TutorialQuestId } from '../data/prologue';
import type { QuestStep } from '../data/quests';

/**
 * 4.9: Salven-Übung der Faji-Wirker bei Waffenmeister Konrad: mindestens `TUTORIAL.salvoShots` Element-Geschosse seit Beginn der Übung und
 * eine Trefferkette von `TUTORIAL.salvoHits` (die Geschosse müssen die Puppe auch treffen)
 */
export function salvoDone(salvo: number, base: number, hits: number): boolean {
  return salvo - base >= TUTORIAL.salvoShots && hits >= TUTORIAL.salvoHits;
}

export interface TutorialProbe {
  /** laufende Trefferkette der Figur */
  hits: number;
  /** gerade im Sturm-Schritt / Dash */
  dashing: boolean;
  /** ein Ziel ist angewählt (Tab, Klick, Tipp) */
  targeted: boolean;
  /** eingesetzte Techniken einer Faji-Kunst (Zähler) */
  artSkills: number;
  /** 4.7B: eingesetzte Geistes-Faji-Kräfte (Zähler) */
  geistUses?: number;
  /** steht am Steuer des eigenen (übergebenen) Schiffs */
  atHelm: boolean;
  /** 4.9: abgefeuerte Element-Geschosse (Faji-Salven) und ob die Figur eine Faji-Klasse führt */
  salvo?: number;
  faji?: boolean;
}

/** Was der Ablauf vom Spiel braucht */
export interface TutorialHost {
  step(id: TutorialQuestId): QuestStep | null;
  isDone(id: TutorialQuestId): boolean;
  /** Handlung an das Auftragssystem melden */
  act(a: TutorialAct): void;
  probe(): TutorialProbe;
  /** ausgegebene Talentpunkte (Bäume und Faji-Techniken) */
  spent(): number;
  level(): number;
  /** auf Stufe `n` heben (Banner, Talentpunkt aus der Stufe) */
  setLevel(n: number): void;
  /** Bodo hat geschmiedet: die erste Klinge in die Hand */
  giveWeapon(): void;
  /** 4.7D: Bodos Schmiedestück (Hammerschläge mit Funkenflug), danach `done` (ohne: sofort) */
  forge?(done: () => void): void;
  /** 4.7D: Lehrtafel des Waffenmeisters (klassenbezogene Kombo, Sturm-Schritt, Zielerfassung, Klassenbaum) */
  coachCombat?(): void;
  /** 4.7D: den Sternbild-Klassenbaum öffnen (erster Talentpunkt) */
  openTree?(): void;
  /** 4.7D: inszenierter Kurogane-Angriff – ein Kriegsschiff beschießt den Hafen, bevor der Stoßtrupp landet */
  assault?(): void;
  /** Ilse übergibt die ranzige Schaluppe (liegt danach am Steg) */
  grantShip(): void;
  /** Karte „Crew anheuern“ (Mira Windblatt); das Spiel meldet danach `act('hire')` */
  offerHire(): void;
  crewHired(): boolean;
  /** Lehrtafel des Schiffs-HUD */
  coachShip(): void;
  /** Spähboot vor der Küste; liefert einen Griff (null = kein Platz) */
  spawnScout(): object | null;
  scoutLive(h: object): boolean;
  /**
   * Faji-Kristall (4.7B): Faji-Wirker ohne Element wählen es (für immer), alle Klassen erwecken die Geistes-Faji; das Spiel meldet danach
   * `act('faji')`. `fajiEquipped` = die Geistes-Faji ist erwacht.
   */
  offerFaji(): void;
  fajiEquipped(): boolean;
  /** 4.7B (Konrad): Faustkämpfer ohne Pfad – Karte „Schnell oder Kräftig“ (für immer), danach öffnet sich der Klassenbaum */
  needsPath?(): boolean;
  offerPath?(): void;
  /** 4.7B: eingesetzte Geistes-Faji-Kräfte (Zähler) */
  geistUses?(): number;
  /** Kurogane-Stoßtrupp (Haupttrupp bzw. Nachzügler); liefert die Zahl der Angreifer */
  spawnRaid(extra: boolean): number;
  raidLeft(): number;
  /** private Instanz auflösen (geteilte Welt) */
  dissolve(): void;
  shared(): boolean;
  flag(k: string): boolean;
  setFlag(k: string): void;
  say(text: string): void;
}

/** Merker im Spielstand (`progress.flags`) */
export const TUT_FLAGS = { weapon: 'tut_weapon', level2: 'tut_level2', ship: 'tut_ship', coach: 'tut_coach', level3: 'tut_level3', fight: 'tut_fight' } as const;

export class TutorialFlow {
  private stepKey = '';
  private baseSpent = -1;
  private baseArt = 0;
  private baseGeist = 0;
  private scout: object | null = null;
  private scoutT = 0;
  private raid = false;
  /** 4.7D: der Stoßtrupp landet erst nach dem Beschuss des Kriegsschiffs (Restzeit in s; ≤ 0 = gelandet) */
  private raidT = 0;
  private raidLanded = false;
  private extra = false;
  private offered = '';

  constructor(private readonly h: TutorialHost) {}

  /** Laufender Einführungs-Auftrag und sein Schritt (der erste noch nicht abgeschlossene) */
  current(): { id: TutorialQuestId; step: QuestStep } | null {
    for (const id of TUTORIAL_QUESTS) {
      const st = this.h.step(id);
      if (st) return { id, step: st };
    }
    return null;
  }

  /** Ein Logikschritt (nur im laufenden Spiel; im Menü und im Gespräch ruht der Ablauf) */
  update(dt: number) {
    const h = this.h;
    // Bodo hat geschmiedet (Auftrag t2 erfüllt): Hammerschläge mit Funkenflug, dann die erste Klinge bzw. der Faji-Fokus
    if (h.isDone('t2') && !h.flag(TUT_FLAGS.weapon)) { h.setFlag(TUT_FLAGS.weapon); if (h.forge) h.forge(() => h.giveWeapon()); else h.giveWeapon(); }
    // Kurogane-Überfall: der Stoßtrupp landet, sobald das Kriegsschiff den Hafen sturmreif geschossen hat
    if (this.raid && !this.raidLanded) { this.raidT -= dt; if (this.raidT <= 0) { this.raidLanded = true; h.spawnRaid(false); } }
    // Dank des Bürgermeisters (t5 erfüllt): die private Instanz löst sich in die geteilte Welt auf
    if (h.isDone('t5')) { if (!h.shared()) h.dissolve(); return; }
    const cur = this.current();
    if (!cur) return;
    const key = `${cur.id}:${cur.step.type}:${cur.step.type === 'act' ? cur.step.act : ''}`;
    if (key !== this.stepKey) { this.stepKey = key; this.enter(cur.id, cur.step); }
    if (cur.step.type === 'act') this.poll(cur.step.act, dt);
    else if (cur.step.type === 'sink') this.pollScout(dt);
  }

  /** Ein neuer Schritt beginnt */
  private enter(id: TutorialQuestId, st: QuestStep) {
    const h = this.h;
    void id;
    if (st.type === 'sink') { this.scoutT = 0.5; return; }
    if (st.type !== 'act') return;
    switch (st.act) {
      case 'combo':
        // Waffenmeister Konrad erklärt die eigene Kombo (4.9: Faji-Wirker die Element-Salve), den Sturm-Schritt, die Zielerfassung und den Klassenbaum
        if (!h.flag(TUT_FLAGS.fight)) { h.setFlag(TUT_FLAGS.fight); h.coachCombat?.(); }
        this.baseSalvo = h.probe().salvo ?? 0;
        break;
      case 'talent':
        // der Waffenmeister hebt auf Stufe 2: ein Talentpunkt mehr im Topf
        if (!h.flag(TUT_FLAGS.level2)) { h.setFlag(TUT_FLAGS.level2); h.setLevel(TUTORIAL.level2); h.say('Stufe 2! Drücke N und verteile deinen ersten Talentpunkt in deinem Klassenbaum.'); }
        this.baseSpent = h.spent();
        // 4.7B: Faustkämpfer wählen hier bei Konrad ihren Pfad (Schnell oder Kräftig) – der erste Punkt folgt gleich im Klassenbaum;
        // 4.7D: alle anderen sehen ihr Sternbild sofort (der goldene Knoten ist der nächste Schritt)
        if (h.needsPath?.()) h.offerPath?.();
        else if (h.spent() === this.baseSpent) h.openTree?.();
        break;
      case 'hire':
        // Ilse übergibt die Schaluppe; die erste Crew heuert man bei ihr an
        if (!h.flag(TUT_FLAGS.ship)) { h.setFlag(TUT_FLAGS.ship); h.grantShip(); }
        break;
      case 'faji':
        // Gerstenkorn: die Kurogane greifen an (4.7D: erst beschießt ein Kriegsschiff den Hafen, dann landet der Stoßtrupp) –
        // der Faji-Kristall erwacht (Stufe 3)
        this.startRaid();
        if (!h.flag(TUT_FLAGS.level3)) { h.setFlag(TUT_FLAGS.level3); h.setLevel(TUTORIAL.level3); }
        break;
      case 'art':
        this.baseArt = h.probe().artSkills;
        this.baseGeist = h.geistUses?.() ?? 0;
        this.startRaid();
        break;
      case 'raid':
        this.startRaid();
        break;
      default: break;
    }
  }

  /** 4.9: Zähler der Element-Geschosse beim Beginn der Salven-Übung */
  private baseSalvo = 0;

  private poll(act: TutorialAct, dt: number) {
    const h = this.h;
    void dt;
    switch (act) {
      case 'combo': {
        // 4.9: Faji-Wirker üben keine Nahkampf-Kombo, sondern eine Element-Salve: so viele Geschosse treffen die Puppe (Kette aus der Ferne)
        const p = h.probe();
        if (p.faji ? salvoDone(p.salvo ?? 0, this.baseSalvo, p.hits) : p.hits >= TUTORIAL.comboHits) h.act('combo');
        break;
      }
      case 'dash': if (h.probe().dashing) h.act('dash'); break;
      case 'target': if (h.probe().targeted) h.act('target'); break;
      case 'talent': if (this.baseSpent >= 0 && h.spent() > this.baseSpent) h.act('talent'); break;
      case 'hire':
        if (h.crewHired()) { h.act('hire'); break; }
        if (this.offered !== 'hire') { this.offered = 'hire'; h.offerHire(); }
        break;
      case 'helm':
        if (!h.probe().atHelm) break;
        h.act('helm');
        if (!h.flag(TUT_FLAGS.coach)) { h.setFlag(TUT_FLAGS.coach); h.coachShip(); }
        break;
      case 'faji':
        if (h.fajiEquipped()) { h.act('faji'); break; }
        if (this.offered !== 'faji') { this.offered = 'faji'; h.offerFaji(); }
        break;
      case 'art':
        // 4.7B: die neue Kraft im Kampf – eine Geistes-Faji (alle Klassen) oder die Elementar-Form der Faji-Wirker
        if (h.probe().artSkills > this.baseArt || (h.geistUses?.() ?? 0) > this.baseGeist) { h.act('art'); break; }
        // der Trupp ist schon gefallen, bevor die neue Kunst zum Einsatz kam: zwei Nachzügler kommen über den Steg
        if (this.raidLanded && h.raidLeft() === 0 && !this.extra) { this.extra = true; h.spawnRaid(true); h.say('Noch zwei Kurogane kommen über den Steg – zeig ihnen deine Geistes-Faji (Q)!'); }
        break;
      case 'raid': if (this.raidLanded && h.raidLeft() === 0) h.act('raid'); break;
      default: break;
    }
  }

  /** Spähboot: läuft aus und läuft wieder aus, falls es verschwindet (abgedriftet, abgebaut) */
  private pollScout(dt: number) {
    const h = this.h;
    if (this.scout && h.scoutLive(this.scout)) return;
    this.scout = null;
    this.scoutT -= dt;
    if (this.scoutT > 0) return;
    this.scout = h.spawnScout();
    this.scoutT = TUTORIAL.scoutRespawn;
    if (this.scout) h.say('Ein Kurogane-Spähboot kreuzt vor der Küste – versenke es mit deinen Breitseiten!');
  }

  /** Überfall beginnen (einmal): mit Kriegsschiff-Beschuss und Vorlauf, sonst landet der Trupp sofort */
  private startRaid() {
    if (this.raid) return;
    this.raid = true;
    if (this.h.assault) { this.h.assault(); this.raidT = TUTORIAL.raidShipLead; this.raidLanded = false; }
    else { this.raidT = 0; this.raidLanded = true; this.h.spawnRaid(false); }
  }

  /** Karte geschlossen, ohne zu wählen: beim nächsten Schritt erneut anbieten */
  reoffer() { this.offered = ''; }
}
