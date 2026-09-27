import type { Fighter } from "../entities/fighter";
import type * as Matter from "matter-js";
import type { Projectile } from "../entities/projectile";
import type { ArenaBounds, ArenaWall } from "../skills/types";

export type { ArenaBounds, ArenaWall };

export interface FighterBehaviorContext {
      characters: readonly Fighter[];
      world: Matter.World;
      addProjectile(projectile: Projectile): void;
      now(): number;
      getNearestEnemy(source: Fighter): Fighter | null;
      dealDamage(source: Fighter, target: Fighter, amount: number): boolean;
      applyKnockback(
            source: Fighter,
            target: Fighter,
            forceMagnitude: number,
      ): void;
      bounds?: ArenaBounds;
}
