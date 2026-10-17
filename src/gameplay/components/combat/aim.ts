import type { EntityComponent, ComponentContext } from "../../../engine/component";
import type { Entity } from "../../../engine/entity";
import type { AimSkillOptions, Facing, Vector2 } from "../../../types/fighter";
import { childTransform, inversePoint, rootTransform, transformDirection, transformPoint, type VisualTransform } from "../../../presentation/transform";
import { entityPose } from "../../../presentation/view";
import type { PresentationLease, VisualOrientation } from "../../../presentation/state";

export interface AimFrame {
      root: VisualTransform;
      /** Root-local sprite or weapon offset, including facing for weapons. */
      offset: Vector2;
      facing: Facing;
      defaultFacing: Facing;
}

export interface AimSolution {
      origin: Vector2;
      direction: Vector2;
      /** Child rotation relative to the visual root, after local mirroring. */
      angle: number;
      pivot: Vector2;
      localPivot: Vector2;
      flip: boolean;
}

/** Pure geometry solver for aiming from an offset muzzle toward a target position. */
export class AimGeometry {
      private solution: AimSolution | null = null;

      get current(): AimSolution | null { return this.solution; }
      get isActive(): boolean { return this.solution !== null; }

      update(frame: AimFrame, target: Vector2 | null, options: AimSkillOptions): void {
            if (!target) { this.stop(); return; }
            const flip = frame.facing !== frame.defaultFacing;
            const mirror = flip ? -1 : 1;
            const localPivot = options.pivot ?? { x: 0, y: 0 };
            const pivot = {
                  x: frame.offset.x + mirror * localPivot.x,
                  y: frame.offset.y + localPivot.y,
            };

            const offset = {
                  x: mirror * (options.muzzle.x - localPivot.x),
                  y: options.muzzle.y - localPivot.y,
            };

            const forward = (options.forwardDegrees ??
                  (frame.defaultFacing === "left" ? 180 : 0)) * Math.PI / 180;

            const localDirection = { x: mirror * Math.cos(forward), y: Math.sin(forward) };
            const localTarget = inversePoint(frame.root, target);
            const dx = localTarget.x - pivot.x;
            const dy = localTarget.y - pivot.y;
            const distance = Math.hypot(dx, dy);

            // Account for a muzzle displaced sideways from the pivot.
            const lateral = localDirection.x * offset.y - localDirection.y * offset.x;
            const forwardOffset = localDirection.x * offset.x + localDirection.y * offset.y;
            if (distance <= Math.abs(lateral) + 1e-8 ||
                  Math.sqrt(Math.max(0, distance * distance - lateral * lateral)) <= forwardOffset) {
                  this.stop();
                  return;
            }
            const angle = Math.atan2(dy, dx) - Math.asin(lateral / distance) -
                  Math.atan2(localDirection.y, localDirection.x);
            const transform = childTransform(frame.root, frame.offset, mirror, { angle, pivot: localPivot });
            this.solution = {
                  origin: transformPoint(transform, options.muzzle),
                  direction: transformDirection(transform, { x: Math.cos(forward), y: Math.sin(forward) }),
                  angle, pivot: transformPoint(frame.root, pivot), localPivot: { ...localPivot }, flip,
            };
      }

      stop(): void { this.solution = null; }
}

export type AimTarget = Entity | { body: { position: Vector2 } } | Vector2;

/** Owner-bound aiming capability. Behaviors explicitly hold and release tracking. */
export class SpriteAim implements EntityComponent {
      private readonly geometry = new AimGeometry();
      private tracking: { token: object; target: AimTarget } | null = null;
      private orientation: PresentationLease<VisualOrientation> | null = null;

      constructor(
            private readonly context: ComponentContext,
            private readonly options: AimSkillOptions,
            private readonly visualTarget: "sprite" | "weapon" = "sprite",
      ) { }

      attach(): void { }

      /** Resolve again at firing time, including a pose changed during this same step. */
      get current(): AimSolution | null {
            this.refresh();
            return this.geometry.current;
      }

      /** Track a target entity or position until released. */
      track(target: AimTarget): (() => void) | null {
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

      private resolveTargetPosition(target: AimTarget): Vector2 | null {
            const { simulation } = this.context;
            if ("body" in target) {
                  // Entity target: verify still in simulation and alive if entity
                  const entity = target as Entity;
                  if ("isAlive" in entity && !entity.isAlive) return null;
                  if (!simulation.entities.isLive(entity)) return null;
                  return entity.body.position;
            }
            return Number.isFinite(target.x) && Number.isFinite(target.y) ? target : null;
      }

      private refresh(): void {
            const { entity, simulation } = this.context;
            const target = this.tracking?.target;
            const targetPos = target && entity.isAlive && simulation.isCombatActive && simulation.entities.isLive(entity)
                  ? this.resolveTargetPosition(target)
                  : null;

            if (!targetPos) {
                  this.geometry.stop();
                  this.orientation?.release();
                  this.orientation = null;
                  return;
            }

            const dx = targetPos.x - entity.body.position.x;
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
            }, targetPos, this.visualTarget === "weapon" ? this.options : pose.aim ?? this.options);

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
