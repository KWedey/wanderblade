// The save layer talks to the global `localStorage`, which Node's test env
// lacks. A Map-backed stand-in lets writeSave/readSave round-trip for real.
export class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export function installMemoryStorage(): void {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
}
