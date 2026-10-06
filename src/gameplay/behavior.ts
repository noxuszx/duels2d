import { BehaviorRuntime } from "../engine/behavior-runtime";
import type { ComponentContext } from "../engine/component";
import type { ArenaWall, ContactEvent, RuntimeTrace } from "../engine/contracts";
import type { Entity } from "../engine/entity";
import type { ScriptOperation } from "../engine/scripting";
import type { MoveConfig } from "../config/component-settings";
import type { EntityConfig } from "../types/entity";

export type BehaviorContact = { kind: "wall"; wall: ArenaWall } | { kind: "entity"; other: Entity };

export interface BehaviorAction {
      when(): boolean;
      run(): Generator<ScriptOperation, void, unknown>;
      /** A ready high-priority action can replace the current foreground task. */
      interrupt?: boolean;
}

export interface BehaviorHandlers {
      /** Configured move IDs, checked in declaration order each simulation step. */
      actions?: Record<string, BehaviorAction>;
      onSpawn?: () => Generator<ScriptOperation, void, unknown>;
      onUpdate?: () => Generator<ScriptOperation, void, unknown>;
      onContact?: (event: BehaviorContact) => Generator<ScriptOperation, void, unknown>;
      onWallContact?: (event: { wall: ArenaWall }) => Generator<ScriptOperation, void, unknown>;
}

export type BehaviorTask = Exclude<keyof BehaviorHandlers, "actions">;
export type BehaviorTasks = Partial<Record<BehaviorTask, string>>;

/** Attach the shared generator scheduler and event hooks to any entity. */
export function installBehavior<C extends EntityConfig>(
      context: ComponentContext<C>,
      handlers: BehaviorHandlers,
      tasks: BehaviorTasks,
      getMove: (id: string) => MoveConfig | undefined,
      hasConfiguredMove: (id: string) => boolean = id => !!getMove(id),
): BehaviorRuntime {
      const { entity, simulation, config } = context;
      for (const name of Object.keys(handlers).filter(name => name !== "actions") as BehaviorTask[]) {
            const id = tasks[name];
            if (handlers[name] && (!id || !getMove(id)))
                  throw new Error(`${config.id}: ${name} requires a configured move`);
      }
      for (const id of Object.keys(handlers.actions ?? {})) {
            if (!hasConfiguredMove(id))
                  throw new Error(`${config.id}: action ${id} requires a configured move`);
      }
      const runtime = new BehaviorRuntime(entity, {
            now: () => simulation.nowMs,
            entities: () => simulation.entities.all(),
            isCombatActive: () => simulation.isCombatActive,
            trace: (event: RuntimeTrace) => simulation.recordTrace(event),
      });
      entity.setBehavior(runtime);
      const run = (name: BehaviorTask,
            script: () => Generator<ScriptOperation, void, unknown>) => {
            if (runtime.isRunning) return;
            const id = tasks[name]!;
            const move = getMove(id);
            if (move) runtime.start({ id, cooldownMs: move.cooldownMs }, null, script);
      };
      let awaitingSpawn = true;
      entity.components.use("behavior-events", {
            beforeStep() {
                  if (awaitingSpawn) {
                        awaitingSpawn = false;
                        if (handlers.onSpawn) run("onSpawn", handlers.onSpawn);
                  }
                  for (const [id, action] of Object.entries(handlers.actions ?? {})) {
                        const move = getMove(id);
                        if (!move || (runtime.isRunning && !action.interrupt)) continue;
                        if (runtime.currentMove?.id === id) continue;
                        const admission = { id, cooldownMs: move.cooldownMs };
                        if (runtime.readiness(admission, null, action.interrupt) || !action.when()) continue;
                        if (runtime.isRunning) runtime.cancel("interrupted");
                        if (runtime.start(admission, null, () => action.run()).started) break;
                  }
                  if (handlers.onUpdate) run("onUpdate", handlers.onUpdate);
            },
            contact(event: ContactEvent) {
                  if (event.hadForegroundTask) return;
                  if (event.kind === "wall" && handlers.onWallContact)
                        run("onWallContact", () => handlers.onWallContact!({ wall: event.wall }));
                  else if (handlers.onContact)
                        run("onContact", () => handlers.onContact!(event.kind === "wall"
                              ? { kind: "wall", wall: event.wall }
                              : { kind: "entity", other: event.other }));
            },
      });
      return runtime;
}
