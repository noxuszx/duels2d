import type { AbilityConfig, DamageAction, DashAction, KnockbackAction } from "../../abilities/types";
import type { Fighter } from "../../entities/fighter";
import { DashSkill } from "../../skills/dash-skill";
import type { ArenaBounds, ArenaWall, FighterBehaviorContext } from "../types";
import { FighterBehavior } from "../fighter-behavior";

/** Angry Man winds up, then charges the target until a fighter or wall stops him. */
export class AngryManBehavior extends FighterBehavior {
      private readonly dashSkill = new DashSkill();
      private target: Fighter | null = null;

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
      }

      override onUpdate(deltaMs: number): void {
            if (this.fighter.isDead) return this.reset();
            const previousState = this.fighter.abilities.state;
            this.fighter.abilities.update();
            const ability = this.fighter.abilities.active;

            if (ability && previousState === "windup" && this.fighter.abilities.state === "active") {
                  this.startDash(ability);
            }
            if (this.dashSkill.isActive && this.fighter.abilities.state === "active") {
                  this.dashSkill.update(deltaMs);
            } else if (this.dashSkill.isActive) {
                  this.dashSkill.stop();
            }
            if (this.fighter.abilities.state === "idle") this.tryActivate();
      }

      override onFighterCollision(target: Fighter): void {
            this.dashSkill.handleFighterCollision(target);
      }

      override onWallCollision(wall: ArenaWall, bounds: ArenaBounds): boolean {
            void bounds;
            this.dashSkill.handleWallCollision(wall);
            return false;
      }

      override reset(): void {
            this.dashSkill.stop();
            this.target = null;
            this.fighter.abilities.reset();
      }

      private tryActivate(): void {
            const now = this.context.now();
            const ability = this.fighter.config.abilities.find((candidate) =>
                  candidate.trigger.type === "nearest-enemy" && this.fighter.abilities.canUse(candidate, now),
            );
            const target = this.context.getNearestEnemy(this.fighter);
            if (!ability || !target) return;
            this.target = target;
            this.fighter.abilities.start(ability, this.fighter.facing, now);
            this.fighter.abilities.lockFacingToward(target.body.position.x, this.fighter.body.position.x);
      }

      private startDash(ability: AbilityConfig): void {
            const target = this.target && !this.target.isDead
                  ? this.target
                  : this.context.getNearestEnemy(this.fighter);
            const dash = ability.actions.find((action): action is DashAction => action.type === "dash");
            if (!target || !dash) return this.fighter.abilities.finishActive();
            const damage = ability.actions.find((action): action is DamageAction => action.type === "damage");
            const knockback = ability.actions.find((action): action is KnockbackAction => action.type === "knockback");
            const direction = {
                  x: target.body.position.x - this.fighter.body.position.x,
                  y: target.body.position.y - this.fighter.body.position.y,
            };
            if (direction.x !== 0) this.fighter.facing = direction.x < 0 ? "left" : "right";
            this.dashSkill.start(this.fighter, direction, {
                  speedMultiplier: dash.speedMultiplier,
                  accelerationForce: dash.accelerationForce,
                  stopOn: dash.endOn,
                  onHitEnemy: (enemy) => {
                        if (damage) this.context.dealDamage(this.fighter, enemy, damage.amount);
                        if (knockback) this.context.applyKnockback(this.fighter, enemy, knockback.forceMagnitude);
                        this.fighter.audio.playAbilityCue(ability, "hit");
                  },
                  onComplete: () => this.fighter.abilities.finishActive(),
            });
      }
}
