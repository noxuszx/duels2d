import type { AimSolution } from "../skills/aim-skill";
import type { Fighter } from "../entities/fighter";
import type { CancellationReason } from "../gameplay/action-scope";
import { FighterRuntime } from "../gameplay/fighter-runtime";
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
      readonly runtime: FighterRuntime;
      private runtimeDisposed = false;

      constructor(
            protected readonly fighter: Fighter,
            protected readonly context: FighterBehaviorContext,
      ) {
            this.runtime = new FighterRuntime(fighter, context);
      }

      /** Shared outer tick: components run before optional character decisions. */
      tick(deltaMs: number): void {
            if (this.runtimeDisposed) return;
            this.runtime.update(deltaMs);
            if (this.runtimeDisposed) return;
            this.onUpdate(deltaMs);
      }

      /** Character-specific decisions; standard mechanics belong to registered components. */
      onUpdate(_deltaMs: number): void {}

      /**
       * Called when the fighter makes contact with an arena wall.
       * Independently controls whether normal bounce and impact damage apply.
       */
      onWallCollision(wall: ArenaWall, bounds: ArenaBounds, _wasDashing = false): WallCollisionResponse {
            void wall;
            void bounds;
            return DEFAULT_WALL_COLLISION_RESPONSE;
      }

      handleWallCollision(wall: ArenaWall, bounds: ArenaBounds): WallCollisionResponse {
            if (this.runtimeDisposed) return DEFAULT_WALL_COLLISION_RESPONSE;
            const wasDashing = this.runtime.isDashing;
            this.runtime.handleWallCollision(wall);
            if (this.runtimeDisposed) return DEFAULT_WALL_COLLISION_RESPONSE;
            return this.onWallCollision(wall, bounds, wasDashing);
      }

      /** Called when this fighter collides with another fighter. */
      onFighterCollision(target: Fighter): void {
            void target;
      }

      handleFighterCollision(target: Fighter): void {
            if (this.runtimeDisposed) return;
            this.runtime.handleFighterCollision(target);
            if (this.runtimeDisposed) return;
            this.onFighterCollision(target);
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

      /** Scripted consumers explicitly request transformation; legacy consumers retain automatic triggers. */
      usesScriptedTransformation(): boolean { return false; }

      /** Independently aimed attachment; body presentation remains unchanged. */
      getWeaponAim(): AimSolution | null { return null; }

      /** null lets legacy behaviors use ability-state detection during migration. */
      isDashing(): boolean | null {
            return this.runtime.hasComponents ? this.runtime.isDashing : null;
      }

      /** Called before removal; release owned operations and subscriptions. */
      dispose(): void { this.reset(); }

      interrupt(_reason: CancellationReason): void { this.reset(); }

      /** Resets any active skills or temporary state when fighter dies or match restarts. */
      reset(): void {}

      handleInterrupt(reason: CancellationReason): void {
            if (this.runtimeDisposed) return;
            this.runtime.cancel(reason);
            this.interrupt(reason);
      }

      handleReset(): void {
            if (this.runtimeDisposed) return;
            this.runtime.reset();
            this.reset();
      }

      handleDispose(): void {
            if (this.runtimeDisposed) return;
            this.runtimeDisposed = true;
            this.runtime.dispose();
            this.dispose();
      }
}
