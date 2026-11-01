export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
}

/** localStorage, falls verfügbar – sonst (z. B. privater Modus) ein flüchtiger Speicher. */
export function browserStore(): { store: KeyValueStore; persistent: boolean } {
  try {
    const t = '__sturmkrone_test';
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    return { store: localStorage, persistent: true };
  } catch {
    return { store: new MemoryStore(), persistent: false };
  }
}
