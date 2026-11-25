import { esc } from './dom';
import { fmtDist, fmtInt, fmtPct } from '../core/format';
import { clamp01 } from '../core/mathUtil';
import { COMMANDS, type CommandState } from '../data/troops';
import { FLEET_ORDERS, type FleetOrder } from '../data/playerFleet';
import { AMMO, AMMO_IDS, type AmmoId } from '../data/ships';

/** Die Zonen des HUD-Rasters (siehe css/hud.css): jede Anzeige gehört in genau eine Zone und stapelt sich dort */
export interface HudRegions {
  /** oben links: Kapitänstafel, Schiffstafel */
  tl: HTMLElement;
  /** oben Mitte: Kompassleiste, Sektor, Besatzungsbanner, Endboss-Leiste */
  tc: HTMLElement;
  /** oben rechts: Knöpfe, Minikarte, Auftrag */
  tr: HTMLElement;
  /** links Mitte: Belagerungstafel */
  ml: HTMLElement;
  /** unten links: Steuerkompass */
  bl: HTMLElement;
  /** unten Mitte: Kontextplakette, Befehle, Leisten */
  bc: HTMLElement;
  /** unten rechts */
  br: HTMLElement;
}

/** Was die Schiffstafel anzeigt (null blendet sie aus) */
export interface SeaView {
  /** Klassenname des Schiffs */
  name: string;
  /** Fahrstufe („Volle Fahrt“) */
  level: string;
  hull: number;
  sail: number;
  crew: number;
  ammo: AmmoId;
  /** verbleibende Nachladezeit je Seite, 0 = bereit … 1 = gerade gefeuert */
  reloadL: number;
  reloadR: number;
  fire: boolean;
  /** Flickfortschritt 0 … 1, null = es wird nicht geflickt */
  repair: number | null;
  /** Aufschlüsselung der Besatzung: Seeleute und (ab Leviathan) Massentruppen */
  sailors: { n: number; max: number };
  troops: { n: number; max: number } | null;
  tip: string;
  /**
   * Meeresströmung (Phase 4.3C): Name, Bonus auf die Fahrt (0 … 0,35, nur in Strömungsrichtung) und Richtung der Strömung relativ zum Bug (rad, 0 = mit
   * dem Schiff); null = keine Strömung
   */
  flow?: { name: string; boost: number; rel: number } | null;
  /** Wetterzelle am Schiff (Gewitterfront, Nebelbank, Flaute) mit Stärke 0 … 1; null = keine */
  cell?: { label: string; icon: string; kind: string; k: number } | null;
}

export interface CrewLine {
  officers: number;
  slots: number;
  troops: number;
  troopMax: number;
  /** Tastenbeschriftungen der Befehle (null: keine Trupps im Einsatz, die Befehlstafel bleibt weg) */
  cmds: string[] | null;
  active: CommandState;
}

/** Aussehen der Kontextplakette nach Art der Handlung (siehe `.hud-ctx[data-kind]`) */
const CTX_KINDS: [RegExp, string][] = [
  [/^Entern/, 'board'],
  [/^An Deck gehen/, 'low'],
  [/^Hafen/, 'harbor'],
  [/^(Anlegen|Ablegen|Anker|Ankern|Rückzug|An Bord|Zum Ufer|Leiter)/, 'dock'],
];
const ctxKind = (label: string) => CTX_KINDS.find(([re]) => re.test(label))?.[1] ?? 'plain';

const COIN = '<i class="coin" aria-hidden="true"></i>';

export class Hud {
  readonly root: HTMLElement;
  readonly regions: HudRegions;
  /** zuletzt geschriebene Werte – nur bei Änderung ins DOM schreiben (kein Layout-Zittern, keine unnötige Arbeit) */
  private last = new Map<HTMLElement, string>();
  private q = <T extends HTMLElement>(sel: string, from: ParentNode = this.root) => from.querySelector(sel) as T;

