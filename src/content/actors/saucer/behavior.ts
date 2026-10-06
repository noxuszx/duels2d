import type { ComponentContext } from "../../../engine/component";
import type { RectangleShape } from "../../../engine/spatial/shapes";
import { SIMULATION_STEP_MS } from "../../../engine/simulation";
import { all, race, scoped, sequence, wait, type ScriptOperation } from "../../../engine/scripting";
import type { TaskGenerator } from "../../../engine/behavior-runtime";
import type { SaucerSettings } from "../../../config/component-settings";
import { hitEnemies, moveTo, until } from "../../script-helpers";

/** The sweep's direction and reversal points are decisions owned by this actor. */
function* patrol({ entity, simulation }: ComponentContext,
      settings: SaucerSettings, direction: number): Generator<ScriptOperation, void, unknown> {
      const left = Math.min(simulation.arena.maxX, simulation.arena.minX + settings.width / 2);
      const right = Math.max(left, simulation.arena.maxX - settings.width / 2);
      while (true) {
            // Oversized actors and stationary tuning must still advance the script clock.
            if (right === left || settings.speed <= 0) { yield wait(SIMULATION_STEP_MS); continue; }
            const x = direction > 0 ? right : left;
            const distance = Math.abs(x - entity.body.position.x);
            yield moveTo(entity, { x, y: entity.body.position.y }, distance / settings.speed * 1000);
            direction *= -1;
      }
}

interface SaucerScriptOptions {
      settings: SaucerSettings;
      signal: { deploymentAtMs: number | null };
      spawnAlly(): void;
      sourceId: string;
      initialDirection: number;
}

export function* saucerBehavior(context: ComponentContext,
      { settings, signal, spawnAlly, sourceId, initialDirection }: SaucerScriptOptions): TaskGenerator {
      const { entity, simulation } = context;
      const beam = (): RectangleShape => {
            const top = entity.body.position.y + settings.height / 2;
            const bottom = simulation.arena.maxY;
            return { type: "rectangle", center: { x: entity.body.position.x, y: (top + bottom) / 2 },
                  width: settings.beamWidth, height: bottom - top };
      };
      function* beams(): Generator<ScriptOperation, void, unknown> {
            while (signal.deploymentAtMs === null) {
                  yield* scoped(() => entity.presentation.acquireShape(beam, settings.beamColor, .25), function* () {
                        for (let elapsed = 0; elapsed < settings.beamDurationMs;) {
                              hitEnemies(context, beam(),
                                    { damage: settings.beamDamage },
                                    { independentCooldown: true, sourceId });
                              const duration = Math.min(settings.beamDamageIntervalMs, settings.beamDurationMs - elapsed);
                              yield wait(duration);
                              elapsed += duration;
                        }
                  });
                  yield wait(Math.max(0, settings.beamIntervalMs - settings.beamDurationMs));
            }
      }
      function* lifecycle(): Generator<ScriptOperation, void, unknown> {
            yield race(until(() => signal.deploymentAtMs !== null), sequence(beams));
            const deploymentAtMs = signal.deploymentAtMs!;
            for (let count = 0; count < settings.maxSpawns; count++) {
                  const dueAtMs = deploymentAtMs + settings.firstSpawnDelayMs + count * settings.spawnIntervalMs;
                  yield until(() => simulation.nowMs + 1e-9 >= dueAtMs);
                  spawnAlly();
            }
      }
      yield all(sequence(() => patrol(context, settings, initialDirection)),
            sequence(lifecycle));
}
