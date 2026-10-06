import type { ComponentContext } from "../engine/component";
import type { Entity, EntityOptions } from "../engine/entity";
import { createEntity } from "../engine/entity-factory";
import type { EntityRegistration } from "../engine/entity-registry";
import type { TaskGenerator } from "../engine/behavior-runtime";
import type { EntityConfig } from "../types/entity";
import { installBehavior } from "./behavior";

export interface SpawnActorOptions<C extends EntityConfig> extends
      Omit<EntityOptions<C>, "runtimeId" | "configId" | "teamId" | "ownerId"> {
      teamId?: string;
      ownerId?: string | null;
      lifetime?: EntityRegistration;
      removeOnComplete?: boolean;
      install?(context: ComponentContext<C>): void;
}

/** An owned entity with one independently scheduled lifecycle generator. */
export function spawnActor<C extends EntityConfig>(owner: ComponentContext,
      options: SpawnActorOptions<C>, script: (actor: ComponentContext<C>) => TaskGenerator): Entity<C> {
      const { simulation } = owner;
      const { lifetime, removeOnComplete = true, install, ...entityOptions } = options;
      return createEntity(simulation, {
            ...entityOptions,
            runtimeId: simulation.nextRuntimeId(`${owner.entity.runtimeId}:${options.config.id}`),
            configId: options.config.id,
            teamId: options.teamId ?? owner.entity.teamId,
            ownerId: options.ownerId === undefined ? owner.entity.runtimeId : options.ownerId,
            tags: options.tags ?? [],
      }, {
            lifetime: {
                  ownerDeath: lifetime?.ownerDeath ?? "remove",
                  ownerRemoval: lifetime?.ownerRemoval ?? "remove",
                  matchEnd: lifetime?.matchEnd ?? "remove",
            },
            install(actor) {
                  install?.(actor);
                  installBehavior(actor, {
                        *onSpawn() {
                              yield* script(actor);
                              if (removeOnComplete) simulation.remove(actor.entity.runtimeId);
                        },
                  }, { onSpawn: "lifecycle" }, () => ({ cooldownMs: 0 }),
                  { onTaskError: () => { simulation.remove(actor.entity.runtimeId); } });
            },
      });
}
