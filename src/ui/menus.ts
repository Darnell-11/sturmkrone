import { ACTION_GROUPS, ACTION_IDS, ACTION_LABELS, DEFAULT_KEYS, FIXED_CODES, type ActionId } from '../data/actions';
import { QUALITY_IDS, QUALITY_TIERS, type QualityTier } from '../data/qualityTiers';
import { FACTION_LABELS, RANKS, rankName } from '../data/ranks';
import type { Game } from '../core/game';
import type { SaveData } from '../core/save/types';
import type { Settings, SettingsTab } from '../core/settings';
import { fmtInt } from '../core/format';
import { EDGE_WALL, WEATHER, WEATHER_IDS, type WeatherId } from '../data/world';
import { formatClock } from '../world/timeOfDay';
import { FIGUREHEAD_DEFS, FIGUREHEAD_MODELS, figureheadModel } from '../data/figureheads';
import { FLAGS, FLAG_DESC, HULL_COLORS, SAIL_COLORS, SHIP_CLASSES, SHIP_UPGRADES, SHIP_UPGRADE_IDS, SHIP_UPGRADE_MAX, STRIPE_COLORS, upgradeEffectText, type ShipLook } from '../data/ships';
import { downloadText, esc, formatDate, formatPlayTime, pickFile } from './dom';
import { gaugeHtml, goldLine, sliderHtml, toggleHtml } from './components';
import { crestSvg } from './logoSvg';
import { glyphSvg } from './itemArt';
import { CATALOG_CATS, catalog, figureheadGlyph, filterCatalog, flagGlyph, type CatalogCat, type CatalogEntry, type GlyphKind } from '../data/catalog';
import { QUEST_BY_ID, TOWN_NPCS, type QuestDef, type ShopKind, type TownNpcDef } from '../data/quests';
import { CREW, CREW_BY_ID, CREW_ROLE_LABEL } from '../data/crew';
import { officerSlots, troopCapacity } from '../data/crewTiers';
import { cleanRoster, TROOP_TYPES, TROOPS, type TroopType } from '../data/troops';
import { activeParty } from '../core/crewRoster';

const WORKSHOP_KEY = 'sturmkrone2-workshop';

/**
 * Welt-Werkstatt sichtbar? Immer in der Entwicklerversion. Auf der veröffentlichten Seite nur, wenn man sie einmal
 * mit `?werkstatt` am Ende der Adresse freigeschaltet hat (merkt sich der Browser; `?werkstatt=aus` schaltet sie wieder ab).
 */
function workshopUnlocked(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    const q = new URLSearchParams(location.search).get('werkstatt');
    if (q === 'aus') localStorage.removeItem(WORKSHOP_KEY);
    else if (q !== null) localStorage.setItem(WORKSHOP_KEY, '1');
    return localStorage.getItem(WORKSHOP_KEY) === '1';
  } catch { return false; }
}
import { hostileLegends } from '../data/legends';
import { TRINKETS, TRINKET_BY_ID } from '../data/trinkets';
import { RARITIES, RARITY, type Rarity } from '../data/rarity';
import { ACHIEVEMENTS } from '../data/achievements';
import { ARMOR, CONSUMABLES, GEAR, HEADS, PROVIANT, SHRINE_PRICE, SLOT_LABEL, WEAPONS, WEAPON_LINES } from '../data/items';
import { CAT_LABEL, EQUIP_BY_ID, catOf, type GearCat } from '../data/equipment';
import { SETS } from '../data/gear';
import { itemCount } from '../core/inventory';
import type { IslandDef } from '../data/regions';
import { stepText } from '../story/questSystem';
import { drawMap } from './minimap';
import { appDownload, gameUrl, installHelp, installWay, promptInstall, shareGame } from '../core/install';
import { audio } from '../audio/audio';
import { FACTIONS, type FactionId } from '../data/factions';
import { RAID_BOSSES } from '../raid/raidBosses';
import type { RaidLootItem } from '../raid/raidLoot';
import { OCCUPATION } from '../raid/occupation';

type Handler = (id: string, el: HTMLElement) => void;

/** Alle Menübildschirme: Titel, Spielstände, Neues Spiel, Einstellungen, Pause. */
const GPU_HINT = `<p class="warn">Dein Browser benutzt gerade <b>nicht deine Grafikkarte</b> – darum läuft das Spiel nur auf der niedrigsten Stufe. So schaltest du sie ein: <b>Chrome/Edge:</b> Einstellungen → System → „Grafikbeschleunigung verwenden, wenn verfügbar“ einschalten. <b>Firefox:</b> Einstellungen → Allgemein → Leistung → „Hardwarebeschleunigung verwenden, wenn verfügbar“. Danach den Browser ganz schließen und neu öffnen.</p>`;

export class Menus {
  private screen: HTMLElement;
  private card: HTMLElement;
  private handlers: Record<string, Handler> = {};
  private back: (() => void) | null = null;
  private settingsTab: SettingsTab = 'grafik';
  private capturing = false;
  /** Wappen, Name und Menü des Titels steigen nur beim ersten Zeigen auf (nicht bei jedem Zurück aus den Einstellungen) */
  private titleSeen = false;
  /** Zustand des Kompendiums (Reiter, Seltenheit, Suche, gewählter Eintrag) */
  private cmp: { cat: CatalogCat | 'all' | 'raid'; rarity: Rarity | 'all'; q: string; sel: string | null } = { cat: 'all', rarity: 'all', q: '', sel: null };

