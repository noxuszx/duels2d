import type { Entity } from "../../engine/entity";
import type { EntityComponent } from "../../engine/component";
import type { ComponentContext } from "../../engine/component";
import type { FaceTargetConfig } from "../../types/fighter";

/** Owner-bound nearest-enemy query; behavior still decides when to ask for a target. */
export class Targeting implements EntityComponent {
      constructor(private readonly context: ComponentContext,
            private readonly facing: FaceTargetConfig = { mode: "never" }) {}
      attach(): void {}
      nearestEnemy(): Entity | null {
            const { entity, simulation } = this.context;
            let nearest: Entity | null = null;
            let best = Infinity;
            for (const candidate of simulation.entities.all()) {
                  if (!candidate.isAlive || !candidate.tags.has("targetable") ||
                        candidate === entity || candidate.teamId === entity.teamId) continue;
                  const deltaX = candidate.body.position.x - entity.body.position.x;
                  const deltaY = candidate.body.position.y - entity.body.position.y;
                  const distance = deltaX * deltaX + deltaY * deltaY;
                  if (distance < best || (distance === best && candidate.runtimeId < (nearest?.runtimeId ?? ""))) {
                        nearest = candidate; best = distance;
                  }
            }
            return nearest;
      }
      beforeStep(): void {
            const { entity } = this.context;
            if (entity.resources.isHeld("locomotion")) return;
            const target = this.facing.mode === "always" ? this.nearestEnemy() : null;
            entity.facing = target ? target.body.position.x < entity.body.position.x ? "left" : "right" : entity.config.defaultFacing;
      }
}
