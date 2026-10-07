import { World, type Body, type World as MatterWorld } from "matter-js";
import type { Entity } from "./entity";
import { runAll } from "./cleanup";

export type OwnerLifetime = "remove" | "persist";
export interface EntityRegistration {
      ownerDeath?: OwnerLifetime;
      ownerRemoval?: OwnerLifetime;
      matchEnd?: OwnerLifetime;
}

interface Entry { entity: Entity; ownership: Required<EntityRegistration>; }

/** One stable identity/body registry. Logical removal is immediate; Matter mutation is deferred. */
export class EntityRegistry {
      private readonly entries = new Map<string, Entry>();
      private readonly bodies = new Map<Body, string>();
      private readonly pendingAdds: Entry[] = [];
      private readonly pendingRemoves = new Set<string>();
      private mutationDepth = 0;

      constructor(private readonly world: MatterWorld) {}

      get size(): number { return this.all().length; }
      hasRuntimeId(id: string): boolean {
            return this.entries.has(id) || this.pendingAdds.some(entry => entry.entity.runtimeId === id);
      }
      all(): readonly Entity[] {
            return [...this.entries.values()].map(entry => entry.entity).filter(entity => !entity.isRemoved);
      }
      get(runtimeId: string): Entity | null {
            const entity = this.entries.get(runtimeId)?.entity;
            return entity && !entity.isRemoved ? entity : null;
      }
      byBody(body: Body): Entity | null {
            const id = this.bodies.get(body);
            return id ? this.get(id) : null;
      }
      isLive(entity: Entity): boolean { return this.get(entity.runtimeId) === entity && !entity.isDead; }

      add(entity: Entity, registration: EntityRegistration = {}): void {
            if (entity.isRemoved || this.entries.has(entity.runtimeId) ||
                  this.pendingAdds.some(entry => entry.entity.runtimeId === entity.runtimeId))
                  throw new Error(`Duplicate or removed entity: ${entity.runtimeId}`);
            this.pendingAdds.push({ entity, ownership: {
                  ownerDeath: registration.ownerDeath ?? "remove",
                  ownerRemoval: registration.ownerRemoval ?? "remove",
                  matchEnd: registration.matchEnd ?? "persist",
            } });
            if (this.mutationDepth === 0) this.flush();
      }

      remove(runtimeId: string, reason: Parameters<Entity["remove"]>[0]): boolean {
            const entry = this.entries.get(runtimeId) ??
                  this.pendingAdds.find(candidate => candidate.entity.runtimeId === runtimeId);
            if (!entry || entry.entity.isRemoved) return false;
            try { entry.entity.remove(reason); }
            finally {
                  this.pendingRemoves.add(runtimeId);
                  try { this.retireDependents(entry.entity, "removal"); }
                  finally { if (this.mutationDepth === 0) this.flush(); }
            }
            return true;
      }

      /** Keep Matter world mutations outside engine callbacks and gameplay dispatch. */
      beginMutationBoundary(): void { this.mutationDepth++; }
      endMutationBoundary(): void {
            if (this.mutationDepth === 0) throw new Error("Unbalanced entity mutation boundary");
            this.mutationDepth--;
            if (this.mutationDepth === 0) this.flush();
      }

      /** Safe point before Engine.update: retired bodies must not impart physics impulses. */
      commitRemovals(): void {
            for (const id of this.pendingRemoves) {
                  const entry = this.entries.get(id);
                  if (entry) {
                        World.remove(this.world, entry.entity.body);
                        this.bodies.delete(entry.entity.body);
                        this.entries.delete(id);
                  }
            }
            this.pendingRemoves.clear();
      }

      retireDeadOwners(): void {
            this.cleanup([...this.entries.values()], ({ entity }) => {
                  if (entity.isDead && !entity.isRemoved) this.retireDependents(entity, "death");
            });
      }

      retireMatchEnd(): void {
            this.cleanup([...this.entries.values(), ...this.pendingAdds], entry => {
                  if (entry.ownership.matchEnd === "remove") this.remove(entry.entity.runtimeId, "match-ended");
            });
      }

      clear(reason: Parameters<Entity["remove"]>[0]): void {
            this.beginMutationBoundary();
            try {
                  this.cleanup([...this.entries.values(), ...this.pendingAdds],
                        entry => { this.remove(entry.entity.runtimeId, reason); });
            } finally {
                  this.endMutationBoundary();
            }
      }

      private retireDependents(owner: Entity, event: "death" | "removal"): void {
            this.cleanup([...this.entries.values(), ...this.pendingAdds], entry => {
                  if (entry.entity.ownerId !== owner.runtimeId || entry.entity.isRemoved) return;
                  const policy = event === "death" ? entry.ownership.ownerDeath : entry.ownership.ownerRemoval;
                  if (policy === "remove") this.remove(entry.entity.runtimeId, event === "death" ? "owner-death" : "owner-removed");
            });
      }

      /** A failing cleanup must not strand sibling entities in the Matter world. */
      private cleanup(entries: readonly Entry[], release: (entry: Entry) => void): void {
            runAll(entries.map(entry => () => release(entry)));
      }

      private flush(): void {
            if (this.mutationDepth > 0) return;
            this.commitRemovals();
            for (const entry of this.pendingAdds.splice(0)) {
                  if (entry.entity.isRemoved) continue;
                  this.entries.set(entry.entity.runtimeId, entry);
                  this.bodies.set(entry.entity.body, entry.entity.runtimeId);
                  World.add(this.world, entry.entity.body);
            }
      }
}
