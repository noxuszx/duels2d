import type { BehaviorHandlers } from "../../../gameplay/fighter-factory";
import type { Dasher, Targeting, WallCrawler } from "../../../gameplay/components";

interface BabyComponents { targeting: Targeting; wallCrawl: WallCrawler; dash: Dasher; }

/** Baby's decisions. Equipped components supply mechanics, tuning and cleanup. */
export function babyBehavior({ targeting, wallCrawl, dash }: BabyComponents): BehaviorHandlers {
      return {
            *onWallContact({ wall }) {
                  const target = targeting.nearestEnemy();
                  if (!target) return;

                  yield wallCrawl.start(wall, { toward: target });

                  const nextTarget = targeting.nearestEnemy();
                  if (nextTarget) yield dash.start(nextTarget);
            },
      };
}
