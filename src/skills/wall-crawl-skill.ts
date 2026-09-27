import * as Matter from "matter-js";
import type { Fighter } from "../entities/fighter";
import {
      executeWallCrawlAction,
      getWallCrawlAngle,
      getWallCrawlFacing,
      startWallCrawl,
      type ArenaBounds,
      type ArenaWall,
      type WallCrawlState,
} from "../abilities/actions/wall-crawl-action";
import type { WallCrawlSkillOptions } from "./types";

/**
 * Reusable wall-crawling skill.
 * Manages body attachment to arena boundaries, movement along walls,
 * duration timer, and completion callbacks.
 */
export class WallCrawlSkill {
      private _isActive = false;
      private state: WallCrawlState | null = null;
      private bounds: ArenaBounds | null = null;
      private elapsedMs = 0;
      private options: WallCrawlSkillOptions | null = null;
      private fighter: Fighter | null = null;

      get isActive(): boolean {
            return this._isActive;
      }

      get currentWall(): ArenaWall | null {
            return this.state?.wall ?? null;
      }

      getAngle(): number | null {
            if (!this._isActive || !this.state) return null;
            return getWallCrawlAngle(this.state.wall);
      }

      start(
            fighter: Fighter,
            target: Fighter,
            wall: ArenaWall,
            bounds: ArenaBounds,
            options: WallCrawlSkillOptions,
      ): void {
            this.fighter = fighter;
            this.bounds = bounds;
            this.options = options;
            this.state = startWallCrawl(fighter, target, wall);
            fighter.facing = getWallCrawlFacing(
                  this.state.wall,
                  this.state.direction,
                  fighter.config.defaultFacing,
            );
            Matter.Body.setAngle(fighter.body, 0);
            this.elapsedMs = 0;
            this._isActive = true;
      }

      update(deltaMs: number): void {
            if (!this._isActive || !this.fighter || !this.state || !this.bounds || !this.options) {
                  return;
            }

            this.elapsedMs += deltaMs;
            const progress = Math.min(1, this.elapsedMs / this.options.durationMs);
            this.options.onTick?.(this.elapsedMs, progress);

            executeWallCrawlAction(
                  {
                        type: "wall-crawl",
                        durationMs: this.options.durationMs,
                        speedMultiplier: this.options.speedMultiplier,
                  },
                  this.fighter,
                  this.state,
                  this.bounds,
            );

            if (this.elapsedMs >= this.options.durationMs) {
                  const onComplete = this.options.onComplete;
                  this.stop();
                  onComplete?.();
            }
      }

      stop(): void {
            if (!this._isActive) return;
            this._isActive = false;
            if (this.fighter) {
                  Matter.Body.setVelocity(this.fighter.body, { x: 0, y: 0 });
            }
            this.state = null;
            this.bounds = null;
            this.options = null;
            this.elapsedMs = 0;
      }
}
