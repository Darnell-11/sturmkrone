import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = (name: string) => readFileSync(new URL(`../src/ui/css/${name}.css`, import.meta.url), 'utf8');

describe('Oberflächen-Regeln, die schon einmal Eingaben verschluckt haben', () => {
  it('die Schwarzblende des Titelbilds fängt nie Zeiger ab (`#ui > *` schaltet sie sonst ein: kein Tipp und kein Klick käme im Spiel an)', () => {
    const base = css('base');
    // diese Regel ist der Grund für das `!important`: sie hat höhere Spezifität als jede Klassenregel
    expect(base).toMatch(/#ui > \* \{ pointer-events: auto; \}/);
    const rule = css('screens').match(/\.title-fade\s*\{([^}]*)\}/);
    expect(rule, 'Regel .title-fade fehlt').toBeTruthy();
    expect(rule![1]).toMatch(/pointer-events:\s*none\s*!important/);
  });

  it('alle bildschirmfüllenden Hilfsschichten im HUD-Bereich lassen Zeiger durch', () => {
    const hud = css('hud');
    expect(hud).toMatch(/\.hud \{[^}]*pointer-events: none !important/);
    expect(css('touch')).toMatch(/\.touch \{[^}]*pointer-events: none !important/);
  });
});
