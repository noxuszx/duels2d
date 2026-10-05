import { Body } from "matter-js";
import type { Entity } from "../../engine/entity";
import type { ArenaWall, CancellationReason } from "../../engine/contracts";
import type { EntityComponent } from "../../engine/component";
import type { ScriptOperation } from "../../engine/scripting/operation";
import type { ScriptScope } from "../../engine/scripting/scope";
import type { CrawlSettings } from "../../config/component-settings";
import type { ComponentContext } from "../../engine/component";
import { FloatingMovement } from "./movement";
import { actionSound } from "./action-sound";

/** Equipped once; each start creates an independent, inert use of wall movement. */
export class WallCrawler implements EntityComponent {
      constructor(private readonly context: ComponentContext, private readonly settings: CrawlSettings) {}
      attach(): void {}
      start(wall: ArenaWall, options: { toward: Entity }): ScriptOperation {
            return new CrawlOperation(this.context, this.settings, wall, options.toward);
      }
}

class CrawlOperation implements ScriptOperation {
      private elapsedMs = 0;
      private active = false;
      private started = false;
      private complete = false;
      private direction: -1 | 1 = 1;
      private releasePose: (() => void) | null = null;
      private frame = -1;
      rejectionReason: "resource-conflict" | "rejected" = "rejected";
      constructor(private readonly context: ComponentContext, private readonly settings: CrawlSettings,
            private readonly wall: ArenaWall, private readonly target: Entity) {}
      get isComplete(): boolean { return this.complete; }
      get nextBoundaryMs(): number { return Math.max(0, this.settings.durationMs - this.elapsedMs); }
      start(scope: ScriptScope): boolean {
            if (this.started) return false;
            this.started = true;
            const { entity, simulation } = this.context;
            if (!entity.isAlive || !this.target.isAlive || entity.teamId === this.target.teamId ||
                  !simulation.entities.all().includes(this.target)) return false;
            const releaseMovement = entity.resources.acquireExclusive("locomotion");
            if (!releaseMovement) { this.rejectionReason = "resource-conflict"; return false; }
            scope.add(releaseMovement);
            const upright = entity.resources.acquireExclusive("upright");
            if (upright) scope.add(upright);
            scope.add(entity.resources.acquireContactPolicy({ defaultBounce: false, allowImpactDamage: false }));
            const vertical = this.wall === "left" || this.wall === "right";
            const delta = vertical ? this.target.body.position.y - entity.body.position.y
                  : this.target.body.position.x - entity.body.position.x;
            this.direction = (Math.sign(delta || (vertical ? entity.body.velocity.y : entity.body.velocity.x) || 1) < 0) ? -1 : 1;
            const angle = this.wall === "top" ? Math.PI : this.wall === "left" ? Math.PI / 2
                  : this.wall === "right" ? -Math.PI / 2 : 0;
            scope.use(entity.presentation.acquireOrientation("sprite", { angle }));
            scope.add(() => { this.releasePose?.(); this.releasePose = null; });
            actionSound(entity, scope, this.settings.sound);
            Body.setAngle(entity.body, 0);
            this.active = true;
            this.move();
            this.updatePose();
            return true;
      }
      advance(deltaMs: number): number {
            if (!this.active) return 0;
            const consumed = Math.min(deltaMs, this.settings.durationMs - this.elapsedMs);
            this.elapsedMs += consumed;
            this.move();
            this.updatePose();
            if (this.settings.durationMs - this.elapsedMs <= 1e-9) {
                  this.complete = true;
                  this.active = false;
                  Body.setVelocity(this.context.entity.body, { x: 0, y: 0 });
            }
            return consumed;
      }
      cancel(_reason: CancellationReason): void {
            this.started = true;
            if (this.active) Body.setVelocity(this.context.entity.body, { x: 0, y: 0 });
            this.active = false;
      }
      private updatePose(): void {
            const frame = Math.floor(this.elapsedMs / this.settings.poseIntervalMs) % this.settings.poses.length;
            if (frame === this.frame) return;
            this.releasePose?.();
            this.frame = frame;
            this.releasePose = this.context.entity.presentation.acquirePose(this.settings.poses[frame]);
      }
      private move(): void {
            const { entity, simulation } = this.context;
            const hitbox = entity.config.hitbox;
            const halfWidth = hitbox.type === "box" ? hitbox.width / 2 : hitbox.radius;
            const halfHeight = hitbox.type === "box" ? hitbox.height / 2 : hitbox.radius;
            const bounds = { minX: simulation.arena.minX + halfWidth, maxX: simulation.arena.maxX - halfWidth,
                  minY: simulation.arena.minY + halfHeight, maxY: simulation.arena.maxY - halfHeight };
            const vertical = this.wall === "left" || this.wall === "right";
            const { position } = entity.body;
            const coordinate = vertical ? position.y : position.x;
            const min = vertical ? bounds.minY : bounds.minX;
            const max = vertical ? bounds.maxY : bounds.maxX;
            if (coordinate <= min && this.direction < 0) this.direction = 1;
            if (coordinate >= max && this.direction > 0) this.direction = -1;
            Body.setPosition(entity.body, {
                  x: vertical ? this.wall === "left" ? bounds.minX : bounds.maxX : Math.max(min, Math.min(max, position.x)),
                  y: vertical ? Math.max(min, Math.min(max, position.y)) : this.wall === "top" ? bounds.minY : bounds.maxY,
            });
            const speed = (entity.components.get<FloatingMovement>("movement")?.baseSpeed ?? entity.config.speed) * this.settings.speedMultiplier;
            Body.setVelocity(entity.body, { x: vertical ? 0 : this.direction * speed, y: vertical ? this.direction * speed : 0 });
            Body.setAngularVelocity(entity.body, 0);
            const flipped = (this.wall === "bottom" || this.wall === "left") ? this.direction < 0 : this.direction > 0;
            entity.facing = flipped ? entity.config.defaultFacing === "right" ? "left" : "right" : entity.config.defaultFacing;
      }
}
