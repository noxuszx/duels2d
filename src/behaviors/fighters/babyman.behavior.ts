import type { DashAction, WallCrawlAction, AbilityConfig } from "../../abilities/types";
import type { Fighter } from "../../entities/fighter";
import { AbilityRunner } from "../../gameplay/ability-runner";
import { dashToward } from "../../gameplay/dash-move";
import { hitWithAbility } from "../../combat/ability-hit";
import { WallCrawlSkill } from "../../skills/wall-crawl-skill";
import type { ArenaBounds, ArenaWall, FighterBehaviorContext, WallCollisionResponse } from "../types";
import { DEFAULT_WALL_COLLISION_RESPONSE } from "../types";
import { FighterBehavior } from "../fighter-behavior";

/** Baby Man chooses a wall-crawl charge; the runner and phase operations own its timing. */
export class BabyManBehavior extends FighterBehavior {
      private readonly moves: AbilityRunner;
      private readonly crawl = new WallCrawlSkill();

      constructor(fighter: Fighter, context: FighterBehaviorContext) {
            super(fighter, context);
            this.moves = this.runtime.use(new AbilityRunner(fighter, context));
      }

      override onWallCollision(
            wall: ArenaWall,
            bounds: ArenaBounds,
            wasDashing = false,
      ): WallCollisionResponse {
            // Keep wall contact during the attached crawl from applying bounce or impact damage.
            if (this.crawl.isActive) {
                  return { defaultBounce: false, allowImpactDamage: false };
            }
            // This collision may have ended the dash inside runtime dispatch; don't start another move from it.
            if (wasDashing) return DEFAULT_WALL_COLLISION_RESPONSE;
            const ability = this.fighter.activeAbilities.find(
                  candidate => candidate.trigger.type === "wall-contact",
            );
            if (!ability || !this.moves.canStart(ability)) return DEFAULT_WALL_COLLISION_RESPONSE;
            const target = this.context.getNearestEnemy(this.fighter);
            if (!target || !this.moves.validTarget(target)) {
                  return DEFAULT_WALL_COLLISION_RESPONSE;
            }
            const crawlAction = ability.actions.find(
                  (action): action is WallCrawlAction => action.type === "wall-crawl",
            );
            const dashAction = ability.actions.find(
                  (action): action is DashAction => action.type === "dash",
            );
            if (!crawlAction || !dashAction) return DEFAULT_WALL_COLLISION_RESPONSE;

            // Wall crawl is Baby Man's windup phase. Keep the configured ability ID so its
            // existing cooldown remains authoritative while honoring crawl duration in JSON.
            const move: AbilityConfig = {
                  ...ability,
                  timing: { ...ability.timing, windupMs: crawlAction.durationMs },
            };
            let crawlStarted = false;
            const started = this.moves.start(move, target, {
                  windup: scope => {
                        if (scope.isClosed) return;
                        scope.use(this.crawl);
                        crawlStarted = this.crawl.start(this.fighter, target, wall, bounds, {
                              durationMs: crawlAction.durationMs,
                              speedMultiplier: crawlAction.speedMultiplier,
                        });
                        if (!crawlStarted) this.moves.cancel("interrupted");
                  },
                  active: scope => {
                        const currentTarget = this.context.getNearestEnemy(this.fighter);
                        if (!currentTarget || !this.moves.validTarget(currentTarget)) {
                              this.moves.finishActive();
                              return;
                        }
                        dashToward(scope, this.moves, currentTarget, dashAction, enemy => {
                              hitWithAbility(this.fighter, enemy, ability, this.context);
                        });
                  },
            });
            if (!started.started || !crawlStarted) return DEFAULT_WALL_COLLISION_RESPONSE;

            return { defaultBounce: false, allowImpactDamage: false };
      }

      override isWallCrawling(): boolean { return this.crawl.isActive; }

      override getWallCrawlAngle(): number | null { return this.crawl.getAngle(); }
}
