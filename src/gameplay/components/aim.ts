import type { EntityComponent } from "../../engine/component";
import type { Entity } from "../../engine/entity";
import type { ScriptOperation } from "../../engine/scripting/operation";
import { entityPose } from "../../presentation/view";
import type { AimSkillOptions } from "../../types/fighter";
import type { ComponentContext } from "../../engine/component";
import { AimGeometry, type AimSolution } from "./aim-geometry";

/** Owner-bound aiming capability. Behaviors explicitly hold and release tracking. */
export class SpriteAim implements EntityComponent {
      private readonly geometry = new AimGeometry();
      private tracking: { token: object; target: Entity } | null = null;
      private releaseRotation: (() => void) | null = null;

      constructor(private readonly context: ComponentContext, private readonly options: AimSkillOptions) { }
      attach(): void { }

      /** Resolve again at firing time, including a pose changed during this same step. */
      get current(): AimSolution | null {
            this.refresh();
            return this.geometry.current;
      }

      /** Use the release function in the behavior's finally block to end an aim interval. */
      track(target: Entity): () => void {
            const token = {};
            this.tracking = { token, target };
            this.refresh();
            return () => {
                  if (this.tracking?.token === token) this.stop();
            };
      }

      *follow(target: Entity, script: () => Generator<ScriptOperation, void, unknown>): Generator<ScriptOperation, void, unknown> {
            const release = this.track(target);
            try { yield* script(); }
            finally { release(); }
      }

      beforeStep(): void { this.refresh(); }
      afterStep(): void { this.refresh(); }
      cancel(): void { this.stop(); }
      detach(): void { this.stop(); }

      private refresh(): void {
            const { entity, simulation } = this.context;
            const target = this.tracking?.target;
            this.releaseRotation?.();
            this.releaseRotation = null;
            if (!target || !entity.isAlive || !simulation.isCombatActive ||
                  !simulation.entities.isLive(entity) || !simulation.entities.isLive(target) ||
                  !target.tags.has("targetable") || target.teamId === entity.teamId) {
                  this.geometry.stop();
                  return;
            }
            const dx = target.body.position.x - entity.body.position.x;
            if (dx) entity.facing = dx < 0 ? "left" : "right";
            const pose = entityPose(entity);
            const offset = pose.imageOffset ?? { x: 0, y: 0 };
            this.geometry.update({
                  center: {
                        x: entity.body.position.x - entity.config.hitboxOffset.x + offset.x,
                        y: entity.body.position.y - entity.config.hitboxOffset.y + offset.y
                  },
                  facing: entity.facing, defaultFacing: entity.config.defaultFacing,
            }, target.body.position, pose.aim ?? this.options);
            const solution = this.geometry.current;
            if (solution) this.releaseRotation = entity.presentation.acquireRotation(solution.angle, solution.localPivot);
      }

      private stop(): void {
            this.tracking = null;
            this.geometry.stop();
            this.releaseRotation?.();
            this.releaseRotation = null;
      }
}
