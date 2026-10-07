import type { Entity } from "../../../engine/entity";
import { ProjectileFlight } from "../../../gameplay/components/combat/projectile/flight";
import type { ProjectileEventHandlers } from "../../../gameplay/components/combat/projectile/events";

/** Observe the flight lifecycle directly; no extra component or contact dispatcher. */
export function onProjectileEvents(projectile: Entity, handlers: ProjectileEventHandlers): () => void {
      if (projectile.isRemoved) throw new Error("Cannot observe a removed projectile");
      const flight = projectile.components.get("flight");
      if (!(flight instanceof ProjectileFlight)) throw new Error("Projectile events require ProjectileFlight");
      return flight.subscribe(handlers);
}
