export type GameState = 'boot' | 'menu' | 'play' | 'pause' | 'editor';

type Listener = (next: GameState, prev: GameState) => void;

export class StateMachine {
  private _current: GameState = 'boot';
  private listeners: Listener[] = [];

  get current() { return this._current; }

  is(...states: GameState[]) { return states.includes(this._current); }

  set(next: GameState) {
    if (next === this._current) return;
    const prev = this._current;
    this._current = next;
    for (const l of this.listeners) l(next, prev);
  }

  onChange(l: Listener) { this.listeners.push(l); }
}
