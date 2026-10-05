import { Body } from "matter-js";
import type { ArenaBounds, ArenaWall, ContactPolicy, Vector2 } from "../contracts";
import type { Entity } from "../entity";

export interface WallContactSnapshot {
      readonly kind: "wall";
      readonly id: string;
      readonly wall: ArenaWall;
      /** Unit normal into the arena, applied to the entity. */
      readonly normal: Readonly<Vector2>;
      readonly incomingSpeed: number;
      readonly velocity: Readonly<Vector2>;
      readonly policy: Readonly<ContactPolicy>;
      readonly hadForegroundTask: boolean;
}

/** Uses authored hitbox dimensions as the center limit, preserving existing box tuning. */
function halfExtents(entity: Entity): { x: number; y: number } {
      const hitbox = entity.config.hitbox;
      if (hitbox.type === "box") return {
            x: (hitbox.width ?? entity.config.radius * 1.4) / 2,
            y: (hitbox.height ?? entity.config.radius * 2.6) / 2,
      };
      const radius = hitbox.radius ?? entity.config.radius;
      return { x: radius, y: radius };
}

function snapshot(entity: Entity, wall: ArenaWall, normal: Vector2, incomingSpeed: number,
      velocity: Vector2): WallContactSnapshot {
      const policy = entity.resources.contactPolicy;
      return Object.freeze({
            kind: "wall", id: entity.runtimeId, wall,
            normal: Object.freeze(normal), incomingSpeed,
            velocity: Object.freeze(velocity),
            policy: Object.freeze({ ...policy }),
            hadForegroundTask: entity.behavior?.isRunning ?? false
      });
}

/** Corrects penetration after Matter integration and captures contacts for later gameplay dispatch. */
export function containEntity(entity: Entity, arena: ArenaBounds): readonly WallContactSnapshot[] {
      const { x: halfWidth, y: halfHeight } = halfExtents(entity);
      const minX = arena.minX + halfWidth, maxX = arena.maxX - halfWidth;
      const minY = arena.minY + halfHeight, maxY = arena.maxY - halfHeight;
      if (minX > maxX || minY > maxY) throw new RangeError("Entity hitbox exceeds arena bounds");
      const { position, velocity } = entity.body;
      const previousVelocity = { x: velocity.x, y: velocity.y };
      const contacts: WallContactSnapshot[] = [];
      let x = position.x, y = position.y;
      if (x < minX) {
            x = minX;
            contacts.push(snapshot(entity, "left", { x: 1, y: 0 }, Math.abs(velocity.x), previousVelocity));
      } else if (x > maxX) {
            x = maxX;
            contacts.push(snapshot(entity, "right", { x: -1, y: 0 }, Math.abs(velocity.x), previousVelocity));
      }
      if (y < minY) {
            y = minY;
            contacts.push(snapshot(entity, "top", { x: 0, y: 1 }, Math.abs(velocity.y), previousVelocity));
      } else if (y > maxY) {
            y = maxY;
            contacts.push(snapshot(entity, "bottom", { x: 0, y: -1 }, Math.abs(velocity.y), previousVelocity));
      }
      if (contacts.length) Body.setPosition(entity.body, { x, y });
      return contacts;
}

/** Baseline arena response. A component may have narrowed contact policy first. */
export function bounceFromWall(entity: Entity, contact: WallContactSnapshot): void {
      // A corner can produce two contacts; keep the first axis response when
      // resolving the second instead of restoring the captured outward velocity.
      const velocity = { ...entity.body.velocity };
      if (contact.normal.x) velocity.x = Math.abs(velocity.x) * contact.normal.x;
      if (contact.normal.y) velocity.y = Math.abs(velocity.y) * contact.normal.y;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > 0) {
            const minimumNormal = speed * Math.sin(25 * Math.PI / 180);
            if (contact.normal.x && Math.abs(velocity.x) < minimumNormal) {
                  velocity.x = contact.normal.x * minimumNormal;
                  velocity.y = (Math.sign(velocity.y) || 1) * Math.sqrt(speed ** 2 - minimumNormal ** 2);
            } else if (contact.normal.y && Math.abs(velocity.y) < minimumNormal) {
                  velocity.y = contact.normal.y * minimumNormal;
                  velocity.x = (Math.sign(velocity.x) || 1) * Math.sqrt(speed ** 2 - minimumNormal ** 2);
            }
      }
      Body.setVelocity(entity.body, velocity);
}
