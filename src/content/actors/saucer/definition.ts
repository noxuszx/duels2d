import { Bodies } from "matter-js";
import { spawnActor } from "../../../gameplay/actor-factory";
import type { FighterContext } from "../../../gameplay/fighter-factory";
import { saucerBehavior } from "./behavior";
import { createFighter } from "../../../gameplay/fighter-factory";
import { alien } from "../../fighters/alien/definition";

export interface SaucerControl { deploy(): void; }

/** Content assembly: the saucer is an owned, non-targetable actor, not a fighter skill. */
export function createSaucer(context: FighterContext): SaucerControl {
      const { entity: owner, simulation, roster, config } = context;
      const settings = config.components.saucer;
      if (!settings) throw new Error("Alien Man requires saucer settings");
      const summon = roster.find(fighter => fighter.id === settings.summonConfigId);
      if (!summon) throw new Error(`Missing summon configuration: ${settings.summonConfigId}`);
      const { minX, maxX, minY } = simulation.arena;
      const left = Math.min(maxX, minX + settings.width / 2);
      const right = Math.max(left, maxX - settings.width / 2);
      const fromLeft = simulation.rng.next() < 0.5;
      const body = Bodies.rectangle(fromLeft ? left : right, minY - settings.altitude - settings.height / 2,
            settings.width, settings.height, { isStatic: true, isSensor: true, collisionFilter: { mask: 0 } });
      const signal: { deploymentAtMs: number | null } = { deploymentAtMs: null };
      spawnActor(context, {
            body, containWithinArena: false,
            lifetime: { matchEnd: "persist" },
            config: {
                  id: "saucer", radius: settings.width / 2,
                  hitbox: { type: "box", width: settings.width, height: settings.height },
                  speed: settings.speed, maxHealth: 1, image: settings.image, imageCrop: settings.imageCrop
            },
      }, actor => saucerBehavior(actor, {
            settings, signal, sourceId: owner.runtimeId, initialDirection: fromLeft ? 1 : -1,
            spawnAlly: () => {
                  const speed = summon.speed * simulation.globalSpeedMultiplier;
                  createFighter(simulation, summon, {
                        runtimeId: simulation.nextRuntimeId(`${owner.runtimeId}:alien`),
                        teamId: owner.teamId, ownerId: owner.runtimeId, roster,
                        collisionGroup: owner.body.collisionFilter.group,
                        position: { x: actor.entity.body.position.x, y: simulation.arena.minY + summon.radius + 1 },
                        velocity: { x: simulation.rng.next() < .5 ? -speed : speed, y: speed * .6 },
                  }, alien);
            },
      }));
      return { deploy: () => { signal.deploymentAtMs ??= simulation.nowMs; } };
}
