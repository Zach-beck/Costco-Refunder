type Entry = { value: string; expiresAt: number | null };

export class MemoryRedis {
  private store = new Map<string, Entry>();

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async incr(key: string): Promise<number> {
    const current = this.live(key);
    const next = (current ? parseInt(current.value, 10) : 0) + 1;
    this.store.set(key, {
      value: String(next),
      expiresAt: current?.expiresAt ?? null,
    });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(
    key: string,
    value: string,
    mode?: "EX",
    seconds?: number
  ): Promise<"OK"> {
    const expiresAt =
      mode === "EX" && seconds ? Date.now() + seconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async quit(): Promise<void> {}
}
