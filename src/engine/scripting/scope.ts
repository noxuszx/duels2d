export type ScriptResource = (() => void) | { release(): void };

/** Resources released once in reverse acquisition order. */
export class ScriptScope {
      private releases: Array<() => void> = [];
      private readonly resources = new Set<ScriptResource>();
      private closed = false;

      get isClosed(): boolean { return this.closed; }

      add(release: () => void): void {
            if (this.closed) release();
            else this.releases.push(release);
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
            const releases = this.releases;
            this.releases = [];
            let failed = false;
            let firstError: unknown;
            for (let index = releases.length - 1; index >= 0; index--) {
                  try { releases[index](); }
                  catch (error) {
                        if (!failed) firstError = error;
                        failed = true;
                  }
            }
            if (failed) throw firstError;
      }
}
