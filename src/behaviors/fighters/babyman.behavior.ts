import { DashSkill } from "../../skills/dash-skill";
import { WallCrawlSkill } from "../../skills/wall-crawl-skill";
import type { Fighter } from "../../entities/fighter";
import type {
      DamageAction,
      DashAction,
      KnockbackAction,
      WallCrawlAction,
} from "../../abilities/types";
import { FighterBehavior } from "../fighter-behavior";
import type { ArenaBounds, ArenaWall, FighterBehaviorContext } from "../types";

/**
 * Dedicated behavior script for Baby Man.
 * Orchestrates a reusable WallCrawlSkill into an explosive DashSkill
 * upon wall contact, then returns to idle.
 */
export class BabyManBehavior extends FighterBehavior {
      private readonly crawlSkill = new WallCrawlSkill();
      private readonly dashSkill = new DashSkill();

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
      }

      override onUpdate(deltaMs: number): void {
            if (this.fighter.isDead) {
                  this.reset();
                  return;
            }

            if (this.crawlSkill.isActive) {
                  this.crawlSkill.update(deltaMs);
            } else if (this.dashSkill.isActive) {
                  this.dashSkill.update(deltaMs);
                  this.fighter.abilities.update();
            } else {
                  this.fighter.abilities.update();
            }

            if (this.fighter.abilities.state === "idle") {
                  if (this.crawlSkill.isActive) this.crawlSkill.stop();
                  if (this.dashSkill.isActive) this.dashSkill.stop();
            }
      }

      override onWallCollision(wall: ArenaWall, bounds: ArenaBounds): boolean {
            if (this.crawlSkill.isActive) {
                  return true;
            }

            if (this.dashSkill.isActive) {
                  this.dashSkill.handleWallCollision(wall);
                  return false;
            }

            if (this.fighter.isDead || this.fighter.abilities.state !== "idle") {
                  return false;
            }

            const now = this.context.now();
            const ability = this.fighter.config.abilities.find(
                  (a) => a.trigger.type === "wall-contact" && this.fighter.abilities.canUse(a, now),
            );
            const target = this.context.getNearestEnemy(this.fighter);
            if (!ability || !target) return false;

            const crawlAction = ability.actions.find(
                  (a): a is WallCrawlAction => a.type === "wall-crawl",
            );
            const dashAction = ability.actions.find(
                  (a): a is DashAction => a.type === "dash",
            );
            const damageAction = ability.actions.find(
                  (a): a is DamageAction => a.type === "damage",
            );
            const knockbackAction = ability.actions.find(
                  (a): a is KnockbackAction => a.type === "knockback",
            );

            this.fighter.abilities.start(ability, this.fighter.facing, now);

            this.crawlSkill.start(this.fighter, target, wall, bounds, {
                  durationMs: crawlAction?.durationMs ?? 2000,
                  speedMultiplier: crawlAction?.speedMultiplier ?? 1.5,
                  onComplete: () => {
                        this.fighter.abilities.beginActive();
                        const currentTarget =
                              this.context.getNearestEnemy(this.fighter) ?? target;
                        const direction = {
                              x: currentTarget.body.position.x - this.fighter.body.position.x,
                              y: currentTarget.body.position.y - this.fighter.body.position.y,
                        };
                        if (direction.x !== 0) {
                              this.fighter.facing = direction.x < 0 ? "left" : "right";
                        }

                        this.dashSkill.start(this.fighter, direction, {
                              speedMultiplier: dashAction?.speedMultiplier ?? 5,
                              accelerationForce: dashAction?.accelerationForce ?? 0.018,
                              stopOn: dashAction?.endOn ?? [
                                    "fighter-collision",
                                    "wall-collision",
                              ],
                              onHitEnemy: (enemy) => {
                                    if (damageAction) {
                                          this.context.dealDamage(
                                                this.fighter,
                                                enemy,
                                                damageAction.amount,
                                          );
                                    }
                                    if (knockbackAction) {
                                          this.context.applyKnockback(
                                                this.fighter,
                                                enemy,
                                                knockbackAction.forceMagnitude,
                                          );
                                    }
                                    this.fighter.audio.playAbilityCue(ability, "hit");
                              },
                              onComplete: () => {
                                    this.fighter.abilities.finishActive();
                              },
                        });
                  },
            });

            return true;
      }

      override onFighterCollision(target: Fighter): void {
            if (this.dashSkill.isActive) {
                  this.dashSkill.handleFighterCollision(target);
            }
      }

      override isWallCrawling(): boolean {
            return this.crawlSkill.isActive;
      }

      override getWallCrawlAngle(): number | null {
            return this.crawlSkill.getAngle();
      }

      override reset(): void {
            this.crawlSkill.stop();
            this.dashSkill.stop();
            this.fighter.abilities.reset();
      }
}
