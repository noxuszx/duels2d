import { Bodies, Body, Query } from "matter-js";
import type { MeleeSettings } from "../../config/component-settings";
import type { EntityComponent } from "../../engine/component";
import type { CancellationReason } from "../../engine/contracts";
import type { Entity } from "../../engine/entity";
import type { ScriptOperation } from "../../engine/scripting/operation";
import type { ScriptScope } from "../../engine/scripting/scope";
import type { ComponentContext } from "../../engine/component";
import { actionSound } from "./action-sound";

/** Authored melee geometry; each admitted operation owns its own hit history. */
export class MeleeAttack implements EntityComponent {
      constructor(private readonly context: ComponentContext, private readonly settings: MeleeSettings) { }
      attach(): void { }

      inRange(target: Entity, padding = 0): boolean {
            if (!isEnemy(this.context, target) || !Number.isFinite(padding) || padding < 0) return false;
            const hitbox = attackBody(this.context.entity, this.settings, padding);
            return hitbox !== null && Query.collides(hitbox, [target.body]).length > 0;
      }

      start(target: Entity, durationMs: number): ScriptOperation {
            return new MeleeOperation(this.context, this.settings, target, durationMs);
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
      const angle = entity.presentation.rotation ?? entity.body.angle;
      const x = box.offset.x * (entity.facing === "left" ? -1 : 1);
      const y = box.offset.y;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return Bodies.rectangle(
            entity.body.position.x - entity.config.hitboxOffset.x + cos * x - sin * y,
            entity.body.position.y - entity.config.hitboxOffset.y + sin * x + cos * y,
            box.width + padding * 2, box.height + padding * 2,
            { angle, isSensor: true },
      );
}

class MeleeOperation implements ScriptOperation {
      private started = false;
      private active = false;
      private complete = false;
      private elapsedMs = 0;
      private baseAngle = 0;
      private releaseRotation: (() => void) | null = null;
      private readonly hitTargets = new Set<string>();
      readonly rejectionReason = "rejected" as const;
      readonly endReason = "complete" as const;

      constructor(private readonly context: ComponentContext, private readonly settings: MeleeSettings,
            private readonly target: Entity, private readonly durationMs: number) { }

      get isComplete(): boolean { return this.complete; }

      start(scope: ScriptScope): boolean {
            if (this.started) return false;
            this.started = true;
            const { entity, simulation } = this.context;
            if (scope.isClosed || !simulation.isCombatActive || !isEnemy(this.context, this.target) ||
                  !Number.isFinite(this.durationMs) || this.durationMs <= 0 ||
                  !attackBody(entity, this.settings)) return false;
            if (this.settings.swing && (!Number.isFinite(this.settings.swing.startDegrees) ||
                  !Number.isFinite(this.settings.swing.endDegrees))) return false;
            this.baseAngle = entity.presentation.rotation ?? entity.body.angle;
            scope.add(() => { this.active = false; this.releaseRotation?.(); this.releaseRotation = null; });
            if (this.settings.pose) scope.add(entity.presentation.acquirePose(this.settings.pose));
            actionSound(entity, scope, this.settings.sound);
            this.active = true;
            this.updateRotation();
            this.hitOverlaps();
            return true;
      }

      advance(deltaMs: number): number {
            if (!this.active || !Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
            const consumed = Math.min(deltaMs, this.durationMs - this.elapsedMs);
            this.elapsedMs += consumed;
            this.updateRotation();
            this.hitOverlaps();
            if (this.durationMs - this.elapsedMs <= 1e-9) {
                  this.active = false;
                  this.complete = true;
            }
            return consumed;
      }

      cancel(_reason: CancellationReason): void {
            this.active = false;
            this.releaseRotation?.();
            this.releaseRotation = null;
            this.hitTargets.clear();
      }

      private updateRotation(): void {
            const swing = this.settings.swing;
            if (!swing) return;
            const degrees = swing.startDegrees + (swing.endDegrees - swing.startDegrees) *
                  this.elapsedMs / this.durationMs;
            const mirror = this.context.entity.facing === "left" ? -1 : 1;
            this.releaseRotation?.();
            this.releaseRotation = this.context.entity.presentation.acquireRotation(
                  this.baseAngle + mirror * degrees * Math.PI / 180);
      }

      private hitOverlaps(): void {
            const { entity, simulation } = this.context;
            if (!this.active || !simulation.isCombatActive || !simulation.entities.isLive(entity)) return;
            const hitbox = attackBody(entity, this.settings);
            if (!hitbox) return;
            for (const target of simulation.entities.all()) {
                  if (!isEnemy(this.context, target) || this.hitTargets.has(target.runtimeId) ||
                        !Query.collides(hitbox, [target.body]).length) continue;
                  this.hitTargets.add(target.runtimeId);
                  const hit = simulation.hit(entity, target, this.settings, { independentCooldown: true });
                  if (hit.connected && this.settings.hitSound)
                        entity.presentation.emit("sound", { cue: this.settings.hitSound });
            }
      }
}
