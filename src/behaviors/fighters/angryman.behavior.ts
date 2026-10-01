import type { Fighter } from "../../entities/fighter";
import { AbilityRunner } from "../../gameplay/ability-runner";
import type { CancellationReason } from "../../gameplay/action-scope";
import { dashToward } from "../../gameplay/dash-move";
import { hitWithAbility } from "../../combat/ability-hit";
import { StopMovementSkill } from "../../skills/stop-movement-skill";
import { ShakeSkill } from "../../skills/shake-skill";
import {
      DEFAULT_WALL_COLLISION_RESPONSE,
      type ArenaBounds,
      type ArenaWall,
      type FighterBehaviorContext,
      type WallCollisionResponse,
} from "../types";
import { FighterBehavior } from "../fighter-behavior";

/** Stop and shake during windup, then charge and apply the configured hit effects. */
export class AngryManBehavior extends FighterBehavior {
      private readonly moves: AbilityRunner;

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
            this.moves = new AbilityRunner(fighter, context);
      }

      override onUpdate(deltaMs: number): void {
            this.moves.update(deltaMs);
            if (deltaMs <= 0 || this.fighter.isDead || this.fighter.abilities.state !== "idle") return;
            const target = this.context.getNearestEnemy(this.fighter);
            if (!target) return;
            for (const ability of this.fighter.activeAbilities) {
                  const dash = ability.actions.find((action) => action.type === "dash");
                  if (!dash || ability.trigger.type !== "nearest-enemy") continue;
                  const result = this.moves.start(ability, target, {
                        windup: (scope) => {
                              scope.use(new StopMovementSkill(this.fighter.movement));
                              scope.use(new ShakeSkill(this.fighter));
                        },
                        active: (scope) => {
                              const currentTarget = !target.isDead && this.context.characters.includes(target)
                                    ? target : this.context.getNearestEnemy(this.fighter);
                              if (!currentTarget) return this.moves.cancel();
                              dashToward(scope, this.moves, currentTarget, dash,
                                    (enemy) => hitWithAbility(this.fighter, enemy, ability, this.context));
                        },
                  });
                  if (result.started) break;
            }
      }

      override onFighterCollision(target: Fighter): void {
            this.moves.handleFighterCollision(target);
      }

      override onWallCollision(wall: ArenaWall, bounds: ArenaBounds): WallCollisionResponse {
            void bounds;
            this.moves.handleWallCollision(wall);
            return DEFAULT_WALL_COLLISION_RESPONSE;
      }

      override isDashing(): boolean { return this.moves.isDashing; }
      override reset(): void { this.moves.cancel("reset"); }
      override dispose(): void { this.moves.cancel("removed"); }
      override interrupt(reason: CancellationReason): void { this.moves.cancel(reason); }
}
