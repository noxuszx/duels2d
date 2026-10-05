import type { BehaviorHandlers, FighterContext } from "../../../gameplay/fighter-factory";
import type { Targeting } from "../../../gameplay/components/targeting";
import type { SpriteAim } from "../../../gameplay/components/aim";
import type { Visuals } from "../../../gameplay/components/visuals";
import type { SegmentShape } from "../../../engine/spatial/shapes";
import { wait } from "../../../engine/scripting/wait";

interface AlienComponents { targeting: Targeting; aim: SpriteAim; visuals: Visuals; }

/** A laser resolves once; its brief flash has no continuing damage or tracking. */
export function alienBehavior({ targeting, aim, visuals }: AlienComponents,
      { entity, simulation, config }: FighterContext): BehaviorHandlers {
      const laser = config.components.instantLaser;
      if (!laser) throw new Error("Alien requires laser settings");
      return { actions: {
            "laser-shot": {
                  when: () => !!targeting.nearestEnemy(),
                  *run() {
                        const target = targeting.nearestEnemy();
                        if (!target) return;
                        yield* aim.follow(target, function* () {
                              const solution = aim.current;
                              if (!solution) return;
                              const shape: SegmentShape = {
                                    type: "segment", from: solution.origin, width: laser.width,
                                    to: { x: solution.origin.x + solution.direction.x * laser.range,
                                          y: solution.origin.y + solution.direction.y * laser.range },
                              };
                              for (const hit of simulation.spatial.overlapSegment(shape, {
                                    filter: other => other.teamId !== entity.teamId && other.tags.has("targetable"),
                              })) simulation.hit(entity, hit.entity, { damage: laser.damage }, { independentCooldown: true });
                              yield visuals.shape(shape, laser.color, laser.flashMs);
                              yield wait(Math.max(0, laser.intervalMs - laser.flashMs));
                        });
                  },
            },
      } };
}
