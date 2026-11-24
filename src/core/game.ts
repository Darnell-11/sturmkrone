import { lowerTier, QUALITY_TIERS, type QualityTier } from '../data/qualityTiers';
import { FACTION_LABELS, rankIndex, rankName } from '../data/ranks';
import { TOUCH_FOOT, TOUCH_SEA } from '../data/touchLayout';
import { randomLook, type CharacterLook } from '../data/characterParts';
import { WEATHER, type WeatherId } from '../data/world';
import { CharacterAssets } from '../entities/character/assets';
import { Character } from '../entities/character/character';
import { Vector3, type PerspectiveCamera, type ShaderMaterial } from 'three';
import { SkyProbe } from '../render/ibl';
import { preload } from './preload';
import { LoadingScreen } from '../ui/loadingScreen';
import { runSteps, tick } from './yield';
import { toonShared } from '../render/toon';
import type { Enemy } from '../entities/enemy';
import { PLAYER_BASE } from '../data/combat';
import { CombatOverlay } from '../ui/combatOverlay';
import { BRANCHES, branchPoints, learnBlock, SK, type Branch } from '../data/skills';
import { SkillTree } from '../ui/skillTree';
import { AMMO, SAIL_LEVELS, SHIP_CLASSES, type AmmoId, type ShipLook } from '../data/ships';
import { BRANCH_FIELD, EVO_MAX, applyShipPurchase, evoCost, evoEffectText, evoMaterial, evoStats, evoValue, evolutionOf, newShipEvolution, shipEvolutionTier, tierOf, tradeInRefund, type EvoBranch, type ShipEvolution } from '../data/shipEvolution';
import { classCompareRows, evoCompareRows, evoPlan, withTier, type CompareRow, type YardInfo, type YardPick } from '../data/yardPreview';
import type { YardView } from '../world/seaWorld';
import { FAME_THRESHOLDS } from '../data/ranks';
import { SkillStage } from '../world/skillStage';
import { detectWebGpu, AutoQuality, benchmarkGpu, detectTier, gatherDeviceInfo, needsBench, type DeviceInfo, type Detected } from '../render/quality';
import { GameRenderer } from '../render/renderer';
import { setTexDetail } from '../render/texDetail';
import { CharacterEditor, styleIdOf, type EditorGearHost, type EditorResult } from '../ui/editor';
import { Hud, type SeaView } from '../ui/hud';
import { HelmDial } from '../ui/helmDial';
import { SectorBanner } from '../ui/sectorBanner';
import { EdgeWarning } from '../ui/edgeWarning';
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
import { addItem, armorEq, bagConsumables, computeStats, ensureGear, headEq, itemCount, takeItem, weaponEq, wornGear, type StatSheet } from './inventory';
import { ARMOR, ARMOR_LOOK, BAR_SLOTS, CONSUMABLE_BY_ID, CONSUMABLES, GEAR, GEAR_BY_ID, GEAR_SLOTS, GLOBAL_ITEM_CD, HEADS, HEAD_BY_ID, HEAD_ICON, PROVIANT, REST_PRICE, SHRINE_PRICE, TRINKET_ICON, WEAPON_LINES, WEAPONS, type GearSlot, type SlotId } from '../data/items';
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
import { BERNSTEINSEE, REGIONS, regionAt, sectorLabel, type IslandDef, type RegionDef } from '../data/regions';
import { IDLE_MUSIC, type MusicContext } from '../audio/musicDirector';
import type { MusicSector } from '../data/musicTracks';
import { FACTIONS, FACTION_IDS, STANCE_LABEL, STANDING_EVENTS, borderDistance, clampStanding, marineStance, sectorAt, type FactionId } from '../data/factions';
import { AMMO_UNLOCK, GOODS, GOOD_BY_ID, UPKEEP, bagMax, cargoCap, emptyEconomy, profileOf, type EconomyState, type GoodId } from '../data/economy';
import { applySalvage, buyGood, takeCargo, cargoUsed, rollSalvage, decayHeat, eqPriceOf, inspectCargo, marketAt, marketPrice, moraleEfficiency, quoteBuy, quoteSell, recordLedger, roleOf, sellGood, stepUpkeep, tariffOf, trendOf, upkeepOf, warCargo, yardRepairCost, type MarketSite, type Tariff } from './economyEngine';
import { REP, applyOutcome, battleOutcome, blueprintDiscount, emptyReputation, harborDiscount, hasService, honorTitle, isPeaceful, repTier } from '../data/reputation';
import type { BattleMark, BattleResult } from '../naval/naval';
import { createRaidContext } from '../raid/raidSession';
import { newRaidInstanceId, type RaidEnd, type RaidView } from '../raid/raidDirector';
import { ESCORT_MAX, MARINE_RAID_PENALTY, MERCENARY_ESCORT_PRICE, mercenarySlots, raidAccess } from '../raid/raidRules';
import { RaidPanel } from '../ui/raidPanel';
import { OccupationBanner } from '../ui/occupationBanner';
import { OccupationSystem } from './occupationSystem';
import { emptyUnlocks } from '../raid/occupation';
import { SHARD_NAME } from '../data/crafting';
import { TIER_DEFS, tierOfRank, type Tier } from '../data/balanceConfig';
import { UPGRADE_RECIPE, WEAPON_RECIPE, craftCheck, paySeals, payRecipe, payWeapon, sealTotal, recipeOf, sealsOf, shopGate, weaponCraftCheck, type Recipe, type SealPurse } from '../data/crafting';
import type { PersonalLoot } from '../raid/raidLoot';
import { mintEntityId, type EntityId } from '../sim/entityId';
import { PerfWatchdog } from '../render/watchdog';
import { drawMap, mapPalette, type MapMarkers, type MapOpts, type Poi, type WorldMapData } from '../ui/minimap';
import { Compass, type CompassPoi } from '../ui/compass';
import { WorldMapScreen } from '../ui/worldMap';
import { CREW_BY_ID } from '../data/crew';
import { officerSlots, troopCapacity, TROOP_RANK } from '../data/crewTiers';
import { addTroops, cleanRoster, clampRoster, COMMANDS, rosterTotal, scaleRoster, TROOPS, type CommandState, type TroopRoster, type TroopType } from '../data/troops';
import { COMMAND_ACTIONS, PAD_CHORD_LABEL, commandOnKey, type ActionId } from '../data/actions';
import {
  FLEET_ORDERS, FLEET_ORDER_ACTIONS, FLEET_UNLOCK_RANKS, TOWED_HP, activateShip, activeCount, activeShips, assignShip, assignableClasses, dockShip, emptyFleet, fleetShip, fleetShipUpkeep, fleetSlots,
  fleetUpkeepDaily, fleetUpkeepList, hasFreeSlot, releaseShip, towShip, fleetIdOf, type FleetCtx, type FleetOrder, type FleetShipRecord, type FleetState,
} from '../data/playerFleet';
import { activeParty, ensureCrewState, savedPools } from './crewRoster';
import { rollTrinket, TRINKET_BY_ID } from '../data/trinkets';
import { RARITIES, RARITY, type Rarity } from '../data/rarity';
import { type LootDrop } from '../data/loot';
import { CAT_LABEL, EQUIP_BY_ID, GEAR_CATS, catOf, type GearCat } from '../data/equipment';
import { clearOld, ensureLoot, grantLoot, lootDef, rollGearByTier, rollLootGear, setLine, wearLoot, wornLoot } from './gearBag';
import { ACHIEVEMENTS } from '../data/achievements';
import { ABYSS_LAIR } from '../naval/seaBoss';
import { crewFrac, crewPricePerHead, missingHeads, needsRepair, poolHeads, REPAIR_MATERIALS, SAIL_HP_PER_HULL, shipTooltip, type ShipSimState } from '../naval/shipSim';
import { fmtInt } from './format';
import { wrapAngle } from './mathUtil';
import type { RepairMaterial } from '../sim/intents';
import { QUESTS, QUEST_BY_ID } from '../data/quests';
import { hostileLegends, LEGEND_BY_ID, rankRows } from '../data/legends';
import { clamp01 } from './mathUtil';

export const GAME_VERSION = __APP_VERSION__;
const AUTOSAVE_SECONDS = 30;

