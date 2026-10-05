import type { Entity } from "../entity";

export interface OverlapChanges {
      entered: readonly Entity[];
      staying: readonly Entity[];
      exited: readonly Entity[];
}

/** Caller-owned overlap history. No automatic ticking, effects, or event dispatch. */
export class OverlapTracker {
      private previous = new Set<Entity>();

      update(entities: readonly Entity[]): OverlapChanges {
            const current = new Set(entities);
            const sort = (items: Entity[]) => items.sort((a, b) =>
                  a.runtimeId < b.runtimeId ? -1 : a.runtimeId > b.runtimeId ? 1 : 0);
            const changes = {
                  entered: sort([...current].filter(entity => !this.previous.has(entity))),
                  staying: sort([...current].filter(entity => this.previous.has(entity))),
                  exited: sort([...this.previous].filter(entity => !current.has(entity))),
            };
            this.previous = current;
            return changes;
      }

      /** Silently discard history on owner cleanup/reset; update([]) reports exits. */
      clear(): void { this.previous.clear(); }
}
