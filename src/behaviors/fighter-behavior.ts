import type { Fighter } from "../entities/fighter";
import type { ArenaBounds, ArenaWall, FighterBehaviorContext } from "./types";

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
       * Return `true` if the behavior handled the collision (e.g. wall crawl),
       * preventing default physics bounce processing.
       */
      onWallCollision(wall: ArenaWall, bounds: ArenaBounds): boolean {
            void wall;
            void bounds;
            return false;
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

      /** Resets any active skills or temporary state when fighter dies or match restarts. */
      reset(): void {}
}
