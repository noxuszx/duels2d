import { Entity, type EntityOptions } from "./entity";
import type { ComponentContext } from "./component";
import type { EntityRegistration } from "./entity-registry";
import type { Simulation } from "./simulation";
import type { EntityConfig } from "../types/entity";

export interface EntityAssembly<C extends EntityConfig> {
      lifetime?: EntityRegistration;
      install?(context: ComponentContext<C>): void;
}

/** One assembly path: install before registration, and retire failed installations. */
export function createEntity<C extends EntityConfig>(simulation: Simulation,
      options: EntityOptions<C>, assembly: EntityAssembly<C> = {}): Entity<C> {
      if (simulation.entities.hasRuntimeId(options.runtimeId))
            throw new Error(`Duplicate entity: ${options.runtimeId}`);
      const entity = new Entity(options);
      const context: ComponentContext<C> = {
            entity, simulation, get config() { return entity.config; },
      };
      try {
            assembly.install?.(context);
            simulation.add(entity, assembly.lifetime);
      } catch (error) {
            try {
                  if (!simulation.remove(entity.runtimeId)) entity.remove();
            } catch { /* Preserve the assembly error after attempting all entity cleanup. */ }
            throw error;
      }
      return entity;
}
