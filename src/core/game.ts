import { lowerTier, QUALITY_TIERS, type QualityTier } from '../data/qualityTiers';
import { FACTION_LABELS, rankIndex, rankName } from '../data/ranks';
import { TOUCH_FOOT, TOUCH_SEA } from '../data/touchLayout';
import { randomLook } from '../data/characterParts';
import { WEATHER, type WeatherId } from '../data/world';
import { CharacterAssets } from '../entities/character/assets';
import { Character } from '../entities/character/character';
import { Vector3, type ShaderMaterial } from 'three';
import { SkyProbe } from '../render/ibl';
import { preload } from './preload';
import { LoadingScreen } from '../ui/loadingScreen';
import { toonShared } from '../render/toon';
import type { Enemy } from '../entities/enemy';
import { PLAYER_BASE } from '../data/combat';
import { CombatOverlay } from '../ui/combatOverlay';
import { BRANCHES, branchPoints, learnBlock, SK, type Branch } from '../data/skills';
import { SkillTree } from '../ui/skillTree';
import { AMMO, SAIL_LEVELS, SHIP_CLASSES, type ShipLook } from '../data/ships';
import { FAME_THRESHOLDS } from '../data/ranks';
import { SkillStage } from '../world/skillStage';
import { detectWebGpu, AutoQuality, benchmarkGpu, detectTier, gatherDeviceInfo, needsBench, type DeviceInfo, type Detected } from '../render/quality';
import { GameRenderer } from '../render/renderer';
import { setTexDetail } from '../render/texDetail';
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
import { DialogOverlay } from '../ui/dialogOverlay';
import { InventoryScreen, type InvItem, type InventoryHost } from '../ui/inventory';
import { addItem, armorEq, bagConsumables, computeStats, ensureGear, headEq, itemCount, takeItem, weaponEq, type StatSheet } from './inventory';
import { ARMOR_LOOK, BAR_SLOTS, CONSUMABLE_BY_ID, CONSUMABLES, GLOBAL_ITEM_CD, HEADS, HEAD_BY_ID, type SlotId } from '../data/items';
import { NpcMarkers, type NpcMark } from '../ui/npcMarkers';
import { QuestLog } from '../ui/questLog';
import { DialogSession } from '../story/dialog';
import { STYLE_ANIMS, type StyleId } from '../data/animations';
import { SettingsStore } from './settings';
import { StateMachine } from './state';
import { browserStore } from './storage';
import { audio, type Mood } from '../audio/audio';
import { EDGE_WALL } from '../data/world';
import { QuestSystem, stepText } from '../story/questSystem';
import { TOWN_NPCS, VILLAGE_NPC_BY_ID, VILLAGE_NPCS, type QuestDef, type TownNpcDef } from '../data/quests';
import { ARMOR, BERNSTEINSEE, POTION, REGIONS, REST_PRICE, SHRINE_PRICE, WEAPONS, WEAPON_LINES, type IslandDef, type RegionDef } from '../data/regions';
import { PerfWatchdog } from '../render/watchdog';
import { drawMap, mapPalette, type MapMarkers, type MapOpts, type Poi, type WorldMapData } from '../ui/minimap';
import { Compass, type CompassPoi } from '../ui/compass';
import { WorldMapScreen } from '../ui/worldMap';
import { CREW_BY_ID } from '../data/crew';
import { RARITY, rollTrinket, TRINKET_BY_ID, type Rarity } from '../data/trinkets';
import { RARITIES, type LootDrop } from '../data/loot';
import { ACHIEVEMENTS } from '../data/achievements';
import { ABYSS_LAIR } from '../naval/seaBoss';
import { QUESTS, QUEST_BY_ID } from '../data/quests';
import { hostileLegends, LEGEND_BY_ID, rankRows } from '../data/legends';

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
  readonly detected: Detected;
  /** Spielsitzung: steigt bei neuem Spiel, Laden und Rückkehr ins Menü – verzögerte Anzeigen alter Sitzungen verfallen */
  private session = 0;
  /** Verzögert ausführen, aber nur, wenn inzwischen kein anderes Spiel geladen oder das Menü geöffnet wurde */
  private after(fn: () => void, ms: number) {
    const s = this.session;
    setTimeout(() => { if (s === this.session && this.state.is('play', 'pause')) fn(); }, ms);
  }
  /** WebGPU im Browser verfügbar? (nur Anzeige: das Spiel rendert bewusst mit WebGL 2, siehe detectWebGpu) */
  webgpu: 'pruefe' | 'ja' | 'nein' = 'pruefe';
  assets: CharacterAssets | null = null;
  readonly overlay: CombatOverlay;

  private slot: number | null = null;
  private save: SaveData | null = null;
  private autoQuality = new AutoQuality();
  private watchdog = new PerfWatchdog();
  private autosaveTimer = 0;
  private saveFailedShown = false;
  private stage: EditorStage | null = null;
  private skyProbe: SkyProbe;
  private listenDir = new Vector3();
  private editor: CharacterEditor | null = null;
  private uiRoot: HTMLElement;
  private dialogUi!: DialogOverlay;
  private markers!: NpcMarkers;
  private questLog: QuestLog | null = null;
  private inventoryUi: InventoryScreen | null = null;
  private compass!: Compass;
  private worldMap: WorldMapScreen | null = null;
  private shapeById: Map<string, import('../ui/minimap').ShapeLike> | null = null;
  /** Laufende Stärkungen (Güter), Abklingzeiten je Gut und die gemeinsame Pause der Leiste (Sekunden, nicht gespeichert) */
  private buffs: { id: string; t: number }[] = [];
  private itemCd = new Map<string, number>();
  private globalCd = 0;
  private dialogSession: DialogSession | null = null;
  private dialogNpc: TownNpcDef | null = null;
  private markPos = new Map<string, Vector3>();
  private quests: QuestSystem | null = null;
  /** Im laufenden Gespräch abgeschlossene Aufträge (für die Abschlusstexte) */
  private justDone: QuestDef[] | null = null;
  private mapT = 0;
  private legendT = 2;
  /** Wann eine geflohene Legende wieder auftauchen darf (Spielzeit) */
  private legendCd = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    const { store, persistent } = browserStore();
    this.persistent = persistent;
    this.settings = new SettingsStore(store);
    this.saves = new SaveManager(store, GAME_VERSION);

    this.renderer = new GameRenderer(canvas);
    // Grafikstufe vor dem Bau der Welt festlegen: die Texturen werden in passender Auflösung gemalt
    this.deviceInfo = gatherDeviceInfo(this.renderer.gl.getContext());
    // Verbirgt der Browser die Grafikkarte (Firefox, Brave …) oder ist sie unbekannt, misst ein kurzer Test die Leistung
    let bench: number | null = null;
    const ctx = this.renderer.gl.getContext();
    if (needsBench(this.deviceInfo) && typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext) {
      bench = benchmarkGpu(ctx);
      this.renderer.gl.resetState();
    }
    this.detected = detectTier(this.deviceInfo, bench);
    detectWebGpu().then((ok) => { this.webgpu = ok ? 'ja' : 'nein'; });
    this.renderer.mobile = this.deviceInfo.mobile;
    // Lade-Pipeline kennt jetzt die Grafikkarte (KTX2-Formate)
    preload.init(this.renderer.gl);
    const s = this.settings.data;
    // „Automatisch“: bei jedem Start neu erkennen (so bekommen starke PCs auch neue Stufen wie Ultra)
    if (!s.quality || s.qualityAuto) this.settings.update({ quality: this.detected.tier, qualityAuto: true });
    const startTier = QUALITY_TIERS[this.settings.data.quality ?? this.detected.tier];
    const caps = this.renderer.gl.capabilities;
    setTexDetail(startTier.textureScale, Math.min(startTier.anisotropy, caps.getMaxAnisotropy()), startTier.detail);
    this.world = new SeaWorld();
    this.world.env.maxTex = caps.maxTextureSize;
    // Spiegelungen (IBL): der Himmel wird regelmäßig als vorgefilterte Umgebungskarte aufgenommen
    this.skyProbe = new SkyProbe(this.renderer.gl, this.world.env.sky.dome.material as ShaderMaterial);
    this.renderer.onQualityChange((c) => this.world.applyQuality(c));
    this.renderer.onQualityChange((c) => {
      this.skyProbe.setInterval(c.ibl);
      toonShared.envOn.value = c.ibl > 0 ? 1 : 0;
    });
    this.useWorldView();
    this.renderer.applyQuality(this.settings.data.quality ?? this.detected.tier);

    this.input = new Input(canvas);
    this.hud = new Hud(uiRoot);
    this.touch = new TouchControls(uiRoot, this.input);
    this.touch.setLayout(TOUCH_SEA);
    this.menus = new Menus(uiRoot, this);
    this.menus.onError = () => this.hud.toast('Das hat leider nicht geklappt – bitte noch einmal versuchen.', 3);

    this.overlay = new CombatOverlay(uiRoot);
    this.overlay.setVisible(false);
    this.dialogUi = new DialogOverlay(uiRoot);
    this.markers = new NpcMarkers(uiRoot);
    this.compass = new Compass(uiRoot);
    this.world.onMessage = (m) => this.hud.toast(m);
    this.world.onModeChange = (m) => this.onModeChange(m);
    this.world.onKill = (e) => this.onKill(e);
    this.world.onGold = (n) => { if (this.save) this.save.player.gold += Math.round(n * this.goldMult()); };
    this.world.onCrewLine = (who, text) => this.hud.toast(`${who.name}: „${text}“`, 4);
    this.world.onShipSunk = (e) => {
      if (!this.save || e.captured) return;
      const p = this.save.player;
      if (!e.companion) { this.save.progress.stats.sunk++; this.questEvent({ type: 'sink' }); }
      if (e.legendId) { this.defeatLegend(e.legendId, false); return; }
      if (e.ghost && Math.random() < 0.4) this.dropTrinket('selten', 0.15);
      // Seegefechte sind seltener geworden – dafür zählt jedes einzelne mehr
      else if ((e.role === 'jaeger' || e.role === 'patrouille') && Math.random() < 0.1 + e.level * 0.005) this.dropTrinket('gewoehnlich', e.level * 0.01);
      const mult = e.role === 'legende' ? 6 : e.role === 'haendler' ? 1.6 : e.ghost ? 4 : e.role === 'jaeger' ? 3.2 : 2.8;
      this.grantXp(Math.round((25 + e.level * 10) * mult), e.role === 'legende' ? 250 : e.role === 'haendler' ? (p.faction === 'pirat' ? 6 : -6) : 14 + e.level);
      if (e.role === 'legende') audio.play('win');
      this.overlay.showBanner(e.role === 'legende' ? `${e.name} besiegt!` : 'Schiff versenkt!', e.role === 'haendler' ? 'Ein Handelsschiff' : '');
    };
    this.world.onLoot = (gold, shard) => {
      if (!this.save) return;
      this.save.player.gold += Math.round(gold * this.goldMult(true));
      if (shard) { this.save.skills.sp++; this.hud.toast('Faji-Splitter: +1 Faji-Punkt!', 3); }
    };
    this.world.onBoardWon = (e) => {
      if (!this.save) return;
      const p = this.save.player;
      this.save.progress.stats.boarded++;
      this.addLoyalty(this.save.crew.party, 4);
      this.questEvent({ type: 'board' });
      // Legenden: genau ein Sieg (früher zählte Entern zusätzlich als „versenkt“ – und damit als Revanche)
      if (e.legendId) { this.defeatLegend(e.legendId, true); return; }
      if (e.ghost && Math.random() < 0.5) this.dropTrinket('selten', 0.2);
      // Entern ist riskanter als Versenken – und lohnt sich darum etwas mehr
      const mult = e.role === 'haendler' ? 2 : e.ghost ? 4.5 : 3.4;
      this.grantXp(Math.round((25 + e.level * 10) * mult) + 40, e.role === 'haendler' ? (p.faction === 'pirat' ? 8 : -6) : 24 + e.level);
    };
    this.world.onTalk = (npc) => this.talkTo(npc);
    this.world.onHarbor = (def) => this.openHarbor(def);
    this.world.onEnterRegion = (r) => this.enterRegion(r);
    this.world.onFish = (caught) => this.fishResult(caught);
    this.world.onOpenSkills = () => this.openSkills();
    this.world.onDiscover = (id) => {
      const s = this.save;
      if (!s) return;
      const list = (s.progress.flags.disc as string[] | undefined) ?? [];
      if (list.includes(id)) return;
      s.progress.flags.disc = [...list, id];
      const def = this.world.islandDefs.find((i) => i.id === id);
      if (def && this.state.is('play')) this.hud.toast(`Insel entdeckt: ${def.name}`, 2.5);
    };
    this.world.onSeaBossDown = () => {
      if (!this.save) return;
      audio.play('win');
      this.save.progress.flags.tiefenschlund = true;
      const g = Math.round(5000 * this.goldMult(true));
      this.save.player.gold += g;
      this.after(() => this.overlay.showCutin('Der Tiefenschlund fällt!', '#9FE8FF'), 300);
      this.overlay.showBanner('Der Tiefenschlund ist besiegt!', `+${g.toLocaleString('de-DE')} Gold · Der Weg zur Schlundkrone ist frei`);
      this.grantXp(3000, 500);
      this.dropTrinket('legendaer', 0, 'siegelsplitter');
      this.questEvent({ type: 'slay', target: 'tiefenschlund' });
    };
    this.world.onEnterIsland = (def) => this.enterIsland(def);
    this.world.onIslandCleared = (id) => this.islandCleared(id);
    this.world.onLootDrop = (d) => this.onLootPickup(d);
    this.world.questWantsClear = (id) => !!this.save?.progress.quests.some((p) => { const st = QUEST_BY_ID[p.id]?.steps[p.step]; return st?.type === 'clear' && st.island === id; });
    this.world.onCrystal = (id) => this.awakenCrystal(id);
    this.world.onVillage = (id) => this.villageGift(id);
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
    this.hud.onMap = () => this.openWorldMap();
    this.world.onPlayerDown = () => {
      audio.play('ko');
      this.overlay.showBanner('K.O.', 'Die Crew eilt zu Hilfe …');
      if (this.save) {
        const lost = Math.floor(this.save.player.gold * 0.1);
        this.save.player.gold -= lost;
        if (lost > 0) this.after(() => this.hud.toast(`${lost} Gold gingen verloren.`, 3), 3500);
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
    // Ladeplan: Dateien 72 %, Figuren aufbereiten 8 %, Shader vorbereiten 20 %
    const loading = new LoadingScreen();
    preload.plan(0.72, { prepare: 0.08, shaders: 0.2 });
    preload.onProgress((p, phase) => loading.set(p, phase));
    preload.setPhase('Figuren und Animationen werden geladen …');
    try {
      this.assets = await CharacterAssets.load();
      preload.step('prepare', 0.5, 'Figuren werden vorbereitet …');
      this.world.setCharacters(this.assets, randomLook(Math.random, 'pirat'), 'saebel', this.overlay);
      preload.step('prepare', 1);
      // Shader vorkompilieren, damit Gegner, Treffer und Fähigkeiten beim ersten Mal nicht ruckeln
      preload.setPhase('Effekte werden vorbereitet …');
      await this.world.warmup(this.renderer.gl, () => this.render(1, 1 / 60), (k) => preload.step('shaders', k));
    } catch (e) {
      console.error(e);
      this.hud.toast('Figuren konnten nicht geladen werden – prüfe die Verbindung.', 5);
    }
    await loading.finish();
    this.state.set('menu');
    this.menus.showMain();
  }

  private useWorldView() {
    this.renderer.setView(this.world.scene, this.world.camera);
    this.renderer.setEffectSources(this.world.env.sunMesh, this.world.focus);
  }

  // ---------- Schleife ----------

  private update(dt: number) {
    // Figuren: letzter Logikstand wird Ausgangspunkt für das weiche Gleiten bis zum nächsten Schritt
    Character.beginStep();
    this.input.poll();
    this.input.beginStep();
    if (this.state.is('play')) {
      if (this.input.pressed('pause')) { this.pause(); return; }
      if (this.input.pressed('map')) { this.openWorldMap(); return; }
      if (this.input.pressed('skills')) { this.openSkills(); return; }
      if (this.input.pressed('quests')) { this.openQuestLog(); return; }
      if (this.input.pressed('swap')) this.swapWeapon();
      if (this.input.pressed('weapon1')) this.swapWeapon(0);
      if (this.input.pressed('weapon2')) this.swapWeapon(1);
      if (this.input.pressed('potion')) this.usePotion();
      if (this.input.pressed('inventory')) { this.openInventory(); return; }
      for (let i = 0; i < BAR_SLOTS; i++) if (this.input.pressed(`item${i + 1}` as 'item1')) this.useItem(this.save?.gear.bar?.[i] ?? null);
      this.tickItems(dt);
      this.legendT -= dt;
      if (this.legendT <= 0) { this.legendT = 1; this.updateLegends(); this.checkAchievements(); }
      this.world.update(dt, this.input);
      if (this.save?.crew.hired.includes('cook') && this.world.mode === 'sail') { const sh = this.world.ship; if (sh.alive && sh.hull < sh.maxHull) sh.hull = Math.min(sh.maxHull, sh.hull + dt * 1.2); }
      if (this.save) this.save.meta.playTime += dt;
      this.autosaveTimer += dt;
      if (this.autosaveTimer >= AUTOSAVE_SECONDS) this.persist();
    } else if (this.state.is('editor') && this.skillTree && this.input.pressed('skills')) {
      this.skillTree.close();
    } else if (this.state.is('editor') && this.inventoryUi && this.input.pressed('inventory')) {
      this.closeInventory();
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
    // Standbild (30–40 ms) bei wirksamen Treffern, danach die etwas längere Zeitlupe schwerer Treffer
    if (hs.freeze > 0) { this.loop.timeScale = 0; hs.freeze -= frameDt; }
    else if (hs.t > 0) { this.loop.timeScale = hs.scale; hs.t -= frameDt; }
    else { this.loop.timeScale = 1; hs.scale = 1; }
    const a = this.state.is('play', 'pause') ? alpha : 1;
    this.world.render(a, frameDt, this.state.is('menu', 'boot'));
    this.skyProbe.update(frameDt);
    {
      // Farbstimmung der Nachbearbeitung nach Tageszeit (Mondlicht-Blau nachts, Bernstein zur goldenen Stunde)
      const pal = this.world.env.palette;
      const dark = 1 - pal.sunVis;
      const nightK = Math.min(1, Math.max(0, (dark - 0.2) / 0.7));
      const lowSun = Math.min(1, Math.max(0, (0.5 - pal.sunDir.y) / 0.38));
      this.renderer.setMood(nightK, pal.sunVis * lowSun);
    }
    // Gegner, Crew und Stadtleute zwischen den 60-Hz-Logikschritten weich darstellen
    Character.present(a);
    // Tiefenunschärfe: beim Erfassen eines Gegners auf ihn scharfstellen
    this.renderer.dofTarget = this.state.is('play') ? this.world.lockFocus : null;
    // Waffenschweife nach dem Ausrichten aller Figuren abtasten (Echtzeit, bei jedem Bild glatt)
    Character.renderTrails(frameDt);
    this.renderer.render(frameDt);
    this.overlay.update(this.state.is('play') ? frameDt * this.loop.timeScale : 0, this.world.camera);
    this.updateNpcMarkers();
    this.updateCompass();
    if (this.state.is('play')) {
      const s = this.settings.data;
      if (this.save) {
        const hp = this.world.playerHp;
        const p = this.save.player;
        this.hud.setStats(hp ? hp.hp / hp.max : 1, p.xp / PLAYER_BASE.xpNeed(p.level), p.gold);
        const stm = this.world.playerStamina;
        this.hud.setStamina(stm ? stm.frac : null, !!stm?.flash);
        const sh = this.world.ship;
        this.hud.setSea(this.world.mode === 'sail' ? {
          hull: sh.hull / sh.maxHull, sail: sh.sail, crew: sh.crew, level: SAIL_LEVELS[sh.sailLevel].n, ammo: AMMO[sh.ammo].n,
          reloadL: sh.reloadL / this.world.reloadTime, reloadR: sh.reloadR / this.world.reloadTime, windRel: this.world.env.windDir - sh.heading, fire: sh.fire > 0,
        } : null);
        const fj = this.world.faji;
        this.hud.setFaji(fj ? fj.faji / fj.maxFaji : 1, this.save.skills.sp);
        if (fj) {
          const views = fj.slots();
          const foot = this.world.mode === 'foot';
          const b = this.input.getKeyBindings();
          const keys = this.input.lastDevice === 'gamepad' ? ['LT', 'RT', 'RB'] : (['skill1', 'skill2', 'skill3'] as const).map((a) => this.input.keyLabel(b[a][0] ?? ''));
          // auch auf See sichtbar (wie in 1.0): Fähigkeiten ohne Seewirkung sind abgeblendet
          this.hud.setSkillBar(this.input.lastDevice !== 'touch', views, keys, !foot);
          views.forEach((v, i) => this.touch.setButton(`skill${i + 1}`, v.short, v.cdFrac, v.ready && (foot || v.sea), v.color, !foot && !!v.id && !v.sea, !v.id));
          if (!foot) for (const [act, side] of [['fireLeft', 1], ['fireRight', -1]] as const) this.touch.setHot(act, this.world.fanHot(side));
        }
      }
      const dyn = this.renderer.dynRes.scale;
      this.hud.setFps(s.showFps, `${this.loop.fps} fps · ${QUALITY_TIERS[this.renderer.tier].label}${this.renderer.budget ? ` · Spar ${this.renderer.budget}` : ''}${dyn < 0.999 ? ` · ${Math.round(dyn * 100)} %` : ''}`);
      const env = this.world.env;
      this.hud.setEnv(`${formatClock(env.time)} · ${env.timeName} · ${WEATHER[env.weather.target].label}`);
      const key = this.input.lastDevice === 'keyboard' ? this.input.keyLabel(this.input.getKeyBindings().interact[0] ?? 'KeyR')
        : this.input.lastDevice === 'gamepad' ? 'X' : null;
      this.hud.setContext(this.world.contextLabel, key);
      this.updateQuestHud(frameDt);
      this.hud.setItemBar(this.input.lastDevice !== 'touch', this.itemBarViews(), (['item1', 'item2', 'item3', 'item4'] as const).map((a) => this.input.keyLabel(this.input.getKeyBindings()[a][0] ?? '')));
      // Erst die Auflösung anpassen (unsichtbarer), die ganze Grafikstufe erst senken, wenn das nicht reicht
      // Leistungs-Wächter: unter 50 fps zuerst unsichtbare Last abbauen (Schatten, AO, Vegetation), erst danach Auflösung und Grafikstufe
      if (s.qualityAuto) {
        const lv = this.watchdog.sample(frameDt);
        if (lv !== null) { this.renderer.setBudget(lv); this.renderer.dynRes.rewarm(); this.autoQuality.reset(); }
      } else if (this.watchdog.level > 0) { this.watchdog.reset(); this.renderer.setBudget(0); }
      const budgetSpent = !s.qualityAuto || this.watchdog.level >= PerfWatchdog.MAX;
      if (s.dynamicResolution && (budgetSpent || this.watchdog.level >= 2) && this.renderer.dynRes.sample(frameDt)) this.renderer.resize();
      if (s.qualityAuto && budgetSpent) {
        if (s.dynamicResolution && this.renderer.dynRes.hasRoom) this.autoQuality.reset();
        else if (this.autoQuality.sample(frameDt)) { this.watchdog.reset(); this.autoLower(); }
      }
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
    // 3D-Hörer: Richtung von der Kamera aus (links/rechts passt zum Bild), Entfernung ab den „Ohren“ der Spielfigur
    w.camera.getWorldDirection(this.listenDir);
    const ly = this.world.mode === 'foot' ? (this.world.playerFootY ?? 0) + 1.5 : 3;
    const cp = w.camera.position;
    audio.setListener3D(cp.x, cp.y, cp.z, this.listenDir.x, this.listenDir.y, this.listenDir.z);
    audio.setEars(pos.x, ly, pos.z);
    audio.setLite(this.renderer.mobile || this.renderer.tier === 'low');
    if (this.state.is('play', 'pause')) {
      const env = w.env;
      const town = w.islandDefs.find((i) => i.kind === 'town');
      const dTown = town ? Math.hypot(town.x - pos.x, town.z - pos.z) : 9999;
      const threat = w.threat;
      const night = env.time < 5.5 || env.time > 20.5;
      const mood: Mood = w.bossNear ? 'boss' : threat > 0.65 ? 'battle' : dTown < 150 ? 'harbor' : night && this.region.id === 'bernsteinsee' ? 'night' : 'sea';
      // Seeschlacht: volles Blech, Taiko-Ensemble und Chor in der Kampfschicht
      audio.setMood(mood, threat, this.region.song ?? 'sea', w.mode === 'sail');
      // Untergrund der Schritte: Deck und Stege aus Holz, Stadt gepflastert, sonst Sand und Gras
      audio.surface = w.onDeck ? 'holz' : dTown < 70 ? 'stein' : 'sand';
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

  /** Alle Werte der Spielfigur aus Ausrüstung, Talisman, Crew und Stärkungen (Inventar zeigt sie, applyPower wendet sie an) */
  playerStats(gearOverride?: Partial<import('./save/types').GearState>): StatSheet {
    const s = this.save!;
    const has = (id: string) => s.crew.hired.includes(id);
    const buff = { atk: 0, reduce: 0, crit: 0 };
    for (const b of this.buffs) {
      const d = CONSUMABLE_BY_ID[b.id]?.buff;
      if (d) { buff.atk += d.atk ?? 0; buff.reduce += d.reduce ?? 0; buff.crit += d.crit ?? 0; }
    }
    return computeStats({
      level: s.player.level,
      gear: gearOverride ? { ...s.gear, ...gearOverride } : s.gear,
      style: s.player.style,
      hpPassive: this.world.faji?.passives.hpMax ?? 0,
      critPassive: this.world.faji?.passives.crit ?? 0,
      atkCrew: (has('ram') ? 1.1 : 1) * (has('musik') ? 1.05 : 1),
      weaponCrew: has('schmied') ? 1.12 : 1,
      fajiCrew: has('lehrer') ? 0.2 : 0,
      buff,
    });
  }

  /** Aussehen mit angelegter Kopfbedeckung und Rüstung (das gespeicherte Aussehen bleibt unverändert) */
  private displayLook(d: SaveData | null = this.save) {
    const p = d!.player;
    const look = structuredClone(p.look);
    const g = d!.gear;
    const head = headEq(g);
    if (head) { look.hat = head.hat; look.hatColor = head.color; }
    const al = ARMOR_LOOK[armorEq(g)];
    if (al) Object.assign(look, al);
    return look;
  }

  private applyPower() {
    if (!this.save) return;
    const lvl = this.save.player.level;
    const gear = this.save.gear;
    ensureGear(gear);
    const wdef = WEAPONS[weaponEq(gear)];
    if (wdef) this.world.setWeaponLook({ blade: wdef.col, glow: !!wdef.glow });
    const has = (id: string) => this.save!.crew.hired.includes(id);
    const up = this.save.ship.up;
    const tb = (gear.trinket ? TRINKET_BY_ID[gear.trinket]?.bonus : null) ?? {};
    // Alle Werte aus einer Stelle (core/inventory.ts): Ausrüstung, Talisman, Crew, Stärkungen
    const st = this.playerStats();
    this.world.setPlayerPower(st.hp, st.atk);
    this.world.setGearReduce(st.reduce);
    this.world.shipSpeedMult = (has('nav') ? 1.15 : 1) * (has('esra') ? 1.1 : 1) * (1 + up.sail * 0.05) * (1 + (tb.speed ?? 0));
    this.world.ship.turnMult = has('helm') ? 1.6 : 1;
    this.world.rangeMult = has('look') ? 1.25 : 1;
    const hullBonus = (has('carp') ? 40 : 0) + Math.round(SHIP_CLASSES[this.save.ship.tier].hp * up.hull * 0.15);
    if (hullBonus !== this.world.hullBonus) {
      this.world.hullBonus = hullBonus;
      this.world.setShip(this.save.ship.tier, this.save.ship.look, this.world.ship.ammo, this.world.ship.hull / Math.max(1, this.world.ship.maxHull), this.save.player.faction);
    }
    // Stilbonus der Waffenlinie: Foki laden Faji schneller nach, Kampfhandschuhe treffen öfter voll
    if (this.world.faji) this.world.faji.extraRegen = st.fajiRegen;
    if (this.world.combat) this.world.combat.critChance = st.crit;
    const nav = this.world.naval;
    if (nav) {
      nav.playerLevel = lvl;
      nav.playerFaction = this.save.player.faction;
      nav.playerRank = rankIndex(this.save.player.fame);
      nav.canDmg = (12 + lvl * 1.4) * (1 + this.save.ship.tier * 0.06) * (1 + up.can * 0.12) * (has('bruno') ? 1.2 : 1) * (1 + (tb.cannon ?? 0));
      nav.reloadMult = has('gun') ? 0.7 : 1;
    }
    const c = this.save.crew;
    this.world.setCrew(c.hired, c.party, c.loyalty, lvl, (has('musik') ? 1.15 : 1) * (has('ram') ? 1.15 : 1));
  }

  /** Gold-Bonus der Crew (Katze, Taucherin für Beute) */
  private goldMult(loot = false) {
    const h = this.save?.crew.hired ?? [];
    const t = this.save?.gear.trinket ? TRINKET_BY_ID[this.save.gear.trinket]?.bonus.gold ?? 0 : 0;
    return (h.includes('cat') ? 1.3 : 1) * (loot && h.includes('kiko') ? 1.5 : 1) * (1 + t);
  }

  /** Angeln: Fang je nach Region, manchmal eine Flaschenpost */
  private fishResult(caught: boolean) {
    const s = this.save;
    if (!s) return;
    if (!caught) { this.hud.toast('Der Fisch ist weg …', 2); return; }
    s.progress.flags.fish = Number(s.progress.flags.fish ?? 0) + 1;
    const lv = this.region.level ?? 1;
    const fishes = [['Sardine', 8], ['Makrele', 14], ['Bernsteinbarsch', 24], ['Nebelaal', 35], ['Glutforelle', 45], ['Sturmhai', 70], ['Tiefseeleuchter', 110]] as const;
    const roll = Math.random();
    if (roll < 0.06) { this.findBottle(); return; }
    const idx = Math.min(fishes.length - 1, Math.floor(Math.random() * 3) + Math.floor(lv / 3));
    const [n, v] = fishes[idx];
    const gold = Math.round(v * this.goldMult());
    s.player.gold += gold;
    if (s.gear.potions < POTION.max && Math.random() < 0.4) { s.gear.potions++; this.hud.toast(`Gefangen: ${n}! +${gold} Gold und +1 Proviant`, 3); }
    else this.hud.toast(`Gefangen: ${n}! +${gold} Gold`, 3);
    audio.play('coin');
    this.grantXp(6 + idx * 4, 0);
  }

  /** Würfeln in der Taverne: zwei Würfel gegen Baldo */
  dice(bet: number): string {
    const s = this.save;
    if (!s) return '';
    if (s.player.gold < bet) return 'Dafür reicht dein Gold nicht.';
    const r = () => 1 + Math.floor(Math.random() * 6);
    const me = [r(), r()], him = [r(), r()];
    const a = me[0] + me[1], b = him[0] + him[1];
    const face = (d: number[]) => d.map((x) => '⚀⚁⚂⚃⚄⚅'[x - 1]).join(' ');
    audio.play('dig');
    if (a > b) { s.player.gold += bet; s.progress.flags.dicewins = Number(s.progress.flags.dicewins ?? 0) + 1; audio.play('coin'); this.persist(); return `Du: ${face(me)} (${a}) · Baldo: ${face(him)} (${b}) – Gewonnen! +${bet} Gold`; }
    if (a < b) { s.player.gold -= bet; this.persist(); return `Du: ${face(me)} (${a}) · Baldo: ${face(him)} (${b}) – Verloren. −${bet} Gold`; }
    return `Du: ${face(me)} (${a}) · Baldo: ${face(him)} (${b}) – Unentschieden!`;
  }

  private islandCleared(id: string) {
    const s = this.save;
    if (!s) return;
    this.addLoyalty(s.crew.party, 4);
    const def = this.world.islandDefs.find((i) => i.id === id);
    // Ruinen und Bosse hüten Schätze
    if (def && (def.kind === 'ruin' || def.kind === 'boss') && !s.progress.flags[`loot_${id}`]) {
      s.progress.flags[`loot_${id}`] = true;
      const lv = def.level ?? 5;
      const gold = Math.round((def.kind === 'boss' ? 600 : 250) * (1 + lv * 0.25) * this.goldMult(true));
      const sp = def.kind === 'boss' ? 2 : 1;
      s.player.gold += gold;
      s.skills.sp += sp;
      audio.play('treasure');
      this.after(() => this.overlay.showBanner(def.kind === 'boss' ? `${def.boss ?? 'Boss'} besiegt!` : 'Schatz der Ruine!', `+${gold.toLocaleString('de-DE')} Gold · +${sp} Faji-Punkt${sp > 1 ? 'e' : ''}`), 2600);
      if (def.kind === 'boss') this.grantXp(400 + lv * 60, 150 + lv * 25);
      if (id === 'schlundkrone') this.dropTrinket('legendaer', 0, 'tiefenauge');
      else this.dropTrinket(def.kind === 'boss' ? 'episch' : 'selten', lv * 0.01);
    }
    // Ruinen: der Faji-Kristall wartet in der Inselmitte
    if (def?.kind === 'ruin' && !s.progress.flags[`crystal_${id}`]) this.world.showCrystal(id);
    this.questEvent({ type: 'clear', island: id });
  }

  /** Geschenk der Dorfbewohner (wie in 1.0): höchstens alle 10 Minuten je Insel */
  private villageGift(id: string) {
    const s = this.save;
    if (!s) return;
    const key = `gift_${id}`;
    const last = Number(s.progress.flags[key] ?? 0);
    if (Date.now() - last < 10 * 60 * 1000) return;
    s.progress.flags[key] = Date.now();
    const def = this.world.islandDefs.find((i) => i.id === id);
    const gold = Math.round(30 + (def?.level ?? Math.max(1, Math.floor(s.player.level / 2))) * 15);
    s.player.gold += gold;
    if (s.gear.potions < POTION.max) s.gear.potions++;
    audio.play('treasure');
    this.after(() => this.overlay.showBanner('Die Dorfbewohner freuen sich', `Du bekommst ${gold} Gold und Proviant`), 700);
    this.persist();
  }

  /** Faji-Kristall erweckt (wie in 1.0): +2 Punkte und eine neue Fähigkeit, die gleich auf einen freien Platz kommt */
  private awakenCrystal(id: string) {
    const s = this.save;
    if (!s || s.progress.flags[`crystal_${id}`]) return;
    s.progress.flags[`crystal_${id}`] = true;
    s.skills.sp += 2;
    const fresh = Object.values(SK).filter((d) => d.act && d.t === 1 && !d.lv && !d.needs?.length && !(s.skills.learned[d.id] > 0));
    const pick = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : null;
    if (pick) {
      s.skills.learned[pick.id] = 1;
      const free = s.skills.slots.indexOf(null);
      if (free >= 0) s.skills.slots[free] = pick.id;
    }
    audio.play('level');
    this.overlay.showCutin('Faji-Kristall!', '#C77DFF');
    this.after(() => this.overlay.showBanner('Dein Faji erwacht', `+2 Fähigkeitspunkte${pick ? ` und die Fähigkeit „${pick.n}“` : ''}`), 900);
    this.grantXp(200, 150);
    this.world.faji?.refresh(s.player.level, this.activeStyle());
    this.applyPower();
    this.persist();
  }

  // ---------- Talismane und Erfolge ----------

  /** Talisman als Beute; ein fester (id) oder zufällig ab einer Seltenheit */
  private dropTrinket(min: Rarity, luck = 0, id?: string, exact = false): boolean {
    const s = this.save;
    if (!s) return false;
    const t = id ? TRINKET_BY_ID[id] : rollTrinket(min, luck, s.gear.trinkets, exact);
    if (!t || s.gear.trinkets.includes(t.id)) return false;
    s.gear.trinkets.push(t.id);
    if (!s.gear.trinket) s.gear.trinket = t.id;
    const r = RARITY[t.rarity];
    audio.play('shard');
    this.after(() => this.overlay.showBanner(`${r.mark} ${t.n}`, `Talisman gefunden (${r.n}) · ${t.d}`), 1200);
    this.applyPower();
    this.persist();
    return true;
  }

  /**
   * Beute-Säule aufgehoben: Talisman (genau in der Seltenheit der Säule), Gold oder Proviant. Gibt es keinen neuen
   * Talisman dieser Seltenheit mehr, wird daraus Gold – nichts geht verloren.
   */
  private onLootPickup(d: LootDrop) {
    const s = this.save;
    if (!s) return;
    const r = RARITY[d.rarity];
    const pp = this.world.playerPos;
    const h = this.world.ground.height(pp.x, pp.z);
    const above = () => new Vector3(pp.x, (Number.isFinite(h) ? h : 0) + 2.4, pp.z);
    const gold = () => {
      const g = Math.round(d.value * this.goldMult(true));
      s.player.gold += g;
      this.overlay.number(above(), `${r.mark} +${g} Gold`, 'gold');
    };
    // Seltene Funde: Karte und Fanfare (selten ◆, episch ★, legendär ♛)
    const tier = RARITIES.indexOf(d.rarity);
    if (tier >= 1) this.overlay.lootCard(`${r.mark} ${r.n}er Fund`, d.kind === 'trinket' ? 'Talisman' : d.kind === 'proviant' ? 'Proviant' : `${Math.round(d.value * this.goldMult(true))} Gold`, r.col, tier);
    if (d.kind === 'trinket') { if (!this.dropTrinket(d.rarity, 0, undefined, true)) gold(); return; }
    if (d.kind === 'proviant') {
      // ab selten oft ein besonderes Gut (Festmahl, Stärkung, Essenz) statt schlichtem Proviant
      const pool = tier >= 1 ? CONSUMABLES.filter((c) => c.rarity === d.rarity) : [];
      const def = pool.length ? pool[Math.floor(Math.random() * pool.length)] : CONSUMABLE_BY_ID.proviant;
      if (addItem(s.gear, def.id, 1)) { this.overlay.number(above(), `${r.mark} +1 ${def.n}`, 'heal'); return; }
    }
    gold();
  }

  equipTrinket(id: string | null) {
    const s = this.save;
    if (!s || (id && !s.gear.trinkets.includes(id))) return;
    s.gear.trinket = id;
    this.applyPower();
    this.persist();
  }

  private checkAchievements() {
    const s = this.save;
    if (!s) return;
    for (const a of ACHIEVEMENTS) {
      const k = `ach_${a.id}`;
      if (s.progress.flags[k] || !a.check(s)) continue;
      s.progress.flags[k] = true;
      s.player.gold += a.gold;
      if (a.fame) s.player.fame += a.fame;
      audio.play('shard', 0.8);
      this.hud.toast(`🏆 Erfolg: ${a.n}${a.gold ? ` · +${a.gold} Gold` : ''}`, 4);
      return; // einer pro Prüfung, damit sie nicht übereinander erscheinen
    }
  }

  // ---------- Legenden ----------

  /** Legenden kreuzen in ihren Heimatgewässern (ab Kapitel 1 abgeschlossen) */
  private updateLegends() {
    const s = this.save;
    const nav = this.world.naval;
    // Geisterschiffe: nachts im Nebelarchipel
    if (s && nav) {
      const night = this.world.env.time < 5 || this.world.env.time > 21;
      const ghosts = nav.enemies.filter((e) => e.ghost && e.ship.alive).length;
      if (!night && ghosts) nav.clearGhosts();
      else if (night && this.region.id === 'nebel' && this.world.mode === 'sail' && ghosts < 2 && Math.random() < 0.03) {
        if (nav.spawnGhost(this.world.playerPos.x, this.world.playerPos.z, Math.max(5, s.player.level))) {
          audio.play('roar', 0.5);
          this.overlay.showBanner('Ein Geisterschiff!', 'Aus dem Nebel gleitet ein Schiff ohne Crew …');
        }
      }
    }
    if (s) this.world.bossWanted = !s.progress.flags.tiefenschlund && s.progress.quests.some((p) => QUEST_BY_ID[p.id]?.steps[p.step]?.type === 'slay');
    if (!s || !nav || this.world.mode !== 'sail' || !s.progress.done.includes('k1')) return;
    const pos = this.world.playerPos;
    const t = s.meta.playTime;
    // Immer nur eine Legende zugleich, mit Pause dazwischen, nie direkt vor der Hafenstadt
    if (nav.enemies.some((e) => e.legendId && e.ship.alive) || (this.legendCd.get('*') ?? 0) > t) return;
    const town = this.world.islandDefs.find((i) => i.kind === 'town');
    if (town && Math.hypot(town.x - pos.x, town.z - pos.z) < town.r + 160) return;
    for (const l of hostileLegends(s.player.faction)) {
      const beaten = s.legends.includes(l.id);
      const revenge = beaten && !s.progress.flags[`rev_${l.id}`] && t - Number(s.progress.flags[`beat_${l.id}`] ?? 0) > 900;
      if (beaten && !revenge) continue;
      if ((this.legendCd.get(l.id) ?? 0) > t) continue;
      if (nav.enemies.some((e) => e.legendId === l.id)) continue;
      const home = this.world.islandDefs.find((i) => i.id === l.home);
      if (!home || Math.hypot(home.x - pos.x, home.z - pos.z) > home.r + 260) continue;
      const a = Math.atan2(pos.z - home.z, pos.x - home.x) + (Math.random() - 0.5);
      const e = nav.spawnLegend(l, home.x + Math.cos(a) * (home.r + 70), home.z + Math.sin(a) * (home.r + 70), revenge ? 4 : 0);
      if (!e) continue;
      this.legendCd.set(l.id, t + 600);
      this.legendCd.set('*', t + 180);
      audio.play('horn');
      this.after(() => audio.play('roar', 0.6), 900);
      this.overlay.showCutin(revenge ? `Revanche: ${l.n}!` : `${l.n} taucht auf!`, l.col);
      this.overlay.showBanner(revenge ? 'Die Legende will Rache!' : 'Legende gesichtet!', `${l.n}, ${l.t} (Stufe ${l.lvl + (revenge ? 4 : 0)})`);
      this.after(() => this.hud.toast(`${l.n}: „${l.hello}“`, 5), 2500);
      return;
    }
  }

  private defeatLegend(id: string, boarded: boolean) {
    const s = this.save;
    const l = LEGEND_BY_ID[id];
    if (!s || !l) return;
    audio.play('win');
    if (s.legends.includes(id)) {
      // Revanche gewonnen
      s.progress.flags[`rev_${id}`] = true;
      const g = Math.round(l.ruhm * 0.3 * this.goldMult(true));
      s.player.gold += g;
      this.grantXp(200 + l.lvl * 30, Math.round(l.ruhm * 0.1));
      this.overlay.showBanner(`Revanche gewonnen!`, `${l.n} gibt sich geschlagen · +${g} Gold`);
      this.dropTrinket('selten', 0.2);
    } else {
      s.legends.push(id);
      s.progress.flags[`beat_${id}`] = s.meta.playTime;
      const g = Math.round(l.ruhm * (boarded ? 0.9 : 0.6) * this.goldMult(true));
      s.player.gold += g;
      s.skills.sp++;
      this.dropTrinket('episch', 0.1);
      this.after(() => this.overlay.showCutin('Legende besiegt!', '#FFD166'), 400);
      this.overlay.showBanner(`${l.n} ist besiegt!`, `+${g.toLocaleString('de-DE')} Gold und ein Faji-Punkt – du steigst in der Rangliste auf`);
      this.grantXp(300 + l.lvl * 40, Math.round(l.ruhm * 0.5));
    }
    this.after(() => this.hud.toast(`${l.n}: „${l.bye}“`, 5), 3000);
    this.persist();
  }

  /** Rangliste für das Menü */
  rankList() {
    const s = this.save;
    if (!s) return [];
    return rankRows(s.player.faction, s.legends, { name: s.player.name, title: rankName(s.player.faction, s.player.fame), lvl: s.player.level, ruhm: s.player.fame }, s.meta.playTime);
  }

  // ---------- Crew ----------

  hireCrew(id: string): string {
    const s = this.save;
    const def = CREW_BY_ID[id];
    if (!s || !def || s.crew.hired.includes(id)) return '';
    if (rankIndex(s.player.fame) < def.rank) return `Rang „${rankName(s.player.faction, FAME_THRESHOLDS[def.rank])}“ nötig.`;
    if (s.player.gold < def.price) return `Dafür fehlen ${def.price - s.player.gold} Gold.`;
    s.player.gold -= def.price;
    s.crew.hired.push(id);
    s.crew.loyalty[id] = 10;
    if (!def.cat && s.crew.party.length < 3) s.crew.party.push(id);
    if (id === 'lehrer') s.skills.sp++;
    audio.play('bell');
    this.overlay.showBanner(`${def.name} heuert an!`, def.perk);
    this.applyPower();
    this.persist();
    return `„${def.quote}“`;
  }

  /** Landtrupp umstellen (höchstens 3) */
  toggleParty(id: string): string {
    const s = this.save;
    if (!s || !s.crew.hired.includes(id) || CREW_BY_ID[id]?.cat) return '';
    const p = s.crew.party;
    const i = p.indexOf(id);
    if (i >= 0) p.splice(i, 1);
    else if (p.length >= 3) return 'Der Landtrupp ist voll (höchstens 3).';
    else p.push(id);
    this.applyPower();
    this.persist();
    return '';
  }

  /** Gespräch mit einem Crewmitglied (persönlicher Auftrag) */
  talkCrew(id: string): QuestDef[] {
    if (!this.quests) return [];
    this.justDone = [];
    this.questEvent({ type: 'talk', npc: id });
    const done = this.justDone;
    this.justDone = null;
    return done;
  }

  private addLoyalty(ids: string[], n: number) {
    const s = this.save;
    if (!s) return;
    for (const id of ids) {
      const before = s.crew.loyalty[id] ?? 0;
      const after = Math.min(100, before + n);
      s.crew.loyalty[id] = after;
      if (before < 100 && after >= 100) this.hud.toast(`${CREW_BY_ID[id]?.name ?? id} ist dir jetzt treu ergeben! (+30 % Kampfkraft)`, 4);
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
    if (CREW_BY_ID[q.giver]) this.addLoyalty([q.giver], 40);
    s.player.gold += q.reward.gold;
    if (q.reward.sp) s.skills.sp += q.reward.sp;
    if (this.justDone) this.justDone.push(q);
    else this.hud.toast(`Auftrag erfüllt: ${q.title}`, 3.5);
    // Hauptgeschichte: nächstes Kapitel startet von selbst
    this.after(() => this.startAutoChapters(q), 3200);
    if (q.id === 'k5') this.after(() => this.storyAwakening(), 2400);
    if (q.id === 'k7') { s.progress.flags.krone = true; this.after(() => this.ending(), 3500); }
    audio.play('quest');
    this.overlay.showBanner(q.main ? 'Kapitel abgeschlossen!' : 'Auftrag erfüllt!', q.title);
    this.grantXp(q.reward.xp, q.reward.fame);
  }

  /** Kapitel, die nach einem Auftrag (oder beim Laden) von selbst beginnen */
  private startAutoChapters(after?: QuestDef) {
    const s = this.save;
    const qs = this.quests;
    if (!s || !qs) return;
    for (const n of QUESTS) {
      if (!n.auto || !n.after || (after && n.after !== after.id)) continue;
      if (!s.progress.done.includes(n.after) || qs.isActive(n.id) || qs.isDone(n.id)) continue;
      qs.accept(n.id);
      this.refreshDigs();
      this.persist();
      if (this.state.is('play')) {
        audio.play('horn');
        this.state.set('pause');
        this.menus.showStory(n.title, qs.introOf(n), () => this.resume());
      }
    }
  }

  /** Faji-Erwachen als Story-Moment (Kapitel 5) */
  private storyAwakening() {
    const s = this.save;
    if (!s) return;
    const branch = (Object.keys(BRANCHES) as Branch[]).filter((b) => !s.skills.awakened.includes(b)).sort((a, b) => branchPoints(s.skills.learned, b) - branchPoints(s.skills.learned, a))[0];
    if (branch) this.checkAwakening(branch);
  }

  /** Abspann nach Kapitel 7 */
  private ending() {
    const s = this.save;
    if (!s) return;
    audio.play('win');
    this.hud.setPlayer(s.player.name, `${FACTION_LABELS[s.player.faction]} · ${rankName(s.player.faction, s.player.fame)} · Stufe ${s.player.level} · 👑`);
    const text = s.player.faction === 'pirat'
      ? `Die Meere flüstern deinen Namen: ${s.player.name}, Trägerin oder Träger der Sturmkrone. Kein Admiral, keine Legende kann dir noch Befehle geben. Deine Crew feiert drei Tage lang in Ankerglück – Pippo hat schon zwölf Lieder über dich geschrieben. Doch am Horizont ziehen neue Stürme auf … und mit der Krone kannst du sie rufen. Die See gehört dir. Segle, wohin du willst.`
      : `Die Admiralität verneigt sich vor dir, ${s.player.name}. Mit der Sturmkrone in sicheren Händen kehrt Frieden in die fünf Meere ein – zumindest fast. Die letzten Piratenlegenden haben geschworen, sie dir abzunehmen. Sollen sie kommen. Deine Crew steht hinter dir, die Flotte folgt deinem Signal. Die See ist frei. Segle, wohin du willst.`;
    this.state.set('pause');
    this.menus.showStory('Die Sturmkrone gehört dir', text, () => { this.resume(); this.overlay.showBanner('Ende der Hauptgeschichte', 'Die Welt bleibt offen: Legenden, Revanchen, Schätze und Crew-Aufträge warten.'); });
    this.persist();
  }

  /** Grabstellen: Schatz-Aufträge und gefundene Schatzkarten */
  private refreshDigs() {
    if (!this.save || !this.quests) return;
    this.world.setDigs([...this.quests.treasureIslands(), ...this.save.progress.maps]);
  }

  /** Gespräch zu Fuß: Anime-Dialogfenster mit Schreibmaschinentext und Antworten */
  private talkTo(npc: TownNpcDef) {
    const qs = this.quests;
    const save = this.save;
    if (!qs || !save || !this.state.is('play')) return;
    this.justDone = [];
    // Stadtbewohner: wer hier spricht, ist in Ankerglück angekommen; Dorfbewohner melden nur das Gespräch
    if (TOWN_NPCS.some((n) => n.id === npc.id)) this.questEvent({ type: 'enter', island: 'ankerglueck' });
    this.questEvent({ type: 'talk', npc: npc.id });
    const done = this.justDone;
    this.justDone = null;
    this.state.set('pause');
    this.dialogNpc = npc;
    this.dialogSession = new DialogSession({
      npc, done,
      offers: () => qs.available(npc.id),
      running: () => save.progress.quests.map((p) => QUEST_BY_ID[p.id]).filter((q) => q && q.giver === npc.id).map((q) => ({ q, step: qs.step(q.id)?.text ?? '' })),
      introOf: (q) => qs.introOf(q),
      rewardText: (q) => [`${q.reward.gold} Gold`, `${q.reward.xp} EP`, `${q.reward.fame} Ruhm`, q.reward.sp ? `${q.reward.sp} Faji-Punkt${q.reward.sp > 1 ? 'e' : ''}` : ''].filter(Boolean).join(' · '),
      accept: (id) => this.acceptQuest(id),
    });
    this.dialogUi.show(this.dialogSession.start(), (id) => this.dialogChoose(id), () => this.endDialog());
  }

  private dialogChoose(id: string) {
    const s = this.dialogSession, npc = this.dialogNpc;
    if (!s || !npc) return;
    const r = s.choose(id);
    if ('end' in r) { this.endDialog(); return; }
    if ('shop' in r) {
      this.dialogUi.hide();
      this.menus.dialogExit = () => this.endDialog();
      // aus dem Laden zurück ins Gespräch
      this.menus.openShop(npc, () => { this.menus.hide(); this.dialogUi.show(s.menu(), (c) => this.dialogChoose(c), () => this.endDialog()); });
      return;
    }
    this.dialogUi.set(r.view);
  }

  private endDialog() {
    this.dialogUi.hide();
    this.dialogSession = null;
    this.dialogNpc = null;
    this.menus.hide();
    this.resume();
  }

  // ---------- Inventar ----------

  private closeInventory() {
    this.inventoryUi?.dispose();
    this.inventoryUi = null;
    this.stage = null;
    this.useWorldView();
    this.renderer.resize();
    this.state.set('play');
    this.input.flush();
    this.loop.resetClock();
  }

  /** Inventar (Taste I): Figur im 3D-Fenster, Ausrüstung, Werte, Raster und Schnellleiste */
  openInventory() {
    const s = this.save;
    if (!s || !this.assets || !this.state.is('play') || this.inventoryUi) return;
    this.menus.hide();
    ensureGear(s.gear);
    const stage = new SkillStage();
    this.stage = stage;
    const style = () => this.activeStyle();
    stage.show(this.assets, this.displayLook(), style());
    this.renderer.setView(stage.scene, stage.camera);
    this.renderer.setEffectSources(null, stage.focus);
    this.state.set('editor');
    const g = s.gear;
    const wl = () => WEAPON_LINES[s.player.style];
    const rar = (r: keyof typeof RARITY) => RARITY[r].col;
    const items = (): InvItem[] => {
      const out: InvItem[] = [];
      HEADS.forEach((h) => { if (g.heads!.includes(h.id)) out.push({ key: `head:${h.id}`, cat: 'head', name: h.n, icon: '🎩', color: rar(h.rarity), desc: h.d, stat: '', equipped: g.head === h.id }); });
      ARMOR.forEach((a, i) => { if (i <= g.armor) out.push({ key: `armor:${i}`, cat: 'armor', name: a.n, icon: ['👕', '🦺', '⛓', '🛡', '✨'][i] ?? '🛡', color: '#8AA0B8', desc: `Rüstungsstufe ${i + 1}`, stat: `+${a.hp} Leben`, equipped: armorEq(g) === i }); });
      WEAPONS.forEach((w, i) => { if (i <= g.weapon) out.push({ key: `weapon:${i}`, cat: 'weapon', name: wl().names[i] ?? w.n, icon: s.player.style === 'faust' ? '🥊' : s.player.style === 'effekt' ? '🔮' : '🗡', color: w.col, desc: `Waffenstufe ${i + 1}`, stat: wl().stat(w, i), equipped: weaponEq(g) === i }); });
      g.trinkets.forEach((id) => { const t = TRINKET_BY_ID[id]; if (t) out.push({ key: `trinket:${id}`, cat: 'trinket', name: t.n, icon: '📿', color: rar(t.rarity), desc: `${RARITY[t.rarity].n}er Talisman`, stat: t.d, equipped: g.trinket === id }); });
      bagConsumables(g).forEach(({ def, n }) => out.push({ key: `cons:${def.id}`, cat: 'cons', name: def.n, icon: def.icon, color: def.color, desc: def.d, stat: `Abklingzeit ${def.cd} s`, equipped: false, count: n, cid: def.id }));
      return out;
    };
    const overrideFor = (key: string): Partial<typeof g> | null => {
      const [kind, id] = key.split(':');
      if (kind === 'head') return { head: id };
      if (kind === 'armor') return { armorEq: +id };
      if (kind === 'weapon') return { weaponEq: +id };
      if (kind === 'trinket') return { trinket: id };
      return null;
    };
    const refreshLook = () => { this.world.updatePlayer(this.displayLook(), style()); stage.show(this.assets!, this.displayLook(), style()); };
    const apply = () => { this.applyPower(); this.persist(); refreshLook(); this.inventoryUi?.refresh(); };
    const host: InventoryHost = {
      items,
      equipped: () => {
        const h = headEq(g), wi = weaponEq(g), ai = armorEq(g), t = g.trinket ? TRINKET_BY_ID[g.trinket] : null;
        const none = null;
        return {
          head: h ? { name: h.n, icon: '🎩', color: rar(h.rarity) } : none,
          armor: { name: ARMOR[ai].n, icon: ['👕', '🦺', '⛓', '🛡', '✨'][ai] ?? '🛡', color: '#8AA0B8' },
          weapon: { name: wl().names[wi] ?? WEAPONS[wi].n, icon: s.player.style === 'faust' ? '🥊' : s.player.style === 'effekt' ? '🔮' : '🗡', color: WEAPONS[wi].col },
          trinket: t ? { name: t.n, icon: '📿', color: rar(t.rarity) } : none,
        };
      },
      stats: (key) => {
        const cur = this.playerStats();
        const ov = key ? overrideFor(key) : null;
        return { cur, next: ov ? this.playerStats(ov) : null };
      },
      bar: () => (g.bar ?? []).map((id) => { const d = id ? CONSUMABLE_BY_ID[id] : null; return d ? { name: d.n, icon: d.icon, color: d.color, count: itemCount(g, d.id) } : null; }),
      gold: () => s.player.gold,
      equip: (key) => {
        const [kind, id] = key.split(':');
        if (kind === 'head') g.head = id;
        else if (kind === 'armor') g.armorEq = +id;
        else if (kind === 'weapon') g.weaponEq = +id;
        else if (kind === 'trinket') g.trinket = id;
        else return;
        audio.play('switch');
        apply();
      },
      unequip: (slot: SlotId) => {
        if (slot === 'head') g.head = null;
        else if (slot === 'trinket') g.trinket = null;
        else return;
        audio.play('switch');
        apply();
      },
      use: (cid) => { this.useItem(cid); this.inventoryUi?.refresh(); },
      setBar: (slot, cid) => {
        const bar = g.bar!;
        if (cid) for (let i = 0; i < bar.length; i++) if (bar[i] === cid) bar[i] = null;
        bar[slot] = cid;
        this.persist();
      },
      close: () => this.closeInventory(),
    };
    this.inventoryUi = new InventoryScreen(this.uiRoot, host);
  }

  /** Auftragsbuch (Taste L) */
  openQuestLog() {
    const s = this.save, qs = this.quests;
    if (!s || !qs || !this.state.is('play') || this.questLog) return;
    this.state.set('pause');
    const close = () => {
      this.questLog?.dispose();
      this.questLog = null;
      this.resume();
    };
    this.questLog = new QuestLog(this.uiRoot, {
      qs, progress: s.progress,
      giverName: (id) => TOWN_NPCS.find((n) => n.id === id)?.name ?? VILLAGE_NPC_BY_ID[id]?.name ?? CREW_BY_ID[id]?.name ?? id,
      onTrack: (id) => { qs.setTracked(id); this.persist(); this.hud.toast('Auftrag wird verfolgt.', 1.6); },
      onClose: close,
    });
  }

  /** Schwebende Zeichen (!/?) und die Aufforderung „E · Sprechen“ über Gesprächspartnern in der Nähe */
  private updateNpcMarkers() {
    const qs = this.quests, save = this.save;
    const foot = this.state.is('play') && this.world.mode === 'foot' && !this.dialogUi.isOpen && !!qs && !!save;
    if (!foot) { this.markers.update([], null, ''); return; }
    const pos = this.world.playerPos;
    const list = this.world.talkables(pos.x, pos.z, 30);
    const key = this.input.keyLabel(this.input.getKeyBindings().talk[0] ?? 'KeyE');
    const marks: NpcMark[] = list.map(({ npc, dist }, i) => {
      const d = npc.townDef!;
      const mark = qs!.available(d.id).length ? '!' : save!.progress.quests.some((p) => { const st = qs!.step(p.id); return st?.type === 'talk' && st.npc === d.id; }) ? '?' : '';
      const p = this.markPos.get(d.id) ?? new Vector3();
      this.markPos.set(d.id, p);
      p.copy(npc.char.holder.position).y += 2.5;
      return { id: d.id, name: d.name, pos: p, mark, near: i === 0 && dist < 3.2 };
    });
    this.markers.update(marks, this.world.camera, key);
  }

  /** Gespräch aus dem Hafenmenü (Spiel ist schon pausiert) */
  talkInHarbor(npc: TownNpcDef) {
    if (!this.quests) return;
    this.justDone = [];
    // wer im Hafen mit den Leuten spricht, ist in Ankerglück angekommen
    this.questEvent({ type: 'enter', island: 'ankerglueck' });
    this.questEvent({ type: 'talk', npc: npc.id });
    const done = this.justDone;
    this.justDone = null;
    this.menus.showDialog(npc, done);
  }

  private openHarbor(def: IslandDef) {
    if (!this.state.is('play')) return;
    audio.play('bell');
    this.state.set('pause');
    this.menus.showHarbor('', def);
  }

  /** Region betreten: Banner beim ersten Mal, vorherrschendes Wetter, Musik */
  region: RegionDef = BERNSTEINSEE;
  private enterRegion(r: RegionDef) {
    const s = this.save;
    this.region = r;
    const env = this.world.env;
    if (r.weather) { env.weather.auto = false; env.weather.setWeather(r.weather, false); }
    else if (!env.weather.auto) { env.weather.auto = true; env.weather.setWeather('klar', false); }
    if (!s || !this.state.is('play')) return;
    const key = `region_${r.id}`;
    if (!s.progress.flags[key]) {
      s.progress.flags[key] = true;
      if (r.id !== 'bernsteinsee') {
        audio.play('horn');
        this.overlay.showBanner(r.name, `${r.desc ?? ''}${r.level && r.level > s.player.level + 2 ? ` · Empfohlen ab Stufe ${r.level}` : ''}`);
      }
    } else this.hud.toast(r.name, 2.5);
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
    // nicht erweckter Kristall einer befreiten Ruine wartet weiter
    if (def.kind === 'ruin' && s.progress.flags[`loot_${def.id}`] && !s.progress.flags[`crystal_${def.id}`]) this.world.showCrystal(def.id);
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
      const gold = Math.round((120 + Math.random() * 180) * (1 + s.player.level * 0.08) * this.goldMult(true));
      s.player.gold += gold;
      const shard = Math.random() < 0.35;
      if (shard) s.skills.sp++;
      audio.play('treasure');
      this.overlay.showBanner('Schatz gefunden!', `${gold} Gold${shard ? ' und ein Faji-Splitter (+1 Faji-Punkt)' : ''}`);
      this.grantXp(40, 10);
      if (Math.random() < 0.25) this.dropTrinket('gewoehnlich', 0.1);
    } else this.hud.toast('Gefunden!', 2);
    this.questEvent({ type: 'treasure', island });
    this.refreshDigs();
    this.persist();
  }

  private usePotion() { this.useItem('proviant'); }

  /** Gut aus der Schnellleiste oder dem Inventar benutzen: heilt, stärkt oder füllt Faji auf */
  useItem(id: string | null): boolean {
    const s = this.save;
    const def = id ? CONSUMABLE_BY_ID[id] : null;
    if (!s || !def) return false;
    const hp = this.world.playerHp;
    if (this.world.mode !== 'foot') { this.hud.toast(`${def.n}: nur an Land.`); return false; }
    if (itemCount(s.gear, def.id) <= 0) { this.hud.toast(`Kein ${def.n} mehr${def.id === 'proviant' ? ' – Mara verkauft welchen am Markt.' : '.'}`, 3); return false; }
    if ((this.itemCd.get(def.id) ?? 0) > 0 || this.globalCd > 0) return false;
    if (def.heal && !def.buff && !def.faji && hp && hp.hp >= hp.max) { this.hud.toast('Du bist satt und gesund.'); return false; }
    const fj = this.world.faji;
    if (def.faji && !def.heal && fj && fj.faji >= fj.maxFaji - 0.5) { this.hud.toast('Dein Faji ist voll.'); return false; }
    takeItem(s.gear, def.id);
    this.itemCd.set(def.id, def.cd);
    this.globalCd = GLOBAL_ITEM_CD;
    let msg = def.n;
    if (def.heal) {
      const heal = def.heal * (def.id === 'proviant' ? (s.crew.hired.includes('cook') ? 2 : 1) * (s.crew.hired.includes('arzt') ? 1.4 : 1) : 1);
      this.world.healFrac(heal);
      msg = `+${Math.round(Math.min(1, heal) * 100)} % Leben`;
      audio.play('eat');
    }
    if (def.faji && fj) { fj.faji = Math.min(fj.maxFaji, fj.faji + fj.maxFaji * def.faji); msg = `+${Math.round(def.faji * 100)} % Faji`; audio.play('shard'); }
    if (def.buff) {
      this.buffs = this.buffs.filter((b) => b.id !== def.id);
      this.buffs.push({ id: def.id, t: def.buff.dur });
      this.applyPower();
      msg = `${def.n} wirkt ${def.buff.dur} s`;
      audio.play('level', 0.5);
    }
    this.hud.toast(`${def.icon} ${msg} · noch ${itemCount(s.gear, def.id)}`);
    this.inventoryUi?.refresh();
    return true;
  }

  /** Stärkungen und Abklingzeiten ticken lassen (Logikschritt) */
  private tickItems(dt: number) {
    this.globalCd = Math.max(0, this.globalCd - dt);
    for (const [k, v] of this.itemCd) { if (v - dt <= 0) this.itemCd.delete(k); else this.itemCd.set(k, v - dt); }
    if (!this.buffs.length) return;
    let ended = false;
    for (const b of this.buffs) b.t -= dt;
    const before = this.buffs.length;
    this.buffs = this.buffs.filter((b) => b.t > 0);
    if (this.buffs.length !== before) ended = true;
    if (ended) { this.applyPower(); this.hud.toast('Eine Stärkung ist abgeklungen.', 2); }
  }

  /** Schnellleiste für die Anzeige: Gut, Menge, Abklingzeit (Anteil, 1 = gerade benutzt) und Stärkung läuft */
  private itemBarViews() {
    const g = this.save!.gear;
    return (g.bar ?? []).map((id) => {
      const def = id ? CONSUMABLE_BY_ID[id] : null;
      if (!def) return { id: null as string | null, icon: '', name: '', color: '#6a6458', count: 0, cdFrac: 0, ready: false, active: 0 };
      const own = this.itemCd.get(def.id) ?? 0;
      const buff = this.buffs.find((b) => b.id === def.id);
      const count = itemCount(g, def.id);
      return { id: def.id as string | null, icon: def.icon, name: def.n, color: def.color, count, cdFrac: Math.min(1, Math.max(own > 0 ? own / def.cd : 0, this.globalCd > 0 ? this.globalCd / GLOBAL_ITEM_CD * 0.5 : 0)), ready: count > 0 && own <= 0 && this.globalCd <= 0, active: buff && def.buff ? buff.t / def.buff.dur : 0 };
    });
  }

  // ---------- Läden ----------

  /** Verbrauchsgut kaufen (Proviant gibt es weiter über buyPotions) */
  buyItem(id: string): string {
    const s = this.save, def = CONSUMABLE_BY_ID[id];
    if (!s || !def) return '';
    if (itemCount(s.gear, id) >= def.max) return 'Deine Taschen sind voll.';
    if (s.player.gold < def.price) return 'Nicht genug Gold.';
    s.player.gold -= def.price;
    addItem(s.gear, id, 1);
    // erster Kauf: gleich in einen freien Platz der Schnellleiste legen
    const bar = s.gear.bar ?? [];
    if (!bar.includes(id)) { const free = bar.indexOf(null); if (free >= 0) bar[free] = id; }
    this.persist();
    return `${def.n} gekauft.`;
  }

  /** Kopfbedeckung kaufen und gleich aufsetzen */
  buyHead(id: string): string {
    const s = this.save, h = HEAD_BY_ID[id];
    if (!s || !h || s.gear.heads?.includes(id)) return '';
    if (rankIndex(s.player.fame) < h.rank) return `Rang „${rankName(s.player.faction, FAME_THRESHOLDS[h.rank])}“ nötig.`;
    if (s.player.gold < h.price) return `Dafür fehlen ${h.price - s.player.gold} Gold.`;
    s.player.gold -= h.price;
    (s.gear.heads ??= []).push(id);
    s.gear.head = id;
    this.world.updatePlayer(this.displayLook(), this.activeStyle());
    this.applyPower();
    this.persist();
    return `${h.n} gekauft und aufgesetzt.`;
  }

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
    if (kind === 'weapon') delete s.gear.weaponEq; else { delete s.gear.armorEq; this.world.updatePlayer(this.displayLook(), this.activeStyle()); }
    this.applyPower();
    this.world.healPlayer();
    this.persist();
    const name = kind === 'weapon' ? WEAPON_LINES[s.player.style].names[i] ?? item.n : item.n;
    return `${name} gekauft${cost < item.price ? ` (${cost} Gold nach Inzahlungnahme)` : ''}!`;
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
    return 'Du schläfst tief und fest. Ein neuer Morgen bricht an – Leben voll aufgefüllt.';
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
      case 'talk': return this.world.npcPos(t.step.npc) ?? (CREW_BY_ID[t.step.npc] ? { x: this.world.ship.x, z: this.world.ship.z } : isl(Object.keys(VILLAGE_NPCS).find((k) => VILLAGE_NPCS[k].some((n) => n.id === (t.step as { npc: string }).npc)) ?? ''));
      case 'goto': case 'clear': case 'treasure': return isl(t.step.island);
      case 'sink': case 'board': return nearest(this.world.enemyShips.filter((e) => !e.ally));
      case 'rescue': return this.world.nearestFloater('raft');
      case 'slay': return ABYSS_LAIR;
      case 'kill': return nearest(this.world.islandDefs.filter((i) => i.kind === 'camp' && Math.hypot(i.x - BERNSTEINSEE.x, i.z - BERNSTEINSEE.z) < BERNSTEINSEE.r));
    }
  }

  /** Inselformen für die Karten (Küstenlinie wie in der Welt) */
  get mapOpts(): MapOpts {
    if (!this.shapeById) {
      this.shapeById = new Map();
      this.world.islandDefs.forEach((d, i) => { const sh = this.world.islands[i]; if (sh) this.shapeById!.set(d.id, sh); });
    }
    const m = this.shapeById;
    return { shape: (id) => m.get(id) };
  }

  /** Auftragszeichen je Insel: ! = hier wartet ein Auftrag, ? = hier lässt sich einer abgeben (Stadt und Dörfer) */
  private questIslandMarks(): Map<string, 'quest' | 'turnin'> {
    const out = new Map<string, 'quest' | 'turnin'>();
    const qs = this.quests, s = this.save;
    if (!qs || !s) return out;
    const mark = (id: string) => qs.available(id).length ? 'quest' as const : s.progress.quests.some((p) => { const st = qs.step(p.id); return st?.type === 'talk' && st.npc === id; }) ? 'turnin' as const : null;
    const put = (island: string, ids: string[]) => {
      const marks = ids.map(mark);
      const m = marks.includes('turnin') ? 'turnin' : marks.includes('quest') ? 'quest' : null;
      if (m) out.set(island, m);
    };
    put('ankerglueck', TOWN_NPCS.map((n) => n.id));
    for (const [island, npcs] of Object.entries(VILLAGE_NPCS)) put(island, npcs.map((n) => n.id));
    return out;
  }

  /** Orientierungspunkte für Minikarte und Kompass: Feinde (rot), Bosse (Totenkopf), Auftragspersonen (! / ?), Ziel */
  private mapPois(): Poi[] {
    const out: Poi[] = [];
    const qs = this.quests, s = this.save;
    const foot = this.world.mode === 'foot';
    if (foot) {
      for (const e of this.world.footEnemies()) out.push({ x: e.x, z: e.z, kind: e.boss ? 'boss' : 'enemy' });
      const pos = this.world.playerPos;
      if (qs && s) for (const { npc } of this.world.talkables(pos.x, pos.z, 400)) {
        const id = npc.townDef!.id;
        const k = qs.available(id).length ? 'quest' as const : s.progress.quests.some((p) => { const st = qs.step(p.id); return st?.type === 'talk' && st.npc === id; }) ? 'turnin' as const : null;
        out.push({ x: npc.x, z: npc.z, kind: k ?? 'npc', name: npc.townDef!.name });
      }
      return out;
    }
    // auf See: Boss-Inseln und Inseln mit Auftragspersonen, nur entdeckte
    const marks = this.questIslandMarks();
    for (const d of this.world.islandDefs) {
      if (!this.world.discovered.has(d.id)) continue;
      if (d.kind === 'boss') out.push({ x: d.x, z: d.z, kind: 'boss', name: d.boss ?? d.name });
      const m = marks.get(d.id);
      if (m) out.push({ x: d.x, z: d.z, kind: m, name: d.name });
    }
    return out;
  }

  mapMarkers(): MapMarkers {
    const pos = this.world.playerPos;
    const foot = this.world.mode === 'foot';
    return {
      player: pos,
      enemies: foot ? [] : this.world.enemyShips,
      target: this.questTarget(),
      digs: (this.world.life?.digs ?? []).map((d) => ({ x: d.x, z: d.z })),
      view: this.world.cameraYaw,
      range: foot ? 85 : 420,
      pois: this.mapPois(),
    };
  }

  /** Daten der Weltkarte */
  private worldMapData(): WorldMapData {
    return {
      islands: this.world.islandDefs,
      regions: REGIONS,
      known: (id) => this.world.discovered.has(id),
      islandMarks: this.questIslandMarks(),
      markers: { ...this.mapMarkers(), pois: undefined },
      shape: this.mapOpts.shape,
    };
  }

  /** Weltkarte (Taste M): ganze Welt im Vollbild, ziehen und zoomen */
  openWorldMap() {
    if (!this.save || !this.state.is('play') || this.worldMap) return;
    this.state.set('pause');
    this.menus.hide();
    const data = this.worldMapData();
    const close = () => {
      this.worldMap?.dispose();
      this.worldMap = null;
      this.resume();
    };
    this.worldMap = new WorldMapScreen(this.uiRoot, {
      data: () => data,
      close,
      logbook: () => { this.worldMap?.dispose(); this.worldMap = null; this.menus.showMap('logbuch', () => this.resume()); },
    });
  }

  /** Kompassleiste: Punkte mit Peilung (Welt) und Entfernung */
  private updateCompass() {
    const on = this.state.is('play') && !!this.save;
    this.compass.setVisible(on);
    if (!on) return;
    const pos = this.world.playerPos;
    const list: CompassPoi[] = [];
    const add = (x: number, z: number, kind: CompassPoi['kind']) => {
      const dx = x - pos.x, dz = z - pos.z;
      list.push({ bearing: Math.atan2(dx, dz), dist: Math.hypot(dx, dz), kind });
    };
    const foot = this.world.mode === 'foot';
    for (const p of this.mapPois()) if (foot ? Math.hypot(p.x - pos.x, p.z - pos.z) < (p.kind === 'enemy' ? 70 : 400) : true) add(p.x, p.z, p.kind);
    if (!foot) for (const e of this.world.enemyShips) if (!e.ally && Math.hypot(e.x - pos.x, e.z - pos.z) < 300) add(e.x, e.z, e.legend ? 'boss' : 'enemy');
    const t = this.questTarget();
    if (t) add(t.x, t.z, 'target');
    this.compass.update(this.world.cameraYaw, list);
  }

  private updateQuestHud(frameDt: number) {
    const s = this.save;
    if (!s) return;
    this.hud.setPotions(s.gear.potions);
    const t = this.quests?.tracked();
    // Übungsschiff wie in 1.0, sobald eine frühe Aufgabe Versenken oder Entern verlangt
    if (t && (t.q.id === 'k1' || t.q.id === 'k2') && (t.step.type === 'sink' || t.step.type === 'board')) this.world.ensureTraining(t.step.type === 'board');
    const bt = t ? this.questTarget() : null;
    const bdef = bt && t && 'island' in t.step ? this.world.islandDefs.find((i) => i.id === (t.step as { island: string }).island) : null;
    this.world.setBeacon(bt ? { x: bt.x, z: bt.z, r: bdef?.r ?? 12 } : null);
    if (!t) this.hud.setQuest(null);
    else {
      const target = bt;
      const pos = this.world.playerPos;
      let angle: number | null = null, dist: number | null = null;
      if (target) {
        const dx = target.x - pos.x, dz = target.z - pos.z;
        dist = Math.hypot(dx, dz);
        const rel = this.world.cameraYaw - Math.atan2(dx, dz);
        angle = Math.atan2(Math.sin(rel), Math.cos(rel));
      }
      const frac = 'count' in t.step && t.step.count > 1 ? Math.min(1, t.count / t.step.count) : null;
      this.hud.setQuest({ title: t.q.title, step: stepText(t.step, t.count), angle, dist, frac, main: !!t.q.main });
    }
    // Minikarte etwa 10× pro Sekunde
    this.mapT -= frameDt;
    if (this.mapT <= 0) {
      this.mapT = 0.1;
      const c = this.hud.miniCanvas();
      if (c) drawMap(c.ctx, c.size, this.world.islandDefs.filter((i) => this.world.discovered.has(i.id)), this.mapMarkers(), 'mini', this.mapOpts);
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
      this.world.faji?.refresh(p.level, this.activeStyle());
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
    this.after(() => this.overlay.showCutin('Faji-Erwachen!', info.col), 600);
    this.after(() => this.overlay.showBanner(`${info.n} erwacht!`, '+2 Faji-Punkte · neue Meisterfähigkeit freigeschaltet'), 2200);
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
    // Wechsel zwischen eigenen Schiffen repariert nicht umsonst: der Zustand bleibt, nur ein neu gekauftes Schiff ist heil
    let hull = Math.max(0.05, this.world.ship.hull / Math.max(1, this.world.ship.maxHull));
    if (!s.ship.owned.includes(tier)) {
      if (rankIndex(s.player.fame) < cls.rank) return `Rang „${rankName(s.player.faction, FAME_THRESHOLDS[cls.rank])}“ nötig.`;
      if (s.player.gold < cls.price) return `Dafür fehlen ${cls.price - s.player.gold} Gold.`;
      s.player.gold -= cls.price;
      s.ship.owned.push(tier);
      hull = 1;
    }
    s.ship.hull = hull;
    s.ship.tier = tier;
    this.world.setShip(tier, s.ship.look, s.ship.ammo, s.ship.hull, s.player.faction);
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

  upgradeCost(k: 'can' | 'hull' | 'sail') {
    const s = this.save;
    if (!s) return 0;
    return Math.round((s.ship.up[k] + 1) * 350 * (1 + s.ship.tier * 0.4));
  }

  shipUpgrade(k: 'can' | 'hull' | 'sail'): string {
    const s = this.save;
    if (!s || s.ship.up[k] >= 5) return '';
    const cost = this.upgradeCost(k);
    if (s.player.gold < cost) return `Dafür fehlen ${cost - s.player.gold} Gold.`;
    s.player.gold -= cost;
    s.ship.up[k]++;
    audio.play('crack');
    this.applyPower();
    this.persist();
    return 'Ausgebaut!';
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

  /** Testwerkzeug: Gold geben (Welt-Werkstatt, unbegrenzt oft); liefert den neuen Stand */
  testGold(n: number) {
    const s = this.save;
    if (!s) return 0;
    s.player.gold += n;
    audio.play('coin');
    this.persist();
    return s.player.gold;
  }

  /** Testwerkzeug: Punkte und Stufen geben */
  testGrant(sp: number, levels: number) {
    const s = this.save;
    if (!s) return;
    s.skills.sp += sp + levels;
    s.player.level += levels;
    this.applyPower();
    this.world.faji?.refresh(s.player.level, this.activeStyle());
    this.hud.setPlayer(s.player.name, `${FACTION_LABELS[s.player.faction]} · ${rankName(s.player.faction, s.player.fame)} · Stufe ${s.player.level}`);
    this.persist();
  }

  // ---------- Waffenplätze ----------

  /** Standard der zweiten Waffe: wer mit der Faust kämpft, trägt Säbel, alle anderen die Faust */
  private weaponSlots(d: SaveData | null = this.save): [StyleId, StyleId] {
    const p = d!.player;
    const first = styleIdOf(p.style, p.blade);
    let alt = (p.alt as StyleId | undefined) ?? (first === 'faust' ? 'saebel' : 'faust');
    if (alt === first) alt = first === 'faust' ? 'saebel' : 'faust';
    return [first, alt];
  }

  /** Waffe des aktiven Platzes */
  private activeStyle(d: SaveData | null = this.save): StyleId {
    return this.weaponSlots(d)[d!.player.slot === 1 ? 1 : 0];
  }

  private refreshWeaponHud() {
    const s = this.save;
    if (!s) return;
    const [a, b] = this.weaponSlots();
    this.hud.setWeapons(STYLE_ANIMS[a].label, STYLE_ANIMS[b].label, s.player.slot === 1 ? 1 : 0);
  }

  /** Waffe wechseln (Q: der jeweils andere Platz; Z/X: Platz 1 bzw. 2). Nur zu Fuß und im Spiel. */
  swapWeapon(to?: 0 | 1) {
    const s = this.save;
    if (!s || !this.state.is('play') || this.world.mode !== 'foot') return;
    const cur = s.player.slot === 1 ? 1 : 0;
    const next: 0 | 1 = to ?? (cur ? 0 : 1);
    if (next === cur) return;
    const style = this.weaponSlots()[next];
    if (!this.world.swapWeapon(style)) return;
    s.player.slot = next;
    s.player.alt = this.weaponSlots()[1];
    this.world.faji?.refresh(s.player.level, style);
    this.applyPower();
    audio.play('whoosh', 0.9);
    this.refreshWeaponHud();
    this.persist();
  }

  private skillTree: SkillTree | null = null;

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
    const tree: SkillTree = this.skillTree = new SkillTree(this.uiRoot, {
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
        this.world.faji?.refresh(s.player.level, this.activeStyle());
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
        this.skillTree = null;
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
      anime: !!this.assets.vroid,
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
      this.save.player.slot = 0;
      this.save.player.alt = undefined;
      this.refreshWeaponHud();
      this.world.updatePlayer(this.displayLook(), styleIdOf(r.style, r.blade));
      // Kampfstil gewechselt: Kombos, Stilboni und Waffenname passen sich an
      this.world.faji?.refresh(this.save.player.level, styleIdOf(r.style, r.blade));
      this.applyPower();
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
    this.quests?.accept('k0');
    this.persist();
    this.hud.toast(r.faction === 'pirat' ? 'Leinen los, Schiffsjunge!' : 'Willkommen an Bord, Rekrut!', 3);
  }

  continueGame(slot: number) {
    const info = this.saves.load(slot);
    if (!info.data) return;
    this.enterPlay(slot, info.data);
    if (info.error) this.hud.toast(info.error, 4);
  }

  private enterPlay(slot: number, data: SaveData) {
    this.session++;
    this.slot = slot;
    this.save = data;
    this.world.setState({ boat: data.world.boat, env: { time: data.world.time, weather: data.world.weather as WeatherId } });
    const p = data.player;
    this.world.playerFaction = p.faction;
    ensureGear(data.gear);
    this.buffs = [];
    this.itemCd.clear();
    if (this.assets) this.world.setCharacters(this.assets, this.displayLook(data), this.activeStyle(data), this.overlay);
    this.world.setSkills(data.skills, p.level);
    this.world.setShip(data.ship.tier, data.ship.look, data.ship.ammo, data.ship.hull, p.faction);
    this.quests = new QuestSystem(data.progress, p.faction, {
      completed: (q) => this.onQuestDone(q),
      advanced: (_q, next) => this.hud.toast(`Neues Ziel: ${next.text}`, 3.5),
    });
    this.refreshDigs();
    {
      const disc = new Set<string>((data.progress.flags.disc as string[] | undefined) ?? []);
      for (const k of Object.keys(data.progress.flags)) if (k.startsWith('seen_')) disc.add(k.slice(5));
      disc.add('ankerglueck');
      this.world.discovered = disc;
    }
    this.after(() => this.startAutoChapters(), 2500);
    this.applyPower();
    this.world.healPlayer();
    this.hud.setPlayer(p.name, `${FACTION_LABELS[p.faction]} · ${rankName(p.faction, p.fame)} · Stufe ${p.level}`);
    this.refreshWeaponHud();
    this.menus.hide();
    this.input.flush();
    this.autosaveTimer = 0;
    this.autoQuality.reset();
    this.watchdog.rewarm();
    this.renderer.dynRes.rewarm();
    this.state.set('play');
    this.loop.resetClock();
    this.touch.setLayout(TOUCH_SEA);
    this.hud.hint(this.controlsHint(), 12);

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
    this.watchdog.rewarm();
    this.renderer.dynRes.rewarm();
    this.state.set('play');
    this.loop.resetClock();
  }

  quitToMenu() {
    this.session++;
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
    this.watchdog.rewarm();
  }

  private applySettings() {
    const s = this.settings.data;
    document.documentElement.style.setProperty('--text-scale', String(s.textScale));
    this.input.setKeyBindings(s.keyBindings);
    this.input.invertY = s.invertLookY;
    audio.setVolumes(s.volume);
    document.documentElement.classList.toggle('cb', s.colorblind);
    mapPalette.colorblind = s.colorblind;
    if (!s.dynamicResolution) this.renderer?.resetDynamicResolution();
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
