import type * as Matter from "matter-js";
import type { Fighter } from "../entities/fighter";
import type { ArenaWall, DashSkillOptions, DashEndResult } from "./types";
import type { CancellationReason, GameplayOperation } from "../gameplay/action-scope";

/**
 * Reusable directional dash skill.
 * Manages charge forces, termination conditions (walls, fighters, timeout),
 * and collision callbacks.
 */
export class DashSkill implements GameplayOperation {
      private _isActive = false;
      private fighter: Fighter | null = null;
      private direction: Matter.Vector | null = null;
      private options: DashSkillOptions | null = null;
      private hitFighters = new Set<Fighter>();
      private elapsedMs = 0;

      get isActive(): boolean {
            return this._isActive;
      }

      get isDashing(): boolean { return this.isActive; }

      startToward(fighter: Fighter, target: Fighter, options: DashSkillOptions): boolean {
            if (fighter === target || fighter.isDead || target.isDead) return false;
            const direction = {
                  x: target.body.position.x - fighter.body.position.x,
                  y: target.body.position.y - fighter.body.position.y,
            };
            if (direction.x === 0 && direction.y === 0)
                  direction.x = fighter.facing === "left" ? -1 : 1;
            const started = this.start(fighter, direction, options);
            if (started && direction.x !== 0) fighter.facing = direction.x < 0 ? "left" : "right";
            return started;
      }

      get currentDirection(): Matter.Vector | null {
            return this.direction;
      }

      start(
            fighter: Fighter,
            targetDirection: Matter.Vector,
            options: DashSkillOptions,
      ): boolean {
            if (this._isActive || fighter.isDead ||
                  !Number.isFinite(targetDirection.x) || !Number.isFinite(targetDirection.y) ||
                  Math.hypot(targetDirection.x, targetDirection.y) === 0 ||
                  !Number.isFinite(options.speedMultiplier) || options.speedMultiplier <= 0 ||
                  !Number.isFinite(options.accelerationForce) || options.accelerationForce < 0 ||
                  (options.maxDurationMs !== undefined &&
                        (!Number.isFinite(options.maxDurationMs) || options.maxDurationMs < 0))) return false;
            this.fighter = fighter;
            this.direction = { ...targetDirection };
            this.options = { ...options, stopOn: options.stopOn ? [...options.stopOn] : undefined };
            // Voluntary dash control replaces attribution from earlier knockback.
            fighter.knockbackOwnerId = null;
            this.hitFighters.clear();
            this.elapsedMs = 0;
            this._isActive = true;
            return true;
      }

      update(deltaMs: number): void {
            if (!this._isActive || !this.fighter || !this.direction || !this.options) {
                  return;
            }
            if (this.fighter.isDead) return this.cancel("death");
            if (deltaMs <= 0) return;

            this.elapsedMs += deltaMs;
            if (this.options.maxDurationMs !== undefined && this.elapsedMs >= this.options.maxDurationMs) {
                  this.finish({ reason: "timeout" });
                  return;
            }

            const length = Math.hypot(this.direction.x, this.direction.y);
            const unit = { x: this.direction.x / length, y: this.direction.y / length };
            const forwardSpeed = this.fighter.body.velocity.x * unit.x + this.fighter.body.velocity.y * unit.y;
            const targetSpeed = this.fighter.baseSpeed * Math.max(1, this.options.speedMultiplier);
            if (targetSpeed <= 0 || forwardSpeed >= targetSpeed) return;
            const acceleration = this.options.accelerationForce * Math.max(0, 1 - forwardSpeed / targetSpeed);
            this.fighter.movement.applyForce({ x: unit.x * acceleration, y: unit.y * acceleration });
      }

      handleFighterCollision(target: Fighter): boolean {
            if (this.fighter?.isDead) { this.cancel("death"); return false; }
            if (!this._isActive || !this.options || target === this.fighter || target.isDead || this.hitFighters.has(target)) {
                  return false;
            }

            this.hitFighters.add(target);
            this.options.onHitEnemy?.(target);
            if (!this._isActive || !this.options) return false;

            const stopConditions = this.options.stopOn ?? ["fighter-collision", "wall-collision"];
            if (stopConditions.includes("fighter-collision")) {
                  this.finish({ reason: "fighter-collision" });
                  return true;
            }
            return false;
      }

      handleWallCollision(wall: ArenaWall): boolean {
            if (this.fighter?.isDead) { this.cancel("death"); return false; }
            if (!this._isActive || !this.options) {
                  return false;
            }

            this.options.onHitWall?.(wall);
            if (!this._isActive || !this.options) return false;

            const stopConditions = this.options.stopOn ?? ["fighter-collision", "wall-collision"];
            if (stopConditions.includes("wall-collision")) {
                  this.finish({ reason: "wall-collision" });
                  return true;
            }
            return false;
      }

      stop(): void {
            this.cancel("interrupted");
      }

      cancel(reason: CancellationReason = "interrupted"): void {
            this.finish({ reason: "cancelled", cancellation: reason });
      }

      private finish(result: DashEndResult): void {
            if (!this._isActive) return;
            this._isActive = false;
            const onComplete = this.options?.onComplete;
            const onEnd = this.options?.onEnd;
            this.fighter = null;
            this.direction = null;
            this.options = null;
            this.hitFighters.clear();
            this.elapsedMs = 0;
            onEnd?.(result);
            if (result.reason !== "cancelled") onComplete?.(result.reason);
      }
}
