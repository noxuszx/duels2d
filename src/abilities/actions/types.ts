import type * as Matter from "matter-js";
import type { Fighter } from "../../entities/fighter";
import type { Projectile } from "../../entities/projectile";
import type { IndicatorSystem } from "../../systems/indicator-system";

export interface ActionExecutionContext {
      world: Matter.World;
      projectiles: Projectile[];
      indicators: IndicatorSystem;
      COLLISION_COOLDOWN: number;
      now(): number;
      isGameOver?(): boolean;
}
