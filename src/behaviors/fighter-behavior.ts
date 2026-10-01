import type { Fighter } from "../entities/fighter";
import type { CancellationReason } from "../gameplay/action-scope";
import {
      DEFAULT_WALL_COLLISION_RESPONSE,
      type ArenaBounds,
      type ArenaWall,
      type FighterBehaviorContext,
      type WallCollisionResponse,
} from "./types";

/**
 * Base class for all fighter behaviors.
 * Subclasses orchestrate modular skills, handle unique combos,
 * and respond to match events.
 */
export abstract class FighterBehavior {
      constructor(
            protected readonly fighter: Fighter,
            protected readonly context: FighterBehaviorContext,
      ) {}

      /** Called every simulation tick. */
      abstract onUpdate(deltaMs: number): void;

      /**
       * Called when the fighter makes contact with an arena wall.
       * Independently controls whether normal bounce and impact damage apply.
       */
      onWallCollision(wall: ArenaWall, bounds: ArenaBounds): WallCollisionResponse {
            void wall;
            void bounds;
            return DEFAULT_WALL_COLLISION_RESPONSE;
      }

      /** Called when this fighter collides with another fighter. */
      onFighterCollision(target: Fighter): void {
            void target;
      }

      /** Called when this fighter takes damage from an attack or collision. */
      onDamaged(amount: number, source: Fighter | null): void {
            void amount;
            void source;
      }

      /** Called after the fighter enters its configured transformed state. */
      onTransform(): void {}

      /** Whether the fighter is currently crawling on a wall (for rendering / physics assist). */
      isWallCrawling(): boolean {
            return false;
      }

      /** Custom rotation angle in radians if the behavior is overriding physics rotation. */
      getWallCrawlAngle(): number | null {
            return null;
      }

      /** Custom held-weapon angle in radians, if this behavior owns a swing. */
      getWeaponSwingAngle(): number | null {
            return null;
      }

      /** null lets legacy behaviors use ability-state detection during migration. */
      isDashing(): boolean | null { return null; }

      /** Called before removal; release owned operations and subscriptions. */
      dispose(): void { this.reset(); }

      interrupt(_reason: CancellationReason): void { this.reset(); }

      /** Resets any active skills or temporary state when fighter dies or match restarts. */
      reset(): void {}
}