  constructor(parent: HTMLElement, private game: Game) {
    this.screen = document.createElement('section');
    this.screen.className = 'screen';
    this.screen.hidden = true;
    this.card = document.createElement('div');
    this.card.className = 'card';
    this.screen.appendChild(this.card);
    parent.appendChild(this.screen);

    this.card.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      audio.play(el.dataset.a === 'back' || el.dataset.a === 'bye' ? 'uiBack' : 'ui');
      this.run(this.handlers[el.dataset.a!], el.dataset.id ?? '', el);
    });
    this.card.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.input) this.run(this.handlers[el.dataset.input], el.value, el);
    });

    addEventListener('keydown', (e) => {
      if (this.screen.hidden || this.capturing) return;
      if (e.key === 'Escape') { e.preventDefault(); this.back?.(); }
      else if (e.key === 'ArrowDown' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); this.moveFocus(1); }
      else if (e.key === 'ArrowUp' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); this.moveFocus(-1); }
    });
    // Gamepad im Menü: Steuerkreuz/Stick = Auswahl, A = bestätigen, B = zurück
    this.game.input.onPadButton((b) => {
      if (this.screen.hidden) return;
      if (b === 12 || b === 14) this.moveFocus(-1);
      else if (b === 13 || b === 15) this.moveFocus(1);
      else if (b === 0) (document.activeElement as HTMLElement | null)?.click();
      else if (b === 1) this.back?.();
      else if (b === 9 && this.game.state.is('pause')) this.game.resume();
    });
  }

  get visible() { return !this.screen.hidden; }

  hide() {
    this.screen.hidden = true;
    this.back = null;
  }

  /** Knopf-Aktion ausführen; Fehler (auch aus asynchronen Aktionen wie Teilen oder Importieren) landen nicht unbehandelt in der Konsole */
  private run(h: Handler | undefined, v: string, el: HTMLElement) {
    if (!h) return;
    try {
      const r = (h as (v: string, el: HTMLElement) => unknown)(v, el);
      if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch((e) => { console.warn('Menü-Aktion fehlgeschlagen', e); this.onError(); });
    } catch (e) {
      console.warn('Menü-Aktion fehlgeschlagen', e);
      this.onError();
    }
  }

  /** Kurze Meldung, wenn eine Menü-Aktion schiefgeht (setzt das Spiel) */
  onError: () => void = () => {};

  /** Eine Ansicht neu zeichnen und dabei die Rollposition behalten (Kaufen, Wählen und Umschalten springen nicht nach oben) */
  private keep(fn: () => void) {
    const y = this.screen.scrollTop;
    fn();
    this.screen.scrollTop = y;
  }

  private open(html: string, handlers: Record<string, Handler>, back: (() => void) | null, opts: { wide?: boolean; clear?: boolean; title?: boolean; cls?: string } = {}) {
    this.card.innerHTML = html;
    this.card.className = `card${opts.wide ? ' wide' : ''}${opts.cls ? ` ${opts.cls}` : ''}`;
    this.screen.classList.toggle('clear', !!opts.clear);
    this.screen.classList.toggle('title', !!opts.title);
    this.handlers = handlers;
    this.back = back;
    this.screen.hidden = false;
    this.screen.scrollTop = 0;
    // Mit Gamepad/Tastatur direkt das erste Element auswählen
    if (this.game.input.lastDevice !== 'touch') {
      requestAnimationFrame(() => this.card.querySelector<HTMLElement>('[data-focus], button, input')?.focus({ preventScroll: true }));
    }
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.card.querySelectorAll<HTMLElement>('button:not([disabled]), input, select')).filter((el) => el.offsetParent !== null);
  }

  private moveFocus(dir: number) {
    const list = this.focusables();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = list[(i + dir + list.length) % list.length] ?? list[0];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  // ---------- Titel ----------

  showMain(note = '') {
    const g = this.game;
    const dl = appDownload();
    const intro = !this.titleSeen;
    this.titleSeen = true;
    this.open(
      `<div class="title-card${intro ? ' title-intro' : ''}">
        <div class="title-brand">
          <div class="title-crest">${crestSvg({ badge: '3.0' })}</div>
          <h1 class="title-word">Sturmkrone</h1>
          <p class="title-tag">Ein Piratenabenteuer auf hoher See</p>
        </div>
        <div class="title-menu panel">
          ${g.persistent ? '' : '<p class="warn">Dein Browser erlaubt kein dauerhaftes Speichern (z. B. privater Modus). Spielstände gehen beim Schließen verloren – nutze „Exportieren“.</p>'}
          ${g.detected.software ? GPU_HINT : ''}
          <button class="primary" data-a="play" data-focus>Spielen</button>
          <button class="secondary" data-a="compendium">Item-Kompendium</button>
          <button class="secondary" data-a="settings">Einstellungen</button>
          <div class="row share-row">
            ${installWay() === 'done' ? '' : '<button class="secondary" data-a="install">📲 Als App installieren</button>'}
            <button class="secondary" data-a="share">🔗 Spiel teilen</button>
            ${dl ? `<button class="secondary" data-a="download">${esc(dl.label)}</button>` : ''}
          </div>
          ${note ? `<p class="note">${esc(note)}</p>` : ''}
          <p class="ver">Version ${esc(__APP_VERSION__)} · ${esc(__BUILD_DATE__)}</p>
        </div>
      </div>`,
      {
        play: () => this.showSlots(),
        compendium: () => this.showCompendium(() => this.showMain()),
        settings: () => this.showSettings(() => this.showMain()),
        install: async () => {
          const way = installWay();
          if (way === 'prompt') { const ok = await promptInstall(); this.showMain(ok ? 'Installiert! Sturmkrone liegt jetzt auf deinem Startbildschirm.' : ''); }
          else this.showMain(installHelp(way));
        },
        download: () => {
          if (!dl) return;
          location.href = dl.url;
          this.showMain(dl.help);
        },
        share: async () => {
          const r = await shareGame();
          if (r === 'copied') this.showMain(`Link kopiert – einfach weiterschicken: ${gameUrl()}`);
          else if (r === 'failed') this.showMain(`Zum Weiterschicken: ${gameUrl()}`);
        },
      },
      null,
      { clear: true, title: true },
    );
  }

  // ---------- Spielstände ----------

  showSlots() {
    const g = this.game;
    const slots = g.saves.list();
    const legacy = g.saves.findLegacy();
    const hasEmpty = slots.some((s) => !s.data && !s.error);
    const html = slots.map((s) => {
      if (s.data) {
        const p = s.data.player;
        return `<div class="slot">
          <div class="slot-head"><b>${esc(p.name)}</b><span>Platz ${s.slot}</span></div>
          <div class="meta">${FACTION_LABELS[p.faction]} · ${esc(rankName(p.faction, p.fame))} · Stufe ${p.level}<br>
          Spielzeit ${formatPlayTime(s.data.meta.playTime)} · gespeichert ${formatDate(s.data.meta.updated)}</div>
          ${s.error ? `<p class="warn">${esc(s.error)}</p>` : ''}
          <button class="primary" data-a="continue" data-id="${s.slot}">Weiterspielen</button>
          <div class="row"><button class="mini" data-a="export" data-id="${s.slot}">Exportieren</button><button class="mini red" data-a="delete" data-id="${s.slot}">Löschen</button></div>
        </div>`;
      }
      if (s.error) {
        return `<div class="slot"><div class="slot-head"><b>Unlesbarer Spielstand</b><span>Platz ${s.slot}</span></div>
          <p class="warn">${esc(s.error)}</p>
          <div class="row"><button class="mini red" data-a="delete" data-id="${s.slot}">Platz leeren</button></div></div>`;
      }
      return `<div class="slot"><div class="slot-head"><b>Freier Platz</b><span>Platz ${s.slot}</span></div>
        <button class="primary" data-a="new" data-id="${s.slot}">Neues Spiel</button></div>`;
    }).join('');

    this.open(
      `<h2 class="fell">Spielstände</h2>
      ${!hasEmpty ? `<p class="note"><b>Alle drei Plätze sind belegt.</b> Für einen neuen Charakter zuerst bei einem Spielstand auf <b>Löschen</b> tippen
        (vorher <b>Exportieren</b>, wenn du ihn behalten willst). Danach erscheint dort „Neues Spiel“.</p>` : ''}
      ${legacy && hasEmpty ?`<p class="note">Ein Spielstand aus Sturmkrone 1.0 wurde gefunden: <b>${esc(legacy.player.name)}</b>, Stufe ${legacy.player.level}.
        <button class="mini brass" data-a="legacy">In freien Platz übernehmen</button></p>` : ''}
      ${html}
      <button class="secondary" data-a="import">Spielstand-Datei importieren</button>
      <button class="secondary" data-a="back">Zurück</button>`,
      {
        continue: (id) => g.continueGame(+id),
        new: (id) => g.openEditor(+id),
        export: (id) => {
          const d = g.saves.load(+id).data;
          if (!d) return;
          const date = new Date().toISOString().slice(0, 10);
          const safe = d.player.name.replace(/[^\wäöüÄÖÜß-]+/g, '_');
          downloadText(`sturmkrone-${safe}-${date}.json`, g.saves.exportJson(d));
          g.hud.toast('Spielstand exportiert.');
        },
        delete: (id) => this.confirm(
          `Platz ${id} wirklich löschen? Das lässt sich nicht rückgängig machen. Tipp: Vorher exportieren.`,
          'Löschen',
          () => { g.saves.delete(+id); this.showSlots(); },
          () => this.showSlots(),
        ),
        legacy: () => {
          const free = g.saves.list().find((s) => !s.data && !s.error);
          if (!legacy || !free) return;
          g.saves.save(free.slot, legacy);
          g.hud.toast(`1.0-Spielstand in Platz ${free.slot} übernommen.`);
          this.showSlots();
        },
        import: async () => {
          const text = await pickFile('.json,application/json');
          if (text === null) return;
          const r = g.saves.importJson(text);
          if (!r.ok) { this.message('Import fehlgeschlagen', r.error, () => this.showSlots()); return; }
          this.showImportTarget(r.data);
        },
        back: () => this.showMain(),
      },
      () => this.showMain(),
    );
  }

  private showImportTarget(data: SaveData) {
    const g = this.game;
    const slots = g.saves.list();
    this.open(
      `<h2 class="fell">Import</h2>
      <p><b>${esc(data.player.name)}</b> · ${FACTION_LABELS[data.player.faction]} · Stufe ${data.player.level}</p>
      <p class="soft">In welchen Platz soll der Spielstand?</p>
      ${slots.map((s) => `<button class="secondary" data-a="to" data-id="${s.slot}">Platz ${s.slot}: ${s.data ? `${esc(s.data.player.name)} <small>(wird überschrieben)</small>` : 'frei'}</button>`).join('')}
      <button class="secondary" data-a="back">Abbrechen</button>`,
      {
        to: (id) => {
          const slot = +id;
          const doIt = () => { g.saves.save(slot, data); g.hud.toast(`Spielstand in Platz ${slot} importiert.`); this.showSlots(); };
          if (slots[slot - 1].data) this.confirm(`Platz ${slot} überschreiben?`, 'Überschreiben', doIt, () => this.showImportTarget(data));
          else doIt();
        },
        back: () => this.showSlots(),
      },
      () => this.showSlots(),
    );
  }

  // ---------- Pause ----------

  showPause() {
    const g = this.game;
    this.open(
      `<h2 class="fell">Pause</h2>
      <button class="primary" data-a="resume" data-focus>Weiterspielen</button>
      <div class="menu-grid">
        <button class="secondary" data-a="map">Karte &amp; Logbuch</button>
        <button class="secondary" data-a="quests">Auftragsbuch</button>
        <button class="secondary" data-a="inv">Inventar &amp; Ausrüstung</button>
        <button class="secondary" data-a="compendium">Item-Kompendium</button>
        <button class="secondary" data-a="faji">Faji-Talente</button>
        <button class="secondary" data-a="crew">Crew</button>
        <button class="secondary" data-a="rank">Rangliste der Legenden</button>
        <button class="secondary" data-a="rep">Ruf &amp; Ehre</button>
        <button class="secondary" data-a="loot">Talismane &amp; Erfolge</button>
        <button class="secondary" data-a="look">Aussehen ändern</button>
        <button class="secondary" data-a="settings">Einstellungen</button>
        ${workshopUnlocked() ? '<button class="secondary" data-a="workshop">Welt-Werkstatt (Test)</button>' : ''}
      </div>
      ${g.world.raid && !g.world.raid.over ? '<button class="secondary" data-a="retreat">Belagerung abbrechen (Rückzug)</button>' : ''}
      <div class="row"><button class="secondary" data-a="save">Speichern</button><button class="secondary" data-a="quit">Speichern &amp; Hauptmenü</button></div>`,
      {
        resume: () => g.resume(),
        look: () => g.openEditor(null),
        map: () => this.showMap('logbuch', () => this.showPause()),
        quests: () => { g.resume(); g.openQuestLog(); },
        inv: () => { g.resume(); g.openInventory(); },
        compendium: () => this.showCompendium(() => this.showPause()),
        faji: () => { g.resume(); g.openSkills(); },
        crew: () => this.showCrew(() => this.showPause()),
        rank: () => this.showRanking(() => this.showPause()),
        rep: () => this.showReputation(() => this.showPause()),
        loot: () => this.showLoot(() => this.showPause()),
        settings: () => this.showSettings(() => this.showPause()),
        workshop: () => this.showWorkshop(),
        save: () => { g.hud.toast(g.persist() ? 'Gespeichert.' : 'Speichern fehlgeschlagen!'); },
        retreat: () => { g.resume(); g.world.retreatRaid(); },
        quit: () => g.quitToMenu(),
      },
      () => g.resume(),
    );
  }

  // ---------- Beute nach dem Sieg ----------

  /** Persönliche Beute des Spielers nach einem Raid-Sieg (jeder Teilnehmer hat seinen eigenen Wurf), dazu die Besatzung */
  showRaidLoot(p: { island: string; boss: string; items: RaidLootItem[]; minutes: number; conquests: number }) {
    const g = this.game;
    const boss = Object.values(RAID_BOSSES).find((b) => b.id === p.boss);
    const rows = p.items.map((it) => {
      const r = RARITY[it.rarity];
      const what = it.kind === 'gold' ? `${fmtInt(it.amount ?? 0)} Gold` : it.kind === 'xp' ? `${fmtInt(it.amount ?? 0)} Erfahrung` : it.label;
      const tag = it.kind === 'sail' ? 'Segel (dauerhaft)' : it.kind === 'ornament' ? 'Verzierung (dauerhaft)' : it.kind === 'gear' ? 'Ausrüstung' : it.kind === 'gold' ? 'Gold' : 'Erfahrung';
      return `<div class="slot crew" style="--c:${r.col}"><div class="slot-head"><b style="color:${r.col}">${r.mark} ${esc(what)}</b><span>${esc(tag)}</span></div>${it.fresh ? '' : '<div class="meta soft">Schon vorhanden – in Beutemarken getauscht.</div>'}</div>`;
    }).join('');
    this.open(
      `<h2 class="fell">${esc(p.island)} erobert!</h2>
      <p class="soft">${esc(boss?.name ?? 'Der Endboss')} ist gefallen. Deine <b>persönliche Beute</b> (nur für dich gewürfelt):</p>
      ${rows}
      <p class="note">⚑ ${esc(p.island)} gehört dir für ${p.minutes} Minuten aktiver Spielzeit${p.conquests > 1 ? ` (${p.conquests}. Eroberung)` : ''}: dein sicherer Hafen mit Werft und Truppen. Der Countdown steht auf der Weltkarte (M) und am Insel-Banner. Kommt die Rückeroberungs-Flotte, versenke sie, um die Besatzung zu verlängern.</p>
      <button class="primary" data-a="ok" data-focus>Weiter</button>`,
      { ok: () => g.resume() },
      () => g.resume(),
    );
  }

  // ---------- Belagerung (Raid) ----------

  /** Belagerung vorbereiten: Festung, die zwei Angriffswege, Flotte und Söldner-Eskorten; „Belagerung beginnen“ startet die Instanz */
  showRaid(def: IslandDef, mercs = 0, msg = '') {
    const g = this.game;
    const b = g.raidBriefing(def);
    if (!b) return;
    const F = FACTIONS[def.factionId ?? 'marine'];
    const back = () => g.resume();
    const room = Math.max(0, b.mercSlots);
    const m = Math.min(mercs, room);
    const cost = m * b.price;
    const re = (n = m, t = '') => this.keep(() => { this.showRaid(def, n, t); });
    this.open(
      `<h2 class="fell">Belagerung von ${esc(def.name)}</h2>
      <p class="soft">${esc(F.name)} · ${esc(F.epithet)} · Stufe <b>${b.level}</b> (du: Stufe ${b.playerLevel}) · Gold: <b>${fmtInt(g.playerGold)}</b>${msg ? ` · <b>${esc(msg)}</b>` : ''}</p>
      <p>${esc(b.access.reason)}</p>
      ${b.playerLevel + 3 < b.level ? `<p class="warn">Diese Festung ist weit über deiner Stufe. Ohne starke Flotte und Truppen wird es ein harter Kampf.</p>` : ''}
      <h3>Der Ablauf</h3>
      <p class="small"><b>1 · Seeschlacht:</b> Fünf stark gepanzerte Kriegsschiffe (eigene Segel- und Mannschaftswerte) bewachen die Zufahrt, Küstenbatterien feuern auf deine Flotte. Erst wenn die Wachflotte gefallen ist, werden die Landungszonen frei.</p>
      <div class="slot"><div class="slot-head"><b>Route A · Von See</b><span>kurz, wuchtig</span></div>
        <div class="meta">Seetor und beide Mauerflügel vor dem inneren Burghafen mit den Schiffskanonen <b>zusammenschießen</b> (sichtbare Trümmer, Rauch, Einsturz). Danach legst du an den Burgstegen an – direkt vor dem Burgtor. Wenige, dafür stark besetzte Burg.</div></div>
      <div class="slot"><div class="slot-head"><b>Route B · Landung im Flachland</b><span>lang, voller Gegner</span></div>
        <div class="meta">Am flachen Strand legen sofort mehrere Landungsbuchten an – ohne Mauern. Dann der lange Marsch durch <b>vier Viertel</b>: Strand &amp; Vorposten, Hafen- &amp; Kontorviertel, Marktplatz &amp; Kasernen-Barrikaden, Steiler Burgaufstieg. Viel mehr Gegner, Dachschützen und Straßensperren; der Lohn ist ein Viertel höher.</div></div>
      <h3>Die Verteidiger</h3>
      <p class="small"><b>Verbände:</b> dichte Formationen schwächerer Soldaten halten Viertel, Tor und Burghof (instanziert – ideal für deine Massentruppen). <b>Drei bis vier Hauptmänner</b> führen sie, stark gepanzert und mit Aura (Schlachtruf, Bollwerk, Eilmarsch, Feldscher). Im Burghof wartet der Endboss: <b>${esc(RAID_BOSSES[def.factionId ?? 'marine'].name)}</b> – ${esc(RAID_BOSSES[def.factionId ?? 'marine'].title)}. Er kämpft in zwei Phasen, markiert seine Angriffe mit roten Flächen am Boden und richtet sich nach der Bedrohung: wer ihm den meisten Schaden macht, zieht ihn auf sich.</p>
      <h3>Nach dem Sieg</h3>
      <p class="small">Die Insel gehört dir für <b>${OCCUPATION.minutes} Minuten aktiver Spielzeit</b>: deine Flagge weht, Wachen schreiten Stadt und Burg ab, Tribute fließen, der Hafen bietet Werft und Truppen. In den letzten 5 Minuten schickt ${esc(F.name)} eine Rückeroberungs-Flotte: versenke sie, und die Besatzung verlängert sich. Jeder Teilnehmer erhält seine <b>eigene Beute</b> (Boss-Stücke, Segel, Verzierungen) – dauerhaft.${b.conquests > 0 ? ` Du hast diese Festung schon <b>${b.conquests}×</b> erobert.` : ''}</p>
      <h3>Deine Flotte</h3>
      <p class="small">Flaggschiff und <b>${b.own}</b> eigene${b.own === 1 ? 's' : ''} Begleitschiff${b.own === 1 ? '' : 'e'}${m ? ` · <b>${m}</b> Söldner-Eskorte${m === 1 ? '' : 'n'} (${cost} Gold)` : ''}. Höchstens ${b.max} Begleitschiffe.</p>
      <div class="row">
        <button class="mini brass" data-a="merc" ${room - m <= 0 || g.playerGold < cost + b.price ? 'disabled' : ''}>Söldner-Eskorte anheuern (+${b.price} Gold)</button>
        <button class="mini" data-a="unmerc" ${m <= 0 ? 'disabled' : ''}>Eine abbestellen</button>
      </div>
      <p class="small soft">Wer einen Kampf verliert, zieht sich zurück: das Flaggschiff kehrt zum Ausgangsort zurück, die Festung bleibt bestehen. Der erste Sieg zahlt voll${b.firstClear ? '' : ' (du hast diese Festung schon einmal erobert: die Wiederholung zahlt die Hälfte)'}.</p>
      <button class="primary" data-a="go" data-focus>Belagerung beginnen</button>
      <button class="secondary" data-a="back">Abbrechen</button>`,
      {
        merc: () => re(m + 1),
        unmerc: () => re(Math.max(0, m - 1)),
        go: () => { const err = g.beginRaid(def, m); if (err) re(m, err); },
        back,
      },
      back,
      { wide: true },
    );
  }

  // ---------- Gespräche und Läden ----------

  /** Gespräch mit einer Stadtbewohnerin/einem Stadtbewohner. done = gerade abgeschlossene Aufträge */
  /** Wohin „Auf Wiedersehen“ führt (Spiel oder Hafenmenü) */
  dialogExit: () => void = () => this.game.resume();

  showDialog(npc: TownNpcDef, done: QuestDef[] = [], msg = '') {
    const g = this.game;
    const exit = this.dialogExit;
    const qs = g.questSys;
    const save = g.saveData;
    if (!qs || !save) return;
    const offers = qs.available(npc.id);
    const running = save.progress.quests.map((p) => QUEST_BY_ID[p.id]).filter((q) => q && q.giver === npc.id);
    const line = npc.greet[Math.floor(Math.random() * npc.greet.length)];
    const reward = (q: QuestDef) => [`${q.reward.gold} Gold`, `${q.reward.xp} EP`, `${q.reward.fame} Ruhm`, q.reward.sp ? `${q.reward.sp} Faji-Punkt${q.reward.sp > 1 ? 'e' : ''}` : ''].filter(Boolean).join(' · ');
    const shopBtn: Record<ShopKind, string> = {
      smith: 'Waffen &amp; Rüstung ansehen', market: 'Proviant kaufen', shrine: 'Zum Faji-Schrein', shipyard: 'Zur Werft',
      tavern: `Rasten bis zum Morgen (${g.restPrice()} Gold)`, harbor: 'Seekarte &amp; Logbuch',
    };
    this.open(
      `<div class="dlg-head"><div class="dlg-face">${esc(npc.name[0])}</div><div><b>${esc(npc.name)}</b><span class="soft small">${esc(npc.title)}</span></div></div>
      ${done.map((q) => `<div class="dlg-done"><b>Auftrag erfüllt: ${esc(q.title)}</b><p class="dlg-line">„${esc(q.outro)}“</p><p class="small"><b>Belohnung:</b> ${reward(q)}</p></div>`).join('')}
      ${done.length ? '' : `<p class="dlg-line">„${esc(line)}“</p>`}
      ${msg ? `<p class="note">${esc(msg)}</p>` : ''}
      ${offers.map((q) => `<div class="slot${q.main ? ' main' : ''}"><div class="slot-head"><b>${esc(q.title)}</b><span>${q.main ? 'Hauptgeschichte' : 'Auftrag'}</span></div>
        <p class="dlg-line small">„${esc(qs.introOf(q))}“</p><p class="small soft">Belohnung: ${reward(q)}</p>
        <button class="mini brass" data-a="accept" data-id="${q.id}">Annehmen</button></div>`).join('')}
      ${running.map((q) => { const st = qs.step(q!.id); return st ? `<p class="small soft">Laufend: <b>${esc(q!.title)}</b> – ${esc(st.text)}</p>` : ''; }).join('')}
      ${npc.shop ? `<button class="secondary" data-a="shop">${shopBtn[npc.shop]}</button>` : ''}
      ${npc.shop === 'tavern' ? `<button class="secondary" data-a="hire">Crew anheuern</button>
        <button class="secondary" data-a="sailors" ${g.crewRefillCost() <= 0 ? 'disabled' : ''}>${g.crewRefillCost() > 0 ? `Matrosen für das Schiff anheuern (${g.crewRefillCost()} Gold)` : 'Mannschaft vollzählig'}</button>
        ${this.troopButton()}
        <div class="opt"><span class="label">Würfeln mit Baldo</span><div class="row">${[20, 50, 200].map((b) => `<button class="mini" data-a="dice" data-id="${b}">${b} Gold setzen</button>`).join('')}</div></div>` : ''}
      <button class="primary" data-a="bye" data-focus>Auf Wiedersehen</button>`,
      {
        accept: (id) => { g.acceptQuest(id); this.showDialog(npc, [], 'Auftrag angenommen! Das Ziel siehst du oben rechts.'); },
        shop: () => this.openShop(npc),
        hire: () => this.showHire(() => this.showDialog(npc)),
        sailors: () => this.showDialog(npc, [], g.refillCrew()),
        troops: () => this.showTroops(() => this.showDialog(npc)),
        dice: (id) => this.showDialog(npc, [], g.dice(+id)),
        bye: exit,
      },
      exit,
    );
  }

  /** Erzähltafel für Kapitelanfänge und das Ende */
  showStory(title: string, text: string, done: () => void) {
    this.open(
      `<div class="story"><p class="kicker">Sturmkrone</p><h2 class="fell">${esc(title)}</h2><p class="dlg-line">${esc(text)}</p></div>
      <button class="primary" data-a="go" data-focus>Weiter</button>`,
      { go: done },
      done,
    );
  }

  // ---------- Hafen (direkt vom Schiff aus, wie in 1.0) ----------

  private harborDef: IslandDef | null = null;
  showHarbor(msg = '', def: IslandDef | null = this.harborDef) {
    const g = this.game;
    const s = g.saveData;
    const qs = g.questSys;
    if (!s || !qs) return;
    this.harborDef = def;
    const town = !def || def.kind === 'town';
    const back = () => this.showHarbor();
    const mark = (id: string) => qs.available(id).length ? ' <b class="pip">!</b>' : s.progress.quests.some((p) => { const st = qs.step(p.id); return st?.type === 'talk' && st.npc === id; }) ? ' <b class="pip ok">?</b>' : '';
    this.open(
      `<h2 class="fell">Hafen von ${esc(def?.name ?? 'Ankerglück')}</h2>
      ${goldLine(g.playerGold, msg)}
      ${this.harborRepNote()}
      ${def && g.islandOccupation(def.id) ? `<p class="note">⚑ <b>In deiner Hand</b> · noch ${esc(g.islandOccupation(def.id)!.text)}. Sicherer Hafen: Werft, Truppen und Rast stehen dir offen.</p>` : ''}
      ${town ? `<h3>Bewohner</h3>
      <div class="grid2">${TOWN_NPCS.map((n) => `<button class="secondary" data-a="talk" data-id="${n.id}">${esc(n.name)}${mark(n.id)}<small>${esc(n.title)}</small></button>`).join('')}</div>` : `<p class="dlg-line">${esc(def?.info ?? '')}</p>`}
      <h3>Läden</h3>
      <div class="grid2">
        <button class="secondary" data-a="yard">Werft</button>
        <button class="secondary" data-a="smith">Schmiede</button>
        <button class="secondary" data-a="market">Markt</button>
        <button class="secondary" data-a="shrine">Faji-Schrein</button>
        <button class="secondary" data-a="hire">Crew anheuern</button>
        <button class="secondary" data-a="sailors" ${g.crewRefillCost() <= 0 ? 'disabled' : ''}>${g.crewRefillCost() > 0 ? `Matrosen (${g.crewRefillCost()} Gold)` : 'Mannschaft vollzählig'}</button>
        ${this.troopButton()}
        <button class="secondary" data-a="rest">Rasten (${g.restPrice()} Gold)</button>
      </div>
      <button class="secondary" data-a="rep">Ruf &amp; Ehre</button>
      <button class="secondary" data-a="ashore">An Land gehen und durch die Stadt laufen</button>
      <button class="primary" data-a="leave" data-focus>Ablegen</button>`,
      {
        talk: (id) => { const n = TOWN_NPCS.find((x) => x.id === id); if (n) { this.dialogExit = back; g.talkInHarbor(n); } },
        yard: () => this.showShipyard('', back),
        smith: () => this.showSmith(back),
        market: () => this.showMarket(back),
        shrine: () => this.showShrine(back),
        hire: () => this.showHire(back),
        sailors: () => this.showHarbor(g.refillCrew()),
        troops: () => this.showTroops(back),
        rest: () => this.showHarbor(g.rest()),
        rep: () => this.showReputation(back),
        ashore: () => { g.resume(); g.world.goAshore(); },
        leave: () => { g.resume(); g.world.castOff(); },
      },
      () => g.resume(),
      { wide: true },
    );
  }

  /** Hinweis im Hafenmenü: Ansehen bei der Hafenmacht und Rabatt */
  private harborRepNote(): string {
    const h = this.game.harborStanding();
    if (!h) return '';
    const parts = [h.discount > 0 ? `${Math.round(h.discount * 100)} % Rabatt auf Werft, Heuer und Bett` : 'Mit mehr Ansehen gibt es Hafenrabatt (ab „Freundlich“)'];
    if (h.blueprints > 0) parts.push(`Baupläne: Werft −${Math.round(h.blueprints * 100)} %`);
    return `<p class="note"><b style="color:${h.color}">${esc(h.name)}</b> · ${esc(h.tier)} · ${parts.join(' · ')}</p>`;
  }

  // ---------- Ruf & Ehre ----------

  showReputation(back: () => void, msg = '') {
    const g = this.game;
    const v = g.reputationView();
    const bar = (st: number) => `<span class="repbar" aria-hidden="true"><i style="left:${Math.round((st + 100) / 2)}%"></i></span>`;
    const rows = v.rows.map((r) => `<div class="slot rep" style="--c:${r.color}">
      <div class="slot-head"><b style="color:${r.color}">${esc(r.name)}</b><span>${esc(r.tier)} (${r.standing > 0 ? '+' : ''}${r.standing})</span></div>
      ${bar(r.standing)}
      <div class="meta">Ehre ${r.honor} · ${esc(r.title)}${r.discount > 0 ? ` · Hafenrabatt ${Math.round(r.discount * 100)} %` : ''}${r.id === 'marine' && v.service ? ' · <b>Dienststatus</b>: Marine-Schiffe helfen dir, Weißwacht ist dein Stützpunkt' : ''}${r.bounty > 0 ? ` · <b class="warn">Kopfgeld ${fmtInt(r.bounty)} Gold</b>` : ''}</div>
      ${r.bounty > 0 ? `<button class="mini brass" data-a="pay" data-id="${r.id}" ${g.inHarbor && v.gold >= r.bounty ? '' : 'disabled'}>Kopfgeld bezahlen (${fmtInt(r.bounty)} Gold)${g.inHarbor ? '' : ' – nur im Hafen'}</button>` : ''}
    </div>`).join('');
    this.open(
      `<h2 class="fell">Ruf &amp; Ehre</h2>
      ${goldLine(v.gold, msg)}
      <p class="small soft">Wer in einer Seeschlacht an der Grenze nur <b>eine</b> Seite beschießt, ergreift Partei und gewinnt Ehre und Ansehen. Wer <b>beide</b> Seiten angreift, erntet den größten Loot, verliert aber überall Ansehen und wird von Kopfgeldjägern und der Marine gejagt. Ab „Freundlich“ passieren dich die Schiffe einer Macht in ihrem Sektor friedlich, im Hafen gibt es Rabatt.</p>
      ${rows}
      <h3>Seeschlachten &amp; Baupläne</h3>
      <p class="small">Miterlebt: <b>${v.battles.joined}</b> · Partei ergriffen: <b>${v.battles.sided}</b> · Beide Seiten: <b>${v.battles.both}</b></p>
      <p class="small">${v.blueprints.length ? `Baupläne: ${v.blueprints.map((b) => esc(FACTIONS[b.replace('bauplan_', '') as FactionId]?.name ?? b)).join(', ')} · Werft −${Math.round(v.blueprintDiscount * 100)} %` : 'Noch keine Baupläne erbeutet (Doppelspiel in einer Seeschlacht bringt sie).'}</p>
      ${v.log.length ? `<h3>Letzte Taten</h3>${v.log.map((l) => `<p class="small soft">${esc(l.text)}</p>`).join('')}` : ''}
      <button class="primary" data-a="back" data-focus>Zurück</button>`,
      { pay: (id) => this.showReputation(back, g.payBounty(id as FactionId)), back },
      back,
      { wide: true },
    );
  }

  // ---------- Crew ----------

  showHire(back: () => void, msg = '') {
    const g = this.game;
    const s = g.saveData;
    if (!s) return;
    const rank = g.playerRank;
    const free = CREW.filter((c) => !s.crew.hired.includes(c.id));
    this.open(
      `<h2 class="fell">Crew anheuern</h2>
      <p class="soft">Gold: <b>${fmtInt(g.playerGold)}</b> · Crew an Bord: ${s.crew.hired.length}${msg ? ` · <b>${esc(msg)}</b>` : ''}</p>
      ${free.length ? free.map((c) => `<div class="slot crew" style="--c:${c.col}"><div class="slot-head"><b>${esc(c.name)}</b><span>${fmtInt(c.price)} Gold</span></div>
        <div class="meta"><b>${esc(c.job)}</b> · ${CREW_ROLE_LABEL[c.role]}${rank < c.rank ? ` · ab Rang „${RANKS[s.player.faction][c.rank]}“` : ''}<br>${esc(c.perk)}${c.skill ? `<br><i>${esc(c.skill.n)}:</i> ${esc(c.skill.d)}` : ''}</div>
        <p class="dlg-line small">„${esc(c.quote)}“</p>
        <button class="mini brass" data-a="hire" data-id="${c.id}" ${rank < c.rank ? 'disabled' : ''}>Anheuern</button></div>`).join('') : '<p>Alle sechzehn sind schon an Bord. Was für eine Crew!</p>'}
      <button class="primary" data-a="back">Zurück</button>`,
      { hire: (id) => this.keep(() => { this.showHire(back, g.hireCrew(id)); }), back },
      back,
      { wide: true },
    );
  }

  /** Knopf „Truppen“ für Taverne, Hafen und Werft: öffnet die Anheuerung; ohne Truppenplätze nur ein Hinweis */
  private troopButton(): string {
    const st = this.game.troopStatus();
    if (st.cap <= 0) return '<button class="secondary" data-a="troops" disabled>Truppen (ab dem Leviathan)</button>';
    return `<button class="secondary" data-a="troops">Truppen anheuern (${st.heads}/${st.cap})</button>`;
  }

  /** Massentruppen anheuern (Stufe 2 der Crew): namenlose Söldnertrupps je Typ, Handgeld je Kopf, Kapazität des Schiffs */
  showTroops(back: () => void, msg = '') {
    const g = this.game;
    const s = g.saveData;
    if (!s) return;
    const st = g.troopStatus();
    const roster = cleanRoster(s.crew.troops);
    const re = (m = '') => this.keep(() => { this.showTroops(back, m); });
    const frac = st.cap > 0 ? Math.min(1, st.heads / st.cap) : 0;
    this.open(
      `<h2 class="fell">Truppen anheuern</h2>
      ${goldLine(g.playerGold, msg)}
      <p class="small soft">Massentruppen sind namenlose Söldner ohne Treue und Aufträge. Sie ziehen beim Entern und bei Landgängen mit in den Kampf, fallen bei Verlusten und werden hier wieder aufgefüllt. Bei Beschuss auf See fallen zuerst die Truppen, dann die Seeleute; Offiziere sterben nie.</p>
      ${st.cap <= 0 ? `<p class="note">Dein Schiff trägt keine Massentruppen – erst der Leviathan hat Platz für ${troopCapacity(SHIP_CLASSES.length - 1)} Mann.</p>` : `
      <div class="loy"><span>Truppen</span>${gaugeHtml(frac, { color: '#B4472F' })}<b>${st.heads}/${st.cap}</b></div>
      ${st.rankOk ? '' : `<p class="note">Anheuern ab dem Rang „${esc(st.rankName)}“.</p>`}
      ${TROOP_TYPES.map((t) => {
        const d = TROOPS[t], n = roster[t] ?? 0, room = st.cap - st.heads;
        const fill = Math.min(room, Math.floor(g.playerGold / d.price));
        const off = !st.rankOk || room <= 0;
        return `<div class="slot crew" style="--c:${d.cloth}"><div class="slot-head"><b>${esc(d.label)}</b><span>${d.price} Gold je Kopf</span></div>
          <div class="meta">${esc(d.desc)}<br>An Bord: <b>${n}</b> · Lebenspunkte ${d.hp} · Schaden ${String(d.dmg).replace('.', ',')} je Kopf · ${d.ranged ? 'Fernkampf' : 'Nahkampf'}</div>
          <div class="row"><button class="mini brass" data-a="troop" data-id="${t}|10" ${off || g.playerGold < d.price ? 'disabled' : ''}>+10 (${d.price * Math.min(10, Math.max(1, room))} Gold)</button>
          <button class="mini" data-a="troop" data-id="${t}|all" ${off || fill <= 0 ? 'disabled' : ''}>Auffüllen${room > 0 ? ` (${fill} Mann, ${fill * d.price} Gold)` : ''}</button></div></div>`;
      }).join('')}`}
      <button class="primary" data-a="back">Zurück</button>`,
      { troop: (id) => { const [t, n] = id.split('|'); re(g.recruitTroops(t as TroopType, n === 'all' ? Infinity : +n)); }, back },
      back,
      { wide: true },
    );
  }

  showCrew(back: () => void, msg = '') {
    const g = this.game;
    const s = g.saveData;
    const qs = g.questSys;
    if (!s || !qs) return;
    const re = (m = '') => this.keep(() => { this.showCrew(back, m); });
    this.open(
      `<h2 class="fell">Crew</h2>
      <p class="soft small">Bis zu <b>${g.officerSlots()}</b> Offiziere bilden deinen <b>Landtrupp</b> und kämpfen an Land und beim Entern an deiner Seite (Plätze wachsen mit der Schiffsklasse: Schaluppe/Brigg 2 · Korvette/Fregatte 3 · Galeone/Linienschiff 4 · Leviathan 5). Treue wächst mit jedem gemeinsamen Sieg und mit persönlichen Aufträgen – bei voller Treue kämpfen sie 30 % stärker.</p>
      <p class="small"><b>Landtrupp: ${activeParty(s.crew.party, s.ship.tier).length}/${g.officerSlots()}</b>${s.crew.party.length > g.officerSlots() ? ` · ${s.crew.party.length - g.officerSlots()} in Reserve (dein Schiff hat nicht mehr Plätze)` : ''}</p>
      ${msg ? `<p class="note">${esc(msg)}</p>` : ''}
      ${s.crew.hired.length ? s.crew.hired.map((id) => {
        const c = CREW_BY_ID[id];
        if (!c) return '';
        const loy = s.crew.loyalty[id] ?? 0;
        const inParty = s.crew.party.includes(id);
        const reserve = inParty && !activeParty(s.crew.party, s.ship.tier).includes(id);
        const offer = qs.available(id)[0];
        const turnIn = s.progress.quests.some((p) => { const st = qs.step(p.id); return st?.type === 'talk' && st.npc === id; });
        return `<div class="slot crew" style="--c:${c.col}"><div class="slot-head"><b>${esc(c.name)}</b><span>${esc(c.job)}</span></div>
          <div class="meta">${CREW_ROLE_LABEL[c.role]} · ${esc(c.perk)}${c.skill ? `<br><i>${esc(c.skill.n)}:</i> ${esc(c.skill.d)}` : ''}</div>
          <div class="loy"><span>Treue</span>${gaugeHtml(loy / 100, { color: loy >= 100 ? '#FFD166' : c.col })}<b>${loy >= 100 ? 'Treu' : loy}</b></div>
          <div class="row">${c.cat ? '' : `<button class="mini${inParty ? ' brass' : ''}" data-a="party" data-id="${id}" aria-pressed="${inParty}">${reserve ? 'In Reserve (Schiff zu klein)' : inParty ? 'Im Landtrupp ✓' : 'In den Landtrupp'}</button>`}
          <button class="mini" data-a="talk" data-id="${id}">Sprechen${offer ? ' <b class="pip">!</b>' : turnIn ? ' <b class="pip ok">?</b>' : ''}</button></div></div>`;
      }).join('') : '<p>Noch niemand an Bord. In der Taverne von Ankerglück suchen Seeleute Arbeit.</p>'}
      <button class="primary" data-a="back">Zurück</button>`,
      {
        party: (id) => re(g.toggleParty(id)),
        talk: (id) => this.showCrewTalk(id, () => re()),
        back,
      },
      back,
      { wide: true },
    );
  }

  private showCrewTalk(id: string, back: () => void, msg = '') {
    const g = this.game;
    const qs = g.questSys;
    const c = CREW_BY_ID[id];
    if (!qs || !c) return;
    const done = msg ? [] : g.talkCrew(id);
    const offer = qs.available(id)[0];
    const line = c.lines[Math.floor(Math.random() * c.lines.length)];
    const reward = (q: QuestDef) => [`${q.reward.gold} Gold`, `${q.reward.xp} EP`, q.reward.sp ? `${q.reward.sp} Faji-Punkt${q.reward.sp > 1 ? 'e' : ''}` : '', '+40 Treue'].filter(Boolean).join(' · ');
    const running = g.saveData!.progress.quests.find((p) => QUEST_BY_ID[p.id]?.giver === id);
    this.open(
      `<div class="dlg-head"><div class="dlg-face" style="background:${c.col}">${esc(c.name[0])}</div><div><b>${esc(c.name)}</b><span class="soft small">${esc(c.job)}</span></div></div>
      ${done.map((q) => `<div class="dlg-done"><b>Erledigt: ${esc(q.title)}</b><p class="dlg-line">„${esc(q.outro)}“</p><p class="small"><b>Belohnung:</b> ${reward(q)}</p></div>`).join('')}
      ${done.length ? '' : `<p class="dlg-line">„${esc(line)}“</p>`}
      ${msg ? `<p class="note">${esc(msg)}</p>` : ''}
      ${offer ? `<div class="slot main"><div class="slot-head"><b>${esc(offer.title)}</b><span>Persönlich</span></div><p class="dlg-line small">„${esc(qs.introOf(offer))}“</p><p class="small soft">Belohnung: ${reward(offer)}</p><button class="mini brass" data-a="accept" data-id="${offer.id}">Versprechen</button></div>` : ''}
      ${running ? `<p class="small soft">Laufend: <b>${esc(QUEST_BY_ID[running.id].title)}</b> – ${esc(qs.step(running.id)?.text ?? '')}</p>` : ''}
      <button class="primary" data-a="back" data-focus>Zurück</button>`,
      { accept: (qid) => { g.acceptQuest(qid); this.showCrewTalk(id, back, 'Versprochen! Das Ziel siehst du oben rechts.'); }, back },
      back,
    );
  }

  showLoot(back: () => void) {
    const g = this.game;
    const s = g.saveData;
    if (!s) return;
    const re = () => this.keep(() => { this.showLoot(back); });
    const got = ACHIEVEMENTS.filter((a) => s.progress.flags[`ach_${a.id}`]).length;
    this.open(
      `<h2 class="fell">Talismane &amp; Erfolge</h2>
      <h3>Talismane (${s.gear.trinkets.length}/${TRINKETS.length})</h3>
      <p class="soft small">Ein Talisman kann angelegt sein. Legenden, Bosse, Ruinen, Geisterschiffe und Schätze lassen welche fallen.</p>
      ${s.gear.trinkets.length ? s.gear.trinkets.map((id) => { const t = TRINKET_BY_ID[id]; if (!t) return ''; const r = RARITY[t.rarity]; const on = s.gear.trinket === id; return `<div class="slot crew" style="--c:${r.col}"><div class="slot-head"><b>${r.mark} ${esc(t.n)}${on ? ' ✓' : ''}</b><span style="color:${r.col}">${r.n}</span></div><div class="meta">${esc(t.d)}</div>${on ? '' : `<button class="mini brass" data-a="eq" data-id="${id}">Anlegen</button>`}</div>`; }).join('') : '<p class="soft">Noch keine gefunden.</p>'}
      <h3>Erfolge (${got}/${ACHIEVEMENTS.length})</h3>
      <div class="ach">${ACHIEVEMENTS.map((a) => { const ok = !!s.progress.flags[`ach_${a.id}`]; const p = a.prog ? a.prog(s) : ok ? 1 : 0; return `<div class="ach-i${ok ? ' ok' : ''}"><b>${ok ? '🏆' : '🔒'} ${esc(a.n)}</b><span>${esc(a.d)}</span>${ok ? '' : gaugeHtml(p)}</div>`; }).join('')}</div>
      <button class="primary" data-a="back" data-focus>Zurück</button>`,
      { eq: (id) => { g.equipTrinket(id); re(); }, back },
      back,
      { wide: true },
    );
  }

  showRanking(back: () => void) {
    const g = this.game;
    const s = g.saveData;
    if (!s) return;
    const rows = g.rankList();
    const myPlace = rows.findIndex((r) => r.me) + 1;
    const hostile = hostileLegends(s.player.faction);
    this.open(
      `<h2 class="fell">Rangliste der Legenden</h2>
      <p class="soft">Du stehst auf <b>Platz ${myPlace}</b> von ${rows.length} der ${s.player.faction === 'pirat' ? 'Piraten' : 'Marine'}. Besiege Legenden, um aufzusteigen.</p>
      <ol class="rank">${rows.map((r) => `<li class="${r.me ? 'me' : ''}"><b>${esc(r.n)}</b><span>${esc(r.t)} · Stufe ${r.lvl}</span><em>${fmtInt(r.ruhm)} Ruhm</em></li>`).join('')}</ol>
      <h3>Gesuchte Legenden</h3>
      ${hostile.map((l) => { const b = s.legends.includes(l.id); const home = g.world.islandDefs.find((i) => i.id === l.home); return `<div class="slot legend${b ? ' beaten' : ''}" style="--c:${l.col}"><div class="slot-head"><b>${esc(l.n)}</b><span>${b ? 'Besiegt ✓' : `Stufe ${l.lvl}`}</span></div><div class="meta"><i>${esc(l.t)}</i> · ${l.faction === 'pirat' ? 'Piratin/Pirat' : 'Marine'} · kreuzt bei ${esc(home?.name ?? '?')}<br>${esc(l.bio)}</div></div>`; }).join('')}
      ${s.progress.done.includes('k1') ? '' : '<p class="note">Die Legenden nehmen dich erst ernst, wenn du Kapitel 1 abgeschlossen hast.</p>'}
      <button class="primary" data-a="back" data-focus>Zurück</button>`,
      { back },
      back,
      { wide: true },
    );
  }

  /** Laden öffnen; back führt zurück (Standard: das alte Gesprächsmenü) */
  openShop(npc: TownNpcDef, backTo?: () => void) {
    const back = backTo ?? (() => this.showDialog(npc));
    switch (npc.shop) {
      case 'smith': this.showSmith(back); break;
      case 'market': this.showMarket(back); break;
      case 'shrine': this.showShrine(back); break;
      case 'shipyard': this.showShipyard('', back); break;
      case 'tavern': this.showDialog(npc, [], this.game.rest()); break;
      case 'harbor': this.showMap('karte', back); break;
    }
  }

  private shopHead(title: string, msg: string) {
    return `<h2 class="fell">${title}</h2>${goldLine(this.game.playerGold, msg)}`;
  }

  showSmith(back: () => void, msg = '') {
    const g = this.game;
    const s = g.saveData;
    if (!s) return;
    const rank = g.playerRank;
    const re = (m: string) => this.keep(() => { this.showSmith(back, m); });
    const row = (n: string, stat: string, price: number, needRank: number, owned: boolean, worn: boolean, a: string, i: number) => `<div class="slot"><div class="slot-head"><b>${esc(n)}${worn ? ' ✓' : ''}</b><span>${owned ? (worn ? 'Angelegt' : 'Überholt') : `${fmtInt(price)} Gold`}</span></div>
      <div class="meta">${stat}${needRank > rank && !owned ? ` · ab Rang „${RANKS[s.player.faction][needRank]}“` : ''}</div>
      ${owned ? '' : `<button class="mini brass" data-a="${a}" data-id="${i}" ${needRank > rank ? 'disabled' : ''}>Kaufen</button>`}</div>`;
    this.open(
      `${this.shopHead('Schmiede', msg)}
      <h3>${WEAPON_LINES[s.player.style].title}</h3><p class="small soft">${WEAPON_LINES[s.player.style].flavor}</p>${WEAPONS.map((w, i) => row(WEAPON_LINES[s.player.style].names[i] ?? w.n, WEAPON_LINES[s.player.style].stat(w, i), w.price, w.rank, i <= s.gear.weapon, i === s.gear.weapon, 'wpn', i)).join('')}
      <h3>Rüstung</h3>${ARMOR.map((a, i) => row(a.n, `+${a.hp} Leben`, a.price, a.rank, i <= s.gear.armor, i === s.gear.armor, 'arm', i)).join('')}
      <p class="small soft">Dein altes Stück nimmt Grete für den halben Preis in Zahlung.</p>
      <button class="primary" data-a="back">Zurück</button>`,
      { wpn: (id) => re(g.buyGear('weapon', +id)), arm: (id) => re(g.buyGear('armor', +id)), back },
      back,
      { wide: true },
    );
  }

  showMarket(back: () => void, msg = '') {
    const g = this.game;
    const s = g.saveData;
    if (!s) return;
    const re = (m: string) => this.showMarket(back, m);
    this.open(
      `${this.shopHead('Markt', msg)}
      <div class="slot"><div class="slot-head"><b>${PROVIANT.n}</b><span>${PROVIANT.price} Gold</span></div>
        <div class="meta">Heilt ${Math.round(PROVIANT.heal * 100)} % deiner Lebenspunkte. Du trägst ${s.gear.potions} von ${PROVIANT.max}.</div>
        <div class="row"><button class="mini brass" data-a="buy" data-id="1" ${s.gear.potions >= PROVIANT.max ? 'disabled' : ''}>1 kaufen</button><button class="mini brass" data-a="buy" data-id="${PROVIANT.max}" ${s.gear.potions >= PROVIANT.max ? 'disabled' : ''}>Auffüllen</button></div></div>
      <p class="small soft">Essen: Taste <kbd>${esc(g.input.keyLabel(g.input.getKeyBindings().potion?.[0] ?? 'KeyH'))}</kbd> oder der grüne Knopf am Handy. Alle Güter landen in der Schnellleiste (Tasten 1–4, Inventar: <kbd>${esc(g.input.keyLabel(g.input.getKeyBindings().inventory?.[0] ?? 'KeyI'))}</kbd>).</p>
      <h3>Tränke, Stärkungen und Schiffsbedarf</h3>
      ${CONSUMABLES.filter((c) => c.id !== 'proviant').map((c) => { const n = itemCount(s.gear, c.id); return `<div class="slot"><div class="slot-head"><b>${c.icon} ${esc(c.n)}</b><span>${c.price} Gold</span></div>
        <div class="meta">${esc(c.d)} Du trägst ${n} von ${c.max}.</div>
        <div class="row"><button class="mini brass" data-a="item" data-id="${c.id}" ${n >= c.max ? 'disabled' : ''}>Kaufen</button></div></div>`; }).join('')}
      <h3>Ausrüster: Rüstungssets</h3>
      <p class="small soft">Epische und legendäre Sets gibt es nur als Beute. Jedes Stück ist im Editor färbbar.</p>
      ${SETS.filter((set) => set.rarity === 'gewoehnlich' || set.rarity === 'selten').map((set) => `<div class="slot"><div class="slot-head"><b style="color:${RARITY[set.rarity].col}">${RARITY[set.rarity].mark} ${esc(set.n)}</b><span>ab Stufe ${set.level}</span></div><div class="meta">${esc(set.d)}</div>
        ${(Object.keys(set.pieces) as GearCat[]).map((c) => { const d = EQUIP_BY_ID[`${set.id}_${c}`]; const own = s.gear.loot?.includes(d.id); return `<div class="slot-head"><span>${esc(CAT_LABEL[catOf(d)])}: ${esc(d.n)} <small class="soft">${esc(d.d ?? '')}</small></span>${own ? '<span>gekauft</span>' : `<button class="mini brass" data-a="loot" data-id="${d.id}" ${s.player.level < (d.level ?? 1) ? 'disabled' : ''}>${d.price} Gold</button>`}</div>`; }).join('')}</div>`).join('')}
      <h3>Kopfbedeckungen</h3>
      ${HEADS.map((h) => { const own = s.gear.heads?.includes(h.id); return `<div class="slot"><div class="slot-head"><b>🎩 ${esc(h.n)}</b><span>${own ? 'gekauft' : `${h.price} Gold`}</span></div>
        <div class="meta">${esc(h.d)}${h.rank > g.playerRank && !own ? ` · ab Rang „${RANKS[s.player.faction][h.rank]}“` : ''}</div>
        ${own ? '' : `<div class="row"><button class="mini brass" data-a="head" data-id="${h.id}" ${h.rank > g.playerRank ? 'disabled' : ''}>Kaufen und aufsetzen</button></div>`}</div>`; }).join('')}
      <h3>Schienen, Stiefel und Schilde</h3>
      ${GEAR.map((d) => { const own = s.gear.owned?.includes(d.id); return `<div class="slot"><div class="slot-head"><b>${d.icon} ${esc(d.n)}</b><span>${own ? 'gekauft' : `${d.price} Gold`}</span></div>
        <div class="meta">${SLOT_LABEL[d.slot]} · ${esc(d.d)}${d.rank > g.playerRank && !own ? ` · ab Rang „${RANKS[s.player.faction][d.rank]}“` : ''}</div>
        ${own ? '' : `<div class="row"><button class="mini brass" data-a="piece" data-id="${d.id}" ${d.rank > g.playerRank ? 'disabled' : ''}>Kaufen und anlegen</button></div>`}</div>`; }).join('')}
      <button class="primary" data-a="back">Zurück</button>`,
      { buy: (id) => re(g.buyPotions(+id)), item: (id) => re(g.buyItem(id)), head: (id) => re(g.buyHead(id)), piece: (id) => re(g.buyPiece(id)), loot: (id) => re(g.buyLoot(id)), back },
      back,
      { wide: true },
    );
  }

  showShrine(back: () => void, msg = '') {
    const g = this.game;
    const s = g.saveData;
    if (!s) return;
    const price = SHRINE_PRICE(s.gear.shrine);
    this.open(
      `${this.shopHead('Faji-Schrein', msg)}
      <p class="dlg-line">„Gib dem Schrein Gold, und er gibt dir einen Funken Faji zurück. Je öfter du kommst, desto mehr verlangt er.“</p>
      <div class="slot"><div class="slot-head"><b>Faji-Punkt</b><span>${fmtInt(price)} Gold</span></div>
        <div class="meta">Bisher gekauft: ${s.gear.shrine} · Freie Faji-Punkte: ${s.skills.sp}</div>
        <button class="mini brass" data-a="buy">Opfern</button></div>
      <button class="secondary" data-a="tree">Faji-Baum öffnen</button>
      <button class="primary" data-a="back">Zurück</button>`,
      { buy: () => this.showShrine(back, g.buyShrine()), tree: () => g.openSkills(), back },
      back,
    );
  }

  // ---------- Karte und Logbuch ----------

  showMap(tab: 'karte' | 'welt' | 'logbuch' = 'karte', back: () => void = () => this.game.resume()) {
    const g = this.game;
    const s = g.saveData;
    const qs = g.questSys;
    if (!s || !qs) return;
    const st = s.progress.stats;
    const tracked = qs.tracked();
    const active = s.progress.quests.map((p) => ({ q: QUEST_BY_ID[p.id], p })).filter((x) => x.q);
    const done = s.progress.done.map((id) => QUEST_BY_ID[id]).filter(Boolean);
    const body = tab !== 'logbuch'
      ? `<canvas class="worldmap"></canvas>
        <p class="small soft">★ Ziel · ✕ Schatz · rote Punkte: Feindschiffe · gestrichelt: Weltrand</p>`
      : `<h3>Laufende Aufträge</h3>
        ${active.length ? active.map(({ q, p }) => { const step = q.steps[p.step]; return `<div class="slot${q.main ? ' main' : ''}"><div class="slot-head"><b>${esc(q.title)}</b><span>${tracked?.q.id === q.id ? 'Verfolgt' : q.main ? 'Hauptgeschichte' : ''}</span></div>
          <ol class="steps">${q.steps.map((x, i) => `<li class="${i < p.step ? 'ok' : i === p.step ? 'now' : ''}">${esc(i === p.step && step ? stepText(step, p.count) : x.text)}</li>`).join('')}</ol></div>`; }).join('') : '<p class="soft">Keine – sprich mit den Leuten in Ankerglück.</p>'}
        ${s.progress.maps.length ? `<h3>Schatzkarten</h3><p>${s.progress.maps.map((id) => esc(g.world.islandDefs.find((i) => i.id === id)?.name ?? id)).join(', ')}</p>` : ''}
        <h3>Erledigt</h3>${done.length ? `<p class="small">${done.map((q) => esc(q!.title)).join(' · ')}</p>` : '<p class="soft small">Noch nichts.</p>'}
        <h3>Taten</h3><p class="small">Besiegte Gegner ${st.kills} · Versenkte Schiffe ${st.sunk} · Geenterte Schiffe ${st.boarded} · Gehobene Schätze ${st.treasures} · Gerettete ${st.rescued}</p>`;
    this.open(
      `<h2 class="fell">${tab === 'logbuch' ? 'Logbuch' : tab === 'welt' ? 'Weltkarte' : 'Bernsteinsee'}</h2>
      <div class="tabs"><button data-a="tab" data-id="karte" aria-pressed="${tab === 'karte'}">Bernsteinsee</button><button data-a="tab" data-id="welt" aria-pressed="${tab === 'welt'}">Ganze Welt</button><button data-a="tab" data-id="logbuch" aria-pressed="${tab === 'logbuch'}">Logbuch</button></div>
      ${body}
      <button class="primary" data-a="back" data-focus>Zurück</button>`,
      { tab: (id) => this.showMap(id as 'karte' | 'welt' | 'logbuch', back), back },
      back,
      { wide: true },
    );
    const cv = this.card.querySelector<HTMLCanvasElement>('.worldmap');
    if (cv) {
      const size = Math.max(200, Math.min((cv.parentElement?.clientWidth ?? 560) - 44, innerHeight - 250));
      cv.style.height = `${size}px`;
      cv.style.width = `${size}px`;
      cv.width = cv.height = Math.round(size * Math.min(2, devicePixelRatio));
      const ctx = cv.getContext('2d');
      if (ctx) drawMap(ctx, size, g.world.islandDefs.filter((i) => g.world.discovered.has(i.id)), g.mapMarkers(), tab === 'welt' ? 'world' : 'region', g.mapOpts);
    }
  }

  // ---------- Werft ----------

  showShipyard(msg = '', back: () => void = () => this.showPause()) {
    const g = this.game;
    const st = g.shipState;
    if (!st) return;
    const look = st.look;
    const rank = g.playerRank;
    const rerender = (m = '') => this.keep(() => { this.showShipyard(m, back); });
    const sw = (k: keyof ShipLook, colors: string[]) => `<div class="swatches">${colors.map((c) => `<button class="sw" style="background:${c}" data-a="lk" data-id="${k}|${c}" aria-pressed="${String(look[k]).toUpperCase() === c.toUpperCase()}"></button>`).join('')}</div>`;
    const model = figureheadModel(look.figurehead);
    /** Auswahlkarten mit Vorschau (Flaggen, Galionsfiguren) */
    const cards = (k: 'flag' | 'figurehead', items: { id: string; name: string; glyph: GlyphKind; c1: string; c2?: string; rarity: Rarity; desc: string; on: boolean }[]) =>
      `<div class="pick-grid">${items.map((i) => `<button class="pick-card" data-a="lk" data-id="${k}|${i.id}" aria-pressed="${i.on}" style="--rc:${RARITY[i.rarity].col}" title="${esc(i.desc)}">${glyphSvg(i.glyph, i.c1, i.c2)}<b>${esc(i.name)}</b><small>${RARITY[i.rarity].n}</small></button>`).join('')}</div>`;
    const flagCards = cards('flag', (Object.keys(FLAGS) as (keyof typeof FLAGS)[]).map((id) => ({ id, name: FLAGS[id], glyph: flagGlyph(id), c1: look.flagColor, c2: '#F3E6C8', rarity: 'gewoehnlich' as const, desc: FLAG_DESC[id], on: look.flag === id })));
    const headCards = cards('figurehead', [
      { id: 'keine', name: 'Keine', glyph: 'figurehead', c1: '#6a6458', rarity: 'gewoehnlich', desc: 'Ohne Galionsfigur', on: !model },
      ...FIGUREHEAD_MODELS.map((id) => ({ id, name: FIGUREHEAD_DEFS[id].name, glyph: figureheadGlyph(id), c1: '#d7ae52', c2: '#7a4a22', rarity: FIGUREHEAD_DEFS[id].rarity, desc: FIGUREHEAD_DEFS[id].desc, on: model === id })),
    ]);
    const classes = SHIP_CLASSES.map((c, i) => {
      const owned = st.owned.includes(i);
      const locked = rank < c.rank;
      return `<div class="slot"><div class="slot-head"><b>${c.n}${st.tier === i ? ' ✓' : ''}</b><span>${owned ? 'Im Besitz' : `${fmtInt(c.price)} Gold`}</span></div>
        <div class="meta">Rumpf ${c.hp} · ${c.can} Kanonen je Seite · Tempo ${c.spd} · Crew ${c.crew} · Offiziere ${officerSlots(i)}${troopCapacity(i) > 0 ? ` · Truppen ${troopCapacity(i)}` : ''}${locked && !owned ? ` · ab Rang „${RANKS[g.saveData?.player.faction ?? 'pirat'][c.rank]}“` : ''}</div>
        ${st.tier === i ? '' : `<button class="mini${owned ? '' : ' brass'}" data-a="cls" data-id="${i}" ${locked && !owned ? 'disabled' : ''}>${owned ? 'Wechseln' : 'Kaufen'}</button>`}</div>`;
    }).join('');
    const cost = g.repairCost();
    this.open(
      `<h2 class="fell">Werft</h2>
      ${goldLine(g.playerGold, msg)}
      <p class="small soft">Rumpf ${Math.round(g.world.ship.hull / g.world.ship.maxHull * 100)} % · Segel ${Math.round(g.world.ship.sail * 100)} % · Crew ${Math.round(g.world.ship.crew * 100)} %</p>
      <button class="secondary" data-a="repair" ${cost <= 0 ? 'disabled' : ''}>${cost > 0 ? `Rumpf und Segel reparieren (${cost} Gold)` : 'Rumpf und Segel sind in Ordnung'}</button>
      <button class="secondary" data-a="sailors" ${g.crewRefillCost() <= 0 ? 'disabled' : ''}>${g.crewRefillCost() > 0 ? `Matrosen anheuern (${g.crewRefillCost()} Gold)` : 'Mannschaft vollzählig'}</button>
      ${this.troopButton()}
      <h3>Ausbauten</h3>
      ${SHIP_UPGRADE_IDS.map((k) => { const lv = st.up[k]; const price = g.upgradeCost(k); const u = SHIP_UPGRADES[k]; return `<div class="slot"><div class="slot-head"><b>${u.icon} ${u.n}</b><span>Stufe ${lv}/${SHIP_UPGRADE_MAX}</span></div><div class="meta">${upgradeEffectText(k)} je Stufe · <span class="pips">${'●'.repeat(lv)}${'○'.repeat(SHIP_UPGRADE_MAX - lv)}</span></div>${lv < SHIP_UPGRADE_MAX ? `<button class="mini brass" data-a="up" data-id="${k}">Ausbauen (${fmtInt(price)} Gold)</button>` : ''}</div>`; }).join('')}
      <h3>Schiffsklassen</h3>${classes}
      <h3>Aussehen</h3>
      ${this.optHtml('Rumpf', sw('hull', HULL_COLORS))}
      ${this.optHtml('Zierstreifen', sw('stripe', STRIPE_COLORS))}
      ${this.optHtml('Segel', sw('sail', SAIL_COLORS))}
      ${this.optHtml('Flagge', flagCards + sw('flagColor', ['#1E1A20', '#A8322A', '#1F4E79', '#2F6E4F', '#4A2E6E', '#E3B04B']))}
      ${this.optHtml('Galionsfigur', headCards)}
      ${this.trophyHtml(look)}
      <div class="chips"><button data-a="lanterns" aria-pressed="${look.lanterns}">Laternen</button></div>
      <button class="primary" data-a="back">Fertig</button>`,
      {
        cls: (id) => rerender(g.shipyardSelect(+id)),
        repair: () => rerender(g.shipyardRepair()),
        sailors: () => rerender(g.refillCrew()),
        troops: () => this.showTroops(() => this.showShipyard('', back)),
        up: (id) => rerender(g.shipUpgrade(id as 'can' | 'hull' | 'sail')),
        lk: (id) => { const [k, v] = id.split('|'); g.shipyardLook({ ...look, [k]: v }); rerender(); },
        lanterns: () => { g.shipyardLook({ ...look, lanterns: !look.lanterns }); rerender(); },
        fsail: (id) => { g.applyFactionSail(id as FactionId); rerender(); },
        fown: () => { g.applyFactionSail(null); rerender(); },
        forn: (id) => { g.applyFactionOrnament(id as FactionId); rerender(); },
        back,
      },
      back,
      { wide: true },
    );
  }

  /** Erbeutete Fraktions-Segel und Verzierungen (Raid-Beute): wählbar, solange sie freigeschaltet sind – sie gehen nie verloren */
  private trophyHtml(look: ShipLook): string {
    const u = this.game.shipUnlocks;
    if (!u.sails.length && !u.ornaments.length) return '';
    const sails = u.sails.map((id) => id.slice(5) as FactionId).filter((f) => FACTIONS[f]);
    const orns = u.ornaments.map((id) => id.slice(9) as FactionId).filter((f) => FACTIONS[f]);
    const sailChips = sails.map((f) => `<button data-a="fsail" data-id="${f}" aria-pressed="${look.power === f}">${esc(FACTIONS[f].name)}</button>`).join('');
    const ornChips = orns.map((f) => `<button data-a="forn" data-id="${f}" aria-pressed="${look.figurehead === FACTIONS[f].ship.figurehead && look.stripe === FACTIONS[f].ship.stripe}">${esc(FACTIONS[f].name)}</button>`).join('');
    return `<h3>Erbeutet in Belagerungen</h3>
      ${sails.length ? this.optHtml('Fraktions-Segel', `<div class="chips"><button data-a="fown" aria-pressed="${!look.power}">Eigene Flagge</button>${sailChips}</div>`) : ''}
      ${orns.length ? this.optHtml('Fraktions-Zier', `<div class="chips">${ornChips}</div>`) : ''}`;
  }

  private optHtml(label: string, html: string) { return `<div class="opt"><span class="label">${label}</span>${html}</div>`; }

  // ---------- Welt-Werkstatt (Testwerkzeug) ----------

  showWorkshop() {
    const g = this.game;
    const env = g.world.env;
    const speeds: [number, string][] = [[0, 'Angehalten'], [1, 'Normal'], [30, 'Zeitraffer']];
    const presets: [number, string][] = [[6.6, 'Morgen'], [12, 'Mittag'], [18.5, 'Abendrot'], [23, 'Nacht']];
    const rerender = () => this.keep(() => { this.showWorkshop(); });
    this.open(
      `<h2 class="fell">Welt-Werkstatt</h2>
      <p class="soft small">Zum Ausprobieren von Tageszeit, Wetter und Weltrand. Im fertigen Spiel steuern das Geschichte und Regionen.</p>
      <div class="opt"><span class="label">Uhrzeit</span>
        <label class="slider">Zeit<input type="range" min="0" max="24" step="0.25" value="${env.time.toFixed(2)}" data-input="time"><output>${formatClock(env.time)}</output></label>
        <div class="chips">${presets.map(([h, l]) => `<button data-a="preset" data-id="${h}">${l}</button>`).join('')}</div>
      </div>
      <div class="opt"><span class="label">Zeit läuft</span>
        <div class="chips">${speeds.map(([v, l]) => `<button data-a="speed" data-id="${v}" aria-pressed="${env.timeSpeed === v}">${l}</button>`).join('')}</div>
      </div>
      <div class="opt"><span class="label">Wetter</span>
        <div class="chips">${WEATHER_IDS.map((w) => `<button data-a="weather" data-id="${w}" aria-pressed="${env.weather.target === w}">${WEATHER[w].label}</button>`).join('')}</div>
        <div class="chips" style="margin-top:6px"><button data-a="autow" aria-pressed="${env.weather.auto}">Wetter wechselt von selbst</button></div>
      </div>
      <div class="opt"><span class="label">Orte</span>
        <div class="row"><button class="mini" data-a="edge">Zum Weltrand</button><button class="mini" data-a="home">Zurück zum Start</button><button class="mini" data-a="yard">Werft öffnen</button></div>
      </div>
      <div class="opt"><span class="label">Gold (Test)</span>
        <div class="row"><button class="mini" data-a="gold">+10.000 Gold</button></div>
      </div>
      <div class="opt"><span class="label">Faji (Test)</span>
        <div class="row"><button class="mini" data-a="sp">+5 Faji-Punkte</button><button class="mini" data-a="lvl">+5 Stufen</button><button class="mini" data-a="awaken">Erwachen zeigen</button></div>
      </div>
      <button class="primary" data-a="back">Zurück</button>`,
      {
        time: (val, el) => { env.time = +val; el.parentElement!.querySelector('output')!.textContent = formatClock(+val); },
        preset: (id) => { env.time = +id; rerender(); },
        speed: (id) => { env.timeSpeed = +id; rerender(); },
        weather: (id) => { env.weather.setWeather(id as WeatherId, true); rerender(); },
        autow: () => { env.weather.auto = !env.weather.auto; rerender(); },
        edge: () => { g.world.teleport(EDGE_WALL - 160, 0, Math.PI / 2); g.resume(); g.hud.toast('Vor dir liegt der Weltrand …', 3); },
        home: () => { g.world.teleportHome(); g.resume(); },
        yard: () => this.showShipyard('', () => this.showWorkshop()),
        gold: () => { const total = g.testGold(10000); g.hud.toast(`+10.000 Gold (jetzt ${fmtInt(total)})`); },
        sp: () => { g.testGrant(5, 0); g.hud.toast('+5 Faji-Punkte'); },
        lvl: () => { g.testGrant(5, 5); g.hud.toast('+5 Stufen'); },
        awaken: () => { g.resume(); g.checkAwakening('koerper'); },
        back: () => this.showPause(),
      },
      () => this.showPause(),
    );
  }

  // ---------- Einstellungen ----------

  /** Einstellungen eines Bereichs zurücksetzen (die Grafikstufe wird dabei wieder automatisch gewählt) */
  private resetSettings(tab: SettingsTab) {
    if (tab === 'grafik') this.game.setQuality('auto');
    this.game.settings.reset(tab);
  }

  /** Regler: Anzeige neben dem Regler und Füllung der Schiene nachführen */
  private slide(el: HTMLElement, value: number, unit: string) {
    el.style.setProperty('--fill', `${((value - +(el as HTMLInputElement).min) / (+(el as HTMLInputElement).max - +(el as HTMLInputElement).min)) * 100}%`);
    el.parentElement!.querySelector('output')!.textContent = `${value}${unit}`;
  }

  showSettings(back: () => void, tab: SettingsTab = this.settingsTab) {
    this.settingsTab = tab;
    const g = this.game;
    const s = g.settings.data;
    const tabs: [SettingsTab, string][] = [['grafik', 'Grafik & Leistung'], ['steuerung', 'Steuerung'], ['ton', 'Audio'], ['anzeige', 'HUD & Spiel']];
    let body = '';
    const handlers: Record<string, Handler> = {
      tab: (id) => this.showSettings(back, id as SettingsTab),
      compendium: () => this.showCompendium(() => this.showSettings(back, tab)),
      reset: () => this.confirm(
        'Alle Einstellungen dieses Bereichs auf die Standardwerte zurücksetzen?', 'Zurücksetzen',
        () => { this.resetSettings(tab); this.game.hud.toast('Standardwerte wiederhergestellt.'); this.showSettings(back, tab); },
        () => this.showSettings(back, tab),
      ),
      back: () => back(),
    };
    const rerender = () => this.keep(() => this.showSettings(back, tab));

    if (tab === 'grafik') {
      const cur = g.renderer.tier;
      const size = g.renderer.drawSize();
      body = `<div class="set-group"><h3>Grafik-Preset</h3>
          <div class="chips">
            <button data-a="q" data-id="auto" aria-pressed="${s.qualityAuto}">Automatisch</button>
            ${QUALITY_IDS.map((q) => `<button data-a="q" data-id="${q}" aria-pressed="${!s.qualityAuto && cur === q}">${QUALITY_TIERS[q].label}</button>`).join('')}
          </div>
          <p class="tier-desc"><b>${QUALITY_TIERS[cur].label}:</b> ${esc(QUALITY_TIERS[cur].description)}</p>
          <p class="soft small">Bei „Automatisch“ senkt das Spiel die Stufe selbst, wenn es ruckelt.</p></div>
        <div class="set-group"><h3>Leistung</h3>
          ${toggleHtml('dynres', 'Dynamische Auflösung', s.dynamicResolution, 'Fällt die Bildrate unter 50, rechnet das Spiel kurz mit weniger Pixeln (nie unschärfer als „Niedrig“) und geht zurück, sobald es wieder flüssig läuft.')}
          ${toggleHtml('fps', 'Bildrate anzeigen', s.showFps, 'Bilder pro Sekunde und Grafikstufe in der Kapitänstafel.')}</div>
        <div class="set-group"><h3>Dein Gerät</h3><div class="facts">
          <div>Aktuelle Stufe<b>${QUALITY_TIERS[cur].label}${s.qualityAuto ? ' (automatisch)' : ''}</b></div>
          <div>Renderauflösung<b>${size.w} × ${size.h}${g.renderer.dynRes.scale < 0.999 ? ` (dynamisch ${Math.round(g.renderer.dynRes.scale * 100)} %)` : ''}</b></div>
          <div>Erkanntes Gerät<b>${esc(g.detected.reason)}</b></div>
          <div>Vorschlag<b>${QUALITY_TIERS[g.detected.tier].label}</b></div>
          <div>Grafikschnittstelle<b>WebGL 2${g.webgpu === 'ja' ? ' (WebGPU wäre verfügbar)' : ''}</b></div>
        </div>${g.detected.software ? GPU_HINT : ''}</div>`;
      handlers.q = (id) => { g.setQuality(id === 'auto' ? 'auto' : (id as QualityTier)); rerender(); };
      handlers.dynres = () => { g.settings.update({ dynamicResolution: !s.dynamicResolution }); rerender(); };
      handlers.fps = () => { g.settings.update({ showFps: !s.showFps }); rerender(); };
    }

    if (tab === 'steuerung') {
      const binds = g.input.getKeyBindings();
      body = ACTION_GROUPS.map((grp) => `<div class="set-group"><h3>${grp.label}</h3>
          ${grp.id === 'troops' ? '<p class="soft small">Die Befehle teilen sich standardmäßig die Tasten 1–3 mit der Schnellleiste: Solange Trupps im Einsatz sind, gelten diese Tasten als Befehle (die Güter ruhen, Platz 4 bleibt frei). Mit eigenen Tasten für die Befehle bleibt die Schnellleiste immer nutzbar.</p>' : ''}
          <ul class="binds">${grp.actions.map((a) => `<li><span>${ACTION_LABELS[a]}</span>
            <div class="keys">${binds[a].map((c) => `<kbd>${esc(g.input.keyLabel(c))}</kbd>`).join('') || '<span class="soft small">–</span>'}</div>
            <button class="mini" data-a="rebind" data-id="${a}">Ändern</button></li>`).join('')}</ul></div>`).join('')
        + `<button class="secondary" data-a="resetkeys">Tastenbelegung auf Standard zurücksetzen</button>
        <div class="set-group"><h3>Touch</h3>
        <div class="chips">${(['auto', 'on', 'off'] as const).map((m) => `<button data-a="touch" data-id="${m}" aria-pressed="${s.touchControls === m}">${{ auto: 'Automatisch', on: 'Immer an', off: 'Aus' }[m]}</button>`).join('')}</div></div>
        <div class="set-group"><h3>Kamera</h3>${toggleHtml('invert', 'Vertikal umkehren', s.invertLookY)}</div>
        <div class="set-group"><h3>Gamepad</h3>
        <p class="soft">${g.input.padConnected ? 'Gamepad verbunden.' : 'Kein Gamepad erkannt – drück eine Taste am Gamepad, damit der Browser es findet.'}<br>
        Linker Stick: Steuern · Rechter Stick: Kamera · A: Angriff · B: Ausweichen · X: Aktion · Y: Schwerer Angriff · LB/RB: Breitseiten · LT/RT: Fähigkeiten · Start: Pause</p></div>`;
      handlers.rebind = (id) => this.captureKey(id as ActionId, rerender);
      handlers.resetkeys = () => { g.settings.update({ keyBindings: {} }); rerender(); };
      handlers.touch = (id) => { g.settings.update({ touchControls: id as Settings['touchControls'] }); rerender(); };
      handlers.invert = () => { g.settings.update({ invertLookY: !s.invertLookY }); rerender(); };
    }

    if (tab === 'ton') {
      const vols: [keyof Settings['volume'], string][] = [['master', 'Gesamt'], ['music', 'Musik'], ['sfx', 'Effekte'], ['ambient', 'Umgebung'], ['voice', 'Stimmen']];
      body = `<div class="set-group"><h3>Lautstärke</h3>${vols.map(([k, label]) => sliderHtml({ label, input: 'vol', id: k, min: 0, max: 100, step: 5, value: Math.round(s.volume[k] * 100), unit: ' %' })).join('')}</div>
        <div class="set-group"><h3>Fokus</h3>${toggleHtml('mute', 'Stumm, wenn das Fenster nicht aktiv ist', s.muteWhenUnfocused, 'Musik und Klänge pausieren, solange du in einem anderen Tab oder Programm bist.')}</div>
        <div class="set-group"><h3>Gerade zu hören</h3><p class="note">${audio.currentTrackTitle ? `♪ <b>${esc(audio.currentTrackTitle)}</b>` : 'Begleitmusik des Spiels (mit eigenen Stücken lässt sie sich ersetzen)'}</p></div>`;
      handlers.mute = () => { g.settings.update({ muteWhenUnfocused: !s.muteWhenUnfocused }); rerender(); };
      handlers.vol = (val, el) => {
        const k = el.dataset.id as keyof Settings['volume'];
        g.settings.update({ volume: { ...g.settings.data.volume, [k]: +val / 100 } });
        this.slide(el, +val, ' %');
      };
    }

    if (tab === 'anzeige') {
      body = `<div class="set-group"><h3>Lesbarkeit</h3>
          <div class="opt"><span class="label">Textgröße</span><div class="chips">
            ${[[1, 'Normal'], [1.15, 'Groß'], [1.3, 'Sehr groß']].map(([v, l]) => `<button data-a="text" data-id="${v}" aria-pressed="${s.textScale === v}">${l}</button>`).join('')}
          </div></div>
          ${sliderHtml({ label: 'HUD-Größe', input: 'hudscale', min: 80, max: 140, step: 5, value: Math.round(s.hudScale * 100), unit: ' %' })}
          ${toggleHtml('cb', 'Farbenblind-freundlich', s.colorblind, 'Orange und Blau statt Rot und Grün, dazu eindeutige Formen auf der Karte.')}</div>
        <div class="set-group"><h3>Einblendungen</h3>
          ${toggleHtml('sector', 'Sektor- und Titel-Einblendung', s.sectorBanner, 'Beim Segeln in einen neuen Sektor erscheinen der Name der Macht und das laufende Musikstück.')}
          ${toggleHtml('numbers', 'Schadenszahlen', s.damageNumbers, 'Zahlen über den Gegnern; Hinweise wie „Parade!“ bleiben.')}</div>`;
      handlers.text = (id) => { g.settings.update({ textScale: +id }); rerender(); };
      handlers.hudscale = (val, el) => { g.settings.update({ hudScale: +val / 100 }); this.slide(el, +val, ' %'); };
      handlers.cb = () => { g.settings.update({ colorblind: !s.colorblind }); rerender(); };
      handlers.sector = () => { g.settings.update({ sectorBanner: !s.sectorBanner }); rerender(); };
      handlers.numbers = () => { g.settings.update({ damageNumbers: !s.damageNumbers }); rerender(); };
    }

    this.open(
      `<div class="set-head"><h2 class="fell">Einstellungen</h2><button class="mini" data-a="reset" title="Diesen Bereich auf die Standardwerte zurücksetzen">Zurücksetzen</button></div>
      <div class="tabs" role="tablist">${tabs.map(([id, l]) => `<button data-a="tab" data-id="${id}" aria-pressed="${id === tab}"${id === tab ? ' data-focus' : ''}>${l}</button>`).join('')}<button data-a="compendium">Item-Kompendium</button></div>
      ${body}
      <button class="primary" data-a="back">Fertig</button>`,
      handlers,
      back,
      { wide: true },
    );
  }

  // ---------- Item-Kompendium ----------

  /** Zeilen der Liste (links); `save` = Spielstand für die Besitz-Anzeige, null im Hauptmenü ohne Spiel */
  private cmpRows(list: readonly CatalogEntry[], sel: string | null, save: SaveData | null): string {
    if (!list.length) return '<p class="cmp-empty">Nichts gefunden. Versuche einen anderen Suchbegriff oder Filter.</p>';
    return list.map((e) => {
      const o = save && e.own ? e.own(save) : null;
      const mark = o?.state === 'owned' ? '✓' : o?.state === 'free' ? '◇' : '';
      return `<button class="cmp-row${e.id === sel ? ' sel' : ''}${o?.state === 'locked' ? ' locked' : ''}" data-a="pick" data-id="${esc(e.id)}" style="--rc:${RARITY[e.rarity].col}">${glyphSvg(e.glyph, e.color, e.color2)}<span><b>${esc(e.name)}</b><small>${esc(e.group)}</small></span><span class="own" aria-hidden="true">${mark}</span></button>`;
    }).join('');
  }

  /** Inspektionskarte (rechts): Vorschau, Name, Seltenheit, Werte, Lore und Herkunft */
  private cmpCard(e: CatalogEntry | null, save: SaveData | null): string {
    if (!e) return '<p class="soft">Wähle links einen Gegenstand, um seine Werte, Geschichte und Herkunft zu sehen.</p>';
    const r = RARITY[e.rarity];
    const o = save && e.own ? e.own(save) : null;
    const own = !o ? '' : o.state === 'owned' ? `<span class="own">✓ ${o.note ? esc(o.note) : 'im Besitz'}</span>` : o.state === 'free' ? '<span class="own">◇ frei wählbar</span>' : `noch nicht freigeschaltet${o.note ? ` (${esc(o.note)})` : ''}`;
    return `<div class="cmp-art">${glyphSvg(e.glyph, e.color, e.color2)}</div>
      <h3>${esc(e.name)}</h3>
      <p class="cmp-sub">${r.mark} ${r.n} · ${esc(e.group)}${e.raid ? ' · Raid-Beute' : ''}${own ? ` · ${own}` : ''}</p>
      ${e.color2 ? `<div class="cmp-palette" aria-hidden="true"><i style="background:${esc(e.color)}"></i><i style="background:${esc(e.color2)}"></i></div>` : ''}
      <p class="lore">${esc(e.desc)}</p>
      <ul class="cmp-stats">${e.stats.map((st) => `<li><span>${esc(st.label)}</span><b${st.good ? ' class="up"' : ''}>${esc(st.value)}</b></li>`).join('')}</ul>
      <p class="cmp-origin"><b>Herkunft:</b> ${esc(e.origin)}</p>`;
  }

  /** Kompendium: alle Gegenstände des Spiels mit Reitern, Seltenheits-Filter, Suche und Inspektionskarte */
  showCompendium(back: () => void) {
    const c = this.cmp;
    const save = this.game.saveData ?? null;
    const all = catalog();
    const tabs: [CatalogCat | 'all' | 'raid', string][] = [['all', 'Alles'], ...CATALOG_CATS.map((k): [CatalogCat, string] => [k.id, k.label]), ['raid', 'Raid-Beute']];
    const { list, sel } = this.cmpView();
    const owned = save ? list.filter((e) => e.own?.(save).state === 'owned').length : 0;
    this.open(
      `<div class="cmp-top"><h2 class="fell">Item-Kompendium</h2><span class="cmp-count">${this.cmpCount(list.length, all.length, owned, !!save)}</span></div>
      <div class="cmp-tools">
        <input class="txt cmp-search" type="search" placeholder="Suchen: Name, Set, Herkunft …" value="${esc(c.q)}" data-input="q" aria-label="Suche im Kompendium" autocomplete="off" spellcheck="false">
        <div class="tabs cmp-cats" role="tablist">${tabs.map(([id, l]) => `<button data-a="cat" data-id="${id}" aria-pressed="${c.cat === id}">${l}</button>`).join('')}</div>
        <div class="chips cmp-rar"><button data-a="rar" data-id="all" aria-pressed="${c.rarity === 'all'}">Alle Seltenheiten</button>${RARITIES.map((r) => `<button data-a="rar" data-id="${r}" aria-pressed="${c.rarity === r}" style="--rc:${RARITY[r].col}">${RARITY[r].mark} ${RARITY[r].n}</button>`).join('')}</div>
      </div>
      <div class="cmp-body">
        <div class="cmp-list">${this.cmpRows(list, sel?.id ?? null, save)}</div>
        <aside class="cmp-card parchment" style="--rc:${sel ? RARITY[sel.rarity].col : 'var(--rar-gewoehnlich)'}">${this.cmpCard(sel, save)}</aside>
      </div>
      <button class="primary" data-a="back">Zurück</button>`,
      {
        cat: (id) => { c.cat = id as typeof c.cat; c.sel = null; this.showCompendium(back); },
        rar: (id) => { c.rarity = id as typeof c.rarity; c.sel = null; this.showCompendium(back); },
        pick: (id) => { c.sel = id; this.cmpPaint(); if (matchMedia('(max-width: 759px)').matches) this.card.querySelector('.cmp-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); },
        q: (val) => { c.q = val; c.sel = null; this.cmpPaint(); },
        back: () => back(),
      },
      back,
      { wide: true, cls: 'cmp' },
    );
  }

  private cmpCount(shown: number, total: number, owned: number, hasSave: boolean) {
    return `${shown} von ${total} Einträgen${hasSave ? ` · ${owned} im Besitz` : ''}`;
  }

  private cmpView() {
    const list = filterCatalog(catalog(), { cat: this.cmp.cat, rarity: this.cmp.rarity, query: this.cmp.q });
    return { list, sel: list.find((e) => e.id === this.cmp.sel) ?? list[0] ?? null };
  }

  /** Liste und Karte neu zeichnen, ohne die Seite neu aufzubauen (das Suchfeld behält den Fokus, die Liste ihre Stelle) */
  private cmpPaint() {
    const save = this.game.saveData ?? null;
    const { list, sel } = this.cmpView();
    const listEl = this.card.querySelector<HTMLElement>('.cmp-list');
    const cardEl = this.card.querySelector<HTMLElement>('.cmp-card');
    if (!listEl || !cardEl) return;
    const y = listEl.scrollTop;
    listEl.innerHTML = this.cmpRows(list, sel?.id ?? null, save);
    listEl.scrollTop = y;
    cardEl.style.setProperty('--rc', sel ? RARITY[sel.rarity].col : 'var(--rar-gewoehnlich)');
    cardEl.innerHTML = this.cmpCard(sel, save);
    const owned = save ? list.filter((e) => e.own?.(save).state === 'owned').length : 0;
    const count = this.card.querySelector('.cmp-count');
    if (count) count.textContent = this.cmpCount(list.length, catalog().length, owned, !!save);
  }

  private captureKey(action: ActionId, done: () => void) {
    const g = this.game;
    const overlay = document.createElement('div');
    overlay.className = 'capture';
    overlay.innerHTML = `<div>${esc(ACTION_LABELS[action])}<br><span class="small">Drück eine Taste oder Maustaste … (Esc = abbrechen)</span></div>`;
    document.body.appendChild(overlay);
    this.capturing = true;
    const finish = (code: string | null) => {
      overlay.remove();
      g.input.captureNext = null;
      // Erst nach diesem Tastendruck wieder auf Esc im Menü reagieren
      setTimeout(() => { this.capturing = false; }, 0);
      if (code && !FIXED_CODES.includes(code)) {
        const binds: Partial<Record<ActionId, string[]>> = {};
        const cur = g.input.getKeyBindings();
        for (const a of ACTION_IDS) {
          // Neue Taste wird Haupttaste, die bisherige Haupttaste bleibt als zweite. Andere Aktionen verlieren die Taste.
          const list = a === action ? [code, ...cur[a].filter((c) => c !== code)].slice(0, 2) : cur[a].filter((c) => c !== code);
          if (JSON.stringify(list) !== JSON.stringify(DEFAULT_KEYS[a])) binds[a] = list;
        }
        g.settings.update({ keyBindings: binds });
      }
      done();
    };
    g.input.captureNext = (code) => finish(code);
    overlay.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      finish(e.pointerType === 'mouse' ? 'Mouse' + e.button : null);
    });
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- Dialoge ----------

  confirm(text: string, yes: string, onYes: () => void, onNo: () => void) {
    this.open(
      `<p>${esc(text)}</p><div class="row"><button class="secondary" data-a="no" data-focus>Abbrechen</button><button class="danger" data-a="yes">${esc(yes)}</button></div>`,
      { yes: () => onYes(), no: () => onNo() },
      onNo,
    );
  }

  message(title: string, text: string, onOk: () => void) {
    this.open(`<h2 class="fell">${esc(title)}</h2><p>${esc(text)}</p><button class="primary" data-a="ok">OK</button>`, { ok: () => onOk() }, onOk);
  }
}
