import { runAll } from "../cleanup";

export type ScriptResource = (() => void) | { release(): void };

/** Resources released once in reverse acquisition order. */
export class ScriptScope {
      private releases = new Map<object, () => void>();
      private readonly resources = new WeakSet<ScriptResource>();
      private closed = false;

      get isClosed(): boolean { return this.closed; }

      /** Register cleanup; the returned function detaches it without executing it. */
      add(release: () => void): () => void {
            if (this.closed) { release(); return () => {}; }
            const token = {};
            this.releases.set(token, release);
            return () => { this.releases.delete(token); };
      }

      use<T extends ScriptResource>(resource: T): T {
            if (!this.resources.has(resource)) {
                  this.resources.add(resource);
                  this.add(typeof resource === "function" ? resource : () => resource.release());
            }
            return resource;
      }

      release(): void {
            if (this.closed) return;
            this.closed = true;
            const releases = [...this.releases.entries()].reverse();
            try {
                  runAll(releases.map(([token, release]) => () => {
                        // Earlier cleanup can detach a later registration.
                        if (!this.releases.delete(token)) return;
                        release();
                  }));
            } finally { this.releases.clear(); }
      }
}
