import { Bodies } from "matter-js";
import { Entity } from "../../../engine/entity";
import { installBehavior } from "../../../gameplay/behavior";
import type { FighterContext } from "../../../gameplay/fighter-factory";
import { saucerBehavior, saucerSweep } from "./behavior";

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
      const entity = new Entity({
            runtimeId: simulation.nextRuntimeId(`${owner.runtimeId}:saucer`), configId: "saucer",
            ownerId: owner.runtimeId, teamId: owner.teamId, body, tags: [], containWithinArena: false,
            config: {
                  id: "saucer", radius: settings.width / 2,
                  hitbox: { type: "box", width: settings.width, height: settings.height },
                  speed: settings.speed, maxHealth: 1, image: settings.image, imageCrop: settings.imageCrop
            },
      });
      const actor = { entity, simulation, get config() { return entity.config; } };
      const signal = { deploying: false };
      try {
            entity.components.use("sweep", saucerSweep(actor, settings, fromLeft ? 1 : -1));
            installBehavior(actor, saucerBehavior(actor, settings, signal, summon, roster, owner), {},
                  () => ({ cooldownMs: 0 }));
            simulation.add(entity);
      } catch (error) { entity.remove(); throw error; }
      return { deploy: () => { signal.deploying = true; } };
}
