import type { Fighter } from "../entities/fighter";
import type * as Matter from "matter-js";
import type { Projectile } from "../entities/projectile";
import type { ArenaBounds, ArenaWall } from "../skills/types";
import type { CombatResult } from "../combat/combat-result";
import type { AbilityConfig } from "../abilities/types";

export type { ArenaBounds, ArenaWall };

export interface WallCollisionResponse {
      defaultBounce: boolean;
      allowImpactDamage: boolean;
}

export const DEFAULT_WALL_COLLISION_RESPONSE: WallCollisionResponse = {
      defaultBounce: true,
      allowImpactDamage: true,
};

export interface FighterBehaviorContext {
      characters: readonly Fighter[];
      world: Matter.World;
      addProjectile(projectile: Projectile): void;
      now(): number;
      /** Optional only for older structural adapters; live game contexts always provide it. */
      isCombatActive?(): boolean;
      getNearestEnemy(source: Fighter): Fighter | null;
      executeTargetActions(
            source: Fighter,
            target: Fighter,
            ability: AbilityConfig,
      ): CombatResult;
      bounds?: ArenaBounds;
}
