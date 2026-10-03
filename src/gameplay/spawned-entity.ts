import type { Fighter } from "../entities/fighter";
import type { ArenaBounds } from "../skills/types";

export interface ViewportBounds { left: number; right: number; top: number; bottom: number; }
export interface SpawnedEntityContext {
      readonly characters: readonly Fighter[];
      readonly arena: ArenaBounds;
      readonly viewport: ViewportBounds;
      now(): number;
      damage(source: Fighter, target: Fighter, amount: number): void;
}
export type EntityRemovalReason = "owner-death" | "owner-removed" | "match-ended" | "reset" | "removed";

/** Non-roster entities own mechanics; the registry owns ticking and lifetime. */
export interface SpawnedEntity {
      readonly owner: Fighter;
      readonly removed: boolean;
      update(deltaMs: number, context: SpawnedEntityContext): void;
      remove(reason: EntityRemovalReason): void;
      draw(ctx: CanvasRenderingContext2D, arena: ArenaBounds): void;
}
