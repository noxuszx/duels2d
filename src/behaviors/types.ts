import type { Vector2 } from "../types/fighter";
import type { Fighter } from "../entities/fighter";
import type * as Matter from "matter-js";
import type { Projectile } from "../entities/projectile";
import type { ArenaBounds, ArenaWall } from "../skills/types";
import type { CombatResult } from "../combat/combat-result";
import type { AbilityConfig } from "../abilities/types";
import type { LaserShot } from "../gameplay/instant-laser";
import type { SpawnedEntity } from "../gameplay/spawned-entity";

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
      spawnSummon?(owner: Fighter, configId: string, position: Vector2): Fighter | null;
      removeOwnedSummons?(owner: Fighter): void;
      addEntity?(entity: SpawnedEntity): void;
      getArenaBounds?(): ArenaBounds;
      fireLaser?(source: Fighter, shot: LaserShot): void;
      executeTargetActions(
            source: Fighter,
            target: Fighter,
            ability: AbilityConfig,
      ): CombatResult;
      bounds?: ArenaBounds;
}