/** Kurzzeichen der Ausrüstungsplätze im Inventar */
const LOOT_ICON: Record<GearCat, string> = { head: '🪖', shoulder: '🛡', chest: '🦺', cloak: '🧣', hands: '🧤', legs: '👖', feet: '🥾', mainhand: '🗡', offhand: '🔪' };

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
  /** Schwarzblende zwischen den Einstellungen des Titelbilds (liegt unter den Menüs, über der 3D-Welt) */
  private titleFade!: HTMLElement;
  private fadeShown = -1;
  private dialogUi!: DialogOverlay;
  private markers!: NpcMarkers;
  private questLog: QuestLog | null = null;
  private inventoryUi: InventoryScreen | null = null;
  private compass!: Compass;
  private helm!: HelmDial;
  private sectorBanner!: SectorBanner;
  private edgeWarning!: EdgeWarning;
  private raidPanel!: RaidPanel;
  /** Besatzung eroberter Festungsinseln (Timer, Flotte, Tribut) und ihr Banner oben in der Mitte */
  occupation!: OccupationSystem;
  private occBanner!: OccupationBanner;
  private occT = 0;
  /** Letzte Anzeige-Daten der Belagerung (Ziele, Markierungen für Karte und Kompass) */
  private raidView: RaidView | null = null;
  /** Spielerkennung in Raid-Gruppen (im Mehrspielerbetrieb ersetzt sie die des Servers) */
  private localPlayerId: EntityId = mintEntityId('foot');
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

  /** Die Inseln sind noch nicht gebaut (start() baut sie stückweise hinter dem Ladebildschirm) */
  private worldPending = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, deferWorld = false) {
    this.worldPending = deferWorld;
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
    setTexDetail(startTier.textureScale, Math.min(startTier.anisotropy, caps.getMaxAnisotropy()), startTier.detail, startTier.textureBoost);
    // Alle Modell-Texturen (Figuren, Blender-Bauten) laden mit derselben Filterung wie die gemalten
    preload.setAnisotropy(Math.min(startTier.anisotropy, caps.getMaxAnisotropy()));
    this.world = new SeaWorld(deferWorld);
    this.world.env.maxTex = caps.maxTextureSize;
    this.world.warmHook = (o) => this.renderer.warmObject(o);
    // Streaming (4.3B): Shader einer neu gebauten Insel parallel vorübersetzen, der Tausch wartet darauf
    this.world.warmIsland = (o) => this.renderer.warmObjectAsync(o);
    // Spiegelungen (IBL): der Himmel wird regelmäßig als vorgefilterte Umgebungskarte aufgenommen
    this.skyProbe = new SkyProbe(this.renderer.gl, this.world.env.sky.dome.material as ShaderMaterial);
    this.renderer.onQualityChange((c) => this.world.applyQuality(c));
    this.renderer.onQualityChange((_c, tier) => { document.documentElement.dataset.fx = tier === 'low' ? 'lite' : 'full'; });
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
    this.titleFade = document.createElement('div');
    this.titleFade.className = 'title-fade';
    uiRoot.appendChild(this.titleFade);
    this.menus = new Menus(uiRoot, this);
    this.menus.onError = () => this.hud.toast('Das hat leider nicht geklappt – bitte noch einmal versuchen.', 3);

    // Zonen des HUD: oben Mitte stapeln sich Kompass, Sektor, Besatzungsbanner und Boss-Leiste (in dieser Reihenfolge angelegt)
    const zone = this.hud.regions;
    this.compass = new Compass(zone.tc);
    this.sectorBanner = new SectorBanner(zone.tc);
    this.edgeWarning = new EdgeWarning(zone.tc);
    this.occBanner = new OccupationBanner(zone.tc);
    this.overlay = new CombatOverlay(uiRoot, zone.tc);
    this.overlay.setVisible(false);
    this.dialogUi = new DialogOverlay(uiRoot);
    this.markers = new NpcMarkers(uiRoot);
    this.raidPanel = new RaidPanel(zone.ml);
    this.helm = new HelmDial(zone.bl);
    this.occupation = new OccupationSystem({
      save: () => this.save,
      world: this.world,
      toast: (t, secs) => this.hud.toast(t, secs),
      banner: (t, sub) => this.overlay.showBanner(t, sub),
      fame: (n) => this.grantXp(0, n),
      provisions: (n) => { if (this.save) addItem(this.save.gear, 'proviant', n); },
      persist: () => this.persist(),
      cue: (k) => { audio.play(k); if (k === 'horn') audio.director?.sting('alarm'); },
    });
    this.world.onMessage = (m) => this.hud.toast(m);
    this.world.onModeChange = (m) => this.onModeChange(m);
    this.world.onFleetLost = (id) => this.onFleetLost(id);
    this.world.onKill = (e) => this.onKill(e);
    this.world.onGold = (n) => { if (this.save) this.save.player.gold += Math.round(n * this.goldMult()); };
    this.world.onCrewLine = (who, text) => this.hud.toast(`${who.name}: „${text}“`, 4);
    // Nach Entern/Landgang: Überlebende der Massentruppen zurück an Bord, Verluste bleiben bis zur nächsten Anheuerung
    this.world.onTroopsReturn = (left, before) => this.troopsReturned(left, before);
    this.world.standingOf = (id) => this.save?.progress.standing?.[id] ?? 0;
    this.world.bountyOf = (id) => this.save?.progress.reputation?.bounty[id] ?? 0;
    this.world.onBattleStart = (m, where) => this.battleStarted(m, where);
    this.world.onBattleEnd = (r) => this.battleEnded(r);
    this.world.onRaidRequest = (def) => this.openRaidRequest(def);
    this.world.onRaidView = (v) => { this.raidView = v; this.raidPanel.update(v); };
    this.world.onRaidEnd = (info) => this.raidEnded(info);
    this.world.onShipSunk = (e) => {
      if (!this.save || e.captured) return;
      const p = this.save.player;
      if (!e.companion) { this.save.progress.stats.sunk++; this.questEvent({ type: 'sink' }); }
      // Ansehen: die Marine merkt sich versenkte Schiffe, Kurogane-Schwarzsegler zu versenken gefällt ihr
      if (!e.companion && e.power === 'marine') this.shiftStanding('marine', STANDING_EVENTS.marineShipSunk);
      else if (!e.companion && e.power === 'kurogane') this.shiftStanding('marine', STANDING_EVENTS.kuroganeShipSunk);
      // Schiffe der anderen Mächte: außerhalb einer Seeschlacht kostet jedes versenkte Schiff Ansehen; Kopfgeldjäger zu versenken senkt das Kopfgeld
      if (!e.companion && e.power && !e.battle) {
        if (e.hunter) this.payBountyDown(e.power, 120);
        else if (e.power !== 'marine') this.shiftStanding(e.power, REP.sinkOutside);
      }
      if (!e.companion) this.salvageShip(e, false);
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
      if (e.power === 'marine') this.shiftStanding('marine', STANDING_EVENTS.marineShipBoarded);
      else if (e.power && !e.battle && !e.hunter) this.shiftStanding(e.power, REP.boardOutside);
      // ein geenterter Kopfgeldjäger zählt wie ein versenkter: das Kopfgeld sinkt
      if (e.hunter && e.power) this.payBountyDown(e.power, 120);
      this.addLoyalty(this.save.crew.party, 4);
      this.questEvent({ type: 'board' });
      if (!e.companion) this.salvageShip(e, true);
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
    // Regler über die Audio-Schnittstelle (3.0-Menü, HUD) landen in den Geräteeinstellungen; umgekehrt setzt applySettings sie
    audio.onPrefsChange((p) => this.settings.update({ volume: { ...this.settings.data.volume, master: p.masterVolume, music: p.musicVolume, sfx: p.sfxVolume, ambient: p.ambienceVolume }, muteWhenUnfocused: p.muteWhenUnfocused }));
    audio.onTrackChange((n) => this.sectorBanner.setTrack(n?.title ?? null, n?.category === 'region' || n?.category === 'harbor'));
    this.world.ammoOk = (id) => this.eco().ammo.includes(id);
    this.world.ammoLockText = (id) => { const v = this.ammoView(id); return v.gate || `${AMMO[id].n} ist noch nicht freigeschaltet: beim Munitionsmeister in der Werft (${v.price} Gold).`; };
    this.hud.onAmmo = (id) => this.world.selectAmmo(id);
    this.hud.onFleetOrder = (o) => this.setFleetOrder(o);
    this.hud.onPause = () => this.pause();
    this.hud.onFaji = () => this.openSkills();
    this.hud.onCommand = (c) => this.orderTroops(c);
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
      audio.setFocused(!document.hidden);
      if (document.hidden) {
        if (this.state.is('play')) this.pause();
        else this.persist();
      } else { this.loop.resetClock(); this.sceneChanged(4); }
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

  /**
   * Hinter dem Ladebildschirm: Inseln und Städte, Figuren und Shader in kleinen Stücken vorbereiten. Der Plan (Gewichte) steht in
   * main.ts. Der Browser bekommt nach jedem Stück Luft (core/yield.ts): Balken bewegt sich, die Seite hängt nicht.
   */
  async start(loading: LoadingScreen = new LoadingScreen()) {
    if (!preload.hasPlan) {
      preload.plan(0.23, { world: 0.3, prepare: 0.1, shaders: 0.37 });
      preload.onProgress((p, phase) => loading.set(p, phase));
    }
    try {
      if (this.worldPending) {
        preload.setPhase('Inseln und Städte werden aufgebaut …');
        await runSteps(this.world.buildSteps(), (p) => preload.step('world', p));
        this.worldPending = false;
      }
      preload.step('world', 1);
      // Titelbild: das Prachtschiff segelt durch Abendgold, Sturm und Mondnacht (Zeit und Wetter gehören der Regie, bis das Spiel beginnt)
      this.world.titleMood();
      preload.setPhase('Figuren und Animationen werden geladen …');
      this.assets = await CharacterAssets.load();
      preload.completeFiles();
      preload.step('prepare', 0.02, 'Figuren werden vorbereitet …');
      await tick();
      await runSteps(this.world.setCharactersSteps(this.assets, randomLook(Math.random, 'pirat'), 'saebel', this.overlay), (p) => preload.step('prepare', p));
      preload.step('prepare', 1);
      // Shader vorkompilieren, damit Gegner, Treffer und Fähigkeiten beim ersten Mal nicht ruckeln
      preload.setPhase('Effekte werden vorbereitet …');
      await this.world.warmup(this.renderer.gl, () => this.render(1, 1 / 60), (k) => preload.step('shaders', k), (on) => loading.setBlocking(on), () => this.renderer.precompile(this.world.scene, this.world.camera));
    } catch (e) {
      console.error(e);
      this.hud.toast('Figuren konnten nicht geladen werden – prüfe die Verbindung.', 5);
    }
    // Alle Inseln standen bis hierher ganz da (damit alle Shader übersetzt sind): jetzt streamt der WorldStreamer, nur die Inseln in der Nähe behalten ihre Netze
    this.world.settleStreaming();
    // Die Spielschleife erst jetzt starten: hinter dem deckenden Ladebildschirm kostete jedes Bild nur Zeit
    this.loop.start();
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
      if (this.input.pressed('repair')) this.repairAtSea();
      if (this.input.pressed('inventory')) { this.openInventory(); return; }
      // Solange Trupps im Einsatz sind, gehören ihre Tasten den Befehlen (standardmäßig 1–3: Sturm, Folgen, Halten). Güter auf einer
      // Taste, die gerade ein Befehl belegt, ruhen (Schnellleiste: Platz 4 oder eigene Tasten); sonst gelten sie wie immer.
      const cmdKeys = this.world.squadsActive && this.world.mode === 'foot';
      const binds = this.input.getKeyBindings();
      if (cmdKeys) for (const c of COMMANDS) if (this.input.pressed(COMMAND_ACTIONS[c.id])) this.orderTroops(c.id);
      for (let i = 0; i < BAR_SLOTS; i++) {
        const a = `item${i + 1}` as ActionId;
        if (!this.input.pressed(a)) continue;
        if (cmdKeys && commandOnKey(binds, a)) continue;
        this.useItem(this.save?.gear.bar?.[i] ?? null);
      }
      // Flottenbefehle auf See (5 / 6 / 7, Gamepad R3 + Kreuz): nur mit mindestens einem aktiven Begleitschiff
      if (this.world.mode === 'sail' && this.save && activeCount(this.fleet()) > 0) for (const o of FLEET_ORDERS) if (this.input.pressed(FLEET_ORDER_ACTIONS[o.id])) this.setFleetOrder(o.id);
      this.tickItems(dt);
      this.legendT -= dt;
      if (this.legendT <= 0) { this.legendT = 1; this.updateLegends(); this.checkAchievements(); }
      this.world.update(dt, this.input);
      if (this.save) this.save.meta.playTime += dt;
      this.occupation.update(dt);
      this.stepEconomy(dt);
      this.occT -= dt;
      if (this.occT <= 0) { this.occT = 0.4; this.refreshOccBanner(); }
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
    // Grafikstufe wird gerade angewendet (Shader werden parallel übersetzt): nicht zeichnen, sonst übersetzt das Zeichnen sie am Stück und der Browser hängt
    if (this.qualitySwitching) return;
    this.updateAudio(frameDt);
    // Titelbild: Blende der Regie (nur im Menü; in allen anderen Zuständen sofort klar, auch im Editor)
    const inMenu = this.state.is('menu', 'boot');
    {
      const fade = inMenu ? Math.round(this.world.title.fade * 200) / 200 : 0;
      if (fade !== this.fadeShown) { this.fadeShown = fade; this.titleFade.style.opacity = String(fade); this.titleFade.hidden = fade === 0; }
    }
    if (this.state.is('editor') && this.stage) {
      // Kompassleiste gehört zum Spiel: im Editor und in den Fenstern (Inventar, Fähigkeiten) nicht darüber zeigen
      this.compass.setVisible(false);
      // Studio: neutrale Farbstimmung, nicht die der letzten Tageszeit
      this.renderer.setMood(0, 0);
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
    this.world.render(a, frameDt, inMenu);
    this.skyProbe.update(frameDt);
    {
      // Farbstimmung der Nachbearbeitung nach Tageszeit (Mondlicht-Blau nachts, Bernstein zur goldenen Stunde)
      const pal = this.world.env.palette;
      const dark = 1 - pal.sunVis;
      const nightK = clamp01((dark - 0.2) / 0.7);
      const lowSun = clamp01((0.5 - pal.sunDir.y) / 0.38);
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
        this.hud.setStats(hp ? hp.hp / hp.max : 1, p.xp / PLAYER_BASE.xpNeed(p.level), p.gold, hp ? { now: hp.hp, max: hp.max } : null);
        const stm = this.world.playerStamina;
        this.hud.setStamina(stm ? stm.frac : null, !!stm?.flash);
        const sh = this.world.ship;
        const sailing = this.world.mode === 'sail';
        this.hud.setSea(sailing ? this.seaView(sh) : null);
        // Steuerkompass (Kurs und Wind) und Sektor-Einblendung beim Überqueren einer Grenze
        const where = sectorLabel(this.world.playerPos.x, this.world.playerPos.z);
        this.helm.setVisible(sailing);
        if (sailing) this.helm.update({ heading: sh.heading, windRel: this.world.env.windDir - sh.heading, wind: this.world.env.weather.p.wind, sector: where });
        this.sectorBanner.update(sailing && !this.world.raid ? where : null);
        this.edgeWarning.update(sailing && !this.world.raid ? this.world.edgeWarning : null);
        {
          // Besatzung in einer Zeile: Offiziere A/B | Truppen X/Y (+ Befehlsknöpfe [1] [2] [3], solange Trupps im Einsatz sind)
          const ch = this.world.crewHud, tier = this.save.ship.tier;
          const slots = officerSlots(tier);
          const show = this.save.crew.hired.length > 0 || ch.troopMax > 0;
          const b = this.input.getKeyBindings();
          const keys = COMMANDS.map((c) => this.input.keyLabel(b[COMMAND_ACTIONS[c.id]][0] ?? ''));
          this.hud.setCrewLine(show ? { officers: ch.officers, slots, troops: ch.troops, troopMax: ch.troopMax, cmds: ch.commands ? keys : null, active: ch.command } : null);
        }
        this.updateFleetHud(sailing);
        const fj = this.world.faji;
        this.hud.setFaji(fj ? fj.faji / fj.maxFaji : 1, this.save.skills.sp, fj?.faji, fj?.maxFaji);
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
      {
        // Befehlsmodus der Schnellleiste: welche Plätze gerade ein Truppenbefehl belegt (gleiche Taste), sonst null
        const b = this.input.getKeyBindings();
        const items = ['item1', 'item2', 'item3', 'item4'] as const;
        const cmdMode = this.world.squadsActive && this.world.mode === 'foot';
        const cmd = cmdMode ? items.map((a) => { const c = commandOnKey(b, a); return c ? COMMANDS.find((x) => x.id === c)!.short : null; }) : null;
        this.hud.setItemBar(this.input.lastDevice !== 'touch', this.itemBarViews(), items.map((a) => this.input.keyLabel(b[a][0] ?? '')), cmd);
      }
      // Erst die Auflösung anpassen (unsichtbarer), die ganze Grafikstufe erst senken, wenn das nicht reicht
      // Leistungs-Wächter: unter 50 fps zuerst unsichtbare Last abbauen (Schatten, AO, Vegetation), erst danach Auflösung und Grafikstufe
      if (s.qualityAuto) {
        const lv = this.watchdog.sample(frameDt);
        if (lv !== null) { this.renderer.setBudget(lv); this.renderer.dynRes.rewarm(); this.autoQuality.reset(); this.world.env.shadowStride = this.deviceInfo.mobile && lv >= 1 ? 2 : 1; }
      } else if (this.watchdog.level > 0) { this.watchdog.reset(); this.renderer.setBudget(0); this.world.env.shadowStride = 1; }
      const budgetSpent = !s.qualityAuto || this.watchdog.level >= PerfWatchdog.MAX;
      // Bremst der Prozessor (Zeichenaufrufe) statt der Grafikkarte, bringen weniger Pixel nichts: die Auflösung bleibt dann unangetastet
      // (sonst würde das Bild ohne Gewinn unscharf, bis der Probelauf der dynamischen Auflösung es zurücknimmt)
      const cpuBound = this.loop.cpuMs > 0.85 * this.loop.frameMs && this.loop.frameMs > 15;
      if (s.dynamicResolution && !cpuBound && (budgetSpent || this.watchdog.level >= 2) && this.renderer.dynRes.sample(frameDt)) this.renderer.resize();
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
    // wie setQuality: nicht zeichnen, bis die Shader der neuen Stufe parallel übersetzt sind
    this.qualitySwitching = true;
    this.renderer.applyQuality(lower);
    this.world.env.ensureCsm(this.world.camera as PerspectiveCamera);
    this.renderer.precompile(this.world.scene, this.world.camera).catch(() => {}).finally(() => { this.qualitySwitching = false; });
    this.hud.toast(`Grafikstufe auf „${QUALITY_TIERS[lower].label}“ gesenkt, damit es flüssig läuft.`, 3.5);
  }

  /**
   * Szenenwechsel (an Land gehen, Ablegen, Entern, Schnellreise): Figuren, Gegner und Inselteile werden aufgebaut, neue Shader übersetzt.
   * Die Wächter messen danach erst wieder nach einer Schonfrist, sonst senkte ein einziger Ruckler beim Betreten einer Insel
   * Auflösung oder Grafikstufe.
   */
  private sceneChanged(grace = 6) {
    this.watchdog.rewarm(grace);
    this.renderer.dynRes.rewarm(grace);
    this.autoQuality.reset(grace + 2);
  }

  private onModeChange(m: SeaMode) {
    this.sceneChanged();
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
      // Umgebung nach Fahrt, Seegang und Küstennähe: knarzendes Holz, Wind in den Segeln, Bugwelle, Möwen nur in Küstennähe
      const sailing = w.mode === 'sail';
      const speed01 = sailing ? Math.min(1, Math.abs(w.ship.speed) / 14) : 0;
      let coast = 9999;
      for (const i of w.islandDefs) coast = Math.min(coast, Math.hypot(i.x - pos.x, i.z - pos.z) - i.r);
      const coastal = Math.max(0, 1 - coast / 340);
      const calmDock = sailing && !!w.ship.moored;
      audio.setAmbience({
        waves: w.mode === 'foot' ? 0.55 : 0.95, wind: 0.15 + wp.wind * 0.85, rain: wp.rain,
        town: Math.max(0, 1 - dTown / 170), gulls: night || wp.rain > 0.3 ? 0.05 : 0.08 + 0.55 * coastal,
        deep: clamp01((edge - (EDGE_WALL - 450)) / 400),
        sailwind: sailing && !calmDock ? Math.min(1, wp.wind) * (0.3 + 0.7 * speed01) : 0,
        bow: calmDock ? 0 : speed01,
        creak: sailing ? Math.min(1, (calmDock ? 0.25 : 0.12) + 0.45 * Math.min(1, wp.waves / 2.7) + 0.4 * speed01) : w.onDeck ? 0.25 : 0,
      });
      audio.setMusicContext(this.musicContext(w, pos, dTown, threat));
    } else if (this.state.is('menu', 'boot')) {
      audio.setMood('menu');
      audio.setMusicContext(IDLE_MUSIC);
      audio.setAmbience({ waves: 0.8, wind: 0.2, rain: 0, town: 0, gulls: 0.4, deep: 0, sailwind: 0, bow: 0, creak: 0 });
    }
    audio.update(dt);
  }

  /**
   * Lage für den MusicDirector: Region unter der Spielfigur (Ankerglück im Kernmeer, sonst das Kuchenstück, an Marine-Festungen die Marine),
   * Hafen, Fahrt, Wetter, Gefahr, Schlacht, Entern und Belagerung.
   */
  private musicContext(w: SeaWorld, pos: { x: number; z: number }, dTown: number, threat: number): MusicContext {
    const wp = w.env.weather.p;
    let sector: MusicSector = regionAt(pos.x, pos.z).id === BERNSTEINSEE.id ? 'ankergluck' : sectorAt(pos.x, pos.z).factionId;
    let harborSector: MusicSector = sector;
    let harbor = !!w.ship.moored && w.mode === 'sail';
    for (const i of w.islandDefs) {
      const d = Math.hypot(i.x - pos.x, i.z - pos.z);
      if (i.kind === 'marinefort' && d < i.r + 520) sector = 'marine';
      if ((i.kind === 'town' || i.kind === 'harbor') && d < i.r + 110) {
        harbor = true;
        harborSector = i.kind === 'town' ? 'ankergluck' : (regionAt(i.x, i.z).id === BERNSTEINSEE.id ? 'ankergluck' : sectorAt(i.x, i.z).factionId);
      }
    }
    const speed = w.mode === 'sail' ? Math.min(1, Math.abs(w.ship.speed) / 14) : 0;
    const storm = Math.max(clamp01((wp.waves - 1.8) / 0.8), Math.min(1, wp.lightning / 6));
    const battle = w.battleMarks.some((m) => Math.hypot(m.x - pos.x, m.z - pos.z) < 900);
    void dTown;
    return {
      mode: w.mode === 'foot' ? 'foot' : 'sail', sector, harbor, harborSector, speed, wind: Math.min(1, wp.wind), storm, threat,
      seaBattle: battle && w.mode === 'sail', boarding: w.isBoarding, raid: w.musicRaid,
    };
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
  private displayLook(d: SaveData | null = this.save, base?: CharacterLook, tryOn?: string[] | null) {
    const p = d!.player;
    const look = structuredClone(base ?? p.look);
    const g = d!.gear;
    const head = headEq(g);
    if (head) { look.hat = head.hat; look.hatColor = head.color; }
    const al = ARMOR_LOOK[armorEq(g)];
    const extra: string[] = [];
    if (al) { const { extra: more, ...rest } = al; Object.assign(look, rest); if (more) extra.push(...more); }
    // einzeln angelegte Stücke: Schienen als zusätzliche Teile, Stiefel ersetzen das Schuhwerk
    // Beute-Ausrüstung: ersetzt auf ihrem Platz, was sonst getragen wird; Farben je Stück aus dem Spielstand
    const loot = wornLoot(g);
    if (loot.length) { for (const d of loot) extra.push(d.id); if (g.dyes && Object.keys(g.dyes).length) look.dye = g.dyes; }
    for (const d of wornGear(g)) {
      if (d.slot === 'feet') { look.shoes = 'stiefel'; if (d.shoesColor) look.shoesColor = d.shoesColor; } else if (d.equip) extra.push(d.equip);
    }
    // Anprobe: zusätzliche Stücke nur zur Anzeige (ersetzen auf ihrem Platz, ohne etwas anzulegen)
    if (tryOn?.length) extra.push(...tryOn);
    if (extra.length) look.extra = extra;
    return look;
  }

  private applyPower() {
    if (!this.save) return;
    const lvl = this.save.player.level;
    const gear = this.save.gear;
    ensureGear(gear);
    const wdef = WEAPONS[weaponEq(gear)];
    if (wdef) this.world.setWeaponLook({ blade: wdef.col, glow: !!wdef.glow });
    this.world.setOffhand(wornGear(gear).find((d) => d.slot === 'offhand')?.shield ?? null);
    const has = (id: string) => this.save!.crew.hired.includes(id);
    const evo = evolutionOf(this.save.ship, this.save.ship.tier);
    const evoS = evoStats(evo);
    const up = { can: 0 };
    void up;
    const tb = (gear.trinket ? TRINKET_BY_ID[gear.trinket]?.bonus : null) ?? {};
    // Alle Werte aus einer Stelle (core/inventory.ts): Ausrüstung, Talisman, Crew, Stärkungen
    const st = this.playerStats();
    this.world.setPlayerPower(st.hp, st.atk);
    this.world.setGearDefense(st);
    this.world.shipSpeedMult = (has('nav') ? 1.15 : 1) * (has('esra') ? 1.1 : 1) * (1 + (tb.speed ?? 0));
    this.world.ship.turnMult = has('helm') ? 1.6 : 1;
    this.world.rangeMult = has('look') ? 1.25 : 1;
    // Rumpf-Stufe: 75 % (Stufe 1) … 145 % (Stufe 5) der Klassenbasis (Stufe 3 = alte Grundwerte)
    // Ausbaustufen (Rumpf-Panzerung, Segel, Kanonen, Rammsporn, Drehbassen) zuerst setzen: jeder Neubau des Modells unten baut schon mit den neuen Stufen
    this.world.ship.setEvolution(evo);
    const hullBonus = (has('carp') ? 40 : 0) + Math.round(SHIP_CLASSES[this.save.ship.tier].hp * (evoS.hullHpK - 1));
    if (hullBonus !== this.world.hullBonus) {
      this.world.hullBonus = hullBonus;
      this.world.setShip(this.save.ship.tier, this.save.ship.look, this.world.ship.ammo, this.world.ship.hull / Math.max(1, this.world.ship.maxHull), this.save.player.faction);
    }
    // Sichtbarer Ausbau (Flickbretter … Rammsporn, Segel, Pforten, Drehbassen): ändert er sich, baut `SeaWorld.setShip` das Modell neu (Deck, Steuerrad und Gangway werden ohne Sprung neu gebunden)
    if (this.world.ship.visualStale) this.world.setShip(this.save.ship.tier, this.save.ship.look, this.world.ship.ammo, this.world.ship.hull / Math.max(1, this.world.ship.maxHull), this.save.player.faction);
    // Stilbonus der Waffenlinie: Foki laden Faji schneller nach, Kampfhandschuhe treffen öfter voll
    if (this.world.faji) this.world.faji.extraRegen = st.fajiRegen;
    if (this.world.combat) this.world.combat.critChance = st.crit;
    if (this.world.combat) this.world.combat.attackTier = WEAPONS[weaponEq(gear)]?.tier ?? 1;
    const nav = this.world.naval;
    if (nav) {
      nav.playerLevel = lvl;
      nav.playerFaction = this.save.player.faction;
      nav.playerRank = rankIndex(this.save.player.fame);
      nav.canDmg = (12 + lvl * 1.4) * (1 + this.save.ship.tier * 0.06) * evoS.cannonDmgK * (has('bruno') ? 1.2 : 1) * (1 + (tb.cannon ?? 0));
      nav.reloadMult = has('gun') ? 0.7 : 1;
    }
    // Schiffskoch: bessert den Rumpf zusätzlich aus, aber nur, solange genug Seeleute an Bord sind (siehe stepPassiveRepair)
    this.world.ship.repairBonus = has('cook') ? 1.2 : 0;
    const c = this.save.crew;
    const tier = this.save.ship.tier;
    // Offiziere: so viele, wie die Schiffsklasse zulässt (Rest bleibt als Reserve im Spielstand); Truppen: Bestand je Typ
    this.world.setCrew(c.hired, activeParty(c.party, tier), c.loyalty, lvl, (has('musik') ? 1.15 : 1) * (has('ram') ? 1.15 : 1), this.troopRoster());
  }

  // ---------- Massentruppen (Stufe 2) ----------

  /** Bestand der Massentruppen aus dem Spielstand, auf die Kapazität des Schiffs gekappt */
  private troopRoster(): TroopRoster {
    const s = this.save;
    if (!s) return {};
    return ensureCrewState(s.crew, s.ship.tier);
  }

  /**
   * Schiffs-Pool und Bestand je Typ gleichhalten: Beschuss auf See senkt den Pool (der Bestand schrumpft verhältnismäßig mit), Anheuern und
   * Rückkehr aus dem Gefecht setzen beide zugleich. Im Einsatz (Trupps an Land) ruht der Abgleich.
   */
  private syncTroops() {
    const s = this.save;
    if (!s || this.world.squadsActive) return;
    const sh = this.world.ship;
    let roster = this.troopRoster();
    const pool = Math.round(sh.troopHeads);
    if (sh.troopMax <= 0) return; // ohne Truppenplätze ruht der Bestand im Spielstand
    if (pool < rosterTotal(roster)) { roster = scaleRoster(roster, pool); s.crew.troops = roster as Record<string, number>; this.world.setTroops(roster); }
    else if (pool > rosterTotal(roster)) this.world.ship.setTroopHeads(rosterTotal(roster));
  }

  private troopsReturned(left: TroopRoster, before: TroopRoster) {
    const s = this.save;
    if (!s) return;
    const lost = rosterTotal(before) - rosterTotal(left);
    s.crew.troops = clampRoster(cleanRoster(left), this.world.ship.troopMax) as Record<string, number>;
    this.world.ship.setTroopHeads(rosterTotal(s.crew.troops as TroopRoster));
    if (lost > 0) this.hud.toast(`Truppen zurück an Bord: ${lost} gefallen. Auffüllen im Hafen oder in der Werft.`, 4.5);
    else if (rosterTotal(before) > 0) this.hud.toast('Alle Truppen kehren unversehrt an Bord zurück.', 3);
    this.persist();
  }

  /** Befehl an Offiziere und Trupps ([1] Sturmangriff, [2] Folgen, [3] Position halten) */
  orderTroops(c: CommandState) {
    if (!this.state.is('play') || this.world.mode !== 'foot') return;
    this.world.orderTroops(c);
    audio.play('bell', 0.35);
  }

  /** Kann das Schiff Truppen tragen und darf der Spieler sie anheuern? */
  troopStatus(): { cap: number; heads: number; rankOk: boolean; rankName: string } {
    const s = this.save;
    const tier = s?.ship.tier ?? 0;
    const cap = troopCapacity(tier);
    const heads = s ? rosterTotal(this.troopRoster()) : 0;
    const need = Math.min(TROOP_RANK, FAME_THRESHOLDS.length - 1);
    return { cap, heads, rankOk: !!s && rankIndex(s.player.fame) >= need, rankName: s ? rankName(s.player.faction, FAME_THRESHOLDS[need]) : '' };
  }

  /** Truppen eines Typs anheuern (Handgeld je Kopf); `heads` = gewünschte Zahl, `Infinity` = bis zur Kapazität. Liefert die Meldung. */
  recruitTroops(typ: TroopType, heads: number): string {
    const s = this.save;
    if (!s || !TROOPS[typ]) return '';
    const st = this.troopStatus();
    if (st.cap <= 0) return 'Dieses Schiff hat keinen Platz für Truppen – erst der Leviathan trägt Massentruppen.';
    if (!st.rankOk) return `Truppen lassen sich erst ab dem Rang „${st.rankName}“ anheuern.`;
    this.syncTroops();
    const roster = this.troopRoster();
    const price = this.priceAt(TROOPS[typ].price);
    const room = st.cap - rosterTotal(roster);
    if (room <= 0) return 'Die Truppen sind vollzählig.';
    const want = Math.min(Math.floor(heads), room, Math.floor(s.player.gold / price));
    if (want <= 0) return `${TROOPS[typ].label} kosten ${price} Gold Handgeld je Kopf.`;
    const sh = this.world.ship;
    const got = addTroops(roster, typ, sh.requestCrewRefill({ type: 'crewRefill', entityId: this.world.playerEntityId, shipId: sh.entityId, heads: want, pool: 'truppen', troopType: typ }), st.cap);
    // der Pool nimmt `got` Köpfe auf; der Bestand je Typ wächst mit
    s.crew.troops = roster as Record<string, number>;
    s.player.gold -= got * price;
    sh.setTroopHeads(rosterTotal(roster));
    this.world.setTroops(roster);
    audio.play('level', 0.5);
    this.persist();
    const total = rosterTotal(roster);
    return got < want ? `${got} ${TROOPS[typ].label} angeheuert (Truppen ${total}/${st.cap}).` : `${got} ${TROOPS[typ].label} angeheuert – Truppen ${total}/${st.cap}.`;
  }

  /** Preis, den Truppen-Pool mit einem Typ ganz aufzufüllen */
  troopFillCost(typ: TroopType): number {
    const st = this.troopStatus();
    return Math.max(0, st.cap - st.heads) * this.priceAt(TROOPS[typ].price);
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
    if (s.gear.potions < PROVIANT.max && Math.random() < 0.4) { s.gear.potions++; this.hud.toast(`Gefangen: ${n}! +${gold} Gold und +1 Proviant`, 3); }
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
      if (def.kind === 'boss' && this.playerRank >= 5) this.dropWarlord(0.3, def.boss ?? 'Bossinsel');
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
    if (s.gear.potions < PROVIANT.max) s.gear.potions++;
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
    if (tier >= 1) this.overlay.lootCard(`${r.mark} ${r.n}er Fund`, d.kind === 'trinket' ? 'Talisman' : d.kind === 'gear' ? 'Ausrüstung' : d.kind === 'proviant' ? 'Proviant' : `${Math.round(d.value * this.goldMult(true))} Gold`, r.col, tier);
    if (d.kind === 'trinket') { if (!this.dropTrinket(d.rarity, 0, undefined, true)) gold(); return; }
    if (d.kind === 'gear') { if (!this.dropGear(d.rarity)) gold(); return; }
    if (d.kind === 'proviant') {
      // ab selten oft ein besonderes Gut (Festmahl, Stärkung, Essenz) statt schlichtem Proviant
      const pool = tier >= 1 ? CONSUMABLES.filter((c) => c.rarity === d.rarity) : [];
      const def = pool.length ? pool[Math.floor(Math.random() * pool.length)] : CONSUMABLE_BY_ID.proviant;
      if (addItem(s.gear, def.id, 1, this.bagMax(def))) { this.overlay.number(above(), `${r.mark} +1 ${def.n}`, 'heal'); return; }
    }
    gold();
  }

  /** Rüstungsteil als Beute: genau in der Seltenheit der Säule; leer ausgehen gibt es nur, wenn alles dieser Seltenheit schon gefunden ist */
  private dropGear(rarity: Rarity): boolean {
    const s = this.save;
    if (!s) return false;
    ensureLoot(s.gear);
    // Zufallsbeute gibt nie Ausrüstung über der Stufe des eigenen Rangs: keine Endgame-Teile aus frühen Truhen
    const d = rollLootGear(rarity, s.player.level, s.gear.loot!, Math.random, tierOfRank(this.playerRank));
    if (!d || !grantLoot(s.gear, d)) return false;
    const r = RARITY[rarity];
    audio.play('shard');
    this.after(() => this.overlay.showBanner(`${r.mark} ${d.n}`, `${CAT_LABEL[catOf(d)]} gefunden (${r.n}) · ${d.d}`), 1200);
    this.world.updatePlayer(this.displayLook(), this.activeStyle());
    this.applyPower();
    this.persist();
    return true;
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
    if (!def.cat && s.crew.party.length < officerSlots(s.ship.tier)) s.crew.party.push(id);
    if (id === 'lehrer') s.skills.sp++;
    audio.play('bell');
    this.overlay.showBanner(`${def.name} heuert an!`, def.perk);
    this.applyPower();
    this.persist();
    return `„${def.quote}“`;
  }

  /** Plätze im Land-/Entertrupp des aktuellen Schiffs (Schaluppe/Brigg 2, Korvette/Fregatte 3, Galeone/Linienschiff 4, Leviathan 5) */
  officerSlots(): number { return officerSlots(this.save?.ship.tier ?? 0); }

  /** Landtrupp umstellen (höchstens `officerSlots` der Schiffsklasse) */
  toggleParty(id: string): string {
    const s = this.save;
    if (!s || !s.crew.hired.includes(id) || CREW_BY_ID[id]?.cat) return '';
    const p = s.crew.party;
    const slots = officerSlots(s.ship.tier);
    const i = p.indexOf(id);
    if (i >= 0) p.splice(i, 1);
    else if (activeParty(p, s.ship.tier).length >= slots) return `Der Landtrupp ist voll (höchstens ${slots} auf diesem Schiff).`;
    else p.splice(activeParty(p, s.ship.tier).length, 0, id);
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
      HEADS.forEach((h) => { if (g.heads!.includes(h.id)) out.push({ key: `head:${h.id}`, cat: 'head', name: h.n, icon: HEAD_ICON, color: rar(h.rarity), desc: h.d, stat: '', equipped: g.head === h.id }); });
      ARMOR.forEach((a, i) => { if (i <= g.armor) out.push({ key: `armor:${i}`, cat: 'armor', name: a.n, icon: a.icon, color: '#8AA0B8', desc: `Rüstungsstufe ${i + 1}`, stat: `+${a.hp} Leben`, equipped: armorEq(g) === i }); });
      WEAPONS.forEach((w, i) => { if (i <= g.weapon) out.push({ key: `weapon:${i}`, cat: 'weapon', name: wl().names[i] ?? w.n, icon: wl().icon, color: w.col, desc: `Waffenstufe ${i + 1}`, stat: wl().stat(w, i), equipped: weaponEq(g) === i }); });
      GEAR.forEach((d) => { if (g.owned!.includes(d.id)) out.push({ key: `gear:${d.id}`, cat: d.slot, name: d.n, icon: d.icon, color: rar(d.rarity), desc: d.d, stat: '', equipped: g.worn![d.slot] === d.id }); });
      for (const id of g.loot ?? []) {
        const d = lootDef(id);
        if (d) out.push({ key: `loot:${id}`, cat: catOf(d), name: d.n, icon: LOOT_ICON[catOf(d)], color: rar(d.rarity!), desc: `${RARITY[d.rarity!].n} · ${d.d}`, stat: setLine(d, g), equipped: g.outfit?.[catOf(d)] === id });
      }
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
      if (kind === 'gear' && GEAR_BY_ID[id]) return { worn: { ...g.worn, [GEAR_BY_ID[id].slot]: id }, outfit: GEAR_BY_ID[id].slot === 'offhand' ? g.outfit : { ...g.outfit, [GEAR_BY_ID[id].slot]: null } };
      if (kind === 'loot') {
        const d = lootDef(id);
        if (!d) return null;
        const c = catOf(d);
        return { outfit: { ...g.outfit, [c]: id }, head: c === 'head' ? null : g.head, worn: c === 'hands' || c === 'legs' || c === 'feet' ? { ...g.worn, [c]: null } : g.worn };
      }
      return null;
    };
    const refreshLook = () => { this.world.updatePlayer(this.displayLook(), style()); stage.show(this.assets!, this.displayLook(), style()); };
    const apply = () => { this.applyPower(); this.persist(); refreshLook(); this.inventoryUi?.refresh(); };
    const host: InventoryHost = {
      items,
      equipped: () => {
        const h = headEq(g), wi = weaponEq(g), ai = armorEq(g), t = g.trinket ? TRINKET_BY_ID[g.trinket] : null;
        const none = null;
        const lootView = (c: GearCat) => { const d = lootDef(g.outfit?.[c]); return d && g.loot?.includes(d.id) ? { name: d.n, icon: LOOT_ICON[c], color: rar(d.rarity!) } : none; };
        const worn = (slot: GearSlot) => { const d = wornGear(g).find((x) => x.slot === slot); return d ? { name: d.n, icon: d.icon, color: rar(d.rarity) } : none; };
        return {
          hands: lootView('hands') ?? worn('hands'), legs: lootView('legs') ?? worn('legs'), feet: lootView('feet') ?? worn('feet'), offhand: lootView('offhand') ?? worn('offhand'),
          shoulder: lootView('shoulder'), chest: lootView('chest'), cloak: lootView('cloak'), mainhand: lootView('mainhand'),
          head: lootView('head') ?? (h ? { name: h.n, icon: HEAD_ICON, color: rar(h.rarity) } : none),
          armor: { name: ARMOR[ai].n, icon: ARMOR[ai].icon, color: '#8AA0B8' },
          weapon: { name: wl().names[wi] ?? WEAPONS[wi].n, icon: wl().icon, color: WEAPONS[wi].col },
          trinket: t ? { name: t.n, icon: TRINKET_ICON, color: rar(t.rarity) } : none,
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
        if (kind === 'head') { g.head = id; g.outfit!.head = null; }
        else if (kind === 'loot') wearLoot(g, id);
        else if (kind === 'armor') g.armorEq = +id;
        else if (kind === 'weapon') g.weaponEq = +id;
        else if (kind === 'trinket') g.trinket = id;
        else if (kind === 'gear' && GEAR_BY_ID[id]) { g.worn![GEAR_BY_ID[id].slot] = id; if (GEAR_BY_ID[id].slot !== 'offhand') g.outfit![GEAR_BY_ID[id].slot as GearCat] = null; }
        else return;
        audio.play('switch');
        apply();
      },
      unequip: (slot: SlotId) => {
        if ((GEAR_CATS as string[]).includes(slot)) { g.outfit![slot as GearCat] = null; clearOld(g, slot as GearCat); }
        if (slot === 'head') g.head = null;
        else if (slot === 'trinket') g.trinket = null;
        else if ((GEAR_SLOTS as string[]).includes(slot)) g.worn![slot as GearSlot] = null;
        else if (!(GEAR_CATS as string[]).includes(slot)) return;
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
    // Schwarzmarkt (Schmugglerhäfen, 4.3B): keine Macht führt hier Aufsicht – kein Tarif, keine Kontrolle, keine Hafensperre
    const fid = profileOf(def).blackMarket ? null : def.factionId ?? (def.marine ? 'marine' : null);
    // Hafensperre: wer bei einer Macht verfemt ist (Ansehen ≤ −60), darf in ihren Häfen nicht anlegen
    if (fid && this.tariff(fid).closed) {
      this.hud.toast(`${FACTIONS[fid].name} hat den Hafen von ${def.name} für dich gesperrt. Mehr Ansehen oder ein Freihafen hilft.`, 5);
      return;
    }
    this.harborFid = fid;
    this.harborDef = def;
    this.afterDocking(def);
    audio.play('bell');
    this.state.set('pause');
    this.menus.showHarbor('', def);
  }

  // ---------- Belagerungs-Raids ----------

  /** Taste an der Küste einer Festungsinsel: Belagerung vorbereiten (Marine mit hohem Dienststatus: sicherer Hafen statt Kampf) */
  private openRaidRequest(def: IslandDef) {
    const s = this.save;
    if (!s || !this.state.is('play') || this.world.raid) return;
    const access = raidAccess(def.factionId ?? 'marine', { marineStanding: s.progress.standing?.marine ?? 0, occupied: this.occupation.occupied(def.id) });
    if (access.safeBase) { this.hud.toast(access.reason, 4); this.openHarbor(def); return; }
    audio.play('bell');
    this.state.set('pause');
    this.menus.showRaid(def);
  }

  /** Daten für das Briefing-Menü */
  raidBriefing(def: IslandDef) {
    const s = this.save;
    if (!s) return null;
    const own = Math.min(ESCORT_MAX, activeCount(this.fleet()));
    return {
      access: raidAccess(def.factionId ?? 'marine', { marineStanding: s.progress.standing?.marine ?? 0, occupied: this.occupation.occupied(def.id) }),
      conquests: this.occupation.conquests(def.id),
      own, mercSlots: mercenarySlots(own, 0), price: MERCENARY_ESCORT_PRICE, max: ESCORT_MAX,
      level: def.level ?? 15, playerLevel: s.player.level, firstClear: !s.progress.flags[`raidwon_${def.id}`],
    };
  }

  /** Belagerung beginnen. Liefert eine Fehlermeldung oder null; bei Erfolg geht das Spiel weiter (Seeschlacht) */
  beginRaid(def: IslandDef, mercs: number): string | null {
    const s = this.save;
    const b = this.raidBriefing(def);
    if (!s || !b) return 'Kein Spielstand.';
    if (!b.access.allowed) return b.access.reason;
    const m = Math.max(0, Math.min(mercs, b.mercSlots));
    const cost = m * b.price;
    if (s.player.gold < cost) return 'Nicht genug Gold für die Söldner.';
    const fid = def.factionId ?? 'marine';
    const { raidInstanceId, seed } = newRaidInstanceId(def.id, s.meta.created + Math.floor(s.meta.playTime));
    const ctx = createRaidContext({ raidInstanceId, factionId: fid, seed, leaderPlayerId: this.localPlayerId, escorts: b.own, mercenaries: m, flagshipId: this.world.ship.entityId });
    s.player.gold -= cost;
    this.menus.hide();
    this.resume();
    const owned = () => ({ gear: [...(s.gear.loot ?? []), ...(s.progress.unlocks?.bossLoot ?? [])], sails: s.progress.unlocks?.sails ?? [], ornaments: s.progress.unlocks?.ornaments ?? [] });
    if (!this.world.startRaid(def, ctx, { level: b.level, playerId: this.localPlayerId, firstClear: b.firstClear, conquestsBefore: this.occupation.conquests(def.id), owned })) { s.player.gold += cost; return 'Die Belagerung kann gerade nicht beginnen.'; }
    // Ein Angriff auf das Marine-Hauptquartier macht die Marine zum Feind
    if (fid === 'marine') this.shiftStanding('marine', -MARINE_RAID_PENALTY);
    this.persist();
    return null;
  }

  /** Belagerung zu Ende (Sieg oder Rückzug): Lohn und Folgen; die Welt ist schon wiederhergestellt */
  private raidEnded(info: RaidEnd) {
    const s = this.save;
    this.raidView = null;
    this.raidPanel.update(null);
    // das Wetter der Region gilt wieder (für die Belagerung war es auf „bewölkt“ gestellt)
    this.enterRegion(this.region);
    if (!s) return;
    const def = this.world.islandDefs.find((d) => d.id === info.defId);
    const name = def?.name ?? 'Die Festung';
    if (info.outcome === 'victory' && info.reward) {
      const r = info.reward;
      s.player.gold += r.gold;
      this.grantXp(r.xp, r.fame);
      s.progress.flags[`raidwon_${info.defId}`] = true;
      // Marine-Hauptquartier erobert: die Marine ist dein erbitterter Feind
      if (info.factionId === 'marine') s.progress.standing.marine = -100;
      // Persönliche Beute dieses Spielers (jeder Teilnehmer hat seinen eigenen Wurf) und die Besatzung der Insel
      const mine = info.loot.find((l) => l.participantId === this.localPlayerId);
      if (mine) this.applyRaidLoot(mine);
      const rec = def ? this.occupation.conquer(def, info.factionId ?? 'marine') : null;
      this.overlay.showBanner(`${name} erobert!`, `+${r.gold.toLocaleString('de-DE')} Gold · +${r.xp.toLocaleString('de-DE')} Erfahrung${info.route ? ` · Route ${info.route}` : ''}`);
      audio.play('win');
      audio.director?.sting('conquest');
      if (mine && rec) this.after(() => { if (this.state.is('play')) { this.state.set('pause'); this.menus.showRaidLoot({ island: name, boss: info.bossId, items: mine.items, minutes: Math.round(((rec.occupiedUntil ?? 0) - s.meta.playTime) / 60), conquests: rec.conquestCount }); } }, 2200);
    } else this.hud.toast(`Rückzug von ${name}: deine Flotte kehrt um. Die Festung steht noch.`, 4);
    this.persist();
  }

  /** Die persönliche Beute des Spielers anwenden: Gold, Erfahrung, Boss-Stücke (ins Beutel und angelegt, falls besser), Segel und Verzierungen (dauerhaft) */
  private applyRaidLoot(l: PersonalLoot) {
    const s = this.save;
    if (!s) return;
    ensureLoot(s.gear);
    s.progress.unlocks ??= emptyUnlocks();
    const u = s.progress.unlocks;
    for (const it of l.items) {
      switch (it.kind) {
        case 'gold': s.player.gold += it.amount ?? 0; break;
        case 'xp': this.grantXp(it.amount ?? 0, 0); break;
        case 'gear': { const d = EQUIP_BY_ID[it.id]; if (d) { grantLoot(s.gear, d); if (!u.bossLoot.includes(it.id)) u.bossLoot.push(it.id); } break; }
        case 'warlord': { const d = EQUIP_BY_ID[it.id]; if (d) grantLoot(s.gear, d); break; }
        case 'seal': { const f = it.id.replace('seal:', '') as FactionId; u.seals[f] = Math.min(999, (u.seals[f] ?? 0) + (it.amount ?? 0)); break; }
        case 'shard': u.shards = Math.min(9999, u.shards + (it.amount ?? 0)); break;
        case 'sail': if (!u.sails.includes(it.id)) u.sails.push(it.id); break;
        case 'ornament': if (!u.ornaments.includes(it.id)) u.ornaments.push(it.id); break;
      }
    }
    this.world.updatePlayer(this.displayLook(), this.activeStyle());
    this.applyPower();
  }

  /** Banner oben in der Mitte: Rückeroberung (immer, solange sie droht) oder die nächste besetzte Insel in der Nähe */
  private refreshOccBanner() {
    if (!this.state.is('play') || this.world.raid) { this.occBanner.update(null); return; }
    const views = this.occupation.views();
    if (!views.length) { this.occBanner.update(null); return; }
    const pos = this.world.playerPos;
    let best: (typeof views)[number] | null = null, bd = Infinity;
    for (const v of views) {
      const d = this.world.islandDefs.find((x) => x.id === v.islandId);
      if (!d) continue;
      const dist = Math.hypot(d.x - pos.x, d.z - pos.z);
      const warn = v.phase === 'endgame' && v.counter === 'inbound';
      const score = warn ? dist - 1e6 : dist;
      if ((warn || dist < 900) && score < bd) { bd = score; best = v; }
    }
    this.occBanner.update(best);
  }

  /** Besatzung einer Insel für Menüs (Hafen, Werft) */
  islandOccupation(id: string) { return this.occupation.views().find((v) => v.islandId === id) ?? null; }

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
    const pool = this.world.islandDefs.filter((i) => (i.kind === 'quiet' || i.kind === 'treasure') && !i.uncharted && !s.progress.maps.includes(i.id) && !quest.includes(i.id));
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
    if (def.repair) return this.repairAtSea(def.repair);
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

  /** Ansehen für die Ladentore: beim Hafen der Macht, in der du liegst; sonst das beste Ansehen bei irgendeiner Macht */
  private shopStanding(): number {
    const st = this.save?.progress.standing ?? {};
    return this.harborFid ? st[this.harborFid] ?? 0 : Math.max(0, ...Object.values(st).map((v) => v ?? 0));
  }

  /**
   * Das eine Tor für alle Läden (Anzeige UND Kauf fragen hier): leer = erlaubt, sonst der Grund als Text.
   * Stufe 4 ist nie käuflich (Beute), Stufe 5 nur über die Siegel-Schmiede, Stufe 3 braucht Ansehen beim Hafen.
   */
  gateText(tier: Tier, rank = 0): string {
    const s = this.save;
    if (!s) return '';
    const r = shopGate({ tier, rank, playerRank: rankIndex(s.player.fame), standing: this.shopStanding() });
    if (r.ok) return '';
    if (r.kind === 'rank') return `Rang „${rankName(s.player.faction, FAME_THRESHOLDS[r.needRank])}“ nötig.`;
    if (r.kind === 'rep') return `Ansehen „${repTier(r.needStanding).label}“ bei der Hafenmacht nötig.`;
    if (r.kind === 'beute') return 'Nicht käuflich: das gibt es nur als Beute (Grenzfestungen, Ereignisflotten, Aufträge).';
    return 'Relikte kauft man nicht: sammle Boss-Siegel und lass sie schmieden.';
  }

  /** Siegel und Splitter des Spielers */
  sealPurse(): SealPurse {
    return (this.save!.progress.unlocks ??= emptyUnlocks());
  }

  /** Rezept eines Boss-Stücks samt dem, was fehlt (Anzeige in Schmiede und Kompendium) */
  craftView(itemId: string): { recipe: Recipe; have: { seals: number; shards: number; gold: number; honor: number }; owned: boolean; reason: string } | null {
    const s = this.save, r = recipeOf(itemId);
    if (!s || !r) return null;
    const purse = this.sealPurse();
    const honor = s.progress.reputation?.honor?.[r.factionId] ?? 0;
    const owned = (s.progress.unlocks?.bossLoot ?? []).includes(itemId) || (s.gear.loot ?? []).includes(itemId);
    const chk = craftCheck(r, { gold: s.player.gold, playerRank: rankIndex(s.player.fame), honor, purse, owned });
    return { recipe: r, have: { seals: sealsOf(purse, r.factionId), shards: purse.shards, gold: s.player.gold, honor }, owned, reason: chk.ok ? '' : chk.reason };
  }

  /** Boss-Stück schmieden: Rang, Ehre, Siegel, Splitter und Gold werden geprüft und erst dann bezahlt */
  craftBossPiece(itemId: string): string {
    const s = this.save, v = this.craftView(itemId);
    const d = EQUIP_BY_ID[itemId];
    if (!s || !v || !d) return '';
    if (v.reason) return v.reason;
    payRecipe(v.recipe, this.sealPurse());
    s.player.gold -= v.recipe.gold;
    ensureLoot(s.gear);
    grantLoot(s.gear, d);
    const u = (s.progress.unlocks ??= emptyUnlocks());
    if (!u.bossLoot.includes(itemId)) u.bossLoot.push(itemId);
    audio.play('crack');
    this.world.updatePlayer(this.displayLook(), this.activeStyle());
    this.applyPower();
    this.persist();
    return `${d.n} geschmiedet!`;
  }

  /** Waffe der Stufe 5 (letzter Eintrag von WEAPONS) schmieden */
  craftWeaponView() {
    const s = this.save;
    if (!s) return null;
    const idx = WEAPONS.length - 1;
    const chk = weaponCraftCheck({ gold: s.player.gold, playerRank: rankIndex(s.player.fame), purse: this.sealPurse(), owned: s.gear.weapon >= idx });
    return { index: idx, recipe: WEAPON_RECIPE, reason: chk.ok ? '' : chk.reason };
  }

  craftWeapon(): string {
    const s = this.save, v = this.craftWeaponView();
    if (!s || !v) return '';
    if (v.reason) return v.reason;
    payWeapon(this.sealPurse());
    s.player.gold -= WEAPON_RECIPE.gold;
    s.gear.weapon = v.index;
    delete s.gear.weaponEq;
    audio.play('crack');
    this.applyPower();
    this.world.healPlayer();
    this.persist();
    return `${WEAPON_LINES[s.player.style].names[v.index] ?? WEAPONS[v.index].n} geschmiedet!`;
  }

  /**
   * Beute der Stufe 4 („Kriegsherr“): ein Stück, das der Laden nie verkauft. Fällt mit der übergebenen Chance bei Bossinseln,
   * Raid-Siegen, Seeschlachten und Legenden. Wählt Waffe/Rüstung der Schmiede (falls noch nicht erreicht) oder ein Set-Stück.
   */
  private dropWarlord(chance: number, label: string): boolean {
    const s = this.save;
    if (!s || Math.random() >= chance) return false;
    ensureLoot(s.gear);
    const wi = WEAPONS.findIndex((w) => w.tier === 4), ai = ARMOR.findIndex((a) => a.tier === 4);
    const choices: ('set' | 'weapon' | 'armor')[] = ['set', 'set', 'set', 'set'];
    if (wi >= 0 && s.gear.weapon < wi) choices.push('weapon');
    if (ai >= 0 && s.gear.armor < ai) choices.push('armor');
    const pick = choices[Math.floor(Math.random() * choices.length)];
    let text = '';
    if (pick === 'weapon') { s.gear.weapon = wi; delete s.gear.weaponEq; text = WEAPON_LINES[s.player.style].names[wi] ?? WEAPONS[wi].n; }
    else if (pick === 'armor') { s.gear.armor = ai; delete s.gear.armorEq; text = ARMOR[ai].n; }
    else {
      const d = rollGearByTier(4, s.gear.loot!);
      if (!d || !grantLoot(s.gear, d)) return false;
      text = d.n;
    }
    audio.play('shard');
    this.after(() => this.overlay.showBanner(`Kriegsherren-Beute: ${text}`, `${label} · Stufe 4 (${TIER_DEFS[4].grade})`), 1400);
    this.world.updatePlayer(this.displayLook(), this.activeStyle());
    this.applyPower();
    this.persist();
    return true;
  }

  /** Verbrauchsgut kaufen (Proviant gibt es weiter über buyPotions) */
  buyItem(id: string): string {
    const s = this.save, def = CONSUMABLE_BY_ID[id];
    if (!s || !def) return '';
    const gate = this.gateText(def.tier);
    if (gate) return gate;
    if (itemCount(s.gear, id) >= this.bagMax(def)) return 'Deine Taschen sind voll.';
    const price = this.priceAt(def.price);
    if (s.player.gold < price) return 'Nicht genug Gold.';
    s.player.gold -= price;
    addItem(s.gear, id, 1, this.bagMax(def));
    // erster Kauf: gleich in einen freien Platz der Schnellleiste legen
    const bar = s.gear.bar ?? [];
    if (!bar.includes(id)) { const free = bar.indexOf(null); if (free >= 0) bar[free] = id; }
    this.persist();
    return `${def.n} gekauft.`;
  }

  /** Ausrüstungsstück (Hände, Beine, Füße, Nebenhand) kaufen und gleich anlegen */
  buyPiece(id: string): string {
    const s = this.save, d = GEAR_BY_ID[id];
    if (!s || !d) return '';
    ensureGear(s.gear);
    if (s.gear.owned!.includes(id)) return '';
    const gate = this.gateText(d.tier, d.rank);
    if (gate) return gate;
    if (s.player.gold < d.price) return `Dafür fehlen ${d.price - s.player.gold} Gold.`;
    s.player.gold -= d.price;
    s.gear.owned!.push(id);
    s.gear.worn![d.slot] = id;
    if (d.slot !== 'offhand') (s.gear.outfit ??= {})[d.slot] = null;
    this.world.updatePlayer(this.displayLook(), this.activeStyle());
    this.applyPower();
    this.persist();
    return `${d.n} gekauft und angelegt.`;
  }

  /** Rüstungsteil eines Sets (Ausrüster) kaufen und gleich anlegen */
  buyLoot(id: string): string {
    const s = this.save, d = lootDef(id);
    if (!s || !d) return '';
    ensureLoot(s.gear);
    if (s.gear.loot!.includes(id)) return '';
    const price = d.price ?? 0;
    const gate = this.gateText(d.tier ?? 1);
    if (gate) return gate;
    if (s.player.level < (d.level ?? 1)) return `Stufe ${d.level} nötig.`;
    if (s.player.gold < price) return `Dafür fehlen ${price - s.player.gold} Gold.`;
    s.player.gold -= price;
    s.gear.loot!.push(id);
    wearLoot(s.gear, id);
    this.world.updatePlayer(this.displayLook(), this.activeStyle());
    this.applyPower();
    this.persist();
    return `${d.n} gekauft und angelegt.`;
  }

  /** Eigene Farben eines Stücks (Haupt-, Zierfarbe); null = Werksfarben */
  dyeLoot(id: string, colors: [string, string] | null) {
    const s = this.save;
    if (!s || !lootDef(id)) return;
    ensureLoot(s.gear);
    if (colors) s.gear.dyes![id] = colors; else delete s.gear.dyes![id];
    this.world.updatePlayer(this.displayLook(), this.activeStyle());
    this.persist();
  }

  /** Kopfbedeckung kaufen und gleich aufsetzen */
  buyHead(id: string): string {
    const s = this.save, h = HEAD_BY_ID[id];
    if (!s || !h || s.gear.heads?.includes(id)) return '';
    const gate = this.gateText(h.tier, h.rank);
    if (gate) return gate;
    if (s.player.gold < h.price) return `Dafür fehlen ${h.price - s.player.gold} Gold.`;
    s.player.gold -= h.price;
    (s.gear.heads ??= []).push(id);
    s.gear.head = id;
    (s.gear.outfit ??= {}).head = null;
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
    const gate = this.gateText(item.tier, item.rank);
    if (gate) return gate;
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
    const want = Math.min(n, PROVIANT.max - s.gear.potions);
    const afford = Math.min(want, Math.floor(s.player.gold / PROVIANT.price));
    if (want <= 0) return 'Deine Taschen sind voll.';
    if (afford <= 0) return 'Nicht genug Gold.';
    s.gear.potions += afford;
    s.player.gold -= afford * PROVIANT.price;
    this.persist();
    return `${afford} × ${PROVIANT.n} gekauft.`;
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
    const price = this.restPrice();
    if (s.player.gold < price) return `Ein Bett kostet ${price} Gold.`;
    s.player.gold -= price;
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
    // Belagerung: Landungsplätze (Stern), Seetor (Krone), Batterien (rot), Burg (Totenkopf)
    if (this.raidView) for (const m of this.raidView.marks) out.push({ x: m.x, z: m.z, kind: m.kind === 'slot' ? 'target' : m.kind === 'gate' ? 'citadel' : m.kind === 'battery' ? 'enemy' : 'boss', name: m.name });
    // Besetzte Inseln (goldene Fahne) und die anrückende Rückeroberungs-Flotte (Alarm)
    for (const p of this.occupation.pois()) out.push({ x: p.x, z: p.z, kind: p.kind, name: p.name, color: p.color });
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
    // auf See: Marine-Grenzfestungen und die sechs großen Außenfestungen (immer sichtbar: Wahrzeichen der Weltordnung)
    for (const d of this.world.islandDefs) {
      if (d.kind === 'marinefort' && d.marine === 'border') out.push({ x: d.x, z: d.z, kind: 'fort', name: d.name, color: FACTIONS.marine.color });
      else if (d.kind === 'citadel' || d.marine === 'hq') out.push({ x: d.x, z: d.z, kind: 'citadel', name: d.name, color: d.marine === 'hq' ? '#F4F7FC' : d.factionId ? FACTIONS[d.factionId].color : undefined });
    }
    // Seeschlachten an den Grenzen (Welt-Ereignis): gekreuzte Kanonen auf Kompass, Minikarte und Seekarte
    for (const b of this.world.battleMarks) out.push({ x: b.x, z: b.z, kind: 'battle', name: `Seeschlacht ${FACTIONS[b.a].name} gegen ${FACTIONS[b.b].name}` });
    // Boss-Inseln und Inseln mit Auftragspersonen, nur entdeckte
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
      // unkartierte Geheim-Inseln (4.3B) erscheinen erst, wenn sie entdeckt sind
      islands: this.world.islandDefs.filter((i) => !i.uncharted || this.world.discovered.has(i.id)),
      regions: REGIONS,
      known: (id) => this.world.discovered.has(id),
      islandMarks: this.questIslandMarks(),
      markers: { ...this.mapMarkers(), pois: undefined },
      shape: this.mapOpts.shape,
      standing: this.save?.progress.standing,
      battles: this.world.battleMarks,
      occupations: this.occupation.views().map((v) => {
        const d = this.world.islandDefs.find((x) => x.id === v.islandId);
        const rec = this.occupation.record(v.islandId);
        const f = d && rec && v.counter === 'inbound' ? this.occupation.fleetSpot(d, rec, this.save?.meta.playTime ?? 0) : undefined;
        return { id: v.islandId, x: d?.x ?? 0, z: d?.z ?? 0, r: d?.r ?? 100, name: v.name, text: v.text, endgame: v.phase === 'endgame', fleet: f ? { x: f.x, z: f.z } : undefined };
      }),
      conquests: Object.fromEntries(this.occupation.conquered.map((r) => [r.islandId, r.conquestCount])),
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

  /** Anzeige der Schiffstafel (Rumpf, Segel, Crew mit Aufschlüsselung, Geschützdeck, Munition) */
  private seaView(sh: SeaWorld['ship']): SeaView {
    const pools = sh.sim.crew.pools;
    const troops = pools.truppen && pools.truppen.max > 0 ? pools.truppen : null;
    return {
      name: sh.cls.n, level: SAIL_LEVELS[sh.sailLevel].n, hull: sh.hull / sh.maxHull, sail: sh.sail, crew: sh.crew, ammo: sh.ammo,
      reloadL: sh.reloadL / this.world.reloadTime, reloadR: sh.reloadR / this.world.reloadTime, fire: sh.fire > 0,
      repair: sh.sim.repair ? 1 - sh.sim.repair.left / sh.sim.repair.total : null,
      sailors: pools.matrosen ?? { n: 0, max: 0 }, troops, tip: shipTooltip(sh.sim),
    };
  }

  /** Kompassleiste: Punkte mit Peilung (Welt) und Entfernung */
  private updateCompass() {
    const on = this.state.is('play') && !!this.save;
    this.compass.setVisible(on);
    if (!on) return;
    const pos = this.world.playerPos;
    const list: CompassPoi[] = [];
    const add = (x: number, z: number, kind: CompassPoi['kind'], color?: string) => {
      const dx = x - pos.x, dz = z - pos.z;
      list.push({ bearing: Math.atan2(dx, dz), dist: Math.hypot(dx, dz), kind, color });
    };
    const foot = this.world.mode === 'foot';
    for (const p of this.mapPois()) if (foot ? Math.hypot(p.x - pos.x, p.z - pos.z) < (p.kind === 'enemy' ? 70 : 400) : p.kind === 'fort' ? Math.hypot(p.x - pos.x, p.z - pos.z) < 2600 : true) add(p.x, p.z, p.kind, p.color);
    if (!foot) for (const e of this.world.enemyShips) if (!e.ally && Math.hypot(e.x - pos.x, e.z - pos.z) < 300) add(e.x, e.z, e.legend ? 'boss' : 'enemy');
    const t = this.questTarget();
    if (t) add(t.x, t.z, 'target');
    this.compass.update(this.world.cameraYaw, list, sectorLabel(pos.x, pos.z));
  }

  /** Ansehen bei einer Weltmacht ändern (−100 … 100); wechselt die Haltung der Marine, meldet das eine Nachricht */
  private shiftStanding(id: FactionId, delta: number) {
    const s = this.save;
    if (!s) return;
    s.progress.standing ??= {};
    const before = s.progress.standing[id] ?? 0, after = clampStanding(before + delta);
    s.progress.standing[id] = after;
    if (id === 'marine' && marineStance(before) !== marineStance(after)) {
      const st = marineStance(after);
      this.hud.toast(`Die Marine ist dir jetzt ${STANCE_LABEL[st]} gesinnt${st === 'feindlich' ? ' – ihre Schiffe und Festungen greifen an!' : st === 'verbuendet' ? ' – kein Angriff, ihre Hauptquartiere sind tabu.' : '.'}`, 4);
    }
    // Dienststatus der Marine: ihre Schiffe helfen im Kampf, Weißwacht ist dein Stützpunkt
    if (id === 'marine' && hasService(before) !== hasService(after)) this.hud.toast(hasService(after) ? 'Marine-Dienststatus erreicht: Ihre Schiffe helfen dir im Kampf, Weißwacht ist dein sicherer Stützpunkt.' : 'Der Marine-Dienststatus ist verloren.', 5);
    // andere Mächte: Stufenwechsel melden (ab „Freundlich“ passieren ihre Schiffe friedlich)
    if (id !== 'marine' && delta !== 0 && repTier(before).id !== repTier(after).id) {
      this.hud.toast(`Ansehen bei ${FACTIONS[id].name}: ${repTier(after).label}${isPeaceful(after) && !isPeaceful(before) ? ' – ihre Schiffe lassen dich in ihrem Sektor friedlich passieren.' : !isPeaceful(after) && isPeaceful(before) ? ' – die friedliche Durchfahrt ist vorbei.' : '.'}`, 4);
    }
  }

  // ---------- Fraktions-Ehre und Ruf (Seeschlachten an den Grenzen) ----------

  /** Macht des Hafens, in dem der Spieler gerade liegt (Rabatt nach Ansehen); null auf See und in Ankerglück */
  private harborFid: FactionId | null = null;
  /** Insel des geöffneten Hafens (Markt, Kontor) */
  harborDef: IslandDef | null = null;

  /** Hafen-Tarif der Macht, in deren Hafen du liegst (Ansehen und Ehre: bis −25 %, feindlich: Schwarzmarkt +35 %, ab −60 gesperrt); Freihäfen: Grundpreis */
  tariff(fid: FactionId | null = this.harborFid): Tariff {
    const s = this.save;
    return tariffOf(fid ? s?.progress.standing?.[fid] ?? 0 : 0, fid ? s?.progress.reputation?.honor?.[fid] ?? 0 : 0, !!fid);
  }
  /** Faktor auf Werft-Preise (Reparatur, Ausbau, Munition): Tarif minus Baupläne, zwischen 0,4 und 1,6 */
  private yardK() { return Math.min(1.6, Math.max(0.4, this.tariff().factor - blueprintDiscount(this.save?.progress.reputation?.blueprints ?? []))); }
  /** Faktor auf Heuer, Truppen, Bett und Waren */
  private crewK() { return this.tariff().factor; }
  /** Preis im Laden dieses Hafens: Grundpreis mal Tarif, aufgerundet */
  priceAt(base: number) { return Math.max(base > 0 ? 1 : 0, Math.ceil(base * this.crewK())); }
  restPrice() { return Math.max(1, Math.round(REST_PRICE * this.crewK())); }

  /** Anzeige im Hafenmenü: Ansehen bei der Hafenmacht und was es einbringt */
  harborStanding() {
    const f = this.harborFid;
    if (!f) return null;
    const st = this.save?.progress.standing?.[f] ?? 0;
    return { name: FACTIONS[f].name, color: FACTIONS[f].color, tier: repTier(st).label, discount: Math.max(0, this.tariff().discount), surcharge: Math.max(0, -this.tariff().discount), blueprints: blueprintDiscount(this.save?.progress.reputation?.blueprints ?? []) };
  }

  get inHarbor() { return !!this.harborFid; }

  /** Daten für das Fenster „Ruf & Ehre“ */
  reputationView() {
    const s = this.save;
    const rep = s?.progress.reputation ?? emptyReputation();
    return {
      rows: FACTION_IDS.map((id) => {
        const st = s?.progress.standing?.[id] ?? 0;
        return { id, name: FACTIONS[id].name, color: FACTIONS[id].color, standing: st, tier: repTier(st).label, honor: rep.honor[id] ?? 0, title: honorTitle(rep.honor[id] ?? 0), bounty: rep.bounty[id] ?? 0, discount: harborDiscount(st) };
      }),
      service: hasService(s?.progress.standing?.marine ?? 0),
      blueprints: [...rep.blueprints],
      blueprintDiscount: blueprintDiscount(rep.blueprints),
      battles: rep.battles,
      log: [...rep.log].reverse(),
      gold: s?.player.gold ?? 0,
    };
  }

  /** Kopfgeld bei einer Macht bezahlen (nur im Hafen): die Jäger lassen von dir ab, das Ansehen erholt sich etwas */
  payBounty(f: FactionId): string {
    const s = this.save;
    const rep = s?.progress.reputation;
    if (!s || !rep) return '';
    const b = rep.bounty[f] ?? 0;
    if (b <= 0) return 'Auf dich ist kein Kopfgeld ausgesetzt.';
    if (!this.harborFid) return 'Kopfgeld lässt sich nur in einem Hafen begleichen.';
    if (s.player.gold < b) return `Das Kopfgeld beträgt ${b} Gold – dafür fehlen ${b - s.player.gold}.`;
    s.player.gold -= b;
    delete rep.bounty[f];
    this.shiftStanding(f, STANDING_EVENTS.bountyPaid);
    audio.play('coin');
    this.persist();
    return `Kopfgeld bei ${FACTIONS[f].name} beglichen (${b} Gold).`;
  }

  /** Kopfgeld senken (zum Beispiel wenn ein Jäger versenkt wurde) */
  private payBountyDown(f: FactionId, n: number) {
    const rep = this.save?.progress.reputation;
    const b = rep?.bounty[f] ?? 0;
    if (!rep || b <= 0) return;
    if (b - n <= 0) delete rep.bounty[f]; else rep.bounty[f] = b - n;
  }

  private battleStarted(m: BattleMark, where: string) {
    this.hud.toast(`⚔ Seeschlacht: ${FACTIONS[m.a].name} gegen ${FACTIONS[m.b].name} im ${where}! Rauch und Geschützdonner am Horizont.`, 6);
    audio.play('bell', 0.5);
  }

  /**
   * Eine Seeschlacht, in die der Spieler eingegriffen hat, ist vorbei: Bilanz auswerten. Nur eine Seite beschossen = Partei ergriffen
   * (Ehre und Ansehen beim Verbündeten; die andere Macht ist verstimmt); beide Seiten = Doppelspiel (Doppel-Loot, Waren, Bauplan, aber
   * Ansehensverlust bei beiden Mächten und der Marine, Kopfgeld und Jäger).
   */
  private battleEnded(r: BattleResult) {
    const s = this.save;
    if (!s) return;
    const rep = (s.progress.reputation ??= emptyReputation());
    const o = battleOutcome(r.stats, rep.blueprints);
    if (o.verdict.kind === 'none') return;
    const name = (f: string) => FACTIONS[f as FactionId].name;
    const lines: string[] = [];
    applyOutcome(rep, o, (f, d) => this.shiftStanding(f, d), s.meta.playTime, o.text);
    for (const [f, d] of Object.entries(o.honor)) lines.push(`Ehre ${name(f)} +${d}`);
    for (const [f, d] of Object.entries(o.standing)) lines.push(`${name(f)} ${d > 0 ? '+' : '−'}${Math.abs(d as number)} Ansehen`);
    if (o.verdict.kind === 'both') {
      const got: string[] = [];
      for (let i = 0; i < o.goods; i++) {
        const id = ['segeltuch', 'planken', 'proviant'][i % 3];
        if (addItem(s.gear, id, 1, this.bagMax(CONSUMABLE_BY_ID[id])) > 0) got.push(CONSUMABLE_BY_ID[id].n); else s.player.gold += 60;
      }
      if (got.length) lines.push(`Waren: ${got.join(', ')}`);
      if (o.blueprint) lines.push(`Bauplan ${name(o.blueprint.replace('bauplan_', ''))}: Werft −${Math.round(REP.blueprintDiscount * 100)} %`);
      lines.push(`Kopfgeld ${Object.entries(o.bounty).map(([f, d]) => `${name(f)} ${d}`).join(', ')}`);
      this.world.naval?.callHunters();
    }
    const [A, B] = r.sides;
    this.overlay.showBanner(o.verdict.kind === 'both' ? 'Doppelspiel!' : 'Partei ergriffen!', o.verdict.kind === 'both' ? `${name(A)} und ${name(B)} jagen dich · Doppel-Loot` : o.text);
    this.hud.toast(lines.join(' · '), 8);
    audio.play(o.verdict.kind === 'both' ? 'crack' : 'win');
    if (this.playerRank >= 5) this.dropWarlord(o.verdict.kind === 'both' ? 0.25 : 0.15, 'Seeschlacht an der Grenze');
    this.persist();
    this.inventoryUi?.refresh();
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
        angle = wrapAngle(rel);
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
    this.world.clearShipPreview();
    const cls = SHIP_CLASSES[tier];
    // Wechsel zwischen eigenen Schiffen repariert nicht umsonst: der Zustand bleibt, nur ein neu gekauftes Schiff ist heil
    let hull = Math.max(0.05, this.world.ship.hull / Math.max(1, this.world.ship.maxHull));
    let tradeMsg = '';
    if (!s.ship.owned.includes(tier)) {
      if (rankIndex(s.player.fame) < cls.rank) return `Rang „${rankName(s.player.faction, FAME_THRESHOLDS[cls.rank])}“ nötig.`;
      if (s.player.gold < cls.price) return `Dafür fehlen ${cls.price - s.player.gold} Gold.`;
      s.player.gold -= cls.price;
      // Inzahlungnahme: die Werft erstattet die Hälfte des Goldwerts der Ausbauten des bisherigen Schiffs; es wird dafür wieder auf Stufe 1 zurückgebaut
      const oldName = SHIP_CLASSES[s.ship.tier].n;
      const { refund } = applyShipPurchase(s.ship, tier);       // das neue Schiff beginnt auf Stufe 1 und muss in der Werft ausgebaut werden
      if (refund > 0) {
        s.player.gold += refund;
        tradeMsg = ` Inzahlungnahme: ${fmtInt(refund)} Gold für die Ausbauten deiner ${oldName}.`;
      }
      hull = 1;
    }
    // Ein Schiff der Flotte, das Flaggschiff wird, verlässt die Flotte (jede Klasse fährt nur einmal) und bringt seinen Zustand mit
    const fl = this.fleet(), rec = fleetShip(fl, fleetIdOf(tier));
    if (rec) { hull = Math.max(0.05, rec.hp); releaseShip(fl, rec.fleetShipId); }
    s.ship.hull = hull;
    s.ship.tier = tier;
    this.world.setShip(tier, s.ship.look, s.ship.ammo, s.ship.hull, s.player.faction);
    this.applyPower();
    this.syncFleet();
    this.persist();
    return `${cls.n} bereit zum Auslaufen!${tradeMsg}${rec ? ' Sie verlässt die Flotte.' : ''}`;
  }

  shipyardLook(look: ShipLook) {
    const s = this.save;
    if (!s) return;
    this.world.clearShipPreview();
    s.ship.look = look;
    this.world.setShip(s.ship.tier, look, s.ship.ammo, this.world.ship.hull / this.world.ship.maxHull, s.player.faction);
    this.persist();
  }

  /** Erbeutete Fraktions-Segel und Verzierungen (Raid-Beute, dauerhaft): Segelmuster, Wappen und Flagge der Macht bzw. Galionsfigur und Zierstreifen */
  get shipUnlocks() { return this.save?.progress.unlocks ?? emptyUnlocks(); }
  applyFactionSail(fid: FactionId | null) {
    const s = this.save;
    if (!s) return;
    const F = fid ? FACTIONS[fid] : null;
    this.shipyardLook({ ...s.ship.look, power: F ? fid! : undefined, sail: F ? F.ship.sail : s.ship.look.sail });
  }
  applyFactionOrnament(fid: FactionId) {
    const s = this.save;
    if (!s) return;
    const F = FACTIONS[fid];
    this.shipyardLook({ ...s.ship.look, figurehead: F.ship.figurehead, stripe: F.ship.stripe });
  }

  /** Werft-Reparatur (100 %): wächst mit der Schiffsgröße (Länge · Breite) und dem Schadensgrad, dazu der Hafen-Tarif */
  repairCost() {
    const sh = this.world.ship, c = SHIP_CLASSES[this.save?.ship.tier ?? 0];
    return yardRepairCost({ L: c.L, W: c.W, hullMax: sh.maxHull, hullFrac: sh.hull / sh.maxHull, sailMax: sh.sim.sail.max, sailFrac: sh.sim.sail.hp / Math.max(1, sh.sim.sail.max), tariff: this.yardK() });
  }

  /** Preis, die fehlende Besatzung aufzufüllen */
  crewRefillCost() {
    const sh = this.world.ship;
    return Math.ceil(missingHeads(sh.sim.crew, 'matrosen') * crewPricePerHead(this.save?.ship.tier ?? 0) * this.crewK());
  }

  /** Taverne und Hafen: Seeleute für das Schiff anheuern (Crew-%). Gold je Kopf, wächst mit der Schiffsklasse. */
  refillCrew(): string {
    const s = this.save;
    if (!s) return '';
    const sh = this.world.ship;
    const miss = missingHeads(sh.sim.crew, 'matrosen');
    if (miss <= 0) return 'Deine Mannschaft ist vollzählig.';
    const per = crewPricePerHead(s.ship.tier) * this.crewK();
    // so viele Köpfe, wie das Gold hergibt (mindestens einer, sonst Hinweis)
    const heads = Math.min(miss, Math.floor(s.player.gold / per));
    if (heads <= 0) return `Ein Seemann kostet ${Math.ceil(per)} Gold Handgeld.`;
    const got = sh.requestCrewRefill({ type: 'crewRefill', entityId: this.world.playerEntityId, shipId: sh.entityId, heads, pool: 'matrosen' });
    s.player.gold -= Math.ceil(got * per);
    audio.play('level', 0.5);
    this.persist();
    const h = sh.sim.crew.pools.matrosen;
    return missingHeads(sh.sim.crew, 'matrosen') <= 0 ? `Die Mannschaft ist vollzählig: ${Math.round(h.n)} Seeleute, Crew 100 %.` : `${Math.round(got)} Seeleute angeheuert (Crew ${Math.round(crewFrac(sh.sim.crew) * 100)} %) – mehr kann das Gold nicht bezahlen.`;
  }

  /**
   * Segel und Rumpf auf See flicken (Taste G / Knopf „Flicken“): nimmt Segeltuch, sonst Holzplanken, sonst ein Notsegel, wenn das Tuch fast
   * ganz fehlt. Die Crew arbeitet je nach Crew-% schneller oder langsamer; die Reparatur zählt als Absicht des Spielers an sein Schiff.
   */
  repairAtSea(matId?: RepairMaterial): boolean {
    const s = this.save;
    if (!s || !this.state.is('play')) return false;
    if (this.world.mode !== 'sail') { this.hud.toast('Flicken geht nur an Bord auf See.'); return false; }
    const sh = this.world.ship;
    if (!sh.alive) return false;
    if (sh.sim.repair) { this.hud.toast('Die Crew arbeitet schon am Schaden.'); return false; }
    const order: RepairMaterial[] = matId ? [matId] : sh.sail < 0.999 ? ['segeltuch', 'planken', 'notsegel'] : ['planken'];
    const who = this.world.playerEntityId;
    for (const m of order) {
      if (!needsRepair(sh.sim, m)) continue;
      const own = m === 'notsegel' ? 1 : itemCount(s.gear, m);
      if (own <= 0) continue;
      if (!sh.requestRepair({ type: 'sailRepair', entityId: who, shipId: sh.entityId, material: m })) continue;
      if (m !== 'notsegel') takeItem(s.gear, m);
      const job = sh.sim.repair as ShipSimState['repair'];
      const t = job?.total ?? 0;
      this.hud.toast(m === 'notsegel' ? `Die Crew näht ein Notsegel (${Math.round(t)} s).` : `Die Crew flickt mit ${REPAIR_MATERIALS[m].label} (${Math.round(t)} s) – noch ${itemCount(s.gear, m)}.`);
      audio.play('sail');
      this.inventoryUi?.refresh();
      return true;
    }
    this.hud.toast(sh.sail >= 0.999 && sh.hull >= sh.maxHull - 0.5 ? 'Nichts zu flicken.' : 'Kein Segeltuch oder Holz an Bord – kaufe welches auf dem Markt (Hafen).');
    return false;
  }

  // ---------- Flotte: Begleitschiffe (data/playerFleet.ts) ----------

  /** Die Flotte im Spielstand (fehlt in alten Ständen: wird angelegt) */
  fleet(): FleetState {
    const s = this.save!;
    return (s.fleet ??= emptyFleet());
  }

  /** Freie Begleitschiff-Plätze nach Rang (0 … 3) */
  get fleetSlotCount() { return fleetSlots(this.playerRank); }

  private fleetCtx(): FleetCtx {
    const s = this.save!;
    return { owned: s.ship.owned, flagship: s.ship.tier, evo: s.ship.evo, look: s.ship.look, slots: this.fleetSlotCount };
  }

  /** Aktive Flotte und Befehl an die Seewelt melden; `reset` entfernt vorher alle Flottenschiffe (anderer Spielstand geladen) */
  syncFleet(reset = false) {
    if (!this.save) return;
    const f = this.fleet();
    this.world.naval?.setFleet(f.ships, f.order, reset);
  }

  /** Rumpf und Segel der ausgelaufenen Schiffe in die Einträge übernehmen (vor dem Speichern und vor jeder Anzeige) */
  private syncFleetState() {
    const f = this.save?.fleet, nav = this.world.naval;
    if (!f || !nav) return;
    for (const st of nav.fleetStatus()) {
      const rec = fleetShip(f, st.id);
      if (rec && rec.status === 'active' && st.alive) { rec.hp = Math.max(0.05, st.hp); rec.sailHp = st.sailHp; }
    }
  }

  /** Ein Schiff der Flotte ist gesunken: die Besatzung rettet sich, das Wrack wird in den Hafen geschleppt (eingemottet, kaum Rumpf); ein Begleitschiff geht nie verloren */
  private onFleetLost(id: string) {
    const f = this.save?.fleet;
    const rec = f ? fleetShip(f, id) : undefined;
    if (!f || !rec) return;
    towShip(f, id);
    this.hud.toast(`Die ${SHIP_CLASSES[rec.shipClass].n} ist gesunken – die Besatzung wurde gerettet, das Wrack wird in den Hafen geschleppt (Rumpf ${Math.round(TOWED_HP * 100)} %).`, 6);
    this.syncFleet();
    this.persist();
  }

  /** Flottenbefehl geben (Tasten, Knöpfe der Tafel); meldet ihn kurz an */
  setFleetOrder(order: FleetOrder, announce = true) {
    if (!this.save) return;
    const f = this.fleet();
    if (f.order === order) { if (announce) this.hud.toast(`Flotte: ${FLEET_ORDERS.find((o) => o.id === order)!.label} (gilt schon)`, 1.6); return; }
    f.order = order;
    this.syncFleet();
    if (announce) { audio.play('ui'); this.hud.toast(`Flotte: ${FLEET_ORDERS.find((o) => o.id === order)!.label}`, 2.4); }
  }

  /** Ein besessenes Schiff in die Flotte einsetzen (braucht einen freien Platz) */
  fleetAssign(shipClass: number): string {
    const s = this.save;
    if (!s) return '';
    const f = this.fleet();
    const r = assignShip(f, shipClass, this.fleetCtx());
    if (!r.ok) return r.reason;
    this.syncFleet();
    this.persist();
    const rec = fleetShip(f, fleetIdOf(shipClass))!;
    return `${SHIP_CLASSES[shipClass].n} fährt jetzt in deiner Flotte (Sold und Wartung ${fmtInt(Math.round(fleetShipUpkeep(rec).daily))} Gold am Tag).`;
  }

  fleetActivate(id: string): string {
    if (!this.save) return '';
    const r = activateShip(this.fleet(), id, this.fleetSlotCount);
    if (!r.ok) return r.reason;
    this.syncFleet();
    this.persist();
    return 'Das Schiff läuft wieder aus.';
  }

  fleetDock(id: string): string {
    if (!this.save) return '';
    this.syncFleetState();
    const r = dockShip(this.fleet(), id);
    if (!r.ok) return r.reason;
    this.syncFleet();
    this.persist();
    return 'Eingemottet: das Schiff liegt im Hafen und kostet keinen Sold.';
  }

  fleetRelease(id: string): string {
    if (!this.save) return '';
    this.syncFleetState();
    const r = releaseShip(this.fleet(), id);
    if (!r.ok) return r.reason;
    this.syncFleet();
    this.persist();
    return 'Aus der Flotte genommen (das Schiff bleibt in deinem Besitz).';
  }

  /** Werft-Preis, ein Begleitschiff voll zu reparieren (Rumpf und Segel, wie beim Flaggschiff) */
  fleetRepairCost(rec: FleetShipRecord): number {
    const c = SHIP_CLASSES[rec.shipClass], st = evoStats(rec.evo);
    return yardRepairCost({ L: c.L, W: c.W, hullMax: c.hp * st.hullHpK, hullFrac: rec.hp, sailMax: Math.round(c.hp * SAIL_HP_PER_HULL * st.sailHpK), sailFrac: rec.sailHp, tariff: this.yardK() });
  }

  fleetRepair(id: string): string {
    const s = this.save;
    if (!s) return '';
    this.syncFleetState();
    const rec = fleetShip(this.fleet(), id);
    if (!rec) return 'Dieses Schiff gehört nicht zur Flotte.';
    const cost = this.fleetRepairCost(rec);
    if (cost <= 0) return 'Das Schiff ist in bestem Zustand.';
    if (s.player.gold < cost) return `Reparatur kostet ${fmtInt(cost)} Gold.`;
    s.player.gold -= cost;
    rec.hp = 1; rec.sailHp = 1;
    this.world.naval?.fleetShipOf(id)?.repair(1);
    this.persist();
    return `${SHIP_CLASSES[rec.shipClass].n} repariert (${fmtInt(cost)} Gold).`;
  }

  /** Alles, was die Flotten-Ansicht der Werft und des Hafens zeigt */
  fleetView() {
    const s = this.save!;
    this.syncFleetState();
    const f = this.fleet(), slots = this.fleetSlotCount, faction = s.player.faction;
    const row = (shipClass: number, rec: FleetShipRecord | null) => {
      const evo = rec?.evo ?? evolutionOf(s.ship, shipClass);
      return {
        id: fleetIdOf(shipClass), shipClass, name: SHIP_CLASSES[shipClass].n, status: (rec ? rec.status : 'free') as 'free' | 'active' | 'docked',
        evo, evoTotal: shipEvolutionTier(evo), hp: rec?.hp ?? 1, sailHp: rec?.sailHp ?? 1,
        upkeep: fleetShipUpkeep({ shipClass, evo }), repairCost: rec ? this.fleetRepairCost(rec) : 0,
      };
    };
    const rows = [...f.ships.map((r) => row(r.shipClass, r)), ...assignableClasses(s.ship.owned, s.ship.tier, f).map((c) => row(c, null))];
    const total = this.upkeepView().daily;
    const fleetDaily = fleetUpkeepDaily(f);
    return {
      slots, used: activeCount(f), free: hasFreeSlot(f, slots), order: f.order, rows, fleetDaily, totalDaily: total, baseDaily: total - fleetDaily, gold: s.player.gold,
      unlocks: FLEET_UNLOCK_RANKS.map((r, i) => ({ slot: i + 1, rank: r, rankName: rankName(faction, FAME_THRESHOLDS[r]), open: i < slots })),
      flagship: SHIP_CLASSES[s.ship.tier].n,
    };
  }

  /** Tafel der Flottenbefehle über der Schnellleiste: Schiffe mit Rumpfbalken, aktiver Befehl, Tasten (Tastatur oder Gamepad-Kombination); nur auf See und mit aktiven Schiffen */
  private updateFleetHud(sailing: boolean) {
    const f = this.save?.fleet;
    const act = f ? activeShips(f) : [];
    if (!sailing || !f || act.length === 0) { this.hud.setFleet(null); return; }
    const pad = this.input.lastDevice === 'gamepad';
    const b = this.input.getKeyBindings();
    const keys = FLEET_ORDERS.map((o) => { const a = FLEET_ORDER_ACTIONS[o.id]; return pad ? PAD_CHORD_LABEL[a] ?? '' : this.input.keyLabel(b[a][0] ?? ''); });
    const live = this.world.naval?.fleetStatus() ?? [];
    this.hud.setFleet({
      ships: act.map((r) => { const st = live.find((x) => x.id === r.fleetShipId); return { name: SHIP_CLASSES[r.shipClass].n, hull: st ? st.hp : r.hp, alive: st ? st.alive : true }; }),
      order: f.order, keys, anchored: !!this.world.naval?.fleetAnchored,
    });
  }

  // ---------- Ökonomie: Unterhalt, Handel, Kontor ----------

  /** Der Wirtschaftszustand im Spielstand (fehlt in alten Ständen: wird angelegt) */
  eco(): EconomyState {
    const s = this.save!;
    return (s.progress.economy ??= emptyEconomy(s.meta.playTime));
  }

  /** Wer wird bezahlt: Köpfe der Seeleute und Truppen, alle angeheuerten Offiziere und die Klasse des Schiffs */
  upkeepInput() {
    const s = this.save!;
    const crew = this.world.ship.sim.crew;
    return { tier: s.ship.tier, seamen: poolHeads(crew, 'matrosen'), troops: poolHeads(crew, 'truppen'), officers: s.crew.hired.length, evoTier: shipEvolutionTier(evolutionOf(s.ship, s.ship.tier)), fleet: fleetUpkeepList(this.fleet()) };
  }

  /** Sold und Proviant: Aufstellung für Kontor und HUD */
  upkeepView() {
    const eco = this.eco(), s = this.save!;
    const u = upkeepOf(this.upkeepInput());
    return { ...u, arrears: eco.arrears, morale: eco.morale, efficiency: moraleEfficiency(eco.morale), nextIn: Math.max(0, eco.nextPay - s.meta.playTime), gold: s.player.gold, heat: eco.heat };
  }

  private upkeepT = 0;
  /** Je Bild: Hitze sinkt, alle halbe Sekunde werden Zahltage geprüft (Sold, Moral, Vorwarnung) und die HUD-Zeile aufgefrischt */
  private stepEconomy(dt: number) {
    const s = this.save;
    if (!s) return;
    const eco = this.eco();
    decayHeat(eco, dt);
    this.upkeepT -= dt;
    if (this.upkeepT > 0) return;
    this.upkeepT = 0.5;
    const r = stepUpkeep(eco, s.meta.playTime, s.player.gold, this.upkeepInput());
    if (r.spent > 0) s.player.gold -= r.spent;
    for (const e of r.events) {
      if (e.type === 'warn') this.hud.toast(`Sold fällig in Kürze: ${fmtInt(e.due)} Gold – dein Gold reicht nicht! Sonst sinkt die Moral.`, 6);
      else if (e.type === 'short') this.hud.toast(`Sold nicht bezahlt (Rückstand ${fmtInt(e.arrears)} Gold): die Crew murrt, die Moral sinkt.`, 6);
    }
    if (r.missed > 0) for (const id of s.crew.hired) s.crew.loyalty[id] = Math.max(0, (s.crew.loyalty[id] ?? 0) - UPKEEP.loyaltyMiss * r.missed);
    this.world.ship.moraleK = moraleEfficiency(eco.morale);
    const up = upkeepOf(this.upkeepInput());
    const left = Math.max(0, eco.nextPay - s.meta.playTime);
    const low = s.player.gold < up.perPeriod + eco.arrears;
    this.hud.setUpkeep({
      text: `Sold ${fmtInt(Math.round(up.daily))}/Tag`,
      level: eco.arrears > 0 || eco.morale < 0.5 ? 2 : low && left < UPKEEP.warnLead * 3 ? 1 : 0,
      note: eco.arrears > 0 ? `Rückstand ${fmtInt(Math.round(eco.arrears))} · Moral ${Math.round(eco.morale * 100)} %` : low && left < UPKEEP.warnLead * 3 ? `Zahltag in ${Math.ceil(left / 60)} Min: ${fmtInt(Math.ceil(up.perPeriod))} Gold` : '',
    });
  }

  /** Markt-Schlüssel und Daten der Insel, in deren Hafen man liegt (Ankerglück, wenn keiner geöffnet ist) */
  marketSite(def: IslandDef | null = this.harborDef): MarketSite | null {
    const d = def ?? this.world.islandDefs.find((i) => i.id === 'ankerglueck') ?? null;
    if (!d) return null;
    return {
      id: d.id, name: d.name, profile: profileOf({ id: d.id, region: d.region, factionId: d.factionId }),
      war: { borderDist: borderDistance(d.x, d.z).dist, occupied: this.occupation.occupied(d.id), fort: d.kind === 'marinefort' || d.kind === 'citadel' },
    };
  }

  /** Beim Anlegen: Preisübersicht merken und mit Kriegsware an Bord möglicherweise kontrolliert werden */
  private afterDocking(def: IslandDef) {
    const s = this.save;
    const site = this.marketSite(def);
    if (!s || !site) return;
    const eco = this.eco();
    recordLedger(eco, site, s.meta.playTime, this.tariff().factor);
    const fid = this.harborFid;
    const r = inspectCargo(eco, { lawful: !!fid, marine: fid === 'marine' });
    if (!r.checked || !fid) return;
    const fine = Math.min(r.fine, s.player.gold);
    s.player.gold -= fine;
    this.shiftStanding(fid, -6);
    this.overlay.showBanner('Kontrolle!', `${FACTIONS[fid].name} beschlagnahmt ${r.seized} Einheiten Kriegsware · Strafe ${fmtInt(fine)} Gold`);
    audio.play('crack');
    if (r.hunters) this.world.naval?.callHunters();
    this.persist();
  }

  /** Daten des Kontors: Waren mit Vorrat, Preisen, Trend und Fracht, dazu Frachtraum, Unterhalt, Tarif und die Preisübersicht besuchter Häfen */
  kontorView() {
    const s = this.save, site = this.marketSite();
    if (!s || !site) return null;
    const eco = this.eco(), now = s.meta.playTime, tier = s.ship.tier;
    const t = this.tariff();
    const m = marketAt(eco, site, now);
    const rows = GOODS.map((g) => {
      const stock = m.stock[g.id] ?? 0;
      const base = marketPrice(site, g.id, stock);
      const buy = Math.ceil(quoteBuy(site, stock, g.id, 1, t.factor).total || base * 1.05 * t.factor);
      const sell = Math.floor(quoteSell(site, stock, g.id, 1, t.factor).total);
      const have = eco.cargo[g.id]?.n ?? 0;
      return { def: g, stock: Math.floor(stock), buy, sell, trend: trendOf(base, g.id), role: roleOf(site.profile, g.id), eq: eqPriceOf(site.profile, g.id), have, avgCost: have ? (eco.cargo[g.id]!.cost / have) : 0, war: !!g.war };
    });
    const ledger = Object.entries(eco.ledger).filter(([id]) => id !== site.id).map(([id, l]) => ({ id, ...l, age: Math.max(0, now - l.t) })).sort((a, b) => a.age - b.age);
    return { site, rows, tariff: t, cargo: { used: cargoUsed(eco), cap: cargoCap(tier), war: warCargo(eco) }, upkeep: this.upkeepView(), ledger, heat: eco.heat, gold: s.player.gold };
  }

  /** Ware im Kontor kaufen (Frachtraum, Vorrat, Gold und Tarif begrenzen die Menge) */
  tradeBuy(good: GoodId, n: number): string {
    const s = this.save, site = this.marketSite();
    if (!s || !site || !GOOD_BY_ID[good]) return '';
    const eco = this.eco();
    const r = buyGood(eco, site, s.meta.playTime, good, n, s.player.gold, s.ship.tier, this.tariff().factor);
    if (r.ok) { s.player.gold += r.gold; audio.play('coin'); recordLedger(eco, site, s.meta.playTime, this.tariff().factor); this.persist(); }
    return r.message;
  }

  tradeSell(good: GoodId, n: number): string {
    const s = this.save, site = this.marketSite();
    if (!s || !site || !GOOD_BY_ID[good]) return '';
    const eco = this.eco();
    const r = sellGood(eco, site, s.meta.playTime, good, n, this.tariff().factor);
    if (r.ok) { s.player.gold += r.gold; audio.play('coin'); recordLedger(eco, site, s.meta.playTime, this.tariff().factor); this.persist(); }
    return r.message;
  }

  /** Handelsgüter eines besiegten Schiffs an Bord nehmen (begrenzt durch den freien Frachtraum); Kriegsware erhöht den Fahndungsdruck */
  private salvageShip(e: { role: 'haendler' | 'patrouille' | 'jaeger' | 'legende'; power?: FactionId; level: number; ship: { x: number; z: number } }, boarded: boolean) {
    const s = this.save;
    if (!s) return;
    const drops = rollSalvage({ role: e.role, power: e.power ?? null, level: e.level, borderDist: borderDistance(e.ship.x, e.ship.z).dist, boarded });
    const r = applySalvage(this.eco(), drops, s.ship.tier);
    if (!r.taken.length && !r.lost) return;
    const txt = r.taken.map((d) => `${d.units} × ${GOOD_BY_ID[d.good].n}`).join(', ');
    this.hud.toast(`${boarded ? 'Ladung erbeutet' : 'Treibgut geborgen'}: ${txt || 'nichts'}${r.lost > 0 ? ` · ${r.lost} Einheiten ließen sich nicht mehr verstauen (Frachtraum voll)` : ''}${r.heat > 0.5 ? ' · Kriegsware: Fahnder werden aufmerksam' : ''}`, 6);
    this.persist();
  }

  /** Höchstzahl eines Verbrauchsguts im Beutel: wächst mit der Schiffsklasse (Beutekapazität) */
  bagMax(def: { max: number }): number { return bagMax(def.max, this.save?.ship.tier ?? 0); }

  /** Spezialmunition: freigeschaltet? sonst Preis (mit Tarif) und Tor (Rang und Ansehen der Stufe) */
  ammoView(id: AmmoId) {
    const eco = this.eco();
    const u = AMMO_UNLOCK[id];
    const owned = eco.ammo.includes(id);
    return { id, owned, price: this.priceAt(u.price), tier: u.tier, gate: owned ? '' : this.gateText(u.tier) };
  }

  buyAmmo(id: AmmoId): string {
    const s = this.save;
    if (!s) return '';
    const v = this.ammoView(id);
    if (v.owned) return 'Schon freigeschaltet.';
    if (v.gate) return v.gate;
    if (s.player.gold < v.price) return `Dafür fehlen ${v.price - s.player.gold} Gold.`;
    s.player.gold -= v.price;
    this.eco().ammo.push(id);
    this.world.onAmmoUnlock?.();
    audio.play('crack');
    this.persist();
    return `${AMMO[id].n} freigeschaltet.`;
  }

  // ---------- Schiffs-Evolution (Werft): Rumpf, Segel, Kanonen je Stufe 1 … 5 ----------

  /** Ausbaustufen des Schiffs, das du gerade fährst */
  evolution(): ShipEvolution {
    const s = this.save!;
    return evolutionOf(s.ship, s.ship.tier);
  }

  /** Anzeige eines Zweigs in der Werft: Stufe, nächste Stufe mit Wirkung, Gold (mit Tarif), Tor, Material aus dem Frachtraum */
  evoView(branch: EvoBranch) {
    const s = this.save!;
    const evo = this.evolution();
    const tier = tierOf(evo, branch);
    const next = tier < EVO_MAX ? tier + 1 : 0;
    const cost = next ? Math.round(evoCost(s.ship.tier, next) * this.yardK()) : 0;
    const mat = next ? evoMaterial(branch, s.ship.tier, next) : null;
    const have = mat ? this.eco().cargo[mat.good]?.n ?? 0 : 0;
    return {
      branch, tier, next, cost,
      now: evoEffectText(branch, tier), after: next ? evoEffectText(branch, next) : '',
      material: mat ? { ...mat, have, name: GOOD_BY_ID[mat.good].n } : null,
      gate: next ? this.evoGate(branch) : '',
    };
  }

  /** Tor für den nächsten Ausbau: Stufe 2 frei, 3 braucht Rang und Ansehen, 4 Rang 7 und „Verbündet“, 5 Rang 9 und Boss-Siegel; ab Stufe 3 dazu das Material im Frachtraum (leer = erlaubt) */
  evoGate(branch: EvoBranch, nextOverride?: number): string {
    const s = this.save;
    if (!s) return '';
    const evo = this.evolution();
    const next = nextOverride ?? tierOf(evo, branch) + 1;
    if (next > EVO_MAX) return 'Höchste Stufe erreicht.';
    const rank = rankIndex(s.player.fame);
    if (next === 3) { const g = this.gateText(3); if (g) return g; }
    if (next === 4) {
      if (rank < UPGRADE_RECIPE.rank4) return `Rang „${rankName(s.player.faction, FAME_THRESHOLDS[UPGRADE_RECIPE.rank4])}“ nötig.`;
      if (this.shopStanding() < UPGRADE_RECIPE.standing4) return `Ansehen „${repTier(UPGRADE_RECIPE.standing4).label}“ bei der Hafenmacht nötig.`;
    }
    if (next === 5) {
      const purse = this.sealPurse();
      if (rank < UPGRADE_RECIPE.rank) return `Rang „${rankName(s.player.faction, FAME_THRESHOLDS[UPGRADE_RECIPE.rank])}“ nötig.`;
      if (sealTotal(purse) < UPGRADE_RECIPE.seals) return `Letzte Stufe: ${UPGRADE_RECIPE.seals} Boss-Siegel nötig (du hast ${sealTotal(purse)}).`;
      if (purse.shards < UPGRADE_RECIPE.shards) return `Letzte Stufe: ${UPGRADE_RECIPE.shards} ${SHARD_NAME} nötig (du hast ${purse.shards}).`;
    }
    const mat = evoMaterial(branch, s.ship.tier, next);
    if (mat) {
      const have = this.eco().cargo[mat.good]?.n ?? 0;
      if (have < mat.n) return `Material fehlt: ${mat.n} × ${GOOD_BY_ID[mat.good].n} im Frachtraum nötig (du hast ${have}). Kaufe es im Kontor.`;
    }
    return '';
  }

  /** Einen Zweig des gefahrenen Schiffs ausbauen: Gold (Tarif), Material aus dem Frachtraum, ab Stufe 5 Siegel und Splitter */
  evoUpgrade(branch: EvoBranch): string {
    const s = this.save;
    if (!s) return '';
    this.world.clearShipPreview();
    const evo = this.evolution();
    const tier = tierOf(evo, branch);
    if (tier >= EVO_MAX) return '';
    const gate = this.evoGate(branch);
    if (gate) return gate;
    const next = tier + 1;
    const cost = Math.round(evoCost(s.ship.tier, next) * this.yardK());
    if (s.player.gold < cost) return `Dafür fehlen ${cost - s.player.gold} Gold.`;
    const mat = evoMaterial(branch, s.ship.tier, next);
    if (mat) takeCargo(this.eco(), mat.good, mat.n);
    s.player.gold -= cost;
    if (next >= EVO_MAX) paySeals(this.sealPurse(), UPGRADE_RECIPE.seals, UPGRADE_RECIPE.shards);
    (s.ship.evo ??= {})[String(s.ship.tier)] = { ...evo, [BRANCH_FIELD[branch]]: next };
    audio.play('crack');
    this.applyPower();
    this.persist();
    return `${BRANCH_FIELD[branch] === 'hullTier' ? 'Rumpf' : BRANCH_FIELD[branch] === 'sailTier' ? 'Segel' : 'Kanonen'} auf Stufe ${next} ausgebaut!`;
  }

  /** Was die Werft beim Kauf einer neuen Klasse für die Ausbauten des gefahrenen Schiffs erstattet (50 % des Goldwerts) */
  tradeInPreview(): { refund: number; value: number } {
    const s = this.save;
    if (!s) return { refund: 0, value: 0 };
    const evo = this.evolution();
    return { refund: tradeInRefund(s.ship.tier, evo), value: evoValue(s.ship.tier, evo) };
  }


  // ---------- Werft-Vorschau (Phase 4.2C): das Schiff vor dem Kauf in der 3D-Szene ----------

  beginYard() { this.world.beginYard(); }
  endYard() { this.world.endYard(); }
  get yardView(): YardView { return this.world.yardView; }
  setYardView(v: YardView) { this.world.setYardView(v); }

  /**
   * Zeigt in der 3D-Szene, was die Wahl bewirkt: eine Stufe eines Zweigs des gefahrenen Schiffs oder eine andere Klasse (neu gekauft: Stufe 1 in allen Zweigen,
   * im Besitz: ihr eigener Zustand). `null` zeigt wieder das eigene Schiff. Verändert nie den Spielstand; vor jeder echten Änderung wird die Vorschau abgebaut.
   */
  previewEvo(pick: YardPick | null) {
    const s = this.save;
    if (!s) return;
    if (!pick) { this.world.clearShipPreview(); return; }
    if (pick.kind === 'cls') {
      this.world.previewShip(pick.index, s.ship.owned.includes(pick.index) ? evolutionOf(s.ship, pick.index) : newShipEvolution());
      return;
    }
    this.world.previewShip(s.ship.tier, withTier(this.evolution(), pick.branch, pick.tier));
  }

  /** Sold pro Tag für diese Klasse und diese Ausbauten (Mannschaft und Offiziere wie jetzt) */
  private dailyPay(classIndex: number, evo: ShipEvolution): number {
    return upkeepOf({ ...this.upkeepInput(), tier: classIndex, evoTier: shipEvolutionTier(evo) }).daily;
  }
  private payRow(a: number, b: number): CompareRow {
    return { label: 'Täglicher Sold', from: fmtInt(Math.round(a)), to: fmtInt(Math.round(b)), better: Math.round(a) === Math.round(b) ? 0 : b < a ? 1 : -1 };
  }

  /** Vorher → Nachher, Kosten und offene Voraussetzungen, um einen Zweig des gefahrenen Schiffs auf Stufe `tier` zu bringen (alle Stufen dazwischen eingerechnet) */
  evoPreviewInfo(branch: EvoBranch, tier: number): YardInfo {
    const s = this.save!, ci = s.ship.tier, now = this.evolution();
    const cur = tierOf(now, branch), to = withTier(now, branch, tier);
    const rows = [...evoCompareRows(ci, branch, now, to), this.payRow(this.dailyPay(ci, now), this.dailyPay(ci, to))];
    const plan = evoPlan(branch, ci, cur, tier), k = this.yardK();
    const gold = Math.round(plan.gold * k);
    const cargo = this.eco().cargo;
    const purse = this.sealPurse();
    const gates: string[] = [];
    for (const step of plan.steps) {
      const g = this.evoGate(branch, step);
      if (g && !g.startsWith('Material fehlt') && !gates.includes(g)) gates.push(g);
    }
    return {
      rows, gold, goldOk: s.player.gold >= gold,
      materials: plan.materials.map((m) => ({ name: GOOD_BY_ID[m.good].n, n: m.n, have: cargo[m.good]?.n ?? 0 })),
      seals: plan.seals, shards: plan.shards, sealsHave: sealTotal(purse), shardsHave: purse.shards,
      gates, refund: 0,
    };
  }

  /** Vorher → Nachher, Preis, Rang-Tor und Inzahlungnahme beim Wechsel auf eine andere Klasse */
  classPreviewInfo(index: number): YardInfo {
    const s = this.save!, ci = s.ship.tier, now = this.evolution(), c = SHIP_CLASSES[index];
    const owned = s.ship.owned.includes(index);
    const toEvo = owned ? evolutionOf(s.ship, index) : newShipEvolution();
    const rows = [...classCompareRows(ci, now, index, toEvo), this.payRow(this.dailyPay(ci, now), this.dailyPay(index, toEvo))];
    const gates: string[] = [];
    if (!owned && rankIndex(s.player.fame) < c.rank) gates.push(`Rang „${rankName(s.player.faction, FAME_THRESHOLDS[c.rank])}“ nötig.`);
    const price = owned ? 0 : c.price;
    return {
      rows, gold: price, goldOk: s.player.gold + (owned ? 0 : this.tradeInPreview().refund) >= price, materials: [],
      seals: 0, shards: 0, sealsHave: 0, shardsHave: 0, gates, refund: owned || index === ci ? 0 : this.tradeInPreview().refund,
    };
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
    // Vorschau mit der angelegten Ausrüstung: eigener Look aus dem Editor, darüber Beute, Schienen, Helm und die Anprobe
    const gearLook = (look: CharacterLook, tryOn: string[] | null) => (this.save ? this.displayLook(this.save, look, tryOn) : (tryOn?.length ? { ...look, extra: tryOn } : look));
    this.stage.show(this.assets, gearLook(initial.look, null), styleIdOf(initial.style, initial.blade));
    this.stage.preset('gesamt');
    this.renderer.setView(this.stage.scene, this.stage.camera);
    this.renderer.setEffectSources(null, this.stage.focus);
    this.state.set('editor');
    const close = () => {
      this.editor?.dispose();
      this.editor = null;
      this.stage?.setAura(null);
      this.useWorldView();
      this.renderer.resize();
    };
    const s = this.save;
    const gear = !isNew && s ? ((): EditorGearHost => {
      const g = s.gear;
      ensureLoot(g);
      return {
        owned: () => [...g.loot!],
        worn: () => ({ ...g.outfit }),
        equip: (cat, id) => { wearLoot(g, id, cat); this.applyPower(); this.persist(); },
        dyes: () => g.dyes!,
        dye: (id, c) => this.dyeLoot(id, c),
      };
    })() : undefined;
    this.editor = new CharacterEditor(this.uiRoot, {
      isNew,
      anime: !!this.assets.vroid,
      initial,
      gear,
      onChange: (r, sid, tryOn) => { this.stage?.show(this.assets!, gearLook(r.look, tryOn), sid); },
      onPreview: (k) => this.stage?.preview(k),
      onRotate: (dx) => this.stage?.rotate(dx),
      onZoom: (d) => this.stage?.zoomBy(d),
      onPreset: (p) => this.stage?.preset(p),
      onAura: (c) => this.stage?.setAura(c),
      onSpin: (on) => { if (this.stage) this.stage.autoSpin = on; },
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
    this.world.abortRaid();
    this.raidPanel.update(null);
    this.raidView = null;
    this.session++;
    this.slot = slot;
    this.save = data;
    this.world.leaveTitle();
    this.world.setState({ boat: data.world.boat, env: { time: data.world.time, weather: data.world.weather as WeatherId } });
    const p = data.player;
    this.world.playerFaction = p.faction;
    ensureGear(data.gear);
    this.buffs = [];
    this.itemCd.clear();
    if (this.assets) this.world.setCharacters(this.assets, this.displayLook(data), this.activeStyle(data), this.overlay);
    this.world.setSkills(data.skills, p.level);
    {
      // Zwei-Stufen-Crew: Seeleute-Anteil und Truppen aus dem Spielstand (ältere Spielstände haben `crewPools`/`troops` nicht: alles bleibt voll/leer)
      const roster = ensureCrewState(data.crew, data.ship.tier);
      const pools = savedPools(data.ship, roster, data.ship.tier);
      this.world.setShip(data.ship.tier, data.ship.look, data.ship.ammo, data.ship.hull, p.faction, data.ship.sail ?? 1, pools.matrosen, rosterTotal(roster));
    }
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
    this.occupation.reset();
    this.occupation.sync();
    this.after(() => this.startAutoChapters(), 2500);
    this.applyPower();
    this.syncFleet(true);
    this.world.healPlayer();
    this.hud.setPlayer(p.name, `${FACTION_LABELS[p.faction]} · ${rankName(p.faction, p.fame)} · Stufe ${p.level}`);
    this.refreshWeaponHud();
    this.menus.hide();
    this.input.flush();
    this.autosaveTimer = 0;
    // Neues Spiel oder Spielstand laden: Figuren und Inseln werden aufgebaut, die ersten Sekunden gehören nicht zur Messung
    this.sceneChanged(10);
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
    this.harborFid = null;
    this.menus.hide();
    this.input.flush();
    this.sceneChanged(4);
    this.state.set('play');
    this.loop.resetClock();
  }

  quitToMenu() {
    this.world.abortRaid();
    this.occupation.reset();
    this.occBanner.update(null);
    this.raidPanel.update(null);
    this.raidView = null;
    this.session++;
    this.persist();
    this.save = null;
    this.slot = null;
    this.quests = null;
    this.world.titleMood();
    this.state.set('menu');
    this.menus.showMain();
  }

  /** Speichert den aktuellen Spielstand. true = erfolgreich (oder nichts zu speichern). */
  persist(): boolean {
    this.autosaveTimer = 0;
    if (!this.save || this.slot === null) return true;
    this.syncFleetState();
    const ws = this.world.getState();
    this.save.world = { boat: ws.boat, time: ws.env.time, weather: ws.env.weather };
    const sh = this.world.ship;
    this.save.ship.hull = sh.maxHull > 0 ? Math.max(0.05, sh.hull / sh.maxHull) : 1;
    this.save.ship.sail = sh.sail;
    this.syncTroops();
    this.save.ship.crew = sh.crew;
    this.save.ship.crewPools = { matrosen: sh.crew, truppen: sh.troopMax > 0 ? sh.troopHeads / sh.troopMax : 0 };
    this.save.crew.officerSlots = officerSlots(this.save.ship.tier);
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

  /** Während eines Stufenwechsels wird nicht gezeichnet (siehe setQuality) */
  private qualitySwitching = false;

  /**
   * Grafikstufe wechseln. Ein Wechsel schaltet Kaskaden-Schatten, Lichter und Nachbearbeitung um; alle beleuchteten Materialien brauchen
   * neue Shader (beim ersten Wechsel auf Maximal über 19 s, wenn das Zeichnen sie nacheinander übersetzt: der Browser hing). Darum:
   * Stufe setzen, solange nicht zeichnen, alle Shader parallel übersetzen (compileAsync, der Browser bleibt bedienbar), dann weiterzeichnen.
   * Bereits übersetzte Stufen (Programme bleiben gehalten) wechseln ohne Pause.
   */
  async setQuality(tier: QualityTier | 'auto') {
    if (this.qualitySwitching) return;
    this.qualitySwitching = true;
    try {
      if (tier === 'auto') {
        this.settings.update({ qualityAuto: true, quality: this.detected.tier });
        this.renderer.applyQuality(this.detected.tier);
      } else {
        this.settings.update({ qualityAuto: false, quality: tier });
        this.renderer.applyQuality(tier);
      }
      this.sceneChanged(6);
      if (this.world?.scene && this.world.camera) {
        this.world.env.ensureCsm(this.world.camera as PerspectiveCamera);
        this.hud.toast('Grafik wird angewendet …', 1.6);
        await this.renderer.precompile(this.world.scene, this.world.camera).catch(() => {});
      }
    } finally {
      this.qualitySwitching = false;
      // nach dem Übersetzen noch einmal: die ersten Bilder der neuen Stufe laden Schattenkarten und Zielpuffer nach
      this.sceneChanged(6);
    }
  }

  private applySettings() {
    const s = this.settings.data;
    document.documentElement.style.setProperty('--text-scale', String(s.textScale));
    document.documentElement.style.setProperty('--hud-scale', String(s.hudScale));
    this.touch.setScale(s.hudScale);
    this.sectorBanner.enabled = s.sectorBanner;
    this.overlay.numbers = s.damageNumbers;
    this.input.setKeyBindings(s.keyBindings);
    this.input.invertY = s.invertLookY;
    audio.setVolumes(s.volume);
    audio.muteWhenUnfocused = s.muteWhenUnfocused;
    document.documentElement.classList.toggle('cb', s.colorblind);
    mapPalette.colorblind = s.colorblind;
    if (!s.dynamicResolution) this.renderer?.resetDynamicResolution();
    this.updateTouchVisibility();
  }

  private updateTouchVisibility() {
    const mode = this.settings.data.touchControls;
    const show = this.state.is('play') && (mode === 'on' || (mode === 'auto' && this.input.lastDevice === 'touch'));
    this.touch.setVisible(show);
    // die Oberfläche lässt unten Platz für die Touch-Knöpfe (css/hud.css)
    document.documentElement.classList.toggle('touch', show);
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
