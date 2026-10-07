import { runAll } from "../cleanup";

/** Simulation-owned barrier: event callbacks never advance a generator recursively. */
export class EventScheduler {
      private pending: Array<() => void> = [];
      private sources = new Set<{ close(): void }>();
      private deadlines = new Set<{ atMs: number; callback: () => void }>();
      sequence = 0;

      constructor(readonly clock: { readonly nowMs: number; readonly tick: number }) { }

      stage(callback: () => void): void { this.pending.push(callback); }
      at(atMs: number, callback: () => void): () => void {
            const entry = { atMs, callback };
            this.deadlines.add(entry);
            return () => { this.deadlines.delete(entry); };
      }
      track(source: { close(): void }): () => void {
            this.sources.add(source);
            return () => { this.sources.delete(source); };
      }
      flush(): void {
            const ready = this.pending;
            this.pending = [];
            for (const callback of ready) callback();
            for (const entry of [...this.deadlines]) {
                  if (this.deadlines.has(entry) && this.clock.nowMs >= entry.atMs) {
                        this.deadlines.delete(entry);
                        entry.callback();
                  }
            }
      }
      clear(): void {
            try { runAll([...this.sources].map(source => () => source.close())); }
            finally {
                  this.pending = [];
                  this.deadlines.clear();
                  this.sequence = 0;
            }
      }
}
