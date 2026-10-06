import { FloatingMovement, KnockbackReaction } from "./components";
import { Bodies, Body } from "matter-js";
import type { Entity } from "../engine/entity";
import { createEntity } from "../engine/entity-factory";
import type { EntityComponent, ComponentContext } from "../engine/component";
import type { Simulation } from "../engine/simulation";
import type { FighterConfig, Vector2 } from "../types/fighter";
import { assertComponentData } from "../config/validation";
import { installBehavior, type BehaviorHandlers, type BehaviorTasks } from "./behavior";

export type { BehaviorAction, BehaviorContact, BehaviorHandlers } from "./behavior";

export type FighterContext = ComponentContext<FighterConfig> & { readonly roster: readonly FighterConfig[] };
export type ComponentFactory<T extends EntityComponent> = (context: FighterContext) => T;
type BehaviorFactory = (components: any, context: FighterContext) => BehaviorHandlers;
type Handles<B extends BehaviorFactory> = Parameters<B>[0];

interface DefinitionSpec<B extends BehaviorFactory> {
      id: string;
      components: { [K in keyof Handles<B>]: ComponentFactory<Handles<B>[K] & EntityComponent> };
      behavior: B;
      tasks: BehaviorTasks;
}
export interface FighterBlueprint {
      id: string;
      install(context: FighterContext): void;
}

/** Typed assembly binds components once. Scripts receive handles, never the runtime. */
export function defineFighter<const B extends BehaviorFactory>(
      spec: DefinitionSpec<B>,
): FighterBlueprint {
      return {
            id: spec.id,
            install(context) {
                  const { entity } = context;
                  const handles = {} as Handles<B>;
                  for (const name of Object.keys(spec.components) as Array<keyof Handles<B>>)
                        handles[name] = entity.components.use(String(name), spec.components[name](context)) as Handles<B>[typeof name];
                  const handlers = spec.behavior(handles, context);
                  installBehavior(context, handlers, spec.tasks,
                        id => entity.config.moves[id],
                        { hasConfiguredMove: id => !!entity.config.moves[id] ||
                              Object.values(entity.config.forms).some(form => !!form.moves[id]) });
            },
      };
}

export interface SpawnFighterOptions {
      runtimeId: string;
      teamId: string;
      ownerId?: string | null;
      position: Vector2;
      velocity: Vector2;
      collisionGroup?: number;
      roster?: readonly FighterConfig[];
}

/** Common floating-box preset. A blueprint equips only that fighter's extra capabilities. */
export function createFighter(simulation: Simulation, config: FighterConfig, options: SpawnFighterOptions, blueprint?: FighterBlueprint,): Entity<FighterConfig> {

      assertComponentData(config.components, config.moves);
      const bodyOptions = {
            restitution: 0.82, friction: 0, frictionAir: 0.018, frictionStatic: 0,
            collisionFilter: { group: options.collisionGroup ?? 0, category: 1, mask: 0xffff },
      };

      const body = config.hitbox.type === "box"
            ? Bodies.rectangle(options.position.x + config.hitboxOffset.x, options.position.y + config.hitboxOffset.y,
                  config.hitbox.width, config.hitbox.height, bodyOptions)
            : Bodies.circle(options.position.x + config.hitboxOffset.x, options.position.y + config.hitboxOffset.y,
                  config.hitbox.radius, bodyOptions);

      Body.setVelocity(body, options.velocity);
      return createEntity(simulation, {
            runtimeId: options.runtimeId, configId: config.id,
            teamId: options.teamId, ownerId: options.ownerId, body, config
      }, { install(actor) {
            const context: FighterContext = {
                  entity: actor.entity,
                  simulation: actor.simulation,
                  get config() { return actor.entity.config; },
                  roster: options.roster ?? [config],
            };
            actor.entity.components.use("knockback-reaction", new KnockbackReaction(context));
            actor.entity.components.use("movement", new FloatingMovement(context,
                  Math.hypot(options.velocity.x, options.velocity.y) || config.speed));
            blueprint?.install(context);
      } });
}