  // Kapitänstafel
  private nameEl!: HTMLElement; private subEl!: HTMLElement; private envEl!: HTMLElement; private fpsEl!: HTMLElement;
  private hpBar!: HTMLElement; private hpFill!: HTMLElement; private hpLag!: HTMLElement; private hpTxt!: HTMLElement;
  private stBar!: HTMLElement; private stFill!: HTMLElement; private stLag!: HTMLElement;
  private fjBar!: HTMLElement; private fjFill!: HTMLElement; private fjTxt!: HTMLElement;
  private xpFill!: HTMLElement;
  private goldEl!: HTMLElement; private provEl!: HTMLElement; private crewEl!: HTMLElement; private upkeepEl!: HTMLElement; private weaponsEl!: HTMLElement;
  // Schiffstafel
  private shipEl!: HTMLElement; private shipName!: HTMLElement; private shipSail!: HTMLElement;
  private hullBar!: HTMLElement; private sailBar!: HTMLElement; private crewBar!: HTMLElement; private repBar!: HTMLElement;
  private hullVal!: HTMLElement; private sailVal!: HTMLElement; private crewVal!: HTMLElement; private repVal!: HTMLElement;
  private shipCrew!: HTMLElement; private shipFire!: HTMLElement; private shipTip!: HTMLElement;
  private shipFlow!: HTMLElement; private shipCell!: HTMLElement;
  private gunL!: HTMLElement; private gunR!: HTMLElement; private ammoEl!: HTMLElement;
  // Rechts oben
  private mini!: HTMLCanvasElement; private questEl!: HTMLElement; private arrowEl!: HTMLElement; private badge!: HTMLElement;
  private questKey = '';
  // unten
  private ctxEl!: HTMLButtonElement; private cmdsEl!: HTMLElement; private fleetEl!: HTMLElement; private itemBar!: HTMLElement; private skillbar!: HTMLElement;
  private ctxText = ''; private itemKey = ''; private skillKey = '';
  // Meldungen
  private hintEl!: HTMLElement; private toastEl!: HTMLElement; private toastTimer = 0; private hintTimer = 0;

