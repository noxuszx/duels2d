import { Body, Query } from "matter-js";
import type { Fighter } from "../entities/fighter";
import type { Projectile, ProjectileRemovalReason } from "../entities/projectile";
import type { ProjectileFlightSettings } from "../gameplay/projectile-settings";
import type { ArenaBounds } from "./types";

export interface ProjectileFlightContext {
      characters: readonly Fighter[];
      /** Inner arena edges; this component accounts for projectile radius. */
      bounds: ArenaBounds;
      matchEnded: boolean;
}

export interface ProjectileOwner {
      id: string;
      body?: Body;
}

/** One owned flight per projectile; simulation-timed and independent of ability phases. */
export class ProjectileFlight {
      private elapsedMs = 0;
      private closed = false;
      private catchArmed = false;

      constructor(
            private readonly projectile: Projectile,
            private readonly owner: ProjectileOwner,
            readonly settings: Readonly<ProjectileFlightSettings>,
      ) {
            // Arm on launch if already outside the owner: no lost first return contact.
            if (owner.body) this.catchArmed = !this.overlaps(owner.body);
      }

      get ownerCatchArmed(): boolean { return this.catchArmed; }

      update(deltaMs: number, context: ProjectileFlightContext): void {
            if (!this.checkOwnership(context)) return;
            if (Number.isFinite(deltaMs) && deltaMs > 0) {
                  this.elapsedMs += deltaMs;
                  if (this.settings.lifetime.type === "duration" &&
                        this.elapsedMs >= this.settings.lifetime.durationMs) {
                        this.projectile.remove("expired");
                        return;
                  }
                  if (this.settings.collision.walls === "bounce") this.bounce(context.bounds);
                  const owner = this.getOwner(context.characters);
                  if (owner && !owner.isDead && this.settings.collision.ownerContact === "catch") {
                        const overlaps = this.overlaps(owner.body);
                        if (!overlaps) this.catchArmed = true;
                        else if (this.catchArmed) this.projectile.remove("caught");
                  }
            }
            // End-of-match policy is independent of catching; persistent shots can be retired.
            if (!this.closed && context.matchEnded && this.settings.ownership.onMatchEnd === "remove")
                  this.projectile.remove("match-ended");
      }

      /** Routes harmless owner contacts too. Returns whether shared combat may hit this enemy. */
      handleFighterContact(target: Fighter, context: ProjectileFlightContext): boolean {
            if (!this.checkOwnership(context) || target.isDead) return false;
            const owner = this.getOwner(context.characters);
            if (target === owner) {
                  if (this.settings.collision.ownerContact === "catch" && this.catchArmed)
                        this.projectile.remove("caught");
                  return false;
            }
            return true;
      }

      /** Called after a routed enemy contact has attempted its shared effects. */
      completeEnemyContact(): void {
            if (!this.closed && this.settings.collision.enemyContact === "consume") this.projectile.remove("hit");
      }

      cancel(reason: ProjectileRemovalReason): void { this.projectile.remove(reason); }

      /** Called only by entity removal, before its notification. */
      dispose(): void { this.closed = true; }

      getOwner(characters: readonly Fighter[]): Fighter | null {
            return characters.find(fighter => this.owner.body
                  ? fighter.body === this.owner.body : fighter.id === this.owner.id) ?? null;
      }

      private checkOwnership(context: ProjectileFlightContext): boolean {
            if (this.closed || this.projectile.dead) return false;
            const owner = this.getOwner(context.characters);
            if (!owner && this.settings.ownership.onOwnerRemoval === "remove") {
                  this.projectile.remove("owner-removed");
                  return false;
            }
            if (owner?.isDead && this.settings.ownership.onOwnerDeath === "remove") {
                  this.projectile.remove("owner-death");
                  return false;
            }
            return true;
      }

      private overlaps(body: Body): boolean {
            return Query.collides(this.projectile.body, [body]).length > 0;
      }

      private bounce(bounds: ArenaBounds): void {
            const radius = this.projectile.radius;
            const minX = bounds.minX + radius, maxX = bounds.maxX - radius;
            const minY = bounds.minY + radius, maxY = bounds.maxY - radius;
            const { position, velocity } = this.projectile.body;
            let x = position.x, y = position.y, vx = velocity.x, vy = velocity.y;
            if (x < minX) { x = minX; vx = Math.abs(vx); }
            else if (x > maxX) { x = maxX; vx = -Math.abs(vx); }
            if (y < minY) { y = minY; vy = Math.abs(vy); }
            else if (y > maxY) { y = maxY; vy = -Math.abs(vy); }
            if (x !== position.x || y !== position.y) {
                  Body.setPosition(this.projectile.body, { x, y });
                  Body.setVelocity(this.projectile.body, { x: vx, y: vy });
            }
      }
}
