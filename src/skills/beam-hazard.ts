import type { Fighter } from "../entities/fighter";
import type { LaserShot } from "../gameplay/instant-laser";
import { laserTouchesFighter, laserSweptTouchesFighter, captureLaserTarget,
      type LaserTargetGeometry } from "../gameplay/instant-laser";
import { areEnemies } from "../gameplay/teams";
import type { SpawnedEntityContext } from "../gameplay/spawned-entity";

/** Sustained beam: an independent simulation cooldown per contacted fighter. */
export class BeamHazard {
      private readonly nextDamageAt = new Map<Fighter, number>();
      private closed = false;
      private previousShot: LaserShot | null = null;
      private readonly previousTargets = new Map<Fighter, LaserTargetGeometry[]>();

      constructor(private readonly source: Fighter, private readonly intervalMs: number) {
            if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error("Invalid beam damage interval");
      }

      update(shot: LaserShot, context: SpawnedEntityContext): void {
            if (this.closed || this.source.isDead) return;
            const now = context.now();
            for (const target of context.characters) {
                  if (target.isDead || !areEnemies(this.source, target)) continue;
                  const previous = this.previousTargets.get(target);
                  const touches = this.previousShot && previous
                        ? laserSweptTouchesFighter(shot, this.previousShot.origin, target, previous)
                        : laserTouchesFighter(shot, target);
                  this.previousTargets.set(target, captureLaserTarget(target));
                  if (!touches || now < (this.nextDamageAt.get(target) ?? -Infinity)) continue;
                  this.nextDamageAt.set(target, now + this.intervalMs);
                  context.damage(this.source, target, shot.damage);
            }
            this.previousShot = { ...shot, origin: { ...shot.origin }, direction: { ...shot.direction } };
            for (const target of this.nextDamageAt.keys())
                  if (target.isDead || !context.characters.includes(target)) {
                        this.nextDamageAt.delete(target); this.previousTargets.delete(target);
                  }
            for (const target of this.previousTargets.keys())
                  if (target.isDead || !context.characters.includes(target)) this.previousTargets.delete(target);
      }

      /** Disabled gaps cannot create a swept hit when a new pulse begins. */
      pause(): void { this.previousShot = null; this.previousTargets.clear(); }
      cancel(): void { this.closed = true; this.nextDamageAt.clear(); this.pause(); }
}
