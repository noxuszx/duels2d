import type * as Matter from "matter-js";
import type { Fighter } from "../entities/fighter";
import type { ArenaWall, DashSkillOptions } from "./types";

/**
 * Reusable directional dash skill.
 * Manages charge forces, termination conditions (walls, fighters, timeout),
 * and collision callbacks.
 */
export class DashSkill {
      private _isActive = false;
      private fighter: Fighter | null = null;
      private direction: Matter.Vector | null = null;
      private options: DashSkillOptions | null = null;
      private hitFighters = new Set<Fighter>();
      private elapsedMs = 0;

      get isActive(): boolean {
            return this._isActive;
      }

      get currentDirection(): Matter.Vector | null {
            return this.direction;
      }

      start(
            fighter: Fighter,
            targetDirection: Matter.Vector,
            options: DashSkillOptions,
      ): void {
            this.fighter = fighter;
            this.direction = targetDirection;
            this.options = options;
            this.hitFighters.clear();
            this.elapsedMs = 0;
            this._isActive = true;
      }

      update(deltaMs: number): void {
            if (!this._isActive || !this.fighter || !this.direction || !this.options) {
                  return;
            }

            this.elapsedMs += deltaMs;
            if (this.options.maxDurationMs && this.elapsedMs >= this.options.maxDurationMs) {
                  this.stop();
                  return;
            }

            this.fighter.applyChargeForce(
                  this.direction,
                  this.options.accelerationForce,
                  this.options.speedMultiplier,
            );
      }

      handleFighterCollision(target: Fighter): boolean {
            if (!this._isActive || !this.options || this.hitFighters.has(target)) {
                  return false;
            }

            this.hitFighters.add(target);
            this.options.onHitEnemy?.(target);

            const stopConditions = this.options.stopOn ?? ["fighter-collision", "wall-collision"];
            if (stopConditions.includes("fighter-collision")) {
                  this.stop();
                  return true;
            }
            return false;
      }

      handleWallCollision(wall: ArenaWall): boolean {
            if (!this._isActive || !this.options) {
                  return false;
            }

            this.options.onHitWall?.(wall);

            const stopConditions = this.options.stopOn ?? ["fighter-collision", "wall-collision"];
            if (stopConditions.includes("wall-collision")) {
                  this.stop();
                  return true;
            }
            return false;
      }

      stop(): void {
            if (!this._isActive) return;
            this._isActive = false;
            const onComplete = this.options?.onComplete;
            this.fighter = null;
            this.direction = null;
            this.options = null;
            this.hitFighters.clear();
            this.elapsedMs = 0;
            onComplete?.();
      }
}
