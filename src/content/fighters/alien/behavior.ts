import type { BehaviorHandlers, FighterContext } from "../../../gameplay/fighter-factory";
import type { SpriteAim, Targeting, Visuals } from "../../../gameplay/components";
import { scoped, wait } from "../../../engine/scripting";
import { hitEnemies, raySegment } from "../../script-helpers";

interface AlienComponents { targeting: Targeting; aim: SpriteAim; visuals: Visuals; }

/** A laser resolves once; its brief flash has no continuing damage or tracking. */
export function alienBehavior({ targeting, aim, visuals }: AlienComponents,
      context: FighterContext): BehaviorHandlers {
      const { config } = context;
      const laser = config.components.instantLaser;
      if (!laser) throw new Error("Alien requires laser settings");
      return { actions: {
            "laser-shot": {
                  when: () => !!targeting.nearestEnemy(),
                  *run() {
                        const target = targeting.nearestEnemy();
                        if (!target) return;
                        yield* scoped(() => aim.track(target), function* () {
                              const solution = aim.current;
                              if (!solution) return;
                              const shape = raySegment(solution.origin, solution.direction, laser.range, laser.width);
                              hitEnemies(context, shape, { damage: laser.damage }, { independentCooldown: true });
                              yield visuals.shape(shape, laser.color, laser.flashMs);
                              yield wait(Math.max(0, laser.intervalMs - laser.flashMs));
                        });
                  },
            },
      } };
}
