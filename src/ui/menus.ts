import { ACTION_IDS, ACTION_LABELS, DEFAULT_KEYS, FIXED_CODES, type ActionId } from '../data/actions';
import { QUALITY_IDS, QUALITY_TIERS, type QualityTier } from '../data/qualityTiers';
import { FACTION_LABELS, rankName } from '../data/ranks';
import type { Game } from '../core/game';
import type { SaveData } from '../core/save/types';
import type { Settings } from '../core/settings';
import { EDGE_WALL, WEATHER, WEATHER_IDS, type WeatherId } from '../data/world';
import { formatClock } from '../world/timeOfDay';
import { FIGUREHEADS, FLAGS, HULL_COLORS, SAIL_COLORS, SHIP_CLASSES, STRIPE_COLORS, type ShipLook } from '../data/ships';
import { downloadText, esc, formatDate, formatPlayTime, pickFile } from './dom';
import { QUEST_BY_ID, TOWN_NPCS, type QuestDef, type ShopKind, type TownNpcDef } from '../data/quests';
import { CREW, CREW_BY_ID, CREW_ROLE_LABEL } from '../data/crew';
import { hostileLegends } from '../data/legends';
import { RARITY, TRINKETS, TRINKET_BY_ID } from '../data/trinkets';
import { ACHIEVEMENTS } from '../data/achievements';
import { ARMOR, POTION, REST_PRICE, SHRINE_PRICE, WEAPONS, type IslandDef } from '../data/regions';
import { stepText } from '../story/questSystem';
import { drawMap } from './minimap';
import { audio } from '../audio/audio';

type Handler = (id: string, el: HTMLElement) => void;
type SettingsTab = 'grafik' | 'steuerung' | 'ton' | 'anzeige';

const LOGO = `${import.meta.env.BASE_URL}favicon.svg`;

