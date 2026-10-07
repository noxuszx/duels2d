import type { ArenaWall, Vector2 } from "../../../../engine/contracts";
import type { Entity, EntityRemovalReason } from "../../../../engine/entity";
import type { HitResult } from "../../../combat/effects";

export interface ProjectileEvent {
      readonly projectile: Entity;
      /** Body center captured at dispatch, not a surface contact point. */
      readonly position: Readonly<Vector2>;
      readonly nowMs: number;
}

export interface ProjectileImpactEvent extends ProjectileEvent {
      readonly other: Entity;
      readonly result: Readonly<HitResult>;
}

export interface ProjectileWallEvent extends ProjectileEvent {
      readonly wall: ArenaWall;
}

export interface ProjectileEndEvent extends ProjectileEvent {
      readonly reason: EntityRemovalReason;
}

export interface ProjectileEventHandlers {
      onImpact?(event: ProjectileImpactEvent): void;
      onWall?(event: ProjectileWallEvent): void;
      onEnd?(event: ProjectileEndEvent): void;
}

export interface ProjectileEventMap {
      impact: ProjectileImpactEvent;
      wall: ProjectileWallEvent;
      end: ProjectileEndEvent;
}
