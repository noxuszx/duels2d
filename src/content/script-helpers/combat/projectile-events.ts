import type { Entity } from "../../../engine/entity";
import { ProjectileFlight } from "../../../gameplay/components/combat/projectile/flight";
import type { ProjectileEventHandlers } from "../../../gameplay/components/combat/projectile/events";
import type { ScriptScope } from "../../../engine/scripting/scope";

/** Observe the flight lifecycle directly; no extra component or contact dispatcher. */
export function onProjectileEvents(projectile: Entity, handlers: ProjectileEventHandlers, scope?: ScriptScope): () => void {
      if (projectile.isRemoved) throw new Error("Cannot observe a removed projectile");
      const flight = projectile.components.get("flight");
      if (!(flight instanceof ProjectileFlight)) throw new Error("Projectile events require ProjectileFlight");
      const releases: Array<() => void> = [];
      if (handlers.onImpact) releases.push(flight.events.on("impact", handlers.onImpact, scope));
      if (handlers.onWall) releases.push(flight.events.on("wall", handlers.onWall, scope));
      if (handlers.onEnd) releases.push(flight.events.on("end", handlers.onEnd, scope));
      return () => { for (const release of releases) release(); };
}
