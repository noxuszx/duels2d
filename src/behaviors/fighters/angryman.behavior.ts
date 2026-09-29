import type { AbilityConfig, DashAction } from "../../abilities/types";
import type { Fighter } from "../../entities/fighter";
import { DashSkill } from "../../skills/dash-skill";
import {
      DEFAULT_WALL_COLLISION_RESPONSE,
      type ArenaBounds,
      type ArenaWall,
      type FighterBehaviorContext,
      type WallCollisionResponse,
} from "../types";
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
            this.fighter.abilities.update(deltaMs);
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

      override onWallCollision(wall: ArenaWall, bounds: ArenaBounds): WallCollisionResponse {
            void bounds;
            this.dashSkill.handleWallCollision(wall);
            return DEFAULT_WALL_COLLISION_RESPONSE;
      }

      override reset(): void {
            this.dashSkill.stop();
            this.target = null;
            this.fighter.abilities.reset();
      }

      private tryActivate(): void {
            const now = this.context.now();
            const target = this.context.getNearestEnemy(this.fighter);
            if (!target) return;
            for (const ability of this.fighter.activeAbilities) {
                  if (ability.trigger.type !== "nearest-enemy") continue;
                  const result = this.fighter.abilities.tryStart(
                        ability,
                        this.fighter.facing,
                        now,
                  );
                  if (!result.started) continue;
                  this.target = target;
                  this.fighter.abilities.lockFacingToward(
                        target.body.position.x,
                        this.fighter.body.position.x,
                  );
                  return;
            }
      }

      private startDash(ability: AbilityConfig): void {
            const target = this.target && !this.target.isDead
                  ? this.target
                  : this.context.getNearestEnemy(this.fighter);
            const dash = ability.actions.find((action): action is DashAction => action.type === "dash");
            if (!target || !dash) return this.fighter.abilities.finishActive();
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
                        const result = this.context.executeTargetActions(
                              this.fighter,
                              enemy,
                              ability,
                        );
                        if (result.connected)
                              this.fighter.audio.playAbilityCue(ability, "hit");
                  },
                  onComplete: () => this.fighter.abilities.finishActive(),
            });
      }
}