  onFaji: () => void = () => {};
  onPause: () => void = () => {};
  onMap: () => void = () => {};
  onContext: (down: boolean) => void = () => {};
  /** Befehl an Offiziere und Trupps (Knöpfe der Befehlstafel, auch am Handy) */
  onCommand: (c: CommandState) => void = () => {};
  /** Munition gewählt (Knöpfe der Schiffstafel) */
  onAmmo: (id: AmmoId) => void = () => {};
  /** Flottenbefehl (Knöpfe der Flottentafel, auch am Handy) */
  onFleetOrder: (o: FleetOrder) => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-tl">
        <section class="hud-cap panel" aria-label="Kapitän">
          <header class="cap-head"><b class="cap-name"></b><span class="cap-sub"></span></header>
          <div class="cap-gauges">
            <div class="gauge hp" title="Leben"><i class="lag"></i><i class="fill"></i><em class="gv"></em></div>
            <div class="gauge st" title="Ausdauer" hidden><i class="lag"></i><i class="fill"></i></div>
            <div class="gauge fj" title="Faji"><i class="fill"></i><em class="gv"></em></div>
            <div class="gauge xp thin" title="Erfahrung"><i class="fill"></i></div>
          </div>
          <div class="cap-row"><span class="cap-gold" title="Gold">${COIN}<b></b></span><span class="cap-prov" title="Proviant"></span><span class="cap-env"></span></div>
          <div class="cap-weapons" title="Stil wechseln: Q (alle sechs Kampfstile) · Platz 1: Z · Platz 2: X"><span class="w0 on"></span><span class="w1"></span></div>
          <div class="cap-crew" hidden></div>
          <div class="cap-upkeep" hidden></div>
          <div class="cap-fps" hidden></div>
        </section>
        <section class="hud-ship panel" aria-label="Schiff" hidden>
          <header class="ship-head"><b class="ship-name"></b><span class="ship-sail"></span></header>
          <div class="gline"><span>Rumpf</span><div class="gauge hull"><i class="fill"></i></div><b class="num"></b></div>
          <div class="gline"><span>Segel</span><div class="gauge sail"><i class="fill"></i></div><b class="num"></b></div>
          <div class="gline"><span>Crew</span><div class="gauge crew"><i class="fill"></i></div><b class="num"></b></div>
          <div class="gline rep" hidden><span>Flicken</span><div class="gauge rep"><i class="fill"></i></div><b class="num"></b></div>
          <div class="ship-crew"></div>
          <div class="ship-flow" hidden><i class="flow-arrow">➤</i><span class="flow-name"></span><b class="flow-boost"></b></div>
          <div class="ship-cell" hidden></div>
          <div class="ship-fire" hidden>Feuer an Bord!</div>
          <div class="ship-guns">
            <div class="guns-row"><div class="gun l"><span>Backbord</span><div class="gauge"><i class="fill"></i></div></div><div class="gun r"><span>Steuerbord</span><div class="gauge"><i class="fill"></i></div></div></div>
            <div class="ammo" role="group" aria-label="Munition">${AMMO_IDS.map((id) => `<button type="button" data-ammo="${id}" style="--c:${AMMO[id].color}" title="${esc(AMMO[id].d)}"><i></i>${esc(AMMO[id].n)}</button>`).join('')}</div>
          </div>
          <div class="hud-tip" hidden></div>
        </section>
      </div>
      <div class="hud-tc"></div>
      <div class="hud-tr">
        <div class="hud-btns">
          <button class="icon-btn hud-faji" aria-label="Faji-Baum"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 6.4L21 9l-5.2 4.3L17.6 20 12 16.3 6.4 20l1.8-6.7L3 9l6.8-.6z"/></svg><b class="badge" hidden>0</b></button>
          <button class="icon-btn hud-pause" aria-label="Pause"><svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button>
        </div>
        <button class="hud-mini" aria-label="Karte und Logbuch"><canvas></canvas></button>
        <div class="hud-quest panel" hidden><div class="q-arrow">➤</div><div class="q-body"><b class="q-title"></b><span class="q-step"></span><i class="q-bar" hidden><s></s></i><em class="q-hint">L · Auftragsbuch</em></div></div>
      </div>
      <div class="hud-ml"></div>
      <div class="hud-bl"></div>
      <div class="hud-bc">
        <button class="hud-ctx" hidden></button>
        <div class="hud-cmds panel" role="group" aria-label="Truppenbefehle" hidden></div>
        <div class="hud-fleet panel" role="group" aria-label="Flottenbefehle" hidden></div>
        <div class="itembar panel" hidden></div>
        <div class="skillbar" hidden></div>
      </div>
      <div class="hud-br"></div>`;
    parent.appendChild(this.root);
    this.regions = {
      tl: this.q('.hud-tl'), tc: this.q('.hud-tc'), tr: this.q('.hud-tr'), ml: this.q('.hud-ml'),
      bl: this.q('.hud-bl'), bc: this.q('.hud-bc'), br: this.q('.hud-br'),
    };

    this.nameEl = this.q('.cap-name'); this.subEl = this.q('.cap-sub'); this.envEl = this.q('.cap-env'); this.fpsEl = this.q('.cap-fps');
    this.hpBar = this.q('.gauge.hp'); this.hpFill = this.q('.fill', this.hpBar); this.hpLag = this.q('.lag', this.hpBar); this.hpTxt = this.q('.gv', this.hpBar);
    this.stBar = this.q('.gauge.st'); this.stFill = this.q('.fill', this.stBar); this.stLag = this.q('.lag', this.stBar);
    this.fjBar = this.q('.gauge.fj'); this.fjFill = this.q('.fill', this.fjBar); this.fjTxt = this.q('.gv', this.fjBar);
    this.xpFill = this.q('.gauge.xp .fill');
    this.goldEl = this.q('.cap-gold b'); this.provEl = this.q('.cap-prov'); this.crewEl = this.q('.cap-crew'); this.upkeepEl = this.q('.cap-upkeep'); this.weaponsEl = this.q('.cap-weapons');

    this.shipEl = this.q('.hud-ship'); this.shipName = this.q('.ship-name'); this.shipSail = this.q('.ship-sail');
    const [hull, sail, crew, rep] = Array.from(this.shipEl.querySelectorAll<HTMLElement>('.gline'));
    this.hullBar = this.q('.fill', hull); this.hullVal = this.q('b', hull);
    this.sailBar = this.q('.fill', sail); this.sailVal = this.q('b', sail);
    this.crewBar = this.q('.fill', crew); this.crewVal = this.q('b', crew);
    this.repBar = this.q('.fill', rep); this.repVal = this.q('b', rep);
    this.shipCrew = this.q('.ship-crew'); this.shipFire = this.q('.ship-fire'); this.shipTip = this.q('.hud-tip');
    this.shipFlow = this.q('.ship-flow'); this.shipCell = this.q('.ship-cell');
    this.gunL = this.q('.gun.l'); this.gunR = this.q('.gun.r'); this.ammoEl = this.q('.ammo');

    this.mini = this.q('.hud-mini canvas'); this.questEl = this.q('.hud-quest'); this.arrowEl = this.q('.q-arrow'); this.badge = this.q('.badge');
    this.ctxEl = this.q('.hud-ctx'); this.cmdsEl = this.q('.hud-cmds'); this.fleetEl = this.q('.hud-fleet'); this.itemBar = this.q('.itembar'); this.skillbar = this.q('.skillbar');

    this.q('.hud-pause').addEventListener('click', () => this.onPause());
    this.q('.hud-faji').addEventListener('click', () => this.onFaji());
    this.q('.hud-mini').addEventListener('click', () => this.onMap());
    // Erklärung zu Segel-% und Crew-%: am PC beim Überfahren, am Handy per Antippen
    this.shipEl.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.shipTip.hidden = false; });
    this.shipEl.addEventListener('pointerleave', () => { this.shipTip.hidden = true; });
    this.shipEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.ammo')) return;
      this.shipTip.hidden = !this.shipTip.hidden;
    });
    this.ammoEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-ammo]');
      if (b) this.onAmmo(b.dataset.ammo as AmmoId);
    });
    this.fleetEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-o]');
      if (b) this.onFleetOrder(b.dataset.o as FleetOrder);
    });
    this.cmdsEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-c]');
      if (b) this.onCommand(b.dataset.c as CommandState);
    });
    this.ctxEl.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onContext(true); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) this.ctxEl.addEventListener(t, () => this.onContext(false));

    // Meldungen stehen in einer eigenen Spalte, auch sichtbar, wenn das HUD selbst verborgen ist (z. B. Fehler im Menü)
    const notice = document.createElement('div');
    notice.className = 'hud-notice';
    notice.innerHTML = '<div class="hud-hint" hidden></div><div class="hud-toast" role="status" aria-live="polite"></div>';
    parent.appendChild(notice);
    this.hintEl = this.q('.hud-hint', notice);
    this.toastEl = this.q('.hud-toast', notice);
    this.notice = notice;
    // Meldungen stehen immer unter dem Stapel der oberen Mitte (Kompass, Sektor, Boss), nie darüber
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.placeNotice()).observe(this.regions.tc);
  }

  private notice!: HTMLElement;

  private placeNotice() {
    if (this.root.hidden) { this.notice.style.top = ''; return; }
    const r = this.regions.tc.getBoundingClientRect();
    this.notice.style.top = `${Math.round(Math.max(r.bottom + 10, innerHeight * 0.12))}px`;
  }

  // ---------- Hilfen: nur bei Änderung ins DOM schreiben ----------

  /** Balken über die Grafikkarte skalieren (transform) statt die Breite zu ändern (Layout bei jedem Bild) */
  private bar(el: HTMLElement, frac: number) {
    const v = `scaleX(${clamp01(frac).toFixed(3)})`;
    if (this.last.get(el) !== v) { this.last.set(el, v); el.style.transform = v; }
  }

  private text(el: HTMLElement, t: string) {
    if (this.last.get(el) !== t) { this.last.set(el, t); el.textContent = t; }
  }

  private put(el: HTMLElement, prop: string, v: string) {
    if (this.last.get(el) === prop + v) return;
    this.last.set(el, prop + v);
    el.style.setProperty(prop, v);
  }

  setVisible(v: boolean) {
    this.root.hidden = !v;
    this.placeNotice();
    if (!v) { this.hintEl.hidden = true; this.ctxEl.hidden = true; this.ctxText = ''; this.skillbar.hidden = true; }
  }

  setPlayer(name: string, sub: string) {
    this.nameEl.textContent = name;
    this.subEl.textContent = sub;
  }

  /** Kontextplakette (z. B. „An Land gehen“). key = Tastenname für die Tastenkappe */
  setContext(label: string | null, key: string | null) {
    const text = label ? `${esc(label)}${key ? ` <kbd>${esc(key)}</kbd>` : ''}` : '';
    if (this.ctxText === text) return;
    this.ctxText = text;
    this.ctxEl.hidden = !label || this.root.hidden;
    this.ctxEl.innerHTML = text;
    this.ctxEl.dataset.kind = label ? ctxKind(label) : '';
  }

  /**
   * Besatzung: die Zeile „Offiziere A/B · Truppen X/Y“ in der Kapitänstafel (A = im Einsatz oder eingeteilt, B = Plätze der Schiffsklasse;
   * X = Köpfe, Y = Kapazität) und, solange Trupps im Einsatz sind, die Befehlstafel `[1] Sturmangriff · [2] Folgen · [3] Position halten`.
   * null blendet beides aus.
   */
  /**
   * Sold-Zeile in der Kapitänstafel: „Sold 63/Tag“; `level` 1 = Zahltag naht und das Gold reicht nicht (Vorwarnung), 2 = Rückstand
   * oder schlechte Moral (rot). null blendet die Zeile aus.
   */
  setUpkeep(info: { text: string; level: 0 | 1 | 2; note: string } | null) {
    const key = info ? `${info.text}|${info.level}|${info.note}` : '';
    if (this.last.get(this.upkeepEl) === key) return;
    this.last.set(this.upkeepEl, key);
    if (!info) { this.upkeepEl.hidden = true; return; }
    this.upkeepEl.hidden = false;
    this.upkeepEl.dataset.level = String(info.level);
    this.upkeepEl.innerHTML = `<span>${esc(info.text)}</span>${info.note ? `<b>${esc(info.note)}</b>` : ''}`;
  }

  setCrewLine(info: CrewLine | null) {
    const key = info ? `${info.officers}/${info.slots}|${info.troops}/${info.troopMax}|${info.cmds?.join(',') ?? ''}|${info.active}` : '';
    if (this.last.get(this.crewEl) === key) return;
    this.last.set(this.crewEl, key);
    if (!info) { this.crewEl.hidden = true; this.cmdsEl.hidden = true; return; }
    this.crewEl.hidden = false;
    const t = Math.round(info.troops);
    this.crewEl.innerHTML = `<span${info.officers >= info.slots ? ' class="full"' : ''}>Offiziere <b>${info.officers}/${info.slots}</b></span>${info.troopMax > 0 ? `<span${t >= info.troopMax ? ' class="full"' : ''}>Truppen <b>${fmtInt(t)}/${fmtInt(info.troopMax)}</b></span>` : ''}`;
    this.cmdsEl.hidden = !info.cmds || this.root.hidden;
    if (info.cmds) {
      this.cmdsEl.innerHTML = `<span class="cmd-label">Befehle</span>${COMMANDS.map((c, i) => `<button type="button" class="cmd${info.active === c.id ? ' on' : ''}" data-c="${c.id}" aria-pressed="${info.active === c.id}"><kbd>${esc(info.cmds![i] ?? String(i + 1))}</kbd>${esc(c.label)}</button>`).join('')}`;
    }
  }

  /**
   * Flottentafel (Begleitschiffe des Spielers): je Schiff ein Rumpfbalken, darunter die drei Befehle mit Taste (Tastatur oder Gamepad-Kombination); `anchored`
   * zeigt, dass die Flotte beim festgemachten Flaggschiff auf Abstand ankert. null blendet sie aus.
   */
  setFleet(info: { ships: { name: string; hull: number; alive: boolean }[]; order: FleetOrder; keys: string[]; anchored: boolean } | null) {
    const key = info ? `${info.order}|${info.anchored}|${info.keys.join(',')}|${info.ships.map((s) => `${s.name}:${Math.round(s.hull * 20)}:${s.alive}`).join(';')}` : '';
    if (this.last.get(this.fleetEl) === key) return;
    this.last.set(this.fleetEl, key);
    this.fleetEl.hidden = !info || this.root.hidden;
    if (!info) return;
    const ships = info.ships.map((s) => `<i class="fs${s.alive ? '' : ' dead'}${s.hull < 0.3 ? ' low' : ''}" title="${esc(s.name)} ${Math.round(s.hull * 100)} %"><b style="--f:${Math.max(0, Math.min(1, s.hull)).toFixed(2)}"></b></i>`).join('');
    this.fleetEl.innerHTML = `<span class="cmd-label">Flotte${info.anchored ? ' ⚓' : ''}</span><span class="fleet-ships">${ships}</span>${FLEET_ORDERS.map((o, i) => `<button type="button" class="cmd${info.order === o.id ? ' on' : ''}" data-o="${o.id}" aria-pressed="${info.order === o.id}" title="${esc(o.desc)}"><kbd>${esc(info.keys[i] ?? '')}</kbd>${esc(o.short)}</button>`).join('')}`;
  }

  /** Schiffstafel; null blendet sie aus */
  setSea(v: SeaView | null) {
    if (this.shipEl.hidden !== !v) this.shipEl.hidden = !v;
    if (!v) return;
    this.text(this.shipName, v.name);
    this.text(this.shipSail, v.level);
    for (const [bar, val, f, low] of [[this.hullBar, this.hullVal, v.hull, v.hull < 0.25], [this.sailBar, this.sailVal, v.sail, v.sail < 0.3], [this.crewBar, this.crewVal, v.crew, v.crew < 0.3]] as const) {
      this.bar(bar, f);
      this.text(val, fmtPct(f));
      bar.parentElement!.classList.toggle('low', low);
    }
    const rep = this.repBar.closest<HTMLElement>('.gline')!;
    const repairing = v.repair !== null;
    if (rep.hidden === repairing) rep.hidden = !repairing;
    if (repairing) { this.bar(this.repBar, v.repair!); this.text(this.repVal, fmtPct(v.repair!)); }
    const k = `${Math.round(v.sailors.n)}/${v.sailors.max}|${v.troops ? `${Math.round(v.troops.n)}/${v.troops.max}` : ''}`;
    if (this.last.get(this.shipCrew) !== k) {
      this.last.set(this.shipCrew, k);
      this.shipCrew.innerHTML = `<span>Seeleute <b>${Math.round(v.sailors.n)}/${v.sailors.max}</b></span>${v.troops ? `<span>Truppen <b>${fmtInt(v.troops.n)}/${fmtInt(v.troops.max)}</b></span>` : ''}`;
    }
    if (this.shipFire.hidden === v.fire) this.shipFire.hidden = !v.fire;
    // Strömungs-Anzeige: Pfeil zeigt die Fließrichtung relativ zum Bug (oben = mit dem Schiff), Bonus leuchtet, solange er wirkt
    const fl = v.flow ?? null;
    if (this.shipFlow.hidden !== !fl) this.shipFlow.hidden = !fl;
    if (fl) {
      this.text(this.q('.flow-name', this.shipFlow), fl.name);
      this.text(this.q('.flow-boost', this.shipFlow), fl.boost > 0.01 ? `+${Math.round(fl.boost * 100)} %` : 'quer');
      this.put(this.q('.flow-arrow', this.shipFlow), '--r', `${(-fl.rel - Math.PI / 2).toFixed(2)}rad`);
      this.shipFlow.classList.toggle('on', fl.boost > 0.01);
    }
    const ce = v.cell ?? null;
    if (this.shipCell.hidden !== !ce) this.shipCell.hidden = !ce;
    if (ce) {
      this.text(this.shipCell, `${ce.icon} ${ce.label}${ce.k < 0.6 ? ' (Rand)' : ''}`);
      if (this.shipCell.dataset.kind !== ce.kind) this.shipCell.dataset.kind = ce.kind;
    }
    if (!this.shipTip.hidden) this.text(this.shipTip, v.tip);
    // Geschützdeck: Fortschritt des Nachladens (voll = bereit) und gewählte Munition
    for (const [gun, rem] of [[this.gunL, v.reloadL], [this.gunR, v.reloadR]] as const) {
      this.bar(this.q('.fill', gun), 1 - rem);
      gun.classList.toggle('ready', rem <= 0.001);
    }
    this.ammoEl.querySelectorAll<HTMLElement>('button').forEach((b) => {
      const on = b.dataset.ammo === v.ammo;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  /** Stil-Zeile (4.6A): aktueller Kampfstil und der nächste beim Wechsel; `active` hebt den ersten oder zweiten Eintrag hervor */
  setWeapons(a: string, b: string, active: 0 | 1) {
    const w0 = this.q('.w0', this.weaponsEl), w1 = this.q('.w1', this.weaponsEl);
    this.text(w0, a); this.text(w1, b);
    w0.classList.toggle('on', active === 0); w1.classList.toggle('on', active === 1);
  }

  setFaji(frac: number, sp: number, now?: number, max?: number) {
    this.bar(this.fjFill, frac);
    if (now !== undefined && max !== undefined) this.text(this.fjTxt, `${Math.round(now)} / ${Math.round(max)}`);
    if (this.badge.hidden !== sp <= 0) this.badge.hidden = sp <= 0;
    if (sp > 0) this.text(this.badge, String(sp));
  }

  /**
   * Schnellleiste für Güter (Tasten 1–4): Symbol, Menge, Abklingzeit als Kreisausschnitt, laufende Stärkung als Rand.
   * `cmd` ist gesetzt, solange Trupps im Einsatz sind: Eintrag i nennt den Befehl, der den Platz i belegt (sonst null); die
   * Leiste zeigt dann deutlich „Befehlsmodus“ und die Güter dieser Plätze ruhen.
   */
  setItemBar(show: boolean, views: { id: string | null; icon: string; name: string; color: string; count: number; cdFrac: number; ready: boolean; active: number }[], keys: string[], cmd: (string | null)[] | null = null) {
    const bar = this.itemBar;
    bar.hidden = !show || this.root.hidden;
    if (bar.hidden) return;
    const key = views.map((v) => `${v.id}${v.count}`).join('|') + keys.join() + (cmd?.join('|') ?? '-');
    if (key !== this.itemKey) {
      this.itemKey = key;
      const mode = cmd?.some(Boolean) ? '<div class="mode"><i></i>Befehlsmodus · Güter auf freien Plätzen</div>' : '';
      bar.classList.toggle('cmdmode', !!mode);
      bar.innerHTML = mode + views.map((v, i) => {
        const c = cmd?.[i] ?? null;
        return `<div class="ib${v.id ? '' : ' empty'}${c ? ' cmd' : ''}" style="--c:${v.color}" title="${esc(c ? `Befehl: ${c}` : v.name)}"><kbd>${esc(keys[i] ?? '')}</kbd><span class="ic">${v.icon}</span>${v.id ? `<b class="cnt">${v.count}</b>` : ''}${c ? `<span class="cmdname">${esc(c)}</span>` : ''}</div>`;
      }).join('');
    }
    const off = bar.querySelector('.mode') ? 1 : 0;
    views.forEach((v, i) => {
      const el = bar.children[i + off] as HTMLElement | undefined;
      if (!el) return;
      this.put(el, '--p', v.cdFrac.toFixed(3));
      this.put(el, '--a', v.active.toFixed(3));
      el.classList.toggle('ready', v.ready);
      el.classList.toggle('none', !!v.id && v.count <= 0);
      el.classList.toggle('buff', v.active > 0);
    });
  }

  /** Fähigkeitsleiste unten (nur ohne Touch) */
  setSkillBar(show: boolean, views: { name: string; short: string; color: string; cdFrac: number; ready: boolean; id: string | null; sea: boolean }[], keys: string[], atSea = false) {
    this.skillbar.hidden = !show || this.root.hidden;
    if (this.skillbar.hidden) return;
    const key = views.map((v) => v.id + v.name).join('|') + keys.join();
    if (key !== this.skillKey) {
      this.skillKey = key;
      this.skillbar.innerHTML = views.map((v, i) => `<div class="sb${v.id ? '' : ' empty'}" style="--c:${v.color}" title="${esc(v.name)}"><kbd>${esc(keys[i] ?? '')}</kbd><span>${esc(v.short)}</span></div>`).join('');
    }
    views.forEach((v, i) => {
      const el = this.skillbar.children[i] as HTMLElement | undefined;
      if (!el) return;
      this.put(el, '--p', v.cdFrac.toFixed(3));
      el.classList.toggle('ready', v.ready && (!atSea || v.sea));
      el.classList.toggle('dim', atSea && !!v.id && !v.sea);
    });
  }

  /** Ausdauerbalken (zu Fuß; null blendet ihn aus). Der helle Nachlauf folgt verzögert (CSS), bei zu wenig Ausdauer blinkt er rot. */
  setStamina(frac: number | null, flash = false) {
    const hide = frac === null;
    if (this.stBar.hidden !== hide) this.stBar.hidden = hide;
    if (hide) return;
    this.bar(this.stFill, frac);
    this.bar(this.stLag, frac);
    this.stBar.classList.toggle('flash', flash);
    this.stBar.classList.toggle('low', frac < 0.25);
  }

  setStats(hpFrac: number, xpFrac: number, gold: number, hp?: { now: number; max: number } | null) {
    this.bar(this.hpFill, hpFrac);
    this.bar(this.hpLag, hpFrac);
    this.hpBar.classList.toggle('low', hpFrac < 0.25 && hpFrac > 0);
    if (hp) this.text(this.hpTxt, `${fmtInt(hp.now)} / ${fmtInt(hp.max)}`);
    this.bar(this.xpFill, xpFrac);
    this.text(this.goldEl, fmtInt(gold));
  }

  /** Zeichenfläche der Minikarte (in passender Pixeldichte); null, wenn ausgeblendet */
  miniCanvas(): { ctx: CanvasRenderingContext2D; size: number } | null {
    if (this.root.hidden) return null;
    const size = this.mini.clientWidth;
    if (!size) return null;
    const px = Math.round(size * Math.min(2, devicePixelRatio));
    if (this.mini.width !== px) { this.mini.width = px; this.mini.height = px; }
    const ctx = this.mini.getContext('2d');
    return ctx ? { ctx, size } : null;
  }

  setPotions(n: number) {
    const k = String(n);
    if (this.last.get(this.provEl) === k) return;
    this.last.set(this.provEl, k);
    this.provEl.innerHTML = `<span aria-hidden="true">🍖</span> <b>${n}</b>`;
  }

  /** Verfolgter Auftrag mit Richtungspfeil (Winkel relativ zur Kamera, null = keiner) */
  setQuest(q: { title: string; step: string; angle: number | null; dist: number | null; frac?: number | null; main?: boolean } | null) {
    this.questEl.hidden = !q;
    if (!q) { this.questKey = ''; return; }
    const step = q.dist !== null && q.dist > 25 ? `${q.step} · ${fmtDist(q.dist)}` : q.step;
    const bar = this.q('.q-bar', this.questEl);
    const frac = q.frac ?? null;
    if (bar.hidden !== (frac === null)) bar.hidden = frac === null;
    if (frac !== null) (bar.firstElementChild as HTMLElement).style.transform = `scaleX(${frac.toFixed(2)})`;
    this.questEl.classList.toggle('main', !!q.main);
    const key = q.title + step;
    if (key !== this.questKey) {
      this.questKey = key;
      this.q('.q-title', this.questEl).textContent = q.title;
      this.q('.q-step', this.questEl).textContent = step;
    }
    this.put(this.arrowEl, 'visibility', q.angle === null ? 'hidden' : 'visible');
    if (q.angle !== null) this.put(this.arrowEl, 'transform', `rotate(${(q.angle - Math.PI / 2).toFixed(2)}rad)`);
  }

  setEnv(text: string) { this.text(this.envEl, text); }

  setFps(show: boolean, text: string) {
    this.fpsEl.hidden = !show;
    if (show) this.text(this.fpsEl, text);
  }

  hint(text: string, seconds = 10) {
    if (this.quiet) return;
    this.hintEl.textContent = text;
    this.hintEl.hidden = false;
    this.hintEl.style.opacity = '1';
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => {
      this.hintEl.style.opacity = '0';
      this.hintTimer = window.setTimeout(() => { this.hintEl.hidden = true; }, 700);
    }, seconds * 1000);
  }

  /**
   * 4.6G.2: Ruhe für den Charakter-Editor – solange er offen ist, verwirft das HUD jede Welt-, Handels- und Ereignismeldung (auch verzögerte
   * über `Game.after`), und was gerade sichtbar ist, verschwindet sofort.
   */
  private quiet = false;
  get isQuiet() { return this.quiet; }
  setQuiet(on: boolean) {
    this.quiet = on;
    if (!on) return;
    clearTimeout(this.toastTimer);
    clearTimeout(this.hintTimer);
    this.toastEl.classList.remove('on');
    this.toastEl.textContent = '';
    this.hintEl.hidden = true;
  }

  toast(text: string, seconds = 2.4) {
    if (this.quiet) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), seconds * 1000);
  }
}
