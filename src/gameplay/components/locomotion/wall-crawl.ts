import { Body } from "matter-js";
import type { ArenaWall, CancellationReason, Vector2 } from "../../../engine/contracts";
import type { EntityComponent, ComponentContext } from "../../../engine/component";
import { during, type ScriptOperation, type ScriptScope } from "../../../engine/scripting";
import type { CrawlSettings } from "../../../config/component-settings";
import { WALL_PROFILES } from "../../../engine/spatial/walls";
import { FloatingMovement } from "./movement";

export interface CrawlTargetOptions {
      /** Target position or entity to crawl toward along the wall. */
      toward?: { body: { position: Vector2 } } | Vector2;
      /** Explicit crawl direction (-1 | 1) along the wall axis. Overrides toward if provided. */
      direction?: -1 | 1;
}

/** Equipped once; each start creates an independent, inert use of wall movement. */
export class WallCrawler implements EntityComponent {
      constructor(private readonly context: ComponentContext, private readonly settings: CrawlSettings) {}
      attach(): void {}

      start(wall: ArenaWall, options?: CrawlTargetOptions): ScriptOperation {
            return new CrawlOperation(this.context, this.settings, wall, options);
      }
}

class CrawlOperation implements ScriptOperation {
      private timer: ScriptOperation | null = null;
      private started = false;
      private conflict = false;
      private direction: -1 | 1 = 1;
      private releasePose: (() => void) | null = null;
      private activeFrame = -1;

      constructor(
            private readonly context: ComponentContext,
            private readonly settings: CrawlSettings,
            private readonly wall: ArenaWall,
            private readonly options?: CrawlTargetOptions,
      ) {}

      get isComplete(): boolean { return this.timer?.isComplete ?? false; }
      get nextBoundaryMs(): number { return this.timer?.nextBoundaryMs ?? this.settings.durationMs; }
      get rejectionReason(): "resource-conflict" | "rejected" {
            return this.conflict ? "resource-conflict" : "rejected";
      }

      start(scope: ScriptScope): boolean {
            if (this.started || scope.isClosed) return false;
            this.started = true;

            const { entity, simulation } = this.context;
            if (!entity.isAlive) return false;

            const releaseMovement = entity.resources.acquireExclusive("locomotion");
            if (!releaseMovement) {
                  this.conflict = true;
                  return false;
            }
            scope.use(releaseMovement);

            const releaseUpright = entity.resources.acquireExclusive("upright");
            if (releaseUpright) scope.use(releaseUpright);

            scope.use(entity.resources.acquireContactPolicy({ defaultBounce: false, allowImpactDamage: false }));

            const profile = WALL_PROFILES[this.wall];
            this.direction = this.resolveDirection(profile);

            scope.use(entity.presentation.acquireOrientation("sprite", { angle: profile.surfaceAngle }));
            scope.add(() => { this.releasePose?.(); this.releasePose = null; });
            scope.add(() => Body.setVelocity(entity.body, { x: 0, y: 0 }));

            Body.setAngle(entity.body, 0);

            const extent = this.getHitboxExtent();
            const baseSpeed = entity.components.get<FloatingMovement>("movement")?.baseSpeed ?? entity.config.speed;
            const crawlSpeed = baseSpeed * this.settings.speedMultiplier;

            this.timer = during(this.settings.durationMs, (_deltaMs, elapsedMs) => {
                  this.stepMotion(profile, extent, crawlSpeed);
                  this.stepAnimation(elapsedMs);
            });

            // Initial step on admission
            this.stepMotion(profile, extent, crawlSpeed);
            this.stepAnimation(0);

            return this.timer.start(scope);
      }

      advance(deltaMs: number): number {
            return this.timer ? this.timer.advance(deltaMs) : 0;
      }

      cancel(reason: CancellationReason): void {
            this.started = true;
            this.timer?.cancel(reason);
      }

      private resolveDirection(profile: typeof WALL_PROFILES[ArenaWall]): -1 | 1 {
            if (this.options?.direction !== undefined) {
                  return this.options.direction;
            }

            const entity = this.context.entity;
            const toward = this.options?.toward;
            if (toward) {
                  const targetPos = "body" in toward ? toward.body.position : toward;
                  const delta = profile.getCrawlDelta(targetPos, entity.body.position);
                  if (delta !== 0) return delta < 0 ? -1 : 1;
            }

            const vel = profile.getVelocityComponent(entity.body.velocity);
            return vel < 0 ? -1 : 1;
      }

      private stepMotion(
            profile: typeof WALL_PROFILES[ArenaWall],
            extent: Vector2,
            speed: number,
      ): void {
            const { entity, simulation } = this.context;
            const span = profile.getCrawlSpan(simulation.arena, extent);
            const coord = profile.getCrawlCoordinate(entity.body.position);

            if (coord <= span.min && this.direction < 0) this.direction = 1;
            if (coord >= span.max && this.direction > 0) this.direction = -1;

            Body.setPosition(entity.body, profile.clampPosition(simulation.arena, extent, entity.body.position));
            Body.setVelocity(entity.body, profile.toVelocity(speed, this.direction));
            Body.setAngularVelocity(entity.body, 0);

            const flipped = profile.shouldFlipFacing(this.direction);
            const defaultFacing = entity.config.defaultFacing;
            entity.facing = flipped ? (defaultFacing === "right" ? "left" : "right") : defaultFacing;
      }

      private stepAnimation(elapsedMs: number): void {
            const frame = Math.floor(elapsedMs / this.settings.poseIntervalMs) % this.settings.poses.length;
            if (frame === this.activeFrame) return;

            this.releasePose?.();
            this.activeFrame = frame;
            this.releasePose = this.context.entity.presentation.acquirePose(this.settings.poses[frame]);
      }

      private getHitboxExtent(): Vector2 {
            const hitbox = this.context.entity.config.hitbox;
            return hitbox.type === "box"
                  ? { x: hitbox.width / 2, y: hitbox.height / 2 }
                  : { x: hitbox.radius, y: hitbox.radius };
      }
}
