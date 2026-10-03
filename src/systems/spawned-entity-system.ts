import type { SpawnedEntity, SpawnedEntityContext, EntityRemovalReason } from "../gameplay/spawned-entity";

/** Explicit owner-bound lifecycle for current support entities. */
export class SpawnedEntitySystem {
      private readonly entities = new Set<SpawnedEntity>();

      add(entity: SpawnedEntity): void { if (!entity.removed) this.entities.add(entity); }

      update(deltaMs: number, context: SpawnedEntityContext, combatActive: boolean): void {
            for (const entity of [...this.entities]) {
                  if (!combatActive) entity.remove("match-ended");
                  else if (!context.characters.includes(entity.owner)) entity.remove("owner-removed");
                  else if (entity.owner.isDead) entity.remove("owner-death");
                  else if (Number.isFinite(deltaMs) && deltaMs > 0) entity.update(deltaMs, context);
                  if (entity.removed) this.entities.delete(entity);
            }
      }

      clear(reason: EntityRemovalReason): void {
            for (const entity of this.entities) entity.remove(reason);
            this.entities.clear();
      }

      draw(ctx: CanvasRenderingContext2D, arena: SpawnedEntityContext["arena"]): void {
            for (const entity of this.entities) if (!entity.removed) entity.draw(ctx, arena);
      }
}
