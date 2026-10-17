import { Bodies, Body, Query } from "matter-js";
import type { MeleeSettings } from "../../../config/component-settings";
import type { EntityComponent } from "../../../engine/component";
import type { Entity } from "../../../engine/entity";
import type { ScriptOperation } from "../../../engine/scripting";
import { during } from "../../../engine/scripting";
import type { ComponentContext } from "../../../engine/component";
import { childTransform, rootTransform, transformPoint } from "../../../presentation/transform";
import type { PresentationLease, VisualOrientation } from "../../../presentation/state";

export interface MeleeStartOptions {
      durationMs: number;
      target?: Entity;
}

/** Authored melee geometry; each admitted operation owns its own hit history. */
export class MeleeAttack implements EntityComponent {
      constructor(private readonly context: ComponentContext, private readonly settings: MeleeSettings) { }
      attach(): void { }

      inRange(target: Entity, padding = 0): boolean {
            if (!isEnemy(this.context, target) || !Number.isFinite(padding) || padding < 0) return false;
            const hitbox = attackBody(this.context.entity, this.settings, padding);
            return hitbox !== null && Query.collides(hitbox, [target.body]).length > 0;
      }

      start(targetOrDuration: Entity | number | MeleeStartOptions, maybeDuration?: number): ScriptOperation {
            let durationMs: number;
            let target: Entity | undefined;

            if (typeof targetOrDuration === "number") {
                  durationMs = targetOrDuration;
            } else if ("durationMs" in targetOrDuration) {
                  durationMs = targetOrDuration.durationMs;
                  target = targetOrDuration.target;
            } else {
                  target = targetOrDuration;
                  durationMs = maybeDuration ?? 0;
            }

            return new MeleeOperation(this.context, this.settings, durationMs, target);
      }
}

function isEnemy(context: ComponentContext, target: Entity): boolean {
      const { entity, simulation } = context;
      return simulation.entities.isLive(entity) && simulation.entities.isLive(target) &&
            entity.teamId !== target.teamId && target.tags.has("targetable");
}

/** Studio offsets are relative to the fighter center and mirror with facing. */
function attackBody(entity: Entity, settings: MeleeSettings, padding = 0): Body | null {
      const box = settings.hitbox;
      if (!box || !Number.isFinite(box.width) || box.width <= 0 ||
            !Number.isFinite(box.height) || box.height <= 0 ||
            !Number.isFinite(box.offset.x) || !Number.isFinite(box.offset.y)) return null;
      const offset = entity.presentation.offset;
      const transform = childTransform(rootTransform({
            x: entity.body.position.x - entity.config.hitboxOffset.x + offset.x,
            y: entity.body.position.y - entity.config.hitboxOffset.y + offset.y,
      }, entity.body.angle + entity.presentation.rotation), { x: 0, y: 0 },
            entity.facing === "left" ? -1 : 1, entity.presentation.orientation("sprite") ?? { angle: 0 });

      const center = transformPoint(transform, box.offset);
      const angle = Math.atan2(transform.b, transform.a);
      return Bodies.rectangle(
            center.x, center.y,
            box.width + padding * 2, box.height + padding * 2,
            { angle, isSensor: true },
      );
}

class MeleeOperation implements ScriptOperation {
      private baseAngle = 0;
      private orientation: PresentationLease<VisualOrientation> | null = null;
      private readonly hitTargets = new Set<string>();
      private delegate: ScriptOperation | null = null;

      constructor(
            private readonly context: ComponentContext,
            private readonly settings: MeleeSettings,
            private readonly durationMs: number,
            private readonly target?: Entity,
      ) { }

      get isComplete(): boolean { return this.delegate?.isComplete ?? false; }
      get nextBoundaryMs(): number { return this.delegate?.nextBoundaryMs ?? 0; }
      get rejectionReason() { return this.delegate?.rejectionReason ?? ("rejected" as const); }
      get endReason() { return this.delegate?.endReason ?? ("complete" as const); }

      start(scope: any): boolean {
            const { entity, simulation } = this.context;
            if (scope.isClosed || !simulation.isCombatActive || !simulation.entities.isLive(entity)) return false;
            if (this.target && !isEnemy(this.context, this.target)) return false;
            if (!Number.isFinite(this.durationMs) || this.durationMs <= 0) return false;
            if (!attackBody(entity, this.settings)) return false;
            if (this.settings.swing && (!Number.isFinite(this.settings.swing.startDegrees) ||
                  !Number.isFinite(this.settings.swing.endDegrees))) return false;

            this.baseAngle = entity.presentation.orientation("sprite")?.angle ?? 0;
            scope.add(() => {
                  this.orientation?.release();
                  this.orientation = null;
            });
            if (this.settings.pose) scope.add(entity.presentation.acquirePose(this.settings.pose));

            this.delegate = during(this.durationMs, progress => {
                  this.updateRotation(progress);
                  this.hitOverlaps();
            });

            const ok = this.delegate.start(scope);
            if (ok) {
                  this.updateRotation(0);
                  this.hitOverlaps();
            }
            return ok;
      }

      advance(deltaMs: number): number {
            return this.delegate?.advance(deltaMs) ?? 0;
      }

      cancel(reason: any): void {
            this.orientation?.release();
            this.orientation = null;
            this.hitTargets.clear();
            this.delegate?.cancel(reason);
      }

      private updateRotation(progress: number): void {
            const swing = this.settings.swing;
            if (!swing) return;
            const degrees = swing.startDegrees + (swing.endDegrees - swing.startDegrees) * progress;
            const mirror = this.context.entity.facing === "left" ? -1 : 1;
            const value = { angle: this.baseAngle + mirror * degrees * Math.PI / 180 };
            if (this.orientation) this.orientation.set(value);
            else this.orientation = this.context.entity.presentation.acquireOrientation("sprite", value);
      }

      private hitOverlaps(): void {
            const { entity, simulation } = this.context;
            if (!simulation.isCombatActive || !simulation.entities.isLive(entity)) return;
            const hitbox = attackBody(entity, this.settings);
            if (!hitbox) return;
            for (const candidate of simulation.entities.all()) {
                  if (!isEnemy(this.context, candidate) || this.hitTargets.has(candidate.runtimeId) ||
                        !Query.collides(hitbox, [candidate.body]).length) continue;
                  this.hitTargets.add(candidate.runtimeId);
                  simulation.hit(entity, candidate, this.settings, { independentCooldown: true });
            }
      }
}
