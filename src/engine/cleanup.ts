/** Run every action in the supplied order, then propagate the first failure (including thrown undefined). */
export function runAll(actions: Iterable<() => void>): void {
      let failed = false;
      let failure: unknown;
      for (const action of actions) {
            try { action(); }
            catch (error) { if (!failed) failure = error; failed = true; }
      }
      if (failed) throw failure;
}
