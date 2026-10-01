import type { Fighter } from "../entities/fighter";
import type { CancellationReason } from "../gameplay/action-scope";
import type { ArenaBounds, ArenaWall } from "../abilities/actions/wall-crawl-action";

export type { ArenaBounds, ArenaWall };

export interface DashSkillOptions {
      speedMultiplier: number;
      accelerationForce: number;
      stopOn?: Array<"fighter-collision" | "wall-collision" | "timeout">;
      maxDurationMs?: number;
      onHitEnemy?: (target: Fighter) => void;
      onHitWall?: (wall: ArenaWall) => void;
      onComplete?: (reason: "fighter-collision" | "wall-collision" | "timeout") => void;
      onEnd?: (result: DashEndResult) => void;
}

export type DashEndResult =
      | { reason: "fighter-collision" | "wall-collision" | "timeout" }
      | { reason: "cancelled"; cancellation: CancellationReason };

export interface WallCrawlSkillOptions {
      durationMs: number;
      speedMultiplier: number;
      onTick?: (elapsedMs: number, progress: number) => void;
      onComplete?: () => void;
}
