import { areEnemies } from "../gameplay/teams";
import type { Fighter } from "../entities/fighter";
import type { CancellationReason } from "../gameplay/action-scope";
import type { FighterRuntimeComponent } from "../gameplay/fighter-runtime";
import { nearestEnemy } from "../gameplay/targeting";
import { AimSkill, type AimSolution } from "./aim-skill";

export interface TrackingAimContext {
      characters: readonly Fighter[];
      isCombatActive?(): boolean;
}

export interface TrackingAimOptions {
      target?: () => Fighter | null;
      faceTarget?: boolean;
}

/** Tracks a valid enemy and maintains an independently aimed weapon during simulation ticks. */
export class TrackingAimSkill implements FighterRuntimeComponent {
      private readonly aim = new AimSkill();
      private selectedTarget: Fighter | null = null;
      private readonly faceTarget: boolean;
      private readonly chooseTarget: () => Fighter | null;

      constructor(
            private readonly fighter: Fighter,
            private readonly context: TrackingAimContext,
            options: TrackingAimOptions = {},
      ) {
            this.faceTarget = options.faceTarget ?? true;
            this.chooseTarget = options.target ?? (() => nearestEnemy(fighter, context.characters));
      }

      get current(): AimSolution | null { return this.aim.current; }
      get target(): Fighter | null { return this.selectedTarget; }

      update(deltaMs: number): void {
            if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
            if (this.fighter.isDead || this.context.isCombatActive?.() === false ||
                  !this.fighter.statuses.canContinueAbility || this.fighter.transformation.isTransforming) {
                  this.clear();
                  return;
            }

            const target = this.chooseTarget();
            if (!target || target.isDead || !this.context.characters.includes(target) ||
                  !areEnemies(this.fighter, target)) {
                  this.clear();
                  return;
            }

            const options = this.fighter.activeSkills?.weaponAim;
            if (!options) {
                  this.clear();
                  return;
            }
            this.selectedTarget = target;
            if (this.faceTarget) this.fighter.setFacingToward(target);

            this.aim.update({
                  center: this.fighter.visualPosition,
                  facing: this.fighter.facing,
                  defaultFacing: this.fighter.config.defaultFacing,
            }, target.body.position, options);
            if (!this.aim.current) this.selectedTarget = null;
      }

      /** Stops the current tracking solution; a later update can resume tracking. */
      cancel(_reason: CancellationReason): void {
            this.clear();
      }

      private clear(): void {
            this.selectedTarget = null;
            this.aim.stop();
      }
}
