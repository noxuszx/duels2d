import type { EntityComponent } from "../../engine/component";
import type { Entity } from "../../engine/entity";
import { entityPose } from "../../presentation/view";
import { rootTransform } from "../../presentation/transform";
import type { PresentationLease, VisualOrientation } from "../../presentation/state";
import type { AimSkillOptions } from "../../types/fighter";
import type { ComponentContext } from "../../engine/component";
import { AimGeometry, type AimSolution } from "./aim-geometry";

/** Owner-bound aiming capability. Behaviors explicitly hold and release tracking. */
export class SpriteAim implements EntityComponent {
      private readonly geometry = new AimGeometry();
      private tracking: { token: object; target: Entity } | null = null;
      private orientation: PresentationLease<VisualOrientation> | null = null;

      constructor(private readonly context: ComponentContext, private readonly options: AimSkillOptions,
            private readonly visualTarget: "sprite" | "weapon" = "sprite") { }
      attach(): void { }

      /** Resolve again at firing time, including a pose changed during this same step. */
      get current(): AimSolution | null {
            this.refresh();
            return this.geometry.current;
      }

      /** Use the release function in the behavior's finally block to end an aim interval. */
      track(target: Entity): (() => void) | null {
            const token = {};
            this.tracking = { token, target };
            this.refresh();
            if (!this.geometry.isActive) {
                  this.tracking = null;
                  return null;
            }
            return () => {
                  if (this.tracking?.token === token) this.stop();
            };
      }

      beforeStep(): void { this.refresh(); }
      afterStep(): void { this.refresh(); }
      cancel(): void { this.stop(); }
      detach(): void { this.stop(); }

      private refresh(): void {
            const { entity, simulation } = this.context;
            const target = this.tracking?.target;
            if (!target || !entity.isAlive || !simulation.isCombatActive ||
                  !simulation.entities.isLive(entity) || !simulation.entities.isLive(target) ||
                  !target.tags.has("targetable") || target.teamId === entity.teamId) {
                  this.geometry.stop();
                  this.orientation?.release();
                  this.orientation = null;
                  return;
            }
            const dx = target.body.position.x - entity.body.position.x;
            if (dx) entity.facing = dx < 0 ? "left" : "right";
            const pose = entityPose(entity);
            const weaponOffset = entity.config.weaponOffset ?? { x: 0, y: 0 };
            const offset = this.visualTarget === "weapon" ? weaponOffset : pose.imageOffset ?? { x: 0, y: 0 };
            const mirror = entity.facing !== entity.config.defaultFacing ? -1 : 1;
            const rootOffset = entity.presentation.offset;
            this.geometry.update({
                  root: rootTransform({
                        x: entity.body.position.x - entity.config.hitboxOffset.x + rootOffset.x,
                        y: entity.body.position.y - entity.config.hitboxOffset.y + rootOffset.y,
                  }, entity.body.angle + entity.presentation.rotation),
                  offset: { x: this.visualTarget === "weapon" ? mirror * offset.x : offset.x, y: offset.y },
                  facing: entity.facing, defaultFacing: entity.config.defaultFacing,
            }, target.body.position, this.visualTarget === "weapon" ? this.options : pose.aim ?? this.options);
            const solution = this.geometry.current;
            if (solution) {
                  const orientation = { angle: solution.angle, pivot: solution.localPivot };
                  if (this.orientation) this.orientation.set(orientation);
                  else this.orientation = entity.presentation.acquireOrientation(this.visualTarget, orientation);
            } else {
                  this.orientation?.release();
                  this.orientation = null;
            }
      }

      private stop(): void {
            this.tracking = null;
            this.geometry.stop();
            this.orientation?.release();
            this.orientation = null;
      }
}
