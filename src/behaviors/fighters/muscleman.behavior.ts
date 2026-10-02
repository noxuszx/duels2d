import type { Fighter } from "../../entities/fighter";
import { assertDamageRampSettings, type DamageRampSettings } from "../settings";
import type { Projectile, ProjectileRemovalReason } from "../../entities/projectile";
import type { CancellationReason } from "../../gameplay/action-scope";
import { AbilityRunner } from "../../gameplay/ability-runner";
import { launchProjectile } from "../../gameplay/launch-projectile";
import type { FighterBehaviorContext } from "../types";
import { FighterBehavior } from "../fighter-behavior";

/** Decisions/timers live here; movement, presentation, and projectile combat stay shared. */
export class MuscleManBehavior extends FighterBehavior {
      private readonly moves: AbilityRunner;
      private damage = 0;
      private chargeElapsedMs = 0;
      private nextIncreaseMs = 1000;
      private poseRemainingMs = 0;
      private releasePose: (() => void) | null = null;
      private projectile: Projectile | null = null;
      private pendingThrow = false;
      private flightGeneration = 0;
      private disposed = false;

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
            if (!this.ramp) throw new Error("Muscle Man requires damage-ramp behavior settings");
            assertDamageRampSettings(this.ramp);
            this.moves = new AbilityRunner(fighter, context);
            this.restartRamp();
      }

      get accumulatedDamage(): number { return this.damage; }

      private get ramp(): DamageRampSettings | null {
            const behavior = this.fighter.config.behavior;
            return behavior?.type === "damage-ramp" ? behavior.settings : null;
      }

      override onUpdate(deltaMs: number): void {
            if (this.disposed) return;
            if (this.fighter.isDead) return this.interrupt("death");
            if (this.context.isCombatActive?.() === false) {
                  this.moves.cancel("interrupted");
                  if (!this.projectile) this.clearPose();
                  return;
            }
            if (deltaMs <= 0) return;
            this.moves.update(deltaMs);
            if (this.projectile) return;
            if (this.poseRemainingMs > 0) {
                  this.poseRemainingMs = Math.max(0, this.poseRemainingMs - deltaMs);
                  if (!this.poseRemainingMs) this.clearPose();
            }
            const ramp = this.ramp;
            if (!ramp) return;
            if (this.pendingThrow) { this.tryThrow(); return; }
            if (this.fighter.abilities.state !== "idle") return;
            this.chargeElapsedMs += deltaMs;
            while (this.chargeElapsedMs + 1e-7 >= this.nextIncreaseMs) {
                  this.damage = Math.min(ramp.maxDamage, this.damage + ramp.amountPerIncrease);
                  this.showPose("attackWindup");
                  this.poseRemainingMs = Math.max(0,
                        ramp.increasePoseMs - (this.chargeElapsedMs - this.nextIncreaseMs));
                  const second = Math.floor((this.nextIncreaseMs + 1e-7) / 1000);
                  const rate = ramp.ratesPerSecond[Math.min(second, ramp.ratesPerSecond.length - 1)];
                  this.nextIncreaseMs += 1000 / rate;
                  if (this.damage >= ramp.maxDamage) {
                        this.pendingThrow = true;
                        this.tryThrow();
                        break;
                  }
            }
            if (!this.projectile && !this.poseRemainingMs) this.clearPose();
      }

      override onDamaged(amount: number): void {
            if (amount <= 0 || this.disposed || this.fighter.isDead || this.context.isCombatActive?.() === false) return;
            this.restartRamp();
            if (this.projectile) return; // An airborne projectile keeps its launch damage.
            const threshold = this.ramp?.hurtThrowThreshold ?? 0;
            if (this.damage > threshold) {
                  this.pendingThrow = true;
                  this.tryThrow(); // Casting locks still apply; retain a pending throw if locked.
            } else {
                  this.damage = 0;
                  this.pendingThrow = false;
                  this.clearPose();
            }
      }

      private tryThrow(): void {
            const ability = this.fighter.activeAbilities[0];
            const action = ability?.actions.find(action => action.type === "spawn-projectile");
            const target = this.context.getNearestEnemy(this.fighter);
            if (!ability || !action || !target || this.projectile) return;
            const damage = this.damage;
            const generation = this.flightGeneration;
            this.moves.start(ability, target, {
                  active: scope => {
                        if (this.disposed || generation !== this.flightGeneration || !this.moves.ownsActiveScope(scope)) return;
                        const currentTarget = this.moves.validTarget(target)
                              ? target : this.context.getNearestEnemy(this.fighter);
                        if (!currentTarget) return this.moves.cancel();
                        const flightGeneration = ++this.flightGeneration;
                        this.projectile = launchProjectile(this.fighter, currentTarget,
                              { ...action.projectile, damage }, this.context, ability.audio?.hit ?? null, {
                                    onRemoved: () => {
                                          if (this.disposed || flightGeneration !== this.flightGeneration) return;
                                          this.projectile = null;
                                          this.damage = 0;
                                          this.pendingThrow = false;
                                          this.restartRamp();
                                          this.clearPose();
                                    },
                              });
                        this.showPose("attackActive");
                        this.poseRemainingMs = 0;
                        this.pendingThrow = false;
                  },
            });
      }

      private restartRamp(): void {
            this.chargeElapsedMs = 0;
            const rate = this.ramp?.ratesPerSecond[0] ?? 1;
            this.nextIncreaseMs = 1000 / rate;
      }

      private showPose(pose: string): void {
            this.clearPose();
            this.releasePose = this.fighter.presentation.acquirePose(pose);
      }

      private clearPose(): void {
            this.releasePose?.();
            this.releasePose = null;
            this.poseRemainingMs = 0;
      }

      override interrupt(reason: CancellationReason): void {
            this.moves.cancel(reason);
            if (reason !== "interrupted") this.resetState(reason === "death" ? "owner-death" : reason === "removed" ? "removed" : "reset");
            // Stun/ability lock cancels casting, but does not retract an already-thrown entity.
      }

      private resetState(reason: ProjectileRemovalReason): void {
            // Invalidate callbacks before closing the old flight; they cannot reset a newer use.
            this.flightGeneration++;
            const projectile = this.projectile;
            this.projectile = null;
            projectile?.remove(reason);
            this.damage = 0;
            this.pendingThrow = false;
            this.restartRamp();
            this.clearPose();
      }

      override reset(): void {
            this.moves.cancel("reset");
            this.resetState("reset");
      }
      override dispose(): void {
            this.disposed = true;
            this.moves.cancel("removed");
            this.resetState("removed");
      }
      override isDashing(): boolean { return false; }
}
