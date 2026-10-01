import type { Fighter } from "../entities/fighter";
import type { AbilityTrigger, AttackHitboxAction } from "./types";
import { attackHitboxOverlaps } from "./actions/attack-hitbox-action";

type Rectangle = { x: number; y: number; width: number; height: number };

function fighterBox(fighter: Fighter, padding = 0): Rectangle {
      return {
            x: fighter.body.position.x - fighter.hitbox.halfWidth - padding,
            y: fighter.body.position.y - fighter.hitbox.halfHeight - padding,
            width: fighter.hitbox.halfWidth * 2 + padding * 2,
            height: fighter.hitbox.halfHeight * 2 + padding * 2,
      };
}

function overlaps(first: Rectangle, second: Rectangle): boolean {
      return (
            first.x < second.x + second.width &&
            first.x + first.width > second.x &&
            first.y < second.y + second.height &&
            first.y + first.height > second.y
      );
}

export function nearestEnemy(
      fighter: Fighter,
      fighters: readonly Fighter[],
): Fighter | null {
      let nearest: Fighter | null = null;
      let nearestDistance = Infinity;
      for (const enemy of fighters) {
            if (enemy === fighter || enemy.isDead) continue;
            const dx = enemy.body.position.x - fighter.body.position.x;
            const dy = enemy.body.position.y - fighter.body.position.y;
            const distance = dx * dx + dy * dy;
            if (distance < nearestDistance) {
                  nearestDistance = distance;
                  nearest = enemy;
            }
      }
      return nearest;
}

export function enemyInRange(
      fighter: Fighter,
      fighters: readonly Fighter[],
      rangePadding: number,
): Fighter | null {
      const range = fighterBox(fighter, rangePadding);
      return (
            fighters.find(
                  (enemy) =>
                        enemy !== fighter &&
                        !enemy.isDead &&
                        overlaps(range, fighterBox(enemy)),
            ) ?? null
      );
}

export function selectTarget(
      fighter: Fighter,
      fighters: readonly Fighter[],
      trigger: AbilityTrigger,
      attackHitbox?: AttackHitboxAction,
): Fighter | null {
      // Range-triggered melee abilities use the same geometry for starting and hitting.
      if (trigger.type === "enemy-in-range" && attackHitbox) {
            return fighters.find((enemy) =>
                  enemy !== fighter && !enemy.isDead &&
                  attackHitboxOverlaps(fighter, enemy, attackHitbox),
            ) ?? null;
      }
      return trigger.type === "enemy-in-range"
            ? enemyInRange(fighter, fighters, trigger.rangePadding)
            : nearestEnemy(fighter, fighters);
}
