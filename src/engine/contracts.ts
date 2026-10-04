import type { Entity } from "./entity";

export interface Vector2 { x: number; y: number; }
export type ArenaWall = "left" | "right" | "top" | "bottom";
export interface ArenaBounds { minX: number; maxX: number; minY: number; maxY: number; }

/** Captured before contact dispatch; handlers may narrow this policy synchronously. */
export interface ContactPolicy {
      defaultBounce: boolean;
      allowImpactDamage: boolean;
}

interface ContactBase {
      self: Entity;
      /** Separation normal applied to self: away from the other body or wall. */
      normal: Vector2;
      incomingSpeed: number;
      policy: ContactPolicy;
      /** Snapshot before foreground operation contact handling. */
      hadForegroundTask: boolean;
}

export type ContactEvent =
      | (ContactBase & { kind: "entity"; other: Entity })
      | (ContactBase & { kind: "wall"; wall: ArenaWall });

export type CancellationReason =
      | "interrupted" | "death" | "removed" | "reset" | "match-ended";

export interface RuntimeTrace {
      kind: "admitted" | "rejected" | "operation-started" | "operation-completed" |
            "completed" | "cancelled";
      entityId: string;
      moveId: string;
      reason?: string;
}
