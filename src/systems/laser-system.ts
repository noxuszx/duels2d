import type { Fighter } from "../entities/fighter";
import { laserTouchesFighter, type LaserShot } from "../gameplay/instant-laser";
import { areEnemies } from "../gameplay/teams";

interface LaserFlash { source: Fighter; shot: LaserShot; remainingMs: number; }

/** Resolves a shot once. Subsequent ticks only age its optional visual flash. */
export class LaserSystem {
      private flashes: LaserFlash[] = [];

      fire(source: Fighter, shot: LaserShot, characters: readonly Fighter[],
            damage: (source: Fighter, target: Fighter, amount: number) => void): void {
            if (source.isDead || !characters.includes(source) ||
                  ![shot.origin.x, shot.origin.y, shot.direction.x, shot.direction.y,
                        shot.length, shot.width, shot.damage, shot.flashMs].every(Number.isFinite) ||
                  shot.length <= 0 || shot.width <= 0 || shot.damage < 0 || shot.flashMs < 0) return;
            const magnitude = Math.hypot(shot.direction.x, shot.direction.y);
            if (magnitude <= 0) return;
            const snapshot: LaserShot = { ...shot, origin: { ...shot.origin },
                  direction: { x: shot.direction.x / magnitude, y: shot.direction.y / magnitude } };
            for (const target of [...characters]) {
                  if (source.isDead) break;
                  if (!target.isDead && areEnemies(source, target) && laserTouchesFighter(snapshot, target))
                        damage(source, target, snapshot.damage);
            }
            if (shot.flashMs > 0) this.flashes.push({ source, shot: snapshot, remainingMs: shot.flashMs });
      }

      update(deltaMs: number, characters: readonly Fighter[]): void {
            for (const flash of this.flashes) flash.remainingMs -= deltaMs;
            this.flashes = this.flashes.filter(flash => flash.remainingMs > 0 &&
                  !flash.source.isDead && characters.includes(flash.source));
      }

      clear(): void { this.flashes = []; }

      draw(ctx: CanvasRenderingContext2D): void {
            ctx.save();
            ctx.lineCap = "round";
            for (const { shot } of this.flashes) {
                  ctx.beginPath();
                  ctx.moveTo(shot.origin.x, shot.origin.y);
                  ctx.lineTo(shot.origin.x + shot.direction.x * shot.length,
                        shot.origin.y + shot.direction.y * shot.length);
                  ctx.strokeStyle = shot.color;
                  ctx.lineWidth = shot.width;
                  ctx.shadowColor = shot.color;
                  ctx.shadowBlur = shot.width * 2;
                  ctx.stroke();
            }
            ctx.restore();
      }
}
