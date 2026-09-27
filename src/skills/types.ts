import type * as Matter from "matter-js";
import type { Fighter } from "../entities/fighter";
import type { Projectile } from "../entities/projectile";
import type { ProjectileConfig, SwingAction } from "../abilities/types";
import type { ArenaBounds, ArenaWall } from "../abilities/actions/wall-crawl-action";

export type { ArenaBounds, ArenaWall };

export interface DashSkillOptions {
      speedMultiplier: number;
      accelerationForce: number;
      stopOn?: Array<"fighter-collision" | "wall-collision" | "timeout">;
      maxDurationMs?: number;
      onHitEnemy?: (target: Fighter) => void;
      onHitWall?: (wall: ArenaWall) => void;
      onComplete?: () => void;
}

export interface WallCrawlSkillOptions {
      durationMs: number;
      speedMultiplier: number;
      onTick?: (elapsedMs: number, progress: number) => void;
      onComplete?: () => void;
}

export interface ProjectileSkillOptions {
      config: ProjectileConfig;
      hitSoundCue: string | null;
      source: Fighter;
      target: Fighter;
      world: Matter.World;
      addProjectile(projectile: Projectile): void;
}

export interface SwingSkillOptions {
      action: SwingAction | null;
      activeFrames: number;
      onHitEnemy?: (target: Fighter) => void;
      onComplete?: () => void;
}
