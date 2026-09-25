import * as Matter from "matter-js";
import type { Fighter } from "../../entities/fighter";
import type { Facing } from "../../types/fighter";
import type { WallCrawlAction } from "../types";

export type ArenaWall = "left" | "right" | "top" | "bottom";

export interface ArenaBounds {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
}

export interface WallCrawlState {
      wall: ArenaWall;
      direction: -1 | 1;
}

/** Returns the rotation angle (in radians) to align a crawler sprite with the contacted arena wall. */
export function getWallCrawlAngle(wall: ArenaWall): number {
      switch (wall) {
            case "bottom":
                  return 0;
            case "top":
                  return Math.PI;
            case "left":
                  return Math.PI / 2;
            case "right":
                  return -Math.PI / 2;
      }
}

/** Determines whether the crawler should face left or right so the head points in the direction of movement. */
export function getWallCrawlFacing(
      wall: ArenaWall,
      direction: -1 | 1,
      defaultFacing: Facing = "right",
): Facing {
      // Hands/feet point down (+Y) and head points right (+X) in the default unrotated sprite.
      // Applying getWallCrawlAngle aligns hands/feet with the wall surface.
      // To orient the head forward in the movement direction along that wall:
      // For bottom and left: direction > 0 requires unflipped (+X), direction < 0 requires flipped (-X).
      // For top and right: direction > 0 requires flipped (-X), direction < 0 requires unflipped (+X).
      const shouldBeFlipped =
            wall === "bottom" || wall === "left"
                  ? direction < 0
                  : direction > 0;

      if (defaultFacing === "right") {
            return shouldBeFlipped ? "left" : "right";
      } else {
            return shouldBeFlipped ? "right" : "left";
      }
}

export function startWallCrawl(
      fighter: Fighter,
      target: Fighter,
      wall: ArenaWall,
): WallCrawlState {
      const vertical = wall === "left" || wall === "right";
      const difference = vertical
            ? target.body.position.y - fighter.body.position.y
            : target.body.position.x - fighter.body.position.x;
      const previousVelocity = vertical
            ? fighter.body.velocity.y
            : fighter.body.velocity.x;
      return {
            wall,
            direction: (Math.sign(difference || previousVelocity || 1) || 1) as -1 | 1,
      };
}

/** Keeps the body on its chosen wall and moves it along that wall. */
export function executeWallCrawlAction(
      action: WallCrawlAction,
      fighter: Fighter,
      state: WallCrawlState,
      bounds: ArenaBounds,
): void {
      const { wall } = state;
      const vertical = wall === "left" || wall === "right";
      const position = fighter.body.position;
      const coordinate = vertical ? position.y : position.x;
      const minimum = vertical ? bounds.minY : bounds.minX;
      const maximum = vertical ? bounds.maxY : bounds.maxX;
      if (coordinate <= minimum && state.direction < 0)
            state.direction = 1;
      else if (coordinate >= maximum && state.direction > 0)
            state.direction = -1;

      Matter.Body.setPosition(fighter.body, {
            x: vertical
                  ? wall === "left" ? bounds.minX : bounds.maxX
                  : Math.max(minimum, Math.min(maximum, position.x)),
            y: vertical
                  ? Math.max(minimum, Math.min(maximum, position.y))
                  : wall === "top" ? bounds.minY : bounds.maxY,
      });
      const speed = fighter.baseSpeed * action.speedMultiplier;
      Matter.Body.setVelocity(fighter.body, {
            x: vertical ? 0 : state.direction * speed,
            y: vertical ? state.direction * speed : 0,
      });
      Matter.Body.setAngularVelocity(fighter.body, 0);
      fighter.facing = getWallCrawlFacing(
            state.wall,
            state.direction,
            fighter.config.defaultFacing,
      );
}
