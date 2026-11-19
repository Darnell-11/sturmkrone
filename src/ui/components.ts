// Kleine HTML-Bausteine der Menüs (Zeichenketten): Anzeigebalken und Goldzeile, damit nicht jeder Bildschirm sein eigenes Muster baut.
import { esc } from './dom';
import { fmtInt } from '../core/format';

/**
 * Anzeigebalken (Stil `.gauge`, siehe css/panels.css): frac 0 … 1; `color` setzt --c (Standard: Rot). Die Füllung kommt über --v.
 * `cls` hängt Zusatzklassen an (`thin`, `tall`).
 */
export function gaugeHtml(frac: number, o: { color?: string; cls?: string } = {}): string {
  const v = Math.max(0, Math.min(1, frac)).toFixed(3);
  return `<div class="gauge${o.cls ? ` ${o.cls}` : ''}" style="--v:${v}${o.color ? `;--c:${o.color}` : ''}"><i class="fill"></i></div>`;
}

/** Zeile „Gold: 1.250 · Meldung“ unter der Überschrift eines Ladens oder Hafenmenüs */
export function goldLine(gold: number, msg = ''): string {
  return `<p class="soft">Gold: <b class="num">${fmtInt(gold)}</b>${msg ? ` · <b>${esc(msg)}</b>` : ''}</p>`;
}

/** Schalterzeile (Stil `.toggle`): Beschriftung mit Erklärung links, Messing-Schalter rechts; der Schalter ist ein Knopf mit aria-pressed */
export function toggleHtml(action: string, label: string, on: boolean, hint = ''): string {
  return `<button class="toggle" data-a="${action}" aria-pressed="${on}" role="switch" aria-checked="${on}"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span><i aria-hidden="true"></i></button>`;
}

/** Regler (Stil `.slider`): `input` = Name der Eingabe-Aktion, `id` ergänzt sie (z. B. welcher Kanal) */
export function sliderHtml(o: { label: string; input: string; id?: string; min: number; max: number; step: number; value: number; unit?: string }): string {
  const fill = ((o.value - o.min) / (o.max - o.min)) * 100;
  return `<label class="slider">${esc(o.label)}<input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${o.value}" data-input="${o.input}"${o.id ? ` data-id="${o.id}"` : ''} style="--fill:${fill}%"><output>${o.value}${esc(o.unit ?? '')}</output></label>`;
}