/** Alle Menübildschirme: Titel, Spielstände, Neues Spiel, Einstellungen, Pause. */
export class Menus {
  private screen: HTMLElement;
  private card: HTMLElement;
  private handlers: Record<string, Handler> = {};
  private back: (() => void) | null = null;
  private settingsTab: SettingsTab = 'grafik';
  private capturing = false;

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
      this.handlers[el.dataset.a!]?.(el.dataset.id ?? '', el);
    });
    this.card.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.input) this.handlers[el.dataset.input]?.(el.value, el);
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

  private open(html: string, handlers: Record<string, Handler>, back: (() => void) | null, opts: { wide?: boolean; clear?: boolean } = {}) {
    this.card.innerHTML = html;
    this.card.classList.toggle('wide', !!opts.wide);
    this.screen.classList.toggle('clear', !!opts.clear);
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

  showMain() {
    const g = this.game;
    this.open(
      `<div class="title-card">
        <img class="logo" src="${LOGO}" alt="">
        <h1 class="fell">Sturmkrone</h1>
        <p class="soft">Ein Piratenabenteuer auf hoher See</p>
        ${g.persistent ? '' : '<p class="warn">Dein Browser erlaubt kein dauerhaftes Speichern (z. B. privater Modus). Spielstände gehen beim Schließen verloren – nutze „Exportieren“.</p>'}
        <button class="primary" data-a="play" data-focus>Spielen</button>
        <button class="secondary" data-a="settings">Einstellungen</button>
        <p class="ver">Version ${esc(__APP_VERSION__)} · ${esc(__BUILD_DATE__)} · Sturmkrone 2.0</p>
      </div>`,
      {
        play: () => this.showSlots(),
        settings: () => this.showSettings(() => this.showMain()),
      },
      null,
      { clear: true },
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
      ${legacy && hasEmpty ? `<p class="note">Ein Spielstand aus Sturmkrone 1.0 wurde gefunden: <b>${esc(legacy.player.name)}</b>, Stufe ${legacy.player.level}.
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
      <button class="secondary" data-a="map">Karte &amp; Logbuch</button>
      <button class="secondary" data-a="crew">Crew</button>
      <button class="secondary" data-a="rank">Rangliste der Legenden</button>
      <button class="secondary" data-a="loot">Talismane &amp; Erfolge</button>
      <button class="secondary" data-a="look">Aussehen ändern</button>
      <button class="secondary" data-a="settings">Einstellungen</button>
      <button class="secondary" data-a="workshop">Welt-Werkstatt (Test)</button>
      <button class="secondary" data-a="save">Speichern</button>
      <button class="secondary" data-a="quit">Speichern &amp; Hauptmenü</button>`,
      {
        resume: () => g.resume(),
        look: () => g.openEditor(null),
        map: () => this.showMap('logbuch', () => this.showPause()),
        crew: () => this.showCrew(() => this.showPause()),
        rank: () => this.showRanking(() => this.showPause()),
        loot: () => this.showLoot(() => this.showPause()),
        settings: () => this.showSettings(() => this.showPause()),
        workshop: () => this.showWorkshop(),
        save: () => { g.hud.toast(g.persist() ? 'Gespeichert.' : 'Speichern fehlgeschlagen!'); },
        quit: () => g.quitToMenu(),
      },
      () => g.resume(),
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
      tavern: `Rasten bis zum Morgen (${REST_PRICE} Gold)`, harbor: 'Seekarte &amp; Logbuch',
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
        <div class="opt"><span class="label">Würfeln mit Baldo</span><div class="row">${[20, 50, 200].map((b) => `<button class="mini" data-a="dice" data-id="${b}">${b} Gold setzen</button>`).join('')}</div></div>` : ''}
      <button class="primary" data-a="bye" data-focus>Auf Wiedersehen</button>`,
      {
        accept: (id) => { g.acceptQuest(id); this.showDialog(npc, [], 'Auftrag angenommen! Das Ziel siehst du oben rechts.'); },
        shop: () => this.openShop(npc),
        hire: () => this.showHire(() => this.showDialog(npc)),
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
      <p class="soft">Gold: <b>${g.playerGold.toLocaleString('de-DE')}</b>${msg ? ` · <b>${esc(msg)}</b>` : ''}</p>
      ${town ? `<h3>Bewohner</h3>
      <div class="grid2">${TOWN_NPCS.map((n) => `<button class="secondary" data-a="talk" data-id="${n.id}">${esc(n.name)}${mark(n.id)}<small>${esc(n.title)}</small></button>`).join('')}</div>` : `<p class="dlg-line">${esc(def?.info ?? '')}</p>`}
      <h3>Läden</h3>
      <div class="grid2">
        <button class="secondary" data-a="yard">Werft</button>
        <button class="secondary" data-a="smith">Schmiede</button>
        <button class="secondary" data-a="market">Markt</button>
        <button class="secondary" data-a="shrine">Faji-Schrein</button>
        <button class="secondary" data-a="hire">Crew anheuern</button>
        <button class="secondary" data-a="rest">Rasten (${REST_PRICE} Gold)</button>
      </div>
      <button class="secondary" data-a="ashore">An Land gehen und durch die Stadt laufen</button>
      <button class="primary" data-a="leave" data-focus>Ablegen</button>`,
      {
        talk: (id) => { const n = TOWN_NPCS.find((x) => x.id === id); if (n) { this.dialogExit = back; g.talkInHarbor(n); } },
        yard: () => this.showShipyard('', back),
        smith: () => this.showSmith(back),
        market: () => this.showMarket(back),
        shrine: () => this.showShrine(back),
        hire: () => this.showHire(back),
        rest: () => this.showHarbor(g.rest()),
        ashore: () => { g.resume(); g.world.goAshore(); },
        leave: () => g.resume(),
      },
      () => g.resume(),
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
      <p class="soft">Gold: <b>${g.playerGold.toLocaleString('de-DE')}</b> · Crew an Bord: ${s.crew.hired.length}${msg ? ` · <b>${esc(msg)}</b>` : ''}</p>
      ${free.length ? free.map((c) => `<div class="slot crew" style="--c:${c.col}"><div class="slot-head"><b>${esc(c.name)}</b><span>${c.price.toLocaleString('de-DE')} Gold</span></div>
        <div class="meta"><b>${esc(c.job)}</b> · ${CREW_ROLE_LABEL[c.role]}${rank < c.rank ? ` · ab Rang ${c.rank + 1}` : ''}<br>${esc(c.perk)}${c.skill ? `<br><i>${esc(c.skill.n)}:</i> ${esc(c.skill.d)}` : ''}</div>
        <p class="dlg-line small">„${esc(c.quote)}“</p>
        <button class="mini brass" data-a="hire" data-id="${c.id}" ${rank < c.rank ? 'disabled' : ''}>Anheuern</button></div>`).join('') : '<p>Alle sechzehn sind schon an Bord. Was für eine Crew!</p>'}
      <button class="primary" data-a="back">Zurück</button>`,
      { hire: (id) => { const y = this.screen.scrollTop; this.showHire(back, g.hireCrew(id)); this.screen.scrollTop = y; }, back },
      back,
      { wide: true },
    );
  }

  showCrew(back: () => void, msg = '') {
    const g = this.game;
    const s = g.saveData;
    const qs = g.questSys;
    if (!s || !qs) return;
    const re = (m = '') => { const y = this.screen.scrollTop; this.showCrew(back, m); this.screen.scrollTop = y; };
    this.open(
      `<h2 class="fell">Crew</h2>
      <p class="soft small">Bis zu drei Crewmitglieder bilden deinen <b>Landtrupp</b> und kämpfen an Land und beim Entern an deiner Seite. Treue wächst mit jedem gemeinsamen Sieg und mit persönlichen Aufträgen – bei voller Treue kämpfen sie 30 % stärker.</p>
      ${msg ? `<p class="note">${esc(msg)}</p>` : ''}
      ${s.crew.hired.length ? s.crew.hired.map((id) => {
        const c = CREW_BY_ID[id];
        if (!c) return '';
        const loy = s.crew.loyalty[id] ?? 0;
        const inParty = s.crew.party.includes(id);
        const offer = qs.available(id)[0];
        const turnIn = s.progress.quests.some((p) => { const st = qs.step(p.id); return st?.type === 'talk' && st.npc === id; });
        return `<div class="slot crew" style="--c:${c.col}"><div class="slot-head"><b>${esc(c.name)}</b><span>${esc(c.job)}</span></div>
          <div class="meta">${CREW_ROLE_LABEL[c.role]} · ${esc(c.perk)}${c.skill ? `<br><i>${esc(c.skill.n)}:</i> ${esc(c.skill.d)}` : ''}</div>
          <div class="loy"><span>Treue</span><div class="hud-bar"><i style="width:${loy}%;background:${loy >= 100 ? '#FFD166' : c.col}"></i></div><b>${loy >= 100 ? 'Treu' : loy}</b></div>
          <div class="row">${c.cat ? '' : `<button class="mini${inParty ? ' brass' : ''}" data-a="party" data-id="${id}" aria-pressed="${inParty}">${inParty ? 'Im Landtrupp ✓' : 'In den Landtrupp'}</button>`}
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
    const re = () => { const y = this.screen.scrollTop; this.showLoot(back); this.screen.scrollTop = y; };
    const got = ACHIEVEMENTS.filter((a) => s.progress.flags[`ach_${a.id}`]).length;
    this.open(
      `<h2 class="fell">Talismane &amp; Erfolge</h2>
      <h3>Talismane (${s.gear.trinkets.length}/${TRINKETS.length})</h3>
      <p class="soft small">Ein Talisman kann angelegt sein. Legenden, Bosse, Ruinen, Geisterschiffe und Schätze lassen welche fallen.</p>
      ${s.gear.trinkets.length ? s.gear.trinkets.map((id) => { const t = TRINKET_BY_ID[id]; if (!t) return ''; const r = RARITY[t.rarity]; const on = s.gear.trinket === id; return `<div class="slot crew" style="--c:${r.col}"><div class="slot-head"><b>${r.mark} ${esc(t.n)}${on ? ' ✓' : ''}</b><span style="color:${r.col}">${r.n}</span></div><div class="meta">${esc(t.d)}</div>${on ? '' : `<button class="mini brass" data-a="eq" data-id="${id}">Anlegen</button>`}</div>`; }).join('') : '<p class="soft">Noch keine gefunden.</p>'}
      <h3>Erfolge (${got}/${ACHIEVEMENTS.length})</h3>
      <div class="ach">${ACHIEVEMENTS.map((a) => { const ok = !!s.progress.flags[`ach_${a.id}`]; const p = a.prog ? a.prog(s) : ok ? 1 : 0; return `<div class="ach-i${ok ? ' ok' : ''}"><b>${ok ? '🏆' : '🔒'} ${esc(a.n)}</b><span>${esc(a.d)}</span>${ok ? '' : `<div class="hud-bar"><i style="width:${Math.round(p * 100)}%;background:var(--brass)"></i></div>`}</div>`; }).join('')}</div>
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
      <ol class="rank">${rows.map((r) => `<li class="${r.me ? 'me' : ''}"><b>${esc(r.n)}</b><span>${esc(r.t)} · Stufe ${r.lvl}</span><em>${r.ruhm.toLocaleString('de-DE')} Ruhm</em></li>`).join('')}</ol>
      <h3>Gesuchte Legenden</h3>
      ${hostile.map((l) => { const b = s.legends.includes(l.id); const home = g.world.islandDefs.find((i) => i.id === l.home); return `<div class="slot legend${b ? ' beaten' : ''}" style="--c:${l.col}"><div class="slot-head"><b>${esc(l.n)}</b><span>${b ? 'Besiegt ✓' : `Stufe ${l.lvl}`}</span></div><div class="meta"><i>${esc(l.t)}</i> · ${l.faction === 'pirat' ? 'Piratin/Pirat' : 'Marine'} · kreuzt bei ${esc(home?.name ?? '?')}<br>${esc(l.bio)}</div></div>`; }).join('')}
      ${s.progress.done.includes('k1') ? '' : '<p class="note">Die Legenden nehmen dich erst ernst, wenn du Kapitel 1 abgeschlossen hast.</p>'}
      <button class="primary" data-a="back" data-focus>Zurück</button>`,
      { back },
      back,
      { wide: true },
    );
  }

  private openShop(npc: TownNpcDef) {
    const back = () => this.showDialog(npc);
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
    return `<h2 class="fell">${title}</h2><p class="soft">Gold: <b>${this.game.playerGold.toLocaleString('de-DE')}</b>${msg ? ` · <b>${esc(msg)}</b>` : ''}</p>`;
  }

  showSmith(back: () => void, msg = '') {
    const g = this.game;
    const s = g.saveData;
    if (!s) return;
    const rank = g.playerRank;
    const re = (m: string) => { const y = this.screen.scrollTop; this.showSmith(back, m); this.screen.scrollTop = y; };
    const row = (n: string, stat: string, price: number, needRank: number, owned: boolean, worn: boolean, a: string, i: number) => `<div class="slot"><div class="slot-head"><b>${esc(n)}${worn ? ' ✓' : ''}</b><span>${owned ? (worn ? 'Angelegt' : 'Überholt') : `${price.toLocaleString('de-DE')} Gold`}</span></div>
      <div class="meta">${stat}${needRank > rank && !owned ? ` · ab Rang ${needRank + 1}` : ''}</div>
      ${owned ? '' : `<button class="mini brass" data-a="${a}" data-id="${i}" ${needRank > rank ? 'disabled' : ''}>Kaufen</button>`}</div>`;
    this.open(
      `${this.shopHead('Schmiede', msg)}
      <h3>Klingen</h3>${WEAPONS.map((w, i) => row(w.n, `+${w.dmg} Schaden${w.glow ? ' · leuchtet' : ''}`, w.price, w.rank, i <= s.gear.weapon, i === s.gear.weapon, 'wpn', i)).join('')}
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
      <div class="slot"><div class="slot-head"><b>${POTION.n}</b><span>${POTION.price} Gold</span></div>
        <div class="meta">Heilt ${Math.round(POTION.heal * 100)} % deiner Lebenspunkte. Du trägst ${s.gear.potions} von ${POTION.max}.</div>
        <div class="row"><button class="mini brass" data-a="buy" data-id="1" ${s.gear.potions >= POTION.max ? 'disabled' : ''}>1 kaufen</button><button class="mini brass" data-a="buy" data-id="${POTION.max}" ${s.gear.potions >= POTION.max ? 'disabled' : ''}>Auffüllen</button></div></div>
      <p class="small soft">Essen: Taste <kbd>${esc(g.input.keyLabel(g.input.getKeyBindings().potion?.[0] ?? 'KeyH'))}</kbd> oder der grüne Knopf am Handy.</p>
      <button class="primary" data-a="back">Zurück</button>`,
      { buy: (id) => re(g.buyPotions(+id)), back },
      back,
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
      <div class="slot"><div class="slot-head"><b>Faji-Punkt</b><span>${price.toLocaleString('de-DE')} Gold</span></div>
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
      if (ctx) drawMap(ctx, size, g.world.islandDefs.filter((i) => g.world.discovered.has(i.id)), g.mapMarkers(), tab === 'welt' ? 'world' : 'region');
    }
  }

  // ---------- Werft ----------

  showShipyard(msg = '', back: () => void = () => this.showPause()) {
    const g = this.game;
    const st = g.shipState;
    if (!st) return;
    const look = st.look;
    const rank = g.playerRank;
    const rerender = (m = '') => { const y = this.screen.scrollTop; this.showShipyard(m, back); this.screen.scrollTop = y; };
    const sw = (k: keyof ShipLook, colors: string[]) => `<div class="swatches">${colors.map((c) => `<button class="sw" style="background:${c}" data-a="lk" data-id="${k}|${c}" aria-pressed="${String(look[k]).toUpperCase() === c.toUpperCase()}"></button>`).join('')}</div>`;
    const chips = (k: keyof ShipLook, opts: Record<string, string>) => `<div class="chips">${Object.entries(opts).map(([id, l]) => `<button data-a="lk" data-id="${k}|${id}" aria-pressed="${look[k] === id}">${l}</button>`).join('')}</div>`;
    const classes = SHIP_CLASSES.map((c, i) => {
      const owned = st.owned.includes(i);
      const locked = rank < c.rank;
      return `<div class="slot"><div class="slot-head"><b>${c.n}${st.tier === i ? ' ✓' : ''}</b><span>${owned ? 'Im Besitz' : `${c.price.toLocaleString('de-DE')} Gold`}</span></div>
        <div class="meta">Rumpf ${c.hp} · ${c.can} Kanonen je Seite · Tempo ${c.spd} · Crew ${c.crew}${locked && !owned ? ` · ab Rang ${c.rank + 1}` : ''}</div>
        ${st.tier === i ? '' : `<button class="mini${owned ? '' : ' brass'}" data-a="cls" data-id="${i}" ${locked && !owned ? 'disabled' : ''}>${owned ? 'Wechseln' : 'Kaufen'}</button>`}</div>`;
    }).join('');
    const cost = g.repairCost();
    this.open(
      `<h2 class="fell">Werft</h2>
      <p class="soft">Gold: <b>${g.playerGold.toLocaleString('de-DE')}</b>${msg ? ` · <b>${esc(msg)}</b>` : ''}</p>
      <button class="secondary" data-a="repair" ${cost <= 0 ? 'disabled' : ''}>${cost > 0 ? `Reparieren (${cost} Gold)` : 'Schiff ist unbeschädigt'}</button>
      <h3>Ausbauten</h3>
      ${(['can', 'hull', 'sail'] as const).map((k) => { const lv = st.up[k]; const price = g.upgradeCost(k); const n = { can: 'Schwere Kanonen', hull: 'Verstärkter Rumpf', sail: 'Leichte Segel' }[k]; const d = { can: '+12 % Kanonenschaden', hull: '+15 % Rumpfpunkte', sail: '+5 % Tempo' }[k]; return `<div class="slot"><div class="slot-head"><b>${n}</b><span>Stufe ${lv}/5</span></div><div class="meta">${d} je Stufe · <span class="pips">${'●'.repeat(lv)}${'○'.repeat(5 - lv)}</span></div>${lv < 5 ? `<button class="mini brass" data-a="up" data-id="${k}">Ausbauen (${price.toLocaleString('de-DE')} Gold)</button>` : ''}</div>`; }).join('')}
      <h3>Schiffsklassen</h3>${classes}
      <h3>Aussehen</h3>
      ${this.optHtml('Rumpf', sw('hull', HULL_COLORS))}
      ${this.optHtml('Zierstreifen', sw('stripe', STRIPE_COLORS))}
      ${this.optHtml('Segel', sw('sail', SAIL_COLORS))}
      ${this.optHtml('Flagge', chips('flag', FLAGS) + sw('flagColor', ['#1E1A20', '#A8322A', '#1F4E79', '#2F6E4F', '#4A2E6E', '#E3B04B']))}
      ${this.optHtml('Galionsfigur', chips('figurehead', FIGUREHEADS))}
      <div class="chips"><button data-a="lanterns" aria-pressed="${look.lanterns}">Laternen</button></div>
      <button class="primary" data-a="back">Fertig</button>`,
      {
        cls: (id) => rerender(g.shipyardSelect(+id)),
        repair: () => rerender(g.shipyardRepair()),
        up: (id) => rerender(g.shipUpgrade(id as 'can' | 'hull' | 'sail')),
        lk: (id) => { const [k, v] = id.split('|'); g.shipyardLook({ ...look, [k]: v }); rerender(); },
        lanterns: () => { g.shipyardLook({ ...look, lanterns: !look.lanterns }); rerender(); },
        back,
      },
      back,
      { wide: true },
    );
  }

  private optHtml(label: string, html: string) { return `<div class="opt"><span class="label">${label}</span>${html}</div>`; }

  // ---------- Welt-Werkstatt (Testwerkzeug) ----------

  showWorkshop() {
    const g = this.game;
    const env = g.world.env;
    const speeds: [number, string][] = [[0, 'Angehalten'], [1, 'Normal'], [30, 'Zeitraffer']];
    const presets: [number, string][] = [[6.6, 'Morgen'], [12, 'Mittag'], [18.5, 'Abendrot'], [23, 'Nacht']];
    const rerender = () => { const y = this.screen.scrollTop; this.showWorkshop(); this.screen.scrollTop = y; };
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
        home: () => { g.world.teleport(0, 12, 0); g.resume(); },
        yard: () => this.showShipyard('', () => this.showWorkshop()),
        sp: () => { g.testGrant(5, 0); g.hud.toast('+5 Faji-Punkte'); },
        lvl: () => { g.testGrant(5, 5); g.hud.toast('+5 Stufen'); },
        awaken: () => { g.resume(); g.checkAwakening('koerper'); },
        back: () => this.showPause(),
      },
      () => this.showPause(),
    );
  }

  // ---------- Einstellungen ----------

  showSettings(back: () => void, tab: SettingsTab = this.settingsTab) {
    this.settingsTab = tab;
    const g = this.game;
    const s = g.settings.data;
    const tabs: [SettingsTab, string][] = [['grafik', 'Grafik'], ['steuerung', 'Steuerung'], ['ton', 'Ton'], ['anzeige', 'Anzeige']];
    let body = '';
    const handlers: Record<string, Handler> = {
      tab: (id) => this.showSettings(back, id as SettingsTab),
      back: () => back(),
    };
    const rerender = () => {
      const y = this.screen.scrollTop;
      this.showSettings(back, tab);
      this.screen.scrollTop = y;
    };

    if (tab === 'grafik') {
      const cur = g.renderer.tier;
      const size = g.renderer.drawSize();
      body = `<div class="opt"><span class="label">Grafikstufe</span>
        <div class="chips">
          <button data-a="q" data-id="auto" aria-pressed="${s.qualityAuto}">Automatisch</button>
          ${QUALITY_IDS.map((q) => `<button data-a="q" data-id="${q}" aria-pressed="${!s.qualityAuto && cur === q}">${QUALITY_TIERS[q].label}</button>`).join('')}
        </div>
        <p class="tier-desc"><b>${QUALITY_TIERS[cur].label}:</b> ${esc(QUALITY_TIERS[cur].description)}</p></div>
        <div class="facts">
          <div>Aktuelle Stufe<b>${QUALITY_TIERS[cur].label}${s.qualityAuto ? ' (automatisch)' : ''}</b></div>
          <div>Renderauflösung<b>${size.w} × ${size.h}</b></div>
          <div>Erkanntes Gerät<b>${esc(g.detected.reason)}</b></div>
          <div>Vorschlag<b>${QUALITY_TIERS[g.detected.tier].label}</b></div>
        </div>
        <p class="soft small">Bei „Automatisch“ senkt das Spiel die Stufe selbst, wenn es ruckelt.</p>`;
      handlers.q = (id) => { g.setQuality(id === 'auto' ? 'auto' : (id as QualityTier)); rerender(); };
    }

    if (tab === 'steuerung') {
      const binds = g.input.getKeyBindings();
      body = `<h3>Tastatur &amp; Maus</h3>
        <ul class="binds">${ACTION_IDS.map((a) => `<li><span>${ACTION_LABELS[a]}</span>
          <div class="keys">${binds[a].map((c) => `<kbd>${esc(g.input.keyLabel(c))}</kbd>`).join('') || '<span class="soft small">–</span>'}</div>
          <button class="mini" data-a="rebind" data-id="${a}">Ändern</button></li>`).join('')}</ul>
        <button class="secondary" data-a="resetkeys">Standardbelegung wiederherstellen</button>
        <h3>Touch</h3>
        <div class="chips">${(['auto', 'on', 'off'] as const).map((m) => `<button data-a="touch" data-id="${m}" aria-pressed="${s.touchControls === m}">${{ auto: 'Automatisch', on: 'Immer an', off: 'Aus' }[m]}</button>`).join('')}</div>
        <h3>Gamepad</h3>
        <p class="soft">${g.input.padConnected ? 'Gamepad verbunden.' : 'Kein Gamepad erkannt – drück eine Taste am Gamepad, damit der Browser es findet.'}<br>
        Linker Stick: Steuern · Rechter Stick: Kamera · A: Angriff · B: Ausweichen · X: Aktion · Y: Schwerer Angriff · LB/RB: Breitseiten · LT/RT: Fähigkeiten · Start: Pause</p>
        <h3>Kamera</h3>
        <div class="chips"><button data-a="invert" aria-pressed="${s.invertLookY}">Vertikal umkehren</button></div>`;
      handlers.rebind = (id) => this.captureKey(id as ActionId, rerender);
      handlers.resetkeys = () => { g.settings.update({ keyBindings: {} }); rerender(); };
      handlers.touch = (id) => { g.settings.update({ touchControls: id as Settings['touchControls'] }); rerender(); };
      handlers.invert = () => { g.settings.update({ invertLookY: !s.invertLookY }); rerender(); };
    }

    if (tab === 'ton') {
      const vols: [keyof Settings['volume'], string][] = [['master', 'Gesamt'], ['music', 'Musik'], ['sfx', 'Effekte'], ['ambient', 'Umgebung'], ['voice', 'Stimmen']];
      body = vols.map(([k, label]) => `<label class="slider">${label}<input type="range" min="0" max="100" step="5" value="${Math.round(s.volume[k] * 100)}" data-input="vol" data-id="${k}"><output>${Math.round(s.volume[k] * 100)} %</output></label>`).join('')
        + '<p class="note">Musik und Klänge kommen in Meilenstein 8. Deine Einstellungen werden schon jetzt gespeichert.</p>';
      handlers.vol = (val, el) => {
        const k = el.dataset.id as keyof Settings['volume'];
        g.settings.update({ volume: { ...g.settings.data.volume, [k]: +val / 100 } });
        el.parentElement!.querySelector('output')!.textContent = `${val} %`;
      };
    }

    if (tab === 'anzeige') {
      body = `<div class="opt"><span class="label">Textgröße</span><div class="chips">
          ${[[1, 'Normal'], [1.15, 'Groß'], [1.3, 'Sehr groß']].map(([v, l]) => `<button data-a="text" data-id="${v}" aria-pressed="${s.textScale === v}">${l}</button>`).join('')}
        </div></div>
        <div class="opt"><span class="label">Bildrate</span><div class="chips"><button data-a="fps" aria-pressed="${s.showFps}">FPS anzeigen</button></div></div>
        <div class="opt"><span class="label">Farben</span><div class="chips"><button data-a="cb" aria-pressed="${s.colorblind}">Farbenblind-freundlich</button></div><p class="soft small">Orange und Blau statt Rot und Grün, dazu eindeutige Formen auf der Karte.</p></div>`;
      handlers.text = (id) => { g.settings.update({ textScale: +id }); rerender(); };
      handlers.fps = () => { g.settings.update({ showFps: !s.showFps }); rerender(); };
      handlers.cb = () => { g.settings.update({ colorblind: !s.colorblind }); rerender(); };
    }

    this.open(
      `<h2 class="fell">Einstellungen</h2>
      <div class="tabs" role="tablist">${tabs.map(([id, l]) => `<button data-a="tab" data-id="${id}" aria-pressed="${id === tab}">${l}</button>`).join('')}</div>
      ${body}
      <button class="primary" data-a="back">Fertig</button>`,
      handlers,
      back,
      { wide: true },
    );
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
