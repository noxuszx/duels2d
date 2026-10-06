import type { BehaviorHandlers, FighterContext } from "../../../gameplay/fighter-factory";
import type { ProjectileEmitter, Targeting, Visuals } from "../../../gameplay/components";
import type { ContactEvent, Vector2 } from "../../../engine/contracts";
import type { Entity } from "../../../engine/entity";
import type { Simulation } from "../../../engine/simulation";

const DIAGONALS: readonly Vector2[] = [
      { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
      { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
      { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
];

function attachClusterBurst(tear: Entity, simulation: Simulation, miniTear: ProjectileEmitter): void {
      let exploded = false;
      const explode = () => {
            if (exploded) return;
            exploded = true;
            const pos = { x: tear.body.position.x, y: tear.body.position.y };
            miniTear.spawn(DIAGONALS.map(direction => ({ position: pos, direction })));
      };

      tear.components.use("cluster-burst", {
            contact(event: ContactEvent) {
                  if (event.kind === "wall") {
                        explode();
                        simulation.remove(tear.runtimeId, "hit");
                  }
            },
            detach() {
                  if (tear.removalReason === "hit" || tear.removalReason === "expired") {
                        explode();
                  }
            },
      });
}

interface DepressedManComponents {
      targeting: Targeting;
      visuals: Visuals;
      tear: ProjectileEmitter;
      miniTear: ProjectileEmitter;
}

/** Spits out a primary tear that explodes into 4 diagonal mini-tears upon impact or timeout. */
export function depressedManBehavior(
      { targeting, visuals, tear, miniTear }: DepressedManComponents,
      { entity, config, simulation }: FighterContext,
): BehaviorHandlers {
      const move = config.moves["throw-tear"];
      return {
            actions: {
                  "throw-tear": {
                        when: () => !!targeting.nearestEnemy(),
                        *run() {
                              const target = targeting.nearestEnemy();
                              if (!target) return;

                              yield visuals.pose("attackActive", move?.windupMs ?? 33);

                              const currentTarget = target.isAlive ? target : targeting.nearestEnemy();
                              const targetPos = currentTarget?.body.position ?? target.body.position;
                              const dx = targetPos.x - entity.body.position.x;
                              const dy = targetPos.y - entity.body.position.y;
                              const dist = Math.hypot(dx, dy);
                              const direction = dist > 1e-6
                                    ? { x: dx / dist, y: dy / dist }
                                    : { x: entity.facing === "left" ? -1 : 1, y: 0 };

                              const origin = {
                                    x: entity.body.position.x + direction.x * (config.radius + 5),
                                    y: entity.body.position.y + direction.y * (config.radius + 5),
                              };

                              const spawned = tear.spawn({ position: origin, direction });
                              if (spawned) {
                                    for (const projectile of spawned) {
                                          attachClusterBurst(projectile, simulation, miniTear);
                                    }
                              }

                              yield visuals.pose("attackActive", move?.attackDurationMs ?? 33);
                              yield visuals.pose("idle", move?.recoveryMs ?? 67);
                        },
                  },
            },
      };
}
