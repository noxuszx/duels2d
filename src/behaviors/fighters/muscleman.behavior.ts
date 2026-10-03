import type { AbilityConfig } from "../../abilities/types";
import type { Fighter } from "../../entities/fighter";
import type { Projectile, ProjectileRemovalReason } from "../../entities/projectile";
import type { CancellationReason } from "../../gameplay/action-scope";
import { AbilityRunner, type AbilityScript } from "../../gameplay/ability-runner";
import { AutoUseAbility } from "../../gameplay/auto-use-ability";
import { launchProjectile } from "../../gameplay/launch-projectile";
import { DamageRampSkill } from "../../skills/damage-ramp-skill";
import { TimedPoseSkill } from "../../skills/timed-pose-skill";
import type { FighterBehaviorContext } from "../types";
import { FighterBehavior } from "../fighter-behavior";

/** Hurt decisions, pending throws, and projectile ownership for Muscle Man. */
export class MuscleManBehavior extends FighterBehavior {
      private readonly moves: AbilityRunner;
      private readonly ramp: DamageRampSkill;
      private readonly pose: TimedPoseSkill;
      private readonly automaticThrow: AutoUseAbility;
      private projectile: Projectile | null = null;
      private pendingThrow = false;
      private flightGeneration = 0;
      private disposed = false;

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
            const behavior = fighter.config.behavior;
            if (behavior?.type !== "damage-ramp") throw new Error("Muscle Man requires damage-ramp behavior settings");

            this.moves = this.runtime.use(new AbilityRunner(fighter, context));
            this.pose = this.runtime.use(new TimedPoseSkill(fighter,
                  reason => reason === "interrupted" && !fighter.isDead && context.isCombatActive?.() !== false));
            this.ramp = this.runtime.use(new DamageRampSkill(behavior.settings, {
                  enabled: () => !this.projectile && !this.pendingThrow &&
                        this.fighter.abilities.state === "idle",
                  onIncrease: (_value, ageMs) => {
                        const overdueMs = Math.max(0, this.ramp.ageMs - ageMs);
                        this.pose.acquirePose("attackWindup", Math.max(0, behavior.settings.increasePoseMs - overdueMs));
                  },
                  onCap: () => { this.pendingThrow = true; },
            }));
            this.automaticThrow = this.runtime.use(new AutoUseAbility(this.moves, {
                  ability: () => this.pendingThrow ? this.throwAbility() : null,
                  target: () => this.context.getNearestEnemy(this.fighter),
                  script: (target, ability) => this.createThrow(target, ability),
            }));
      }

      get accumulatedDamage(): number { return this.ramp.accumulatedDamage; }

      override onDamaged(amount: number): void {
            if (amount <= 0 || this.disposed || this.fighter.isDead || this.context.isCombatActive?.() === false) return;
            this.ramp.restart();
            if (this.projectile) return; // Its launched damage remains a snapshot.
            const settings = this.fighter.config.behavior;
            const threshold = settings?.type === "damage-ramp" ? settings.settings.hurtThrowThreshold ?? 0 : 0;
            if (this.ramp.accumulatedDamage > threshold) {
                  this.pendingThrow = true;
                  this.automaticThrow.tryUse();
            } else {
                  this.ramp.clear();
                  this.pendingThrow = false;
                  this.pose.clear();
            }
      }

      private throwAbility(): AbilityConfig | null {
            return this.fighter.activeAbilities.find(ability =>
                  ability.actions.some(action => action.type === "spawn-projectile")) ?? null;
      }

      private createThrow(target: Fighter, ability: AbilityConfig): AbilityScript | null {
            const action = ability.actions.find(action => action.type === "spawn-projectile");
            if (!action || this.projectile || !this.pendingThrow) return null;
            const generation = this.flightGeneration;
            const damage = this.ramp.accumulatedDamage;
            return {
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
                                          this.ramp.clear();
                                          this.pendingThrow = false;
                                          this.pose.clear();
                                    },
                              });
                        this.pose.acquirePose("attackActive");
                        this.pendingThrow = false;
                  },
            };
      }

      override interrupt(reason: CancellationReason): void {
            if (reason !== "interrupted") this.resetState(
                  reason === "death" ? "owner-death" : reason === "removed" ? "removed" : "reset",
            );
            // A stun cancels casting, while an already launched projectile and its pose continue.
      }

      private resetState(reason: ProjectileRemovalReason): void {
            this.flightGeneration++;
            const projectile = this.projectile;
            this.projectile = null;
            projectile?.remove(reason);
            this.ramp.clear();
            this.pendingThrow = false;
            this.pose.clear();
      }

      override reset(): void { this.resetState("reset"); }

      override dispose(): void {
            this.disposed = true;
            this.resetState("removed");
      }
}
