import { lowerTier, QUALITY_TIERS, type QualityTier } from '../data/qualityTiers';
import { FACTION_LABELS, rankIndex, rankName } from '../data/ranks';
import { TOUCH_FOOT, TOUCH_SEA } from '../data/touchLayout';
import { randomLook } from '../data/characterParts';
import { WEATHER, type WeatherId } from '../data/world';
import { CharacterAssets } from '../entities/character/assets';
import type { Enemy } from '../entities/enemy';
import { PLAYER_BASE } from '../data/combat';
import { CombatOverlay } from '../ui/combatOverlay';
import { BRANCHES, branchPoints, learnBlock, SK, type Branch } from '../data/skills';
import { SkillTree } from '../ui/skillTree';
import { AMMO, SAIL_LEVELS, SHIP_CLASSES, type ShipLook } from '../data/ships';
import { FAME_THRESHOLDS } from '../data/ranks';
import { SkillStage } from '../world/skillStage';
import { AutoQuality, detectTier, gatherDeviceInfo, type DeviceInfo } from '../render/quality';
import { GameRenderer } from '../render/renderer';
import { CharacterEditor, styleIdOf, type EditorResult } from '../ui/editor';
import { Hud } from '../ui/hud';
import { Menus } from '../ui/menus';
import { TouchControls } from '../ui/touchControls';
import { EditorStage } from '../world/editorStage';
import { SeaWorld, type SeaMode } from '../world/seaWorld';
import { formatClock } from '../world/timeOfDay';
import { Input } from './input/input';
import { GameLoop } from './loop';
import { SaveManager } from './save/saveManager';
import { createSave, type SaveData } from './save/types';
import { SettingsStore } from './settings';
import { StateMachine } from './state';
import { browserStore } from './storage';
import { audio, type Mood } from '../audio/audio';
import { EDGE_WALL } from '../data/world';
import { QuestSystem, stepText } from '../story/questSystem';
import type { QuestDef, TownNpcDef } from '../data/quests';
import { ARMOR, BERNSTEINSEE, POTION, REST_PRICE, SHRINE_PRICE, WEAPONS, type IslandDef } from '../data/regions';
import { drawMap, type MapMarkers } from '../ui/minimap';

export const GAME_VERSION = __APP_VERSION__;
const AUTOSAVE_SECONDS = 30;

export class Game {
  readonly state = new StateMachine();
  readonly settings: SettingsStore;
  readonly saves: SaveManager;
  readonly persistent: boolean;
  readonly renderer: GameRenderer;
  readonly world: SeaWorld;
  readonly input: Input;
  readonly hud: Hud;
  readonly touch: TouchControls;
  readonly menus: Menus;
  readonly loop: GameLoop;
  readonly deviceInfo: DeviceInfo;
  readonly detected: { tier: QualityTier; reason: string };
  assets: CharacterAssets | null = null;
  readonly overlay: CombatOverlay;

  private slot: number | null = null;
  private save: SaveData | null = null;
  private autoQuality = new AutoQuality();
  private autosaveTimer = 0;
  private saveFailedShown = false;
  private stage: EditorStage | null = null;
  private editor: CharacterEditor | null = null;
  private uiRoot: HTMLElement;
  private quests: QuestSystem | null = null;
  /** Im laufenden Gespräch abgeschlossene Aufträge (für die Abschlusstexte) */
  private justDone: QuestDef[] | null = null;
  private mapT = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    const { store, persistent } = browserStore();
    this.persistent = persistent;
    this.settings = new SettingsStore(store);
    this.saves = new SaveManager(store, GAME_VERSION);

    this.renderer = new GameRenderer(canvas);
    this.world = new SeaWorld();
    this.renderer.onQualityChange((c) => this.world.applyQuality(c));
    this.useWorldView();

    this.deviceInfo = gatherDeviceInfo(this.renderer.gl.getContext());
    this.detected = detectTier(this.deviceInfo);
    const s = this.settings.data;
    if (!s.quality) this.settings.update({ quality: this.detected.tier, qualityAuto: true });
    this.renderer.applyQuality(this.settings.data.quality ?? this.detected.tier);

    this.input = new Input(canvas);
    this.hud = new Hud(uiRoot);
    this.touch = new TouchControls(uiRoot, this.input);
    this.touch.setLayout(TOUCH_SEA);
    this.menus = new Menus(uiRoot, this);

