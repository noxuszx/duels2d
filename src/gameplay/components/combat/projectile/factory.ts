import { Bodies, Body } from "matter-js";
import type { ProjectileSettings } from "../../../../config/component-settings";
import type { Vector2 } from "../../../../engine/contracts";
import { Entity } from "../../../../engine/entity";
import type { EntityConfig } from "../../../../types/entity";
import type { ComponentContext } from "../../../../engine/component";
import { ProjectileFlight } from "./flight";

export interface ProjectileTrajectory {
      position: Vector2;
      direction: Vector2;
}

/** Constructs a projectile, equips its flight component, and registers its lifetime policies. */
export function createProjectile( context: ComponentContext, shot: ProjectileSettings, trajectory: ProjectileTrajectory, hitSound?: string,): Entity {
      const { entity: owner, simulation } = context;
      const { position, direction } = trajectory;

      const body = Bodies.circle(position.x, position.y, shot.radius, {
            isSensor: shot.flight.collision.response === "sensor",
            friction: 0,
            frictionAir: 0,
            restitution: 1,
      });

      Body.setInertia(body, Infinity);
      Body.setVelocity(body, { x: direction.x * shot.speed, y: direction.y * shot.speed });

      const image = Array.isArray(shot.image)
            ? shot.image[Math.floor(simulation.rng.next() * shot.image.length)]
            : shot.image;

      const config: EntityConfig = {
            id: `${owner.configId}:projectile`,
            radius: shot.radius,
            hitbox: { type: "circle", radius: shot.radius },
            hitboxOffset: { x: 0, y: 0 },
            speed: shot.speed,
            maxHealth: 1,
            defaultFacing: owner.facing,
            image: image ?? null,
            imageScale: image ? shot.imageScales?.[image] ?? 1 : 1,
      };

      const runtimeId = simulation.nextRuntimeId(`${owner.runtimeId}:projectile`);
      const projectile = new Entity({
            runtimeId,
            configId: config.id,
            teamId: owner.teamId,
            ownerId: owner.runtimeId,
            tags: [],
            body,
            config,
            containWithinArena: shot.flight.collision.walls === "bounce",
      });

      projectile.components.use(
            "flight",
            new ProjectileFlight(context, projectile, shot, hitSound, owner.runtimeId),
      );

      simulation.add(projectile, {
            ownerDeath: shot.flight.ownership.onOwnerDeath,
            ownerRemoval: shot.flight.ownership.onOwnerRemoval,
            matchEnd: shot.flight.ownership.onMatchEnd,
      });

      return projectile;
}
