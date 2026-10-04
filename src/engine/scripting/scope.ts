/** Per-operation resources released once in reverse acquisition order. */
export class ScriptScope {
      private releases: Array<() => void> = [];
      private closed = false;

      get isClosed(): boolean { return this.closed; }

      add(release: () => void): void {
            if (this.closed) release();
            else this.releases.push(release);
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