    this.overlay = new CombatOverlay(uiRoot);
    this.overlay.setVisible(false);
    this.world.onMessage = (m) => this.hud.toast(m);
    this.world.onModeChange = (m) => this.onModeChange(m);
    this.world.onKill = (e) => this.onKill(e);
    this.world.onGold = (n) => { if (this.save) this.save.player.gold += n; };
    this.world.onShipSunk = (e) => {
      if (!this.save) return;
      const p = this.save.player;
      if (!e.companion) { this.save.progress.stats.sunk++; this.questEvent({ type: 'sink' }); }
      const mult = e.role === 'legende' ? 6 : e.role === 'haendler' ? 0.8 : 1.4;
      this.grantXp(Math.round((25 + e.level * 10) * mult), e.role === 'legende' ? 250 : e.role === 'haendler' ? (p.faction === 'pirat' ? 4 : -6) : 8);
      if (e.role === 'legende') audio.play('win');
      this.overlay.showBanner(e.role === 'legende' ? `${e.name} besiegt!` : 'Schiff versenkt!', e.role === 'haendler' ? 'Ein Handelsschiff' : '');
    };
    this.world.onLoot = (gold, shard) => {
      if (!this.save) return;
      this.save.player.gold += gold;
      if (shard) { this.save.skills.sp++; this.hud.toast('Faji-Splitter: +1 Faji-Punkt!', 3); }
    };
    this.world.onBoardWon = () => {
      if (!this.save) return;
      this.save.progress.stats.boarded++;
      this.grantXp(40, 20);
      this.questEvent({ type: 'board' });
    };
    this.world.onTalk = (npc) => this.talkTo(npc);
    this.world.onEnterIsland = (def) => this.enterIsland(def);
    this.world.onIslandCleared = (id) => this.questEvent({ type: 'clear', island: id });
    this.world.onRescue = () => {
      if (!this.save) return;
      this.save.progress.stats.rescued++;
      const gold = 40 + this.save.player.level * 6;
      this.save.player.gold += gold;
      audio.play('bell');
      this.overlay.showBanner('Schiffbrüchige gerettet!', `Zum Dank: ${gold} Gold`);
      this.grantXp(30, 12);
      this.questEvent({ type: 'rescue' });
    };
    this.world.onBottle = () => this.findBottle();
    this.world.onDig = (id) => this.dig(id);
    this.hud.onMap = () => { if (this.state.is('play')) { this.state.set('pause'); this.menus.showMap('karte'); } };
    this.world.onPlayerDown = () => {
      audio.play('ko');
      this.overlay.showBanner('K.O.', 'Die Crew eilt zu Hilfe …');
      if (this.save) {
        const lost = Math.floor(this.save.player.gold * 0.1);
        this.save.player.gold -= lost;
        if (lost > 0) setTimeout(() => this.hud.toast(`${lost} Gold gingen verloren.`, 3), 3500);
      }
    };
    audio.attachUnlock();
    this.hud.onPause = () => this.pause();
    this.hud.onFaji = () => this.openSkills();
    this.hud.onContext = (down) => this.input.setVirtual('interact', down);
    this.applySettings();
    this.settings.onChange(() => this.applySettings());
    this.input.onDeviceChange(() => {
      this.updateTouchVisibility();
      if (this.state.is('play')) this.hud.hint(this.controlsHint(), 8);
    });

    this.state.onChange((next) => {
      this.input.gameplayActive = next === 'play';
      this.hud.setVisible(next === 'play');
      this.overlay.setVisible(next === 'play' || next === 'pause');
      this.updateTouchVisibility();
      if (next !== 'play') this.input.releaseAll();
    });

    document.addEventListener('visibilitychange', () => {
      audio.suspend(document.hidden);
      if (document.hidden) {
        if (this.state.is('play')) this.pause();
        else this.persist();
      } else this.loop.resetClock();
    });
    addEventListener('pagehide', () => this.persist());

