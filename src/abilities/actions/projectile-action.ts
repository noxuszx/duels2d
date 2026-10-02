import * as Matter from "matter-js";
import type { Fighter } from "../../entities/fighter";
import type { Projectile } from "../../entities/projectile";
import type { AbilityConfig, SpawnProjectileAction } from "../types";
import type { ActionExecutionContext } from "./types";
import { launchProjectile } from "../../gameplay/launch-projectile";

/** Legacy action adapter to the shared projectile launch geometry. */
export function executeProjectileAction(
      action: SpawnProjectileAction,
      source: Fighter,
      target: Fighter,
      ability: AbilityConfig,
      context: ActionExecutionContext,
): Projectile {
      return launchProjectile(source, target, action.projectile, {
            addProjectile: projectile => {
                  context.projectiles.push(projectile);
                  Matter.World.add(context.world, projectile.body);
            },
      }, ability.audio?.hit ?? null);
}