    this.renderer.gl.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.hud.toast('Grafik wurde vom Gerät zurückgesetzt – einen Moment …', 4);
    });

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });
  }

  async start() {
    // Titelbild: zufällige schöne Stimmung
    this.world.setState({ boat: null, env: { time: [7, 10, 17.8, 18.6][Math.floor(Math.random() * 4)], weather: 'klar' } });
    this.loop.start();
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.innerHTML = '<div><div class="fell" style="font-size:2rem">Sturmkrone</div><div>Die Crew macht sich bereit …</div><div class="bar"><i></i></div></div>';
    document.body.appendChild(loading);
    try {
      this.assets = await CharacterAssets.load((d, t) => { (loading.querySelector('.bar i') as HTMLElement).style.width = `${(d / t) * 100}%`; });
      this.world.setCharacters(this.assets, randomLook(Math.random, 'pirat'), 'saebel', this.overlay);
    } catch (e) {
      console.error(e);
      this.hud.toast('Figuren konnten nicht geladen werden – prüfe die Verbindung.', 5);
    }
    loading.remove();
    this.state.set('menu');
    this.menus.showMain();
  }

  private useWorldView() {
    this.renderer.setView(this.world.scene, this.world.camera);
    this.renderer.setEffectSources(this.world.env.sunMesh, this.world.focus);
  }

  // ---------- Schleife ----------

  private update(dt: number) {
    this.input.poll();
    this.input.beginStep();
    if (this.state.is('play')) {
      if (this.input.pressed('pause')) { this.pause(); return; }
      if (this.input.pressed('map')) { this.state.set('pause'); this.menus.showMap('karte'); return; }
      if (this.input.pressed('potion')) this.usePotion();
      this.world.update(dt, this.input);
      if (this.save) this.save.meta.playTime += dt;
      this.autosaveTimer += dt;
      if (this.autosaveTimer >= AUTOSAVE_SECONDS) this.persist();
    } else if (this.state.is('menu')) {
      this.world.idle(dt);
    }
  }

  private render(alpha: number, frameDt: number) {
    this.updateAudio(frameDt);
    if (this.state.is('editor') && this.stage) {
      this.stage.update(frameDt);
      const portrait = innerHeight > innerWidth || innerWidth < 700;
      const sk = this.stage instanceof SkillStage;
      this.stage.frame(innerWidth / innerHeight, portrait, portrait ? (sk ? 0.64 : 0.48) : Math.min(sk ? 520 : 420, innerWidth * (sk ? 0.52 : 0.44)) / innerWidth);
      this.renderer.render(frameDt);
      return;
    }
    // Trefferpause: Spielzeit kurz fast anhalten (läuft in Echtzeit ab)
    const hs = this.world.hitstop;
    if (hs.t > 0) { this.loop.timeScale = hs.scale; hs.t -= frameDt; }
    else { this.loop.timeScale = 1; hs.scale = 1; }
    this.world.render(this.state.is('play', 'pause') ? alpha : 1, frameDt, this.state.is('menu', 'boot'));
    this.renderer.render(frameDt);
    this.overlay.update(this.state.is('play') ? frameDt * this.loop.timeScale : 0, this.world.camera);
    if (this.state.is('play')) {
      const s = this.settings.data;
      if (this.save) {
        const hp = this.world.playerHp;
        const p = this.save.player;
        this.hud.setStats(hp ? hp.hp / hp.max : 1, p.xp / PLAYER_BASE.xpNeed(p.level), p.gold);
        const sh = this.world.ship;
        this.hud.setSea(this.world.mode === 'sail' ? {
          hull: sh.hull / sh.maxHull, sail: sh.sail, crew: sh.crew, level: SAIL_LEVELS[sh.sailLevel].n, ammo: AMMO[sh.ammo].n,
          reloadL: sh.reloadL / 2.4, reloadR: sh.reloadR / 2.4, windRel: this.world.env.windDir - sh.heading, fire: sh.fire > 0,
        } : null);
        const fj = this.world.faji;
        this.hud.setFaji(fj ? fj.faji / fj.maxFaji : 1, this.save.skills.sp);
        if (fj) {
          const views = fj.slots();
          const foot = this.world.mode === 'foot';
          const b = this.input.getKeyBindings();
          const keys = this.input.lastDevice === 'gamepad' ? ['LT', 'RT', 'RB'] : (['skill1', 'skill2', 'skill3'] as const).map((a) => this.input.keyLabel(b[a][0] ?? ''));
          this.hud.setSkillBar(foot && this.input.lastDevice !== 'touch', views, keys);
          views.forEach((v, i) => this.touch.setButton(`skill${i + 1}`, v.id ? v.name : 'Leer', v.cdFrac, v.ready, v.color));
        }
      }
      this.hud.setFps(s.showFps, `${this.loop.fps} fps · ${QUALITY_TIERS[this.renderer.tier].label}`);
      const env = this.world.env;
      this.hud.setEnv(`${formatClock(env.time)} · ${env.timeName} · ${WEATHER[env.weather.target].label}`);
      const key = this.input.lastDevice === 'keyboard' ? this.input.keyLabel(this.input.getKeyBindings().interact[0] ?? 'KeyR')
        : this.input.lastDevice === 'gamepad' ? 'X' : null;
      this.hud.setContext(this.world.contextLabel, key);
      this.updateQuestHud(frameDt);
      if (s.qualityAuto && this.autoQuality.sample(frameDt)) this.autoLower();
    }
  }

  private autoLower() {
    const lower = lowerTier(this.renderer.tier);
    if (!lower) return;
    this.settings.update({ quality: lower });
    this.renderer.applyQuality(lower);
    this.hud.toast(`Grafikstufe auf „${QUALITY_TIERS[lower].label}“ gesenkt, damit es flüssig läuft.`, 3.5);
  }

  private onModeChange(m: SeaMode) {
    this.touch.setLayout(m === 'foot' ? TOUCH_FOOT : TOUCH_SEA);
    if (this.state.is('play')) this.hud.hint(this.controlsHint(), 8);
  }

  // ---------- Klang ----------

  private updateAudio(dt: number) {
    const w = this.world;
    const pos = w.playerPos;
    audio.setListener(pos.x, pos.z, w.cameraYaw);
    if (this.state.is('play', 'pause')) {
      const env = w.env;
      const town = w.islandDefs.find((i) => i.kind === 'town');
      const dTown = town ? Math.hypot(town.x - pos.x, town.z - pos.z) : 9999;
      const threat = w.threat;
      const night = env.time < 5.5 || env.time > 20.5;
      const mood: Mood = w.bossNear ? 'boss' : threat > 0.65 ? 'battle' : dTown < 150 ? 'harbor' : night ? 'night' : 'sea';
      audio.setMood(mood, threat);
      const wp = env.weather.p;
      const edge = Math.hypot(pos.x, pos.z);
      audio.setAmbience({
        waves: w.mode === 'foot' ? 0.55 : 0.95, wind: 0.15 + wp.wind * 0.85, rain: wp.rain,
        town: Math.max(0, 1 - dTown / 170), gulls: night || wp.rain > 0.3 ? 0.05 : 0.55,
        deep: Math.max(0, Math.min(1, (edge - (EDGE_WALL - 450)) / 400)),
      });
    } else if (this.state.is('menu', 'boot')) {
      audio.setMood('menu');
      audio.setAmbience({ waves: 0.8, wind: 0.2, rain: 0, town: 0, gulls: 0.4, deep: 0 });
    }
    audio.update(dt);
  }

  // ---------- Fortschritt ----------

  private applyPower() {
    if (!this.save) return;
    const lvl = this.save.player.level;
    const hpBonus = 1 + (this.world.faji?.passives.hpMax ?? 0);
    const gear = this.save.gear;
    const armor = ARMOR[gear.armor]?.hp ?? 0;
    const weapon = WEAPONS[gear.weapon]?.dmg ?? 0;
    this.world.setPlayerPower((PLAYER_BASE.hp(lvl) + armor) * hpBonus, PLAYER_BASE.atk(lvl) + weapon * 0.5);
    const nav = this.world.naval;
    if (nav) {
      nav.playerLevel = lvl;
      nav.playerFaction = this.save.player.faction;
      nav.playerRank = rankIndex(this.save.player.fame);
      nav.canDmg = (12 + lvl * 1.4) * (1 + this.save.ship.tier * 0.06);
    }
  }

  private onKill(e: Enemy) {
    const xp = Math.round(e.def.xp * (1 + 0.2 * (e.level - 1)));
    this.overlay.number(e.head.setY(e.y + 2.8), `+${xp} EP`, 'xp');
    this.grantXp(xp, e.def.boss ? 200 : e.def.elite ? 15 : 3);
    if (this.save) this.save.progress.stats.kills++;
    this.questEvent({ type: 'kill', kind: e.kind });
  }

  // ---------- Aufträge und Welt ----------

  get questSys() { return this.quests; }
  get saveData() { return this.save; }

  private questEvent(e: Parameters<QuestSystem['event']>[0]) {
    if (this.quests?.event(e)) { this.refreshDigs(); this.persist(); }
  }

  private onQuestDone(q: QuestDef) {
    const s = this.save;
    if (!s) return;
    s.player.gold += q.reward.gold;
    if (q.reward.sp) s.skills.sp += q.reward.sp;
    if (this.justDone) this.justDone.push(q);
    else this.hud.toast(`Auftrag erfüllt: ${q.title}`, 3.5);
    audio.play('quest');
    this.overlay.showBanner(q.main ? 'Kapitel abgeschlossen!' : 'Auftrag erfüllt!', q.title);
    this.grantXp(q.reward.xp, q.reward.fame);
  }

  /** Grabstellen: Schatz-Aufträge und gefundene Schatzkarten */
  private refreshDigs() {
    if (!this.save || !this.quests) return;
    this.world.setDigs([...this.quests.treasureIslands(), ...this.save.progress.maps]);
  }

  private talkTo(npc: TownNpcDef) {
    if (!this.quests || !this.state.is('play')) return;
    this.justDone = [];
    this.questEvent({ type: 'talk', npc: npc.id });
    const done = this.justDone;
    this.justDone = null;
    this.state.set('pause');
    this.menus.showDialog(npc, done);
  }

  acceptQuest(id: string) {
    if (!this.quests) return;
    this.quests.accept(id);
    // Schon dort? Dann zählt der Ort sofort
    const step = this.quests.step(id);
    if (step?.type === 'goto') {
      const def = this.world.islandDefs.find((i) => i.id === step.island);
      const pos = this.world.playerPos;
      if (def && Math.hypot(def.x - pos.x, def.z - pos.z) < def.r + 45) this.quests.event({ type: 'enter', island: def.id });
    }
    this.refreshDigs();
    this.persist();
  }

  private enterIsland(def: IslandDef) {
    const s = this.save;
    if (!s) return;
    const key = `seen_${def.id}`;
    if (!s.progress.flags[key]) {
      s.progress.flags[key] = true;
      this.overlay.showBanner(def.name, def.info ?? '');
    } else this.hud.toast(def.name, 2);
    this.questEvent({ type: 'enter', island: def.id });
  }

  /** Flaschenpost: Schatzkarte zu einer ruhigen Insel */
  private findBottle() {
    const s = this.save;
    if (!s) return;
    const quest = this.quests?.treasureIslands() ?? [];
    const pool = this.world.islandDefs.filter((i) => (i.kind === 'quiet' || i.kind === 'treasure') && !s.progress.maps.includes(i.id) && !quest.includes(i.id));
    if (!pool.length) { s.player.gold += 50; this.hud.toast('Flaschenpost: ein paar Münzen (+50 Gold)', 3); return; }
    const near = pool.filter((i) => Math.hypot(i.x - BERNSTEINSEE.x, i.z - BERNSTEINSEE.z) < BERNSTEINSEE.r);
    const from = near.length && Math.random() < 0.75 ? near : pool;
    const pick = from[Math.floor(Math.random() * from.length)];
    s.progress.maps.push(pick.id);
    audio.play('treasure');
    this.overlay.showBanner('Flaschenpost!', `Eine Schatzkarte – ein X auf ${pick.name}`);
    this.refreshDigs();
    this.persist();
  }

  private dig(island: string) {
    const s = this.save;
    if (!s) return;
    audio.play('dig');
    const i = s.progress.maps.indexOf(island);
    if (i >= 0) {
      s.progress.maps.splice(i, 1);
      s.progress.stats.treasures++;
      const gold = Math.round((120 + Math.random() * 180) * (1 + s.player.level * 0.08));
      s.player.gold += gold;
      const shard = Math.random() < 0.35;
      if (shard) s.skills.sp++;
      audio.play('treasure');
      this.overlay.showBanner('Schatz gefunden!', `${gold} Gold${shard ? ' und ein Faji-Splitter (+1 Faji-Punkt)' : ''}`);
      this.grantXp(40, 10);
    } else this.hud.toast('Gefunden!', 2);
    this.questEvent({ type: 'treasure', island });
    this.refreshDigs();
    this.persist();
  }

  private usePotion() {
    const s = this.save;
    const hp = this.world.playerHp;
    if (!s || !hp) return;
    if (this.world.mode !== 'foot') { this.hud.toast('Proviant isst man an Land.'); return; }
    if (s.gear.potions <= 0) { this.hud.toast('Kein Proviant mehr – Mara verkauft welchen am Markt.', 3); return; }
    if (hp.hp >= hp.max) { this.hud.toast('Du bist satt und gesund.'); return; }
    s.gear.potions--;
    audio.play('eat');
    this.world.healFrac(POTION.heal);
    this.hud.toast(`Mmh! +${Math.round(POTION.heal * 100)} % Leben · noch ${s.gear.potions}`);
  }

  // ---------- Läden ----------

  buyGear(kind: 'weapon' | 'armor', i: number): string {
    const s = this.save;
    if (!s) return '';
    const list = kind === 'weapon' ? WEAPONS : ARMOR;
    const item = list[i];
    const cur = s.gear[kind];
    if (!item || i <= cur) return '';
    if (rankIndex(s.player.fame) < item.rank) return `Rang „${rankName(s.player.faction, FAME_THRESHOLDS[item.rank])}“ nötig.`;
    const cost = Math.max(0, item.price - Math.floor(list[cur].price / 2));
    if (s.player.gold < cost) return `Dafür fehlen ${cost - s.player.gold} Gold.`;
    s.player.gold -= cost;
    s.gear[kind] = i;
    this.applyPower();
    this.world.healPlayer();
    this.persist();
    return `${item.n} gekauft${cost < item.price ? ` (${cost} Gold nach Inzahlungnahme)` : ''}!`;
  }

  buyPotions(n: number): string {
    const s = this.save;
    if (!s) return '';
    const want = Math.min(n, POTION.max - s.gear.potions);
    const afford = Math.min(want, Math.floor(s.player.gold / POTION.price));
    if (want <= 0) return 'Deine Taschen sind voll.';
    if (afford <= 0) return 'Nicht genug Gold.';
    s.gear.potions += afford;
    s.player.gold -= afford * POTION.price;
    this.persist();
    return `${afford} × ${POTION.n} gekauft.`;
  }

  buyShrine(): string {
    const s = this.save;
    if (!s) return '';
    const price = SHRINE_PRICE(s.gear.shrine);
    if (s.player.gold < price) return `Der Schrein verlangt ${price} Gold.`;
    s.player.gold -= price;
    s.gear.shrine++;
    s.skills.sp++;
    this.world.awaken('#B98CFF');
    this.persist();
    return '+1 Faji-Punkt!';
  }

  /** Taverne: übernachten, bis zum Morgen */
  rest(): string {
    const s = this.save;
    if (!s) return '';
    if (s.player.gold < REST_PRICE) return `Ein Bett kostet ${REST_PRICE} Gold.`;
    s.player.gold -= REST_PRICE;
    this.world.healPlayer();
    const env = this.world.env;
    env.time = 7;
    if (env.weather.target === 'sturm') env.weather.setWeather('klar', true);
    this.persist();
    return 'Du schläfst tief und fest. Ein neuer Morgen in Ankerglück – Leben voll aufgefüllt.';
  }

  // ---------- Auftragsanzeige und Karte ----------

  /** Wohin führt der verfolgte Auftrag? */
  private questTarget(): { x: number; z: number } | null {
    const t = this.quests?.tracked();
    if (!t) return null;
    const pos = this.world.playerPos;
    const isl = (id: string) => { const d = this.world.islandDefs.find((i) => i.id === id); return d ? { x: d.x, z: d.z } : null; };
    const nearest = (list: { x: number; z: number }[]) => list.reduce<{ x: number; z: number } | null>((b, p) => (!b || Math.hypot(p.x - pos.x, p.z - pos.z) < Math.hypot(b.x - pos.x, b.z - pos.z) ? p : b), null);
    switch (t.step.type) {
      case 'talk': return this.world.npcPos(t.step.npc);
      case 'goto': case 'clear': case 'treasure': return isl(t.step.island);
      case 'sink': case 'board': return nearest(this.world.enemyShips.filter((e) => !e.ally));
      case 'rescue': return this.world.nearestFloater('raft');
      case 'kill': return nearest(this.world.islandDefs.filter((i) => i.kind === 'camp' && Math.hypot(i.x - BERNSTEINSEE.x, i.z - BERNSTEINSEE.z) < BERNSTEINSEE.r));
    }
  }

  mapMarkers(): MapMarkers {
    const pos = this.world.playerPos;
    return {
      player: pos,
      enemies: this.world.enemyShips,
      target: this.questTarget(),
      digs: (this.world.life?.digs ?? []).map((d) => ({ x: d.x, z: d.z })),
    };
  }

  private updateQuestHud(frameDt: number) {
    const s = this.save;
    if (!s) return;
    this.hud.setPotions(s.gear.potions);
    const t = this.quests?.tracked();
    if (!t) this.hud.setQuest(null);
    else {
      const target = this.questTarget();
      const pos = this.world.playerPos;
      let angle: number | null = null, dist: number | null = null;
      if (target) {
        const dx = target.x - pos.x, dz = target.z - pos.z;
        dist = Math.hypot(dx, dz);
        const rel = this.world.cameraYaw - Math.atan2(dx, dz);
        angle = Math.atan2(Math.sin(rel), Math.cos(rel));
      }
      this.hud.setQuest({ title: t.q.title, step: stepText(t.step, t.count), angle, dist });
    }
    // Minikarte etwa 10× pro Sekunde
    this.mapT -= frameDt;
    if (this.mapT <= 0) {
      this.mapT = 0.1;
      const c = this.hud.miniCanvas();
      if (c) drawMap(c.ctx, c.size, this.world.islandDefs, this.mapMarkers(), 'mini');
    }
  }

  /** Erfahrung und Ruhm vergeben, Stufen und Ränge prüfen */
  private grantXp(xp: number, fame: number) {
    const s = this.save;
    if (!s) return;
    const p = s.player;
    p.xp += xp;
    const rankBefore = rankName(p.faction, p.fame);
    const famePassive = this.world.faji?.passives.fame ?? 0;
    p.fame = Math.max(0, p.fame + Math.round(fame * (fame > 0 ? 1 + famePassive : 1)));
    let up = false;
    while (p.xp >= PLAYER_BASE.xpNeed(p.level)) {
      p.xp -= PLAYER_BASE.xpNeed(p.level);
      p.level++;
      s.skills.sp++;
      up = true;
    }
    const rankAfter = rankName(p.faction, p.fame);
    if (up) {
      this.applyPower();
      this.world.healPlayer();
      this.world.faji?.refresh(p.level, styleIdOf(p.style, p.blade));
      audio.play('level');
      this.overlay.showBanner(`Stufe ${p.level}!`, '+1 Faji-Punkt · mehr Leben und Angriffskraft');
      this.checkAwakening();
    } else if (rankAfter !== rankBefore) {
      this.overlay.showBanner(rankAfter, 'Neuer Rang!');
    }
    this.hud.setPlayer(p.name, `${FACTION_LABELS[p.faction]} · ${rankAfter} · Stufe ${p.level}`);
  }

  // ---------- Faji ----------

  /** Faji-Erwachen: ab Stufe 15 erwacht der Zweig mit den meisten Punkten (ab 9) */
  checkAwakening(force?: Branch) {
    const s = this.save;
    if (!s) return;
    const sk = s.skills;
    let branch: Branch | null = force ?? null;
    if (!branch) {
      if (s.player.level < 15) return;
      const best = (Object.keys(BRANCHES) as Branch[]).filter((b) => !sk.awakened.includes(b)).sort((a, b) => branchPoints(sk.learned, b) - branchPoints(sk.learned, a))[0];
      if (!best || branchPoints(sk.learned, best) < 9) return;
      branch = best;
    }
    if (sk.awakened.includes(branch)) return;
    sk.awakened.push(branch);
    sk.sp += 2;
    const info = BRANCHES[branch];
    this.world.awaken(info.col);
    setTimeout(() => this.overlay.showCutin('Faji-Erwachen!', info.col), 600);
    setTimeout(() => this.overlay.showBanner(`${info.n} erwacht!`, '+2 Faji-Punkte · neue Meisterfähigkeit freigeschaltet'), 2200);
    this.persist();
  }

  // ---------- Werft ----------

  get shipState() { return this.save?.ship ?? null; }
  get playerGold() { return this.save?.player.gold ?? 0; }
  get playerRank() { return this.save ? rankIndex(this.save.player.fame) : 0; }

  /** Schiffsklasse kaufen oder wechseln. Liefert eine Meldung. */
  shipyardSelect(tier: number): string {
    const s = this.save;
    if (!s) return '';
    const cls = SHIP_CLASSES[tier];
    if (!s.ship.owned.includes(tier)) {
      if (rankIndex(s.player.fame) < cls.rank) return `Rang „${rankName(s.player.faction, FAME_THRESHOLDS[cls.rank])}“ nötig.`;
      if (s.player.gold < cls.price) return `Dafür fehlen ${cls.price - s.player.gold} Gold.`;
      s.player.gold -= cls.price;
      s.ship.owned.push(tier);
    }
    s.ship.tier = tier;
    s.ship.hull = 1;
    this.world.setShip(tier, s.ship.look, s.ship.ammo, 1, s.player.faction);
    this.applyPower();
    this.persist();
    return `${cls.n} bereit zum Auslaufen!`;
  }

  shipyardLook(look: ShipLook) {
    const s = this.save;
    if (!s) return;
    s.ship.look = look;
    this.world.setShip(s.ship.tier, look, s.ship.ammo, this.world.ship.hull / this.world.ship.maxHull, s.player.faction);
    this.persist();
  }

  /** Reparatur kostet Gold je fehlendem Rumpfanteil */
  repairCost() {
    const sh = this.world.ship;
    return Math.ceil((1 - sh.hull / sh.maxHull) * sh.maxHull * 0.6);
  }

  shipyardRepair(): string {
    const s = this.save;
    if (!s) return '';
    const cost = this.repairCost();
    if (cost <= 0) return 'Dein Schiff ist in bestem Zustand.';
    if (s.player.gold < cost) return `Reparatur kostet ${cost} Gold.`;
    s.player.gold -= cost;
    this.world.ship.repair(1);
    this.persist();
    return 'Repariert!';
  }

  /** Testwerkzeug: Punkte und Stufen geben */
  testGrant(sp: number, levels: number) {
    const s = this.save;
    if (!s) return;
    s.skills.sp += sp + levels;
    s.player.level += levels;
    this.applyPower();
    this.world.faji?.refresh(s.player.level, styleIdOf(s.player.style, s.player.blade));
    this.hud.setPlayer(s.player.name, `${FACTION_LABELS[s.player.faction]} · ${rankName(s.player.faction, s.player.fame)} · Stufe ${s.player.level}`);
    this.persist();
  }

  openSkills() {
    const s = this.save;
    if (!s || !this.assets || !this.state.is('play', 'pause')) return;
    this.menus.hide();
    const stage = new SkillStage();
    this.stage = stage;
    stage.show(this.assets, s.player.look, styleIdOf(s.player.style, s.player.blade));
    this.renderer.setView(stage.scene, stage.camera);
    this.renderer.setEffectSources(null, stage.focus);
    this.state.set('editor');
    const tree: SkillTree = new SkillTree(this.uiRoot, {
      state: s.skills,
      level: s.player.level,
      onLearn: (id) => {
        const def = SK[id];
        if (!def || learnBlock(def, s.skills.learned, s.skills.sp, s.player.level, s.skills.awakened as Branch[]) !== null) return;
        s.skills.sp--;
        s.skills.learned[id] = (s.skills.learned[id] ?? 0) + 1;
        if (def.act && !s.skills.slots.includes(id)) {
          const free = s.skills.slots.indexOf(null);
          if (free >= 0) s.skills.slots[free] = id;
        }
        this.world.faji?.refresh(s.player.level, styleIdOf(s.player.style, s.player.blade));
        this.applyPower();
        this.persist();
      },
      onSlot: (id, i) => {
        const j = s.skills.slots.indexOf(id);
        if (j >= 0) s.skills.slots[j] = null;
        s.skills.slots[i] = id;
        this.persist();
      },
      onPreview: (def, lv) => stage.previewSkill(def, lv),
      onClose: () => {
        tree.dispose();
        this.stage = null;
        this.useWorldView();
        this.renderer.resize();
        this.state.set('play');
        this.input.flush();
        this.loop.resetClock();
      },
    });
  }

  // ---------- Charakter-Editor ----------

  /** Editor öffnen: für ein neues Spiel (slot) oder um das Aussehen zu ändern */
  openEditor(newSlot: number | null) {
    if (!this.assets) { this.hud.toast('Figuren werden noch geladen …'); return; }
    const isNew = newSlot !== null;
    const p = this.save?.player;
    const initial: EditorResult = isNew || !p
      ? { name: 'Fynn', faction: 'pirat', style: 'schwert', blade: 'saebel', look: createSave('Fynn', 'pirat', GAME_VERSION).player.look }
      : { name: p.name, faction: p.faction, style: p.style, blade: p.blade, look: structuredClone(p.look) };
    this.menus.hide();
    this.stage ??= new EditorStage();
    this.stage.show(this.assets, initial.look, styleIdOf(initial.style, initial.blade));
    this.renderer.setView(this.stage.scene, this.stage.camera);
    this.renderer.setEffectSources(null, this.stage.focus);
    this.state.set('editor');
    const close = () => {
      this.editor?.dispose();
      this.editor = null;
      this.useWorldView();
      this.renderer.resize();
    };
    this.editor = new CharacterEditor(this.uiRoot, {
      isNew,
      initial,
      onChange: (r, sid) => { this.stage?.show(this.assets!, r.look, sid); },
      onPreview: (k) => this.stage?.preview(k),
      onRotate: (dx) => this.stage?.rotate(dx),
      onZoom: (d) => this.stage?.zoomBy(d),
      onDone: (r) => {
        close();
        if (isNew) this.newGame(newSlot!, r);
        else this.applyLook(r);
      },
      onCancel: () => {
        close();
        if (isNew) { this.state.set('menu'); this.menus.showSlots(); }
        else { this.state.set('pause'); this.menus.showPause(); }
      },
    });
  }

  private applyLook(r: EditorResult) {
    if (this.save) {
      this.save.player.look = r.look;
      this.save.player.style = r.style;
      this.save.player.blade = r.blade;
      this.world.updatePlayer(r.look, styleIdOf(r.style, r.blade));
      this.persist();
    }
    this.state.set('pause');
    this.menus.showPause();
    this.hud.toast('Neuer Look gespeichert.');
  }

  // ---------- Spielablauf ----------

  newGame(slot: number, r: EditorResult) {
    const data = createSave(r.name, r.faction, GAME_VERSION);
    data.player.style = r.style;
    data.player.blade = r.blade;
    data.player.look = r.look;
    if (!this.saves.save(slot, data)) this.hud.toast('Speichern nicht möglich – Speicher voll?');
    this.enterPlay(slot, data);
    this.hud.toast(r.faction === 'pirat' ? 'Leinen los, Schiffsjunge!' : 'Willkommen an Bord, Rekrut!', 3);
  }

  continueGame(slot: number) {
    const info = this.saves.load(slot);
    if (!info.data) return;
    this.enterPlay(slot, info.data);
    if (info.error) this.hud.toast(info.error, 4);
  }

  private enterPlay(slot: number, data: SaveData) {
    this.slot = slot;
    this.save = data;
    this.world.setState({ boat: data.world.boat, env: { time: data.world.time, weather: data.world.weather as WeatherId } });
    const p = data.player;
    this.world.playerFaction = p.faction;
    if (this.assets) this.world.setCharacters(this.assets, p.look, styleIdOf(p.style, p.blade), this.overlay);
    this.world.setSkills(data.skills, p.level);
    this.world.setShip(data.ship.tier, data.ship.look, data.ship.ammo, data.ship.hull, p.faction);
    this.quests = new QuestSystem(data.progress, p.faction, {
      completed: (q) => this.onQuestDone(q),
      advanced: (_q, next) => this.hud.toast(`Neues Ziel: ${next.text}`, 3.5),
    });
    this.refreshDigs();
    this.applyPower();
    this.world.healPlayer();
    this.hud.setPlayer(p.name, `${FACTION_LABELS[p.faction]} · ${rankName(p.faction, p.fame)} · Stufe ${p.level}`);
    this.menus.hide();
    this.input.flush();
    this.autosaveTimer = 0;
    this.autoQuality.reset();
    this.state.set('play');
    this.loop.resetClock();
    this.touch.setLayout(TOUCH_SEA);
    this.hud.hint(this.controlsHint(), 12);
    if (!data.progress.quests.length && !data.progress.done.length) setTimeout(() => this.hud.toast('Leg in Ankerglück an und sprich mit Hafenmeisterin Ilse!', 5), 4000);
  }

  pause() {
    if (!this.state.is('play')) return;
    this.state.set('pause');
    this.persist();
    this.menus.showPause();
  }

  resume() {
    if (!this.state.is('pause')) return;
    this.menus.hide();
    this.input.flush();
    this.autoQuality.reset();
    this.state.set('play');
    this.loop.resetClock();
  }

  quitToMenu() {
    this.persist();
    this.save = null;
    this.slot = null;
    this.quests = null;
    this.state.set('menu');
    this.menus.showMain();
  }

  /** Speichert den aktuellen Spielstand. true = erfolgreich (oder nichts zu speichern). */
  persist(): boolean {
    this.autosaveTimer = 0;
    if (!this.save || this.slot === null) return true;
    const ws = this.world.getState();
    this.save.world = { boat: ws.boat, time: ws.env.time, weather: ws.env.weather };
    const sh = this.world.ship;
    this.save.ship.hull = sh.maxHull > 0 ? Math.max(0.05, sh.hull / sh.maxHull) : 1;
    this.save.ship.ammo = sh.ammo;
    const ok = this.saves.save(this.slot, this.save);
    if (!ok && !this.saveFailedShown) {
      this.saveFailedShown = true;
      this.hud.toast('Speichern fehlgeschlagen – exportiere deinen Spielstand im Menü.', 4);
    }
    return ok;
  }

  get hasSave() { return !!this.save; }

  // ---------- Einstellungen ----------

  setQuality(tier: QualityTier | 'auto') {
    if (tier === 'auto') {
      this.settings.update({ qualityAuto: true, quality: this.detected.tier });
      this.renderer.applyQuality(this.detected.tier);
    } else {
      this.settings.update({ qualityAuto: false, quality: tier });
      this.renderer.applyQuality(tier);
    }
    this.autoQuality.reset();
  }

  private applySettings() {
    const s = this.settings.data;
    document.documentElement.style.setProperty('--text-scale', String(s.textScale));
    this.input.setKeyBindings(s.keyBindings);
    this.input.invertY = s.invertLookY;
    audio.setVolumes(s.volume);
    this.updateTouchVisibility();
  }

  private updateTouchVisibility() {
    const mode = this.settings.data.touchControls;
    const show = this.state.is('play') && (mode === 'on' || (mode === 'auto' && this.input.lastDevice === 'touch'));
    this.touch.setVisible(show);
  }

  private controlsHint(): string {
    const dev = this.input.lastDevice;
    const foot = this.world.mode === 'foot';
    if (dev === 'touch') return foot
      ? 'Links ziehen: Laufen · Rechts ziehen: Kamera · Angriff, Schwer, Rolle · Goldener Knopf: Aktion'
      : 'Links ziehen: Steuern · Rechts ziehen: Kamera · Feuer, Breitseiten, Schub · Goldener Knopf: Aktion';
    if (dev === 'gamepad') return foot
      ? 'Linker Stick: Laufen · Rechter Stick: Kamera · A: Angriff · Y: Schwer · B: Rolle · X: Aktion · Start: Pause'
      : 'Linker Stick: Steuern · Rechter Stick: Kamera · A: Feuer · LB/RB: Breitseiten · B: Schub · X: Aktion · Start: Pause';
    const b = this.input.getKeyBindings();
    const k = (a: keyof typeof b) => (b[a][0] ? this.input.keyLabel(b[a][0]) : '–');
    return foot
      ? `${k('up')}${k('left')}${k('down')}${k('right')}: Laufen · ${k('attack')}/Klick: Angriff · ${k('heavy')}: Schwer · ${k('dodge')}: Rolle · ${k('interact')}: Aktion · Rechte Maustaste: Kamera · Esc: Pause`
      : `${k('up')}/${k('down')}: Fahrt · ${k('left')}/${k('right')}: Steuern · ${k('attack')}: Feuer · ${k('fireLeft')}/${k('fireRight')}: Breitseiten · ${k('dodge')}: Schub · ${k('interact')}: Aktion · Esc: Pause`;
  }
}
